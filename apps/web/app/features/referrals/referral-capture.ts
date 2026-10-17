// Keeps the ?ref= code between the landing visit and signup. Attribution is sent once a session exists.
const KEY = "loop.referral.code";
const CODE = /^[A-Za-z0-9]{4,16}$/;

export function captureReferralFromUrl() {
  if (typeof window === "undefined") return;
  const ref = new URLSearchParams(window.location.search).get("ref");
  if (ref && CODE.test(ref)) localStorage.setItem(KEY, ref.toUpperCase());
}

export const readReferralCode = () => (typeof localStorage === "undefined" ? null : localStorage.getItem(KEY));
export const clearReferralCode = () => localStorage.removeItem(KEY);
