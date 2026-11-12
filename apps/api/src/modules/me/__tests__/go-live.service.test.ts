import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  contractor: { findUnique: vi.fn(), updateMany: vi.fn() },
  confirmedProfileField: { findMany: vi.fn() },
  eligibilityDeclaration: { count: vi.fn() },
}));
vi.mock("@loop/db", () => ({ prisma: db }));

import type { ConsentPurpose } from "@loop/domain";
import { GoLiveService } from "../go-live.service.js";

const audit = { record: vi.fn() };
const consents = { active: vi.fn(), list: vi.fn() };
const me = { get: vi.fn() };
const prefs = { get: vi.fn() };
const referrals = { lockOnRegistration: vi.fn() };
const profile = { get: vi.fn() };
const details = { get: vi.fn() };
const joinProfile = { get: vi.fn() };
const svc = new GoLiveService(
  audit as never,
  consents as never,
  me as never,
  prefs as never,
  referrals as never,
  profile as never,
  details as never,
  joinProfile as never,
);
const now = new Date("2026-10-26T10:00:00Z");

const contractor = {
  id: "c1",
  firstName: "Ada",
  lastName: "Lovelace",
  live: false,
  employmentSituation: "BETWEEN_CONTRACTS",
  lastConfirmedAt: now,
  availableFrom: null,
};
const availability = { colour: "LIME", label: "Available now", lastConfirmedAt: now.toISOString(), underlyingStatus: "AVAILABLE_NOW", freshnessState: "CURRENT" };
const both: ConsentPurpose[] = ["PROFILE_VISIBILITY", "OPERATIONAL_EMAIL"];

const baseJoin = {
  title: "Platform engineer",
  location: "Edinburgh",
  locationConfirmed: true,
  targetDayRatePence: 60000,
  minDayRatePence: 50000,
  usesUmbrella: false,
  umbrellaProvider: null,
  workLocations: ["SCOTLAND"],
  otherLocations: null,
  otherPlaces: [],
  workLocationsConfirmed: true,
  workPatterns: ["REMOTE"],
};

function ready(over: { c?: object; fields?: object[]; elig?: number; active?: ConsentPurpose[]; skills?: string[]; join?: object; ir35?: string | null } = {}) {
  db.contractor.findUnique.mockResolvedValue({ ...contractor, ...over.c });
  db.confirmedProfileField.findMany.mockResolvedValue(over.fields ?? [{ key: "headline", value: "Platform engineer" }]);
  db.eligibilityDeclaration.count.mockResolvedValue(over.elig ?? 1);
  consents.active.mockResolvedValue(new Set(over.active ?? both));
  if (over.skills) profile.get.mockResolvedValue({ headline: "Platform engineer", skills: over.skills });
  if (over.join) joinProfile.get.mockResolvedValue({ ...baseJoin, ...over.join });
  if (over.ir35 !== undefined) details.get.mockResolvedValue({ securityClearance: "NO", ir35Status: over.ir35, workPattern: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  db.contractor.updateMany.mockResolvedValue({ count: 1 });
  consents.list.mockResolvedValue({ items: [] });
  me.get.mockResolvedValue({ id: "c1", live: true, availability });
  profile.get.mockResolvedValue({ headline: "Platform engineer", skills: ["a", "b", "c", "d", "e"] });
  details.get.mockResolvedValue({ securityClearance: "NO", ir35Status: "OUTSIDE", workPattern: null });
  joinProfile.get.mockResolvedValue(baseJoin);
  prefs.get.mockResolvedValue({ workTypes: [], rateBand: null, remote: null, regions: [], sectors: [], noticePeriod: null });
});

describe("goLive", () => {
  it("sets live, audits it and returns the computed status", async () => {
    ready();
    const out = await svc.goLive("c1", now);
    expect(db.contractor.updateMany).toHaveBeenCalledWith({ where: { id: "c1", live: false }, data: { live: true } });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "golive.activated", before: { live: false }, after: { live: true } }));
    expect(out.me.availability.colour).toBe("LIME");
  });

  it.each<[string, Parameters<typeof ready>[0], string]>([
    ["no visibility consent", { active: ["OPERATIONAL_EMAIL"] }, "CONSENT_PROFILE_VISIBILITY"],
    ["no operational consent", { active: ["PROFILE_VISIBILITY"] }, "CONSENT_OPERATIONAL_EMAIL"],
    ["no eligibility", { elig: 0 }, "ELIGIBILITY_MISSING"],
    ["fewer than five skills", { skills: ["a", "b"] }, "PROFILE_INCOMPLETE"],
    ["no day rate", { join: { targetDayRatePence: null } }, "PREFERENCES_INCOMPLETE"],
    ["no IR35 answer", { ir35: null }, "PREFERENCES_INCOMPLETE"],
    ["availability never confirmed", { c: { lastConfirmedAt: null } }, "AVAILABILITY_NOT_CONFIRMED"],
    ["no employment situation", { c: { employmentSituation: null } }, "AVAILABILITY_NOT_CONFIRMED"],
    ["no name", { c: { lastName: null } }, "NAME_MISSING"],
    ["no confirmed headline or skill", { fields: [{ key: "summary", value: "x" }] }, "PROFILE_FIELD_MISSING"],
  ])("refuses with 422 and does not set live: %s", async (_n, over, blocker) => {
    ready(over);
    await expect(svc.goLive("c1", now)).rejects.toThrow(blocker);
    expect(db.contractor.updateMany).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("is a no-op when already LIVE", async () => {
    ready({ c: { live: true } });
    await svc.goLive("c1", now);
    expect(db.contractor.updateMany).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("audits once when a parallel request already flipped live", async () => {
    ready();
    db.contractor.updateMany.mockResolvedValue({ count: 0 });
    await svc.goLive("c1", now);
    expect(audit.record).not.toHaveBeenCalled();
  });
});

describe("review", () => {
  it("shows exactly the visible data, what is hidden, and the domain's readiness", async () => {
    ready({ fields: [{ key: "skill", value: "Kubernetes" }, { key: "headline", value: "Platform engineer" }] });
    const r = await svc.review("c1", now);
    expect(r.visible.name).toBe("Ada Lovelace");
    expect(r.visible.profile).toEqual([
      { key: "skill", label: "Skill", value: "Kubernetes" },
      { key: "headline", label: "Headline", value: "Platform engineer" },
    ]);
    expect(r.hidden).toEqual(expect.arrayContaining(["Email address", "Mobile number"]));
    expect(JSON.stringify(r.visible)).not.toMatch(/@|07\d{9}/);
    expect(r).toMatchObject({ canGoLive: true, blockers: [], live: false });
  });

  it("lists blockers when not ready", async () => {
    ready({ active: [], elig: 0 });
    const r = await svc.review("c1", now);
    expect(r.canGoLive).toBe(false);
    expect(r.blockers).toEqual(["ELIGIBILITY_MISSING", "CONSENT_PROFILE_VISIBILITY", "CONSENT_OPERATIONAL_EMAIL"]);
  });
});
