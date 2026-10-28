import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  contractor: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  referral: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  referralFlag: { findMany: vi.fn(), createMany: vi.fn() },
}));
vi.mock("@loop/db", () => ({ prisma: db }));

import { ConflictException } from "@nestjs/common";
import { RateLimitedException } from "../../../common/rate-limit.js";
import { LOOKUP_LIMIT_PER_ACCOUNT, ReferralsService } from "../referrals.service.js";

const audit = { record: vi.fn() };
const founding = { allocateIfEligible: vi.fn() };
const limiter = { hit: vi.fn() };
const make = () => new ReferralsService(audit as never, founding as never, limiter as never);

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

  it("attributes a valid referral and audits it; founding waits for the lock", async () => {
    db.contractor.findUnique.mockResolvedValue({ id: "ref1" });
    db.referral.findUnique.mockResolvedValue(null);
    db.referral.create.mockResolvedValue({ id: "x1" });
    expect(await make().attribute("new1", "abcd2345", { source: "LINK", deviceId: "d1", ip: "1.2.3.4", userAgent: "UA" })).toEqual({
      attributed: true,
    });
    const data = db.referral.create.mock.calls[0]?.[0].data;
    expect(data).toMatchObject({ referrerId: "ref1", refereeId: "new1", codeUsed: "ABCD2345" });
    // Evidence is stored hashed, never raw.
    expect(data.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(data.userAgentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(data)).not.toContain("1.2.3.4");
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "referral.attributed" }));
    expect(founding.allocateIfEligible).not.toHaveBeenCalled();
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

  it("lists introductions: counted only when locked and unflagged, with the lifetime count", async () => {
    const t = new Date("2026-10-01T00:00:00Z");
    db.referral.findMany.mockResolvedValue([
      { id: "x1", refereeId: "n1", createdAt: t, lockedAt: t },
      { id: "x2", refereeId: "n2", createdAt: t, lockedAt: null },
      { id: "x3", refereeId: "n3", createdAt: t, lockedAt: t },
    ]);
    db.contractor.findMany.mockResolvedValue([{ id: "n1", firstName: "Alex" }]);
    db.referralFlag.findMany.mockResolvedValue([{ referralId: "x3", status: "OPEN" }]);
    const list = await make().list("c1");
    expect(list.items.map((i) => [i.counted, i.underReview])).toEqual([[true, false], [false, false], [false, true]]);
    expect(list.items[0]).toMatchObject({ refereeFirstName: "Alex" });
    expect(list.lifetimeCount).toBe(1);
    expect(list.milestoneReached).toBe(false);
  });

  it("keeps counting past five: the milestone is not a cap", async () => {
    const t = new Date("2026-10-01T00:00:00Z");
    db.referral.findMany.mockResolvedValue(Array.from({ length: 7 }, (_, i) => ({ id: `x${i}`, refereeId: `n${i}`, createdAt: t, lockedAt: t })));
    db.contractor.findMany.mockResolvedValue([]);
    db.referralFlag.findMany.mockResolvedValue([]);
    const list = await make().list("c1");
    expect(list.lifetimeCount).toBe(7);
    expect(list.milestoneReached).toBe(true);
  });

  describe("lookupMember", () => {
    it("returns a masked confirmation and the code on an exact match", async () => {
      limiter.hit.mockResolvedValue(1);
      db.contractor.findFirst.mockResolvedValue({ id: "m1", firstName: "Sam", lastName: "Jones" });
      db.contractor.findUnique.mockResolvedValue({ referralCode: "ABCD2345" });
      expect(await make().lookupMember("me", "sam@example.com", "1.2.3.4")).toEqual({ found: true, maskedName: "S*** J.", code: "ABCD2345" });
    });

    it("reveals nothing on a miss and never matches the requester", async () => {
      limiter.hit.mockResolvedValue(1);
      db.contractor.findFirst.mockResolvedValue(null);
      expect(await make().lookupMember("me", "none@example.com")).toEqual({ found: false, maskedName: null, code: null });
      expect(db.contractor.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: { not: "me" } }) }));
    });

    it("is rate limited per account", async () => {
      limiter.hit.mockResolvedValue(LOOKUP_LIMIT_PER_ACCOUNT + 1);
      await expect(make().lookupMember("me", "sam@example.com")).rejects.toBeInstanceOf(RateLimitedException);
      expect(db.contractor.findFirst).not.toHaveBeenCalled();
    });
  });

  describe("setIntroducer", () => {
    it("lets the registrant correct the introducer before it is locked, and audits the change", async () => {
      db.contractor.findUnique.mockResolvedValue({ id: "ref2" });
      db.referral.findUnique.mockResolvedValue({ id: "x1", referrerId: "ref1", lockedAt: null });
      db.referral.update.mockResolvedValue({ id: "x1" });
      expect(await make().setIntroducer("new1", "abcd2345", { source: "VERBAL" })).toEqual({ attributed: true });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "referral.introducer_changed", before: { referrerId: "ref1" } }),
      );
    });

    it("refuses to change a locked introducer", async () => {
      db.contractor.findUnique.mockResolvedValue({ id: "ref2" });
      db.referral.findUnique.mockResolvedValue({ id: "x1", referrerId: "ref1", lockedAt: new Date() });
      await expect(make().setIntroducer("new1", "abcd2345", { source: "CODE" })).rejects.toBeInstanceOf(ConflictException);
      expect(db.referral.update).not.toHaveBeenCalled();
    });

    it("rejects self-referral", async () => {
      db.contractor.findUnique.mockResolvedValue({ id: "new1" });
      db.referral.findUnique.mockResolvedValue(null);
      expect(await make().setIntroducer("new1", "abcd2345", { source: "CODE" })).toEqual({ attributed: false });
      expect(db.referral.create).not.toHaveBeenCalled();
    });
  });

  describe("lockOnRegistration", () => {
    const row = { id: "x1", referrerId: "ref1", refereeId: "new1", lockedAt: null, deviceHash: "d" };
    beforeEach(() => {
      db.referral.findUnique.mockResolvedValue(row);
      db.referral.updateMany.mockResolvedValue({ count: 1 });
      db.referral.findMany.mockResolvedValue([{ id: "x1", deviceHash: "d" }]);
      db.contractor.findMany.mockResolvedValue([
        { id: "ref1", email: "a@example.com" },
        { id: "new1", email: "b@example.com" },
      ]);
    });

    it("locks attribution, audits it and re-checks the introducer for Founding", async () => {
      await make().lockOnRegistration("new1");
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "referral.locked" }));
      expect(founding.allocateIfEligible).toHaveBeenCalledWith("ref1", expect.any(Date));
      expect(db.referralFlag.createMany).not.toHaveBeenCalled();
    });

    it("flags same-device clusters for review rather than silently counting them", async () => {
      db.referral.findMany.mockResolvedValue([{ id: "x1", deviceHash: "d" }, { id: "x2", deviceHash: "d" }]);
      db.referralFlag.createMany.mockResolvedValue({ count: 2 });
      await make().lockOnRegistration("new1");
      expect(db.referralFlag.createMany).toHaveBeenCalledWith({
        data: [{ referralId: "x1", reason: "SAME_DEVICE" }, { referralId: "x2", reason: "SAME_DEVICE" }],
        skipDuplicates: true,
      });
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "referral.flagged" }));
    });

    it("flags a referee whose email is an alias of the introducer email", async () => {
      db.contractor.findMany.mockResolvedValue([
        { id: "ref1", email: "sam.jones@gmail.com" },
        { id: "new1", email: "samjones+loop@gmail.com" },
      ]);
      db.referralFlag.createMany.mockResolvedValue({ count: 1 });
      await make().lockOnRegistration("new1");
      expect(db.referralFlag.createMany).toHaveBeenCalledWith({
        data: [{ referralId: "x1", reason: "SELF_IDENTITY" }],
        skipDuplicates: true,
      });
    });

    it("does nothing without an introducer, and does not re-lock an already locked one", async () => {
      db.referral.findUnique.mockResolvedValue(null);
      await make().lockOnRegistration("new1");
      expect(founding.allocateIfEligible).not.toHaveBeenCalled();

      db.referral.findUnique.mockResolvedValue({ ...row, lockedAt: new Date() });
      await make().lockOnRegistration("new1");
      expect(db.referral.updateMany).not.toHaveBeenCalled();
    });
  });
});
