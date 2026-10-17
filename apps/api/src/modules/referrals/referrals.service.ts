import { randomInt } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { prisma } from "@loop/db";
import { generateReferralCode, isReferralValid, normaliseReferralCode } from "@loop/domain";
import type { AttributeReferralResult, ReferralCodeCheck, ReferralLink, ReferralList } from "@loop/contracts";
import { AuditService } from "../../common/audit.service.js";
import { FoundingService } from "../founding/founding.service.js";

const isUniqueViolation = (e: unknown) => typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";

@Injectable()
export class ReferralsService {
  // Explicit @Inject: the dev runner (tsx/esbuild) does not emit design:paramtypes metadata.
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(FoundingService) private readonly founding: FoundingService,
  ) {}

  /** The code is created lazily on first request; collisions retry against the unique index. */
  async link(id: string): Promise<ReferralLink> {
    const c = await prisma.contractor.findUnique({ where: { id }, select: { referralCode: true } });
    let code = c?.referralCode ?? null;
    for (let attempt = 0; !code && attempt < 5; attempt++) {
      const candidate = generateReferralCode((max) => randomInt(max));
      try {
        await prisma.contractor.update({ where: { id }, data: { referralCode: candidate } });
        code = candidate;
        await this.audit.record({
          actorId: id,
          entityType: "Contractor",
          entityId: id,
          action: "referral.code_created",
          before: { referralCode: null },
          after: { referralCode: candidate },
        });
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
      }
    }
    if (!code) throw new Error("Could not allocate a referral code");
    // TODO(spec): confirm the public join path and base URL for referral links.
    const base = process.env.PUBLIC_BASE_URL ?? "http://localhost:5173";
    return { code, url: `${base}/join?ref=${code}` };
  }

  async list(id: string): Promise<ReferralList> {
    const refs = await prisma.referral.findMany({ where: { referrerId: id }, orderBy: { createdAt: "desc" } });
    const people = refs.length
      ? await prisma.contractor.findMany({
          where: { id: { in: refs.map((r) => r.refereeId) } },
          select: { id: true, firstName: true, live: true },
        })
      : [];
    const byId = new Map(people.map((p) => [p.id, p]));
    return {
      items: refs.map((r) => ({
        id: r.id,
        refereeFirstName: byId.get(r.refereeId)?.firstName ?? null,
        registeredAt: r.createdAt.toISOString(),
        counted: byId.get(r.refereeId)?.live ?? false,
      })),
    };
  }

  async checkCode(raw: string): Promise<ReferralCodeCheck> {
    const code = normaliseReferralCode(raw);
    const referrer = code
      ? await prisma.contractor.findUnique({ where: { referralCode: code }, select: { firstName: true } })
      : null;
    return { valid: referrer !== null, referrerFirstName: referrer?.firstName ?? null };
  }

  /**
   * Attribution at signup. TODO(spec): the signup flow does not exist yet; it should call this once
   * with the code captured from the join link. Invalid, self or repeat attributions are ignored.
   */
  async attribute(refereeId: string, raw: string): Promise<AttributeReferralResult> {
    const code = normaliseReferralCode(raw);
    if (!code) return { attributed: false };
    const referrer = await prisma.contractor.findUnique({ where: { referralCode: code }, select: { id: true } });
    if (!referrer) return { attributed: false };
    const existing = await prisma.referral.findUnique({ where: { refereeId } });
    if (!isReferralValid({ referrerId: referrer.id, refereeId, refereeAlreadyAttributed: existing !== null })) {
      return { attributed: false };
    }
    let created;
    try {
      created = await prisma.referral.create({ data: { referrerId: referrer.id, refereeId } });
    } catch (e) {
      if (isUniqueViolation(e)) return { attributed: false }; // concurrent attribution won
      throw e;
    }
    await this.audit.record({
      actorId: refereeId,
      entityType: "Referral",
      entityId: created.id,
      action: "referral.attributed",
      after: { referrerId: referrer.id, refereeId },
    });
    await this.founding.allocateIfEligible(referrer.id);
    return { attributed: true };
  }
}
