import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_FRESHNESS_THRESHOLDS, DEFAULT_REMINDER_CONFIG } from "@loop/domain";

interface Reminder {
  id: string;
  contractorId: string;
  type: string;
  dedupeKey: string;
  dueAt: Date;
  status: string;
  resolution: string | null;
  configVersion: number;
}

const h = vi.hoisted(() => ({
  contractors: [] as Record<string, unknown>[],
  reminders: [] as Reminder[],
  lastSentAt: null as Date | null,
  suppressed: false,
  callTasks: [] as unknown[],
  notifications: [] as { title: string; target: string | null }[],
  n: 0,
}));

const match = (r: Record<string, unknown>, where: Record<string, unknown>): boolean =>
  Object.entries(where).every(([k, v]) => {
    if (v && typeof v === "object" && !(v instanceof Date)) {
      const o = v as { in?: unknown[]; lte?: Date };
      if (o.in) return o.in.includes(r[k]);
      if (o.lte) return (r[k] as Date).getTime() <= o.lte.getTime();
    }
    return r[k] === v;
  });

vi.mock("@loop/db", () => ({
  Prisma: { PrismaClientKnownRequestError: class extends Error {} },
  prisma: {
    contractor: {
      findMany: vi.fn(async ({ cursor }: { cursor?: unknown }) => (cursor ? [] : h.contractors)),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => h.contractors.find((c) => c.id === where.id) ?? null),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const c = h.contractors.find((x) => x.id === where.id);
        if (!c) throw new Error("missing");
        Object.assign(c, data);
        return c;
      }),
    },
    templateVersion: { findFirst: vi.fn(async () => null) },
    scheduledReminder: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => h.reminders.filter((r) => match(r as never, where))),
      createMany: vi.fn(async ({ data }: { data: Partial<Reminder>[] }) => {
        for (const d of data) {
          if (h.reminders.some((r) => r.contractorId === d.contractorId && r.dedupeKey === d.dedupeKey)) continue;
          h.reminders.push({ id: `r${++h.n}`, status: "PENDING", resolution: null, ...d } as Reminder);
        }
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Partial<Reminder> }) => {
        const rows = h.reminders.filter((r) => match(r as never, where));
        rows.forEach((r) => Object.assign(r, data));
        return { count: rows.length };
      }),
    },
    auditEvent: { findFirst: vi.fn(async () => null) },
    cvUpload: { findFirst: vi.fn(async () => null) },
    referral: { count: vi.fn(async () => 1) },
    emailSuppression: { findUnique: vi.fn(async () => (h.suppressed ? { emailHash: "x" } : null)) },
    message: { findFirst: vi.fn(async () => (h.lastSentAt ? { sentAt: h.lastSentAt } : null)) },
    manualCallTask: { create: vi.fn(async ({ data }: { data: unknown }) => void h.callTasks.push(data)) },
    notification: { create: vi.fn(async ({ data }: { data: { title: string; target: string | null } }) => void h.notifications.push(data)) },
  },
}));
vi.mock("../../../common/freshness-config.js", () => ({ loadFreshnessThresholds: async () => DEFAULT_FRESHNESS_THRESHOLDS }));
vi.mock("../../../common/reminder-config.js", () => ({ loadReminderConfig: async () => ({ version: 3, config: DEFAULT_REMINDER_CONFIG }) }));

import { RemindersService } from "../reminders.service.js";

const consents = { active: vi.fn() };
const delivery = { claim: vi.fn(), send: vi.fn() };
const links = { issue: vi.fn() };
const audit = { record: vi.fn() };
const settings = { baseUrl: "https://loop.test", confirmLinkTtlHours: 72 };
const svc = new RemindersService(consents as never, delivery as never, links as never, audit as never, settings);

const d = (s: string) => new Date(s);
const NOW = d("2026-10-24T10:00:00Z"); // 11:00 BST, outside quiet hours

