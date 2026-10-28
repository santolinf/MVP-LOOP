// Phase 4 AI extraction evidence rules (A4). Pure: no I/O.

export const EXTRACTION_FIELD_KEYS = ["headline", "currentRole", "skill", "location", "yearsExperience", "summary", "roleDates", "clearance"] as const;
export type ExtractionFieldKey = (typeof EXTRACTION_FIELD_KEYS)[number];

export interface CandidateField {
  key: string;
  value: string;
  sourceExcerpt: string;
  confidence: number;
}

export type DropReason = "UNKNOWN_KEY" | "EMPTY_VALUE" | "NO_EVIDENCE" | "LOW_CONFIDENCE";

export type FieldVerification =
  | { ok: true; field: CandidateField & { key: ExtractionFieldKey } }
  | { ok: false; reason: DropReason };

/** Lower-case, collapse whitespace and unify quote/dash variants so PDF layout noise doesn't hide a real match. */
export function normaliseForMatch(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** True only when the (non-empty) excerpt appears verbatim in the CV text, ignoring case and whitespace. */
export function excerptIsInCv(excerpt: string, cvText: string): boolean {
  const needle = normaliseForMatch(excerpt);
  if (needle.length === 0) return false;
  return normaliseForMatch(cvText).includes(needle);
}

const isKey = (k: string): k is ExtractionFieldKey => (EXTRACTION_FIELD_KEYS as readonly string[]).includes(k);

/** A field survives only with a known key, a value, a confidence at/above the floor, and a verbatim excerpt. */
export function verifyField(field: CandidateField, cvText: string, minConfidence: number): FieldVerification {
  if (!isKey(field.key)) return { ok: false, reason: "UNKNOWN_KEY" };
  if (field.value.trim().length === 0) return { ok: false, reason: "EMPTY_VALUE" };
  if (!excerptIsInCv(field.sourceExcerpt, cvText)) return { ok: false, reason: "NO_EVIDENCE" };
  if (!(field.confidence >= minConfidence)) return { ok: false, reason: "LOW_CONFIDENCE" };
  return { ok: true, field: { ...field, key: field.key, value: field.value.trim() } };
}

export interface VerifiedExtraction {
  fields: Array<CandidateField & { key: ExtractionFieldKey }>;
  dropped: number;
}

/** Drops unevidenced fields and duplicate (key, value) pairs; never invents or repairs data. */
export function verifyExtraction(candidates: CandidateField[], cvText: string, minConfidence: number): VerifiedExtraction {
  const seen = new Set<string>();
  const fields: VerifiedExtraction["fields"] = [];
  let dropped = 0;
  for (const c of candidates) {
    const r = verifyField(c, cvText, minConfidence);
    if (!r.ok) {
      dropped++;
      continue;
    }
    const id = `${r.field.key}:${normaliseForMatch(r.field.value)}`;
    if (seen.has(id)) {
      dropped++;
      continue;
    }
    seen.add(id);
    fields.push(r.field);
  }
  return { fields, dropped };
}

/** Too little readable text (scanned image, garbled export) means we show the "couldn't read this" fallback. */
export function isReadableCvText(text: string, minChars: number): boolean {
  const letters = text.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
  return letters >= minChars;
}
