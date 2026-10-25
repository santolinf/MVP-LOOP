import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { getGetManualProfileQueryKey, getGetReviewQueryKey, useGetManualProfile, useUpdateManualProfile } from "@loop/api-client";
import { BTN_OUTLINE, BTN_SOLID, Card, Muted, PAGE_H1 } from "../marketing/primitives";
import { IntroducerPicker } from "../referrals/introducer-picker";
import { StepBar } from "./step-bar";

const INPUT = "w-full rounded-lg border border-[#465366] bg-transparent p-3 text-fg";

/**
 * Headline and skills the contractor types themselves. Needed when the CV could not be read, and always
 * available to add to what was confirmed from the CV. Saved only when the contractor presses Save.
 */
export function DetailsStep() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const current = useGetManualProfile();
  const save = useUpdateManualProfile();
  const [headline, setHeadline] = useState("");
  const [skills, setSkills] = useState("");
  const [error, setError] = useState<string | null>(null);
  const saved = current.data?.status === 200 ? current.data.data : null;

  // Prefill once from what was saved before; never overwrite anything the contractor has already typed.
  const [prefilled, setPrefilled] = useState(false);
  useEffect(() => {
    if (!saved || prefilled) return;
    setPrefilled(true);
    setHeadline((h) => (h === "" ? (saved.headline ?? "") : h));
    setSkills((s) => (s === "" ? saved.skills.join(", ") : s));
  }, [saved, prefilled]);

  const skillList = skills.split(",").map((s) => s.trim()).filter(Boolean);
  const valid = headline.trim() !== "" || skillList.length > 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || save.isPending) return;
    setError(null);
    try {
      await save.mutateAsync({ data: { headline: headline.trim() || null, skills: skillList } });
      await Promise.all([
        qc.invalidateQueries({ queryKey: getGetManualProfileQueryKey() }),
        qc.invalidateQueries({ queryKey: getGetReviewQueryKey() }),
      ]);
      navigate("/join/availability");
    } catch {
      setError("We couldn't save that. Check the lengths (headline 200, each skill 60, up to 20 skills) and try again.");
    }
  }

  return (
    <main className="mx-auto max-w-[720px] px-5 py-12">
      <StepBar step={4} />
      <Card className="!border-[#294357] !bg-[#0b2237] !bg-none !p-8">
        <IntroducerPicker />
        <h1 className={PAGE_H1}>About you</h1>
        <Muted className="mb-6">
          Tell us your headline and main skills in your own words. If you've already confirmed details from your CV, you can add to them here.
        </Muted>
        <form onSubmit={submit} className="grid gap-4">
          <label>
            <span className="mb-1 block font-semibold">Headline</span>
            <input
              className={INPUT}
              maxLength={200}
              placeholder="For example: Senior platform engineer"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
            />
          </label>
          <label>
            <span className="mb-1 block font-semibold">Skills (separated by commas)</span>
            <input className={INPUT} value={skills} onChange={(e) => setSkills(e.target.value)} />
          </label>
          {error && (
            <p role="alert" className="text-red">
              {error}
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <Link to="/join/availability" className={BTN_OUTLINE}>
              Skip
            </Link>
            <button type="submit" className={BTN_SOLID} disabled={!valid || save.isPending}>
              Save and continue →
            </button>
          </div>
        </form>
      </Card>
    </main>
  );
}
