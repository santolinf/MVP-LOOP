import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Card, Eyebrow, Muted } from "../marketing/primitives";
import { isEligible, readEligibility } from "./eligibility-store";

const MAX_BYTES = 10 * 1024 * 1024;

export function validateCv(file: { name: string; size: number }): string | null {
  const ok = /\.(pdf|doc|docx)$/i.test(file.name) && file.size > 0 && file.size <= MAX_BYTES;
  return ok ? null : "Please choose a non-empty PDF, DOC or DOCX file under 10 MB.";
}

export function CvStep() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Direct visits skip the gate: send them back to answer the eligibility questions.
  useEffect(() => {
    if (!isEligible(readEligibility())) navigate("/join", { replace: true });
  }, [navigate]);

  function choose(f: File | undefined) {
    if (!f) return;
    const problem = validateCv(f);
    setError(problem);
    setFile(problem ? null : f);
  }

  return (
    <section className="mx-auto w-[min(40rem,calc(100%-30px))] py-16">
      <Eyebrow>Step 1 of 6</Eyebrow>
      <Card>
        <h1 className="mb-3 text-3xl font-bold">Start with your CV</h1>
        <Muted className="mb-6">Upload a PDF or Word CV. You’ll review and correct the details before creating an account.</Muted>
        <label className="mb-3 flex cursor-pointer flex-col items-center gap-1 rounded-card border-2 border-dashed border-line p-8 text-center hover:border-lime">
          <span aria-hidden="true" className="text-2xl text-lime">⇧</span>
          <strong>Choose your CV or drop it here</strong>
          <span className="text-sm text-muted">PDF, DOC or DOCX · up to 10 MB</span>
          <input
            type="file"
            className="sr-only"
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => choose(e.target.files?.[0])}
          />
        </label>
        {file && <p className="mb-2 text-lime">Selected: {file.name}</p>}
        {error && (
          <p role="alert" className="mb-2 text-red">
            {error}
          </p>
        )}
        {/* TODO(spec): upload, malware scan and AI extraction need the CV/extraction API; the file is not sent anywhere yet. */}
        <Muted className="mb-6 text-sm">Your CV is not uploaded or processed yet; this step is a preview of the journey.</Muted>
        <div className="flex items-center justify-between gap-3">
          <Link to="/join" className="rounded-full border border-line px-5 py-2 hover:text-lime">
            ← Back
          </Link>
          {/* TODO(spec): Continue goes to /join/profile once the profile review step exists. */}
          <button type="button" disabled className="rounded-full bg-lime px-6 py-2 font-semibold text-bg disabled:opacity-40">
            Continue →
          </button>
        </div>
      </Card>
    </section>
  );
}
