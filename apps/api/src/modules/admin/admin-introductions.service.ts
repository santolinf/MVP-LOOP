import { ConflictException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { prisma } from "@loop/db";
import { introductionCounts, isReferralValid, type ReferralFlagStatus } from "@loop/domain";
import type { AdminOverrideIntroducerSchema, AdminResolveFlagSchema } from "@loop/contracts";
import type { z } from "zod";
import { AuditService } from "../../common/audit.service.js";
import { FoundingService } from "../founding/founding.service.js";
import type { StaffPrincipal } from "./staff-access.js";

type Page = { page: number; pageSize: number };

const fullName = (c: { firstName: string | null; lastName: string | null } | undefined): string | null =>
  c ? [c.firstName, c.lastName].filter(Boolean).join(" ") || null : null;

/** Introducer rewards in these states have already been approved for the old introducer, so attribution is frozen. */
const FROZEN_REWARD_STATUSES = ["APPROVED", "PAID"];

@Injectable()
export class AdminIntroductionsService {
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(FoundingService) private readonly founding: FoundingService,
  ) {}

  async list(q: { flagged?: "true" | "false" } & Page) {
    const where = q.flagged === "true" ? { id: { in: await this.openFlagReferralIds() } } : {};
    const [rows, total] = await Promise.all([
      prisma.referral.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      prisma.referral.count({ where }),
    ]);
    const ids = rows.flatMap((r) => [r.referrerId, r.refereeId]);
    const [people, flags] = rows.length
      ? await Promise.all([
          prisma.contractor.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } }),
          prisma.referralFlag.findMany({ where: { referralId: { in: rows.map((r) => r.id) } }, orderBy: { createdAt: "asc" } }),
        ])
      : [[], []];
    const byId = new Map(people.map((p) => [p.id, p]));
    return {
      items: rows.map((r) => {
        const own = flags.filter((f) => f.referralId === r.id);
        return {
          id: r.id,
          referrer: { id: r.referrerId, name: fullName(byId.get(r.referrerId)) },
          referee: { id: r.refereeId, name: fullName(byId.get(r.refereeId)) },
          source: r.source,
          locked: r.lockedAt !== null,
          counted: introductionCounts({ locked: r.lockedAt !== null, flagStatuses: own.map((f) => f.status as ReferralFlagStatus) }),
          createdAt: r.createdAt.toISOString(),
          flags: own.map((f) => ({
            id: f.id,
            reason: f.reason,
            status: f.status,
            createdAt: f.createdAt.toISOString(),
            resolvedAt: f.resolvedAt?.toISOString() ?? null,
          })),
        };
      }),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  private async openFlagReferralIds(): Promise<string[]> {
    return (await prisma.referralFlag.findMany({ where: { status: "OPEN" }, select: { referralId: true } })).map((f) => f.referralId);
  }

  async foundingSummary() {
    const [counter, recent] = await Promise.all([
      prisma.foundingCounter.findUnique({ where: { id: 1 } }),
      prisma.contractor.findMany({
        where: { foundingPlace: { not: null } },
        orderBy: { foundingPlace: "desc" },
        take: 10,
        select: { id: true, firstName: true, lastName: true, foundingPlace: true },
      }),
    ]);
    return {
      allocated: counter?.allocated ?? 0,
      cap: counter?.cap ?? 50000,
      recent: recent.flatMap((c) => (c.foundingPlace === null ? [] : [{ contractorId: c.id, name: fullName(c), place: c.foundingPlace }])),
    };
  }

  /**
   * Clearing or confirming a review flag. CONFIRMED keeps the introduction out of the count; CLEARED lets it count, so
   * Founding is re-checked for the introducer.
   */
  async resolveFlag(flagId: string, body: z.infer<typeof AdminResolveFlagSchema>, staff: StaffPrincipal, now = new Date()) {
    const res = await prisma.referralFlag.updateMany({
      where: { id: flagId, status: "OPEN" },
      data: { status: body.status, resolvedAt: now, resolvedBy: staff.id },
    });
    if (res.count !== 1) throw new NotFoundException("Open flag not found");
    const flag = await prisma.referralFlag.findUnique({ where: { id: flagId } });
    await this.audit.record({
      actorId: staff.id,
      actorType: "STAFF",
      entityType: "Referral",
      entityId: flag?.referralId ?? flagId,
      action: "admin.referral_flag_resolved",
      before: { flagId, status: "OPEN", reason: flag?.reason ?? null },
      after: { flagId, status: body.status, note: body.note },
    });
    if (body.status === "CLEARED" && flag) {
      const ref = await prisma.referral.findUnique({ where: { id: flag.referralId } });
      if (ref) await this.founding.allocateIfEligible(ref.referrerId, now);
    }
    return { ok: true as const };
  }

  /**
   * Introducer override: the only way to change a locked attribution. Reason mandatory; before and after are audited.
   * Unpaid introducer rewards for this referee follow the new introducer; once one is APPROVED or PAID it is refused.
   * TODO(spec): a Founding place already given to the old introducer is not withdrawn by an override.
   */
  async overrideIntroducer(referralId: string, body: z.infer<typeof AdminOverrideIntroducerSchema>, staff: StaffPrincipal, now = new Date()) {
    const referral = await prisma.referral.findUnique({ where: { id: referralId } });
    if (!referral) throw new NotFoundException("Introduction not found");
    if (referral.referrerId === body.referrerId) throw new UnprocessableEntityException("That contractor is already the introducer");
    const next = await prisma.contractor.findFirst({ where: { id: body.referrerId, erasedAt: null }, select: { id: true } });
    if (!next) throw new NotFoundException("New introducer not found");
    if (!isReferralValid({ referrerId: body.referrerId, refereeId: referral.refereeId, refereeAlreadyAttributed: false })) {
      throw new UnprocessableEntityException("A contractor cannot introduce themselves");
    }
    const rewards = await prisma.reward.findMany({
      where: { type: "INTRODUCER_PLACEMENT", qualifyingContractorId: referral.refereeId },
      select: { id: true, status: true, beneficiaryId: true },
    });
    if (rewards.some((r) => FROZEN_REWARD_STATUSES.includes(r.status))) {
      throw new ConflictException("An introducer reward for this introduction is already approved or paid");
    }

    await prisma.$transaction(async (tx) => {
      await tx.referral.update({ where: { id: referralId }, data: { referrerId: body.referrerId, source: "ADMIN", deviceHash: null } });
      if (rewards.length > 0) {
        await tx.reward.updateMany({ where: { id: { in: rewards.map((r) => r.id) } }, data: { beneficiaryId: body.referrerId } });
      }
    });
    await this.audit.record({
      actorId: staff.id,
      actorType: "STAFF",
      entityType: "Referral",
      entityId: referralId,
      action: "admin.introducer_overridden",
      before: { referrerId: referral.referrerId, source: referral.source },
      after: { referrerId: body.referrerId, source: "ADMIN", reason: body.reason, rewardsRepointed: rewards.length },
    });
    // The new introducer may now qualify for a Founding place.
    if (referral.lockedAt) await this.founding.allocateIfEligible(body.referrerId, now);
    return { ok: true as const };
  }
}
