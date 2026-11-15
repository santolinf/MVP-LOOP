import { Injectable } from "@nestjs/common";
import { prisma } from "@loop/db";
import type { AdminOverview } from "@loop/contracts";
import { addLondonDays, londonDate } from "@loop/domain";

type Query = { entityType?: string; entityId?: string; actorId?: string; action?: string; page: number; pageSize: number };

@Injectable()
export class AdminOverviewService {
  /** Colour counts use the cached search colour, which the freshness sweep keeps current; rows show the live value. */
  async overview(range: "7" | "30" | "90" | "all" = "30", now = new Date()): Promise<AdminOverview> {
    const base = { erasedAt: null };
    const [total, live, paused, suppressed, colours, calls, flags, awaitingVerification, awaitingApproval, counter] = await Promise.all([
      prisma.contractor.count({ where: base }),
      prisma.contractor.count({ where: { ...base, live: true } }),
      prisma.contractor.count({ where: { ...base, paused: true } }),
      prisma.contractor.count({ where: { ...base, searchSuppressed: true } }),
      prisma.contractor.groupBy({ by: ["searchColour"], where: { ...base, live: true }, _count: { _all: true } }),
      prisma.manualCallTask.count({ where: { status: "OPEN" } }),
      prisma.referralFlag.count({ where: { status: "OPEN" } }),
      prisma.reward.count({ where: { status: "PENDING" } }),
      prisma.reward.count({ where: { status: "UNDER_VERIFICATION" } }),
      prisma.foundingCounter.findUnique({ where: { id: 1 } }),
    ]);
    const byColour = (c: string) => colours.find((x) => x.searchColour === c)?._count._all ?? 0;
    return {
      contractors: { total, live, paused, searchSuppressed: suppressed },
      colours: { LIME: byColour("LIME"), ORANGE: byColour("ORANGE"), RED: byColour("RED"), BLUE: byColour("BLUE"), GREY: byColour("GREY") },
      queues: { openCallTasks: calls, openReferralFlags: flags, rewardsAwaitingVerification: awaitingVerification, rewardsAwaitingApproval: awaitingApproval },
      founding: { allocated: counter?.allocated ?? 0, cap: counter?.cap ?? 50000 },
      growth: await this.growth(range, now),
    };
  }

  /** Registrations per London day. Every day in the range is present (zero-filled) so the chart axis is continuous. */
  private async growth(range: "7" | "30" | "90" | "all", now: Date): Promise<AdminOverview["growth"]> {
    const today = londonDate(now);
    let start: string;
    if (range === "all") {
      const first = await prisma.contractor.findFirst({ where: { erasedAt: null }, orderBy: { createdAt: "asc" }, select: { createdAt: true } });
      start = first ? londonDate(first.createdAt) : today;
    } else {
      start = londonDate(addLondonDays(now, -(Number(range) - 1)));
    }
    // Over-fetch by a day so London-day boundaries are never clipped, then filter on the London date.
    const rows = await prisma.contractor.findMany({
      where: { erasedAt: null, createdAt: { gte: new Date(`${start}T00:00:00Z`) } },
      select: { createdAt: true },
    });
    const counts = new Map<string, number>();
    for (const r of rows) {
      const d = londonDate(r.createdAt);
      if (d >= start && d <= today) counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    const points: { date: string; count: number }[] = [];
    for (let d = start; d <= today; d = londonDate(addLondonDays(new Date(`${d}T12:00:00Z`), 1))) points.push({ date: d, count: counts.get(d) ?? 0 });
    return { range, total: points.reduce((n, p) => n + p.count, 0), points };
  }

  /** Read-only: there is no write path to the audit log from the API or the UI. */
  async audit(q: Query) {
    const where = {
      ...(q.entityType ? { entityType: q.entityType } : {}),
      ...(q.entityId ? { entityId: q.entityId } : {}),
      ...(q.actorId ? { actorId: q.actorId } : {}),
      ...(q.action ? { action: { contains: q.action } } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.auditEvent.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      prisma.auditEvent.count({ where }),
    ]);
    const obj = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
    return {
      items: rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        actorType: r.actorType,
        actorId: r.actorId,
        entityType: r.entityType,
        entityId: r.entityId,
        action: r.action,
        before: obj(r.before),
        after: obj(r.after),
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }
}
