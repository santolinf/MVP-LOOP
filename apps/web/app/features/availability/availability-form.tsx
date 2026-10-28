import { getGetMeQueryKey, useConfirmAvailability, type ConfirmAvailabilityDtoEmployment } from "@loop/api-client";
import { AvailabilityBadge } from "@loop/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { uuid } from "../../lib/uuid";
import { SignInRequired } from "../auth/sign-in-required";
import { Card, Eyebrow, Muted, PAGE_H1 } from "../marketing/primitives";
import { useMe } from "../my-loop/use-me";

const OPTIONS: { value: ConfirmAvailabilityDtoEmployment; label: string }[] = [
  { value: "CONTRACTING", label: "Currently contracting" },
  { value: "BETWEEN_CONTRACTS", label: "Between contracts" },
  { value: "PERMANENT", label: "Permanently employed, open to contracting" },
];

/** `next` is where to go after saving; the join journey passes its own next step. */
export function AvailabilityForm({ next = "/my-loop" }: { next?: string } = {}) {
  const { me, isPending, unauthenticated } = useMe();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [employment, setEmployment] = useState<ConfirmAvailabilityDtoEmployment | null>(null);
  const [availableFrom, setAvailableFrom] = useState<string | null>(null);
  const [contractEnd, setContractEnd] = useState<string | null>(null);
  // One key per form instance: a retry of the same confirmation replays instead of duplicating.
  const idempotencyKey = useRef(uuid());
  const confirm = useConfirmAvailability({
    request: { headers: { "Idempotency-Key": idempotencyKey.current } },
    mutation: {
      onSuccess: async () => {
        await qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
        navigate(next);
      },
    },
  });

  if (isPending)
    return (
      <section className="mx-auto max-w-3xl px-[26px] py-[70px] md:py-[90px]">
        <Muted>Loading…</Muted>
      </section>
    );
  if (unauthenticated || !me)
    return (
      <SignInRequired message="Please sign in to confirm your availability." />
    );

  const currentEmployment = employment ?? me.employment ?? "CONTRACTING";
  const currentFrom = availableFrom !== null ? availableFrom : (me.availableFrom ?? "");

  const currentEnd = contractEnd !== null ? contractEnd : (me.contractEndDate ?? "");
  // A current contract needs its end date, otherwise the status cannot be worked out and stays Unconfirmed.
  const missingEnd = currentEmployment === "CONTRACTING" && currentEnd === "";

  function submit(e: FormEvent) {
    e.preventDefault();
    if (missingEnd) return;
    confirm.mutate({
      data: {
        employment: currentEmployment,
        availableFrom: currentEmployment === "BETWEEN_CONTRACTS" ? currentFrom || null : null,
        contractEndDate: currentEmployment === "CONTRACTING" ? currentEnd : null,
      },
    });
  }

  return (
    <section className="mx-auto max-w-3xl px-[26px] py-[70px] md:py-[90px]">
      <Eyebrow>Stay current</Eyebrow>
      <Card className="!border-[#294357] !bg-[#0b2237] !bg-none">
        <h1 className={PAGE_H1}>Confirm your availability</h1>
        <div className="mb-6 flex items-center gap-3">
          <AvailabilityBadge colour={me.availability.colour} />
        </div>
        <form onSubmit={submit}>
          <fieldset className="mb-4">
            <legend className="mb-3 font-semibold">Your situation</legend>
            {OPTIONS.map((o) => (
              <label
                key={o.value}
                className="mb-2 flex cursor-pointer items-center gap-3 rounded-full border border-line bg-panel-2 px-5 py-2.5 has-[:checked]:border-lime has-[:checked]:bg-[#b9fb2310]"
              >
                <input
                  type="radio"
                  name="employment"
                  checked={currentEmployment === o.value}
                  onChange={() => setEmployment(o.value)}
                  className="accent-lime"
                />
                {o.label}
              </label>
            ))}
          </fieldset>
          {currentEmployment === "CONTRACTING" && (
            <label className="mb-4 block">
              <span className="mb-1 block font-semibold">Contract end date</span>
              <input
                type="date"
                required
                value={currentEnd}
                onChange={(e) => setContractEnd(e.target.value)}
                className="rounded border border-line bg-bg px-3 py-2"
              />
            </label>
          )}
          {currentEmployment === "BETWEEN_CONTRACTS" && (
            <label className="mb-4 block">
              <span className="mb-1 block font-semibold">Available from</span>
              <input
                type="date"
                value={currentFrom}
                onChange={(e) => setAvailableFrom(e.target.value)}
                className="rounded border border-line bg-bg px-3 py-2"
              />
            </label>
          )}
          {confirm.isError && (
            <p role="alert" className="mb-2 text-red">
              We couldn’t save that. Please try again.
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <Link to={next === "/my-loop" ? "/my-loop" : "/join/details"} className="inline-flex items-center gap-2.5 rounded-full border border-[#465366] px-[25px] py-3.5 font-extrabold text-fg transition-transform duration-200 hover:-translate-y-0.5">
              ← Back
            </Link>
            <button
              type="submit"
              disabled={confirm.isPending || missingEnd}
              className="inline-flex items-center gap-2.5 rounded-full bg-lime px-[25px] py-3.5 font-extrabold text-[#0a1114] transition-transform duration-200 hover:-translate-y-0.5 disabled:opacity-40"
            >
              Confirm availability
            </button>
          </div>
        </form>
      </Card>
    </section>
  );
}
