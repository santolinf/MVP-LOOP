import { expect, test, type Page } from "@playwright/test";

// Desktop My LOOP profile (approved desktop prototype): status-coloured cards, registration data, CV view/download/replace,
// edit entry points and the app pointer. The API is stubbed so the journey is deterministic and needs only the web dev server.

type Colour = "LIME" | "ORANGE" | "RED" | "BLUE" | "GREY";
const TONES: Record<Colour, string> = { LIME: "rgb(202, 255, 53)", ORANGE: "rgb(245, 162, 60)", RED: "rgb(232, 92, 98)", BLUE: "rgb(91, 175, 255)", GREY: "rgb(155, 167, 174)" };

const JOIN = {
  title: "Senior Tester",
  preferredRoles: ["Test Consultant"],
  additionalRoles: null,
  linkedinUrl: null,
  location: "Reading",
  locationConfirmed: true,
  noticePeriodText: "4 weeks",
  earliestStartDate: null,
  targetDayRatePence: 50000,
  minDayRatePence: 43600,
  usesUmbrella: true,
  umbrellaProvider: "Billy Umbrella",
  workLocations: [],
  otherLocations: null,
  otherPlaces: ["Reading", "Guildford"],
  londonAreas: [],
  londonOther: null,
  workLocationsConfirmed: true,
  remoteUk: true,
  workPatterns: ["REMOTE", "HYBRID"],
  hybridDays: 2,
  occasionalTravel: "YES",
};

type Call = { method: string; path: string; body: unknown };

// A 1x1 PNG, served as the stored photograph.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

async function stubApi(page: Page, opts: { colour: Colour; label: string; endDate: string | null; cv: boolean; photo?: boolean }): Promise<Call[]> {
  const calls: Call[] = [];
  let photoUrl: string | null = opts.photo ? "/__e2e/photo.png" : null;
  const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });
  const me = {
    id: "c1",
    firstName: "Test",
    lastName: "Contractor",
    live: true,
    paused: false,
    employment: "CONTRACTING",
    availableFrom: null,
    contractEndDate: opts.endDate,
    availability: { colour: opts.colour, label: opts.label, lastConfirmedAt: "2026-11-07T10:00:00Z", underlyingStatus: "UNAVAILABLE", freshnessState: "FRESH" },
  };
  await page.route("**/api/v1/**", (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    const method = route.request().method();
    if (method !== "GET") {
      calls.push({ method, path, body: route.request().postDataJSON() });
      // Echo what was written so the follow-up reads see it; the availability confirmation returns the refreshed contractor.
      if (path === "/me/availability/confirm") return route.fulfill(json(me));
      if (path === "/me/photo/presign")
        return route.fulfill(
          json({ objectKey: "photos/c1/abc", uploadUrl: "/__e2e/upload", method: "PUT", headers: { "Content-Type": "image/png" }, expiresInSeconds: 300, maxBytes: 3145728 }),
        );
      if (path === "/me/photo/complete") {
        photoUrl = "/__e2e/photo.png";
        return route.fulfill(json({ url: photoUrl, expiresInSeconds: 300 }));
      }
      if (path === "/me/photo" && method === "DELETE") {
        photoUrl = null;
        return route.fulfill(json({ url: null, expiresInSeconds: 300 }));
      }
      return route.fulfill(json(route.request().postDataJSON() ?? {}));
    }
    switch (path) {
      case "/me":
        return route.fulfill(json(me));
      case "/me/photo":
        return route.fulfill(json({ url: photoUrl, expiresInSeconds: 300 }));
      case "/me/profile/join":
        return route.fulfill(json(JOIN));
      case "/me/profile/manual":
        return route.fulfill(json({ headline: "Senior Tester", skills: ["UAT", "Penetration testing", "Test strategy", "Automation", "Selenium"] }));
      case "/me/profile/details":
        return route.fulfill(json({ securityClearance: "NO", ir35Status: "EITHER", workPattern: "HYBRID" }));
      case "/me/assignments":
        return route.fulfill(json({ items: [{ id: "a1", role: "Test Lead", clientName: "Acme Bank", startDate: "2024-01-01", endDate: null }] }));
      case "/me/cv/versions":
        return route.fulfill(
          json({ items: opts.cv ? [{ id: "v1", versionNumber: 1, uploadId: "up1", createdAt: "2026-11-01T09:00:00Z", pendingChanges: 0 }] : [] }),
        );
      case "/cv/uploads/up1/download":
        return route.fulfill(json({ url: "/__e2e/cv.pdf", expiresInSeconds: 60 }));
      case "/founding/status":
        return route.fulfill(json({ place: null, eligible: false, registeredReferrals: 1, required: 5, isCurrentProfile: true }));
      case "/rewards":
        return route.fulfill(json({ items: [] }));
      default:
        return route.fulfill(json({}, 404));
    }
  });
  await page.route("**/__e2e/photo.png", (route) => route.fulfill({ status: 200, contentType: "image/png", body: PNG }));
  await page.route("**/__e2e/upload", (route) => route.fulfill({ status: 200, body: "" }));
  await page.route("**/__e2e/cv.pdf", (route) =>
    route.fulfill({ status: 200, contentType: "application/pdf", headers: { "content-disposition": 'inline; filename="cv.pdf"' }, body: "%PDF-1.4" }),
  );
  return calls;
}

