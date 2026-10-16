import { expect, test } from "@playwright/test";

// Spec C2 acceptance tests are added here.
test("landing page loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "LOOP" })).toBeVisible();
});
