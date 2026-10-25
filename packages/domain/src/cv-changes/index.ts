// Phase 7 CV version comparison (A5). Pure: no I/O.
import { normaliseForMatch } from "../extraction/index.js";

/** Keys whose change needs explicit contractor review: roles, dates, skills, clearance. */
export const MATERIAL_CV_KEYS = ["currentRole", "roleDates", "skill", "clearance"] as const;

export const isMaterialCvKey = (key: string): boolean => (MATERIAL_CV_KEYS as readonly string[]).includes(key);

/** Keys that hold many values; the rest hold one. */
const MULTI_VALUED = new Set(["skill"]);

export interface FieldValue {
  id: string;
  key: string;
  value: string;
}

export type CvChangeKind = "ADDED" | "REMOVED" | "CHANGED";

export interface CvChangeProposal {
  key: string;
  kind: CvChangeKind;
  material: boolean;
  previous: FieldValue | null;
  proposed: FieldValue | null;
}

const same = (a: string, b: string): boolean => normaliseForMatch(a) === normaliseForMatch(b);

/**
 * Compares what the new CV says with what the contractor has confirmed. Every difference is a proposal;
 * none is ever applied here. A key the new CV does not mention is left alone for single-valued keys (a CV
 * that omits a location has not withdrawn it) but a skill missing from the new CV is proposed as REMOVED.
 */
export function diffCvExtraction(confirmed: readonly FieldValue[], proposed: readonly FieldValue[]): CvChangeProposal[] {
  const out: CvChangeProposal[] = [];
  const keys = [...new Set([...confirmed, ...proposed].map((f) => f.key))];
  for (const key of keys) {
    const before = confirmed.filter((f) => f.key === key);
    const after = proposed.filter((f) => f.key === key);
    const material = isMaterialCvKey(key);
    if (MULTI_VALUED.has(key)) {
      for (const a of after) {
        if (!before.some((b) => same(a.value, b.value))) out.push({ key, kind: "ADDED", material, previous: null, proposed: a });
      }
      if (after.length > 0) {
        for (const b of before) {
          if (!after.some((a) => same(a.value, b.value))) out.push({ key, kind: "REMOVED", material, previous: b, proposed: null });
        }
      }
      continue;
    }
    const a = after[0];
    const b = before[0];
    if (!a) continue;
    if (!b) out.push({ key, kind: "ADDED", material, previous: null, proposed: a });
    else if (!same(a.value, b.value)) out.push({ key, kind: "CHANGED", material, previous: b, proposed: a });
  }
  return out;
}
