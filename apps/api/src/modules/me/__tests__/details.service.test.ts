import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileDetailsSchema, UpdateNameRequestSchema } from "@loop/contracts";

const db = vi.hoisted(() => ({
  contractor: { findUnique: vi.fn(), update: vi.fn() },
  contractorProfileDetails: { findUnique: vi.fn(), upsert: vi.fn() },
}));
vi.mock("@loop/db", () => ({ prisma: db }));

const { DetailsService } = await import("../details.service.js");
const audit = { record: vi.fn() };
const svc = new DetailsService(audit as never);
const EMPTY = { securityClearance: null, ir35Status: null, workPattern: null };

beforeEach(() => {
  vi.clearAllMocks();
  db.contractor.findUnique.mockResolvedValue({ firstName: "Jo", lastName: "Bloggs" });
  db.contractorProfileDetails.findUnique.mockResolvedValue(null);
});

describe("ProfileDetailsSchema", () => {
  it.each([
    ["clearance not Yes/No", { securityClearance: "SC", ir35Status: null, workPattern: null }],
    ["unknown IR35", { securityClearance: null, ir35Status: "MAYBE", workPattern: null }],
    ["unknown pattern", { securityClearance: null, ir35Status: null, workPattern: "WEEKENDS" }],
    ["unknown key", { ...EMPTY, rate: 500 }],
    ["missing key", { securityClearance: null, ir35Status: null }],
  ])("rejects %s", (_n, body) => expect(ProfileDetailsSchema.safeParse(body).success).toBe(false));
});

describe("ProfileDetailsSchema summary and qualifications", () => {
  it("are optional, so older clients that do not send them still validate", () => {
    expect(ProfileDetailsSchema.safeParse(EMPTY).success).toBe(true);
  });
  it("accept text or null, trimmed, up to 2000 characters", () => {
    expect(ProfileDetailsSchema.parse({ ...EMPTY, summary: "  Test lead  ", qualifications: null })).toMatchObject({ summary: "Test lead", qualifications: null });
    expect(ProfileDetailsSchema.safeParse({ ...EMPTY, summary: "x".repeat(2001) }).success).toBe(false);
    expect(ProfileDetailsSchema.safeParse({ ...EMPTY, qualifications: "x".repeat(2001) }).success).toBe(false);
    expect(ProfileDetailsSchema.safeParse({ ...EMPTY, summary: 5 }).success).toBe(false);
  });
});

describe("UpdateNameRequestSchema", () => {
  it("uses the registration limits", () => {
    expect(UpdateNameRequestSchema.safeParse({ firstName: " ", lastName: "B" }).success).toBe(false);
    expect(UpdateNameRequestSchema.safeParse({ firstName: "x".repeat(81), lastName: "B" }).success).toBe(false);
    expect(UpdateNameRequestSchema.parse({ firstName: " Jo ", lastName: "B" })).toEqual({ firstName: "Jo", lastName: "B" });
  });
});

describe("DetailsService", () => {
  it("returns empty details before anything is saved, and ignores corrupt rows", async () => {
    expect(await svc.get("c1")).toEqual(EMPTY);
    db.contractorProfileDetails.findUnique.mockResolvedValue({ securityClearance: "??", ir35Status: null, workPattern: null });
    expect(await svc.get("c1")).toEqual(EMPTY);
  });

  it("replaces the set and audits before/after, without touching availability", async () => {
    const req = { securityClearance: "YES", ir35Status: "OUTSIDE", workPattern: "FULL_TIME" } as const;
    expect(await svc.replace("c1", req)).toEqual(req);
    expect(db.contractorProfileDetails.upsert).toHaveBeenCalledWith({ where: { contractorId: "c1" }, create: { contractorId: "c1", ...req }, update: req });
    expect(db.contractor.update).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "profile.details.updated", before: EMPTY, after: req }));
  });

  it("returns a stored summary and qualifications, and saves them with the rest", async () => {
    db.contractorProfileDetails.findUnique.mockResolvedValue({
      securityClearance: "NO",
      ir35Status: "EITHER",
      workPattern: null,
      summary: "Test lead",
      qualifications: "ISTQB Advanced",
    });
    expect(await svc.get("c1")).toEqual({ securityClearance: "NO", ir35Status: "EITHER", workPattern: null, summary: "Test lead", qualifications: "ISTQB Advanced" });

    const req = { ...EMPTY, summary: "Principal tester", qualifications: null };
    await svc.replace("c1", req);
    expect(db.contractorProfileDetails.upsert).toHaveBeenCalledWith({ where: { contractorId: "c1" }, create: { contractorId: "c1", ...req }, update: req });
  });

  it("leaves a stored summary alone when a client omits it (the preferences save does)", async () => {
    await svc.replace("c1", EMPTY);
    const call = db.contractorProfileDetails.upsert.mock.calls[0]?.[0] as { update: Record<string, unknown> };
    expect(call.update).not.toHaveProperty("summary");
    expect(call.update).not.toHaveProperty("qualifications");
  });

  it("updates the name and audits the previous one", async () => {
    await svc.updateName("c1", { firstName: "Joanne", lastName: "Bloggs" });
    expect(db.contractor.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { firstName: "Joanne", lastName: "Bloggs" } });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "profile.name.updated", before: { firstName: "Jo", lastName: "Bloggs" } }),
    );
  });

  it("404s for an unknown contractor", async () => {
    db.contractor.findUnique.mockResolvedValue(null);
    await expect(svc.replace("x", EMPTY)).rejects.toThrow("Contractor not found");
    await expect(svc.updateName("x", { firstName: "A", lastName: "B" })).rejects.toThrow("Contractor not found");
  });
});