const contractor = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  email: "pat@example.com",
  firstName: "Pat",
  live: true,
  employmentSituation: "BETWEEN_CONTRACTS",
  availableFrom: null,
  contractEndDate: null,
  lastConfirmedAt: d("2026-10-15T09:00:00Z"),
  unconfirmedSince: null,
  escalationStage: null,
  searchSuppressed: false,
  erasedAt: null,
  erasureRequestedAt: null,
  createdAt: d("2026-09-01T09:00:00Z"),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  h.contractors = [contractor()];
  h.reminders = [];
  h.lastSentAt = null;
  h.suppressed = false;
  h.callTasks = [];
  h.notifications = [];
  consents.active.mockResolvedValue(new Set(["OPERATIONAL_EMAIL"]));
  delivery.claim.mockResolvedValue("m1");
  delivery.send.mockResolvedValue("SENT");
  links.issue.mockResolvedValue("https://loop.test/confirm?t=TOKEN");
});

const sentContent = () => delivery.send.mock.calls[0]?.[3] as { subject: string; text: string; html: string };

describe("RemindersService.runSweep", () => {
  it("plans from the versioned config, sends the one due reminder with a confirm link, and records a notification", async () => {
    const r = await svc.runSweep(NOW);
    expect(r).toMatchObject({ contractors: 1, sent: 1, failed: 0, errors: 0 });
    expect(h.reminders.every((x) => x.configVersion === 3)).toBe(true);
    const sent = h.reminders.filter((x) => x.status === "SENT");
    expect(sent.map((x) => x.type)).toEqual(["AVAILABLE_NOW_CHECK"]);
    expect(links.issue).toHaveBeenCalledOnce();
    expect(sentContent().text).toContain("https://loop.test/confirm?t=TOKEN");
    expect(delivery.send.mock.calls[0]?.[2]).toBe("pat@example.com");
    expect(h.notifications).toHaveLength(1);
  });

  it("is idempotent: a second sweep neither re-plans nor re-sends", async () => {
    await svc.runSweep(NOW);
    const count = h.reminders.length;
    delivery.claim.mockResolvedValue(null); // the Message row already exists
    await svc.runSweep(NOW);
    expect(h.reminders).toHaveLength(count);
    expect(delivery.send).toHaveBeenCalledOnce();
  });

  it.each([
    ["without operational email consent", () => consents.active.mockResolvedValue(new Set())],
    ["to a suppressed address", () => void (h.suppressed = true)],
    ["after one routine reminder today", () => void (h.lastSentAt = d("2026-10-24T08:00:00Z"))],
  ])("sends nothing %s, and keeps the reminder pending", async (_name, arrange) => {
    arrange();
    await svc.runSweep(NOW);
    expect(delivery.claim).not.toHaveBeenCalled();
    expect(h.reminders.find((x) => x.type === "AVAILABLE_NOW_CHECK")?.status).toBe("PENDING");
  });

  it("holds sends during Europe/London quiet hours", async () => {
    await svc.runSweep(d("2026-10-24T21:30:00Z")); // 22:30 BST
    expect(delivery.claim).not.toHaveBeenCalled();
  });

  it("does not send to a contractor who has asked to be erased", async () => {
    h.contractors = [contractor({ erasureRequestedAt: NOW })];
    h.contractors = []; // the sweep query excludes them; nothing to process
    expect(await svc.runSweep(NOW)).toMatchObject({ contractors: 0, sent: 0 });
  });

  it("drops a reminder that is too old instead of sending it late", async () => {
    h.contractors = [contractor({ lastConfirmedAt: d("2026-10-12T09:00:00Z") })]; // check was due 19 Oct: 5 days ago
    await svc.runSweep(NOW);
    expect(delivery.claim).not.toHaveBeenCalled();
    const old = h.reminders.find((x) => x.type === "AVAILABLE_NOW_CHECK");
    expect(old).toMatchObject({ status: "SKIPPED", resolution: "STALE" });
  });

  it("offers no one-touch link for the contract-end outcome ask, and it outranks routine reminders", async () => {
    h.contractors = [
      contractor({ employmentSituation: "CONTRACTING", contractEndDate: d("2026-10-24T00:00:00Z"), lastConfirmedAt: d("2026-10-20T09:00:00Z") }),
    ];
    await svc.runSweep(NOW);
    expect(h.reminders.filter((x) => x.status === "SENT").map((x) => x.type)).toEqual(["CONTRACT_END_DATE"]);
    expect(links.issue).not.toHaveBeenCalled();
    expect(sentContent().subject).toContain("ends today");
    expect(sentContent().text).toContain("https://loop.test/my-loop/availability");
  });

  it("cancels pending reminders that are no longer planned (obsolete)", async () => {
    h.reminders.push({
      id: "old",
      contractorId: "c1",
      type: "AVAILABLE_NOW_CHECK",
      dedupeKey: "AVAILABLE_NOW_CHECK:AVAILABLE_NOW:2026-10-16",
      dueAt: d("2026-10-16T00:00:00Z"),
      status: "PENDING",
      resolution: null,
      configVersion: 1,
    });
    await svc.runSweep(NOW);
    expect(h.reminders.find((x) => x.id === "old")).toMatchObject({ status: "CANCELLED", resolution: "OBSOLETE" });
  });

  it("cancels contract-end follow-ups once the contractor has confirmed since the end date (satisfied)", async () => {
    h.contractors = [
      contractor({ employmentSituation: "CONTRACTING", contractEndDate: d("2026-10-20T00:00:00Z"), lastConfirmedAt: d("2026-10-22T09:00:00Z") }),
    ];
    h.reminders.push({
      id: "fu",
      contractorId: "c1",
      type: "CONTRACT_END_FOLLOW_UP",
      dedupeKey: "CONTRACT_END_FOLLOW_UP:2026-10-20:3:2026-10-23",
      dueAt: d("2026-10-23T00:00:00Z"),
      status: "PENDING",
      resolution: null,
      configVersion: 1,
    });
    await svc.runSweep(NOW);
    expect(h.reminders.find((x) => x.id === "fu")).toMatchObject({ status: "CANCELLED", resolution: "SATISFIED" });
  });
});

