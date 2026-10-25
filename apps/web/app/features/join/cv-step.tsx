import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { completeCvUpload, createCvDraft, presignCvUpload, recordEligibility } from "@loop/api-client";
import { Card, Eyebrow, Muted } from "../marketing/primitives";
import { isEligible, readEligibility } from "./eligibility-store";
import { readDraft, writeDraft } from "./draft-store";

const MAX_BYTES = 10 * 1024 * 1024;

export function validateCv(file: { name: string; size: number }): string | null {
  const ok = /\.(pdf|doc|docx)$/i.test(file.name) && file.size > 0 && file.size <= MAX_BYTES;
  return ok ? null : "Please choose a non-empty PDF, DOC or DOCX file under 10 MB.";
}

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const UPLOAD_FAILED = "We couldn't upload your CV. Please try again.";

export function CvStep() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  async function upload() {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      let draft = readDraft();
      if (!draft) {
        const created = await createCvDraft();
        if (created.status !== 200) throw new Error("draft failed");
        const fresh = created.data;
        // The gate's answers are only stored in the browser; record them server-side so the account can adopt them.
        // Stored only once recorded, so a failure here retries with a new draft. "v1" matches ELIGIBILITY_WORDING_VERSION.
        const recorded = await recordEligibility(
          { ukBased: true, rightToWork: true, wordingVersion: "v1" },
          { headers: { "x-draft-token": fresh.draftToken } },
        );
        if (recorded.status !== 200) throw new Error("eligibility failed");
        draft = fresh;
        writeDraft(draft);
      }
      const options = { headers: { "x-draft-token": draft.draftToken } };
      const mimeType = MIME_BY_EXT[file.name.split(".").pop()?.toLowerCase() ?? ""];
      if (!mimeType) throw new Error("unsupported");
      const presigned = await presignCvUpload({ mimeType, sizeBytes: file.size }, options);
      if (presigned.status !== 200) throw new Error("presign failed");
      const signed = presigned.data;
      const put = await fetch(signed.uploadUrl, { method: signed.method, headers: signed.headers, body: file });
      if (!put.ok) throw new Error("put failed");
      const completed = await completeCvUpload(signed.uploadId, options);
      if (completed.status !== 200) throw new Error("complete failed");
      const done = completed.data;
      if (done.status === "REJECTED") {
        setError(done.message ?? "We couldn't accept that file. Please choose another CV.");
        return;
      }
      navigate(`/join/profile?upload=${encodeURIComponent(signed.uploadId)}`);
    } catch {
      setError(UPLOAD_FAILED);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-3xl px-[26px] py-[70px] md:py-[90px]">
      <Eyebrow>Step 1 of 6</Eyebrow>
      <div className="mb-[30px] mt-[25px] flex gap-[7px]" role="img" aria-label="Step 1 of 6">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={`h-[5px] flex-1 rounded-full ${i === 0 ? "bg-lime" : "bg-[#294356]"}`} />
        ))}
      </div>
      <Card className="!border-[#294357] !bg-[#0b2237] !bg-none !p-8">
        <h1 className="mb-4 text-[clamp(30px,4vw,43px)] font-black leading-[1.12] tracking-[-0.04em] text-fg">Start with your CV</h1>
        <Muted className="mb-6">Upload a PDF or Word CV. You’ll review and correct the details before creating an account.</Muted>
        <label className="mb-3 flex min-h-[172px] cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-[#658299] bg-[#092337] p-8 text-center hover:border-lime">
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
        {busy && (
          <p role="status" className="mb-2 text-fg">
            Uploading your CV…
          </p>
        )}
        <div className="flex items-center justify-between gap-3">
          <Link to="/join" className="inline-flex items-center gap-2.5 rounded-full border border-[#465366] px-[25px] py-3.5 font-extrabold text-fg transition-transform duration-200 hover:-translate-y-0.5">
            ← Back
          </Link>
          <button type="button" disabled={!file || busy} onClick={upload} className="inline-flex items-center gap-2.5 rounded-full bg-lime px-[25px] py-3.5 font-extrabold text-[#0a1114] transition-transform duration-200 hover:-translate-y-0.5 disabled:opacity-40">
            Continue →
          </button>
        </div>
      </Card>
    </section>
  );
}
