import { Prisma, prisma } from "@loop/db";
import { purgeCvData } from "../cv/cv-changes.js";

interface ObjectStore {
  delete(key: string): Promise<void>;
}

export type ErasureOutcome = "ERASED" | "ALREADY_ERASED" | "NOT_FOUND";

/**
 * Account erasure. Removes CV files and every contractor-owned record, anonymises the Contractor row (it stays
 * only because referrals, rewards and the founding counter point at it), blanks the before/after of the contractor's
 * audit events, then writes a tombstone that holds no personal data. Idempotent and safe to retry: files go first,
 * and the row is marked erased only in the final transaction.
 * TODO(spec): retention for referral and reward records after erasure is undefined; they are kept, now anonymous.
 */
export async function eraseContractor(contractorId: string, store: ObjectStore, now = new Date()): Promise<ErasureOutcome> {
  const contractor = await prisma.contractor.findUnique({ where: { id: contractorId }, select: { id: true, erasedAt: true } });
  if (!contractor) return "NOT_FOUND";
  if (contractor.erasedAt) return "ALREADY_ERASED";

  await purgeCvData(contractorId, store);

  await prisma.$transaction(async (tx) => {
    await tx.session.deleteMany({ where: { contractorId } });
    await tx.confirmedProfileField.deleteMany({ where: { contractorId } });
    await tx.contractorPreferences.deleteMany({ where: { contractorId } });
    await tx.contractorProfileDetails.deleteMany({ where: { contractorId } });
    await tx.assignment.deleteMany({ where: { contractorId } });
    await tx.consentRecord.deleteMany({ where: { contractorId } });
    await tx.eligibilityDeclaration.deleteMany({ where: { contractorId } });
    await tx.confirmationEvent.deleteMany({ where: { contractorId } });
    // Phase 8 messaging records. Delivery logs hold only ids and event names; they go with their messages.
    const messageIds = (await tx.message.findMany({ where: { contractorId }, select: { id: true } })).map((m) => m.id);
    await tx.deliveryLog.deleteMany({ where: { messageId: { in: messageIds } } });
    await tx.message.deleteMany({ where: { contractorId } });
    await tx.scheduledReminder.deleteMany({ where: { contractorId } });
    await tx.confirmLink.deleteMany({ where: { contractorId } });
    await tx.campaignRecipient.deleteMany({ where: { contractorId } });
    await tx.loopMessage.deleteMany({ where: { contractorId } });
    await tx.notification.deleteMany({ where: { contractorId } });
    await tx.manualCallTask.deleteMany({ where: { contractorId } });
    await tx.contractor.update({
      where: { id: contractorId },
      data: {
        phone: `erased:${contractorId}`,
        email: null,
        firstName: null,
        lastName: null,
        employmentSituation: null,
        availableFrom: null,
        contractEndDate: null,
        lastConfirmedAt: null,
        confirmationSource: null,
        confirmationChannel: null,
        live: false,
        paused: false,
        searchSuppressed: true,
        marketingConsent: false,
        searchColour: null,
        underlyingStatus: null,
        freshnessState: null,
        unconfirmedSince: null,
        escalationStage: null,
        referralCode: null,
        erasedAt: now,
      },
    });
    // The audit table is append-only (DB trigger); this transaction-local flag permits only the before/after scrub.
    await tx.$executeRaw`SELECT set_config('loop.audit_scrub', 'on', true)`;
    await tx.auditEvent.updateMany({
      where: { OR: [{ entityId: contractorId }, { actorId: contractorId }] },
      data: { before: Prisma.DbNull, after: Prisma.DbNull },
    });
    await tx.auditEvent.create({
      data: { entityType: "Contractor", entityId: contractorId, action: "privacy.erased", after: { erasedAt: now.toISOString() } },
    });
  });
  return "ERASED";
}
