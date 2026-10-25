import { randomBytes } from "node:crypto";
import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { prisma } from "@loop/db";
import type { CvDraft } from "@loop/contracts";
import { hashKey } from "../../common/rate-limit.js";
import type { Env } from "../../config/index.js";
import { CV_ENV } from "./storage.service.js";

/** Short-lived anonymous draft: the raw token is returned once; only its SHA-256 hash is stored. */
@Injectable()
export class DraftService {
  private readonly ttlMs: number;

  constructor(@Inject(CV_ENV) env: Env) {
    this.ttlMs = env.CV_ORPHAN_TTL_HOURS * 3_600_000;
  }

  async create(ip: string | undefined, now = new Date()): Promise<CvDraft> {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(now.getTime() + this.ttlMs);
    await prisma.uploadDraft.create({
      data: { tokenHash: hashKey(token), ipHash: ip ? hashKey(ip) : null, expiresAt },
    });
    return { draftToken: token, expiresAt: expiresAt.toISOString() };
  }

  /** Resolves an unexpired, not-yet-adopted draft or throws a generic 401. */
  async resolve(token: string | undefined, now = new Date()): Promise<{ id: string }> {
    if (!token) throw new UnauthorizedException("Sign in or start a draft first");
    const draft = await prisma.uploadDraft.findUnique({
      where: { tokenHash: hashKey(token) },
      select: { id: true, expiresAt: true, adoptedById: true },
    });
    if (!draft || draft.adoptedById || draft.expiresAt <= now) throw new UnauthorizedException("Sign in or start a draft first");
    return { id: draft.id };
  }

  /** Binds the draft's uploads, extraction runs, confirmed fields and eligibility declaration to the new contractor. Idempotent; unknown tokens are ignored. */
  async adopt(token: string, contractorId: string, now = new Date()): Promise<boolean> {
    const draft = await prisma.uploadDraft.findUnique({
      where: { tokenHash: hashKey(token) },
      select: { id: true, expiresAt: true, adoptedById: true },
    });
    if (!draft || draft.adoptedById || draft.expiresAt <= now) return false;
    return prisma.$transaction(async (tx) => {
      const claimed = await tx.uploadDraft.updateMany({
        where: { id: draft.id, adoptedById: null },
        data: { adoptedById: contractorId, adoptedAt: now },
      });
      if (claimed.count !== 1) return false;
      await tx.cvUpload.updateMany({ where: { draftId: draft.id }, data: { contractorId } });
      await tx.eligibilityDeclaration.updateMany({ where: { draftId: draft.id, contractorId: null }, data: { contractorId } });
      const uploads = await tx.cvUpload.findMany({ where: { draftId: draft.id }, select: { id: true } });
      await tx.extractionRun.updateMany({
        where: { cvUploadId: { in: uploads.map((u) => u.id) }, contractorId: null },
        data: { contractorId },
      });
      // Confirmations made before registering (A5) become the contractor's own.
      await tx.confirmedProfileField.updateMany({ where: { draftId: draft.id }, data: { contractorId, draftId: null } });
      return true;
    });
  }
}
