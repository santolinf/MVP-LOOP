import {
  getGetJoinProfileQueryKey,
  getGetMeQueryKey,
  getJoinProfile,
  updateJoinProfile,
  useConfirmAvailability,
  useGetJoinProfile,
  type ConfirmAvailabilityDto,
  type MeDto,
} from "@loop/api-client";
import { AvailabilityBadge } from "@loop/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { uuid } from "../../lib/uuid";
import { SignInRequired } from "../auth/sign-in-required";
import { OptionGroup, Radio, TextField } from "../join/form-bits";
import { takeJoinNotice } from "../join/join-draft";
import { StepBar } from "../join/step-bar";
import { BTN_OUTLINE, BTN_SOLID, Card, Muted, PAGE_H1, Eyebrow } from "../marketing/primitives";
import { useMe } from "../my-loop/use-me";

/** The four situations the V33 reference offers. Only the first three map to a distinct employment value. */
type Situation = "in-contract" | "available-now" | "available-soon" | "permanent";

const OPTIONS: { value: Situation; label: string }[] = [
  { value: "in-contract", label: "Currently in contract" },
  { value: "available-now", label: "Available now" },
  { value: "available-soon", label: "Available soon" },
  { value: "permanent", label: "Permanently employed — open to contracting" },
];

function situationOf(me: MeDto): Situation {
  if (me.employment === "PERMANENT") return "permanent";
  if (me.employment === "BETWEEN_CONTRACTS") return me.availableFrom ? "available-soon" : "available-now";
  return "in-contract";
}

/**
 * Join step 4 and the My LOOP availability update. `join` shows the progress bar and goes on to the next join step;
 * otherwise it returns to `next`. Passing a contract end date never makes someone available: that needs this form.
 */
export function AvailabilityForm({ next = "/my-loop", join = false }: { next?: string; join?: boolean } = {}) {
  const { me, isPending, unauthenticated } = useMe();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const saved = useGetJoinProfile({ query: { enabled: !!me } });
  const profile = saved.data?.status === 200 ? saved.data.data : null;
  const [situation, setSituation] = useState<Situation | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [start, setStart] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [carried] = useState(() => (join ? takeJoinNotice() : null));
  // One key per form instance: a retry of the same confirmation replays instead of duplicating.
  const idempotencyKey = useRef(uuid());
  const confirm = useConfirmAvailability({ request: { headers: { "Idempotency-Key": idempotencyKey.current } } });

  if (isPending)
    return (
      <section className="mx-auto max-w-3xl px-[26px] py-[70px] md:py-[90px]">
        <Muted>Loading…</Muted>
      </section>
    );
  if (unauthenticated || !me) return <SignInRequired message="Please sign in to confirm your availability." />;

  const current = situation ?? situationOf(me);
  const endValue = endDate ?? me.contractEndDate ?? "";
  const fromValue = from ?? me.availableFrom ?? "";
  const noticeValue = notice ?? profile?.noticePeriodText ?? "";
  const startValue = start ?? profile?.earliestStartDate ?? "";
  const missing =
    (current === "in-contract" && !endValue) ||
    (current === "available-soon" && !fromValue) ||
    (current === "permanent" && (!noticeValue.trim() || !startValue));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (missing) {
      setError(
        current === "in-contract"
          ? "Enter your expected contract end date."
          : current === "available-soon"
            ? "Enter the date you are available from."
            : "Enter your notice period and earliest possible start date.",
      );
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const data: ConfirmAvailabilityDto =
        current === "in-contract"
          ? { employment: "CONTRACTING", availableFrom: null, contractEndDate: endValue }
          : current === "permanent"
            ? { employment: "PERMANENT", availableFrom: null, contractEndDate: null }
            : { employment: "BETWEEN_CONTRACTS", availableFrom: current === "available-soon" ? fromValue : null, contractEndDate: null };
      await confirm.mutateAsync({ data });
      // Notice and start date belong to permanent employees only; keep the stored record in step with the answer.
      const stored = await getJoinProfile();
      if (stored.status === 200) {
        await updateJoinProfile({
          ...stored.data,
          noticePeriodText: current === "permanent" ? noticeValue.trim() : null,
          earliestStartDate: current === "permanent" ? startValue : null,
        });
      }
      await Promise.all([qc.invalidateQueries({ queryKey: getGetMeQueryKey() }), qc.invalidateQueries({ queryKey: getGetJoinProfileQueryKey() })]);
      navigate(next);
    } catch {
      setError("We couldn't save that. Please check the dates and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={join ? "mx-auto max-w-[720px] px-5 py-12" : "mx-auto max-w-3xl px-[26px] py-[70px] md:py-[90px]"}>
      {join ? <StepBar step={4} /> : <Eyebrow>Stay current</Eyebrow>}
      <Card className="!border-[#294357] !bg-[#0b2237] !bg-none !p-8">
        <h1 className={PAGE_H1}>What's your current situation?</h1>
        <Muted className="mb-4">
          LIVE means discoverable, not necessarily available today. Keep your expected contract end date current; LOOP calculates the timing. Confirm
          availability yourself when your contract finishes.
        </Muted>
        <div className="mb-4 flex items-center gap-3">
          <AvailabilityBadge colour={me.availability.colour} />
        </div>
        {carried && (
          <p role="status" className="mb-4 text-orange">
            {carried}
          </p>
        )}
        <form onSubmit={submit} noValidate className="grid gap-5">
          <OptionGroup legend="Your situation">
            {OPTIONS.map((o) => (
              <Radio key={o.value} name="situation" label={o.label} checked={current === o.value} onChange={() => setSituation(o.value)} />
            ))}
          </OptionGroup>
          {current === "in-contract" && (
            <div className="grid gap-2">
              <TextField label="Expected contract end date — update whenever it changes" type="date" required value={endValue} onChange={setEndDate} />
              <Muted className="text-sm">
                Extended or finishing early? Simply change this date. LOOP calculates Available Soon (within 28 days) or In Contract (over 28 days).
                Passing the date never automatically marks you Available Now — you must confirm.
              </Muted>
            </div>
          )}
          {current === "available-soon" && <TextField label="Available from" type="date" required value={fromValue} onChange={setFrom} />}
          {current === "permanent" && (
            <>
              <TextField label="Notice period" required value={noticeValue} placeholder="e.g. 4 weeks" maxLength={60} onChange={setNotice} />
              <TextField label="Earliest possible start date" type="date" required value={startValue} onChange={setStart} />
            </>
          )}
          {error && (
            <p role="alert" className="text-red">
              {error}
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <Link to={join ? "/join/profile" : "/my-loop"} className={BTN_OUTLINE}>
              ← Back
            </Link>
            <button type="submit" className={BTN_SOLID} disabled={busy}>
              {join ? "Continue →" : "Confirm availability"}
            </button>
          </div>
        </form>
      </Card>
    </section>
  );
}
