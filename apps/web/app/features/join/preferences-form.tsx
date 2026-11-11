import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetJoinProfileQueryKey,
  getGetProfileDetailsQueryKey,
  getGetReviewQueryKey,
  updateJoinProfile,
  updateProfileDetails,
  useGetJoinProfile,
  useGetProfileDetails,
  type JoinProfileDto,
  type ProfileDetailsDto,
} from "@loop/api-client";
import { BTN_OUTLINE, BTN_SOLID, Muted } from "../marketing/primitives";
import { Check, ConfirmBox, Note, OptionGroup, Radio, TextField, toggle, INPUT } from "./form-bits";
import { PlacePicker } from "./place-picker";

const IR35 = [["INSIDE", "Inside"], ["OUTSIDE", "Outside"], ["EITHER", "Both"]] as const;
const LOCATIONS = [
  ["ANYWHERE", "Anywhere in the UK"],
  ["LONDON", "London"],
  ["SOUTH_EAST", "South East England"],
  ["SOUTH_WEST", "South West England"],
  ["MIDLANDS", "Midlands"],
  ["NORTH_WEST", "North West England"],
  ["NORTH_EAST", "North East England"],
  ["YORKSHIRE", "Yorkshire & Humber"],
  ["SCOTLAND", "Scotland"],
  ["WALES", "Wales"],
  ["NORTHERN_IRELAND", "Northern Ireland"],
] as const;
const LONDON_AREAS = [
  ["ANYWHERE_LONDON", "Anywhere in London"],
  ["CENTRAL", "Central London"],
  ["NORTH", "North London"],
  ["SOUTH", "South London"],
  ["EAST", "East London"],
  ["WEST", "West London"],
] as const;
const TRAVEL_LABELS = { YES: "Yes", NO: "No", DEPENDS: "Depends on location and frequency" } as const;
const PATTERNS = [["REMOTE", "Remote"], ["HYBRID", "Hybrid"], ["ONSITE", "On-site"]] as const;

type Yn = "yes" | "no" | null;
const yn = (b: boolean | null): Yn => (b === null ? null : b ? "yes" : "no");
const bool = (v: Yn): boolean | null => (v === null ? null : v === "yes");

/** The form state: pounds as typed, answers as the screens show them. Converted to the stored shapes on save. */
interface Draft {
  targetRate: string;
  minRate: string;
  ir35: string | null;
  umbrella: Yn;
  umbrellaProvider: string;
  locations: string[];
  otherPlaces: string[];
  londonAreas: string[];
  londonOther: string;
  locationsConfirmed: boolean;
  remoteUk: Yn;
  clearance: Yn;
  patterns: string[];
  hybridDays: string;
  travel: string | null;
}

const pounds = (pence: number | null) => (pence ? String(Math.round(pence / 100)) : "");

function draftFrom(j: JoinProfileDto, d: ProfileDetailsDto): Draft {
  return {
    targetRate: pounds(j.targetDayRatePence),
    minRate: pounds(j.minDayRatePence),
    ir35: d.ir35Status === "INSIDE" || d.ir35Status === "OUTSIDE" || d.ir35Status === "EITHER" ? d.ir35Status : null,
    umbrella: yn(j.usesUmbrella),
    umbrellaProvider: j.umbrellaProvider ?? "",
    locations: j.workLocations,
    otherPlaces: j.otherPlaces ?? [],
    londonAreas: j.londonAreas,
    londonOther: j.londonOther ?? "",
    locationsConfirmed: j.workLocationsConfirmed,
    remoteUk: yn(j.remoteUk),
    clearance: d.securityClearance === "YES" ? "yes" : d.securityClearance === "NO" ? "no" : null,
    patterns: j.workPatterns,
    hybridDays: j.hybridDays ? String(j.hybridDays) : "",
    travel: j.occasionalTravel ?? null,
  };
}

