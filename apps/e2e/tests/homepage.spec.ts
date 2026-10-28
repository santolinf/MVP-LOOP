import { expect, test } from "@playwright/test";

// Phase H smoke tests for the V33 marketing homepage.
test.describe("homepage", () => {
  test("renders sections, anchors work, no console errors, no concept artefacts", async ({ page }) => {
    const errors: string[] = [];
    // The signed-out 401 from /me is expected; Chromium reports it as a "Failed to load resource" console error.
    page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));
    // Keep the smoke test independent of a running API: any backend call is answered as a signed-out visitor.
    await page.route("**/api/v1/**", (r) => r.fulfill({ status: 401, contentType: "application/json", body: "{}" }));

    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("LOOP");
    for (const id of ["why", "how", "radar", "rewards", "network", "join"]) {
      await expect(page.locator(`#${id}`)).toBeAttached();
    }
    await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Rewards" }).click();
    await expect(page).toHaveURL(/#rewards$/);

    const body = (await page.locator("body").innerText()).toLowerCase();
    expect(body).not.toContain("concept");
    expect(errors).toEqual([]);
  });

  test("Join goes to /join and logged-out invite CTA is Join LOOP to Invite", async ({ page }) => {
    await page.route("**/api/v1/me", (r) => r.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Join LOOP to Invite" })).toHaveAttribute("href", "/join");
    await page.getByRole("main").getByRole("link", { name: /^Join LOOP/ }).first().click();
    await expect(page).toHaveURL(/\/join$/);
  });

  test("signed-in contractor sees My LOOP and Invite a Contractor", async ({ page }) => {
    await page.route("**/api/v1/me", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "c1", firstName: "Test" }) }),
    );
    await page.goto("/");
    const invite = page.getByRole("link", { name: /Invite a Contractor/ }).first();
    await expect(invite).toBeVisible();
    await expect(invite).toHaveAttribute("href", "/introduce");
    await expect(page.getByRole("link", { name: "My LOOP" })).toHaveAttribute("href", "/my-loop");
  });
});
