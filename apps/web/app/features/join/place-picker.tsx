import { useId, useState } from "react";
import { searchPlaces } from "./uk-places";
import { INPUT } from "./form-bits";

/**
 * Searchable multi-select for additional towns and cities. Each choice is kept as a separate value and can be removed.
 * A place that is not in the list can still be added by typing it and pressing Enter, so nothing a contractor already
 * saved is lost.
 */
export function PlacePicker({ label, value, onChange, max = 20 }: { label: string; value: string[]; onChange: (v: string[]) => void; max?: number }) {
  const id = useId();
  const [q, setQ] = useState("");
  const options = searchPlaces(q, value);
  const add = (p: string) => {
    const name = p.trim();
    if (!name || value.length >= max || value.some((v) => v.toLowerCase() === name.toLowerCase())) return;
    onChange([...value, name]);
    setQ("");
  };
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      <ul aria-label="Selected towns and cities" className="flex flex-wrap gap-2">
        {value.map((p) => (
          <li key={p} className="flex items-center gap-1 rounded-full border border-[#465366] px-3 py-1 text-sm">
            {p}
            <button type="button" aria-label={`Remove ${p}`} className="text-muted hover:text-fg" onClick={() => onChange(value.filter((v) => v !== p))}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <input
        id={id}
        className={INPUT}
        type="search"
        value={q}
        placeholder="Search for a town or city, e.g. Edinburgh"
        autoComplete="off"
        maxLength={60}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          add(options[0] ?? q);
        }}
      />
      {options.length > 0 && (
        <ul role="listbox" aria-label="Matching towns and cities" className="grid gap-1 rounded-xl border border-[#294357] p-1">
          {options.map((o) => (
            <li key={o} role="option" aria-selected={false}>
              <button type="button" className="w-full rounded-lg px-3 py-1.5 text-left hover:bg-[#12304a]" onClick={() => add(o)}>
                {o}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
