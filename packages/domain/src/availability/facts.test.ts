import { describe, expect, it } from "vitest";
import { normaliseSituation, type SituationInput } from "./facts.js";

const now = new Date("2026-10-17T12:00:00Z");
const input = (p: Partial<SituationInput>): SituationInput => ({
  employment: "CONTRACTING",
  availableFrom: null,
  contractEndDate: null,
  ...p,
});

describe("normaliseSituation (B2/B3)", () => {
  const cases: [string, SituationInput, Partial<SituationInput>, string[]][] = [
    ["permanent clears both dates", input({ employment: "PERMANENT", availableFrom: "2026-11-01", contractEndDate: "2026-12-01" }), { availableFrom: null, contractEndDate: null }, []],
    ["contracting keeps end date, clears start", input({ availableFrom: "2026-11-01", contractEndDate: "2026-12-01" }), { availableFrom: null, contractEndDate: "2026-12-01" }, []],
    ["contracting accepts an already passed end date", input({ contractEndDate: "2026-09-01" }), { contractEndDate: "2026-09-01" }, []],
    ["contracting without end date is allowed", input({}), { contractEndDate: null }, []],
    ["contracting end date beyond 3 years rejected", input({ contractEndDate: "2030-01-01" }), {}, ["contractEndDate"]],
    ["between contracts keeps start, clears end", input({ employment: "BETWEEN_CONTRACTS", availableFrom: "2026-11-01", contractEndDate: "2026-12-01" }), { availableFrom: "2026-11-01", contractEndDate: null }, []],
    ["between contracts start today is allowed", input({ employment: "BETWEEN_CONTRACTS", availableFrom: "2026-10-17" }), { availableFrom: "2026-10-17" }, []],
    ["between contracts start in the past rejected", input({ employment: "BETWEEN_CONTRACTS", availableFrom: "2026-10-16" }), {}, ["availableFrom"]],
    ["between contracts start beyond 3 years rejected", input({ employment: "BETWEEN_CONTRACTS", availableFrom: "2030-01-01" }), {}, ["availableFrom"]],
  ];
  it.each(cases)("%s", (_n, i, expected, issueFields) => {
    const r = normaliseSituation(i, now);
    expect(r.issues.map((x) => x.field)).toEqual(issueFields);
    if (issueFields.length === 0) expect(r.value).toMatchObject(expected);
  });
});
