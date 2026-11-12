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
  let details: Record<string, unknown> = { securityClearance: "NO", ir35Status: "EITHER", workPattern: "HYBRID" };
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
      if (path === "/me/profile/details" && method === "PUT") {
        details = route.request().postDataJSON() as Record<string, unknown>;
        return route.fulfill(json(details));
      }
      if (path === "/cv/uploads")
        return route.fulfill(json({ uploadId: "up2", uploadUrl: "/__e2e/upload", method: "PUT", headers: {}, expiresInSeconds: 60, maxBytes: 10485760 }));
      if (path === "/cv/uploads/up2/complete") return route.fulfill(json({ uploadId: "up2", status: "READY", message: null }));
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
        return route.fulfill(json(details));
      case "/me/assignments":
        return route.fulfill(json({ items: [{ id: "a1", role: "Test Lead", clientName: "Acme Bank", startDate: "2024-01-01", endDate: null }] }));
      case "/me/cv/versions":
        return route.fulfill(
          json({ items: opts.cv ? [{ id: "v1", versionNumber: 1, uploadId: "up1", createdAt: "2026-11-01T09:00:00Z", pendingChanges: 0 }] : [] }),
        );
      case "/me/cv/changes":
        return route.fulfill(json({ items: [] }));
      case "/cv/uploads/up1/download":
        return route.fulfill(json({ url: "/__e2e/cv.pdf", expiresInSeconds: 60, inline: new URL(route.request().url()).searchParams.get("disposition") === "inline" }));
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
  await expect(page.getByRole("region", { name: "Preferred roles & experience" })).toHaveCSS("border-left-color", TONES.RED);
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

  // View asks the API for an inline PDF and opens it in a new tab; Download asks for the default attachment.
  const [viewRequest, popup] = await Promise.all([
    page.waitForRequest((r) => r.url().includes("/cv/uploads/up1/download")),
    page.waitForEvent("popup"),
    page.getByRole("button", { name: "View CV" }).click(),
  ]);
  expect(new URL(viewRequest.url()).searchParams.get("disposition")).toBe("inline");
  await popup.waitForURL(/__e2e\/cv\.pdf$/);

  const [downloadRequest, download] = await Promise.all([
    page.waitForRequest((r) => r.url().includes("/cv/uploads/up1/download")),
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download CV" }).click(),
  ]);
  expect(new URL(downloadRequest.url()).searchParams.has("disposition")).toBe(false);
  expect(download.suggestedFilename()).toBe("cv.pdf");

  await page.getByRole("link", { name: "Replace CV" }).click();
  await expect(page).toHaveURL(/\/my-loop\/cv$/);
});

