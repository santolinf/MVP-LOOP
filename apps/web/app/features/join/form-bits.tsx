import type { ReactNode } from "react";
import { Muted } from "../marketing/primitives";

export const INPUT = "w-full rounded-lg border border-[#465366] bg-transparent p-3 text-fg";
const OPTION =
  "flex cursor-pointer items-center gap-3 rounded-full border border-line bg-panel-2 px-5 py-2.5 has-[:checked]:border-lime has-[:checked]:bg-[#b9fb2310]";

/** Labelled input; `required` adds the same asterisk the reference screens use. */
export function TextField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
  maxLength,
  autoComplete,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  autoComplete?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block font-semibold">
        {label}
        {required ? " *" : ""}
      </span>
      <input
        className={INPUT}
        type={type}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <span className="mt-1 block text-sm text-muted">{hint}</span>}
    </label>
  );
}

/** A group of radio or checkbox options laid out as the reference screens' pill options. */
export function OptionGroup({
  legend,
  help,
  children,
  required,
}: {
  legend: string;
  help?: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 font-semibold">
        {legend}
        {required ? " *" : ""}
      </legend>
      {help && <Muted className="text-sm">{help}</Muted>}
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

export function Radio({ name, label, checked, onChange }: { name: string; label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className={OPTION}>
      <input type="radio" name={name} checked={checked} onChange={onChange} className="accent-lime" />
      {label}
    </label>
  );
}

export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={OPTION}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-lime" />
      {label}
    </label>
  );
}

/** A tick box with a sentence beside it (consents and confirmations). */
export function ConfirmBox({ children, checked, onChange }: { children: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 accent-lime" />
      <span>{children}</span>
    </label>
  );
}

export function Note({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div role="note" aria-label={label} className="rounded-xl border border-[#294357] p-4 text-sm">
      {children}
    </div>
  );
}

export function toggle<T extends string>(list: T[], value: T, on: boolean): T[] {
  return on ? (list.includes(value) ? list : [...list, value]) : list.filter((x) => x !== value);
}
