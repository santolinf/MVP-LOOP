import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey, useRequestOtp, useVerifyOtp } from "@loop/api-client";
import { COPY } from "../../lib/copy";
import { BTN_OUTLINE, BTN_SOLID, Card, Muted, PAGE_H1 } from "../marketing/primitives";
import { readReferralCode } from "../referrals/referral-capture";
import { clearDraft, readDraft } from "./draft-store";
import { StepBar } from "./step-bar";

/** Mirrors the server's normaliseUkMobile so a bad number is caught before a code is sent. The server decides. */
function isUkMobile(input: string): boolean {
  let n = input.replace(/[\s\-().]/g, "");
  if (n.startsWith("00")) n = `+${n.slice(2)}`;
  if (n.startsWith("07")) n = `+44${n.slice(1)}`;
  if (n.startsWith("+440")) n = `+44${n.slice(4)}`;
  return /^\+447[1-57-9]\d{8}$/.test(n);
}

const INPUT = "w-full rounded-lg border border-[#465366] bg-transparent p-3 text-fg";

/** Phase 6: registration shows the AI disclosure; consents are taken later, on the review step. */
export function RegisterStep() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", mobile: "" });
  const [terms, setTerms] = useState(false);
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestOtp = useRequestOtp();
  const verifyOtp = useVerifyOtp();
  const busy = requestOtp.isPending || verifyOtp.isPending;
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  const mobileOk = isUkMobile(form.mobile);
  const detailsOk = Object.values(form).every((v) => v.trim() !== "") && terms && mobileOk;
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    if (!detailsOk || busy) return;
    setError(null);
    // Coming back via "Change details" with the same email: the code already sent is still valid, so don't resend.
    if (sentTo === form.email.trim().toLowerCase()) {
      setSent(true);
      return;
    }
    try {
      await requestOtp.mutateAsync({ data: { email: form.email.trim(), purpose: "REGISTER", clientType: "WEB" } });
      setSentTo(form.email.trim().toLowerCase());
      setSent(true);
    } catch (e) {
      const status = typeof e === "object" && e !== null ? (e as { status?: number }).status : undefined;
      setError(
        status === 429
          ? "A code was sent recently. Please wait a minute before asking for another, or use the one we emailed you."
          : "We couldn't send your code. Please check your email address and try again.",
      );
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!/^\d{4,10}$/.test(code) || busy) return;
    setError(null);
    try {
      await verifyOtp.mutateAsync({
        data: {
          email: form.email.trim(),
          code,
          clientType: "WEB",
          purpose: "REGISTER",
          registration: {
            firstName: form.firstName.trim(),
            lastName: form.lastName.trim(),
            mobile: form.mobile.trim(),
            termsAccepted: true,
          },
          draftToken: readDraft()?.draftToken,
          referralCode: readReferralCode() ?? undefined,
        },
      });
      clearDraft();
      await qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
      navigate("/join/details");
    } catch (e) {
      const status = typeof e === "object" && e !== null ? (e as { status?: number }).status : undefined;
      if (status === 409) {
        setError("We couldn't create an account with those details. They may already be registered, so try signing in instead.");
      } else if (status === 400) {
        setError("Please check your details, especially that your mobile is a valid UK number, then try again.");
      } else if (status === 429) {
        setError("Too many attempts. Please wait a few minutes and try again.");
      } else {
        setError("That code didn't work. Check it and try again, or request a new one.");
      }
    }
  }

  return (
    <section className="mx-auto max-w-[720px] px-5 py-12">
      <StepBar step={3} />
      <Card className="!border-[#294357] !bg-[#0b2237] !bg-none !p-8">
        <h1 className={PAGE_H1}>Create your account</h1>
        <div role="note" aria-label="How AI is used" className="mb-6 rounded-xl border border-[#294357] p-4">
          <p className="mb-1 text-sm font-bold uppercase tracking-wide text-lime">How we use AI</p>
          <p className="text-fg">{COPY.aiDisclosure}</p>
        </div>
        {!sent ? (
          <form onSubmit={sendCode} className="grid gap-4">
            <label>
              <span className="mb-1 block font-semibold">First name</span>
              <input className={INPUT} autoComplete="given-name" maxLength={80} value={form.firstName} onChange={set("firstName")} />
            </label>
            <label>
              <span className="mb-1 block font-semibold">Last name</span>
              <input className={INPUT} autoComplete="family-name" maxLength={80} value={form.lastName} onChange={set("lastName")} />
            </label>
            <label>
              <span className="mb-1 block font-semibold">Email</span>
              <input className={INPUT} type="email" autoComplete="email" maxLength={254} value={form.email} onChange={set("email")} />
            </label>
            <label>
              <span className="mb-1 block font-semibold">UK mobile number</span>
              <input className={INPUT} type="tel" autoComplete="tel" maxLength={20} value={form.mobile} onChange={set("mobile")} />
            </label>
            {/* TODO(spec): link to the terms page once Legal provides it. Not pre-ticked. */}
            <label className="flex items-start gap-3">
              <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-1 accent-lime" />
              <span>I accept the LOOP terms of use and have read the privacy notice.</span>
            </label>
            {form.mobile.trim() !== "" && !mobileOk && (
              <p role="alert" className="text-sm text-red">
                Enter a UK mobile number, for example 07700 900123.
              </p>
            )}
            <Muted className="text-sm">We'll email you a one-time code to confirm it's you. There is no password.</Muted>
            <Muted className="text-sm">
              Already a member?{" "}
              <Link to="/sign-in" className="font-semibold text-lime">
                Sign in
              </Link>
            </Muted>
            {error && (
              <p role="alert" className="text-red">
                {error}
              </p>
            )}
            <div className="flex items-center justify-between gap-3">
              <Link to="/join/profile" className={BTN_OUTLINE}>
                ← Back
              </Link>
              <button type="submit" className={BTN_SOLID} disabled={!detailsOk || busy}>
                Email me a code
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={verify} className="grid gap-4">
            <p role="status" className="text-fg">
              We've emailed a code to {form.email.trim()}.
            </p>
            <label>
              <span className="mb-1 block font-semibold">Your code</span>
              <input
                className={INPUT}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={10}
                value={code}
                onChange={(e) => setCode(e.target.value.trim())}
              />
            </label>
            {error && (
              <p role="alert" className="text-red">
                {error}
              </p>
            )}
            <div className="flex items-center justify-between gap-3">
              <button type="button" className={BTN_OUTLINE} onClick={() => setSent(false)}>
                ← Change details
              </button>
              <button type="submit" className={BTN_SOLID} disabled={!/^\d{4,10}$/.test(code) || busy}>
                Create account
              </button>
            </div>
          </form>
        )}
      </Card>
    </section>
  );
}
