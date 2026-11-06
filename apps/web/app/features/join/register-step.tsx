import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetMeQueryKey,
  lookupIntroducer,
  setIntroducer,
  updateConsents,
  getConsents,
  useRequestOtp,
  useVerifyOtp,
} from "@loop/api-client";
import { BTN_OUTLINE, BTN_SOLID, Card, Muted, PAGE_H1 } from "../marketing/primitives";
import { readReferralCode } from "../referrals/referral-capture";
import { clearDraft, readDraft } from "./draft-store";
import { ConfirmBox, Note, OptionGroup, Radio, TextField } from "./form-bits";
import { clearJoinDrafts, readAccountDraft, readProfileDraft, setJoinNotice, writeAccountDraft, type AccountDraft } from "./join-draft";
import { saveProfileDraft, splitFullName } from "./profile-form";
import { StepBar } from "./step-bar";

/** Mirrors the server's normaliseUkMobile so a bad number is caught before a code is sent. The server decides. */
function isUkMobile(input: string): boolean {
  let n = input.replace(/[\s\-().]/g, "");
  if (n.startsWith("00")) n = `+${n.slice(2)}`;
  if (n.startsWith("07")) n = `+44${n.slice(1)}`;
  if (n.startsWith("+440")) n = `+44${n.slice(4)}`;
  return /^\+447[1-57-9]\d{8}$/.test(n);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Best effort: the registrant typed the introducer, so a failure is reported on the next step rather than blocking sign-up. */
async function attachIntroducer(text: string): Promise<boolean> {
  try {
    const value = text.trim();
    if (EMAIL.test(value)) {
      const found = await lookupIntroducer({ email: value });
      if (found.status !== 200 || !found.data.found || !found.data.code) return false;
      const set = await setIntroducer({ code: found.data.code, source: "VERBAL" });
      return set.status === 200 && set.data.attributed;
    }
    const set = await setIntroducer({ code: value, source: "CODE" });
    return set.status === 200 && set.data.attributed;
  } catch {
    return false;
  }
}

/** Marketing choice ("exclusive offers"). Optional; operational email is a separate, required choice taken at GO LIVE. */
async function grantOffers() {
  const list = await getConsents();
  if (list.status !== 200) return;
  const changes = list.data.items
    .filter((c) => (c.purpose === "LOOP_MARKETING" || c.purpose === "PARTNER_MARKETING") && !c.granted)
    .map((c) => ({ purpose: c.purpose, granted: true, wordingVersion: c.wordingVersion }));
  if (changes.length > 0) await updateConsents({ changes });
}

/** Join step 3 (V33 "Account"): email, mobile, one-time code, introducer, terms and optional offers. No passwords. */
export function RegisterStep() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState<AccountDraft>(() => readAccountDraft());
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestOtp = useRequestOtp();
  const verifyOtp = useVerifyOtp();
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof AccountDraft>(k: K, v: AccountDraft[K]) => setForm((f) => ({ ...f, [k]: v }));
  const mobileOk = isUkMobile(form.mobile);
  const emailOk = EMAIL.test(form.email.trim());
  const profile = readProfileDraft();
  const name = splitFullName(profile.fullName);

  useEffect(() => writeAccountDraft(form), [form]);
  // The profile review comes first; without it there is no name to register.
  useEffect(() => {
    if (!splitFullName(readProfileDraft().fullName)) navigate("/join/profile", { replace: true });
  }, [navigate]);

  async function sendCode() {
    if (busy) return;
    setError(null);
    if (!emailOk) return setError("Enter a valid email address.");
    if (!mobileOk) return setError("Enter a UK mobile number, for example 07700 900123.");
    const email = form.email.trim().toLowerCase();
    if (sentTo === email) return setStatus(`We've already emailed a code to ${form.email.trim()}.`);
    setBusy(true);
    try {
      await requestOtp.mutateAsync({ data: { email: form.email.trim(), purpose: "REGISTER", clientType: "WEB" } });
      setSentTo(email);
      setStatus(`We've emailed a code to ${form.email.trim()}.`);
    } catch (e) {
      const s = typeof e === "object" && e !== null ? (e as { status?: number }).status : undefined;
      setError(
        s === 429
          ? "A code was sent recently. Please wait a minute before asking for another, or use the one we emailed you."
          : "We couldn't send your code. Please check your email address and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (!emailOk || !mobileOk) return setError("Enter your email address and a UK mobile number.");
    if (!sentTo) return setError("Send yourself a code first, then enter it below.");
    if (!/^\d{4,10}$/.test(code)) return setError("Enter the code we emailed you.");
    if (form.introduced === null) return setError("Tell us whether someone introduced you to LOOP.");
    if (form.introduced === "yes" && !form.introducer.trim()) return setError("Please enter who introduced you, or select No.");
    if (!form.terms) return setError("Please accept the Terms and Conditions to continue.");
    if (!name) return setError("Add your full name on the profile review first.");
    setBusy(true);
    try {
      await verifyOtp.mutateAsync({
        data: {
          email: form.email.trim(),
          code,
          clientType: "WEB",
          purpose: "REGISTER",
          registration: { firstName: name.firstName, lastName: name.lastName, mobile: form.mobile.trim(), termsAccepted: true },
          draftToken: readDraft()?.draftToken,
          referralCode: readReferralCode() ?? undefined,
        },
      });
    } catch (err) {
      const s = typeof err === "object" && err !== null ? (err as { status?: number }).status : undefined;
      setError(
        s === 409
          ? "We couldn't create an account with those details. They may already be registered, so try signing in instead."
          : s === 400
            ? "Please check your details, especially that your mobile is a valid UK number, then try again."
            : s === 429
              ? "Too many attempts. Please wait a few minutes and try again."
              : "That code didn't work. Check it and try again, or request a new one.",
      );
      setBusy(false);
      return;
    }
    // The account exists now. Send the profile review answers and the choices made on this page; a failure here is
    // recoverable from the next steps, so it must not strand the contractor on a page that cannot be submitted again.
    clearDraft();
    await qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
    const notes: string[] = [];
    try {
      await saveProfileDraft(profile);
    } catch {
      notes.push("We couldn't save your profile review. Please check it again before you go live.");
    }
    if (form.introduced === "yes" && !(await attachIntroducer(form.introducer))) {
      notes.push("We couldn't match the person who introduced you. Check their email address or introduction code.");
    }
    if (form.offers) {
      try {
        await grantOffers();
      } catch {
        notes.push("We couldn't record your choice about offers. You can set it again when you go live.");
      }
    }
    if (notes.length > 0) setJoinNotice(notes.join(" "));
    clearJoinDrafts();
    navigate("/join/availability");
  }

  return (
    <section className="mx-auto max-w-[720px] px-5 py-12">
      <StepBar step={3} />
      <Card className="!border-[#294357] !bg-[#0b2237] !bg-none !p-8">
        <h1 className={PAGE_H1}>Create your account</h1>
        <Muted className="mb-6">No passwords. Enter your email and verify with a one-time code.</Muted>
        <form onSubmit={submit} noValidate className="grid gap-5">
          <TextField label="Email address" type="email" required value={form.email} placeholder="name@example.com" autoComplete="email" maxLength={254} onChange={(v) => set("email", v)} />
          <TextField label="Mobile number" type="tel" required value={form.mobile} placeholder="e.g. 07700 900000" autoComplete="tel" maxLength={20} onChange={(v) => set("mobile", v)} />
          <Note label="Email verification">
            <strong>Email verification</strong>
            <p className="mb-3 mt-1 text-muted">We'll email you a one-time code to confirm it's you.</p>
            <button type="button" className={BTN_OUTLINE} disabled={busy} onClick={sendCode}>
              Email me a code
            </button>
            {status && (
              <p role="status" className="mt-3 text-fg">
                {status}
              </p>
            )}
            <div className="mt-3">
              <TextField label="One-time code" required value={code} placeholder="6-digit code" maxLength={10} autoComplete="one-time-code" onChange={(v) => setCode(v.trim())} />
            </div>
          </Note>
          <OptionGroup legend="Did someone introduce you to LOOP?">
            <Radio name="introduced" label="Yes" checked={form.introduced === "yes"} onChange={() => set("introduced", "yes")} />
            <Radio name="introduced" label="No" checked={form.introduced === "no"} onChange={() => set("introduced", "no")} />
          </OptionGroup>
          {form.introduced === "yes" && (
            <div className="grid gap-2">
              <Muted className="text-sm">
                Verbal recommendations count. Enter their email address or introduction code; private contact details are not shown. Only one confirmed
                introducer receives credit.
              </Muted>
              <TextField label="Who introduced you?" value={form.introducer} placeholder="Their email address or introduction code" maxLength={254} onChange={(v) => set("introducer", v)} />
            </div>
          )}
          <ConfirmBox checked={form.terms} onChange={(v) => set("terms", v)}>
            {/* TODO(spec): link to the terms page and privacy notice once Legal provides them. Not pre-ticked. */}
            I agree to the Terms and Conditions and acknowledge the Privacy Notice. *
          </ConfirmBox>
          <ConfirmBox checked={form.offers} onChange={(v) => set("offers", v)}>
            I'd like to hear about exclusive offers and useful services for contractors, including umbrella companies, insurance and financial services.
            (Optional)
          </ConfirmBox>
          <Muted className="text-sm">
            You can change your marketing preference at any time. Essential account and availability messages are separate.
          </Muted>
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
            <button type="submit" className={BTN_SOLID} disabled={busy}>
              Continue →
            </button>
          </div>
        </form>
      </Card>
    </section>
  );
}