/** What stops the Preferences step from continuing, worded for the contractor. Empty means ready. */
export function preferenceProblems(d: Draft): string[] {
  const out: string[] = [];
  const target = Number(d.targetRate);
  const min = Number(d.minRate);
  if (!(target > 0)) out.push("Enter your target day rate.");
  if (!(min > 0)) out.push("Enter your minimum acceptable day rate.");
  if (target > 0 && min > target) out.push("Your minimum day rate can't be higher than your target day rate.");
  if (!d.ir35) out.push("Choose your IR35 preference.");
  if (d.umbrella === null) out.push("Tell us whether you currently use an umbrella company.");
  else if (d.umbrella === "yes" && !d.umbrellaProvider.trim()) out.push("Enter your umbrella company name.");
  const hasLocation = d.locations.length > 0 || d.otherPlaces.length > 0;
  if ((d.patterns.includes("HYBRID") || d.patterns.includes("ONSITE")) && !hasLocation)
    out.push("Select at least one work location or enter a town/city for Hybrid or On-site work.");
  else if (!hasLocation) out.push("Select at least one work location or enter a town or city.");
  else if (!d.locationsConfirmed) out.push("Confirm the locations you would consider working.");
  if (d.clearance === null) out.push("Tell us whether you hold security clearance.");
  if (d.patterns.length === 0) out.push("Select at least one work pattern.");
  if (d.patterns.includes("HYBRID") && !d.hybridDays) out.push("Choose the maximum on-site days per week you would accept for hybrid work.");
  if (d.remoteUk === "yes" && d.patterns.length > 0 && !d.patterns.includes("REMOTE"))
    out.push("You said you'd consider fully remote contracts anywhere in the UK, so select Remote as a work pattern too (or change that answer).");
  return out;
}

export async function savePreferences(d: Draft, joined: JoinProfileDto, details: ProfileDetailsDto): Promise<void> {
  const saved = await updateJoinProfile({
    ...joined,
    targetDayRatePence: Math.round(Number(d.targetRate) * 100),
    minDayRatePence: Math.round(Number(d.minRate) * 100),
    usesUmbrella: bool(d.umbrella),
    umbrellaProvider: d.umbrella === "yes" ? d.umbrellaProvider.trim() : null,
    workLocations: d.locations as JoinProfileDto["workLocations"],
    otherPlaces: d.otherPlaces,
    otherLocations: d.otherPlaces.length > 0 ? d.otherPlaces.join(", ").slice(0, 200) : null,
    londonAreas: d.locations.includes("LONDON") ? (d.londonAreas as JoinProfileDto["londonAreas"]) : [],
    londonOther: d.locations.includes("LONDON") ? d.londonOther.trim() || null : null,
    workLocationsConfirmed: d.locationsConfirmed,
    remoteUk: bool(d.remoteUk),
    workPatterns: d.patterns as JoinProfileDto["workPatterns"],
    hybridDays: d.patterns.includes("HYBRID") && d.hybridDays ? Number(d.hybridDays) : null,
    occasionalTravel: (d.travel as JoinProfileDto["occasionalTravel"]) ?? null,
  });
  if (saved.status !== 200) throw new Error("preferences");
  const det = await updateProfileDetails({
    ...details,
    ir35Status: d.ir35 as ProfileDetailsDto["ir35Status"],
    securityClearance: d.clearance === "yes" ? "YES" : "NO",
  });
  if (det.status !== 200) throw new Error("details");
}

