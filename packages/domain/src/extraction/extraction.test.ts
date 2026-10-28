import { describe, expect, it } from "vitest";
import { excerptIsInCv, isReadableCvText, verifyExtraction, verifyField } from "./index.js";

const CV = "Jane Doe\nSenior  .NET Developer\nBuilt Azure pipelines for “Acme” — 8 years of C#.";

describe("excerptIsInCv (A4)", () => {
  it.each([
    ["Senior .NET Developer", true],
    ["senior .net developer", true],
    ["Built Azure pipelines for \"Acme\" - 8 years", true],
    ["Kubernetes expert", false],
    ["", false],
    ["   ", false],
  ])("%j -> %s", (excerpt, expected) => {
    expect(excerptIsInCv(excerpt, CV)).toBe(expected);
  });
});

describe("verifyField", () => {
  const base = { key: "skill", value: "Azure", sourceExcerpt: "Azure pipelines", confidence: 0.9 };
  it.each([
    ["ok", base, true, undefined],
    ["unknown key", { ...base, key: "salary" }, false, "UNKNOWN_KEY"],
    ["empty value", { ...base, value: "  " }, false, "EMPTY_VALUE"],
    ["invented excerpt", { ...base, sourceExcerpt: "Terraform" }, false, "NO_EVIDENCE"],
    ["low confidence", { ...base, confidence: 0.2 }, false, "LOW_CONFIDENCE"],
    ["NaN confidence", { ...base, confidence: Number.NaN }, false, "LOW_CONFIDENCE"],
  ])("%s", (_n, field, ok, reason) => {
    const r = verifyField(field, CV, 0.5);
    expect(r.ok).toBe(ok);
    if (!r.ok) expect(r.reason).toBe(reason);
  });
});

describe("verifyExtraction", () => {
  it("drops unevidenced and duplicate fields", () => {
    const r = verifyExtraction(
      [
        { key: "skill", value: "Azure", sourceExcerpt: "Azure pipelines", confidence: 0.9 },
        { key: "skill", value: "azure", sourceExcerpt: "Azure pipelines", confidence: 0.8 },
        { key: "skill", value: "Terraform", sourceExcerpt: "Terraform", confidence: 0.9 },
      ],
      CV,
      0.5,
    );
    expect(r.fields).toHaveLength(1);
    expect(r.dropped).toBe(2);
  });
});

describe("isReadableCvText", () => {
  it.each([
    ["", false],
    ["%%% ---", false],
    ["a".repeat(200), true],
  ])("%j", (t, expected) => {
    expect(isReadableCvText(t, 100)).toBe(expected);
  });
});
