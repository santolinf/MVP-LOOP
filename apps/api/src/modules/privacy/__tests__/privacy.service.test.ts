import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => {
  const empty = () => vi.fn(async () => []);
  return {
    contractor: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    session: { updateMany: vi.fn() },
    contractorPreferences: { findUnique: vi.fn(async () => null) },
    contractorProfileDetails: { findUnique: vi.fn(async () => null) },
    contractorJoinProfile: { findUnique: vi.fn(async () => null) },
    confirmedProfileField: { findMany: empty() },
    assignment: { findMany: empty() },
    consentRecord: { findMany: empty() },
    confirmationEvent: { findMany: empty() },
    cvUpload: { findMany: empty() },
    cvVersion: { findMany: empty() },
    cvChange: { findMany: empty() },
    eligibilityDeclaration: { findMany: empty() },
    referral: { findMany: empty() },
    reward: { findMany: empty() },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  };
});
vi.mock("@loop/db", () => ({ prisma: db }));
vi.mock("../../../jobs/privacy-erase.job.js", () => ({
  PRIVACY_ERASE_JOB: "privacy.erase",
  PRIVACY_ERASE_SEND_OPTIONS: { retryLimit: 5 },
}));

const { PrivacyService } = await import("../privacy.service.js");
const audit = { record: vi.fn() };
const consents = { update: vi.fn(async () => ({ items: [] })) };
const jobs = { send: vi.fn(async () => undefined) };
const svc = new PrivacyService(audit as never, consents as never, jobs as never);
const NOW = new Date("2026-10-24T12:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  db.contractor.findUnique.mockResolvedValue({
    id: "c1",
    live: true,
    paused: false,
    erasureRequestedAt: null,
    email: "a@b.test",
    phone: "+447700900000",
    availableFrom: null,
    contractEndDate: null,
    lastConfirmedAt: null,
    createdAt: NOW,
  });
});

describe("PrivacyService.setPaused", () => {
  it("pauses without leaving LIVE or touching consent, and audits the change", async () => {
    expect(await svc.setPaused("c1", true)).toEqual({ status: "PAUSED" });
    expect(db.contractor.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { paused: true } });
    expect(consents.update).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "profile.paused" }));
  });

  it("is a no-op when already in that state", async () => {
    expect(await svc.setPaused("c1", false)).toEqual({ status: "ACTIVE" });
    expect(db.contractor.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});

describe("PrivacyService.withdraw", () => {
  it("withdraws visibility consent, takes the profile off LIVE and audits", async () => {
    expect(await svc.withdraw("c1", "1.2.3.4")).toEqual({ status: "WITHDRAWN" });
    expect(consents.update).toHaveBeenCalledWith("c1", { changes: [{ purpose: "PROFILE_VISIBILITY", granted: false }] }, "1.2.3.4");
    expect(db.contractor.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { live: false, paused: false } }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "profile.withdrawn" }));
  });
});

describe("PrivacyService.export", () => {
  it("returns the contractor's data without hashes or object keys, and audits the export", async () => {
    const out = await svc.export("c1", NOW);
    expect(out.exportedAt).toBe(NOW.toISOString());
    expect(out.data.account).toMatchObject({ email: "a@b.test", phone: "+447700900000" });
    expect(Object.keys(out.data)).toEqual(
      expect.arrayContaining(["preferences", "details", "profileFields", "assignments", "consents", "cvVersions", "referrals", "rewards"]),
    );
    expect(JSON.stringify(out)).not.toMatch(/objectKey|quarantineKey|ipHash/);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "privacy.exported" }));
  });
});

describe("PrivacyService.requestErasure", () => {
  it("takes the account off LIVE, signs it out everywhere and queues one job", async () => {
    expect(await svc.requestErasure("c1", NOW)).toEqual({ status: "ERASURE_REQUESTED" });
    expect(db.contractor.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { erasureRequestedAt: NOW, live: false, searchSuppressed: true } });
    expect(db.session.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { contractorId: "c1", revokedAt: null } }));
    expect(jobs.send).toHaveBeenCalledWith("privacy.erase", { contractorId: "c1" }, expect.objectContaining({ singletonKey: "c1" }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "privacy.erasure_requested" }));
  });

  it("re-queues on repeat without marking or auditing twice", async () => {
    db.contractor.findUnique.mockResolvedValue({ id: "c1", live: false, erasureRequestedAt: NOW });
    await svc.requestErasure("c1", NOW);
    expect(db.contractor.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    expect(jobs.send).toHaveBeenCalledOnce();
  });

  it("surfaces an enqueue failure so the request can be retried", async () => {
    jobs.send.mockRejectedValueOnce(new Error("queue down"));
    await expect(svc.requestErasure("c1", NOW)).rejects.toThrow("queue down");
  });
});