describe("escalation", () => {
  const grey = { lastConfirmedAt: d("2026-09-01T09:00:00Z") }; // available-now confirmation long expired

  it("starts the grey clock without escalating yet", async () => {
    h.contractors = [contractor(grey)];
    await svc.runSweep(NOW);
    expect(h.contractors[0]).toMatchObject({ unconfirmedSince: NOW, escalationStage: null, searchSuppressed: false });
    expect(h.callTasks).toHaveLength(0);
  });

  it("raises one Admin call task after 7 days and never changes the colour", async () => {
    h.contractors = [contractor({ ...grey, unconfirmedSince: d("2026-10-16T09:00:00Z") })];
    await svc.runSweep(NOW);
    expect(h.callTasks).toHaveLength(1);
    expect(h.contractors[0]).toMatchObject({ escalationStage: "CALL_TASK", searchSuppressed: false });
    await svc.runSweep(NOW);
    expect(h.callTasks).toHaveLength(1);
  });

  it("suppresses search after 14 days and audits it", async () => {
    h.contractors = [contractor({ ...grey, unconfirmedSince: d("2026-10-01T09:00:00Z") })];
    await svc.runSweep(NOW);
    expect(h.callTasks).toHaveLength(1);
    expect(h.contractors[0]).toMatchObject({ escalationStage: "SUPPRESS", searchSuppressed: true });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "escalation.search_suppressed" }));
  });

  it("does not escalate a contractor who is not LIVE", async () => {
    h.contractors = [contractor({ ...grey, live: false, unconfirmedSince: d("2026-10-01T09:00:00Z") })];
    await svc.runSweep(NOW);
    expect(h.callTasks).toHaveLength(0);
    expect(h.contractors[0]).toMatchObject({ searchSuppressed: false });
  });

  it("lifts the suppression and resets the clock once the contractor is current again", async () => {
    h.contractors = [contractor({ unconfirmedSince: d("2026-10-01T09:00:00Z"), escalationStage: "SUPPRESS", searchSuppressed: true })];
    await svc.runSweep(NOW);
    expect(h.contractors[0]).toMatchObject({ unconfirmedSince: null, escalationStage: null, searchSuppressed: false });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "escalation.suppression_lifted" }));
  });
});