test("CV & documents: Upload CV is enabled once a valid file is chosen, then uploads it", async ({ page }) => {
  const calls = await stubApi(page, { colour: "RED", label: "In Contract", endDate: "2027-01-07", cv: true });
  await page.goto("/my-loop/cv");
  const section = page.getByRole("region", { name: "Replace your CV" }).or(page.locator("section", { hasText: "Replace your CV" })).first();
  const upload = section.getByRole("button", { name: "Upload CV" });
  const chosen = section.getByTestId("cv-chosen");

  // Nothing chosen: disabled, and the page says why.
  await expect(upload).toBeDisabled();
  await expect(chosen).toHaveText("No file chosen");
  await expect(section.getByText(/enabled once you have chosen one/)).toBeVisible();
  await expect(section.getByText("Choose a file", { exact: true })).toBeVisible();

  // An unsupported file keeps it disabled and shows the problem.
  await section.getByLabel("Choose a CV").setInputFiles({ name: "cv.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await expect(upload).toBeDisabled();
  await expect(section.getByRole("alert")).toContainText("PDF, DOC or DOCX");

  // A valid file enables it and shows the name.
  await section.getByLabel("Choose a CV").setInputFiles({ name: "cv.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
  await expect(upload).toBeEnabled();
  await expect(chosen).toHaveText("cv.pdf");

  await upload.click();
  await expect(upload).toBeDisabled();
  await expect(chosen).toHaveText("No file chosen");
  expect(calls.some((c) => c.method === "POST" && c.path === "/cv/uploads")).toBe(true);
  expect(calls.some((c) => c.method === "POST" && c.path === "/cv/uploads/up2/complete")).toBe(true);
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

test("Edit my profile has one Save and one Cancel; Save saves every section and closes", async ({ page }) => {
  const calls = await stubApi(page, { colour: "RED", label: "In Contract", endDate: "2027-01-07", cv: true });
  await page.goto("/my-loop");

  await page.getByRole("region", { name: "Profile summary" }).getByRole("button", { name: "Edit my profile" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit my profile" });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/my-loop$/);
  await expect(dialog.getByLabel("Full name")).toHaveValue("Test Contractor");
  await expect(dialog.getByLabel("Professional title")).toHaveValue("Senior Tester");
  await expect(dialog.getByLabel("Key skills (comma separated)")).toHaveValue("UAT, Penetration testing, Test strategy, Automation, Selenium");
  await expect(dialog.getByLabel("Target day rate (£)")).toHaveValue("500"); // the preferences are in the same editor

  // Exactly one Save and one Cancel, whichever section is edited.
  await expect(dialog.getByRole("button", { name: /^Save/ })).toHaveCount(1);
  await expect(dialog.getByRole("button", { name: "Save changes" })).toHaveCount(1);
  await expect(dialog.getByRole("button", { name: "Cancel" })).toHaveCount(1);

  await dialog.getByLabel("Professional title").fill("Principal Tester");
  await dialog.getByLabel("Target day rate (£)").fill("550");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toHaveCount(0); // Save exits
  expect(calls.find((c) => c.path === "/me/profile/manual")?.body).toMatchObject({ headline: "Principal Tester" });
  const joinPuts = calls.filter((c) => c.path === "/me/profile/join" && c.method === "PUT").map((c) => c.body);
  expect(joinPuts.some((b) => (b as { targetDayRatePence?: number }).targetDayRatePence === 55000)).toBe(true);
  expect(joinPuts.some((b) => (b as { title?: string }).title === "Principal Tester")).toBe(true);
  expect(calls.some((c) => c.path === "/me/profile/details" && c.method === "PUT")).toBe(true);

  // Cancel and Close discard.
  calls.length = 0;
  const open = () => page.getByRole("region", { name: "Profile summary" }).getByRole("button", { name: "Edit my profile" }).click();
  await open();
  await dialog.getByLabel("Professional title").fill("Discarded");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await open();
  await dialog.getByRole("button", { name: "✕ Close" }).click();
  await expect(dialog).toHaveCount(0);
  expect(calls).toHaveLength(0);
});

test("an invalid edit keeps the editor open and saves nothing", async ({ page }) => {
  const calls = await stubApi(page, { colour: "RED", label: "In Contract", endDate: "2027-01-07", cv: true });
  await page.goto("/my-loop");
  await page.getByRole("button", { name: "Edit professional details" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Edit professional details" });
  await dialog.getByLabel("Key skills (comma separated)").fill("UAT");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog.getByRole("alert")).toContainText("at least 5 relevant skills");
  await expect(dialog).toBeVisible();
  expect(calls).toHaveLength(0);
});

test("each pane has its own edit button that opens its own editor, each with one Save and one Cancel", async ({ page }) => {
  const calls = await stubApi(page, { colour: "RED", label: "In Contract", endDate: "2027-01-07", cv: true });
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto("/my-loop");

  // Same tiles as the prototype: hero, three fact tiles, then one Professional profile panel holding five cards.
  // Skills are chips directly under its heading (no tile of their own), and there is no Rewards and Founding tile.
  await expect(page.getByRole("group", { name: "Key facts" }).locator("> div")).toHaveCount(3);
  const panel = page.getByRole("region", { name: "Professional profile" });
  await expect(panel.getByRole("region")).toHaveCount(5);
  for (const name of ["Preferred roles & experience", "Current situation", "Locations, work pattern & travel", "CV & profile photograph", "Work history & qualifications"])
    await expect(panel.getByRole("region", { name }), name).toBeVisible();
  await expect(page.getByRole("region", { name: "Skills" })).toHaveCount(0);
  await expect(panel.getByText("UAT", { exact: true })).toBeVisible();
  await expect(page.getByText("Rewards and Founding status")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Edit (Skills|Current situation)/ })).toHaveCount(0); // no generic per-card "✎ Edit"

  const dialogs = [
    { open: () => panel.getByRole("button", { name: "Update availability" }).click(), title: "Update availability", has: /Availability status|Expected contract end/, lacks: "Full name" },
    { open: () => panel.getByRole("region", { name: "Preferred roles & experience" }).getByRole("button", { name: "Edit professional details" }).click(), title: "Edit professional details", has: "Full name", lacks: "Target day rate (£)" },
    { open: () => panel.getByRole("region", { name: "Work history & qualifications" }).getByRole("button", { name: "Edit professional details" }).click(), title: "Edit professional details", has: "Qualifications & certifications", lacks: "Target day rate (£)" },
    { open: () => panel.getByRole("button", { name: "Edit locations & preferences" }).click(), title: "Edit locations & working preferences", has: "Target day rate (£)", lacks: "Full name" },
    { open: () => panel.getByRole("button", { name: "Add photograph" }).click(), title: "Change profile photograph", has: null, lacks: "Full name" },
  ];
  for (const d of dialogs) {
    await d.open();
    const dialog = page.getByRole("dialog", { name: d.title });
    await expect(dialog, d.title).toBeVisible();
    if (d.has) await expect(dialog.getByLabel(d.has).first(), d.title).toBeVisible();
    await expect(dialog.getByLabel(d.lacks), d.title).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Save changes" }), d.title).toHaveCount(1);
    await expect(dialog.getByRole("button", { name: "Cancel" }), d.title).toHaveCount(1);
    await expect(dialog.getByRole("button", { name: /^Save preferences$/ }), d.title).toHaveCount(0);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog, d.title).toHaveCount(0);
  }
  expect(calls).toHaveLength(0);

  // The Work history card's button is the prototype's "Edit professional details" (not a link to the assignments screen).
  await expect(panel.getByRole("link", { name: "Edit work history" })).toHaveCount(0);
  await panel.getByRole("region", { name: "Work history & qualifications" }).getByRole("button", { name: "Edit professional details" }).click();
  const professional = page.getByRole("dialog", { name: "Edit professional details" });
  for (const label of ["Professional summary", "Qualifications & certifications"]) await expect(professional.getByLabel(label), label).toBeVisible();
  await expect(professional.getByText("Work history", { exact: true })).toBeVisible();
  await expect(professional.getByText(/Test Lead · Acme Bank/)).toBeVisible();
  // Assignments keep their own screen; the editor links to it.
  await professional.getByRole("link", { name: "Add or edit assignments" }).click();
  await expect(page).toHaveURL(/\/my-loop\/assignments$/);
});

test("professional summary and qualifications are edited in the professional editor, saved, and shown on the page", async ({ page }) => {
  const calls = await stubApi(page, { colour: "RED", label: "In Contract", endDate: "2027-01-07", cv: true });
  await page.goto("/my-loop");
  const panel = page.getByRole("region", { name: "Professional profile" });
  await expect(panel.getByText("Add your professional summary.")).toBeVisible();
  await expect(panel.getByText("Add qualifications and certifications.")).toBeVisible();

  await panel.getByRole("region", { name: "Work history & qualifications" }).getByRole("button", { name: "Edit professional details" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit professional details" });
  await dialog.getByLabel("Professional summary").fill("Test lead with fifteen years in regulated finance.");
  await dialog.getByLabel("Qualifications & certifications").fill("ISTQB Advanced Test Manager");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toHaveCount(0);

  const put = calls.find((c) => c.path === "/me/profile/details" && c.method === "PUT")?.body;
  expect(put).toMatchObject({ summary: "Test lead with fifteen years in regulated finance.", qualifications: "ISTQB Advanced Test Manager", ir35Status: "EITHER" });
  await expect(panel.getByText("Test lead with fifteen years in regulated finance.")).toBeVisible();
  await expect(panel.getByText("ISTQB Advanced Test Manager")).toBeVisible();
  await expect(panel.getByText("Add your professional summary.")).toHaveCount(0);
});

test("the app box offers a button to get the app", async ({ page }) => {
  await stubApi(page, { colour: "RED", label: "In Contract", endDate: "2027-01-07", cv: true });
  await page.goto("/my-loop");
  const box = page.locator("#loop-app");
  await expect(box.getByText("LOOP lives on your phone")).toBeVisible();
  // Store links appear once configured (VITE_IOS_APP_URL / VITE_ANDROID_APP_URL); until then the button opens the Get the app page.
  const action = box.getByRole("link").first();
  await expect(action).toBeVisible();
  await expect(action).toHaveText(/Get the app|Download on the App Store|Get it on Google Play/);
  await expect(action).toHaveCSS("background-color", "rgb(202, 255, 53)");
  await expect(action).toHaveCSS("border-top-left-radius", "8px");
});

test("Locations & preferences saves from its own editor, then closes", async ({ page }) => {
  const calls = await stubApi(page, { colour: "RED", label: "In Contract", endDate: "2027-01-07", cv: true });
  await page.goto("/my-loop");
  await page.getByRole("button", { name: "Edit locations & preferences" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit locations & working preferences" });
  await dialog.getByLabel("Target day rate (£)").fill("620");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toHaveCount(0);
  const puts = calls.filter((c) => c.path === "/me/profile/join" && c.method === "PUT").map((c) => c.body as { targetDayRatePence?: number });
  expect(puts.some((b) => b.targetDayRatePence === 62000)).toBe(true);
  expect(calls.some((c) => c.path === "/me/profile/manual")).toBe(false); // professional details untouched
});

test("Get the LOOP app scrolls to the app box", async ({ page }) => {
  await stubApi(page, { colour: "RED", label: "In Contract", endDate: "2027-01-07", cv: true });
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto("/my-loop");
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

test("a photograph is staged until Save changes, then uploaded; Cancel discards it", async ({ page }) => {
  const calls = await stubApi(page, { colour: "RED", label: "In Contract", endDate: "2027-01-07", cv: true });
  await page.goto("/my-loop");
  const photo = { name: "me.png", mimeType: "image/png", buffer: PNG };

  // Cancel: chosen but never saved, so nothing is uploaded.
  await page.getByRole("button", { name: "Add photograph" }).click();
  const dialog = page.getByRole("dialog", { name: "Change profile photograph" });
  await dialog.locator('input[type="file"]').setInputFiles(photo);
  await expect(dialog.getByText("Your photo will be saved when you choose Save changes.")).toBeVisible();
  expect(calls).toHaveLength(0);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  expect(calls).toHaveLength(0);
  await expect(page.getByRole("img", { name: "Profile photograph" })).toHaveCount(0);

  // Save: uploads, closes and the page shows it.
  await page.getByRole("button", { name: "Add photograph" }).click();
  await dialog.locator('input[type="file"]').setInputFiles(photo);
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toHaveCount(0);
  expect(calls.find((c) => c.path === "/me/photo/presign")?.body).toMatchObject({ mimeType: "image/png", sizeBytes: PNG.length });
  expect(calls.find((c) => c.path === "/me/photo/complete")?.body).toMatchObject({ objectKey: "photos/c1/abc" });
  await expect(page.getByRole("img", { name: "Profile photograph" })).toBeVisible();

  // Remove is staged too.
  calls.length = 0;
  await page.getByRole("button", { name: "Change photograph" }).click();
  await dialog.getByRole("button", { name: "Remove photo" }).click();
  await expect(dialog.getByText("Your photo will be removed when you choose Save changes.")).toBeVisible();
  expect(calls).toHaveLength(0);
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toHaveCount(0);
  expect(calls.some((c) => c.method === "DELETE" && c.path === "/me/photo")).toBe(true);
  await expect(page.getByRole("img", { name: "Profile photograph" })).toHaveCount(0);
});

test("an unsupported photograph is refused before anything is uploaded", async ({ page }) => {
  const calls = await stubApi(page, { colour: "RED", label: "In Contract", endDate: "2027-01-07", cv: true });
  await page.goto("/my-loop");
  await page.getByRole("button", { name: "Add photograph" }).click();
  const dialog = page.getByRole("dialog", { name: "Change profile photograph" });
  await dialog.locator('input[type="file"]').setInputFiles({ name: "me.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") });
  await expect(dialog.getByText("Please choose a JPG, PNG or WebP image under 3 MB.")).toBeVisible();
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toHaveCount(0);
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
  await expect(page.getByRole("button", { name: "Edit professional details" })).toHaveCount(2); // Preferred roles and Work history cards

  // The editors use the same look.
  await edit.click();
  const dialog = page.getByRole("dialog", { name: "Edit my profile" });
  await expect(dialog).toHaveCSS("font-family", /Arial/);
  await expect(dialog.getByText("Only save the details you want to change.")).toBeVisible();
  const save = dialog.getByRole("button", { name: "Save changes" });
  await expect(save).toHaveCSS("border-top-left-radius", "8px");
  await expect(save).toHaveCSS("background-color", "rgb(202, 255, 53)");
  await expect(save).toHaveCSS("padding", "10px 15px");
  const cancel = dialog.getByRole("button", { name: "Cancel" });
  await expect(cancel).toHaveCSS("border-top-left-radius", "8px");
  await expect(cancel).toHaveCSS("background-color", "rgb(27, 43, 50)");
  await expect(dialog.getByRole("button", { name: "✕ Close" })).toHaveCSS("padding", "6px 10px");
});
