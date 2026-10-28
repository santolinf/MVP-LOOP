import { expect, test } from "@playwright/test";

// Spec C2 acceptance journey: CV -> profile -> register -> availability -> LIVE.
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

test("@api new contractor goes from CV to LIVE", async ({ page }) => {
  const stamp = Date.now();
  const email = `e2e+${stamp}@example.com`;
  const mobile = `07700 9${String(stamp).slice(-5)}`;

  // 1. Eligibility, then CV upload.
  await page.goto("/join");
  await page.getByRole("group", { name: /UK based/ }).getByLabel("Yes").check();
  await page.getByRole("group", { name: /right to work/ }).getByLabel("Yes").check();
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page).toHaveURL(/\/join\/cv$/);
  await page.locator('input[type="file"]').setInputFiles({
    name: "cv.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"),
  });
  await page.getByRole("button", { name: /Continue/ }).click();

  // 2. Profile review. Extraction is a stub today, so either outcome must let the contractor continue.
  // Upload, malware scan and promotion all happen before this navigation, so allow for them.
  await expect(page).toHaveURL(/\/join\/profile\?upload=/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Review your profile" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Continue/ })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("link", { name: /Continue/ }).click();

  // 3. Register with the AI disclosure visible; terms are not pre-ticked; the emailed code completes it.
  await expect(page).toHaveURL(/\/join\/register$/);
  await expect(page.getByRole("note", { name: "How AI is used" })).toContainText("AI reads your CV");
  const terms = page.getByLabel(/I accept the LOOP terms/);
  await expect(terms).not.toBeChecked();
  await page.getByLabel("First name").fill("Ada");
  await page.getByLabel("Last name").fill("Lovelace");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("UK mobile number").fill(mobile);
  await terms.check();
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByRole("status")).toContainText(email);
  await page.getByLabel("Your code").fill(await otpFor(email));
  await page.getByRole("button", { name: "Create account" }).click();

  // 4. About you (typed headline), then availability.
  await expect(page).toHaveURL(/\/join\/details$/);
  await page.getByLabel("Headline").fill("Senior platform engineer");
  await page.getByLabel(/Skills/).fill("Kubernetes, Go");
  await page.getByRole("button", { name: /Save and continue/ }).click();
  await expect(page).toHaveURL(/\/join\/availability$/);
  await page.getByLabel("Between contracts").check();
  await page.getByRole("button", { name: "Confirm availability" }).click();

  // 5. Review: GO LIVE stays disabled until the two required consents are ticked; none is pre-ticked.
  await expect(page).toHaveURL(/\/join\/review$/);
  await expect(page.getByRole("region", { name: "What agencies will see" })).toContainText("Ada Lovelace");
  await expect(page.getByRole("region", { name: "What agencies will see" })).toContainText("Senior platform engineer");
  const boxes = page.getByRole("group", { name: "Your choices" }).getByRole("checkbox");
  await expect(boxes).toHaveCount(4);
  for (const box of await boxes.all()) await expect(box).not.toBeChecked();
  const goLive = page.getByRole("button", { name: "Go LIVE" });
  await expect(goLive).toBeDisabled();
  await boxes.nth(0).check();
  await expect(goLive).toBeDisabled();
  await boxes.nth(1).check();
  await expect(goLive).toBeEnabled();
  await goLive.click();

  // 6. Welcome (web only: no app download or QR prompts).
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByRole("heading", { name: /Welcome to LOOP, Ada/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to My LOOP" })).toBeVisible();
  await expect(page.getByText(/app store|google play|qr code|download the app/i)).toHaveCount(0);
});
