import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetExtractionReviewQueryKey,
  useConfirmExtractedField,
  useGetExtractionReview,
  type ExtractedFieldDto,
} from "@loop/api-client";
import { Card, Eyebrow, Muted } from "../marketing/primitives";
import { readDraft } from "../join/draft-store";

const POLL_MS = 2000;

const LABELS: Record<string, string> = {
  headline: "Headline",
  currentRole: "Current role",
  skill: "Skill",
  location: "Location",
  yearsExperience: "Years of experience",
  summary: "Summary",
};

const btn =
  "inline-flex items-center gap-2.5 rounded-full bg-lime px-[25px] py-3.5 font-extrabold text-[#0a1114] transition-transform duration-200 hover:-translate-y-0.5 disabled:opacity-40";
const ghost =
  "inline-flex items-center gap-2.5 rounded-full border border-[#465366] px-[25px] py-3.5 font-extrabold text-fg transition-transform duration-200 hover:-translate-y-0.5";

export function ProfileReview() {
  const [params] = useSearchParams();
  const uploadId = params.get("upload") ?? "";
  const token = readDraft()?.draftToken;
  const request = token ? { headers: { "x-draft-token": token } } : undefined;

  const review = useGetExtractionReview(uploadId, {
    query: {
      enabled: uploadId !== "",
      refetchInterval: (q) => (q.state.data?.data.status === "PENDING" ? POLL_MS : false),
    },
    request,
  });
  const body = review.data?.status === 200 ? review.data.data : null;

  return (
    <section className="mx-auto max-w-[720px] px-5 py-12">
      <Eyebrow>Step 2 of 6</Eyebrow>
      <div className="mb-[30px] mt-[25px] flex gap-[7px]" role="img" aria-label="Step 2 of 6">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={`h-[5px] flex-1 rounded-full ${i <= 1 ? "bg-lime" : "bg-[#294356]"}`} />
        ))}
      </div>
      <Card className="!border-[#294357] !bg-[#0b2237] !bg-none !p-8">
        <h1 className="mb-3 text-3xl font-extrabold">Review your profile</h1>
        {!uploadId && <p role="alert" className="text-red">We couldn't find your CV. Please upload it again.</p>}
        {uploadId && review.isError && <p role="alert" className="text-red">We couldn't load your profile. Please refresh.</p>}
        {uploadId && !body && !review.isError && <Muted>Loading…</Muted>}
        {body?.status === "PENDING" && (
          <p role="status" className="text-fg">
            <span aria-hidden="true">⏳ </span>Reading your CV… this usually takes a few seconds.
          </p>
        )}
        {body?.status === "COULD_NOT_READ" && (
          <div role="status">
            <p className="mb-2 text-fg">
              <span aria-hidden="true">ℹ️ </span>We couldn't pull details from your CV automatically.
            </p>
            <Muted className="mb-6 text-sm">You can enter your profile details yourself in the next steps.</Muted>
          </div>
        )}
        {body?.status === "READY" && (
          <>
            <Muted className="mb-6">Check what we found. Nothing is saved to your profile until you confirm it.</Muted>
            {body.fields.length === 0 ? (
              <Muted>We didn't find anything we could confirm from your CV.</Muted>
            ) : (
              <ul className="mb-6 grid gap-4">
                {body.fields.map((f) => (
                  <FieldRow key={f.id} uploadId={uploadId} field={f} request={request} />
                ))}
              </ul>
            )}
          </>
        )}
        <div className="mt-6 flex items-center justify-between gap-3">
          <Link to="/join/cv" className={ghost}>
            ← Back
          </Link>
          {/* TODO(spec): "enter your details yourself" for unreadable CVs has no screen yet; go-live then reports a missing profile field. */}
          <Link to="/join/register" className={btn}>
            Continue →
          </Link>
        </div>
      </Card>
    </section>
  );
}

function FieldRow({
  uploadId,
  field,
  request,
}: {
  uploadId: string;
  field: ExtractedFieldDto;
  request: { headers: Record<string, string> } | undefined;
}) {
  const qc = useQueryClient();
  const confirm = useConfirmExtractedField({
    mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getGetExtractionReviewQueryKey(uploadId) }) },
    request,
  });
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(field.suggestedValue);
  const confirmed = field.confirmedValue !== null;

  const save = (v?: string) => {
    confirm.mutate({ id: uploadId, fieldId: field.id, data: v === undefined ? {} : { value: v } });
    setEditing(false);
  };

  return (
    <li className="rounded-xl border border-[#294357] p-4">
      <div className="mb-1 flex items-center justify-between gap-3">
        <span className="text-sm font-bold uppercase tracking-wide text-lime">{LABELS[field.key] ?? field.key}</span>
        <span className="text-xs text-fg">Confidence {Math.round(field.confidence * 100)}%</span>
      </div>
      {editing ? (
        <input
          aria-label={LABELS[field.key] ?? field.key}
          className="mb-2 w-full rounded-lg border border-[#465366] bg-transparent p-2 text-fg"
          value={value}
          maxLength={2000}
          onChange={(e) => setValue(e.target.value)}
        />
      ) : (
        <p className="mb-2 text-fg">{confirmed ? field.confirmedValue : field.suggestedValue}</p>
      )}
      <Muted className="mb-3 text-xs">From your CV: “{field.sourceExcerpt}”</Muted>
      {confirm.isError && <p role="alert" className="mb-2 text-red">Couldn't save. Please try again.</p>}
      {confirmed && !editing ? (
        <span className="text-lime">
          <span aria-hidden="true">✓ </span>Confirmed
        </span>
      ) : editing ? (
        <div className="flex gap-3">
          <button type="button" className={btn} disabled={confirm.isPending || value.trim() === ""} onClick={() => save(value.trim())}>
            Save
          </button>
          <button type="button" className={ghost} onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex gap-3">
          <button type="button" className={btn} disabled={confirm.isPending} onClick={() => save()}>
            Looks right
          </button>
          <button type="button" className={ghost} onClick={() => setEditing(true)}>
            Edit
          </button>
        </div>
      )}
    </li>
  );
}
