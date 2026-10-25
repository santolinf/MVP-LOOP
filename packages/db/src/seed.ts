import { prisma } from "./client.js";

// payouts.live, agency.access and profit_sharing stay disabled in every seed.
const FLAGS = ["payouts.live", "agency.access", "profit_sharing.live"];
// New in the change plan; both default off.
const NEW_FLAGS = ["freshness.visibilityEffects", "reminders.paused", "auth.attestation", "founding.require_app_signin"];

// TODO(spec): Q3 thresholds and plan 3.3 reminder defaults; editable at runtime.
const CONFIG: Record<string, object> = {
  // TODO(spec): default email OTP limits; editable at runtime.
  "auth.otp": { codeLength: 6, ttlMinutes: 10, maxAttempts: 5, resendCooldownSeconds: 60, maxSendsPerHourPerEmail: 5, maxSendsPerHourPerIp: 20 },
  "freshness.thresholds.AVAILABLE_NOW": { currentDays: 7, needsConfirmationDays: 14 },
  "freshness.thresholds.ENDING_SOON": { currentDays: 14, needsConfirmationDays: 28 },
  "freshness.thresholds.IN_CONTRACT": { currentDays: 30, needsConfirmationDays: 60 },
  "freshness.thresholds.PERMANENT": { currentDays: 60, needsConfirmationDays: 120 },
  "reminders.defaults": {
    availableNow: { intervalDays: 7 },
    contractEnd: { promptDaysBefore: [28, 14, 7], onEndDate: true, followUpDaysAfter: [3, 7] },
    inContract: { intervalDays: 30 },
    permanent: { intervalDays: 60 },
    profileReview: { intervalDays: 90 },
    cvReview: { intervalDays: 180 },
    introductions: { nudgeAfterDays: 14, progressMinGapDays: 14 },
    futureStart: { promptDaysBefore: [] },
  },
};

/**
 * Phase 10: the first admin. Set ADMIN_BOOTSTRAP_EMAIL to create or re-activate one (any environment); the person then
 * signs in with an emailed code and enrols an authenticator. Development gets a default so the portal is reachable.
 */
async function seedBootstrapAdmin() {
  const email = (process.env.ADMIN_BOOTSTRAP_EMAIL ?? (process.env.NODE_ENV === "production" ? "" : "admin@loop.local")).trim().toLowerCase();
  if (!email) return;
  await prisma.staffUser.upsert({
    where: { email },
    update: { active: true, role: "ADMIN" },
    create: { email, name: "Bootstrap admin", role: "ADMIN" },
  });
}

async function main() {
  for (const key of [...FLAGS, ...NEW_FLAGS]) {
    await prisma.featureFlag.upsert({ where: { key }, update: {}, create: { key, enabled: false } });
  }
  for (const [key, value] of Object.entries(CONFIG)) {
    await prisma.reminderConfig.upsert({ where: { key }, update: {}, create: { key, value } });
  }
  await seedBootstrapAdmin();
  await prisma.foundingCounter.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  await prisma.contractor.upsert({
    where: { phone: "+447700900001" },
    update: {},
    create: { phone: "+447700900001", firstName: "Test", lastName: "Contractor", employmentSituation: "CONTRACTING" },
  });
}

main().finally(() => prisma.$disconnect());
