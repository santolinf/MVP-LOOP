import "reflect-metadata";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Recipient = { id: string; campaignId: string; contractorId: string; status: string; skipReason?: string | null; messageId?: string | null };

const h = vi.hoisted(() => ({
  campaigns: [] as { id: string; kind: string; subject: string; body: string[]; createdBy: string; status: string; approvedAt: Date }[],
  recipients: [] as Recipient[],
  contractors: new Map<string, Record<string, unknown>>(),
  suppressed: false,
  lastAdminSentAt: null as Date | null,
  existingMessage: false,
  settings: { approvalThreshold: 100, ratePerMinute: 200 },
  loopMessages: [] as unknown[],
  completed: [] as string[],
}));

const { KnownError } = vi.hoisted(() => ({
  KnownError: class extends Error {
    code = "P2002";
  },
}));
vi.mock("@loop/db", () => {
  return {
    Prisma: { PrismaClientKnownRequestError: KnownError },
    prisma: {
      reminderConfig: { findUnique: vi.fn(async () => ({ value: h.settings, updatedAt: null, updatedBy: null })) },
      campaign: {
        findMany: vi.fn(async () => h.campaigns.filter((c) => c.status === "SENDING")),
        updateMany: vi.fn(async ({ where, data }: { where: { id: string }; data: { status: string } }) => {
          const c = h.campaigns.find((x) => x.id === where.id && x.status === "SENDING");
          if (!c) return { count: 0 };
          c.status = data.status;
          h.completed.push(c.id);
          return { count: 1 };
        }),
      },
      campaignRecipient: {
        findMany: vi.fn(async ({ where, take }: { where: { campaignId: string; status: string }; take: number }) =>
          h.recipients.filter((r) => r.campaignId === where.campaignId && r.status === where.status).slice(0, take),
        ),
        count: vi.fn(async ({ where }: { where: { campaignId: string; status: string } }) => h.recipients.filter((r) => r.campaignId === where.campaignId && r.status === where.status).length),
        updateMany: vi.fn(async ({ where, data }: { where: { id: string; status: string }; data: Partial<Recipient> }) => {
          const r = h.recipients.find((x) => x.id === where.id && x.status === where.status);
          if (!r) return { count: 0 };
          Object.assign(r, data);
          return { count: 1 };
        }),
      },
      contractor: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => h.contractors.get(where.id) ?? null) },
      emailSuppression: { findUnique: vi.fn(async () => (h.suppressed ? { emailHash: "x" } : null)) },
      message: {
        findFirst: vi.fn(async () => (h.lastAdminSentAt ? { sentAt: h.lastAdminSentAt } : null)),
        create: vi.fn(async () => {
          if (h.existingMessage) throw new KnownError();
          return { id: "m1" };
        }),
        findUnique: vi.fn(async () => ({ id: "m0", status: "SENT" })),
      },
      deliveryLog: { create: vi.fn(async () => ({})) },
      loopMessage: { create: vi.fn(async ({ data }: { data: unknown }) => void h.loopMessages.push(data)) },
    },
  };
});

import { CampaignSendService } from "../campaign-send.service.js";

const consents = { active: vi.fn() };
const delivery = { send: vi.fn() };
const audit = { record: vi.fn() };
const svc = new CampaignSendService(consents as never, delivery as never, audit as never);

const NOW = new Date("2026-10-26T10:00:00Z"); // 10:00 London, outside quiet hours

const addCampaign = (kind = "BROADCAST") =>
  h.campaigns.push({ id: "k1", kind, subject: "Hello {{firstName}}", body: ["Hi {{firstName}}, news."], createdBy: "staff1", status: "SENDING", approvedAt: NOW });
const addRecipient = (n: number) => {
  h.recipients.push({ id: `r${n}`, campaignId: "k1", contractorId: `c${n}`, status: "QUEUED" });
  h.contractors.set(`c${n}`, { id: `c${n}`, email: `p${n}@example.com`, firstName: `P${n}`, erasedAt: null, erasureRequestedAt: null });
};

beforeEach(() => {
  vi.clearAllMocks();
  h.campaigns = [];
  h.recipients = [];
  h.contractors = new Map();
  h.suppressed = false;
  h.lastAdminSentAt = null;
  h.existingMessage = false;
  h.settings = { approvalThreshold: 100, ratePerMinute: 200 };
  h.loopMessages = [];
  h.completed = [];
  consents.active.mockResolvedValue(new Set(["LOOP_MARKETING", "OPERATIONAL_EMAIL"]));
  delivery.send.mockResolvedValue("SENT");
});

