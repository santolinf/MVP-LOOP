// TODO(spec): wizard drafts should persist server-side once the auth/draft API exists (Phase 2 backend).
const KEY = "loop.join.eligibility";

export type Eligibility = { uk: "yes" | "no" | null; rtw: "yes" | "no" | null };

export function readEligibility(): Eligibility {
  if (typeof sessionStorage === "undefined") return { uk: null, rtw: null };
  try {
    return { uk: null, rtw: null, ...JSON.parse(sessionStorage.getItem(KEY) ?? "{}") };
  } catch {
    return { uk: null, rtw: null };
  }
}

export function writeEligibility(value: Eligibility) {
  sessionStorage.setItem(KEY, JSON.stringify(value));
}

export function isEligible(e: Eligibility) {
  return e.uk === "yes" && e.rtw === "yes";
}
