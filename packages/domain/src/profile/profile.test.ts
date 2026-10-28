import { describe, expect, it } from "vitest";
import { validateAssignmentDates } from "./index.js";

describe("validateAssignmentDates", () => {
  it.each([
    [{ startDate: "2025-01-01", endDate: null }, null],
    [{ startDate: "2025-01-01", endDate: "2025-01-01" }, null],
    [{ startDate: "2025-01-01", endDate: "2025-06-30" }, null],
    [{ startDate: "2025-02-01", endDate: "2025-01-31" }, "endDate: cannot be before the start date"],
    [{ startDate: "2026-12-01", endDate: null }, "startDate: cannot be in the future"],
  ])("%j -> %s", (range, expected) => expect(validateAssignmentDates(range, "2026-10-24")).toBe(expected));
});
