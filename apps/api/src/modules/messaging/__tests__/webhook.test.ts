import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  messages: [{ id: "m1", contractorId: "c1", providerMessageId: "pm-1" }] as { id: string; contractorId: string; providerMessageId: string }[],
  logIds: new Set<string>(),
  logs: [] as { event: string }[],
  statuses: [] as string[],
  suppressions: [] as { emailHash: string; reason: string }[],
}));

class KnownError extends Error {
  code = "P2002";
}

vi.mock("@loop/db", () => ({
  Prisma: { PrismaClientKnownRequestError: KnownError, DbNull: "DbNull" },
  prisma: {
    message: {
      findUnique: vi.fn(async ({ where }: { where: { providerMessageId: string } }) => h.messages.find((m) => m.providerMessageId === where.providerMessageId) ?? null),
      update: vi.fn(async ({ data }: { data: { status: string } }) => void h.statuses.push(data.status)),
    },
    deliveryLog: {
      create: vi.fn(async ({ data }: { data: { providerEventId: string; event: string } }) => {
        if (h.logIds.has(data.providerEventId)) throw new KnownError("dup");
        h.logIds.add(data.providerEventId);
        h.logs.push(data);
      }),
    },
    contractor: { findUnique: vi.fn(async () => ({ email: "Pat@Example.com" })) },
    emailSuppression: {
      upsert: vi.fn(async ({ create }: { create: { emailHash: string; reason: string } }) => void h.suppressions.push(create)),
    },
  },
}));

const { WebhookService } = await import("../webhook.service.js");
const { basicPasswordMatches } = await import("../webhook.controller.js");
const { hashKey } = await import("../../../common/rate-limit.js");

const svc = new WebhookService();
const NOW = new Date("2026-10-24T10:00:00Z");

beforeEach(() => {
  h.logIds.clear();
  h.logs = [];
  h.statuses = [];
  h.suppressions = [];
});

describe("basicPasswordMatches", () => {
  const basic = (user: string, pass: string) => `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
  it("accepts the shared secret as the Basic password", () => {
    expect(basicPasswordMatches(basic("postmark", "s3cret-value-123456"), "s3cret-value-123456")).toBe(true);
  });
  it("rejects a wrong password, a missing header, a non-Basic scheme and an unset secret", () => {
    expect(basicPasswordMatches(basic("postmark", "nope"), "s3cret-value-123456")).toBe(false);
    expect(basicPasswordMatches(undefined, "s3cret-value-123456")).toBe(false);
    expect(basicPasswordMatches("Bearer s3cret-value-123456", "s3cret-value-123456")).toBe(false);
    expect(basicPasswordMatches(basic("postmark", ""), undefined)).toBe(false);
  });
});

describe("WebhookService.handlePostmark", () => {
  it("logs a delivery without suppressing", async () => {
    expect(await svc.handlePostmark({ RecordType: "Delivery", MessageID: "pm-1", ID: 1 }, NOW)).toBe("LOGGED");
    expect(h.logs).toEqual([expect.objectContaining({ event: "DELIVERED" })]);
    expect(h.suppressions).toHaveLength(0);
  });

  it("marks the message bounced and suppresses the lower-cased address on a hard bounce", async () => {
    const outcome = await svc.handlePostmark({ RecordType: "Bounce", Type: "HardBounce", MessageID: "pm-1", ID: 2, Email: "Pat@Example.com" }, NOW);
    expect(outcome).toBe("SUPPRESSED");
    expect(h.statuses).toEqual(["BOUNCED"]);
    expect(h.suppressions).toEqual([{ emailHash: hashKey("pat@example.com"), reason: "HARD_BOUNCE" }]);
  });

  it("does not suppress on a transient bounce", async () => {
    expect(await svc.handlePostmark({ RecordType: "Bounce", Type: "Transient", MessageID: "pm-1", ID: 3, Email: "pat@example.com" }, NOW)).toBe("LOGGED");
    expect(h.suppressions).toHaveLength(0);
    expect(h.statuses).toHaveLength(0);
  });

  it("suppresses on a spam complaint", async () => {
    await svc.handlePostmark({ RecordType: "SpamComplaint", MessageID: "pm-1", ID: 4, Email: "pat@example.com" }, NOW);
    expect(h.statuses).toEqual(["COMPLAINED"]);
    expect(h.suppressions[0]?.reason).toBe("COMPLAINT");
  });

  it("suppresses a bounced address even when the message is not one of ours (e.g. a sign-in code)", async () => {
    expect(await svc.handlePostmark({ RecordType: "Bounce", Type: "HardBounce", MessageID: "other", ID: 5, Email: "x@example.com" }, NOW)).toBe("SUPPRESSED");
    expect(h.logs).toHaveLength(0);
    expect(h.suppressions).toHaveLength(1);
  });

  it("is idempotent when the provider retries an event", async () => {
    const e = { RecordType: "Bounce", Type: "HardBounce", MessageID: "pm-1", ID: 6, Email: "pat@example.com" };
    await svc.handlePostmark(e, NOW);
    expect(await svc.handlePostmark(e, NOW)).toBe("DUPLICATE");
    expect(h.suppressions).toHaveLength(1);
  });

  it("ignores record types it does not handle", async () => {
    expect(await svc.handlePostmark({ RecordType: "Open", MessageID: "pm-1" }, NOW)).toBe("IGNORED");
  });
});
