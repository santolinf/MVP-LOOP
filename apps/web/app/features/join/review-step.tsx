import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetMeQueryKey,
  getGetReviewQueryKey,
  useGetReview,
  useGoLive,
  useUpdateConsents,
  type ReviewDto,
} from "@loop/api-client";
import { AvailabilityBadge } from "@loop/ui";
import { BTN_OUTLINE, BTN_SOLID, Card, Muted, PAGE_H1 } from "../marketing/primitives";
import { StepBar } from "./step-bar";

type Consent = ReviewDto["consents"][number];

/** Where to send someone to fix a non-consent blocker. The server decides what is blocking; this only words it. */
const BLOCKER_HELP: Record<string, { text: string; to: string }> = {
  NAME_MISSING: { text: "Add your first and last name.", to: "/join/register" },
  ELIGIBILITY_MISSING: { text: "Confirm that you are UK based with the right to work.", to: "/join" },
  AVAILABILITY_NOT_CONFIRMED: { text: "Confirm your availability.", to: "/join/availability" },
  PROFILE_FIELD_MISSING: { text: "Confirm at least your headline or one skill from your CV.", to: "/join/details" },
};

function Preview({ review }: { review: ReviewDto }) {
  const v = review.visible;
  const prefs = [...v.preferences.workTypes, ...v.preferences.regions, ...v.preferences.sectors];
  return (
    <section aria-labelledby="visible-heading" className="mb-6 rounded-xl border border-[#294357] p-4">
      <h2 id="visible-heading" className="mb-3 text-lg font-bold text-fg">
        What agencies will see
      </h2>
      <dl className="grid gap-2 text-sm">
        <div>
          <dt className="text-muted">Name</dt>
          <dd className="text-fg">{v.name}</dd>
        </div>
        <div>
          <dt className="text-muted">Availability</dt>
          <dd className="flex items-center gap-2 text-fg">
            <AvailabilityBadge colour={v.availability.colour} />
            {v.availableFrom && <span>from {v.availableFrom}</span>}
          </dd>
        </div>
        {v.profile.map((f, i) => (
          <div key={`${f.key}-${i}`}>
            <dt className="text-muted">{f.label}</dt>
            <dd className="text-fg">{f.value}</dd>
          </div>
        ))}
        {prefs.length > 0 && (
          <div>
            <dt className="text-muted">Preferences</dt>
            <dd className="text-fg">{prefs.join(", ")}</dd>
          </div>
        )}
      </dl>
      <p className="mt-4 text-sm text-muted">
        <span className="font-semibold">Not shown:</span> {review.hidden.join(", ")}.
      </p>
    </section>
  );
}

function ConsentBox({ item, checked, onChange }: { item: Consent; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 rounded-xl border border-[#294357] p-4">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 accent-lime" />
      <span className="text-fg">
        {item.wording}
        <span className="ml-2 text-xs text-muted">{item.required ? "(required to go live)" : "(optional)"}</span>
      </span>
    </label>
  );
}

export function ReviewStep() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const review = useGetReview();
  const updateConsents = useUpdateConsents();
  const goLive = useGoLive();
  // undefined = untouched, so the server's recorded choice shows until the contractor changes it. Never pre-ticked.
  const [choices, setChoices] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const body = review.data?.status === 200 ? review.data.data : null;
  const unauthenticated = review.isError && (review.error as { status?: number } | null)?.status === 401;
  const busy = updateConsents.isPending || goLive.isPending;

  if (unauthenticated)
    return (
      <main className="mx-auto max-w-[720px] px-5 py-12">
        <p role="alert" className="text-red">
          Your session has ended. Please <Link to="/join/register" className="underline">create your account</Link> again.
        </p>
      </main>
    );
  if (!body)
    return (
      <main className="mx-auto max-w-[720px] px-5 py-12">
        <Muted>{review.isError ? "We couldn't load your review. Please refresh." : "Loading…"}</Muted>
      </main>
    );

  const checked = (c: Consent) => choices[c.purpose] ?? c.granted;
  const otherBlockers = body.blockers.filter((b) => !b.startsWith("CONSENT_"));
  const requiredTicked = body.consents.filter((c) => c.required).every(checked);
  const ready = otherBlockers.length === 0 && requiredTicked;
  const consents = body.consents;

  async function submit() {
    if (!ready || busy) return;
    setError(null);
    try {
      const changes = consents
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
    <main className="mx-auto max-w-[720px] px-5 py-12">
      <StepBar step={5} />
      <Card className="!border-[#294357] !bg-[#0b2237] !bg-none !p-8">
        <h1 className={PAGE_H1}>Review and go live</h1>
        <Muted className="mb-6">This is exactly what will be visible. Nothing else from your profile is shared.</Muted>
        <Preview review={body} />
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
        <fieldset className="mb-6 grid gap-3">
          <legend className="mb-2 text-lg font-bold text-fg">Your choices</legend>
          {body.consents.map((c) => (
            <ConsentBox key={c.purpose} item={c} checked={checked(c)} onChange={(v) => setChoices({ ...choices, [c.purpose]: v })} />
          ))}
          <Muted className="text-sm">
            Service and security emails, such as sign-in codes, are always sent. Your marketing choices never switch them off.
          </Muted>
        </fieldset>
        {error && (
          <p role="alert" className="mb-3 text-red">
            {error}
          </p>
        )}
        <div className="flex items-center justify-between gap-3">
          <Link to="/join/availability" className={BTN_OUTLINE}>
            ← Back
          </Link>
          <button type="button" className={BTN_SOLID} disabled={!ready || busy} onClick={submit}>
            Go LIVE
          </button>
        </div>
      </Card>
    </main>
  );
}
