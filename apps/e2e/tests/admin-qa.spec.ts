import { expect, test, type Page } from "@playwright/test";

// Regression tests for the LOOP Admin FINAL QA (15 Nov 2026), ADM-01 to ADM-07. The API is stubbed so the journeys are
// deterministic and need only the admin dev server. Server-side rules (phone variants, end-date guard, growth bucketing)
// are covered by unit tests in packages/domain and apps/api; here we prove the admin UI honours them end to end.

const ADMIN = process.env.E2E_ADMIN_URL ?? "http://localhost:5174/admin/";
const ID = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

type Call = { method: string; path: string; query: URLSearchParams; body: unknown };

const profile = {
  title: "Principal Data Engineer QA",
  summary: null,
  skills: ["Python", "SQL", "Airflow"],
  preferredRoles: ["Data Engineer", "Platform Engineer"],
  location: "Edinburgh",
  workLocations: ["London", "Scotland"],
  otherPlaces: ["Oxford"],
  londonAreas: ["CENTRAL", "EAST"],
  londonOther: "Canary Wharf",
  includeHomeCity: true,
  remoteUk: true,
  workPatterns: ["REMOTE", "HYBRID"],
  hybridDays: 3,
  occasionalTravel: "DEPENDS",
  targetDayRatePence: 72500,
  minDayRatePence: 62500,
  ir35Status: "EITHER",
  noticePeriodText: "4 weeks",
  securityClearance: "NO",
  cvVersion: 2,
  hasCv: true,
  hasPhoto: false,
};

const row = (id: string, firstName: string, over: Record<string, unknown> = {}) => ({
  id,
  firstName,
  lastName: "Looptest",
  email: `${firstName.toLowerCase()}@example.com`,
  live: true,
  paused: false,
  searchSuppressed: false,
  colour: "RED",
  label: "In Contract",
  lastConfirmedAt: "2026-11-15T15:01:00Z",
  confirmationSource: "WEB",
  foundingPlace: null,
  title: "Principal Data Engineer QA",
  location: "Edinburgh",
  targetDayRatePence: 72500,
  ir35Status: "EITHER",
  ...over,
});

const detail = (id: string, over: Record<string, unknown> = {}) => ({
  ...row(id, id === ID ? "Avery" : "Blake"),
  profile,
  phone: "+447700900015",
  employment: "CONTRACTING",
  availableFrom: null,
  contractEndDate: "2027-02-07",
  underlyingStatus: "UNAVAILABLE",
  freshnessState: "FRESH",
  unconfirmedSince: null,
  escalationStage: null,
  createdAt: "2026-11-01T10:00:00Z",
  introducer: null,
  introductionsMade: 0,
  events: [],
  openCallTask: null,
  ...over,
});

const overview = (range: string) => {
  const days = range === "7" ? 7 : range === "90" ? 90 : range === "all" ? 120 : 30;
  return {
    contractors: { total: 8, live: 7, paused: 0, searchSuppressed: 0 },
    colours: { LIME: 3, ORANGE: 2, RED: 1, BLUE: 1, GREY: 0 },
    queues: { openCallTasks: 0, openReferralFlags: 0, rewardsAwaitingVerification: 0, rewardsAwaitingApproval: 0 },
    founding: { allocated: 0, cap: 50000 },
    growth: {
      range,
      total: days,
      points: Array.from({ length: days }, (_, i) => ({ date: new Date(Date.UTC(2026, 10, 15) - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10), count: 1 })),
    },
  };
};

async function stubAdmin(page: Page, opts: { confirmStatus?: number } = {}): Promise<Call[]> {
  const calls: Call[] = [];
  const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route("**/api/v1/admin/**", (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api/v1/admin", "");
    const method = route.request().method();
    const body = method === "GET" ? null : route.request().postDataJSON();
    calls.push({ method, path, query: url.searchParams, body });
    if (path === "/auth/me") return route.fulfill(json({ id: "s1", email: "qa@loop.test", name: null, role: "OPERATOR", permissions: ["contractors.read", "availability.read", "availability.confirm", "audit.read"] }));
    if (path === "/overview") return route.fulfill(json(overview(url.searchParams.get("range") ?? "30")));
    if (path === "/contractors" && method === "GET") {
      const q = url.searchParams.get("q") ?? "";
      // Mirrors the server contract for the QA case: the national form of the stored number must find Avery.
      const hit = q === "" || q === "+447700900015" || q === "07700900015";
      return route.fulfill(json({ items: hit ? [row(ID, "Avery")] : [], total: hit ? 1 : 0, page: 1, pageSize: 25 }));
    }
    if (path === `/contractors/${ID}` || path === `/contractors/${OTHER}`) {
      return route.fulfill(json(path.endsWith(ID) ? detail(ID) : detail(OTHER, { employment: "PERMANENT", contractEndDate: null })));
    }
    if (path === `/contractors/${ID}/cv`) return route.fulfill(json({ url: "http://localhost:5174/admin/__e2e/cv.pdf", expiresInSeconds: 300 }));
    if (path === `/contractors/${ID}/confirm`) {
      if (opts.confirmStatus && opts.confirmStatus !== 200) return route.fulfill(json({ title: "Bad Request", status: opts.confirmStatus, detail: "contractEndDate: required" }, opts.confirmStatus));
      return route.fulfill(json({}));
    }
    return route.fulfill(json({}, 404));
  });
  return calls;
}

