import { Inject, Injectable } from "@nestjs/common";
import { prisma } from "@loop/db";
import { describeAvailability, FOUNDING_REQUIRED_REFERRALS, foundingPlacesLeft } from "@loop/domain";
import type { AdminFoundingTrackerQuerySchema, AdminProfileChangeQuerySchema } from "@loop/contracts";
import type { z } from "zod";
import { loadFreshnessThresholds } from "../../common/freshness-config.js";
import { factsFor } from "../me/me.service.js";
import { AdminIntroductionsService } from "./admin-introductions.service.js";

const fullName = (c: { firstName: string | null; lastName: string | null } | undefined): string | null =>
  c ? [c.firstName, c.lastName].filter(Boolean).join(" ") || null : null;

/** Phase 12 review queues that are not already a list elsewhere: the Founding tracker and pending profile changes. */
@Injectable()
export class AdminReviewsService {
  constructor(@Inject(AdminIntroductionsService) private readonly introductions: AdminIntroductionsService) {}

  /**
   * Contractors without a Founding place who have at least one counted introduction, closest first. "Counted" matches
   * the allocation rule: attribution locked at GO LIVE and not held by an open or confirmed review flag. A place is
   * only ever allocated by FoundingService (B6); this is read-only.
   */
  async foundingTracker(q: z.infer<typeof AdminFoundingTrackerQuerySchema>, now = new Date()) {
    const { allocated, cap } = await this.introductions.foundingSummary();
    const offset = (q.page - 1) * q.pageSize;
    const [rows, totalRows] = await Promise.all([
      prisma.$queryRaw<{ id: string; n: number }[]>`
        SELECT r."referrerId" AS id, COUNT(*)::int AS n
        FROM "Referral" r
        JOIN "Contractor" c ON c."id" = r."referrerId"
        WHERE r."lockedAt" IS NOT NULL AND c."foundingPlace" IS NULL AND c."erasedAt" IS NULL
          AND NOT EXISTS (SELECT 1 FROM "ReferralFlag" f WHERE f."referralId" = r."id" AND f."status" IN ('OPEN', 'CONFIRMED'))
        GROUP BY r."referrerId"
        ORDER BY n DESC, r."referrerId" ASC
        LIMIT ${q.pageSize} OFFSET ${offset}`,
      prisma.$queryRaw<{ total: number }[]>`
        SELECT COUNT(DISTINCT r."referrerId")::int AS total
        FROM "Referral" r
        JOIN "Contractor" c ON c."id" = r."referrerId"
        WHERE r."lockedAt" IS NOT NULL AND c."foundingPlace" IS NULL AND c."erasedAt" IS NULL
          AND NOT EXISTS (SELECT 1 FROM "ReferralFlag" f WHERE f."referralId" = r."id" AND f."status" IN ('OPEN', 'CONFIRMED'))`,
    ]);
    const people = rows.length ? await prisma.contractor.findMany({ where: { id: { in: rows.map((r) => r.id) } } }) : [];
    const byId = new Map(people.map((p) => [p.id, p]));
    const thresholds = await loadFreshnessThresholds();
    return {
      allocated,
      cap,
      remaining: foundingPlacesLeft(allocated, cap),
      items: rows.map((r) => {
        const c = byId.get(r.id);
        // "Current" = availability confirmed and not stale (anything but grey), as FoundingService decides it.
        const isCurrent = c ? describeAvailability(factsFor(c, now), thresholds, now).colour !== "GREY" : false;
        return {
          contractorId: r.id,
          name: fullName(c),
          registeredReferrals: r.n,
          required: FOUNDING_REQUIRED_REFERRALS,
          isCurrent,
          state: r.n >= FOUNDING_REQUIRED_REFERRALS && isCurrent ? ("QUALIFIED" as const) : ("IN_PROGRESS" as const),
        };
      }),
      total: totalRows[0]?.total ?? 0,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  /**
   * Contractors with CV-extraction suggestions still waiting on them (A5). Read-only by design: staff can see who is
   * stuck, but only the contractor accepts or rejects a change, so confirmed data is never overwritten from here.
   */
  async profileChanges(q: z.infer<typeof AdminProfileChangeQuerySchema>) {
    const materialOnly = q.materialOnly === "true";
    const base = { status: "PENDING", ...(materialOnly ? { material: true } : {}) };
    const [groups, totalRows] = await Promise.all([
      prisma.cvChange.groupBy({
        by: ["contractorId"],
        where: base,
        _count: { _all: true },
        _min: { createdAt: true },
        orderBy: { _min: { createdAt: "asc" } },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.cvChange.findMany({ where: base, distinct: ["contractorId"], select: { contractorId: true } }),
    ]);
    const ids = groups.map((g) => g.contractorId);
    const [people, material] = ids.length
      ? await Promise.all([
          prisma.contractor.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } }),
          prisma.cvChange.groupBy({ by: ["contractorId"], where: { status: "PENDING", material: true, contractorId: { in: ids } }, _count: { _all: true } }),
        ])
      : [[], []];
    const byId = new Map(people.map((p) => [p.id, p]));
    return {
      items: groups.flatMap((g) =>
        g._min.createdAt
          ? [
              {
                contractorId: g.contractorId,
                name: fullName(byId.get(g.contractorId)),
                pending: g._count._all,
                material: material.find((m) => m.contractorId === g.contractorId)?._count._all ?? 0,
                oldestAt: g._min.createdAt.toISOString(),
              },
            ]
          : [],
      ),
      total: totalRows.length,
      page: q.page,
      pageSize: q.pageSize,
    };
  }
}
