import { expect, test } from "@playwright/test";

// Existing contractor signs in with an emailed code and resumes where they were (ADR 0002).
// Needs the API, Postgres and Mailpit, so it only runs with E2E_API=1.
const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";
const API = `${process.env.E2E_BASE_URL ?? "http://localhost:5173"}/api/v1`;

test.skip(!process.env.E2E_API, "@api sign-in: set E2E_API=1 with the API stack running");

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

/** Creates the account over the API with a cookie-less client, so the browser under test starts signed out. */
async function registerContractor(email: string, mobile: string): Promise<void> {
  const post = (path: string, body: unknown) =>
    fetch(`${API}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  expect((await post("/auth/otp/request", { email, purpose: "REGISTER", clientType: "WEB" })).status).toBe(200);
  const verified = await post("/auth/otp/verify", {
    email,
    code: await otpFor(email),
    clientType: "WEB",
    purpose: "REGISTER",
    registration: { firstName: "Grace", lastName: "Hopper", mobile, termsAccepted: true },
  });
  expect(verified.status).toBe(200);
}

test("@api signed-out visitor signs in, resumes at the page they wanted, and signs out", async ({ page }) => {
  test.setTimeout(120_000);
  const stamp = Date.now();
  const email = `signin+${stamp}@example.com`;
  await registerContractor(email, `07700 9${String(stamp).slice(-5)}`);

  // A signed-out visit to a members' page offers sign-in and remembers where to resume.
  await page.goto("/my-loop/availability");
  await expect(page.getByRole("heading", { name: "Sign in required" })).toBeVisible();
  await page.getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fmy-loop%2Favailability$/);

  await page.getByLabel("Email").fill(email);
  // Registering just sent a code, so the 60s resend cooldown applies; the page says so, then we wait it out.
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByRole("alert")).toContainText("A code was sent recently");
  await page.waitForTimeout(61_000);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByRole("status")).toContainText(email);

  // A wrong code is rejected without revealing why.
  await page.getByLabel("Your code").fill("000000");
  await page.getByLabel("Your code").press("Enter");
  await expect(page.getByRole("alert")).toContainText("That code didn't work");

  await page.getByLabel("Your code").fill(await otpFor(email));
  await page.getByLabel("Your code").press("Enter");
  await expect(page).toHaveURL(/\/my-loop\/availability$/);

  // Signed in: the header offers My LOOP instead of Log in; Sign out lives in the My LOOP sidebar.
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(nav.getByRole("link", { name: "My LOOP" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Log in" })).toHaveCount(0);
  // The members' pages sit inside the layout's <main>, so each must have exactly one main landmark.
  for (const path of ["/my-loop", "/my-loop/profile", "/join/preferences", "/join/review", "/welcome", "/my-loop/edit", "/my-loop/messages"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 }), path).toHaveCount(1);
    await expect(page.getByRole("main"), path).toHaveCount(1);
  }
  await page.goto("/my-loop");
  await page.getByRole("navigation", { name: "My LOOP" }).getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(nav.getByRole("link", { name: "Log in" })).toBeVisible();
  await page.goto("/my-loop");
  await expect(page.getByRole("heading", { name: "Sign in required" })).toBeVisible();
});

test("@api an unregistered email gets the same screen as a registered one", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(`nobody+${Date.now()}@example.com`);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByRole("status")).toContainText("If nobody+");
  await page.getByLabel("Your code").fill("123456");
  await page.getByLabel("Your code").press("Enter");
  await expect(page.getByRole("alert")).toContainText("That code didn't work");
});
