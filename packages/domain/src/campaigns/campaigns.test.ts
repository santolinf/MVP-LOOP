import { describe, expect, it } from "vitest";
import type { ConsentPurpose } from "../consent/index.js";
import {
  batchSize,
  DEFAULT_CAMPAIGN_SETTINGS as defaults,
  mayApproveCampaign,
  mergeCampaignSettings,
  needsApproval,
  requiredConsent,
  skipReason,
  validateCampaignSettings,
  type RecipientFacts,
} from "./index.js";

const facts = (over: Partial<RecipientFacts> = {}): RecipientFacts => ({
  kind: "BROADCAST",
  erased: false,
  hasEmail: true,
  consents: new Set<ConsentPurpose>(["LOOP_MARKETING", "OPERATIONAL_EMAIL"]),
  emailSuppressed: false,
  ...over,
});

describe("consent filter (skipReason)", () => {
  it.each([
    ["broadcast with marketing consent", facts(), null],
    ["broadcast without marketing consent (operational only)", facts({ consents: new Set<ConsentPurpose>(["OPERATIONAL_EMAIL"]) }), "NO_CONSENT"],
    ["targeted with operational consent only", facts({ kind: "TARGETED", consents: new Set<ConsentPurpose>(["OPERATIONAL_EMAIL"]) }), null],
    ["targeted without operational consent (marketing only)", facts({ kind: "TARGETED", consents: new Set<ConsentPurpose>(["LOOP_MARKETING"]) }), "NO_CONSENT"],
    ["partner marketing never covers LOOP sends", facts({ consents: new Set<ConsentPurpose>(["PARTNER_MARKETING"]) }), "NO_CONSENT"],
    ["erased wins over everything", facts({ erased: true, hasEmail: false }), "ERASED"],
    ["no email address", facts({ hasEmail: false }), "NO_EMAIL"],
    ["suppressed address", facts({ emailSuppressed: true }), "EMAIL_SUPPRESSED"],
    ["already messaged today", facts({ receivedAdminToday: true }), "DAILY_CAP"],
  ])("%s", (_name, f, expected) => {
    expect(skipReason(f)).toBe(expected);
  });

  it("maps each kind to its purpose", () => {
    expect(requiredConsent("BROADCAST")).toBe("LOOP_MARKETING");
    expect(requiredConsent("TARGETED")).toBe("OPERATIONAL_EMAIL");
  });
});

describe("two-person approval", () => {
  it.each([
    [0, 100, false],
    [100, 100, false],
    [101, 100, true],
    [1, 0, true],
    [0, 0, false],
  ])("%i recipients, threshold %i -> needs approval %s", (count, threshold, expected) => {
    expect(needsApproval(count, { approvalThreshold: threshold })).toBe(expected);
  });

  it("the author cannot approve their own send", () => {
    expect(mayApproveCampaign({ approverId: "a", authorId: "a" })).toBe(false);
    expect(mayApproveCampaign({ approverId: "b", authorId: "a" })).toBe(true);
  });
});

describe("settings", () => {
  it("defaults to a threshold of 100 and 200 a minute", () => {
    expect(mergeCampaignSettings(null)).toEqual({ approvalThreshold: 100, ratePerMinute: 200 });
  });
  it("merges a partial row over the defaults and ignores junk", () => {
    expect(mergeCampaignSettings({ approvalThreshold: 5 })).toEqual({ ...defaults, approvalThreshold: 5 });
    expect(mergeCampaignSettings({ approvalThreshold: "x", ratePerMinute: 1.5 })).toEqual(defaults);
  });
  it.each([
    [{ approvalThreshold: -1, ratePerMinute: 10 }, 1],
    [{ approvalThreshold: 10, ratePerMinute: 0 }, 1],
    [{ approvalThreshold: 10, ratePerMinute: 5000 }, 1],
    [{ approvalThreshold: -1, ratePerMinute: 0 }, 2],
    [{ approvalThreshold: 0, ratePerMinute: 1 }, 0],
    [defaults, 0],
  ])("validates %j -> %i issue(s)", (s, n) => {
    expect(validateCampaignSettings(s)).toHaveLength(n);
  });
});

describe("batchSize", () => {
  it("never goes negative", () => {
    expect(batchSize({ ratePerMinute: 200 }, 0)).toBe(200);
    expect(batchSize({ ratePerMinute: 200 }, 150)).toBe(50);
    expect(batchSize({ ratePerMinute: 200 }, 300)).toBe(0);
  });
});
