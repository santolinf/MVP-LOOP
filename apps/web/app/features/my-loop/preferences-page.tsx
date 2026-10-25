import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetPreferencesQueryKey, getGetReviewQueryKey, useGetPreferences, useUpdatePreferences, type PreferencesDto } from "@loop/api-client";
import { Muted } from "../marketing/primitives";
import { BTN_PRIMARY, MeGate, PANEL, Status } from "./frame";

type Opt = readonly (readonly [string, string])[];

const WORK_TYPES: Opt = [["CONTRACT_INSIDE_IR35", "Contract, inside IR35"], ["CONTRACT_OUTSIDE_IR35", "Contract, outside IR35"], ["FIXED_TERM", "Fixed term"], ["PERMANENT", "Permanent"]];
const RATES: Opt = [["UNDER_300", "Under £300"], ["R300_400", "£300–400"], ["R400_500", "£400–500"], ["R500_600", "£500–600"], ["R600_750", "£600–750"], ["OVER_750", "Over £750"]];
const REMOTE: Opt = [["ONSITE", "On site"], ["HYBRID", "Hybrid"], ["REMOTE", "Remote"]];
const REGIONS: Opt = [
  ["LONDON", "London"], ["SOUTH_EAST", "South East"], ["SOUTH_WEST", "South West"], ["EAST_OF_ENGLAND", "East of England"],
  ["WEST_MIDLANDS", "West Midlands"], ["EAST_MIDLANDS", "East Midlands"], ["NORTH_WEST", "North West"], ["NORTH_EAST", "North East"],
  ["YORKSHIRE", "Yorkshire"], ["WALES", "Wales"], ["SCOTLAND", "Scotland"], ["NORTHERN_IRELAND", "Northern Ireland"],
];
const SECTORS: Opt = [
  ["FINANCIAL_SERVICES", "Financial services"], ["PUBLIC_SECTOR", "Public sector"], ["HEALTHCARE", "Healthcare"], ["RETAIL", "Retail"],
  ["ENERGY_UTILITIES", "Energy and utilities"], ["TELECOMS", "Telecoms"], ["MEDIA", "Media"], ["MANUFACTURING", "Manufacturing"],
  ["TRANSPORT", "Transport"], ["CONSULTING", "Consulting"], ["OTHER", "Other"],
];
const NOTICE: Opt = [["IMMEDIATE", "Immediate"], ["ONE_WEEK", "1 week"], ["TWO_WEEKS", "2 weeks"], ["FOUR_WEEKS", "4 weeks"], ["EIGHT_WEEKS", "8 weeks"], ["TWELVE_WEEKS", "12 weeks"]];

const chip = "flex cursor-pointer items-center gap-2 rounded-full border border-line px-3 py-1.5 text-xs has-[:checked]:border-lime";

function Many({ legend, options, value, onChange }: { legend: string; options: Opt; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset>
      <legend className="mb-1 text-xs font-semibold text-[#c5d4dc]">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map(([v, label]) => (
          <label key={v} className={chip}>
            <input
              type="checkbox"
              checked={value.includes(v)}
              onChange={(e) => onChange(e.target.checked ? [...value, v] : value.filter((x) => x !== v))}
              className="accent-lime"
            />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function One({ legend, name, options, value, onChange }: { legend: string; name: string; options: Opt; value: string | null; onChange: (v: string | null) => void }) {
  return (
    <fieldset>
      <legend className="mb-1 text-xs font-semibold text-[#c5d4dc]">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map(([v, label]) => (
          <label key={v} className={chip}>
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

function PreferencesForm({ initial }: { initial: PreferencesDto }) {
  const qc = useQueryClient();
  const save = useUpdatePreferences();
  const [p, setP] = useState<{ workTypes: string[]; rateBand: string | null; remote: string | null; regions: string[]; sectors: string[]; noticePeriod: string | null }>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    try {
      await save.mutateAsync({ data: p as PreferencesDto });
      await Promise.all([qc.invalidateQueries({ queryKey: getGetPreferencesQueryKey() }), qc.invalidateQueries({ queryKey: getGetReviewQueryKey() })]);
      setSaved(true);
    } catch {
      setError("We couldn’t save your preferences. Please try again.");
    }
  }

  return (
    <form onSubmit={submit} className={`${PANEL} grid max-w-[820px] gap-5`}>
      <Many legend="Work types" options={WORK_TYPES} value={p.workTypes} onChange={(workTypes) => setP({ ...p, workTypes })} />
      <One legend="Day rate" name="rate" options={RATES} value={p.rateBand} onChange={(rateBand) => setP({ ...p, rateBand })} />
      <One legend="Where you want to work" name="remote" options={REMOTE} value={p.remote} onChange={(remote) => setP({ ...p, remote })} />
      <Many legend="Regions" options={REGIONS} value={p.regions} onChange={(regions) => setP({ ...p, regions })} />
      <Many legend="Sectors" options={SECTORS} value={p.sectors} onChange={(sectors) => setP({ ...p, sectors })} />
      <One legend="Notice period" name="notice" options={NOTICE} value={p.noticePeriod} onChange={(noticePeriod) => setP({ ...p, noticePeriod })} />
      <Status error={error} saved={saved} />
      <div>
        <button type="submit" className={BTN_PRIMARY} disabled={save.isPending}>
          Save preferences
        </button>
      </div>
    </form>
  );
}

function Loader() {
  const q = useGetPreferences();
  const data = q.data?.status === 200 ? q.data.data : null;
  if (!data) return <Muted>{q.isError ? "We couldn’t load your preferences." : "Loading…"}</Muted>;
  return <PreferencesForm initial={data} />;
}

export function PreferencesPage() {
  return (
    <MeGate selected="preferences" title="Preferences" intro="What you are looking for. Saving preferences does not confirm your availability.">
      {() => <Loader />}
    </MeGate>
  );
}
