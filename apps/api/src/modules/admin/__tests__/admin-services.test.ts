import "reflect-metadata";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { lastValueFrom, of } from "rxjs";
import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

const db = vi.hoisted(() => ({
  referral: { findUnique: vi.fn(), update: vi.fn() },
  referralFlag: { updateMany: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
  contractor: { findFirst: vi.fn() },
  reward: { findMany: vi.fn(), updateMany: vi.fn() },
  staffUser: { findUnique: vi.fn(), update: vi.fn(), count: vi.fn(), create: vi.fn() },
  templateVersion: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  reminderConfigVersion: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  manualCallTask: { updateMany: vi.fn(), findUnique: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@loop/db", () => ({ prisma: db, Prisma: { PrismaClientKnownRequestError: class extends Error { code = "P2002"; } } }));

const { AdminIntroductionsService } = await import("../admin-introductions.service.js");
const { AdminStaffService } = await import("../admin-staff.service.js");
const { AdminCommsService } = await import("../admin-comms.service.js");
const { AdminContractorsService } = await import("../admin-contractors.service.js");
const { StaffAuditInterceptor } = await import("../staff-audit.interceptor.js");
const { AuditAccess } = await import("../staff-access.js");

const audit = { record: vi.fn() };
const founding = { allocateIfEligible: vi.fn() };
const staff = { id: "staff1", email: "a@loop.test", name: null, role: "ADMIN" as const, sessionId: "sess1" };
const NOW = new Date("2026-10-30T10:00:00Z");
const REASON = "Caller confirmed the introducer by phone";

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation(async (fn: (t: typeof db) => Promise<unknown>) => fn(db));
});

describe("AdminIntroductionsService.overrideIntroducer", () => {
  const svc = () => new AdminIntroductionsService(audit as never, founding as never);
  const referral = { id: "x1", referrerId: "old", refereeId: "ref", source: "LINK", lockedAt: NOW };

  beforeEach(() => {
    db.referral.findUnique.mockResolvedValue(referral);
    db.contractor.findFirst.mockResolvedValue({ id: "new" });
    db.reward.findMany.mockResolvedValue([]);
  });

  it("changes attribution, audits before and after with the reason, and re-checks Founding for the new introducer", async () => {
    await svc().overrideIntroducer("x1", { referrerId: "new", reason: REASON }, staff, NOW);
    expect(db.referral.update).toHaveBeenCalledWith({ where: { id: "x1" }, data: expect.objectContaining({ referrerId: "new", source: "ADMIN" }) });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "staff1",
        actorType: "STAFF",
        action: "admin.introducer_overridden",
        before: expect.objectContaining({ referrerId: "old" }),
        after: expect.objectContaining({ referrerId: "new", reason: REASON }),
      }),
    );
    expect(founding.allocateIfEligible).toHaveBeenCalledWith("new", NOW);
  });

  it("moves unpaid introducer rewards to the new introducer", async () => {
    db.reward.findMany.mockResolvedValue([{ id: "rw1", status: "UNDER_VERIFICATION", beneficiaryId: "old" }]);
    await svc().overrideIntroducer("x1", { referrerId: "new", reason: REASON }, staff, NOW);
    expect(db.reward.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["rw1"] } }, data: { beneficiaryId: "new" } });
  });

  it.each(["APPROVED", "PAID"])("refuses once an introducer reward is %s", async (status) => {
    db.reward.findMany.mockResolvedValue([{ id: "rw1", status, beneficiaryId: "old" }]);
    await expect(svc().overrideIntroducer("x1", { referrerId: "new", reason: REASON }, staff, NOW)).rejects.toThrow("already approved or paid");
    expect(db.referral.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("refuses no-op, self and unknown introducers", async () => {
    await expect(svc().overrideIntroducer("x1", { referrerId: "old", reason: REASON }, staff, NOW)).rejects.toThrow("already the introducer");
    await expect(svc().overrideIntroducer("x1", { referrerId: "ref", reason: REASON }, staff, NOW)).rejects.toThrow("themselves");
    db.contractor.findFirst.mockResolvedValue(null);
    await expect(svc().overrideIntroducer("x1", { referrerId: "new", reason: REASON }, staff, NOW)).rejects.toThrow("not found");
    db.referral.findUnique.mockResolvedValue(null);
    await expect(svc().overrideIntroducer("nope", { referrerId: "new", reason: REASON }, staff, NOW)).rejects.toThrow("not found");
    expect(db.referral.update).not.toHaveBeenCalled();
  });
});

describe("AdminIntroductionsService.resolveFlag", () => {
  const svc = () => new AdminIntroductionsService(audit as never, founding as never);

  it("audits the resolution and lets Founding re-check when a flag is cleared", async () => {
    db.referralFlag.updateMany.mockResolvedValue({ count: 1 });
    db.referralFlag.findUnique.mockResolvedValue({ id: "f1", referralId: "x1", reason: "SAME_DEVICE" });
    db.referral.findUnique.mockResolvedValue({ id: "x1", referrerId: "old" });
    await svc().resolveFlag("f1", { status: "CLEARED", note: REASON }, staff, NOW);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.referral_flag_resolved", after: expect.objectContaining({ status: "CLEARED" }) }));
    expect(founding.allocateIfEligible).toHaveBeenCalledWith("old", NOW);
  });

  it("does not re-check Founding when confirmed, and refuses a flag that is not open", async () => {
    db.referralFlag.updateMany.mockResolvedValue({ count: 1 });
    db.referralFlag.findUnique.mockResolvedValue({ id: "f1", referralId: "x1", reason: "SAME_DEVICE" });
    await svc().resolveFlag("f1", { status: "CONFIRMED", note: REASON }, staff, NOW);
    expect(founding.allocateIfEligible).not.toHaveBeenCalled();
    db.referralFlag.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc().resolveFlag("f1", { status: "CLEARED", note: REASON }, staff, NOW)).rejects.toThrow("not found");
  });
});

