import { describe, expect, it } from "vitest";
import { DEFAULT_REMINDER_CONFIG as cfg, canSendIntroProgress, planReminders, type ReminderContext } from "./index.js";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const ctx = (over: Partial<ReminderContext>): ReminderContext => ({
  status: "AVAILABLE_NOW",
  contractEndDate: null,
  availableFrom: null,
  lastConfirmedAt: d("2026-10-01"),
  profileLastVerifiedAt: d("2026-10-01"),
  lastCvActivityAt: d("2026-10-01"),
  registeredAt: d("2026-10-01"),
  introductionCount: 1,
  ...over,
});
const by = (r: ReturnType<typeof planReminders>, t: string) =>
  r.filter((x) => x.type === t).map((x) => x.dueAt.toISOString().slice(0, 10));

describe("planReminders (3.3)", () => {
  it("available now repeats every 7 days", () => {
    expect(by(planReminders(ctx({}), cfg), "AVAILABLE_NOW_CHECK")).toEqual(["2026-10-08"]);
  });
  it("contract end prompts at 28/14/7, on the date, and +3/+7", () => {
    const r = planReminders(ctx({ status: "ENDING_SOON", contractEndDate: d("2026-11-10") }), cfg);
    expect(by(r, "CONTRACT_END_PROMPT")).toEqual(["2026-10-13", "2026-10-27", "2026-11-03"]);
    expect(by(r, "CONTRACT_END_DATE")).toEqual(["2026-11-10"]);
    expect(by(r, "CONTRACT_END_FOLLOW_UP")).toEqual(["2026-11-13", "2026-11-17"]);
  });
  it("in contract adds a 30 day check", () => {
    const r = planReminders(ctx({ status: "IN_CONTRACT", contractEndDate: d("2027-03-01") }), cfg);
    expect(by(r, "IN_CONTRACT_CHECK")).toEqual(["2026-10-31"]);
  });
  it("permanent every 60 days and no available-now reminder", () => {
    const r = planReminders(ctx({ status: "PERMANENT" }), cfg);
    expect(by(r, "PERMANENT_CHECK")).toEqual(["2026-11-30"]);
    expect(by(r, "AVAILABLE_NOW_CHECK")).toEqual([]);
  });
  it("profile review is 90 days from profile verification, CV upload does not reset it", () => {
    const r = planReminders(ctx({ lastCvActivityAt: d("2026-10-15") }), cfg);
    expect(by(r, "PROFILE_REVIEW")).toEqual(["2026-12-30"]);
    expect(by(r, "CV_REVIEW")).toEqual(["2027-04-13"]);
  });
  it("introductions nudge only with zero introductions", () => {
    expect(by(planReminders(ctx({ introductionCount: 0 }), cfg), "INTRODUCTIONS_NUDGE")).toEqual(["2026-10-15"]);
    expect(by(planReminders(ctx({ introductionCount: 2 }), cfg), "INTRODUCTIONS_NUDGE")).toEqual([]);
  });
  it("dedupe keys are unique within a plan", () => {
    const r = planReminders(ctx({ status: "ENDING_SOON", contractEndDate: d("2026-11-10") }), cfg);
    expect(new Set(r.map((x) => x.dedupeKey)).size).toBe(r.length);
  });
  it("intro progress respects min gap (Q10)", () => {
    expect(canSendIntroProgress(d("2026-10-10"), d("2026-10-17"), cfg)).toBe(false);
    expect(canSendIntroProgress(d("2026-10-03"), d("2026-10-17"), cfg)).toBe(true);
    expect(canSendIntroProgress(null, d("2026-10-17"), cfg)).toBe(true);
  });
});
