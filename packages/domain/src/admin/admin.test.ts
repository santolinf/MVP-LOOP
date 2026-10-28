import { describe, expect, it } from "vitest";
import { PERMISSIONS, hasPermission, isIpAllowed, isStaffRole, mayApproveReward, permissionsFor, validateTemplate } from "./index.js";

describe("staff permissions (deny by default)", () => {
  it.each([
    ["READ_ONLY", "contractors.read", true],
    ["READ_ONLY", "availability.confirm", false],
    ["READ_ONLY", "audit.read", false],
    ["OPERATOR", "availability.confirm", true],
    ["OPERATOR", "rewards.verify", true],
    ["OPERATOR", "rewards.approve", false],
    ["OPERATOR", "introductions.override", false],
    ["OPERATOR", "config.write", false],
    ["OPERATOR", "staff.manage", false],
    ["ADMIN", "rewards.approve", true],
    ["ADMIN", "introductions.override", true],
    ["ADMIN", "staff.manage", true],
    ["SUPERUSER", "contractors.read", false],
    ["", "contractors.read", false],
  ] as const)("%s / %s -> %s", (role, permission, expected) => {
    expect(hasPermission(role, permission)).toBe(expected);
  });

  it("gives admin every permission and an unknown role none", () => {
    expect(permissionsFor("ADMIN")).toEqual([...PERMISSIONS]);
    expect(permissionsFor("nope")).toEqual([]);
    expect(isStaffRole("OPERATOR")).toBe(true);
    expect(isStaffRole("operator")).toBe(false);
  });

  it("never lets read-only change anything", () => {
    expect(permissionsFor("READ_ONLY").filter((p) => !p.endsWith(".read"))).toEqual([]);
  });
});

describe("mayApproveReward (B7 four-eyes)", () => {
  const base = { approverId: "s1", requesterId: "s1", amountPence: 5000, thresholdPence: 0 };
  it.each([
    ["different people", { requesterId: "s2" }, true],
    ["same person, amount above threshold", {}, false],
    ["same person, amount equal to threshold", { thresholdPence: 5000 }, true],
    ["same person, amount below threshold", { thresholdPence: 10_000 }, true],
    ["no recorded requester", { requesterId: null }, true],
    ["same person, unknown amount counts as zero", { amountPence: null }, true],
  ] as const)("%s", (_n, over, expected) => {
    expect(mayApproveReward({ ...base, ...over })).toBe(expected);
  });
});

describe("validateTemplate", () => {
  const ok = { kind: "REMINDER_EMAIL" as const, subject: "Hi {{firstName}}", body: ["Your contract ends on {{ endDate }}."] };
  it("accepts allowed merge fields", () => expect(validateTemplate(ok)).toEqual([]));
  it("rejects unknown and malformed merge fields", () => {
    expect(validateTemplate({ ...ok, body: ["Hello {{surname}}"] })[0]).toContain("unknown merge field {{surname}}");
    expect(validateTemplate({ ...ok, body: ["Hello {{firstName"] })).toContain("paragraph 1: malformed merge field");
  });
  it("limits LOOP messages to the first name", () => {
    expect(validateTemplate({ kind: "LOOP_MESSAGE", subject: "s", body: ["{{endDate}}"] })).toHaveLength(1);
  });
  it("requires a single-line subject and a body", () => {
    expect(validateTemplate({ ...ok, subject: "a\nb" })).toContain("subject must be a single line");
    expect(validateTemplate({ ...ok, subject: " " })).toContain("subject is required");
    expect(validateTemplate({ ...ok, body: [" "] })).toContain("body is required");
  });
});

describe("isIpAllowed", () => {
  it.each([
    [undefined, [], true],
    ["1.2.3.4", [], true],
    ["1.2.3.4", ["1.2.3.4"], true],
    ["::ffff:1.2.3.4", ["1.2.3.4"], true],
    ["1.2.3.5", ["1.2.3.4"], false],
    ["10.1.2.3", ["10.1.0.0/16"], true],
    ["10.2.2.3", ["10.1.0.0/16"], false],
    [undefined, ["10.1.0.0/16"], false],
    ["10.1.2.3", ["10.1.0.0/33"], false],
    ["2001:db8::1", ["2001:DB8::1"], true],
  ] as const)("%s in %j -> %s", (ip, list, expected) => {
    expect(isIpAllowed(ip, list)).toBe(expected);
  });
});