describe("AdminStaffService", () => {
  const sessions = { revokeAllFor: vi.fn() };
  const svc = () => new AdminStaffService(audit as never, sessions as never);
  const admin = { id: "a2", role: "ADMIN", active: true, name: null };

  it("will not let you demote or deactivate yourself", async () => {
    db.staffUser.findUnique.mockResolvedValue({ ...admin, id: "staff1" });
    await expect(svc().update("staff1", { role: "OPERATOR", reason: REASON }, staff)).rejects.toThrow("yourself");
    await expect(svc().update("staff1", { active: false, reason: REASON }, staff)).rejects.toThrow("yourself");
  });

  it("will not remove the last active admin", async () => {
    db.staffUser.findUnique.mockResolvedValue(admin);
    db.staffUser.count.mockResolvedValue(0);
    await expect(svc().update("a2", { active: false, reason: REASON }, staff)).rejects.toThrow("at least one active admin");
    expect(db.staffUser.update).not.toHaveBeenCalled();
  });

  it("revokes sessions when a role changes or the account is deactivated, and audits before and after", async () => {
    db.staffUser.findUnique.mockResolvedValue(admin);
    db.staffUser.count.mockResolvedValue(1);
    db.staffUser.update.mockResolvedValue({ ...admin, role: "OPERATOR", createdAt: NOW, email: "x@loop.test", totpEnrolledAt: null, lastSignInAt: null });
    await svc().update("a2", { role: "OPERATOR", reason: REASON }, staff);
    expect(sessions.revokeAllFor).toHaveBeenCalledWith("a2");
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "admin.staff_updated", before: expect.objectContaining({ role: "ADMIN" }), after: expect.objectContaining({ role: "OPERATOR", reason: REASON }) }),
    );
  });
});

