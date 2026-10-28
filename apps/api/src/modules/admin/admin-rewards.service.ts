import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@loop/db";
import { isRewardApprovable, londonDate, mayApproveReward, wholeMonthsBetween } from "@loop/domain";
import type { AdminRecordVerificationSchema, AdminRewardRow } from "@loop/contracts";
import type { z } from "zod";
import { loadFourEyesThresholdPence } from "../../common/admin-config.js";
import { RewardsService } from "../rewards/rewards.service.js";
import type { StaffPrincipal } from "./staff-access.js";

type Page = { page: number; pageSize: number };
type RewardRow = NonNullable<Awaited<ReturnType<typeof prisma.reward.findUnique>>>;

const fullName = (c: { firstName: string | null; lastName: string | null } | undefined): string | null =>
  c ? [c.firstName, c.lastName].filter(Boolean).join(" ") || null : null;
const dateOnly = (d: Date | null): string | null => (d ? londonDate(d) : null);

@Injectable()
export class AdminRewardsService {
  constructor(@Inject(RewardsService) private readonly rewards: RewardsService) {}

  /** The approval verdict is computed here from the domain rules so the admin UI only displays it (rule 13). */
  private toRow(r: RewardRow, names: Map<string, { firstName: string | null; lastName: string | null }>, viewerId: string, threshold: number): AdminRewardRow {
    const months = r.serviceStart && r.serviceEnd ? wholeMonthsBetween(r.serviceStart, r.serviceEnd) : 0;
    let blockedReason: string | null = null;
    if (r.status !== "UNDER_VERIFICATION") blockedReason = r.status === "PENDING" ? "Waiting for agency evidence" : "Already decided";
    else if (!isRewardApprovable({ agencyVerified: r.agencyVerifiedAt !== null, paidServiceMonths: months })) {
      blockedReason = "Needs agency-verified paid service of at least 3 months";
    } else if (!mayApproveReward({ approverId: viewerId, requesterId: r.verificationRecordedBy, amountPence: r.amountPence, thresholdPence: threshold })) {
      blockedReason = "You recorded the evidence; a different person must approve";
    }
    return {
      id: r.id,
      type: r.type,
      status: r.status,
      amountPence: r.amountPence,
      beneficiary: { id: r.beneficiaryId, name: fullName(names.get(r.beneficiaryId)) },
      qualifyingContractor: { id: r.qualifyingContractorId, name: fullName(names.get(r.qualifyingContractorId)) },
      supplyingCompany: r.supplyingCompany,
      serviceStart: dateOnly(r.serviceStart),
      serviceEnd: dateOnly(r.serviceEnd),
      paidServiceMonths: months,
      evidence: r.evidence !== null && typeof r.evidence === "object" && !Array.isArray(r.evidence) ? (r.evidence as Record<string, unknown>) : null,
      agencyVerifiedAt: r.agencyVerifiedAt?.toISOString() ?? null,
      verificationRecordedBy: r.verificationRecordedBy,
      approvedAt: r.approvedAt?.toISOString() ?? null,
      approvedBy: r.approvedBy,
      createdAt: r.createdAt.toISOString(),
      approval: { allowed: blockedReason === null, blockedReason },
    };
  }

  async list(q: { status?: string } & Page, staff: StaffPrincipal) {
    const where = q.status ? { status: q.status } : {};
    const [rows, total, threshold] = await Promise.all([
      prisma.reward.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      prisma.reward.count({ where }),
      loadFourEyesThresholdPence(),
    ]);
    const ids = [...new Set(rows.flatMap((r) => [r.beneficiaryId, r.qualifyingContractorId]))];
    const people = ids.length ? await prisma.contractor.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } }) : [];
    const names = new Map(people.map((p) => [p.id, p]));
    return { items: rows.map((r) => this.toRow(r, names, staff.id, threshold)), total, page: q.page, pageSize: q.pageSize };
  }

  /**
   * Records the agency evidence a staff member has received (agency access is not live, B7). The contractor never
   * supplies it. The recorder becomes the "requester" for the four-eyes approval rule.
   */
  async recordVerification(id: string, body: z.infer<typeof AdminRecordVerificationSchema>, staff: StaffPrincipal, now = new Date()) {
    const serviceStart = new Date(`${body.serviceStart}T00:00:00Z`);
    const serviceEnd = new Date(`${body.serviceEnd}T00:00:00Z`);
    if (serviceEnd < serviceStart) throw new BadRequestException("Service end must not be before service start");
    await this.rewards.recordAgencyVerification(
      id,
      { serviceStart, serviceEnd, evidence: { reference: body.reference, note: body.note ?? null, recordedBy: staff.id } },
      staff.id,
      now,
    );
    return this.one(id, staff);
  }

  async approve(id: string, staff: StaffPrincipal, now = new Date()) {
    await this.rewards.approve(id, staff.id, now);
    return this.one(id, staff);
  }

  private async one(id: string, staff: StaffPrincipal): Promise<AdminRewardRow> {
    const r = await prisma.reward.findUnique({ where: { id } });
    if (!r) throw new NotFoundException("Reward not found");
    const people = await prisma.contractor.findMany({ where: { id: { in: [r.beneficiaryId, r.qualifyingContractorId] } }, select: { id: true, firstName: true, lastName: true } });
    return this.toRow(r, new Map(people.map((p) => [p.id, p])), staff.id, await loadFourEyesThresholdPence());
  }
}
