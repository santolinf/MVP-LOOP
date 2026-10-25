import { beforeEach, describe, expect, it, vi } from "vitest";
import { ManualProfileSchema } from "@loop/contracts";

const tx = vi.hoisted(() => ({ confirmedProfileField: { deleteMany: vi.fn(), createMany: vi.fn() } }));
const db = vi.hoisted(() => ({
  contractor: { findUnique: vi.fn() },
  confirmedProfileField: { findMany: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@loop/db", () => ({ prisma: db }));

import { ProfileService } from "../profile.service.js";

const audit = { record: vi.fn() };
const svc = new ProfileService(audit as never);

beforeEach(() => {
  vi.clearAllMocks();
  db.contractor.findUnique.mockResolvedValue({ id: "c1" });
  db.confirmedProfileField.findMany.mockResolvedValue([]);
  db.$transaction.mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx));
});

describe("ManualProfileSchema", () => {
  it.each([
    ["blank headline", { headline: "  ", skills: [] }],
    ["headline too long", { headline: "x".repeat(201), skills: [] }],
    ["blank skill", { headline: null, skills: [" "] }],
    ["too many skills", { headline: null, skills: Array.from({ length: 21 }, (_, i) => `s${i}`) }],
    ["unknown key", { headline: null, skills: [], extra: 1 }],
  ])("rejects %s", (_n, body) => expect(ManualProfileSchema.safeParse(body).success).toBe(false));
  it("trims and accepts a valid set", () =>
    expect(ManualProfileSchema.parse({ headline: " Platform engineer ", skills: [" Go "] })).toEqual({ headline: "Platform engineer", skills: ["Go"] }));
});

describe("ProfileService", () => {
  it("replaces rows under the contractor's own pseudo run and audits before/after", async () => {
    const out = await svc.replace("c1", { headline: "Platform engineer", skills: ["Go", "Go", "Kubernetes"] });
    expect(out).toEqual({ headline: "Platform engineer", skills: ["Go", "Kubernetes"] });
    expect(tx.confirmedProfileField.deleteMany).toHaveBeenCalledWith({ where: { contractorId: "c1", extractionRunId: "manual:c1" } });
    expect(tx.confirmedProfileField.createMany).toHaveBeenCalledWith({
      data: [
        { fieldId: "headline", key: "headline", value: "Platform engineer", contractorId: "c1", extractionRunId: "manual:c1", edited: true },
        { fieldId: "skill-01", key: "skill", value: "Go", contractorId: "c1", extractionRunId: "manual:c1", edited: true },
        { fieldId: "skill-02", key: "skill", value: "Kubernetes", contractorId: "c1", extractionRunId: "manual:c1", edited: true },
      ],
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "profile.manual.updated", before: { headline: null, skills: [] } }),
    );
  });

  it("clearing everything deletes rows and inserts none", async () => {
    await svc.replace("c1", { headline: null, skills: [] });
    expect(tx.confirmedProfileField.deleteMany).toHaveBeenCalled();
    expect(tx.confirmedProfileField.createMany).not.toHaveBeenCalled();
  });

  it("reads back what was typed", async () => {
    db.confirmedProfileField.findMany.mockResolvedValue([
      { key: "headline", value: "Platform engineer", fieldId: "headline" },
      { key: "skill", value: "Go", fieldId: "skill-01" },
    ]);
    expect(await svc.get("c1")).toEqual({ headline: "Platform engineer", skills: ["Go"] });
  });
});
