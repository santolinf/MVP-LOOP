import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ contractor: null as Record<string, unknown> | null }));
vi.mock("@loop/db", () => ({ prisma: { contractor: { findUnique: vi.fn(async () => h.contractor) } } }));

import { ConfirmLinkController } from "../confirm-link.controller.js";

const links = { claim: vi.fn(), release: vi.fn() };
const me = { confirmAvailability: vi.fn() };
const inbox = { notify: vi.fn() };
const controller = new ConfirmLinkController(links as never, me as never, inbox as never);
const NOW = new Date("2026-10-24T10:00:00Z");
const body = { token: "t".repeat(43) };

beforeEach(() => {
  vi.clearAllMocks();
  h.contractor = {
    id: "c1",
    employmentSituation: "BETWEEN_CONTRACTS",
    availableFrom: new Date("2026-10-20T00:00:00Z"),
    contractEndDate: null,
  };
  links.claim.mockResolvedValue({ ok: true, contractorId: "c1" });
});

describe("POST /confirm-links/redeem", () => {
  it("confirms the facts already on file as an EMAIL_LINK confirmation and records a notification", async () => {
    expect(await controller.redeem(body, NOW)).toEqual({ outcome: "CONFIRMED", reason: null, returnTarget: null });
    // A start date in the past means "available now", so it is re-sent as no start date rather than a past date.
    expect(me.confirmAvailability).toHaveBeenCalledWith("c1", { employment: "BETWEEN_CONTRACTS", availableFrom: null, contractEndDate: null }, NOW, "EMAIL_LINK");
    expect(inbox.notify).toHaveBeenCalledWith("c1", "CONFIRMATION", expect.any(String), expect.any(String), "MY_LOOP");
  });

  it("keeps a future start date as it is", async () => {
    h.contractor = { ...h.contractor, availableFrom: new Date("2026-11-02T00:00:00Z") };
    await controller.redeem(body, NOW);
    expect(me.confirmAvailability.mock.calls[0]?.[1]).toMatchObject({ availableFrom: "2026-11-02" });
  });

  it.each(["INVALID", "USED", "EXPIRED", "FACTS_CHANGED", "END_DATE_PASSED"] as const)("sends %s to sign-in and changes nothing", async (reason) => {
    links.claim.mockResolvedValue({ ok: false, reason });
    expect(await controller.redeem(body, NOW)).toEqual({ outcome: "SIGN_IN_REQUIRED", reason, returnTarget: "AVAILABILITY" });
    expect(me.confirmAvailability).not.toHaveBeenCalled();
    expect(inbox.notify).not.toHaveBeenCalled();
  });

  it("releases the link and asks for sign-in when the confirmation itself fails", async () => {
    me.confirmAvailability.mockRejectedValue(new Error("boom"));
    expect(await controller.redeem(body, NOW)).toMatchObject({ outcome: "SIGN_IN_REQUIRED" });
    expect(links.release).toHaveBeenCalledWith(body.token);
    expect(inbox.notify).not.toHaveBeenCalled();
  });
});
