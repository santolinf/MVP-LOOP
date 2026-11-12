import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  completeCvUpload,
  getListCvChangesQueryKey,
  getListCvVersionsQueryKey,
  presignCvUpload,
  useDeleteMyCv,
  useListCvChanges,
  useListCvVersions,
  useResolveCvChange,
  type CvChangeListDtoItemsItem,
} from "@loop/api-client";
import { validateCv } from "../join/cv-step";
import { Muted } from "../marketing/primitives";
import { BTN_DANGER, BTN_PRIMARY, BTN_SMALL, MeGate, PANEL, Status } from "./frame";

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const KEY_LABELS: Record<string, string> = {
  headline: "Headline",
  currentRole: "Current role",
  skill: "Skill",
  location: "Location",
  yearsExperience: "Years of experience",
  summary: "Summary",
  roleDates: "Role dates",
  clearance: "Security clearance",
};

export function Upload({ onUploaded }: { onUploaded: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      const mimeType = MIME_BY_EXT[file.name.split(".").pop()?.toLowerCase() ?? ""];
      if (!mimeType) throw new Error("unsupported");
      const presigned = await presignCvUpload({ mimeType, sizeBytes: file.size });
      if (presigned.status !== 200) throw new Error("presign failed");
      const signed = presigned.data;
      const put = await fetch(signed.uploadUrl, { method: signed.method, headers: signed.headers, body: file });
      if (!put.ok) throw new Error("put failed");
      const done = await completeCvUpload(signed.uploadId);
      if (done.status !== 200) throw new Error("complete failed");
      if (done.data.status === "REJECTED") {
        setError(done.data.message ?? "We couldn’t accept that file. Please choose another CV.");
        return;
      }
      setFile(null);
      onUploaded();
    } catch {
      setError("We couldn’t upload your CV. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`${PANEL} grid gap-3`}>
      <h2 className="text-sm text-[#f0f6fa]">Replace your CV</h2>
      <Muted className="text-xs">
        Uploading a new CV never changes your profile by itself. We compare it with what you have confirmed and ask you to review any differences.
      </Muted>
      {/* The native control is visually hidden; the label is the visible button, so it looks like the other buttons and shows what was chosen. */}
      <div className="flex flex-wrap items-center gap-2.5">
        <label className={`${BTN_SMALL} cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-lime`}>
          {file ? "Choose a different file" : "Choose a file"}
          <input
            type="file"
            aria-label="Choose a CV"
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => {
              choose(e.target.files?.[0]);
              // Lets the same file be chosen again after an error or a completed upload.
              e.target.value = "";
            }}
            className="sr-only"
          />
        </label>
        <span data-testid="cv-chosen" className="text-xs text-[#d5e5ec]">
          {file ? file.name : "No file chosen"}
        </span>
      </div>
      <Muted className="text-xs">{file ? "Ready to upload." : "Choose a PDF, DOC or DOCX file (up to 10 MB). Upload CV is enabled once you have chosen one."}</Muted>
      <Status error={error} saved={false} />
      {busy && (
        <p role="status" className="text-xs">
          Uploading your CV…
        </p>
      )}
      <div>
        <button type="button" className={BTN_PRIMARY} disabled={!file || busy} onClick={upload}>
          Upload CV
        </button>
      </div>
    </section>
  );
}

function ChangeRow({ c }: { c: CvChangeListDtoItemsItem }) {
  const qc = useQueryClient();
  const resolve = useResolveCvChange();
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "ACCEPT" | "REJECT") {
    setError(null);
    try {
      await resolve.mutateAsync({ changeId: c.id, data: { decision } });
      await Promise.all([qc.invalidateQueries({ queryKey: getListCvChangesQueryKey() }), qc.invalidateQueries({ queryKey: getListCvVersionsQueryKey() })]);
    } catch {
      setError("We couldn’t record that. Please refresh and try again.");
    }
  }

  const label = KEY_LABELS[c.key] ?? c.key;
  return (
    <li className={`${PANEL} grid gap-2 text-xs`}>
      <p className="flex items-center gap-2 text-sm font-bold text-[#f0f6fa]">
        {label}
        <span className="rounded-full bg-[#244425] px-2 py-0.5 text-[10px] text-[#c2f350]">
          {c.kind === "ADDED" ? "New" : c.kind === "REMOVED" ? "Not on new CV" : "Changed"}
        </span>
        {c.material && <span className="rounded-full bg-[#4a3410] px-2 py-0.5 text-[10px] text-orange">Needs your review</span>}
      </p>
      {c.previousValue !== null && (
        <p>
          <span className="text-[#a0b8c6]">Your confirmed profile: </span>
          {c.previousValue}
        </p>
      )}
      {c.proposedValue !== null && (
        <p>
          <span className="text-[#a0b8c6]">Your new CV: </span>
          {c.proposedValue}
        </p>
      )}
      {c.proposedExcerpt && <p className="text-[#89a4b5]">From your CV: “{c.proposedExcerpt}”</p>}
      <Status error={error} saved={false} />
      <div className="flex gap-2">
        <button type="button" className={BTN_PRIMARY} disabled={resolve.isPending} onClick={() => decide("ACCEPT")}>
          {c.kind === "REMOVED" ? "Remove from my profile" : "Use the new CV’s value"}
        </button>
        <button type="button" className={BTN_SMALL} disabled={resolve.isPending} onClick={() => decide("REJECT")}>
          Keep what I have
        </button>
      </div>
    </li>
  );
}