test("In Contract contractor sees the simplified, red-bordered profile with their registration data", async ({ page }) => {
  await stubApi(page, { colour: "RED", label: "In Contract", endDate: "2027-01-07", cv: true });
  await page.goto("/my-loop");

  // As in the prototype, the contractor's name is the page heading.
  await expect(page.getByRole("heading", { name: "Test Contractor", level: 1 })).toBeVisible();
  await expect(page.getByText("Senior Tester · Reading")).toBeVisible();

  // Availability label is "In Contract" with the end date, never "Unavailable".
  await expect(page.getByTestId("status-pill")).toHaveText(/In Contract/);
  await expect(page.getByText("Unavailable")).toHaveCount(0);
  await expect(page.getByText("Expected end: 7 Jan 2027")).toBeVisible();
  await expect(page.getByText("Last confirmed: 7 Nov 2026")).toBeVisible();

  // Status (not static lime) colours the card borders.
  const hero = page.getByRole("region", { name: "Profile summary" });
  await expect(hero).toHaveCSS("border-left-color", TONES.RED);
  await expect(hero).toHaveCSS("border-right-color", TONES.RED);
  await expect(page.getByRole("region", { name: "Skills" })).toHaveCSS("border-left-color", TONES.RED);
  await expect(page.getByTestId("status-pill")).toHaveCSS("color", TONES.RED);

  // Registration data is shown, not placeholders.
  await expect(page.getByText("£500 / day")).toBeVisible();
  await expect(page.getByText("Minimum £436 · IR35: Both")).toBeVisible();
  await expect(page.getByText("Remote, Hybrid", { exact: true })).toBeVisible();
  await expect(page.getByText("UAT", { exact: true })).toBeVisible();
  await expect(page.getByText("Billy Umbrella")).toBeVisible();
  await expect(page.getByText("2 per week")).toBeVisible();
  await expect(page.getByText("Occasional travel")).toBeVisible();
  await expect(page.getByText(/Test Lead/)).toBeVisible();

  // No tabs, and the removed clutter stays gone.
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await expect(page.getByText("Coming soon")).toHaveCount(0);
  await expect(page.getByText("Profile currency")).toHaveCount(0);
  await expect(page.getByText("LOOP lives on your phone")).toBeVisible();
});

test("status colour follows the confirmed availability", async ({ page }) => {
  await stubApi(page, { colour: "ORANGE", label: "Available Soon", endDate: null, cv: false });
  await page.goto("/my-loop");
  await expect(page.getByTestId("status-pill")).toHaveText(/Available Soon/);
  await expect(page.getByRole("region", { name: "Profile summary" })).toHaveCSS("border-left-color", TONES.ORANGE);
});

test("existing CV can be viewed and downloaded, and replaced through the CV page", async ({ page }) => {
  await stubApi(page, { colour: "RED", label: "In Contract", endDate: "2027-01-07", cv: true });
  await page.goto("/my-loop");

  await expect(page.getByText(/CV on file · Version 1/)).toBeVisible();

  const [popup] = await Promise.all([page.waitForEvent("popup"), page.getByRole("button", { name: "View CV" }).click()]);
  await popup.waitForURL(/__e2e\/cv\.pdf$/);

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download CV" }).click()]);
  expect(download.suggestedFilename()).toBe("cv.pdf");

  await page.getByRole("link", { name: "Replace CV" }).click();
  await expect(page).toHaveURL(/\/my-loop\/cv$/);
});

