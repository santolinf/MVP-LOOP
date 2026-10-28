import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  assignment: { findFirst: vi.fn() },
  reward: { count: vi.fn(), createMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  referral: { findUnique: vi.fn() },
  referralFlag: { findMany: vi.fn() },
  featureFlag: { findUnique: vi.fn() },
  reminderConfig: { findUnique: vi.fn() },
}));
vi.mock("@loop/db", () => ({ prisma: db }));

import { ForbiddenException, UnprocessableEntityException } from "@nestjs/common";
import { RewardsService } from "../rewards.service.js";

const audit = { record: vi.fn() };
const svc = () => new RewardsService(audit as never);
const NOW = new Date("2026-10-29T10:00:00Z");

describe("RewardsService.openForPlacement", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    db.assignment.findFirst.mockResolvedValue({ id: "a1", supplyingCompany: "Acme Recruit" });
    db.reward.count.mockResolvedValue(0);
    db.reward.createMany.mockResolvedValue({ count: 2 });
    db.referral.findUnique.mockResolvedValue({ id: "x1", referrerId: "intro1", lockedAt: NOW });
    db.referralFlag.findMany.mockResolvedValue([]);
  });

  const input = { contractorId: "c1", assignmentId: "a1", isRadar: false, actorId: "admin1" };

  it("opens one £50 reward for the contractor and one for the locked introducer", async () => {
    expect(await svc().openForPlacement(input)).toEqual({ created: 2 });
    const { data, skipDuplicates } = db.reward.createMany.mock.calls[0]?.[0] as { data: Array<Record<string, unknown>>; skipDuplicates: boolean };
    expect(skipDuplicates).toBe(true);
    expect(data.map((r) => [r.type, r.beneficiaryId, r.qualifyingContractorId, r.amountPence])).toEqual([
      ["CONTRACTOR_PLACEMENT", "c1", "c1", 5000],
      ["INTRODUCER_PLACEMENT", "intro1", "c1", 5000],
    ]);
    expect(data[0]).toMatchObject({ assignmentId: "a1", supplyingCompany: "Acme Recruit" });
    expect(audit.record).toHaveBeenCalledTimes(2);
  });

  it("gives the introducer nothing when attribution is unlocked or under review", async () => {
    db.referral.findUnique.mockResolvedValue({ id: "x1", referrerId: "intro1", lockedAt: null });
    await svc().openForPlacement(input);
    expect((db.reward.createMany.mock.calls[0]?.[0] as { data: unknown[] }).data).toHaveLength(1);

    db.reward.createMany.mockClear();
    db.referral.findUnique.mockResolvedValue({ id: "x1", referrerId: "intro1", lockedAt: NOW });
    db.referralFlag.findMany.mockResolvedValue([{ status: "OPEN" }]);
    await svc().openForPlacement(input);
    expect((db.reward.createMany.mock.calls[0]?.[0] as { data: unknown[] }).data).toHaveLength(1);
  });

  it("creates nothing for Radar contracts or a repeat placement", async () => {
    expect(await svc().openForPlacement({ ...input, isRadar: true })).toEqual({ created: 0 });
    db.reward.count.mockResolvedValueOnce(1);
    expect(await svc().openForPlacement(input)).toEqual({ created: 0 });
    expect(db.reward.createMany).not.toHaveBeenCalled();
  });
});

describe("RewardsService lifecycle", () => {
  beforeEach(() => vi.resetAllMocks());

  it("approves only with agency verification and three whole months of service", async () => {
    db.reward.findUnique.mockResolvedValue({
      id: "r1",
      status: "UNDER_VERIFICATION",
      agencyVerifiedAt: NOW,
      serviceStart: new Date("2026-01-05"),
      serviceEnd: new Date("2026-04-05"),
    });
    db.reward.update.mockResolvedValue({ id: "r1", status: "APPROVED" });
    await svc().approve("r1", "admin1", NOW);
    expect(db.reward.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "APPROVED", approvedBy: "admin1" }) }),
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "reward.approved" }));
  });

  it.each([
    ["no agency verification", { agencyVerifiedAt: null, serviceStart: new Date("2026-01-05"), serviceEnd: new Date("2026-06-05") }],
    ["under three months", { agencyVerifiedAt: NOW, serviceStart: new Date("2026-01-05"), serviceEnd: new Date("2026-03-20") }],
    ["no service dates", { agencyVerifiedAt: NOW, serviceStart: null, serviceEnd: null }],
  ])("refuses approval: %s (B7)", async (_n, over) => {
    db.reward.findUnique.mockResolvedValue({ id: "r1", status: "UNDER_VERIFICATION", ...over });
    await expect(svc().approve("r1", "admin1", NOW)).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(db.reward.update).not.toHaveBeenCalled();
  });

  it("refuses approval by the person who recorded the evidence (four-eyes)", async () => {
    const verified = {
      id: "r1",
      status: "UNDER_VERIFICATION",
      amountPence: 5000,
      agencyVerifiedAt: NOW,
      serviceStart: new Date("2026-01-05"),
      serviceEnd: new Date("2026-04-05"),
      verificationRecordedBy: "admin1",
    };
    db.reward.findUnique.mockResolvedValue(verified);
    await expect(svc().approve("r1", "admin1", NOW)).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.reward.update).not.toHaveBeenCalled();

    db.reminderConfig.findUnique.mockResolvedValue({ value: { fourEyesThresholdPence: 5000 } });
    db.reward.update.mockResolvedValue({ id: "r1", status: "APPROVED" });
    await svc().approve("r1", "admin1", NOW); // amount is not above the threshold

    db.reminderConfig.findUnique.mockResolvedValue(null);
    await svc().approve("r1", "admin2", NOW); // a different person
    expect(db.reward.update).toHaveBeenCalledTimes(2);
  });

  it("will not skip a status", async () => {
    db.reward.findUnique.mockResolvedValue({ id: "r1", status: "PENDING" });
    await expect(svc().approve("r1", "admin1", NOW)).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it("records agency verification and moves to under verification", async () => {
    db.reward.findUnique.mockResolvedValue({ id: "r1", status: "PENDING" });
    db.reward.update.mockResolvedValue({ id: "r1", status: "UNDER_VERIFICATION" });
    await svc().recordAgencyVerification(
      "r1",
      { serviceStart: new Date("2026-01-05"), serviceEnd: new Date("2026-04-05"), evidence: { ref: "AG-1" } },
      "admin1",
      NOW,
    );
    expect(db.reward.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "UNDER_VERIFICATION", agencyVerifiedAt: NOW, verificationRecordedBy: "admin1" }),
      }),
    );
  });

  it("keeps payment off unless payouts.live is enabled", async () => {
    db.featureFlag.findUnique.mockResolvedValue({ enabled: false });
    await expect(svc().markPaid("r1", "admin1", NOW)).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.reward.update).not.toHaveBeenCalled();

    db.featureFlag.findUnique.mockResolvedValue(null);
    await expect(svc().markPaid("r1", "admin1", NOW)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("marks an approved reward paid once payouts are live", async () => {
    db.featureFlag.findUnique.mockResolvedValue({ enabled: true });
    db.reward.findUnique.mockResolvedValue({ id: "r1", status: "APPROVED" });
    db.reward.update.mockResolvedValue({ id: "r1", status: "PAID" });
    await svc().markPaid("r1", "admin1", NOW);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "reward.paid" }));
  });
});
