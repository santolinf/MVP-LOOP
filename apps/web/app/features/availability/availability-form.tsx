import { getGetMeQueryKey, useConfirmAvailability, type ConfirmAvailabilityDtoEmployment } from "@loop/api-client";
import { AvailabilityBadge } from "@loop/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { uuid } from "../../lib/uuid";
import { Card, Eyebrow, Muted } from "../marketing/primitives";
import { useMe } from "../my-loop/use-me";

const OPTIONS: { value: ConfirmAvailabilityDtoEmployment; label: string }[] = [
  { value: "CONTRACTING", label: "Currently contracting" },
  { value: "BETWEEN_CONTRACTS", label: "Between contracts" },
  { value: "PERMANENT", label: "Permanently employed, open to contracting" },
];

export function AvailabilityForm() {
  const { me, isPending, unauthenticated } = useMe();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [employment, setEmployment] = useState<ConfirmAvailabilityDtoEmployment | null>(null);
  const [availableFrom, setAvailableFrom] = useState<string | null>(null);
  // One key per form instance: a retry of the same confirmation replays instead of duplicating.
  const idempotencyKey = useRef(uuid());
  const confirm = useConfirmAvailability({
    request: { headers: { "Idempotency-Key": idempotencyKey.current } },
    mutation: {
      onSuccess: async () => {
        await qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
        navigate("/my-loop");
      },
    },
  });

  if (isPending)
    return (
      <section className="mx-auto w-[min(40rem,calc(100%-30px))] py-16">
        <Muted>Loading…</Muted>
      </section>
    );
  if (unauthenticated || !me)
    return (
      <section className="mx-auto w-[min(40rem,calc(100%-30px))] py-16">
        <p role="alert" className="text-red">
          Sign in required to confirm your availability.
        </p>
      </section>
    );

  const currentEmployment = employment ?? me.employment ?? "CONTRACTING";
  const currentFrom = availableFrom !== null ? availableFrom : (me.availableFrom ?? "");

  function submit(e: FormEvent) {
    e.preventDefault();
    confirm.mutate({
      data: { employment: currentEmployment, availableFrom: currentFrom || null },
    });
  }

  return (
    <section className="mx-auto w-[min(40rem,calc(100%-30px))] py-16">
      <Eyebrow>Stay current</Eyebrow>
      <Card>
        <h1 className="mb-3 text-3xl font-bold">Confirm your availability</h1>
        <div className="mb-6 flex items-center gap-3">
          <AvailabilityBadge colour={me.availability.colour} />
          <span>{me.availability.label}</span>
        </div>
        <form onSubmit={submit}>
          <fieldset className="mb-4">
            <legend className="mb-2 font-semibold">Your situation</legend>
            {OPTIONS.map((o) => (
              <label key={o.value} className="mb-1 flex items-center gap-2">
                <input
                  type="radio"
                  name="employment"
                  checked={currentEmployment === o.value}
                  onChange={() => setEmployment(o.value)}
                />
                {o.label}
              </label>
            ))}
          </fieldset>
          {currentEmployment !== "PERMANENT" && (
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
            <Link to="/my-loop" className="rounded-full border border-line px-5 py-2 hover:text-lime">
              ← Back
            </Link>
            <button
              type="submit"
              disabled={confirm.isPending}
              className="rounded-full bg-lime px-6 py-2 font-semibold text-bg disabled:opacity-40"
            >
              Confirm availability
            </button>
          </div>
        </form>
      </Card>
    </section>
  );
}
