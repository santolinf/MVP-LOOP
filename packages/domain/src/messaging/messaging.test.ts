import { describe, expect, it } from "vitest";
import { DEFAULT_REMINDER_CONFIG as cfg, mergeReminderConfig } from "../reminders/index.js";
import {
  checkConfirmLink,
  decideSend,
  escalationStage,
  factsFingerprint,
  isQuietHours,
  nextSendTime,
  type DueReminder,
  type SendInput,
} from "./index.js";

const at = (s: string) => new Date(s);
const due = (id: string, type: DueReminder["type"], dueAt: string): DueReminder => ({ id, type, dueAt: at(dueAt) });
const input = (over: Partial<SendInput>): SendInput => ({
  now: at("2026-10-26T10:00:00Z"),
  due: [],
  sentToday: false,
  hasEmail: true,
  operationalConsent: true,
  emailSuppressed: false,
  erased: false,
  staleAfterDays: cfg.staleAfterDays,
  ...over,
});

describe("quiet hours (Europe/London)", () => {
  it.each([
    ["2026-07-15T19:59:00Z", false], // 20:59 BST
    ["2026-07-15T20:00:00Z", true], // 21:00 BST
    ["2026-07-15T06:59:00Z", true], // 07:59 BST
    ["2026-07-15T07:00:00Z", false], // 08:00 BST
    ["2026-12-15T20:59:00Z", false], // GMT
    ["2026-12-15T21:00:00Z", true],
    ["2026-12-15T07:59:00Z", true],
    ["2026-12-15T08:00:00Z", false],
  ])("%s quiet=%s", (iso, quiet) => {
    expect(isQuietHours(at(iso))).toBe(quiet);
  });
  it("nextSendTime is the instant itself when allowed", () => {
    const t = at("2026-12-15T12:00:00Z");
    expect(nextSendTime(t)).toEqual(t);
  });
  it("holds overnight sends until 08:00 London, in winter and summer", () => {
    expect(nextSendTime(at("2026-12-15T23:30:00Z")).toISOString()).toBe("2026-12-16T08:00:00.000Z");
    expect(nextSendTime(at("2026-07-15T21:10:00Z")).toISOString()).toBe("2026-07-16T07:00:00.000Z");
  });
});

describe("decideSend", () => {
  it("sends the highest priority reminder and defers the rest", () => {
    const d = decideSend(
      input({ due: [due("a", "PROFILE_REVIEW", "2026-10-26"), due("b", "CONTRACT_END_PROMPT", "2026-10-26"), due("c", "AVAILABLE_NOW_CHECK", "2026-10-26")] }),
    );
    expect(d.send?.id).toBe("b");
    expect(d.deferred.map((r) => r.id).sort()).toEqual(["a", "c"]);
  });
  it("breaks priority ties by earliest due date", () => {
    const d = decideSend(input({ due: [due("late", "CONTRACT_END_FOLLOW_UP", "2026-10-26"), due("early", "CONTRACT_END_FOLLOW_UP", "2026-10-25")] }));
    expect(d.send?.id).toBe("early");
  });
  it("sends nothing after one routine reminder today", () => {
    const d = decideSend(input({ sentToday: true, due: [due("a", "AVAILABLE_NOW_CHECK", "2026-10-26")] }));
    expect(d.send).toBeNull();
    expect(d.deferred).toHaveLength(1);
  });
  it("drops reminders more than staleAfterDays old and keeps the rest", () => {
    const d = decideSend(input({ due: [due("old", "AVAILABLE_NOW_CHECK", "2026-10-22"), due("ok", "AVAILABLE_NOW_CHECK", "2026-10-23")] }));
    expect(d.stale.map((r) => r.id)).toEqual(["old"]);
    expect(d.send?.id).toBe("ok");
  });
  it("holds during quiet hours without sending or dropping", () => {
    const d = decideSend(input({ now: at("2026-10-26T21:30:00Z"), due: [due("a", "AVAILABLE_NOW_CHECK", "2026-10-26")] }));
    expect(d.send).toBeNull();
    expect(d.heldUntil?.toISOString()).toBe("2026-10-27T08:00:00.000Z");
    expect(d.deferred).toHaveLength(1);
  });
  it.each([
    [{ hasEmail: false }, "NO_EMAIL"],
    [{ operationalConsent: false }, "NO_OPERATIONAL_CONSENT"],
    [{ emailSuppressed: true }, "EMAIL_SUPPRESSED"],
    [{ erased: true }, "ERASED"],
  ] as const)("blocks %j at send time", (over, reason) => {
    const d = decideSend(input({ ...over, due: [due("a", "AVAILABLE_NOW_CHECK", "2026-10-26")] }));
    expect(d.send).toBeNull();
    expect(d.blocked).toBe(reason);
  });
});

describe("escalationStage", () => {
  const since = at("2026-10-01T00:00:00Z");
  it.each([
    [null, "2026-10-30", "NONE"],
    [since, "2026-10-01", "FOLLOW_UP"],
    [since, "2026-10-07", "FOLLOW_UP"],
    [since, "2026-10-08", "CALL_TASK"],
    [since, "2026-10-14", "CALL_TASK"],
    [since, "2026-10-15", "SUPPRESS"],
  ] as const)("since %s at %s -> %s", (s, now, stage) => {
    expect(escalationStage(s, at(`${now}T12:00:00Z`), cfg)).toBe(stage);
  });
});

describe("checkConfirmLink", () => {
  const facts = { employment: "BETWEEN_CONTRACTS", availableFrom: null, contractEndDate: null };
  const link = { expiresAt: at("2026-10-29T10:00:00Z"), usedAt: null, fingerprint: factsFingerprint(facts) };
  const now = at("2026-10-26T10:00:00Z");
  it("accepts an unused, unexpired link for unchanged facts", () => expect(checkConfirmLink(link, facts, now)).toBe("OK"));
  it("rejects a used link", () => expect(checkConfirmLink({ ...link, usedAt: now }, facts, now)).toBe("USED"));
  it("rejects an expired link", () => expect(checkConfirmLink(link, facts, at("2026-10-29T10:00:00Z"))).toBe("EXPIRED"));
  it("rejects when the situation changed since the email", () =>
    expect(checkConfirmLink(link, { ...facts, employment: "CONTRACTING" }, now)).toBe("FACTS_CHANGED"));
  it("never confirms past a contract end date (B3)", () => {
    const ended = { employment: "CONTRACTING", availableFrom: null, contractEndDate: at("2026-10-20T00:00:00Z") };
    const l = { ...link, fingerprint: factsFingerprint(ended) };
    expect(checkConfirmLink(l, ended, now)).toBe("END_DATE_PASSED");
  });
});

describe("mergeReminderConfig", () => {
  it("fills missing sections from defaults and ignores unknown or mistyped keys", () => {
    const m = mergeReminderConfig({ availableNow: { intervalDays: 5 }, staleAfterDays: "x", bogus: 1, escalation: { callTaskAfterDays: 3 } });
    expect(m.availableNow.intervalDays).toBe(5);
    expect(m.staleAfterDays).toBe(3);
    expect(m.escalation).toEqual({ callTaskAfterDays: 3, suppressAfterDays: 14 });
    expect(m.permanent.intervalDays).toBe(60);
    expect("bogus" in m).toBe(false);
  });
  it("returns the defaults for garbage", () => expect(mergeReminderConfig(null)).toEqual(cfg));
});
