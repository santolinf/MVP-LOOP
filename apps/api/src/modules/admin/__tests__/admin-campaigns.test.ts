import "reflect-metadata";
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  campaign: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  campaignRecipient: { createMany: vi.fn(), updateMany: vi.fn(), groupBy: vi.fn() },
  reminderConfig: { findUnique: vi.fn(), upsert: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@loop/db", () => ({ prisma: db, Prisma: { PrismaClientKnownRequestError: class extends Error {} } }));

const evaluate = vi.hoisted(() => vi.fn());
vi.mock("../../messaging/campaign-audience.js", () => ({ evaluateAudience: evaluate }));

const { AdminCampaignsService } = await import("../admin-campaigns.service.js");

const audit = { record: vi.fn() };
const consents = {};
const svc = () => new AdminCampaignsService(audit as never, consents as never);
const author = { id: "author", email: "a@loop.test", name: null, role: "OPERATOR" as const, sessionId: "s1" };
const approver = { id: "approver", email: "b@loop.test", name: null, role: "ADMIN" as const, sessionId: "s2" };
const NOW = new Date("2026-10-26T10:00:00Z");

const eligible = (n: number) => Array.from({ length: n }, (_, i) => ({ contractorId: `c${i}`, firstName: `P${i}`, skip: null }));
const content = { name: "October news", subject: "News for {{firstName}}", body: ["Hello {{firstName}}"] };
const broadcast = { kind: "BROADCAST" as const, liveOnly: true, situations: [], colours: [] };

const row = (over: Record<string, unknown> = {}) => ({
  id: "k1",
  name: "October news",
  kind: "BROADCAST",
  audience: broadcast,
  subject: "s",
  body: ["b"],
  status: "PENDING_APPROVAL",
  recipientCount: 150,
  skippedCount: 0,
  approvalRequired: true,
  thresholdAtSubmit: 100,
  createdBy: "author",
  approvedBy: null,
  approvedAt: null,
  decisionNote: null,
  sentAt: null,
  createdAt: NOW,
  ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation(async (fn: (t: typeof db) => Promise<unknown>) => fn(db));
  db.reminderConfig.findUnique.mockResolvedValue(null); // defaults: threshold 100, 200/min
  db.campaign.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...row(), ...data, id: "k1", createdAt: NOW }));
  db.campaign.findUnique.mockResolvedValue(row());
  db.campaignRecipient.groupBy.mockResolvedValue([]);
});

describe("AdminCampaignsService.create", () => {
  it("sends straight away at or below the threshold (no second person)", async () => {
    evaluate.mockResolvedValue(eligible(100));
    await svc().create({ ...content, audience: broadcast }, author, NOW);
    expect(db.campaign.create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: "SENDING", approvalRequired: false, recipientCount: 100, createdBy: "author" }) });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.campaign_submitted", actorId: "author" }));
  });

  it("holds a send above the threshold for approval", async () => {
    evaluate.mockResolvedValue(eligible(101));
    await svc().create({ ...content, audience: broadcast }, author, NOW);
    expect(db.campaign.create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: "PENDING_APPROVAL", approvalRequired: true, thresholdAtSubmit: 100 }) });
  });

  it("uses the admin-configured threshold", async () => {
    db.reminderConfig.findUnique.mockResolvedValue({ value: { approvalThreshold: 5, ratePerMinute: 200 }, updatedAt: null, updatedBy: null });
    evaluate.mockResolvedValue(eligible(6));
    await svc().create({ ...content, audience: broadcast }, author, NOW);
    expect(db.campaign.create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: "PENDING_APPROVAL", thresholdAtSubmit: 5 }) });
  });

  it("stores skipped contractors as SKIPPED with their reason and counts only the eligible", async () => {
    evaluate.mockResolvedValue([...eligible(2), { contractorId: "x", firstName: null, skip: "NO_CONSENT" }]);
    await svc().create({ ...content, audience: broadcast }, author, NOW);
    expect(db.campaign.create).toHaveBeenCalledWith({ data: expect.objectContaining({ recipientCount: 2, skippedCount: 1 }) });
    const rows = db.campaignRecipient.createMany.mock.calls[0]?.[0].data as { contractorId: string; status?: string; skipReason?: string }[];
    expect(rows.find((r) => r.contractorId === "x")).toMatchObject({ status: "SKIPPED", skipReason: "NO_CONSENT" });
    expect(rows.find((r) => r.contractorId === "c0")?.status).toBeUndefined();
  });

  it("refuses an audience nobody can be emailed in", async () => {
    evaluate.mockResolvedValue([{ contractorId: "x", firstName: null, skip: "NO_CONSENT" }]);
    await expect(svc().create({ ...content, audience: broadcast }, author, NOW)).rejects.toThrow(/Nobody/);
    expect(db.campaign.create).not.toHaveBeenCalled();
  });

  it("rejects unknown merge fields", async () => {
    evaluate.mockResolvedValue(eligible(1));
    await expect(svc().create({ ...content, subject: "Hi {{surname}}", audience: broadcast }, author, NOW)).rejects.toThrow(/unknown merge field/);
  });
});

