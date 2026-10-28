import { beforeEach, describe, expect, it, vi } from "vitest";
import { AssignmentInputSchema } from "@loop/contracts";

const db = vi.hoisted(() => ({
  assignment: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));
vi.mock("@loop/db", () => ({ prisma: db }));

const { AssignmentsService } = await import("../assignments.service.js");
const audit = { record: vi.fn() };
const svc = new AssignmentsService(audit as never);
const NOW = new Date("2026-10-24T12:00:00Z");

const input = {
  clientName: "Acme",
  supplyingCompany: "Agency Ltd",
  role: "Platform Engineer",
  startDate: "2026-01-05",
  endDate: null,
  assignmentRef: "A-1",
};
const row = (over: Record<string, unknown> = {}) => ({
  id: "a1",
  contractorId: "c1",
  clientName: "Acme",
  supplyingCompany: "Agency Ltd",
  role: "Platform Engineer",
  startDate: new Date("2026-01-05T00:00:00Z"),
  endDate: null,
  assignmentRef: "A-1",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.assignment.create.mockResolvedValue(row());
  db.assignment.update.mockResolvedValue(row({ role: "Lead" }));
  db.assignment.findFirst.mockResolvedValue(row());
});

describe("AssignmentInputSchema", () => {
  it.each([
    ["blank client", { ...input, clientName: " " }],
    ["blank role", { ...input, role: "" }],
    ["bad date", { ...input, startDate: "05/01/2026" }],
    ["unknown key", { ...input, extra: 1 }],
    ["missing endDate", { clientName: "A", supplyingCompany: null, role: "R", startDate: "2026-01-01", assignmentRef: null }],
  ])("rejects %s", (_n, body) => expect(AssignmentInputSchema.safeParse(body).success).toBe(false));
});

describe("AssignmentsService", () => {
  it("creates an ongoing assignment as the contractor and audits it", async () => {
    const out = await svc.create("c1", input, NOW);
    expect(out).toEqual({ id: "a1", ...input });
    expect(db.assignment.create.mock.calls[0]?.[0].data).toMatchObject({ contractorId: "c1", endDate: null });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "assignment.created", entityId: "a1" }));
  });

  it.each([
    ["end before start", { ...input, endDate: "2026-01-01" }, "endDate"],
    ["future start", { ...input, startDate: "2027-01-01" }, "startDate"],
  ])("rejects %s", async (_n, body, field) => {
    await expect(svc.create("c1", body, NOW)).rejects.toThrow(field);
    expect(db.assignment.create).not.toHaveBeenCalled();
  });

  it("updates with before/after and refuses someone else's row", async () => {
    await svc.update("c1", "a1", { ...input, role: "Lead" }, NOW);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "assignment.updated",
        before: expect.objectContaining({ role: "Platform Engineer" }),
        after: expect.objectContaining({ role: "Lead" }),
      }),
    );
    db.assignment.findFirst.mockResolvedValue(null);
    await expect(svc.update("c2", "a1", input, NOW)).rejects.toThrow("Assignment not found");
    await expect(svc.remove("c2", "a1")).rejects.toThrow("Assignment not found");
    expect(db.assignment.findFirst).toHaveBeenLastCalledWith({ where: { id: "a1", contractorId: "c2" } });
  });

  it("deletes and audits the removed row", async () => {
    await svc.remove("c1", "a1");
    expect(db.assignment.delete).toHaveBeenCalledWith({ where: { id: "a1" } });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "assignment.deleted", before: expect.objectContaining({ clientName: "Acme" }) }),
    );
  });

  it("lists as date-only strings", async () => {
    db.assignment.findMany.mockResolvedValue([row({ endDate: new Date("2026-06-30T00:00:00Z") })]);
    expect((await svc.list("c1")).items[0]).toMatchObject({ startDate: "2026-01-05", endDate: "2026-06-30" });
  });
});
