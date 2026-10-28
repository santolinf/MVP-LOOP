import { describe, expect, it } from "vitest";
import { returnTargetFor, signInPathFor } from "./return-target";

// Mirrors RETURN_TARGETS in @loop/domain, which the server resolves from the signed id.
const ALLOWED = {
  MY_LOOP: "/my-loop",
  AVAILABILITY: "/my-loop/availability",
  INTRODUCE: "/introduce",
  FOUNDING: "/founding",
  JOIN_CV: "/join/cv",
} as const;

describe("returnTargetFor", () => {
  it.each(Object.entries(ALLOWED))("maps %s (%s) back to its id", (id, route) => {
    expect(returnTargetFor(route)).toBe(id);
  });

  it.each([null, undefined, "", "/", "/admin", "https://evil.example/my-loop", "//evil.example", "/my-loop/", "constructor", "__proto__"])(
    "refuses %j",
    (route) => {
      expect(returnTargetFor(route)).toBeNull();
    },
  );
});

describe("signInPathFor", () => {
  it("carries a resumable route as ?next=", () => {
    expect(signInPathFor("/my-loop/availability")).toBe("/sign-in?next=%2Fmy-loop%2Favailability");
  });

  it.each(["/welcome", "/join/review", "", null, undefined])("drops %j", (route) => {
    expect(signInPathFor(route)).toBe("/sign-in");
  });
});