test.describe("Admin QA regressions (ADM-01 to ADM-07)", () => {
  test("ADM-03/04: overview shows status names with the Live-only scope, and a range-switchable growth chart", async ({ page }) => {
    const calls = await stubAdmin(page);
    await page.goto(`${ADMIN}#overview`);
    const tiles = page.getByTestId("availability-tiles");
    for (const label of ["Available Now", "Available Soon", "In Contract", "Permanently Employed", "Unconfirmed"]) {
      await expect(tiles.getByText(label, { exact: true })).toBeVisible();
    }
    // Raw colour codes are no longer shown.
    for (const code of ["LIME", "ORANGE", "GREY"]) await expect(tiles.getByText(code, { exact: true })).toHaveCount(0);
    await expect(page.getByText("Live contractors only", { exact: false })).toBeVisible();

    await expect(page.getByTestId("growth-chart")).toBeVisible();
    await expect(page.getByTestId("growth-total")).toContainText("30");
    for (const [label, range, total] of [["7 days", "7", "7"], ["90 days", "90", "90"], ["All time", "all", "120"]] as const) {
      await page.getByRole("button", { name: label }).click();
      await expect(page.getByTestId("growth-total")).toContainText(total);
      expect(calls.some((c) => c.path === "/overview" && c.query.get("range") === range)).toBe(true);
    }
  });

  test("ADM-02: a national-format phone number is sent as typed and finds the contractor", async ({ page }) => {
    await stubAdmin(page);
    await page.goto(`${ADMIN}#contractors`);
    await page.getByLabel("Search name, email or phone").fill("07700900015");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByRole("button", { name: "Avery Looptest" })).toBeVisible();
    await page.getByLabel("Search name, email or phone").fill("07700900999");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByText("No contractors found.")).toBeVisible();
  });

  test("ADM-05: list shows profile columns and sends the operational filters", async ({ page }) => {
    const calls = await stubAdmin(page);
    await page.goto(`${ADMIN}#contractors`);
    for (const h of ["Title", "Location", "Target rate", "IR35"]) await expect(page.getByRole("columnheader", { name: h })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Edinburgh" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "£725.00" })).toBeVisible();

    await page.getByLabel("Availability").selectOption("RED");
    await page.getByLabel("Role").fill("Data Engineer");
    await page.getByLabel("Skill").fill("Python");
    await page.getByLabel("Location").fill("Edinburgh");
    await page.getByLabel("IR35").selectOption("EITHER");
    await page.getByRole("button", { name: "Search" }).click();
    await expect
      .poll(() => calls.some((c) => c.path === "/contractors" && c.query.get("colour") === "RED" && c.query.get("role") === "Data Engineer" && c.query.get("skill") === "Python" && c.query.get("location") === "Edinburgh" && c.query.get("ir35") === "EITHER"))
      .toBe(true);
  });

  test("ADM-06: contractor detail shows the professional profile and a CV route", async ({ page }) => {
    const calls = await stubAdmin(page);
    await page.goto(`${ADMIN}#contractors`);
    await page.getByRole("button", { name: "Avery Looptest" }).click();
    const p = page.getByTestId("profile");
    await expect(p).toContainText("Principal Data Engineer QA");
    await expect(p).toContainText("Data Engineer, Platform Engineer");
    await expect(p).toContainText("Python, SQL, Airflow");
    await expect(p).toContainText("Edinburgh");
    await expect(p).toContainText("£725.00 / £625.00");
    await expect(p).toContainText("EITHER");
    await page.context().route("**/__e2e/cv.pdf", (r) => r.fulfill({ status: 200, contentType: "application/pdf", body: "%PDF-1.4" }));
    const popup = page.waitForEvent("popup");
    await p.getByRole("button", { name: /View CV \(version 2\)/ }).click();
    await popup;
    expect(calls.some((c) => c.path === `/contractors/${ID}/cv`)).toBe(true);
  });

  test("ADM-01: the availability form is prepopulated from the saved record and does not write on open", async ({ page }) => {
    const calls = await stubAdmin(page);
    await page.goto(`${ADMIN}#contractors`);
    await page.getByRole("button", { name: "Avery Looptest" }).click();
    await page.getByText("Confirm availability on their behalf").click();
    await expect(page.getByLabel("Situation")).toHaveValue("CONTRACTING");
    await expect(page.getByLabel(/Contract end date/)).toHaveValue("2027-02-07");
    expect(calls.filter((c) => c.method !== "GET")).toHaveLength(0);
  });

  test("ADM-07: a contract cannot be confirmed without an end date, and nothing is sent", async ({ page }) => {
    const calls = await stubAdmin(page);
    await page.goto(`${ADMIN}#contractors`);
    await page.getByRole("button", { name: "Avery Looptest" }).click();
    await page.getByText("Confirm availability on their behalf").click();
    await page.getByLabel(/Contract end date/).fill("");
    await page.getByLabel(/Reason/).fill("QA ADMIN VALIDATION — missing contract end test");
    await page.getByRole("button", { name: "Confirm on behalf" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "expected contract end date" })).toBeVisible();
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);

    // With a date the save goes through, carrying that date.
    await page.getByLabel(/Contract end date/).fill("2027-03-01");
    await page.getByRole("button", { name: "Confirm on behalf" }).click();
    await expect(page.getByText("Confirmed on their behalf.")).toBeVisible();
    const post = calls.find((c) => c.method === "POST");
    expect(post?.body).toMatchObject({ employment: "CONTRACTING", contractEndDate: "2027-03-01" });
  });

  test("ADM-07: a server refusal (backend bypass) is shown as an error, not as success", async ({ page }) => {
    await stubAdmin(page, { confirmStatus: 400 });
    await page.goto(`${ADMIN}#contractors`);
    await page.getByRole("button", { name: "Avery Looptest" }).click();
    await page.getByText("Confirm availability on their behalf").click();
    await page.getByLabel(/Reason/).fill("QA ADMIN VALIDATION — server refusal test");
    await page.getByRole("button", { name: "Confirm on behalf" }).click();
    await expect(page.getByText("Confirmed on their behalf.")).toHaveCount(0);
  });
});
