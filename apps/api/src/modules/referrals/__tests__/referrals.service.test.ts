import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  contractor: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  referral: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() },
}));
vi.mock("@loop/db", () => ({ prisma: db }));

import { ReferralsService } from "../referrals.service.js";

const audit = { record: vi.fn() };
const founding = { allocateIfEligible: vi.fn() };
const make = () => new ReferralsService(audit as never, founding as never);

describe("ReferralsService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the existing code without regenerating", async () => {
    db.contractor.findUnique.mockResolvedValue({ referralCode: "ABCD2345" });
    const link = await make().link("c1");
    expect(link.code).toBe("ABCD2345");
    expect(link.url).toContain("ref=ABCD2345");
    expect(db.contractor.update).not.toHaveBeenCalled();
  });

  it("creates a code lazily, retrying on a unique collision, and audits it", async () => {
    db.contractor.findUnique.mockResolvedValue({ referralCode: null });
    db.contractor.update.mockRejectedValueOnce({ code: "P2002" }).mockResolvedValueOnce({});
    const link = await make().link("c1");
    expect(link.code).toHaveLength(8);
    expect(db.contractor.update).toHaveBeenCalledTimes(2);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "referral.code_created" }));
  });

  it("checkCode reports validity and the referrer's first name", async () => {
    db.contractor.findUnique.mockResolvedValue({ firstName: "Sam" });
    expect(await make().checkCode("abcd2345")).toEqual({ valid: true, referrerFirstName: "Sam" });
    db.contractor.findUnique.mockResolvedValue(null);
    expect(await make().checkCode("abcd2345")).toEqual({ valid: false, referrerFirstName: null });
    expect(await make().checkCode("!!")).toEqual({ valid: false, referrerFirstName: null });
  });

  it("attributes a valid referral, audits it and checks founding eligibility", async () => {
    db.contractor.findUnique.mockResolvedValue({ id: "ref1" });
    db.referral.findUnique.mockResolvedValue(null);
    db.referral.create.mockResolvedValue({ id: "x1" });
    expect(await make().attribute("new1", "abcd2345")).toEqual({ attributed: true });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "referral.attributed" }));
    expect(founding.allocateIfEligible).toHaveBeenCalledWith("ref1");
  });

  it("ignores self-referrals, repeats and unknown codes", async () => {
    db.contractor.findUnique.mockResolvedValue({ id: "same" });
    db.referral.findUnique.mockResolvedValue(null);
    expect(await make().attribute("same", "abcd2345")).toEqual({ attributed: false });

    db.contractor.findUnique.mockResolvedValue({ id: "ref1" });
    db.referral.findUnique.mockResolvedValue({ id: "old" });
    expect(await make().attribute("new1", "abcd2345")).toEqual({ attributed: false });

    db.contractor.findUnique.mockResolvedValue(null);
    expect(await make().attribute("new1", "abcd2345")).toEqual({ attributed: false });
    expect(db.referral.create).not.toHaveBeenCalled();
  });

  it("treats a concurrent duplicate attribution as not attributed", async () => {
    db.contractor.findUnique.mockResolvedValue({ id: "ref1" });
    db.referral.findUnique.mockResolvedValue(null);
    db.referral.create.mockRejectedValue({ code: "P2002" });
    expect(await make().attribute("new1", "abcd2345")).toEqual({ attributed: false });
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("lists introductions with counted = referee is live", async () => {
    db.referral.findMany.mockResolvedValue([{ id: "x1", refereeId: "n1", createdAt: new Date("2026-10-01T00:00:00Z") }]);
    db.contractor.findMany.mockResolvedValue([{ id: "n1", firstName: "Alex", live: true }]);
    const { items } = await make().list("c1");
    expect(items[0]).toEqual({ id: "x1", refereeFirstName: "Alex", registeredAt: "2026-10-01T00:00:00.000Z", counted: true });
  });
});