describe("AdminCampaignsService.approve", () => {
  it("lets a different person approve and audits before and after", async () => {
    db.campaign.updateMany.mockResolvedValue({ count: 1 });
    await svc().approve("k1", { note: "Checked the audience and wording" }, approver, NOW);
    expect(db.campaign.updateMany).toHaveBeenCalledWith({
      where: { id: "k1", status: "PENDING_APPROVAL" },
      data: expect.objectContaining({ status: "SENDING", approvedBy: "approver" }),
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "admin.campaign_approved", actorId: "approver", before: { status: "PENDING_APPROVAL" }, after: expect.objectContaining({ status: "SENDING" }) }),
    );
  });

  it("refuses the author approving their own send", async () => {
    await expect(svc().approve("k1", { note: "Approving my own send" }, { ...approver, id: "author" }, NOW)).rejects.toThrow(/someone other than its author/);
    expect(db.campaign.updateMany).not.toHaveBeenCalled();
  });

  it("refuses a send that is not waiting", async () => {
    db.campaign.findUnique.mockResolvedValue(row({ status: "SENDING" }));
    await expect(svc().approve("k1", { note: "Too late to approve" }, approver, NOW)).rejects.toThrow(/not waiting/);
  });

  it("loses a race gracefully when someone else decided first", async () => {
    db.campaign.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc().approve("k1", { note: "Racing another approver" }, approver, NOW)).rejects.toThrow(/just decided/);
  });
});

describe("AdminCampaignsService reject and cancel", () => {
  it("rejecting releases queued recipients", async () => {
    db.campaign.updateMany.mockResolvedValue({ count: 1 });
    db.campaignRecipient.updateMany.mockResolvedValue({ count: 150 });
    await svc().reject("k1", { note: "Wording is not approved" }, approver, NOW);
    expect(db.campaignRecipient.updateMany).toHaveBeenCalledWith({
      where: { campaignId: "k1", status: "QUEUED" },
      data: expect.objectContaining({ status: "SKIPPED", skipReason: "CANCELLED" }),
    });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.campaign_rejected", after: expect.objectContaining({ released: 150 }) }));
  });

  it("cancels a send in progress but not a finished one", async () => {
    db.campaign.findUnique.mockResolvedValue(row({ status: "SENDING" }));
    db.campaign.updateMany.mockResolvedValue({ count: 1 });
    db.campaignRecipient.updateMany.mockResolvedValue({ count: 10 });
    await svc().cancel("k1", { note: "Wrong audience chosen" }, author, NOW);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.campaign_cancelled" }));
    db.campaign.findUnique.mockResolvedValue(row({ status: "SENT" }));
    await expect(svc().cancel("k1", { note: "Wrong audience chosen" }, author, NOW)).rejects.toThrow(/cannot be cancelled/);
  });
});

describe("AdminCampaignsService.detail", () => {
  it("canApprove is false for the author, true for another admin", async () => {
    expect((await svc().detail("k1", author)).canApprove).toBe(false);
    expect((await svc().detail("k1", approver)).canApprove).toBe(true);
    expect((await svc().detail("k1", { ...approver, role: "OPERATOR" })).canApprove).toBe(false);
  });
});

describe("AdminCampaignsService.publishSettings", () => {
  it("audits before and after with the note", async () => {
    await svc().publishSettings({ approvalThreshold: 50, ratePerMinute: 100, note: "Lower the bar before launch" }, approver);
    expect(db.reminderConfig.upsert).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.campaign_settings_changed",
        before: { approvalThreshold: 100, ratePerMinute: 200 },
        after: expect.objectContaining({ approvalThreshold: 50, ratePerMinute: 100, note: "Lower the bar before launch" }),
      }),
    );
  });
});
