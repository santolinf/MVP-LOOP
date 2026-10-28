import { ForbiddenException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { prisma } from "@loop/db";
import {
  canTransitionReward,
  introductionCounts,
  isPlacementRewardEligible,
  isRewardApprovable,
  mayApproveReward,
  PLACEMENT_REWARD_PENCE,
  wholeMonthsBetween,
  type ReferralFlagStatus,
  type RewardStatus,
  type RewardType,
} from "@loop/domain";
import type { RewardList } from "@loop/contracts";
import { loadFourEyesThresholdPence } from "../../common/admin-config.js";
import { AuditService } from "../../common/audit.service.js";

/** Agency-supplied verification of paid service (B7). Never typed by the contractor. */
export interface AgencyVerification {
  serviceStart: Date;
  serviceEnd: Date;
  /** Reference to the agency evidence (document id, confirmation reference). */
  evidence: Record<string, unknown>;
}

/**
 * Phase 9 £50 rewards ledger (separate from Radar). The contractor earns once for their first qualifying LOOP
 * placement; their locked direct introducer earns once per such contractor. Creation and the status
 * lifecycle live here; the Phase 10 Admin endpoints drive them. Payment stays off: `markPaid`
 * refuses unless `payouts.live` is enabled (B7, rule 10).
 */
@Injectable()
export class RewardsService {
  // Explicit @Inject: the dev runner (tsx/esbuild) does not emit design:paramtypes metadata.
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  async list(beneficiaryId: string): Promise<RewardList> {
    const rows = await prisma.reward.findMany({ where: { beneficiaryId }, orderBy: { createdAt: "desc" } });
    return {
      items: rows.map((r) => ({
        id: r.id,
        type: r.type,
        status: r.status,
        amountPence: r.amountPence,
        supplyingCompany: r.supplyingCompany,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Opens the PENDING rewards for a contractor's first qualifying placement. Idempotent: the
   * (type, beneficiary, qualifying contractor) unique key means a repeat creates nothing.
   */
  async openForPlacement(p: { contractorId: string; assignmentId: string; isRadar: boolean; actorId: string }) {
    const assignment = await prisma.assignment.findFirst({ where: { id: p.assignmentId, contractorId: p.contractorId } });
    if (!assignment) throw new NotFoundException("Assignment not found for this contractor");
    const earlier = await prisma.reward.count({ where: { type: "CONTRACTOR_PLACEMENT", beneficiaryId: p.contractorId } });
    const existingForThis = await prisma.reward.count({
      where: { type: "CONTRACTOR_PLACEMENT", beneficiaryId: p.contractorId, assignmentId: p.assignmentId },
    });
    if (existingForThis > 0) return { created: 0 };
    if (!isPlacementRewardEligible({ isRadar: p.isRadar, hasEarlierPlacementReward: earlier > 0 })) return { created: 0 };

    const base = {
      qualifyingContractorId: p.contractorId,
      amountPence: PLACEMENT_REWARD_PENCE,
      assignmentId: assignment.id,
      supplyingCompany: assignment.supplyingCompany,
    };
    const rows: Array<typeof base & { type: RewardType; beneficiaryId: string }> = [
      { ...base, type: "CONTRACTOR_PLACEMENT", beneficiaryId: p.contractorId },
    ];
    const introducer = await this.countedIntroducer(p.contractorId);
    if (introducer) rows.push({ ...base, type: "INTRODUCER_PLACEMENT", beneficiaryId: introducer });

    const created = await prisma.reward.createMany({ data: rows, skipDuplicates: true });
    for (const r of rows) {
      await this.audit.record({
        actorId: p.actorId,
        entityType: "Reward",
        entityId: `${r.type}:${r.beneficiaryId}:${r.qualifyingContractorId}`,
        action: "reward.created",
        after: { type: r.type, beneficiaryId: r.beneficiaryId, assignmentId: r.assignmentId, amountPence: r.amountPence },
      });
    }
    return { created: created.count };
  }

  /** The introducer only earns when attribution is locked and not held by an open or confirmed review flag. */
  private async countedIntroducer(refereeId: string): Promise<string | null> {
    const ref = await prisma.referral.findUnique({ where: { refereeId } });
    if (!ref) return null;
    const flags = await prisma.referralFlag.findMany({ where: { referralId: ref.id }, select: { status: true } });
    const counts = introductionCounts({
      locked: ref.lockedAt !== null,
      flagStatuses: flags.map((f) => f.status as ReferralFlagStatus),
    });
    return counts ? ref.referrerId : null;
  }

  /** Records the agency's verification and moves PENDING to UNDER_VERIFICATION. */
  async recordAgencyVerification(rewardId: string, v: AgencyVerification, actorId: string, now = new Date()) {
    const reward = await this.load(rewardId);
    this.assertTransition(reward.status, "UNDER_VERIFICATION");
    const updated = await prisma.reward.update({
      where: { id: rewardId },
      data: {
        status: "UNDER_VERIFICATION",
        serviceStart: v.serviceStart,
        serviceEnd: v.serviceEnd,
        evidence: v.evidence as object,
        agencyVerifiedAt: now,
        verificationRecordedBy: actorId,
      },
    });
    await this.audit.record({
      actorId,
      actorType: "STAFF",
      entityType: "Reward",
      entityId: rewardId,
      action: "reward.agency_verified",
      before: { status: reward.status },
      after: { status: updated.status, serviceStart: v.serviceStart.toISOString(), serviceEnd: v.serviceEnd.toISOString(), evidence: v.evidence },
    });
    return updated;
  }

  /** Admin approval. Refused without agency verification and 3 whole months of service (B7). */
  async approve(rewardId: string, adminId: string, now = new Date()) {
    const reward = await this.load(rewardId);
    this.assertTransition(reward.status, "APPROVED");
    const months = reward.serviceStart && reward.serviceEnd ? wholeMonthsBetween(reward.serviceStart, reward.serviceEnd) : 0;
    if (!isRewardApprovable({ agencyVerified: reward.agencyVerifiedAt !== null, paidServiceMonths: months })) {
      throw new UnprocessableEntityException("Needs agency-verified paid service of at least 3 months");
    }
    // Four-eyes: whoever recorded the evidence cannot also approve it above the configured threshold.
    const allowed = mayApproveReward({
      approverId: adminId,
      requesterId: reward.verificationRecordedBy ?? null,
      amountPence: reward.amountPence,
      thresholdPence: await loadFourEyesThresholdPence(),
    });
    if (!allowed) throw new ForbiddenException("A different person must approve a reward whose evidence you recorded");
    const updated = await prisma.reward.update({
      where: { id: rewardId },
      data: { status: "APPROVED", approvedAt: now, approvedBy: adminId },
    });
    await this.audit.record({
      actorId: adminId,
      actorType: "STAFF",
      entityType: "Reward",
      entityId: rewardId,
      action: "reward.approved",
      before: { status: reward.status },
      after: { status: updated.status, approvedAt: now.toISOString() },
    });
    return updated;
  }

  /** Payment stays off: only possible once `payouts.live` is enabled. */
  async markPaid(rewardId: string, adminId: string, now = new Date()) {
    const live = (await prisma.featureFlag.findUnique({ where: { key: "payouts.live" } }))?.enabled ?? false;
    if (!live) throw new ForbiddenException("Payouts are not live");
    const reward = await this.load(rewardId);
    this.assertTransition(reward.status, "PAID");
    const updated = await prisma.reward.update({ where: { id: rewardId }, data: { status: "PAID", paidAt: now } });
    await this.audit.record({
      actorId: adminId,
      entityType: "Reward",
      entityId: rewardId,
      action: "reward.paid",
      before: { status: reward.status },
      after: { status: updated.status, paidAt: now.toISOString() },
    });
    return updated;
  }

  private async load(id: string) {
    const reward = await prisma.reward.findUnique({ where: { id } });
    if (!reward) throw new NotFoundException("Reward not found");
    return reward;
  }

  private assertTransition(from: string, to: RewardStatus) {
    if (!canTransitionReward(from as RewardStatus, to)) {
      throw new UnprocessableEntityException(`Cannot move a reward from ${from} to ${to}`);
    }
  }
}