test("without a CV the view and download controls are disabled", async ({ page }) => {
  await stubApi(page, { colour: "GREY", label: "Unconfirmed", endDate: null, cv: false });
  await page.goto("/my-loop");
  await expect(page.getByText("No CV on file")).toBeVisible();
  await expect(page.getByRole("button", { name: "View CV" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Download CV" })).toBeDisabled();
});

test("Update availability opens an in-page editor, saves through the existing API and closes", async ({ page }) => {
  const calls = await stubApi(page, { colour: "RED", label: "In Contract", endDate: "2027-01-07", cv: true });
  await page.goto("/my-loop");

  await page.getByRole("region", { name: "Profile summary" }).getByRole("button", { name: "Update availability" }).click();
  const dialog = page.getByRole("dialog", { name: "Update availability" });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/my-loop$/); // an overlay on the profile, not a separate page
  await expect(dialog.getByText("An end date alone will not make you green.")).toBeVisible();

  // Escape and Cancel close without saving.
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.getByRole("region", { name: "Profile summary" }).getByRole("button", { name: "Update availability" }).click();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  expect(calls).toHaveLength(0);

  // Extending the contract end date is an explicit confirmation of the contractor's own answer.
  await page.getByRole("region", { name: "Profile summary" }).getByRole("button", { name: "Update availability" }).click();
  await dialog.getByLabel(/Expected contract end date/).fill("2027-03-31");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toHaveCount(0);
  expect(calls.find((c) => c.path === "/me/availability/confirm")?.body).toMatchObject({ employment: "CONTRACTING", contractEndDate: "2027-03-31" });
});

test("Edit my profile opens an in-page editor with the registration details and saves them", async ({ page }) => {
  const calls = await stubApi(page, { colour: "RED", label: "In Contract", endDate: "2027-01-07", cv: true });
  await page.goto("/my-loop");

  await page.getByRole("region", { name: "Profile summary" }).getByRole("button", { name: "Edit my profile" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit my profile" });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/my-loop$/);
  await expect(dialog.getByLabel("Full name")).toHaveValue("Test Contractor");
  await expect(dialog.getByLabel("Professional title")).toHaveValue("Senior Tester");
  await expect(dialog.getByLabel("Key skills (comma separated)")).toHaveValue("UAT, Penetration testing, Test strategy, Automation, Selenium");

  await dialog.getByLabel("Professional title").fill("Principal Tester");
  await dialog.getByRole("form", { name: "Professional details" }).getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toHaveCount(0);
  expect(calls.find((c) => c.path === "/me/profile/manual")?.body).toMatchObject({ headline: "Principal Tester" });
  expect(calls.find((c) => c.path === "/me/profile/join" && c.method === "PUT")?.body).toMatchObject({ title: "Principal Tester" });

  // Close discards.
  await page.getByRole("region", { name: "Profile summary" }).getByRole("button", { name: "Edit my profile" }).click();
  await page.getByRole("dialog", { name: "Edit my profile" }).getByRole("button", { name: "✕ Close" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("card edit buttons open the editors and Get the LOOP app scrolls to the app box", async ({ page }) => {
  await stubApi(page, { colour: "RED", label: "In Contract", endDate: "2027-01-07", cv: true });
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto("/my-loop");

  await page.getByRole("button", { name: "Edit Current situation" }).click();
  await expect(page.getByRole("dialog", { name: "Update availability" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Edit Skills" }).click();
  await expect(page.getByRole("dialog", { name: "Edit my profile" })).toBeVisible();
  await page.keyboard.press("Escape");

  const appBox = page.locator("#loop-app");
  await expect(appBox).not.toBeInViewport();
  await page.getByRole("region", { name: "Profile summary" }).getByRole("button", { name: "Get the LOOP app" }).click();
  await expect(appBox).toBeInViewport();
  await expect(page).toHaveURL(/\/my-loop$/);
  await expect(appBox.getByRole("link", { name: "Get the app" })).toHaveAttribute("href", "/welcome");
});

test("the stored profile photograph is shown on My LOOP, otherwise the contractor's initials", async ({ page }) => {
  await stubApi(page, { colour: "RED", label: "In Contract", endDate: "2027-01-07", cv: true, photo: true });
  await page.goto("/my-loop");
  const photo = page.getByRole("img", { name: "Profile photograph" });
  await expect(photo).toBeVisible();
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: "Change photograph" })).toBeVisible();
});

test("without a photograph My LOOP shows initials and offers to add one", async ({ page }) => {
  await stubApi(page, { colour: "RED", label: "In Contract", endDate: "2027-01-07", cv: true });
  await page.goto("/my-loop");
  await expect(page.getByRole("img", { name: "Profile photograph" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Profile summary" }).getByText("TC", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add photograph" })).toBeVisible();
});

test("a photograph can be added and removed from Edit my profile, and shows on the page", async ({ page }) => {
  const calls = await stubApi(page, { colour: "RED", label: "In Contract", endDate: "2027-01-07", cv: true });
  await page.goto("/my-loop");

  await page.getByRole("button", { name: "Add photograph" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit my profile" });
  await dialog.locator('input[type="file"]').setInputFiles({ name: "me.png", mimeType: "image/png", buffer: PNG });
  await expect(dialog.getByText("Photo saved.")).toBeVisible();
  expect(calls.find((c) => c.path === "/me/photo/presign")?.body).toMatchObject({ mimeType: "image/png", sizeBytes: PNG.length });
  expect(calls.find((c) => c.path === "/me/photo/complete")?.body).toMatchObject({ objectKey: "photos/c1/abc" });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("img", { name: "Profile photograph" })).toBeVisible();

  await page.getByRole("button", { name: "Change photograph" }).click();
  await dialog.getByRole("button", { name: "Remove photo" }).click();
  await expect(dialog.getByText("Photo removed.")).toBeVisible();
  expect(calls.some((c) => c.method === "DELETE" && c.path === "/me/photo")).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("img", { name: "Profile photograph" })).toHaveCount(0);
});

test("an unsupported photograph is refused before anything is uploaded", async ({ page }) => {
  const calls = await stubApi(page, { colour: "RED", label: "In Contract", endDate: "2027-01-07", cv: true });
  await page.goto("/my-loop");
  await page.getByRole("button", { name: "Add photograph" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit my profile" });
  await dialog.locator('input[type="file"]').setInputFiles({ name: "me.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") });
  await expect(dialog.getByText("Please choose a JPG, PNG or WebP image under 3 MB.")).toBeVisible();
  expect(calls).toHaveLength(0);
});

test("matches the prototype: Arial type, 8px-radius buttons and its static text", async ({ page }) => {
  await stubApi(page, { colour: "RED", label: "In Contract", endDate: "2027-01-07", cv: true });
  await page.goto("/my-loop");
  const hero = page.getByRole("region", { name: "Profile summary" });

  // Fonts: the prototype's Arial at 15px, not the marketing site's Inter.
  await expect(hero).toHaveCSS("font-family", /Arial/);
  await expect(hero).toHaveCSS("font-size", "15px");
  await expect(page.getByRole("heading", { name: "Test Contractor", level: 1 })).toHaveCSS("font-size", "32px");
  await expect(page.getByRole("heading", { name: "Professional profile" })).toHaveCSS("font-size", "20px");

  // Buttons: .btn is 8px radius, 10px 15px padding, bold; .primary is lime; .small is 6px 10px at 12px.
  const update = hero.getByRole("button", { name: "Update availability" });
  await expect(update).toHaveCSS("border-top-left-radius", "8px");
  await expect(update).toHaveCSS("padding", "10px 15px");
  await expect(update).toHaveCSS("font-weight", "700");
  await expect(update).toHaveCSS("background-color", "rgb(202, 255, 53)");
  const edit = hero.getByRole("button", { name: "Edit my profile" });
  await expect(edit).toHaveCSS("border-top-left-radius", "8px");
  await expect(edit).toHaveCSS("background-color", "rgb(27, 43, 50)");
  await expect(edit).toHaveCSS("border-top-color", "rgb(71, 97, 106)");
  const small = page.getByRole("button", { name: "View CV" });
  await expect(small).toHaveCSS("padding", "6px 10px");
  await expect(small).toHaveCSS("font-size", "12px");
  await expect(small).toHaveCSS("border-top-left-radius", "8px");

  // Static text carried over from the prototype.
  for (const text of [
    "Your professional profile",
    "Desktop is for registration and occasional profile edits",
    "Your profile is LIVE. Keep your availability current in the LOOP app.",
    "Information supplied during registration. Edit it whenever your circumstances change.",
    "Preferred roles & experience",
    "Professional summary",
    "Add your professional summary.",
    "Security clearance",
    "Not security cleared (self-declared)",
    "Current situation",
    "Expected end dates never automatically mark you Available Now.",
    "Locations, work pattern & travel",
    "CV & profile photograph",
    "Work history & qualifications",
    "Qualifications & certifications",
    "Add qualifications and certifications.",
    "LOOP lives on your phone",
    "One-tap availability updates, push reminders, invitations and messages belong in the contractor app.",
  ]) {
    await expect(page.getByText(text, { exact: true }).first(), text).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Edit professional details" })).toBeVisible();

  // The editors use the same look.
  await edit.click();
  const dialog = page.getByRole("dialog", { name: "Edit my profile" });
  await expect(dialog).toHaveCSS("font-family", /Arial/);
  await expect(dialog.getByText("Only save the details you want to change.")).toBeVisible();
  const save = dialog.getByRole("form", { name: "Professional details" }).getByRole("button", { name: "Save changes" });
  await expect(save).toHaveCSS("border-top-left-radius", "8px");
  await expect(save).toHaveCSS("background-color", "rgb(202, 255, 53)");
  await expect(dialog.getByRole("button", { name: "✕ Close" })).toHaveCSS("padding", "6px 10px");
  await expect(dialog.getByRole("button", { name: "Save preferences" })).toHaveCSS("border-top-left-radius", "8px");
});
