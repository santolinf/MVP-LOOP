import { expect, test } from "@playwright/test";

const PAGES = ["/", "/introduce", "/founding", "/join", "/join/cv", "/join/register", "/sign-in"];

for (const path of PAGES) {
  test.describe(`a11y ${path}`, () => {
    test("has lang, one h1, a main landmark and a navigation landmark", async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("html")).toHaveAttribute("lang", "en-GB");
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(page.getByRole("main")).toHaveCount(1);
      await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
    });

    test("images have alt text and form controls have accessible names", async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      expect(await page.locator("img:not([alt])").count()).toBe(0);
      const unnamed = await page
        .locator("input:not([type=hidden]):not([type=file]), select, textarea")
        .evaluateAll((els) =>
          els.filter((el) => {
            const e = el as HTMLInputElement;
            return !(e.labels?.length || e.getAttribute("aria-label") || e.getAttribute("aria-labelledby"));
          }).length,
        );
      expect(unnamed).toBe(0);
    });
  });
}

test("skip link is the first tab stop and moves focus to main content", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#app$/);
});

test("eligibility answers are keyboard operable", async ({ page }) => {
  await page.goto("/join");
  await page.getByRole("group", { name: /UK based/ }).getByLabel("Yes").focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("group", { name: /right to work/ })).toBeVisible();
});

test("page is usable at a 375px viewport without horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const path of PAGES) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
