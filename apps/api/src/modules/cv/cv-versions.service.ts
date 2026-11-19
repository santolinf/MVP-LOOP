import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@loop/db";
import type { CvChangeList, CvVersionList, ResolveCvChangeRequest } from "@loop/contracts";
import { AuditService } from "../../common/audit.service.js";
import { purgeCvData, recordCvVersion } from "./cv-changes.js";
import { StorageService } from "./storage.service.js";

/**
 * Phase 7 CV history and review. Accepting a change is the only way a newer CV alters confirmed data (A5);
 * rejecting keeps what the contractor already confirmed.
 * TODO(spec): the retention period for old CV versions is not defined, so every version is kept until the
 * contractor deletes their CV or account.
 */
@Injectable()
export class CvVersionsService {
  // Explicit @Inject: the dev runner (tsx/esbuild) does not emit design:paramtypes metadata.
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  async versions(contractorId: string): Promise<CvVersionList> {
    await this.backfillAdoptedUploads(contractorId);
    const rows = await prisma.cvVersion.findMany({ where: { contractorId }, orderBy: { versionNumber: "desc" } });
    const pending = await prisma.cvChange.groupBy({ by: ["cvVersionId"], where: { contractorId, status: "PENDING" }, _count: { _all: true } });
    const counts = new Map(pending.map((p) => [p.cvVersionId, p._count._all]));
    return {
      items: rows.map((r) => ({
        id: r.id,
        versionNumber: r.versionNumber,
        uploadId: r.cvUploadId,
        createdAt: r.createdAt.toISOString(),
        pendingChanges: counts.get(r.id) ?? 0,
      })),
    };
  }

  /**
   * A CV uploaded during the join journey is an anonymous draft upload that is adopted at registration, and only
   * signed-in uploads get a version, so that CV had none and My LOOP showed "No CV on file". Gives every READY upload
   * without a version its place, oldest first (so the first CV is version 1, which proposes no changes). Idempotent.
   */
  private async backfillAdoptedUploads(contractorId: string): Promise<void> {
    const have = await prisma.cvVersion.findMany({ where: { contractorId }, select: { cvUploadId: true } });
    const missing = await prisma.cvUpload.findMany({
      where: { contractorId, status: "READY", id: { notIn: have.map((v) => v.cvUploadId) } },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    for (const u of missing) await recordCvVersion(contractorId, u.id);
  }

  async pendingChanges(contractorId: string): Promise<CvChangeList> {
    const rows = await prisma.cvChange.findMany({ where: { contractorId, status: "PENDING" }, orderBy: [{ material: "desc" }, { createdAt: "asc" }] });
    return {
      items: rows.map((r) => ({
        id: r.id,
        cvVersionId: r.cvVersionId,
        key: r.key,
        kind: r.kind as "ADDED" | "REMOVED" | "CHANGED",
        material: r.material,
        previousValue: r.previousValue,
        proposedValue: r.proposedValue,
        proposedExcerpt: r.proposedExcerpt,
      })),
    };
  }

  async resolve(contractorId: string, changeId: string, req: ResolveCvChangeRequest, now = new Date()): Promise<CvChangeList> {
    const change = await prisma.cvChange.findFirst({ where: { id: changeId, contractorId } });
    if (!change) throw new NotFoundException("Change not found");
    if (change.status !== "PENDING") throw new ConflictException("This change has already been reviewed");
    const accept = req.decision === "ACCEPT";

    await prisma.$transaction(async (tx) => {
      // Conditional so two parallel resolutions apply it once.
      const claimed = await tx.cvChange.updateMany({
        where: { id: change.id, status: "PENDING" },
        data: { status: accept ? "ACCEPTED" : "REJECTED", resolvedAt: now },
      });
      if (claimed.count !== 1) throw new ConflictException("This change has already been reviewed");
      if (!accept) return;

      if (change.kind === "REMOVED") {
        if (change.previousFieldId) await tx.confirmedProfileField.deleteMany({ where: { id: change.previousFieldId, contractorId } });
        return;
      }
      if (change.proposedValue === null || change.proposedFieldId === null) return;
      const updated =
        change.kind === "CHANGED" && change.previousFieldId
          ? await tx.confirmedProfileField.updateMany({
              where: { id: change.previousFieldId, contractorId },
              data: { value: change.proposedValue, edited: false },
            })
          : { count: 0 };
      if (updated.count === 0) {
        const version = await tx.cvVersion.findUnique({ where: { id: change.cvVersionId } });
        const run = version ? await tx.extractionRun.findUnique({ where: { cvUploadId: version.cvUploadId } }) : null;
        if (!run) throw new NotFoundException("The CV for this change no longer exists");
        await tx.confirmedProfileField.upsert({
          where: { extractionRunId_fieldId: { extractionRunId: run.id, fieldId: change.proposedFieldId } },
          create: { contractorId, extractionRunId: run.id, fieldId: change.proposedFieldId, key: change.key, value: change.proposedValue },
          update: { value: change.proposedValue },
        });
      }
    });

    await this.audit.record({
      actorId: contractorId,
      entityType: "CvChange",
      entityId: change.id,
      action: accept ? "cv.change.accepted" : "cv.change.rejected",
      before: { key: change.key, kind: change.kind, value: change.previousValue },
      after: { key: change.key, value: accept ? change.proposedValue : change.previousValue, material: change.material },
    });
    return this.pendingChanges(contractorId);
  }

  /** Delete-my-CV: files, versions, suggestions and pending changes. Safe to repeat. */
  async deleteAll(contractorId: string): Promise<number> {
    const removed = await purgeCvData(contractorId, this.storage);
    await this.audit.record({ actorId: contractorId, entityType: "Contractor", entityId: contractorId, action: "cv.deleted", after: { uploads: removed } });
    return removed;
  }
}
