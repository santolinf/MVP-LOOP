import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetManualProfileQueryKey,
  getGetMeQueryKey,
  getGetProfileDetailsQueryKey,
  useGetManualProfile,
  useGetProfileDetails,
  useUpdateManualProfile,
  useUpdateName,
  useUpdateProfileDetails,
  type ManualProfileDto,
  type MeDto,
  type ProfileDetailsDto,
} from "@loop/api-client";
import { Muted } from "../marketing/primitives";
import { BTN_PRIMARY, Field, INPUT, MeGate, PANEL, Status } from "./frame";

const CLEARANCE = [["YES", "Yes"], ["NO", "No"]] as const;
const IR35 = [["INSIDE", "Inside IR35"], ["OUTSIDE", "Outside IR35"], ["EITHER", "Either"], ["UNSURE", "Not sure"]] as const;
const PATTERN = [["FULL_TIME", "Full time"], ["PART_TIME", "Part time"], ["FLEXIBLE", "Flexible"]] as const;

function NameForm({ me }: { me: MeDto }) {
  const qc = useQueryClient();
  const save = useUpdateName();
  const [first, setFirst] = useState(me.firstName ?? "");
  const [last, setLast] = useState(me.lastName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    try {
      await save.mutateAsync({ data: { firstName: first.trim(), lastName: last.trim() } });
      await qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
      setSaved(true);
    } catch {
      setError("We couldn’t save your name. Each name needs 1–80 characters.");
    }
  }

  return (
    <form onSubmit={submit} className={`${PANEL} grid gap-3`}>
      <h2 className="text-sm text-[#f0f6fa]">Name</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="First name">
          <input className={INPUT} maxLength={80} required value={first} onChange={(e) => setFirst(e.target.value)} />
        </Field>
        <Field label="Last name">
          <input className={INPUT} maxLength={80} required value={last} onChange={(e) => setLast(e.target.value)} />
        </Field>
      </div>
      <Status error={error} saved={saved} />
      <div>
        <button type="submit" className={BTN_PRIMARY} disabled={save.isPending || !first.trim() || !last.trim()}>
          Save name
        </button>
      </div>
    </form>
  );
}

function AboutForm({ initial }: { initial: ManualProfileDto }) {
  const qc = useQueryClient();
  const save = useUpdateManualProfile();
  const [headline, setHeadline] = useState(initial.headline ?? "");
  const [skills, setSkills] = useState(initial.skills.join(", "));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    try {
      const list = skills.split(",").map((s) => s.trim()).filter(Boolean);
      await save.mutateAsync({ data: { headline: headline.trim() || null, skills: list } });
      await qc.invalidateQueries({ queryKey: getGetManualProfileQueryKey() });
      setSaved(true);
    } catch {
      setError("We couldn’t save that. Check the lengths (headline 200, each skill 60, up to 20 skills).");
    }
  }

  return (
    <form onSubmit={submit} className={`${PANEL} grid gap-3`}>
      <h2 className="text-sm text-[#f0f6fa]">Headline and skills</h2>
      <Field label="Headline">
        <input className={INPUT} maxLength={200} value={headline} onChange={(e) => setHeadline(e.target.value)} />
      </Field>
      <Field label="Skills (separated by commas)">
        <input className={INPUT} value={skills} onChange={(e) => setSkills(e.target.value)} />
      </Field>
      <Status error={error} saved={saved} />
      <div>
        <button type="submit" className={BTN_PRIMARY} disabled={save.isPending}>
          Save headline and skills
        </button>
      </div>
    </form>
  );
}

function Choice({
  legend,
  name,
  options,
  value,
  onChange,
}: {
  legend: string;
  name: string;
  options: readonly (readonly [string, string])[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1 text-xs font-semibold text-[#c5d4dc]">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map(([v, label]) => (
          <label key={v} className="flex cursor-pointer items-center gap-2 rounded-full border border-line px-3 py-1.5 text-xs has-[:checked]:border-lime">
            <input type="radio" name={name} checked={value === v} onChange={() => onChange(v)} className="accent-lime" />
            {label}
          </label>
        ))}
        {value !== null && (
          <button type="button" className="text-xs text-[#71d9e6] underline" onClick={() => onChange(null)}>
            Clear
          </button>
        )}
      </div>
    </fieldset>
  );
}

function DetailsForm({ initial }: { initial: ProfileDetailsDto }) {
  const qc = useQueryClient();
  const save = useUpdateProfileDetails();
  const [clearance, setClearance] = useState<string | null>(initial.securityClearance);
  const [ir35, setIr35] = useState<string | null>(initial.ir35Status);
  const [pattern, setPattern] = useState<string | null>(initial.workPattern);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    try {
      await save.mutateAsync({
        data: {
          securityClearance: clearance as ProfileDetailsDto["securityClearance"],
          ir35Status: ir35 as ProfileDetailsDto["ir35Status"],
          workPattern: pattern as ProfileDetailsDto["workPattern"],
        },
      });
      await qc.invalidateQueries({ queryKey: getGetProfileDetailsQueryKey() });
      setSaved(true);
    } catch {
      setError("We couldn’t save that. Please try again.");
    }
  }

  return (
    <form onSubmit={submit} className={`${PANEL} grid gap-4`}>
      <h2 className="text-sm text-[#f0f6fa]">Work details</h2>
      <Choice legend="Do you hold security clearance?" name="clearance" options={CLEARANCE} value={clearance} onChange={setClearance} />
      <Choice legend="IR35 status" name="ir35" options={IR35} value={ir35} onChange={setIr35} />
      <Choice legend="Work pattern" name="pattern" options={PATTERN} value={pattern} onChange={setPattern} />
      <Muted className="text-xs">Your day-rate band is set under Preferences.</Muted>
      <Status error={error} saved={saved} />
      <div>
        <button type="submit" className={BTN_PRIMARY} disabled={save.isPending}>
          Save work details
        </button>
      </div>
    </form>
  );
}

function Forms({ me }: { me: MeDto }) {
  const about = useGetManualProfile();
  const details = useGetProfileDetails();
  const aboutData = about.data?.status === 200 ? about.data.data : null;
  const detailsData = details.data?.status === 200 ? details.data.data : null;
  return (
    <div className="grid max-w-[720px] gap-3">
      <NameForm me={me} />
      {aboutData ? <AboutForm initial={aboutData} /> : <Muted>Loading…</Muted>}
      {detailsData ? <DetailsForm initial={detailsData} /> : <Muted>Loading…</Muted>}
    </div>
  );
}

export function ProfilePage() {
  return (
    <MeGate selected="profile" title="Profile" intro="Keep the details agencies see accurate. Saving here never changes your availability confirmation.">
      {(me) => <Forms me={me} />}
    </MeGate>
  );
}