function Body() {
  const qc = useQueryClient();
  // Extraction runs in the background, so poll briefly after an upload.
  const [watching, setWatching] = useState(false);
  const versions = useListCvVersions();
  const changes = useListCvChanges({ query: { refetchInterval: watching ? 4000 : false } });
  const del = useDeleteMyCv();
  const [error, setError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);
  const versionItems = versions.data?.status === 200 ? versions.data.data.items : [];
  const changeItems = changes.data?.status === 200 ? changes.data.data.items : [];

  async function uploaded() {
    setDeleted(false);
    setWatching(true);
    await Promise.all([qc.invalidateQueries({ queryKey: getListCvVersionsQueryKey() }), qc.invalidateQueries({ queryKey: getListCvChangesQueryKey() })]);
    setTimeout(() => setWatching(false), 60_000);
  }

  async function removeAll() {
    if (!window.confirm("Delete your CV files, all earlier versions and anything we suggested from them? Details you have confirmed stay on your profile.")) return;
    setError(null);
    try {
      await del.mutateAsync();
      setDeleted(true);
      await Promise.all([qc.invalidateQueries({ queryKey: getListCvVersionsQueryKey() }), qc.invalidateQueries({ queryKey: getListCvChangesQueryKey() })]);
    } catch {
      setError("We couldn’t delete your CV. Please try again.");
    }
  }

  return (
    <div className="grid max-w-[820px] gap-3">
      <Upload onUploaded={uploaded} />

      <section aria-labelledby="changes-h" className="grid gap-2.5">
        <h2 id="changes-h" className="text-sm text-[#f0f6fa]">
          Changes to review
        </h2>
        {watching && changeItems.length === 0 && (
          <p role="status" className="text-xs text-[#a0b8c6]">
            Reading your new CV. Differences will appear here.
          </p>
        )}
        {changeItems.length === 0 && !watching && <Muted className="text-xs">Nothing to review.</Muted>}
        <ul className="grid gap-2.5">
          {changeItems.map((c) => (
            <ChangeRow key={c.id} c={c} />
          ))}
        </ul>
      </section>

      <section className={PANEL}>
        <h2 className="mb-2 text-sm text-[#f0f6fa]">CV versions</h2>
        {versionItems.length === 0 ? (
          <Muted className="text-xs">{deleted ? "Your CV has been deleted." : "No CV on file."}</Muted>
        ) : (
          <ul className="mb-3 grid gap-1 text-xs">
            {versionItems.map((v) => (
              <li key={v.id} className="flex justify-between border-b border-[#1a4153] py-1.5 last:border-0">
                <span>
                  Version {v.versionNumber} · {new Date(v.createdAt).toLocaleDateString("en-GB")}
                </span>
                {v.pendingChanges > 0 && <span className="text-orange">{v.pendingChanges} to review</span>}
              </li>
            ))}
          </ul>
        )}
        <Status error={error} saved={false} />
        {versionItems.length > 0 && (
          <button type="button" className={BTN_DANGER} disabled={del.isPending} onClick={removeAll}>
            Delete my CV
          </button>
        )}
      </section>
    </div>
  );
}

export function CvPage() {
  return (
    <MeGate selected="cv" title="CV & documents" intro="Replace your CV, review what changed, or delete it.">
      {() => <Body />}
    </MeGate>
  );
}
