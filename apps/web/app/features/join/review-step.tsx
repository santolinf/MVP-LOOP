import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetMeQueryKey,
  getGetReviewQueryKey,
  useGetJoinProfile,
  useGetManualProfile,
  useGetProfileDetails,
  useGetReview,
  useGoLive,
  useUpdateConsents,
  type JoinProfileDto,
  type MeDto,
  type ProfileDetailsDto,
  type ReviewDto,
} from "@loop/api-client";
import { BTN_OUTLINE, BTN_SOLID, Card, Muted, PAGE_H1 } from "../marketing/primitives";
import { useMe } from "../my-loop/use-me";
import { ConfirmBox, Note } from "./form-bits";
import { StepBar } from "./step-bar";

type Consent = ReviewDto["consents"][number];

/** Where to send someone to fix a non-consent blocker. The server decides what is blocking; this only words it. */
const BLOCKER_HELP: Record<string, { text: string; to: string }> = {
  NAME_MISSING: { text: "Add your first and last name.", to: "/join/profile" },
  ELIGIBILITY_MISSING: { text: "Confirm that you are UK based with the right to work.", to: "/join" },
  AVAILABILITY_NOT_CONFIRMED: { text: "Confirm your availability.", to: "/join/availability" },
  PROFILE_FIELD_MISSING: { text: "Confirm at least your professional title or one skill.", to: "/join/profile" },
  PROFILE_INCOMPLETE: { text: "Complete your profile: title, at least five skills and a confirmed location.", to: "/join/profile" },
  PREFERENCES_INCOMPLETE: { text: "Complete your contract preferences.", to: "/join/preferences" },
};

export const LOCATION_LABELS: Record<string, string> = {
  ANYWHERE: "Anywhere in the UK",
  LONDON: "London",
  SOUTH_EAST: "South East England",
  SOUTH_WEST: "South West England",
  MIDLANDS: "Midlands",
  NORTH_WEST: "North West England",
  NORTH_EAST: "North East England",
  YORKSHIRE: "Yorkshire & Humber",
  SCOTLAND: "Scotland",
  WALES: "Wales",
  NORTHERN_IRELAND: "Northern Ireland",
};
const LONDON_LABELS: Record<string, string> = {
  ANYWHERE_LONDON: "Anywhere in London",
  CENTRAL: "Central London",
  NORTH: "North London",
  SOUTH: "South London",
  EAST: "East London",
  WEST: "West London",
};
const PATTERN_LABELS: Record<string, string> = { REMOTE: "Remote", HYBRID: "Hybrid", ONSITE: "On-site" };
const IR35_LABELS: Record<string, string> = { INSIDE: "Inside", OUTSIDE: "Outside", EITHER: "Both", UNSURE: "Not sure" };
const SITUATION_LABELS: Record<string, string> = {
  CONTRACTING: "In contract",
  BETWEEN_CONTRACTS: "Available",
  PERMANENT: "Permanently employed — open to contracting",
};

const list = (items: string[], labels: Record<string, string>) => items.map((i) => labels[i] ?? i).join(", ");
const rate = (pence: number | null) => (pence ? `£${Math.round(pence / 100)}/day` : "");

/** The summary the reference GO LIVE screen shows: every answer given so far, in one place. */
export function summaryItems(me: MeDto, title: string, skills: string[], j: JoinProfileDto, d: ProfileDetailsDto): [string, string][] {
  return [
    ["Name", [me.firstName, me.lastName].filter(Boolean).join(" ")],
    ["Title", title],
    ["Preferred roles", j.preferredRoles.join(", ")],
    ["Skills", skills.join(", ")],
    ["Location", j.location ?? ""],
    ["LinkedIn", j.linkedinUrl ?? "Not provided"],
    ["Situation", me.employment ? (SITUATION_LABELS[me.employment] ?? "") : ""],
    ["Expected end date", me.contractEndDate ?? "Not applicable"],
    ["Availability", me.availability.label],
    ["Target rate", rate(j.targetDayRatePence)],
    ["Minimum rate", rate(j.minDayRatePence)],
    ["Umbrella", j.usesUmbrella === null ? "" : j.usesUmbrella ? (j.umbrellaProvider ?? "Yes") : "No"],
    ["IR35", d.ir35Status ? (IR35_LABELS[d.ir35Status] ?? "") : ""],
    ["Security cleared", d.securityClearance === "YES" ? "Yes" : d.securityClearance === "NO" ? "No" : ""],
    ["Work pattern", list(j.workPatterns, PATTERN_LABELS)],
    ["Work locations", list(j.workLocations, LOCATION_LABELS)],
    ["Other locations", j.otherLocations ?? ""],
    ["London areas", list(j.londonAreas, LONDON_LABELS)],
    ["Specific London areas", j.londonOther ?? ""],
    ["UK-wide remote", j.remoteUk === null ? "" : j.remoteUk ? "Yes" : "No"],
    ["Hybrid days", j.hybridDays ? String(j.hybridDays) : ""],
  ];
}

