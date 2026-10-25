> Part of the [LOOP V33 Phased Implementation Plan](../LOOP_V33_Phased_Implementation_Plan.md) (§3 Phase detail). Source of truth is the master plan; this file is an extract.

### Phase H — New marketing homepage (Gate 1, parallel track)
Source: `requirements/LOOP_App_Homepage_Handover_V33/01_NEW_HOMEPAGE/index.html` (single file, inline CSS and a small inline script, two logo PNGs). Per the handover README it is a **marketing design, not a replacement for the V33 registration journey**; every "Join" goes to the existing V33 registration (`/join`). It is independent of Phases 1–9 (static, prerendered), so it can ship early, but its referral CTA links to the Phase 9 introducer flow, so that part is wired last.

**What the concept contains** (in order): sticky header; hero ("One profile. Your availability. Your control." with "Stay current. Stay visible. Stay in the LOOP.") with an illustrative phone mock; `#why` Today vs With LOOP; `#how` three steps (Join / Go live / Stay current); `#radar` LOOP LIVE (launch) vs LOOP RADAR (Phase 2); `#rewards` Founding proposed programme plus the "Bill and Mary" £50 example; network-effect loop; `#join` call to action; footer.

**Repo vs concept (gap table)**

| Area | Current repo | Change |
| --- | --- | --- |
| Hero copy | "Your next contract. Your network. Your share." (`features/marketing/home-sections.tsx`) | Replace with the concept promise and supporting line |
| Sections | Hero, OverviewStrip, FoundingSection, ProfitSharingSection, IntroductionsSection, RadarSection, FinalCta | Rebuild as Hero, TodayVsLoop, HowItWorks, LiveAndRadar, Rewards, NetworkLoop, FinalCta; retire OverviewStrip and ProfitSharingSection (profit share is folded into Rewards as "proposed") |
| Header nav | `Why LOOP`, `Introduce IT Contractors`; no Join button; `TODO(spec)` for Log in | Anchors Why LOOP / How it works / LOOP Radar / Rewards; add Join LOOP button and Log in / My LOOP (session-aware) |
| Palette (`app.css` `@theme`) | V11: bg `#061526`, lime `#b9fb23`, cyan `#16baf0` | Concept uses bg `#090c13`, panel `#121824`, line `#283241`, lime `#c7fb49`, cyan `#55d9f5`. **Decision needed (Open Question 12):** re-theme tokens or keep V11. Either way map to tokens, never inline hex |
| Radar badge | "COMING IN STAGE 2" | "Phase 2"; Radar contracts earn no £50 |
| Referral CTA | Static link to `/introduce` | Session-aware, see below |
| Assets | `public/assets/loop-logo-header.png` and `loop-logo-final-with-tagline.png` already present | Compare with the handover copies; replace only if they differ. Add width/height to every `<img>` |
| Phone mock | – | Static illustrative component, `aria-hidden`, labelled as illustrative; no real data |

**Translation steps**
1. Port markup to React components in `features/marketing/home-sections.tsx` (split into one file per section once it passes ~250 lines), using existing primitives (`Section`, `Card`, `Eyebrow`, `Lead`, `Muted`, `ButtonLink`, `Standout`). Concept CSS becomes Tailwind utilities; the concept's `:root` variables map onto the `@theme` tokens (colour, `--radius-card`, `--container-page`). Keep the 800px breakpoint behaviour via the existing responsive utilities.
2. **Remove concept-only artefacts:** the "HOMEPAGE CONCEPT · NOT V33 REGISTRATION" badge, the footer "Homepage concept v2 · For review", the "Concept preview" `alert()` on the Join button and any "concept / for review" disclaimer copy. Keep the genuine programme disclaimer ("proposed", subject to legal terms).
3. **Do not ship the `?member=1` preview toggle.** The concept flips `.member-cta` text via a query string; production decides from the authenticated session (below).
4. **Referral CTA (per README):** logged-out visitors see "Join LOOP to Invite" linking to V33 registration; logged-in contractors see "Invite a Contractor" linking to My LOOP referral tools. The page stays **prerendered and cacheable**: it ships with the logged-out text and, after hydration, a small client hook reads the session (`/api/v1/me`, no cookie leakage into the static HTML) and swaps the label and target. No flash of wrong content for crawlers; no personalised HTML at the edge. A personal invite link or QR resolves to **V33 web registration**, never to an app store.
5. **Copy guardrails:** no implication of a populated agency network or guaranteed placements; "Founding Contractor" programme described as **proposed**, profit pools as proposed, collective (not per person), with no calculation or payout shown; £50 example states the 3-month agency-verified condition; AI mentioned lightly with disclosure deferred to registration. Strings live in the existing `COPY` module so Legal can review one file.
6. **Mobile-app references are removed:** no store badges, "download the app", or QR-to-app on the homepage. The phone mock is labelled illustrative; its "STILL CORRECT" pattern describes the web one-touch confirm until the app exists.
7. **Accessibility:** headings in order, landmark roles, visible `:focus-visible` (already in `app.css`), colour never the only signal (badge label + icon), contrast check of lime/cyan on the dark panels, `prefers-reduced-motion` respected for the loop animation, skip-link.
8. **Performance and SEO:** prerendered by React Router; logos sized and `fetchpriority` on the hero image; no web-font blocking (Inter with system fallback); `<title>`, meta description, OpenGraph and canonical set in the route `meta`.
9. **Tests:** Vitest/RTL for each section and the CTA swap (logged-out vs logged-in); Playwright smoke: homepage renders, header anchors scroll, "Join" lands on `/join`, signed-in CTA lands in My LOOP, no console errors, no "concept" strings in the built HTML (a grep test in CI).

*Security note:* the page adds no new personal-data surface. The only dynamic call is the existing authenticated `me` read, which is rate-limited and returns nothing to anonymous callers. Third-party scripts, fonts and trackers are **not** added; any analytics requires a consent decision (Open Question 6).

*Done when:* the new homepage is live on the prerendered `/` route, concept artefacts are gone, CTA state follows the session, and lint/typecheck/tests pass.
