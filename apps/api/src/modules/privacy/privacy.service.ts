import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@loop/db";
import type { DataExport, PrivacyResult } from "@loop/contracts";
import { AuditService } from "../../common/audit.service.js";
import { PRIVACY_ERASE_JOB, PRIVACY_ERASE_SEND_OPTIONS } from "../../jobs/privacy-erase.job.js";
import { ConsentService } from "../consent/consent.service.js";
import { JOB_QUEUE, type JobQueue } from "../cv/job-queue.service.js";

/** Phase 7: pause, withdraw, export and delete-my-account. */
@Injectable()
export class PrivacyService {
  // Explicit @Inject: the dev runner (tsx/esbuild) does not emit design:paramtypes metadata.
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ConsentService) private readonly consents: ConsentService,
    @Inject(JOB_QUEUE) private readonly jobs: JobQueue,
  ) {}

  /** Pause hides a LIVE profile from search but keeps it LIVE and keeps every consent. Reversible. */
  async setPaused(contractorId: string, paused: boolean): Promise<PrivacyResult> {
    const before = await prisma.contractor.findUnique({ where: { id: contractorId }, select: { paused: true } });
    if (!before) throw new NotFoundException("Contractor not found");
    if (before.paused !== paused) {
      await prisma.contractor.update({ where: { id: contractorId }, data: { paused } });
      await this.audit.record({
        actorId: contractorId,
        entityType: "Contractor",
        entityId: contractorId,
        action: paused ? "profile.paused" : "profile.unpaused",
        before: { paused: before.paused },
        after: { paused },
      });
    }
    return { status: paused ? "PAUSED" : "ACTIVE" };
  }

  /**
   * Withdraw takes the profile off LIVE and withdraws the profile-visibility consent (which also takes it off
   * LIVE in the consent service's own transaction). Data is kept; going LIVE again means the Phase 6 steps.
   */
  async withdraw(contractorId: string, ip: string | undefined): Promise<PrivacyResult> {
    const before = await prisma.contractor.findUnique({ where: { id: contractorId }, select: { live: true, paused: true } });
    if (!before) throw new NotFoundException("Contractor not found");
    await this.consents.update(contractorId, { changes: [{ purpose: "PROFILE_VISIBILITY", granted: false }] }, ip);
    await prisma.contractor.updateMany({ where: { id: contractorId, OR: [{ live: true }, { paused: true }] }, data: { live: false, paused: false } });
    await this.audit.record({
      actorId: contractorId,
      entityType: "Contractor",
      entityId: contractorId,
      action: "profile.withdrawn",
      before,
      after: { live: false, paused: false },
    });
    return { status: "WITHDRAWN" };
  }

  /** Everything we hold about the contractor that is theirs to see. Hashes, tokens and object keys are left out. */
  async export(contractorId: string, now = new Date()): Promise<DataExport> {
    const contractor = await prisma.contractor.findUnique({ where: { id: contractorId } });
    if (!contractor) throw new NotFoundException("Contractor not found");
    const where = { contractorId };
    const [preferences, details, fields, assignments, consents, events, uploads, versions, changes, eligibility, referrals, rewards] = await Promise.all([
      prisma.contractorPreferences.findUnique({ where }),
      prisma.contractorProfileDetails.findUnique({ where }),
      prisma.confirmedProfileField.findMany({ where, orderBy: { createdAt: "asc" } }),
      prisma.assignment.findMany({ where, orderBy: { startDate: "asc" } }),
      prisma.consentRecord.findMany({ where, orderBy: { grantedAt: "asc" } }),
      prisma.confirmationEvent.findMany({ where, orderBy: { confirmedAt: "asc" } }),
      prisma.cvUpload.findMany({ where, orderBy: { createdAt: "asc" } }),
      prisma.cvVersion.findMany({ where, orderBy: { versionNumber: "asc" } }),
      prisma.cvChange.findMany({ where, orderBy: { createdAt: "asc" } }),
      prisma.eligibilityDeclaration.findMany({ where, orderBy: { createdAt: "asc" } }),
      prisma.referral.findMany({ where: { OR: [{ referrerId: contractorId }, { refereeId: contractorId }] } }),
      prisma.reward.findMany({ where: { OR: [{ beneficiaryId: contractorId }, { qualifyingContractorId: contractorId }] } }),
    ]);
    const iso = (d: Date | null) => d?.toISOString() ?? null;
    await this.audit.record({ actorId: contractorId, entityType: "Contractor", entityId: contractorId, action: "privacy.exported" });
    return {
      exportedAt: now.toISOString(),
      data: {
        account: {
          id: contractor.id,
          email: contractor.email,
          phone: contractor.phone,
          firstName: contractor.firstName,
          lastName: contractor.lastName,
          employmentSituation: contractor.employmentSituation,
          availableFrom: iso(contractor.availableFrom),
          contractEndDate: iso(contractor.contractEndDate),
          lastConfirmedAt: iso(contractor.lastConfirmedAt),
          live: contractor.live,
          paused: contractor.paused,
          referralCode: contractor.referralCode,
          foundingPlace: contractor.foundingPlace,
          createdAt: iso(contractor.createdAt),
        },
        preferences,
        details,
        profileFields: fields.map((f) => ({ key: f.key, value: f.value, edited: f.edited, createdAt: iso(f.createdAt) })),
        assignments,
        consents: consents.map((c) => ({ purpose: c.purpose, wordingVersion: c.wordingVersion, source: c.source, grantedAt: iso(c.grantedAt), withdrawnAt: iso(c.withdrawnAt) })),
        availabilityHistory: events,
        cvFiles: uploads.map((u) => ({ id: u.id, status: u.status, detectedType: u.detectedType, sizeBytes: u.sizeBytes, createdAt: iso(u.createdAt) })),
        cvVersions: versions,
        cvChanges: changes,
        eligibilityDeclarations: eligibility.map((e) => ({ ukBased: e.ukBased, rightToWork: e.rightToWork, wordingVersion: e.wordingVersion, createdAt: iso(e.createdAt) })),
        referrals,
        rewards,
      },
    };
  }

  /**
   * Marks the account for erasure, takes it off LIVE, signs it out everywhere and queues the erasure job.
   * Repeating the request re-queues it (the job is singleton per contractor and idempotent), so a failed enqueue
   * can simply be retried.
   */
  async requestErasure(contractorId: string, now = new Date()): Promise<PrivacyResult> {
    const before = await prisma.contractor.findUnique({ where: { id: contractorId }, select: { live: true, erasureRequestedAt: true, erasedAt: true } });
    if (!before) throw new NotFoundException("Contractor not found");
    if (!before.erasureRequestedAt) {
      await prisma.$transaction([
        prisma.contractor.update({ where: { id: contractorId }, data: { erasureRequestedAt: now, live: false, searchSuppressed: true } }),
        prisma.session.updateMany({ where: { contractorId, revokedAt: null }, data: { revokedAt: now, refreshTokenHash: null } }),
      ]);
      await this.audit.record({
        actorId: contractorId,
        entityType: "Contractor",
        entityId: contractorId,
        action: "privacy.erasure_requested",
        before: { live: before.live },
        after: { live: false, erasureRequestedAt: now.toISOString() },
      });
    }
    await this.jobs.send(PRIVACY_ERASE_JOB, { contractorId }, { ...PRIVACY_ERASE_SEND_OPTIONS, singletonKey: contractorId });
    return { status: "ERASURE_REQUESTED" };
  }
}
