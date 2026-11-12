import { useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router";
import {
  downloadCvUpload,
  useGetJoinProfile,
  useGetManualProfile,
  useGetMyPhoto,
  useGetProfileDetails,
  useListAssignments,
  useListCvVersions,
  type JoinProfileDto,
  type ProfileDetailsDto,
} from "@loop/api-client";
import type { AvailabilityColour } from "@loop/contracts";
import { Muted } from "../marketing/primitives";
import { SignInRequired } from "../auth/sign-in-required";
import { RewardsFoundingCard } from "../rewards/rewards-founding-card";
import { LOCATION_LABELS } from "../join/review-step";
import { BTN, BTN_PRIMARY, BTN_SMALL, EYEBROW, PROTO_FONT } from "./desktop-profile-ui";
import { MyLoopNav } from "./frame";
import { AvailabilityEditor, ProfileEditor } from "./profile-editors";
import { useMe } from "./use-me";

/** Desktop My Profile follows the approved desktop prototype: the status colour (not static lime) borders each card. */
const TONES: Record<AvailabilityColour, string> = {
  LIME: "#caff35",
  ORANGE: "#f5a23c",
  RED: "#e85c62",
  BLUE: "#5bafff",
  GREY: "#9ba7ae",
};
const ICONS: Record<AvailabilityColour, string> = { LIME: "✓", ORANGE: "◔", RED: "✕", BLUE: "▣", GREY: "?" };

const CARD = "rounded-[10px] border border-[#20485b] border-x-4 border-x-[var(--tone)] bg-[#09283b] p-[18px]";
const PATTERNS: Record<string, string> = { REMOTE: "Remote", HYBRID: "Hybrid", ONSITE: "On-site" };
const IR35: Record<string, string> = { INSIDE: "Inside", OUTSIDE: "Outside", EITHER: "Both", UNSURE: "Not sure" };
const TRAVEL: Record<string, string> = { YES: "Occasional travel", NO: "No travel", DEPENDS: "Travel depends" };
const rate = (p: number | null | undefined) => (p ? `£${Math.round(p / 100)}` : null);

type Editing = "availability" | "profile" | null;

function Card({ title, to, edit, onEdit, children, label }: { title: string; to?: string; edit?: Exclude<Editing, null>; onEdit?: (e: Exclude<Editing, null>) => void; children: ReactNode; label?: string }) {
  return (
    <section aria-label={label ?? title} className={CARD}>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="text-base font-bold text-[#f0f6fa]">{title}</h3>
        {edit && onEdit ? (
          <button type="button" onClick={() => onEdit(edit)} aria-label={`Edit ${title}`} className="text-xs text-[#71d9e6] hover:underline">
            ✎ Edit
          </button>
        ) : (
          to && (
            <Link to={to} aria-label={`Edit ${title}`} className="text-xs text-[#71d9e6] hover:underline">
              ✎ Edit
            </Link>
          )
        )}
      </div>
      {children}
    </section>
  );
}

function Fact({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-[9px] border border-[#20485b] border-x-4 border-x-[var(--tone)] bg-[#082336] p-[15px]">
      <span className="block text-xs text-[#a0b8c6]">{label}</span>
      <strong className="text-[15px] text-[#f0f6fa]">{value}</strong>
      <p className="mt-1.5 text-[15px] text-[#d5e5ec]">{note}</p>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <p className="mb-2 text-[15px] text-[#d5e5ec]">
      <span className="text-[#a0b8c6]">{label}: </span>
      {value || "Not provided"}
    </p>
  );
}

/** Prototype card sub-heading (h3) with its paragraph. */
function Sub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <h4 className="mb-1 mt-3 text-base font-bold text-[#f0f6fa] first:mt-0">{title}</h4>
      <p className="mb-2 text-[15px] text-[#d5e5ec]">{children}</p>
    </>
  );
}

