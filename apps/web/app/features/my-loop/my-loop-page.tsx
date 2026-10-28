import { AvailabilityBadge } from "@loop/ui";
import { Link } from "react-router";
import { BTN_OUTLINE, BTN_SOLID, Muted } from "../marketing/primitives";
import { SignInRequired } from "../auth/sign-in-required";
import { MyLoopNav } from "./frame";
import { RewardsFoundingCard } from "../rewards/rewards-founding-card";
import { useMe } from "./use-me";

const PANEL = "rounded-md border border-[#20485b] bg-[#09283b] p-[15px]";

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-[#1a4153] py-2 text-[11px] last:border-0">
      <span className="text-[#a0b8c6]">{label}</span>
      <span className="text-[#edf5f7]">{value}</span>
    </div>
  );
}

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
      <SignInRequired message="Please sign in to see My LOOP." />
    );
  if (isError || !me)
    return (
      <section className="mx-auto max-w-3xl px-[26px] py-[70px] md:py-[90px]">
        <p role="alert" className="text-red">
          We couldn’t load your profile. Please try again.
        </p>
      </section>
    );

  const status = me.paused ? "PAUSED" : me.live ? "LIVE" : "NOT LIVE";
  const fullName = [me.firstName, me.lastName].filter(Boolean).join(" ");
  const initials = [me.firstName, me.lastName].map((n) => n?.[0] ?? "").join("").toUpperCase();

  return (
    <div className="mx-auto my-6 w-[min(1390px,calc(100%-20px))] overflow-hidden rounded-lg border border-[#1d4052] bg-[#041c2c]">
      <div className="grid md:grid-cols-[198px_1fr]">
        <MyLoopNav selected="overview" />

        <main className="p-[23px] pb-7">
          <div className="mb-[18px]">
            <h1 className="text-[27px] font-bold text-[#f4f9ff]">My LOOP</h1>
            <p className="text-xs text-[#9fb4c3]">Welcome{me.firstName ? `, ${me.firstName}` : ""}. Keep your profile current to stay visible.</p>
          </div>

          <div className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,1fr)_250px]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-[7px] border border-[#244a5f] bg-gradient-to-br from-[#08263a] to-[#0b3045] p-[18px]">
                <div className="flex items-center gap-4">
                  <div
                    aria-hidden="true"
                    className="grid h-[92px] w-[92px] place-items-center rounded-full border-[3px] border-[#b8ef4d] bg-[#113348] text-3xl font-black text-[#d5e5ec]"
                  >
                    {initials}
                  </div>
                  <div>
                    <h2 className="text-[22px] font-bold text-white">{fullName || "Your profile"}</h2>
                    <span className="mt-1 inline-block rounded-[15px] bg-[#244425] px-2.5 py-1 text-[10px] font-extrabold text-[#c2f350]">
                      ● {status}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link to="/my-loop/availability" className={`${BTN_SOLID} !px-4 !py-2 text-xs`}>
                    Update availability
                  </Link>
                </div>
              </div>

              {/* TODO(spec): Experience, Skills, Preferences and CV tabs need profile endpoints (A6–A9); only Overview has real data. */}
              <div role="tablist" aria-label="Profile sections" className="my-[11px] flex gap-[5px] overflow-auto">
                {["Overview", "Experience", "Skills", "Availability", "Preferences", "CV & documents"].map((t) => {
                  const active = t === "Overview";
                  return (
                    <button
                      key={t}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      disabled={!active}
                      className={`whitespace-nowrap rounded-[5px] border px-[13px] py-[11px] text-[11px] ${
                        active ? "border-[#c1f34f] bg-[#c1f34f] font-extrabold text-[#09222c]" : "border-[#24475a] bg-[#0a293e] text-[#c9d8e2] opacity-65"
                      }`}
                    >
                      {t}
                      {!active && <span className="ml-1.5 text-[8px] font-extrabold uppercase text-[#bce44f]">soon</span>}
                    </button>
                  );
                })}
              </div>

              <div className="grid gap-2.5 md:grid-cols-2">
                <section className={PANEL}>
                  <h3 className="mb-2 border-b border-[#1a4153] pb-2 text-sm text-[#f0f6fa]">Profile status</h3>
                  <Detail label="Name" value={fullName || "—"} />
                  <Detail label="Visibility" value={status} />
                  <Detail label="Availability" value={me.availability.label} />
                </section>
                <section className={PANEL}>
                  <RewardsFoundingCard />
                </section>
              </div>
            </div>

            <aside className="flex flex-col gap-2.5">
              <section className={PANEL}>
                <h3 className="mb-2 text-sm text-[#f0f6fa]">Your availability</h3>
                <div className="mb-2 flex items-center gap-3">
                  <AvailabilityBadge colour={me.availability.colour} />
                  <span className="text-xs text-[#edf5f7]">{me.availability.label}</span>
                </div>
                <Link to="/my-loop/availability" className="text-[11px] text-[#71d9e6] hover:underline">
                  Update availability →
                </Link>
                <p className="mt-2 text-[10px] text-[#89a4b5]">An end date passing never automatically marks you available.</p>
              </section>
              <section className={PANEL}>
                <h3 className="mb-1 text-sm text-[#f0f6fa]">Invite a contractor</h3>
                <p className="mb-2 text-[11px] leading-[1.6] text-[#a7bdc9]">
                  Help build the UK IT contractor network and earn rewards when qualifying conditions are met.
                </p>
                <Link to="/introduce" className="text-[11px] text-[#71d9e6] hover:underline">
                  Invite a contractor →
                </Link>
              </section>
              <section className="rounded-md border border-[#20485b] bg-[#082336] p-[15px]">
                <span className="text-[9px] font-extrabold uppercase tracking-wider text-[#c5ee5e]">Coming soon</span>
                <h3 className="mb-1 mt-1 text-sm text-[#f0f6fa]">Recruiter communications</h3>
                <p className="text-[11px] leading-[1.6] text-[#a7bdc9]">
                  Messages, call requests and contract opportunities will activate when clients join.
                </p>
              </section>
              <Link to="/" className={`${BTN_OUTLINE} justify-center !py-2 text-xs`}>
                Back to homepage
              </Link>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}