function Form({ joined, details, onSaved, back, submitLabel }: { joined: JoinProfileDto; details: ProfileDetailsDto; onSaved: () => void; back: ReactNode; submitLabel: string }) {
  const qc = useQueryClient();
  const [d, setD] = useState<Draft>(() => draftFrom(joined, details));
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const found = preferenceProblems(d);
    setProblems(found);
    if (found.length > 0) return;
    setError(null);
    setBusy(true);
    try {
      await savePreferences(d, joined, details);
      await Promise.all([
        qc.invalidateQueries({ queryKey: getGetJoinProfileQueryKey() }),
        qc.invalidateQueries({ queryKey: getGetProfileDetailsQueryKey() }),
        qc.invalidateQueries({ queryKey: getGetReviewQueryKey() }),
      ]);
      onSaved();
    } catch {
      setError("We couldn't save your preferences. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const yesNo = (legend: string, name: string, value: Yn, onChange: (v: Yn) => void, required = false) => (
    <OptionGroup legend={legend} required={required}>
      <Radio name={name} label="Yes" checked={value === "yes"} onChange={() => onChange("yes")} />
      <Radio name={name} label="No" checked={value === "no"} onChange={() => onChange("no")} />
    </OptionGroup>
  );

  return (
    <form onSubmit={submit} noValidate className="grid gap-5">
      <TextField label="Target day rate (£)" type="number" required value={d.targetRate} placeholder="e.g. 600" onChange={(v) => set("targetRate", v)} />
      <TextField label="Minimum acceptable day rate (£)" type="number" required value={d.minRate} placeholder="e.g. 500" onChange={(v) => set("minRate", v)} />
      <OptionGroup legend="IR35 preference" required>
        {IR35.map(([v, label]) => (
          <Radio key={v} name="ir35" label={label} checked={d.ir35 === v} onChange={() => set("ir35", v)} />
        ))}
      </OptionGroup>
      {yesNo("Do you currently use an umbrella company?", "usesUmbrella", d.umbrella, (v) => set("umbrella", v))}
      {d.umbrella === "yes" && (
        <TextField label="Umbrella company name" required value={d.umbrellaProvider} placeholder="Enter umbrella company name" maxLength={120} onChange={(v) => set("umbrellaProvider", v)} />
      )}
      <OptionGroup legend="Where would you consider working?" help="Only select regions where you would genuinely consider attending a workplace regularly. You can specify individual towns or cities below.">
        {LOCATIONS.map(([v, label]) => (
          <Check key={v} label={label} checked={d.locations.includes(v)} onChange={(on) => set("locations", toggle(d.locations, v, on))} />
        ))}
      </OptionGroup>
      <PlacePicker label="Additional towns or cities (optional)" value={d.otherPlaces} onChange={(v) => set("otherPlaces", v)} />
      {d.locations.includes("LONDON") && (
        <>
          <OptionGroup legend="London — which areas would you work in?" help="Select all that apply.">
            {LONDON_AREAS.map(([v, label]) => (
              <Check key={v} label={label} checked={d.londonAreas.includes(v)} onChange={(on) => set("londonAreas", toggle(d.londonAreas, v, on))} />
            ))}
          </OptionGroup>
          <TextField
            label="Specific London areas or boroughs (optional)"
            value={d.londonOther}
            placeholder="e.g. Canary Wharf, City of London, Croydon"
            maxLength={200}
            onChange={(v) => set("londonOther", v)}
          />
        </>
      )}
      <ConfirmBox checked={d.locationsConfirmed} onChange={(v) => set("locationsConfirmed", v)}>
        I confirm these are the locations I would consider working. *
      </ConfirmBox>
      {yesNo("Would you consider fully remote contracts anywhere in the UK?", "remoteUK", d.remoteUk, (v) =>
        // Keep the two remote answers consistent: Yes also accepts remote work as a pattern.
        setD((x) => ({ ...x, remoteUk: v, patterns: v === "yes" && !x.patterns.includes("REMOTE") ? [...x.patterns, "REMOTE"] : x.patterns })),
      )}
      <OptionGroup legend="Would you consider occasional travel for client meetings?" help="Remote work with occasional visits is different from fully remote work.">
        {(["YES", "NO", "DEPENDS"] as const).map((v) => (
          <Radio key={v} name="occasionalTravel" label={TRAVEL_LABELS[v]} checked={d.travel === v} onChange={() => set("travel", v)} />
        ))}
      </OptionGroup>
      {yesNo("Do you hold security clearance?", "securityCleared", d.clearance, (v) => set("clearance", v), true)}
      <OptionGroup legend="Work pattern preference" help="Select all that suit you." required>
        {PATTERNS.map(([v, label]) => (
          <Check key={v} label={label} checked={d.patterns.includes(v)} onChange={(on) => set("patterns", toggle(d.patterns, v, on))} />
        ))}
      </OptionGroup>
      {d.patterns.includes("HYBRID") && (
        <label className="block">
          <span className="mb-1 block font-semibold">Maximum on-site days per week for hybrid work</span>
          <select className={INPUT} value={d.hybridDays} onChange={(e) => set("hybridDays", e.target.value)}>
            <option value="">Choose</option>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n} day{n === 1 ? "" : "s"}
              </option>
            ))}
          </select>
        </label>
      )}
      {(d.patterns.includes("HYBRID") || d.patterns.includes("ONSITE")) && (
        <Note>
          <Muted className="text-sm">For hybrid or on-site work, the locations above indicate where you're willing to attend regularly.</Muted>
        </Note>
      )}
      {problems.length > 0 && (
        <ul role="alert" className="grid gap-1 text-orange">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-red">
          {error}
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        {back}
        <button type="submit" className={BTN_SOLID} disabled={busy}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

/** Loads what is stored and renders the V33 Preferences fields. Used by join step 5 and by My LOOP. */
export function PreferencesEditor({ onSaved, backTo, submitLabel }: { onSaved: () => void; backTo: string; submitLabel: string }) {
  const joined = useGetJoinProfile();
  const details = useGetProfileDetails();
  const j = joined.data?.status === 200 ? joined.data.data : null;
  const d = details.data?.status === 200 ? details.data.data : null;
  if (!j || !d) return <Muted>{joined.isError || details.isError ? "We couldn't load your preferences. Please refresh." : "Loading…"}</Muted>;
  return (
    <Form
      joined={j}
      details={d}
      onSaved={onSaved}
      submitLabel={submitLabel}
      back={
        <Link to={backTo} className={BTN_OUTLINE}>
          ← Back
        </Link>
      }
    />
  );
}
