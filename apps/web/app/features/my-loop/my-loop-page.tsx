import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { useGetJoinProfile, useGetManualProfile, useGetProfileDetails, useListAssignments, type JoinProfileDto, type ProfileDetailsDto } from "@loop/api-client";
import { AvailabilityBadge } from "@loop/ui";
import { BTN_OUTLINE, BTN_SOLID, Muted } from "../marketing/primitives";
import { SignInRequired } from "../auth/sign-in-required";
import { RewardsFoundingCard } from "../rewards/rewards-founding-card";
import { LOCATION_LABELS } from "../join/review-step";
import { MyLoopNav } from "./frame";
import { useMe } from "./use-me";

const PANEL = "rounded-md border border-[#20485b] bg-[#09283b] p-[15px]";
const TABS = ["Overview", "Experience", "Skills", "Availability", "Preferences", "CV & documents"] as const;
type Tab = (typeof TABS)[number];

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-3 border-b border-[#1a4153] py-2 text-[11px] last:border-0">
      <span className="text-[#a0b8c6]">{label}</span>
      <span className="text-right text-[#edf5f7]">{value || "Not provided"}</span>
    </div>
  );
}

function Panel({ title, to, children }: { title: string; to?: string; children: ReactNode }) {
  return (
    <section className={PANEL}>
      <div className="mb-2 flex items-center justify-between gap-2 border-b border-[#1a4153] pb-2">
        <h3 className="text-sm text-[#f0f6fa]">{title}</h3>
        {to && (
          <Link to={to} className="text-[11px] text-[#71d9e6] hover:underline">
            ✎ Edit
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

const PATTERNS: Record<string, string> = { REMOTE: "Remote", HYBRID: "Hybrid", ONSITE: "On-site" };
const rate = (p: number | null) => (p ? `£${Math.round(p / 100)}/day` : "Not set");

function Skills({ skills }: { skills: string[] }) {
  return skills.length ? (
    <div className="flex flex-wrap gap-1.5">
      {skills.map((s) => (
        <span key={s} className="rounded-full border border-[#24475a] bg-[#0a293e] px-2.5 py-1 text-[11px] text-[#d5e5ec]">
          {s}
        </span>
      ))}
    </div>
  ) : (
    <Muted className="text-xs">No skills added yet.</Muted>
  );
}

/** My LOOP "My Profile" (V33 reference dashboard): identity, tabs of the contractor's confirmed profile and the right-hand cards. */
export function MyLoopPage() {
  const { me, isPending, isError, unauthenticated } = useMe();
  const manual = useGetManualProfile({ query: { enabled: !!me } });
  const joined = useGetJoinProfile({ query: { enabled: !!me } });
  const details = useGetProfileDetails({ query: { enabled: !!me } });
  const assignments = useListAssignments({ query: { enabled: !!me } });
  const [tab, setTab] = useState<Tab>("Overview");

  if (isPending)
    return (
      <section className="mx-auto w-[min(56rem,calc(100%-30px))] py-16">
        <Muted>Loading…</Muted>
      </section>
    );
  if (unauthenticated) return <SignInRequired message="Please sign in to see My LOOP." />;
  if (isError || !me)
    return (
      <section className="mx-auto max-w-3xl px-[26px] py-[70px] md:py-[90px]">
        <p role="alert" className="text-red">
          We couldn’t load your profile. Please try again.
        </p>
      </section>
    );

  const skills = manual.data?.status === 200 ? manual.data.data.skills : [];
  const headline = manual.data?.status === 200 ? manual.data.data.headline : null;
  const j: JoinProfileDto | null = joined.data?.status === 200 ? joined.data.data : null;
  const d: ProfileDetailsDto | null = details.data?.status === 200 ? details.data.data : null;
  const items = assignments.data?.status === 200 ? assignments.data.data.items : [];
  const fullName = [me.firstName, me.lastName].filter(Boolean).join(" ");
  const initials = [me.firstName, me.lastName].map((n) => n?.[0] ?? "").join("").toUpperCase();
  const status = me.paused ? "PAUSED" : me.live ? "LIVE" : "NOT LIVE";
  const title = j?.title ?? headline ?? "UK IT contractor";
  const confirmed = me.availability.lastConfirmedAt ? new Date(me.availability.lastConfirmedAt).toLocaleDateString("en-GB") : "Not yet confirmed";
  const regions = j ? [...j.workLocations.map((l) => LOCATION_LABELS[l] ?? l), ...((j.otherPlaces ?? []).length > 0 ? (j.otherPlaces ?? []) : j.otherLocations ? [j.otherLocations] : [])].filter(Boolean) : [];

  const overview = (
    <>
      <div className="grid gap-2.5 md:grid-cols-2">
        <Panel title="Professional summary" to="/my-loop/cv">
          <p className="text-xs text-[#a7bdc9]">
            Your CV-derived professional summary will appear here once you have reviewed and verified it. Keep your experience current to help recruiters
            assess relevant opportunities.
          </p>
        </Panel>
        <Panel title="Key skills" to="/my-loop/profile">
          <Skills skills={skills} />
        </Panel>
        <Panel title="Current situation" to="/my-loop/availability">
          <Detail label="Status" value={me.availability.label} />
          <Detail label="Expected contract end" value={me.contractEndDate} />
          <Detail label="Notice period" value={j?.noticePeriodText ?? "Not specified"} />
        </Panel>
        <Panel title="Rates & compliance" to="/my-loop/preferences">
          <Detail label="Target day rate" value={rate(j?.targetDayRatePence ?? null)} />
          <Detail label="Minimum day rate" value={rate(j?.minDayRatePence ?? null)} />
          <Detail label="IR35" value={d?.ir35Status ? { INSIDE: "Inside", OUTSIDE: "Outside", EITHER: "Both", UNSURE: "Not sure" }[d.ir35Status] : null} />
          <Detail label="Security cleared" value={d?.securityClearance === "YES" ? "Yes" : d?.securityClearance === "NO" ? "No" : null} />
          <Detail label="Umbrella company" value={j?.usesUmbrella ? (j.umbrellaProvider ?? "Name to confirm") : j?.usesUmbrella === false ? "No" : null} />
        </Panel>
        <Panel title="Location & working pattern" to="/my-loop/preferences">
          <Detail label="Based in" value={j?.location} />
          <Detail label="Preferred work locations" value={regions.join(" · ")} />
          <Detail label="Working pattern" value={j?.workPatterns.map((p) => PATTERNS[p] ?? p).join(" · ")} />
        </Panel>
        <Panel title="Role preferences" to="/my-loop/profile">
          <Detail label="Primary role" value={title} />
          <Detail label="Other roles" value={j?.preferredRoles.join(" · ")} />
        </Panel>
      </div>
      <section className={`${PANEL} mt-2.5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm text-[#f0f6fa]">CV &amp; documents</h3>
            <p className="text-[11px] text-[#9fb4c3]">Your CV was uploaded at registration. Updates are compared with what you have confirmed.</p>
          </div>
          <Link to="/my-loop/cv" className={`${BTN_OUTLINE} !px-4 !py-2 text-xs`}>
            Update CV
          </Link>
        </div>
      </section>
    </>
  );

  const tabBody: Record<Tab, ReactNode> = {
    Overview: overview,
    Experience: (
      <Panel title="Assignments & experience" to="/my-loop/assignments">
        {items.length ? (
          items.map((a) => (
            <div key={a.id} className="border-b border-[#1a4153] py-2 text-xs last:border-0">
              <strong className="text-[#f0f6fa]">{a.role}</strong>
              <p className="text-[#a7bdc9]">
                {a.clientName} · {a.startDate} – {a.endDate ?? "Present"}
              </p>
            </div>
          ))
        ) : (
          <p className="text-xs text-[#a7bdc9]">
            Your CV experience will be displayed here once extracted and confirmed. You can also add your latest assignment without uploading a new CV.
          </p>
        )}
        <Link to="/my-loop/edit" className={`${BTN_SOLID} mt-3 !px-4 !py-2 text-xs`}>
          + Add latest assignment
        </Link>
      </Panel>
    ),
    Skills: (
      <Panel title="Skills & expertise" to="/my-loop/profile">
        <Skills skills={skills} />
      </Panel>
    ),
    Availability: (
      <Panel title="My availability" to="/my-loop/availability">
        <Detail label="Current status" value={me.availability.label} />
        <Detail label="Expected contract end" value={me.contractEndDate} />
        <Detail label="Last confirmed" value={confirmed} />
        <Link to="/my-loop/edit" className={`${BTN_OUTLINE} mt-3 !px-4 !py-2 text-xs`}>
          Confirm profile is current
        </Link>
      </Panel>
    ),
    Preferences: (
      <Panel title="Contract preferences" to="/my-loop/preferences">
        <Detail label="Work locations" value={regions.join(" · ")} />
        <Detail label="Work pattern" value={j?.workPatterns.map((p) => PATTERNS[p] ?? p).join(" · ")} />
        <Detail label="IR35" value={d?.ir35Status ? { INSIDE: "Inside", OUTSIDE: "Outside", EITHER: "Both", UNSURE: "Not sure" }[d.ir35Status] : null} />
        <Detail label="Target rate" value={rate(j?.targetDayRatePence ?? null)} />
      </Panel>
    ),
    "CV & documents": (
      <Panel title="CV & documents" to="/my-loop/cv">
        <p className="text-xs text-[#a7bdc9]">
          Upload a replacement CV to propose changes to your verified LOOP profile. Nothing is automatically overwritten.
        </p>
        <Link to="/my-loop/cv" className={`${BTN_SOLID} mt-3 !px-4 !py-2 text-xs`}>
          Update CV or experience
        </Link>
      </Panel>
    ),
  };

  return (
    <div className="mx-auto my-6 w-[min(1390px,calc(100%-20px))] overflow-hidden rounded-lg border border-[#1d4052] bg-[#041c2c]">
      <div className="grid md:grid-cols-[198px_1fr]">
        <MyLoopNav selected="overview" />

        <section className="p-[23px] pb-7">
          <div className="mb-[18px] flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-[27px] font-bold text-[#f4f9ff]">My Profile</h1>
              <p className="text-xs text-[#9fb4c3]">This is your professional LOOP profile. Keep it current to stay visible for relevant opportunities.</p>
            </div>
            <span className="text-xs italic text-[#9fb4c3]">“Live data creates real opportunities.”</span>
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
                    <strong className="text-sm text-[#d5e5ec]">{title}</strong>
                    {j?.location && <p className="text-xs text-[#a7bdc9]">⌖ {j.location}</p>}
                    <span className="mt-1 inline-block rounded-[15px] bg-[#244425] px-2.5 py-1 text-[10px] font-extrabold text-[#c2f350]">● {status}</span>{" "}
                    <span className="text-[10px] text-[#89a4b5]">Last confirmed: {confirmed}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link to="/my-loop/profile" className={`${BTN_OUTLINE} !px-4 !py-2 text-xs`}>
                    Edit profile
                  </Link>
                  <Link to="/my-loop/cv" className={`${BTN_OUTLINE} !px-4 !py-2 text-xs`}>
                    Update CV
                  </Link>
                </div>
              </div>

              <div role="tablist" aria-label="Profile sections" className="my-[11px] flex gap-[5px] overflow-auto">
                {TABS.map((t) => {
                  const active = t === tab;
                  return (
                    <button
                      key={t}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setTab(t)}
                      className={`whitespace-nowrap rounded-[5px] border px-[13px] py-[11px] text-[11px] ${
                        active ? "border-[#c1f34f] bg-[#c1f34f] font-extrabold text-[#09222c]" : "border-[#24475a] bg-[#0a293e] text-[#c9d8e2]"
                      }`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>

              <div role="tabpanel">{tabBody[tab]}</div>

              <section className={`${PANEL} mt-2.5`}>
                <RewardsFoundingCard />
              </section>
            </div>

            <aside className="flex flex-col gap-2.5">
              <section className={PANEL}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-sm text-[#f0f6fa]">Your availability</h3>
                  <AvailabilityBadge colour={me.availability.colour} />
                </div>
                <p className="mb-1 text-[11px] text-[#edf5f7]">Last confirmed: {confirmed}</p>
                <p className="mb-2 text-[11px] text-[#a7bdc9]">Keep this up to date to stay visible in relevant searches.</p>
                <Link to="/my-loop/availability" className={`${BTN_SOLID} !px-4 !py-2 text-xs`}>
                  Update availability →
                </Link>
                <p className="mt-2 text-[10px] text-[#89a4b5]">An end date passing never automatically marks you available.</p>
              </section>
              <section className={PANEL}>
                <h3 className="mb-1 text-sm text-[#f0f6fa]">Profile currency</h3>
                <p className="mb-2 text-[11px] leading-[1.6] text-[#a7bdc9]">
                  ✓ CV uploaded at registration
                  <br />✓ Contractor verifies AI suggestions
                  <br />✓ Availability confirmed by you
                </p>
                <Link to="/my-loop/edit" className={`${BTN_OUTLINE} !px-4 !py-2 text-xs`}>
                  Confirm profile is current
                </Link>
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
                  Messages, call requests, contract opportunities and Authority to Represent will activate when clients join.
                </p>
              </section>
              <Link to="/" className={`${BTN_OUTLINE} justify-center !py-2 text-xs`}>
                Back to homepage
              </Link>
            </aside>
          </div>
        </section>
      </div>
    </div>
  );
}

