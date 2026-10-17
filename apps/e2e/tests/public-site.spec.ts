import { expect, test } from "@playwright/test";

test.describe("public marketing site", () => {
  test("landing page shows the hero and routes to the join flow", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.getByRole("link", { name: /^Join LOOP/ }).first().click();
    await expect(page).toHaveURL(/\/join$/);
    await expect(page.getByRole("heading", { level: 1, name: "Before we get started" })).toBeVisible();
  });

  for (const [path, heading] of [
    ["/introduce", /./],
    ["/founding", "Become a Founding Member for life"],
  ] as const) {
    test(`${path} renders`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    });
  }
});

test.describe("eligibility gate (A1)", () => {
  test("non-UK answer shows a message and blocks continuing", async ({ page }) => {
    await page.goto("/join");
    await page.getByRole("group", { name: /UK based/ }).getByLabel("No").check();
    await expect(page.getByRole("status")).toContainText("Thanks for your interest in LOOP");
    await expect(page.getByRole("button", { name: /Continue/ })).toBeDisabled();
  });

  test("UK but no right to work is rejected", async ({ page }) => {
    await page.goto("/join");
    await page.getByRole("group", { name: /UK based/ }).getByLabel("Yes").check();
    await page.getByRole("group", { name: /right to work/ }).getByLabel("No").check();
    await expect(page.getByRole("status")).toBeVisible();
    await expect(page.getByRole("button", { name: /Continue/ })).toBeDisabled();
  });

  test("eligible contractor continues to CV upload", async ({ page }) => {
    await page.goto("/join");
    await page.getByRole("group", { name: /UK based/ }).getByLabel("Yes").check();
    await page.getByRole("group", { name: /right to work/ }).getByLabel("Yes").check();
    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(page).toHaveURL(/\/join\/cv$/);
  });
});

test.describe("referral capture (B5)", () => {
  const KEY = "loop.referral.code";

  test("stores a valid ?ref= code, upper-cased", async ({ page }) => {
    await page.goto("/?ref=abcd2345");
    await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), KEY)).toBe("ABCD2345");
  });

  test("ignores malformed codes", async ({ page }) => {
    await page.goto("/?ref=%3Cscript%3E");
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBeNull();
  });
});