describe("AdminCommsService templates", () => {
  const svc = () => new AdminCommsService(audit as never);
  const body = { subject: "Hello {{firstName}}", body: ["A line for {{firstName}}."], note: REASON };

  beforeEach(() => {
    db.templateVersion.findMany.mockResolvedValue([]);
    db.templateVersion.create.mockResolvedValue({});
  });

  it("continues version numbering from the built-in default and audits the publish", async () => {
    db.templateVersion.findFirst.mockResolvedValue(null);
    await svc().newVersion("reminder.available-now", body, staff);
    expect(db.templateVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ kind: "REMINDER_EMAIL", key: "reminder.available-now", version: 2, createdBy: "staff1" }),
    });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.template_version_published", entityId: "reminder.available-now" }));
  });

  it("rejects unknown merge fields and unknown keys", async () => {
    await expect(svc().newVersion("reminder.available-now", { ...body, body: ["Hi {{surname}}"] }, staff)).rejects.toThrow("unknown merge field");
    db.templateVersion.findFirst.mockResolvedValue(null);
    await expect(svc().newVersion("no.such.key", body, staff)).rejects.toThrow("not found");
    expect(db.templateVersion.create).not.toHaveBeenCalled();
  });

  it("creates LOOP message templates at version 1 and refuses a duplicate or bad key", async () => {
    db.templateVersion.findFirst.mockResolvedValue(null);
    db.templateVersion.findMany.mockResolvedValue([
      { key: "welcome.note", kind: "LOOP_MESSAGE", version: 1, subject: "s", body: ["b"], note: null, createdBy: "staff1", createdAt: NOW },
    ]);
    await svc().createTemplate({ kind: "LOOP_MESSAGE", key: "welcome.note", ...body }, staff);
    expect(db.templateVersion.create).toHaveBeenCalledWith({ data: expect.objectContaining({ version: 1, kind: "LOOP_MESSAGE" }) });
    await expect(svc().createTemplate({ kind: "LOOP_MESSAGE", key: "Bad Key!", ...body }, staff)).rejects.toThrow("Key must be");
    await expect(svc().createTemplate({ kind: "NOTIFICATION", key: "reminder.available-now", ...body }, staff)).rejects.toThrow("already exists");
  });

  it("refuses an invalid reminder schedule without saving", async () => {
    db.reminderConfigVersion.findFirst.mockResolvedValue(null);
    const config = {
      availableNow: { intervalDays: 7 },
      contractEnd: { promptDaysBefore: [28], onEndDate: true, followUpDaysAfter: [3] },
      inContract: { intervalDays: 30 },
      permanent: { intervalDays: 60 },
      profileReview: { intervalDays: 90 },
      cvReview: { intervalDays: 180 },
      introductions: { nudgeAfterDays: 14, progressMinGapDays: 14 },
      futureStart: { promptDaysBefore: [] },
      staleAfterDays: 3,
      escalation: { callTaskAfterDays: 14, suppressAfterDays: 7 },
    };
    await expect(svc().publishReminderConfig({ config, note: REASON }, staff)).rejects.toThrow("suppressAfterDays");
    expect(db.reminderConfigVersion.create).not.toHaveBeenCalled();
  });
});

describe("AdminContractorsService.resolveCallTask", () => {
  it("audits who resolved the task and refuses one that is not open", async () => {
    const svc = new AdminContractorsService(audit as never, {} as never, {} as never);
    db.manualCallTask.updateMany.mockResolvedValue({ count: 1 });
    db.manualCallTask.findUnique.mockResolvedValue({ id: "t1", contractorId: "c1" });
    await svc.resolveCallTask("t1", { outcome: "DONE", note: "Spoke to them" }, staff, NOW);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ actorType: "STAFF", action: "admin.call_task_resolved", after: expect.objectContaining({ status: "DONE" }) }));
    db.manualCallTask.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.resolveCallTask("t1", { outcome: "DONE" }, staff, NOW)).rejects.toThrow("not found");
  });
});

describe("StaffAuditInterceptor", () => {
  class C {
    @AuditAccess({ entityType: "Contractor", idParam: "id", action: "contractor.viewed" }) view() {}
    plain() {}
  }
  const run = (handler: "view" | "plain", req: object) => {
    const ctx = {
      getType: () => "http",
      getHandler: () => C.prototype[handler],
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
    const next: CallHandler = { handle: () => of({ data: 1 }) };
    return lastValueFrom(new StaffAuditInterceptor(new Reflector(), audit as never).intercept(ctx, next));
  };

  it("writes the audit event before returning the data, recording filter names but not values", async () => {
    const data = await run("view", { staff, params: { id: "c1" }, query: { q: "pat@example.com", live: "true" } });
    expect(data).toEqual({ data: 1 });
    expect(audit.record).toHaveBeenCalledWith({
      actorId: "staff1",
      actorType: "STAFF",
      entityType: "Contractor",
      entityId: "c1",
      action: "admin.contractor.viewed",
      after: { filters: ["live", "q"] },
    });
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain("pat@example.com");
  });

  it("fails the view if the audit write fails", async () => {
    audit.record.mockRejectedValueOnce(new Error("db down"));
    await expect(run("view", { staff, params: { id: "c1" }, query: {} })).rejects.toThrow("db down");
  });

  it("leaves unmarked handlers alone", async () => {
    await run("plain", { staff, params: {}, query: {} });
    expect(audit.record).not.toHaveBeenCalled();
  });
});