function Skills({ skills }: { skills: string[] }) {
  return skills.length ? (
    <div className="flex flex-wrap gap-2">
      {skills.map((s) => (
        <span key={s} className="rounded-[20px] border border-[#47616d] bg-[#192b34] px-3 py-2 text-[11px] text-[#e9f1f4]">
          {s}
        </span>
      ))}
    </div>
  ) : (
    <Muted className="text-[13px]">No skills added yet.</Muted>
  );
}

/** My LOOP "My Profile": the contractor's own, private view of what they registered (desktop is for occasional edits; the app is for day-to-day). */
export function MyLoopPage() {
  const { me, isPending, isError, unauthenticated } = useMe();
  const manual = useGetManualProfile({ query: { enabled: !!me } });
  const joined = useGetJoinProfile({ query: { enabled: !!me } });
  const details = useGetProfileDetails({ query: { enabled: !!me } });
  const assignments = useListAssignments({ query: { enabled: !!me } });
  const versions = useListCvVersions({ query: { enabled: !!me } });
  const photo = useGetMyPhoto({ query: { enabled: !!me } });
  const [photoBroken, setPhotoBroken] = useState(false);
  const [cvError, setCvError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);

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
  const cvVersions = versions.data?.status === 200 ? versions.data.data.items : [];
  const latestCv = cvVersions.reduce<(typeof cvVersions)[number] | null>((a, v) => (!a || v.versionNumber > a.versionNumber ? v : a), null);

  const photoUrl = photo.data?.status === 200 && !photoBroken ? photo.data.data.url : null;
  const fullName = [me.firstName, me.lastName].filter(Boolean).join(" ");
  const initials = [me.firstName, me.lastName].map((n) => n?.[0] ?? "").join("").toUpperCase();
  const title = j?.title ?? headline ?? "UK IT contractor";
  const colour = me.availability.colour;
  const tone = { "--tone": TONES[colour] } as CSSProperties;
  const confirmed = me.availability.lastConfirmedAt ? new Date(me.availability.lastConfirmedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Not yet confirmed";
  const regions = j
    ? [...j.workLocations.map((l) => LOCATION_LABELS[l] ?? l), ...((j.otherPlaces ?? []).length > 0 ? (j.otherPlaces ?? []) : j.otherLocations ? [j.otherLocations] : [])].filter(Boolean)
    : [];
  const patterns = j?.workPatterns.map((p) => PATTERNS[p] ?? p).join(", ") ?? "";
  const roles = [j?.title, ...(j?.preferredRoles ?? [])].filter((r, i, all): r is string => !!r && all.indexOf(r) === i).slice(0, 3);
  const target = rate(j?.targetDayRatePence);
  const min = rate(j?.minDayRatePence);
  const ir35 = d?.ir35Status ? IR35[d.ir35Status] : null;
  const end = me.contractEndDate ? new Date(`${me.contractEndDate}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null;
  const clearance = d?.securityClearance === "YES" ? "Security cleared" : d?.securityClearance === "NO" ? "Not security cleared" : null;
  const status = me.paused ? "Your profile is paused." : me.live ? "Your profile is LIVE." : "Your profile is not LIVE yet.";

  async function openCv(mode: "view" | "download") {
    if (!latestCv) return;
    setCvError(null);
    const win = mode === "view" ? window.open("", "_blank") : null;
    try {
      const res = await downloadCvUpload(latestCv.uploadId);
      if (win) {
        win.opener = null;
        win.location.href = res.data.url;
      } else {
        const a = document.createElement("a");
        a.href = res.data.url;
        a.download = "";
        a.rel = "noopener";
        a.click();
      }
    } catch {
      win?.close();
      setCvError("We couldn’t open your CV. Please try again.");
    }
  }

  return (
    <div className="mx-auto my-6 w-[min(1390px,calc(100%-20px))] overflow-hidden rounded-lg border border-[#1d4052] bg-[#041c2c] text-[15px] leading-normal" style={{ ...tone, fontFamily: PROTO_FONT }}>
      <div className="grid md:grid-cols-[198px_1fr]">
        <MyLoopNav selected="overview" />

        <section className="p-[23px] pb-7">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className={EYEBROW}>Your professional profile</span>
            <span className="text-[13px] text-[#aebfc4]">Desktop is for registration and occasional profile edits</span>
          </div>

          <section aria-label="Profile summary" className={`${CARD} bg-gradient-to-br from-[#08263a] to-[#0b3045]`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div
                  aria-hidden={photoUrl ? undefined : "true"}
                  className="grid h-[86px] w-[86px] shrink-0 place-items-center overflow-hidden rounded-[15px] bg-[#113348] text-3xl font-black text-[#d5e5ec]"
                >
                  {photoUrl ? <img src={photoUrl} alt="Profile photograph" className="h-full w-full object-cover" onError={() => setPhotoBroken(true)} /> : initials}
                </div>
                <div>
                  <h1 className="my-1 text-[32px] font-bold leading-tight text-white">{fullName || "Your profile"}</h1>
                  <p className="text-sm text-[#d2dfe1]">
                    {title}
                    {j?.location ? ` · ${j.location}` : ""}
                  </p>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
                    <span
                      data-testid="status-pill"
                      className="inline-flex items-center gap-1.5 rounded-[20px] border border-[var(--tone)] px-[11px] py-[5px] text-[13px] font-extrabold text-[var(--tone)]"
                    >
                      <span aria-hidden="true">{ICONS[colour]}</span>
                      {me.availability.label}
                    </span>
                    <span className="text-[13px] text-[#aebfc4]">Last confirmed: {confirmed}</span>
                  </div>
                  <p className="mt-[13px] text-[13px] text-[#aebfc4]">{status} Keep your availability current in the LOOP app.</p>
                </div>
              </div>
              <div className="flex min-w-[190px] flex-col gap-2">
                <button type="button" onClick={() => setEditing("availability")} className={BTN_PRIMARY}>
                  Update availability
                </button>
                <button type="button" onClick={() => setEditing("profile")} className={BTN}>
                  Edit my profile
                </button>
                <button
                  type="button"
                  onClick={() => document.getElementById("loop-app")?.scrollIntoView({ behavior: "smooth" })}
                  className={BTN}
                >
                  Get the LOOP app ↘
                </button>
              </div>
            </div>
          </section>

          <div className="mt-3.5 grid gap-3.5 md:grid-cols-3" aria-label="Key facts" role="group">
            <Fact label="Availability" value={me.availability.label} note={end ? `Expected end: ${end}` : "No end date supplied"} />
            <Fact
              label="Target day rate"
              value={target ? `${target} / day` : "Not set"}
              note={`Minimum ${min ?? "not set"} · IR35: ${ir35 ?? "Not provided"}`}
            />
            <Fact label="Working preferences" value={patterns || "Not provided"} note={regions.join(", ") || "No locations provided"} />
          </div>

          <h2 className="mb-1 mt-7 text-xl font-bold text-[#f4f9ff]">Professional profile</h2>
          <p className="mb-3 text-[13px] text-[#aebfc4]">Information supplied during registration. Edit it whenever your circumstances change.</p>

          <div className="grid gap-3.5">
            <Card title="Skills" edit="profile" onEdit={setEditing}>
              <Skills skills={skills} />
            </Card>

            <div className="grid gap-3.5 md:grid-cols-2">
              <Card title="Preferred roles & experience" edit="profile" onEdit={setEditing}>
                <p className="mb-2 text-[15px] text-[#d5e5ec]">{roles.join(", ") || title}</p>
                <Sub title="Professional summary">Add your professional summary.</Sub>
                <Sub title="Security clearance">{clearance ?? "Not declared"} (self-declared)</Sub>
                {j?.linkedinUrl && <Line label="LinkedIn" value={j.linkedinUrl} />}
              </Card>
              <Card title="Current situation" edit="availability" onEdit={setEditing}>
                <p className="mb-2 text-[15px] text-[#d5e5ec]">
                  {me.availability.label}
                  {end ? ` · ${end}` : ""}
                </p>
                <p className="mb-2 text-[15px] text-[#d5e5ec]">
                  Umbrella: {j?.usesUmbrella ? (j.umbrellaProvider ?? "Name to confirm") : j?.usesUmbrella === false ? "No" : "Not provided"}
                </p>
                <p className="mb-2 text-[15px] text-[#d5e5ec]">Notice: {j?.noticePeriodText || "Not applicable"}</p>
                <p className="text-xs text-[#9fb1b8]">Expected end dates never automatically mark you Available Now.</p>
              </Card>
            </div>

            <Card title="Locations, work pattern & travel" edit="profile" onEdit={setEditing}>
              <p className="mb-2 text-[15px] text-[#d5e5ec]">
                Locations: {regions.join(", ") || "Not provided"} · Patterns: {patterns || "Not provided"} · Hybrid office days:{" "}
                {j?.hybridDays ? `${j.hybridDays} per week` : "Flexible"} · Travel: {j?.occasionalTravel ? TRAVEL[j.occasionalTravel] : "Not provided"}
              </p>
              {j?.location && <Line label="Based in" value={j.location} />}
            </Card>

            <Card title="CV & profile photograph" to="/my-loop/cv">
              <div className="flex flex-wrap items-center gap-2.5">
                <strong className="text-[15px] text-[#f0f6fa]">
                  {latestCv ? `CV on file · Version ${latestCv.versionNumber} · ${new Date(latestCv.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : "No CV on file"}
                </strong>
                <button type="button" disabled={!latestCv} onClick={() => openCv("view")} className={`${BTN} ${BTN_SMALL}`}>
                  View CV
                </button>
                <button type="button" disabled={!latestCv} onClick={() => openCv("download")} className={`${BTN} ${BTN_SMALL}`}>
                  Download CV
                </button>
                <Link to="/my-loop/cv" className={`${BTN} ${BTN_SMALL}`}>
                  Replace CV
                </Link>
              </div>
              {cvError && (
                <p role="alert" className="mt-2 text-[13px] text-red">
                  {cvError}
                </p>
              )}
              <p className="mt-2 text-xs text-[#9fb1b8]">A replacement CV is compared with what you have confirmed; nothing is overwritten automatically.</p>
              <button type="button" onClick={() => setEditing("profile")} className={`${BTN} ${BTN_SMALL} mt-3`}>
                {photoUrl ? "Change photograph" : "Add photograph"}
              </button>
            </Card>

            <Card title="Work history & qualifications" to="/my-loop/assignments">
              {items.length ? (
                items.map((a) => (
                  <p key={a.id} className="mb-2 text-[15px] text-[#d5e5ec]">
                    <strong>{a.role}</strong> · {a.clientName} · {a.startDate} – {a.endDate ?? "Present"}
                  </p>
                ))
              ) : (
                <p className="mb-2 text-[15px] text-[#d5e5ec]">Add work history and assignments.</p>
              )}
              <Sub title="Qualifications & certifications">Add qualifications and certifications.</Sub>
              <button type="button" onClick={() => setEditing("profile")} className={`${BTN} ${BTN_SMALL}`}>
                Edit professional details
              </button>
            </Card>

            <section aria-label="Rewards and introductions" className={CARD}>
              <RewardsFoundingCard />
              <Link to="/introduce" className="mt-2 inline-block text-xs text-[#71d9e6] hover:underline">
                Invite a contractor →
              </Link>
            </section>
          </div>

          <div id="loop-app" tabIndex={-1} className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#3d5949] bg-[#192a26] p-[17px] outline-none">
            <div>
              <strong className="text-lime">LOOP lives on your phone</strong>
              <p className="my-1.5 text-[15px] text-[#c2d1d6]">One-tap availability updates, push reminders, invitations and messages belong in the contractor app.</p>
            </div>
            <Link to="/welcome" className={BTN_PRIMARY}>
              Get the app
            </Link>
          </div>
        </section>
      </div>
      {editing === "availability" && <AvailabilityEditor me={me} onClose={() => setEditing(null)} />}
      {editing === "profile" && <ProfileEditor onClose={() => setEditing(null)} />}
    </div>
  );
}
