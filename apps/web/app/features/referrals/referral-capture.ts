// Keeps the ?ref= code between the landing visit and signup. Attribution is sent once a session exists.
// A short-lived cookie backs up localStorage for browsers that block or clear it (private mode, storage partitioning).
// Neither survives a switch of browser or device; the "who introduced you?" step covers that case.
const KEY = "loop.referral.code";
const CODE = /^[A-Za-z0-9]{4,16}$/;
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function readStored(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function readCookie(): string | null {
  if (typeof document === "undefined") return null;
  const hit = document.cookie.split("; ").find((c) => c.startsWith(`${KEY}=`));
  const value = hit ? decodeURIComponent(hit.slice(KEY.length + 1)) : null;
  return value && CODE.test(value) ? value : null;
}

export function captureReferralFromUrl() {
  if (typeof window === "undefined") return;
  const ref = new URLSearchParams(window.location.search).get("ref");
  if (!ref || !CODE.test(ref)) return;
  const code = ref.toUpperCase();
  try {
    localStorage.setItem(KEY, code);
  } catch {
    // storage blocked: the cookie below still carries the code
  }
  document.cookie = `${KEY}=${encodeURIComponent(code)}; Max-Age=${MAX_AGE_SECONDS}; Path=/; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
}

export const readReferralCode = () => (typeof window === "undefined" ? null : (readStored() ?? readCookie()));

export function clearReferralCode() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  document.cookie = `${KEY}=; Max-Age=0; Path=/; SameSite=Lax`;
}
