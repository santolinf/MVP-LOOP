import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey, useCreateReturnTarget, useRequestOtp, useVerifyOtp } from "@loop/api-client";
import { BTN_OUTLINE, BTN_SOLID, Card, Muted, PAGE_H1 } from "../marketing/primitives";
import { useMe } from "../my-loop/use-me";
import { DEFAULT_SIGNED_IN_PATH, returnTargetFor } from "./return-target";

const INPUT = "w-full rounded-lg border border-[#465366] bg-transparent p-3 text-fg";
const CODE_RE = /^\d{4,10}$/;

function statusOf(e: unknown): number | undefined {
  return typeof e === "object" && e !== null ? (e as { status?: number }).status : undefined;
}

/** Passwordless sign-in for existing contractors: email, then the emailed one-time code (ADR 0002). */
export function SignInPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const next = params.get("next");
  const { me } = useMe();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestOtp = useRequestOtp();
  const verifyOtp = useVerifyOtp();
  const createReturnTarget = useCreateReturnTarget();
  const busy = requestOtp.isPending || verifyOtp.isPending || createReturnTarget.isPending;

  // Someone who is already signed in has nothing to do here.
  useEffect(() => {
    if (me) navigate(returnTargetFor(next) ? (next ?? DEFAULT_SIGNED_IN_PATH) : DEFAULT_SIGNED_IN_PATH, { replace: true });
  }, [me, next, navigate]);

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || busy) return;
    setError(null);
    try {
      await requestOtp.mutateAsync({ data: { email: email.trim(), purpose: "SIGN_IN", clientType: "WEB" } });
      setSent(true);
    } catch (err) {
      setError(
        statusOf(err) === 429
          ? "A code was sent recently. Please wait a minute before asking for another, or use the one we emailed you."
          : "We couldn't send a code. Please check your email address and try again.",
      );
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!CODE_RE.test(code) || busy) return;
    setError(null);
    try {
      const target = returnTargetFor(next);
      // A failed return token must not block sign-in: fall back to My LOOP.
      const returnToken = target
        ? await createReturnTarget.mutateAsync({ data: { target } }).then(
            (r) => r.data.token,
            () => undefined,
          )
        : undefined;
      const result = await verifyOtp.mutateAsync({
        data: { email: email.trim(), code, clientType: "WEB", purpose: "SIGN_IN", returnToken },
      });
      await qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
      navigate(result.data.returnTo ?? DEFAULT_SIGNED_IN_PATH, { replace: true });
    } catch (err) {
      setError(
        statusOf(err) === 429
          ? "Too many attempts. Please wait a few minutes and try again."
          : "That code didn't work. Check it and try again, or request a new one.",
      );
    }
  }

  return (
    <section className="mx-auto max-w-[720px] px-5 py-12">
      <Card className="!border-[#294357] !bg-[#0b2237] !bg-none !p-8">
        <h1 className={PAGE_H1}>Sign in to LOOP</h1>
        {!sent ? (
          <form onSubmit={sendCode} className="grid gap-4">
            <Muted>Enter the email you registered with. We'll email you a one-time code. There is no password.</Muted>
            <label>
              <span className="mb-1 block font-semibold">Email</span>
              <input
                className={INPUT}
                type="email"
                autoComplete="email"
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            {error && (
              <p role="alert" className="text-red">
                {error}
              </p>
            )}
            <div className="flex items-center justify-between gap-3">
              <Link to="/join" className={BTN_OUTLINE}>
                New to LOOP? Join
              </Link>
              <button type="submit" className={BTN_SOLID} disabled={!email.trim() || busy}>
                Email me a code
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={verify} className="grid gap-4">
            {/* Same wording whether or not the address is registered, so this page does not reveal who is a member. */}
            <p role="status" className="text-fg">
              If {email.trim()} is registered, we've emailed it a code.
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
              <button
                type="button"
                className={BTN_OUTLINE}
                onClick={() => {
                  setSent(false);
                  setCode("");
                  setError(null);
                }}
              >
                ← Change email
              </button>
              <button type="submit" className={BTN_SOLID} disabled={!CODE_RE.test(code) || busy}>
                Sign in
              </button>
            </div>
          </form>
        )}
      </Card>
    </section>
  );
}
