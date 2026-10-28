import { describe, expect, it } from "vitest";
import { diffCvExtraction, isMaterialCvKey, type FieldValue } from "./index.js";

const f = (id: string, key: string, value: string): FieldValue => ({ id, key, value });

describe("isMaterialCvKey", () => {
  it.each([
    ["currentRole", true],
    ["roleDates", true],
    ["skill", true],
    ["clearance", true],
    ["headline", false],
    ["location", false],
  ])("%s -> %s", (key, expected) => expect(isMaterialCvKey(key)).toBe(expected));
});

describe("diffCvExtraction", () => {
  it("proposes nothing when the CV agrees, ignoring case and spacing", () => {
    expect(diffCvExtraction([f("a", "currentRole", "Platform  Engineer"), f("b", "skill", "Go")], [f("n1", "currentRole", "platform engineer"), f("n2", "skill", "GO")])).toEqual([]);
  });
  it("flags a changed role as material", () => {
    const [c] = diffCvExtraction([f("a", "currentRole", "Engineer")], [f("n", "currentRole", "Lead Engineer")]);
    expect(c).toMatchObject({ key: "currentRole", kind: "CHANGED", material: true, previous: { id: "a" }, proposed: { id: "n" } });
  });
  it("flags a changed headline as non-material but still a proposal", () => {
    const [c] = diffCvExtraction([f("a", "headline", "Dev")], [f("n", "headline", "Senior dev")]);
    expect(c).toMatchObject({ kind: "CHANGED", material: false });
  });
  it("proposes added and removed skills", () => {
    const out = diffCvExtraction([f("a", "skill", "Go"), f("b", "skill", "Java")], [f("n1", "skill", "Go"), f("n2", "skill", "Rust")]);
    expect(out.map((c) => [c.kind, (c.proposed ?? c.previous)?.value])).toEqual([["ADDED", "Rust"], ["REMOVED", "Java"]]);
  });
  it("does not remove skills when the new CV lists none", () => {
    expect(diffCvExtraction([f("a", "skill", "Go")], [f("n", "headline", "Dev")])).toEqual([{ key: "headline", kind: "ADDED", material: false, previous: null, proposed: f("n", "headline", "Dev") }]);
  });
  it("does not withdraw a single-valued field the new CV omits", () => {
    expect(diffCvExtraction([f("a", "clearance", "SC")], [])).toEqual([]);
  });
  it("proposes a first-time value as ADDED", () => {
    expect(diffCvExtraction([], [f("n", "clearance", "SC")])).toEqual([{ key: "clearance", kind: "ADDED", material: true, previous: null, proposed: f("n", "clearance", "SC") }]);
  });
});
