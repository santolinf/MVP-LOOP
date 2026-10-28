import { describe, expect, it } from "vitest";
import { DEFAULT_RETURN_ROUTE, RETURN_TARGETS, isReturnTargetId, routeForReturnTarget } from "./index.js";

describe("return targets", () => {
  it.each(Object.entries(RETURN_TARGETS))("maps %s to a fixed in-site route", (id, route) => {
    expect(routeForReturnTarget(id)).toBe(route);
    expect(route.startsWith("/")).toBe(true);
    expect(route.startsWith("//")).toBe(false);
  });

  it.each([
    ["https://evil.example"],
    ["//evil.example"],
    ["/my-loop"],
    ["__proto__"],
    ["constructor"],
    ["toString"],
    [""],
    [undefined],
    [42],
    [null],
  ])("falls back to the default for %j", (value) => {
    expect(isReturnTargetId(value)).toBe(false);
    expect(routeForReturnTarget(value)).toBe(DEFAULT_RETURN_ROUTE);
  });
});
