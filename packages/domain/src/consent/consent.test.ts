import { describe, expect, it } from "vitest";
import {
  activeConsents,
  CONSENT_PURPOSES,
  CONSENT_WORDING,
  mayEmail,
  missingRequiredConsents,
  type ConsentGrant,
  type ConsentPurpose,
} from "./index.js";

const d = (s: string) => new Date(`${s}T10:00:00Z`);
const grant = (purpose: ConsentPurpose, on: string, withdrawn: string | null = null): ConsentGrant => ({
  purpose,
  wordingVersion: "v1-draft",
  grantedAt: d(on),
  withdrawnAt: withdrawn ? d(withdrawn) : null,
});

describe("activeConsents", () => {
  it.each<[string, ConsentGrant[], ConsentPurpose[]]>([
    ["no records means no consent (nothing pre-ticked)", [], []],
    ["a grant is active", [grant("LOOP_MARKETING", "2026-10-01")], ["LOOP_MARKETING"]],
    ["a withdrawn grant is not active", [grant("LOOP_MARKETING", "2026-10-01", "2026-10-05")], []],
    [
      "a re-grant after withdrawal is active",
      [grant("LOOP_MARKETING", "2026-10-01", "2026-10-05"), grant("LOOP_MARKETING", "2026-10-09")],
      ["LOOP_MARKETING"],
    ],
    [
      "latest grant wins regardless of order",
      [grant("LOOP_MARKETING", "2026-10-09"), grant("LOOP_MARKETING", "2026-10-01", "2026-10-05")],
      ["LOOP_MARKETING"],
    ],
    [
      "purposes are independent",
      [grant("OPERATIONAL_EMAIL", "2026-10-01"), grant("PARTNER_MARKETING", "2026-10-01", "2026-10-02")],
      ["OPERATIONAL_EMAIL"],
    ],
  ])("%s", (_n, grants, expected) => {
    expect([...activeConsents(grants)].sort()).toEqual([...expected].sort());
  });
});

describe("missingRequiredConsents", () => {
  it.each<[ConsentPurpose[], ConsentPurpose[]]>([
    [[], ["PROFILE_VISIBILITY", "OPERATIONAL_EMAIL"]],
    [["PROFILE_VISIBILITY"], ["OPERATIONAL_EMAIL"]],
    [["LOOP_MARKETING", "PARTNER_MARKETING"], ["PROFILE_VISIBILITY", "OPERATIONAL_EMAIL"]],
    [["PROFILE_VISIBILITY", "OPERATIONAL_EMAIL"], []],
  ])("active %j -> missing %j", (active, missing) => {
    expect(missingRequiredConsents(new Set(active))).toEqual(missing);
  });
});

describe("mayEmail", () => {
  const none = new Set<ConsentPurpose>();
  it("service and security notices are never disabled by marketing choices", () => {
    expect(mayEmail("SERVICE", none)).toBe(true);
    expect(mayEmail("SECURITY", none)).toBe(true);
  });
  it.each<[Parameters<typeof mayEmail>[0], ConsentPurpose]>([
    ["OPERATIONAL", "OPERATIONAL_EMAIL"],
    ["MARKETING", "LOOP_MARKETING"],
    ["PARTNER_MARKETING", "PARTNER_MARKETING"],
  ])("%s needs %s", (category, purpose) => {
    expect(mayEmail(category, none)).toBe(false);
    expect(mayEmail(category, new Set([purpose]))).toBe(true);
  });
  it("marketing consent does not unlock operational email", () => {
    expect(mayEmail("OPERATIONAL", new Set<ConsentPurpose>(["LOOP_MARKETING", "PARTNER_MARKETING"]))).toBe(false);
  });
});

describe("wording", () => {
  it("every purpose has versioned wording; only visibility and operational are required", () => {
    for (const p of CONSENT_PURPOSES) expect(CONSENT_WORDING[p].version).not.toBe("");
    expect(CONSENT_PURPOSES.filter((p) => CONSENT_WORDING[p].required)).toEqual(["PROFILE_VISIBILITY", "OPERATIONAL_EMAIL"]);
  });
});
