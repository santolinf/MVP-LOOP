import { expect, test } from "@playwright/test";

// Spec C2 acceptance journey, in the V33 reference order (issue #18):
// eligibility -> CV upload -> profile review -> account -> availability -> preferences -> GO LIVE -> get the app -> My LOOP -> edit my profile.
// Needs the API, Postgres, MinIO, ClamAV and Mailpit (docker compose up -d), so it only runs with E2E_API=1.
// The sign-in code is read from Mailpit's HTTP API; there is no test-only bypass in the product.
const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";

test.skip(!process.env.E2E_API, "@api journey: set E2E_API=1 with the API stack running");

async function otpFor(email: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const found = (await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json()) as {
      messages?: { ID: string }[];
    };
    const id = found.messages?.[0]?.ID;
    if (id) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()) as { Text?: string };
      const code = msg.Text?.match(/\b(\d{6})\b/)?.[1];
      if (code) return code;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("No sign-in code arrived in Mailpit");
}

test("@api new contractor follows the V33 journey from eligibility to My LOOP", async ({ page }) => {
  const stamp = Date.now();
  const email = `e2e+${stamp}@example.com`;
  const mobile = `07700 9${String(stamp).slice(-5)}`;
  const step = (n: number) => expect(page.getByText(`Step ${n} of 6`, { exact: true })).toBeVisible();

  // 1. Eligibility, then CV upload.
  await page.goto("/join");
  await page.getByRole("group", { name: /UK based/ }).getByLabel("Yes").check();
  await page.getByRole("group", { name: /right to work/ }).getByLabel("Yes").check();
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page).toHaveURL(/\/join\/cv$/);
  await step(1);
  await page.locator('input[type="file"]').setInputFiles({
    name: "cv.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"),
  });
  await page.getByRole("button", { name: /Continue/ }).click();

  // 2. Profile review. Upload, malware scan and promotion all happen before this navigation, so allow for them.
  // CV auto-population is deferred, so the contractor types the details; every starred field is required.
  await expect(page).toHaveURL(/\/join\/profile\?upload=/, { timeout: 30_000 });
  await step(2);
  await expect(page.getByRole("heading", { name: "Review your CV profile" })).toBeVisible();
  await page.getByLabel("Full name").fill("Ada Lovelace");
  await page.getByLabel("Professional title").fill("Senior platform engineer");
  await page.getByLabel(/Key skills/).fill("Kubernetes, Go");
  await page.getByLabel("Your current town or city").fill("Edinburgh");
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page.getByRole("alert")).toContainText("at least 5 relevant skills");
  await expect(page.getByRole("alert")).toContainText("Confirm that your current location is correct");
  await page.getByLabel(/Key skills/).fill("Kubernetes, Go, Terraform, AWS, Linux");
  await page.getByLabel("Preferred role 1").fill("Platform Engineer");
  await page.getByLabel(/I confirm my current location is correct/).check();
  await page.getByRole("button", { name: /Continue/ }).click();

  // 3. Account: email, mobile and a one-time code; terms are not pre-ticked.
  await expect(page).toHaveURL(/\/join\/register$/);
  await step(3);
  const terms = page.getByLabel(/I agree to the Terms and Conditions/);
  await expect(terms).not.toBeChecked();
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Mobile number").fill(mobile);
  await page.getByRole("button", { name: "Email me a code" }).click();
  // Sending the email can take a few seconds when the stack is busy.
  await expect(page.getByRole("status")).toContainText(email, { timeout: 20_000 });
  await page.getByLabel(/One-time code/).fill(await otpFor(email));
  await page.getByRole("group", { name: "Did someone introduce you to LOOP?" }).getByLabel("No").check();
  await terms.check();
  await page.getByRole("button", { name: /Continue/ }).click();

  // 4. Availability (the old "About you" step no longer exists).
  await expect(page).toHaveURL(/\/join\/availability$/);
  await step(4);
  await expect(page.getByRole("heading", { name: "What's your current situation?" })).toBeVisible();
  await page.getByLabel("Available now").check();
  await page.getByRole("button", { name: /Continue/ }).click();

  // GO LIVE cannot be reached early: the server reports the missing preferences as a blocker.
  await expect(page).toHaveURL(/\/join\/preferences$/);
  await page.goto("/join/review");
  await expect(page.getByRole("status")).toContainText("Complete your contract preferences");
  await expect(page.getByRole("button", { name: /Go LIVE/ })).toBeDisabled();
  await page.goto("/join/preferences");

  // 5. Preferences: required answers block the step.
  await step(5);
  await expect(page.getByRole("heading", { name: "Your contract preferences" })).toBeVisible();
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page.getByRole("alert")).toContainText("Enter your target day rate");
  await expect(page).toHaveURL(/\/join\/preferences$/);
  await page.getByLabel(/Target day rate/).fill("600");
  await page.getByLabel(/Minimum acceptable day rate/).fill("500");
  await page.getByRole("group", { name: /IR35 preference/ }).getByLabel("Outside").check();
  await page.getByRole("group", { name: "Do you currently use an umbrella company?" }).getByLabel("No").check();
  await page.getByLabel("Scotland").check();
  await page.getByLabel(/I confirm these are the locations/).check();
  await page.getByRole("group", { name: /security clearance/ }).getByLabel("No").check();
  await page.getByRole("group", { name: /Work pattern preference/ }).getByLabel("Remote").check();
  await page.getByRole("button", { name: /Continue/ }).click();

  // 6. GO LIVE: the summary shows every answer; the accuracy box and the two required consents unlock the button.
  await expect(page).toHaveURL(/\/join\/review$/);
  await step(6);
  const summary = page.getByRole("region", { name: "Your details" });
  for (const text of ["Ada Lovelace", "Senior platform engineer", "Edinburgh", "£600/day", "£500/day", "Outside", "Scotland", "Remote"])
    await expect(summary).toContainText(text);
  const accurate = page.getByLabel(/information I have entered is accurate/);
  const choices = page.getByRole("group", { name: "Your choices" }).getByRole("checkbox");
  await expect(accurate).not.toBeChecked();
  await expect(choices).toHaveCount(2);
  for (const box of await choices.all()) await expect(box).not.toBeChecked();
  const goLive = page.getByRole("button", { name: /Go LIVE/ });
  await expect(goLive).toBeDisabled();
  await accurate.check();
  await choices.nth(0).check();
  await expect(goLive).toBeDisabled();
  await choices.nth(1).check();
  await expect(goLive).toBeEnabled();
  await goLive.click();

  // 7. Get the app: honest placeholders only, no live store links, and no separate app preview page.
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByRole("heading", { name: "Welcome to LOOP." })).toBeVisible();
  await expect(page.getByText("You're LIVE. Now stay in the LOOP.")).toBeVisible();
  await expect(page.getByText("App Store · coming soon")).toBeVisible();
  await expect(page.getByText("Google Play · coming soon")).toBeVisible();
  await expect(page.locator('a[href*="apps.apple.com"], a[href*="play.google.com"]')).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Preview contractor app/ })).toHaveCount(0);

  // 8. My LOOP shows what was entered.
  await page.getByRole("link", { name: /Continue without app/ }).click();
  await expect(page).toHaveURL(/\/my-loop$/);
  await expect(page.getByRole("heading", { name: "My Profile", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ada Lovelace" })).toBeVisible();
  await expect(page.getByText("Senior platform engineer").first()).toBeVisible();
  await expect(page.getByText("Terraform")).toBeVisible();

  // 9. Edit my profile (the reference's "Profile updates").
  await page.getByRole("navigation", { name: "My LOOP" }).getByRole("link", { name: "Edit my profile" }).click();
  await expect(page).toHaveURL(/\/my-loop\/edit$/);
  await expect(page.getByRole("heading", { name: "Edit my profile", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Update your contract end date/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Add your latest assignment/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Confirm your profile is current/ })).toBeVisible();
});