describe("CampaignSendService.drain", () => {
  it("sends to consenting recipients, mirrors the message into My LOOP and completes the campaign", async () => {
    addCampaign();
    addRecipient(1);
    const r = await svc.drain(NOW);
    expect(r).toMatchObject({ held: false, sent: 1, failed: 0, skipped: 0, completed: 1 });
    expect(delivery.send).toHaveBeenCalledWith("m1", "EMAIL", "p1@example.com", expect.objectContaining({ subject: "Hello P1" }), NOW);
    expect(h.loopMessages).toHaveLength(1);
    expect(h.recipients[0]?.status).toBe("SENT");
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "campaign.completed", entityId: "k1" }));
  });

  it("holds everything during quiet hours", async () => {
    addCampaign();
    addRecipient(1);
    const r = await svc.drain(new Date("2026-10-26T22:30:00Z"));
    expect(r.held).toBe(true);
    expect(delivery.send).not.toHaveBeenCalled();
    expect(h.recipients[0]?.status).toBe("QUEUED");
  });

  it("re-checks consent at send time: withdrawn marketing consent skips a broadcast recipient", async () => {
    addCampaign("BROADCAST");
    addRecipient(1);
    consents.active.mockResolvedValue(new Set(["OPERATIONAL_EMAIL"]));
    const r = await svc.drain(NOW);
    expect(r.skipped).toBe(1);
    expect(h.recipients[0]).toMatchObject({ status: "SKIPPED", skipReason: "NO_CONSENT" });
    expect(delivery.send).not.toHaveBeenCalled();
  });

  it("a targeted send needs only operational consent", async () => {
    addCampaign("TARGETED");
    addRecipient(1);
    consents.active.mockResolvedValue(new Set(["OPERATIONAL_EMAIL"]));
    expect((await svc.drain(NOW)).sent).toBe(1);
  });

  it("skips suppressed addresses and erased accounts, and enforces one admin message a day", async () => {
    addCampaign();
    addRecipient(1);
    addRecipient(2);
    addRecipient(3);
    h.contractors.set("c1", { ...h.contractors.get("c1"), erasedAt: NOW });
    h.lastAdminSentAt = new Date("2026-10-26T08:00:00Z");
    await svc.drain(NOW);
    expect(h.recipients.map((r) => r.skipReason)).toEqual(["ERASED", "DAILY_CAP", "DAILY_CAP"]);
    h.recipients.forEach((r) => (r.status = "QUEUED"));
    h.campaigns.forEach((c) => (c.status = "SENDING"));
    h.lastAdminSentAt = null;
    h.suppressed = true;
    await svc.drain(NOW);
    expect(h.recipients.map((r) => r.skipReason)).toEqual(["ERASED", "EMAIL_SUPPRESSED", "EMAIL_SUPPRESSED"]);
  });

  it("respects the send rate: at most ratePerMinute attempts per run, the rest stay queued", async () => {
    h.settings = { approvalThreshold: 100, ratePerMinute: 2 };
    addCampaign();
    [1, 2, 3, 4, 5].forEach(addRecipient);
    const r = await svc.drain(NOW);
    expect(r.attempted).toBe(2);
    expect(h.recipients.filter((x) => x.status === "QUEUED")).toHaveLength(3);
    expect(h.completed).toEqual([]);
    const next = await svc.drain(NOW);
    expect(next.attempted).toBe(2);
  });

  it("never sends twice: an existing message for the pair settles the recipient without a send", async () => {
    addCampaign();
    addRecipient(1);
    h.existingMessage = true;
    const r = await svc.drain(NOW);
    expect(delivery.send).not.toHaveBeenCalled();
    expect(r.sent).toBe(1);
    expect(h.recipients[0]?.status).toBe("SENT");
  });

  it("records a provider failure as FAILED without a My LOOP message", async () => {
    addCampaign();
    addRecipient(1);
    delivery.send.mockResolvedValue("FAILED");
    const r = await svc.drain(NOW);
    expect(r).toMatchObject({ failed: 1, sent: 0 });
    expect(h.loopMessages).toHaveLength(0);
    expect(h.recipients[0]?.status).toBe("FAILED");
  });
});
