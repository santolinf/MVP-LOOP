import { AvailabilityBadge } from "@loop/ui";
import { Link } from "react-router";
import { Card, Eyebrow, Muted } from "../marketing/primitives";
import { useMe } from "./use-me";

export function MyLoopPage() {
  const { me, isPending, isError, unauthenticated } = useMe();

  if (isPending)
    return (
      <section className="mx-auto w-[min(56rem,calc(100%-30px))] py-16">
        <Muted>Loading…</Muted>
      </section>
    );
  if (unauthenticated)
    return (
      <section className="mx-auto w-[min(40rem,calc(100%-30px))] py-16">
        <Card>
          <h1 className="mb-3 text-3xl font-bold">Sign in required</h1>
          {/* TODO(spec): link to Log in once auth (magic link / OTP) exists. */}
          <Muted>Please sign in to see My LOOP.</Muted>
        </Card>
      </section>
    );
  if (isError || !me)
    return (
      <section className="mx-auto w-[min(40rem,calc(100%-30px))] py-16">
        <p role="alert" className="text-red">
          We couldn’t load your profile. Please try again.
        </p>
      </section>
    );

  const status = me.paused ? "PAUSED" : me.live ? "LIVE" : "NOT LIVE";

  return (
    <section className="mx-auto w-[min(56rem,calc(100%-30px))] py-16">
      <Eyebrow>My LOOP</Eyebrow>
      <h1 className="mb-6 text-3xl font-bold">Welcome{me.firstName ? `, ${me.firstName}` : ""}</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-2 text-xl font-semibold">Your profile</h2>
          <span className="mb-3 inline-block rounded-full border border-line px-3 py-1 text-xs font-semibold text-lime">
            {status}
          </span>
          <Muted>{[me.firstName, me.lastName].filter(Boolean).join(" ")}</Muted>
        </Card>
        <Card>
          <h2 className="mb-2 text-xl font-semibold">Stay current. Stay visible.</h2>
          <div className="mb-3 flex items-center gap-3">
            <AvailabilityBadge colour={me.availability.colour} />
            <span>{me.availability.label}</span>
          </div>
          <Link to="/my-loop/availability" className="text-lime hover:underline">
            Confirm / update availability →
          </Link>
        </Card>
        <Card>
          <h2 className="mb-2 text-xl font-semibold">Introduce contractors</h2>
          <Muted className="mb-3">
            Introduce five UK IT contractors who register to qualify for Founding Membership.
          </Muted>
          <Link to="/introduce" className="text-lime hover:underline">
            Introduce IT Contractors →
          </Link>
        </Card>
        <Card>
          <h2 className="mb-2 text-xl font-semibold">Rewards and Founding status</h2>
          {/* TODO(spec): rewards ledger and founding progress come from Phase 4/5 APIs. */}
          <Muted>Not activated yet.</Muted>
        </Card>
      </div>
    </section>
  );
}
