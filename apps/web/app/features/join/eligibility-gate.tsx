import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { COPY } from "../../lib/copy";
import { Card, Eyebrow, Muted } from "../marketing/primitives";
import { writeEligibility } from "./eligibility-store";

type Answer = "yes" | "no";

function YesNo({ legend, name, value, onChange }: { legend: string; name: string; value: Answer | null; onChange: (v: Answer) => void }) {
  return (
    <fieldset className="mb-5">
      <legend className="mb-2 font-semibold">{legend}</legend>
      <div className="flex gap-3">
        {(["yes", "no"] as const).map((v) => (
          <label key={v} className="flex cursor-pointer items-center gap-2 rounded-full border border-line bg-panel-2 px-5 py-2 has-[:checked]:border-lime has-[:checked]:bg-[rgba(185,255,60,0.08)]">
            <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} className="accent-lime" />
            {v === "yes" ? "Yes" : "No"}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function EligibilityGate() {
  const navigate = useNavigate();
  const [uk, setUk] = useState<Answer | null>(null);
  const [rtw, setRtw] = useState<Answer | null>(null);
  const rejected = uk === "no" ? "uk" : uk === "yes" && rtw === "no" ? "rtw" : null;
  const canContinue = uk === "yes" && rtw === "yes";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canContinue) return;
    writeEligibility({ uk, rtw });
    navigate("/join/cv");
  }

  return (
    <section className="mx-auto max-w-3xl px-[26px] py-[70px] md:py-[90px]">
      <Eyebrow>Join LOOP · First check</Eyebrow>
      <Card>
        <h1 className="mb-4 mt-3 text-[clamp(35px,4vw,55px)] font-black leading-[1.12] tracking-[-0.04em] text-fg">Before we get started</h1>
        <Muted className="mb-6">
          LOOP is currently for UK-based IT contractors with the right to work in the UK. These two quick questions come before CV upload.
        </Muted>
        <form onSubmit={submit}>
          <YesNo
            legend="1. Are you UK based?"
            name="uk"
            value={uk}
            onChange={(v) => {
              setUk(v);
              if (v === "no") setRtw(null);
            }}
          />
          {uk === "yes" && <YesNo legend="2. Do you have the right to work in the UK?" name="rtw" value={rtw} onChange={setRtw} />}
          {rejected && (
            <div role="status" className="mb-5 rounded-card border border-orange p-4">
              <h2 className="mb-1 font-semibold">Thanks for your interest in LOOP</h2>
              <p className="text-muted">{rejected === "uk" ? COPY.notUkMessage : COPY.noRtwMessage}</p>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <Link to="/" className="inline-flex items-center gap-2.5 rounded-full border border-[#465366] px-[25px] py-3.5 font-extrabold text-fg transition-transform duration-200 hover:-translate-y-0.5">
              ← Back to homepage
            </Link>
            <button type="submit" disabled={!canContinue} className="inline-flex items-center gap-2.5 rounded-full bg-lime px-[25px] py-3.5 font-extrabold text-[#0a1114] transition-transform duration-200 hover:-translate-y-0.5 disabled:opacity-40">
              Continue →
            </button>
          </div>
        </form>
        <Muted className="mt-5 text-sm">
          Answers are self-declared. Formal right-to-work checks remain the responsibility of the appropriate organisation.
        </Muted>
      </Card>
    </section>
  );
}