/** Join step 6 (V33 "GO LIVE"): review everything, confirm it is accurate and the required consents, then go LIVE. */
export function ReviewStep() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { me, unauthenticated: noSession } = useMe();
  const review = useGetReview();
  const manual = useGetManualProfile();
  const joined = useGetJoinProfile();
  const details = useGetProfileDetails();
  const updateConsents = useUpdateConsents();
  const goLive = useGoLive();
  // undefined = untouched, so the server's recorded choice shows until the contractor changes it. Never pre-ticked.
  const [choices, setChoices] = useState<Record<string, boolean>>({});
  const [accurate, setAccurate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const body = review.data?.status === 200 ? review.data.data : null;
  const m = manual.data?.status === 200 ? manual.data.data : null;
  const j = joined.data?.status === 200 ? joined.data.data : null;
  const d = details.data?.status === 200 ? details.data.data : null;
  const unauthenticated = noSession || (review.isError && (review.error as { status?: number } | null)?.status === 401);
  const busy = updateConsents.isPending || goLive.isPending;

  if (unauthenticated)
    return (
      <section className="mx-auto max-w-[720px] px-5 py-12">
        <p role="alert" className="text-red">
          Your session has ended. Please{" "}
          <Link to="/join/register" className="underline">
            create your account
          </Link>{" "}
          again.
        </p>
      </section>
    );
  if (!body || !me || !m || !j || !d)
    return (
      <section className="mx-auto max-w-[720px] px-5 py-12">
        <Muted>{review.isError ? "We couldn't load your review. Please refresh." : "Loading…"}</Muted>
      </section>
    );

  const checked = (c: Consent) => choices[c.purpose] ?? c.granted;
  // Marketing choices are taken on the Account step; the two consents LOOP needs to operate are confirmed here.
  const required = body.consents.filter((c) => c.required);
  const otherBlockers = body.blockers.filter((b) => !b.startsWith("CONSENT_"));
  const ready = otherBlockers.length === 0 && required.every(checked) && accurate;
  const items = summaryItems(me, j.title ?? m.headline ?? "", m.skills, j, d);

  async function submit() {
    if (!ready || busy || !body) return;
    setError(null);
    try {
      const changes = required
        .filter((c) => checked(c) !== c.granted)
        .map((c) => (checked(c) ? { purpose: c.purpose, granted: true, wordingVersion: c.wordingVersion } : { purpose: c.purpose, granted: false }));
      if (changes.length > 0) await updateConsents.mutateAsync({ data: { changes } });
      await goLive.mutateAsync();
      await Promise.all([qc.invalidateQueries({ queryKey: getGetMeQueryKey() }), qc.invalidateQueries({ queryKey: getGetReviewQueryKey() })]);
      navigate("/welcome");
    } catch {
      setError("We couldn't take you live. Please check the details above and try again.");
      await qc.invalidateQueries({ queryKey: getGetReviewQueryKey() });
    }
  }

  return (
    <section className="mx-auto max-w-[720px] px-5 py-12">
      <StepBar step={6} />
      <Card className="!border-[#294357] !bg-[#0b2237] !bg-none !p-8">
        <h1 className={PAGE_H1}>Review and go LIVE</h1>
        <Muted className="mb-6">
          Check the information you've provided. Going LIVE makes your profile discoverable to approved agencies once access launches.
        </Muted>
        <section aria-label="Your details" className="mb-6 grid gap-3 sm:grid-cols-2">
          {items.map(([k, v]) => (
            <div key={k} className="rounded-xl border border-[#294357] p-3">
              <small className="block text-muted">{k}</small>
              <strong className="break-words text-fg">{v || "Not supplied"}</strong>
            </div>
          ))}
        </section>
        {otherBlockers.length > 0 && (
          <ul role="status" className="mb-6 grid gap-2">
            {otherBlockers.map((b) => (
              <li key={b} className="text-orange">
                <span aria-hidden="true">⚠ </span>
                {BLOCKER_HELP[b]?.text ?? "Something is missing."}{" "}
                {BLOCKER_HELP[b] && (
                  <Link to={BLOCKER_HELP[b].to} className="underline">
                    Fix this
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="mb-6 grid gap-3">
          <ConfirmBox checked={accurate} onChange={setAccurate}>
            I confirm the information I have entered is accurate to the best of my knowledge.
          </ConfirmBox>
          <fieldset className="grid gap-3">
            <legend className="mb-2 font-bold text-fg">Your choices</legend>
            {required.map((c) => (
              <label key={c.purpose} className="flex items-start gap-3 rounded-xl border border-[#294357] p-4">
                <input
                  type="checkbox"
                  checked={checked(c)}
                  onChange={(e) => setChoices({ ...choices, [c.purpose]: e.target.checked })}
                  className="mt-1 accent-lime"
                />
                <span className="text-fg">
                  {c.wording}
                  <span className="ml-2 text-xs text-muted">(required to go live)</span>
                </span>
              </label>
            ))}
          </fieldset>
          <Muted className="text-sm">Service and security emails, such as sign-in codes, are always sent. Your marketing choices never switch them off.</Muted>
        </div>
        <Note>
          <span className="font-semibold">Not shown to agencies:</span> {body.hidden.join(", ")}.
        </Note>
        {error && (
          <p role="alert" className="mt-4 text-red">
            {error}
          </p>
        )}
        <div className="mt-6 flex items-center justify-between gap-3">
          <Link to="/join/preferences" className={BTN_OUTLINE}>
            ← Back
          </Link>
          <button type="button" className={BTN_SOLID} disabled={!ready || busy} onClick={submit}>
            Go LIVE →
          </button>
        </div>
      </Card>
    </section>
  );
}
