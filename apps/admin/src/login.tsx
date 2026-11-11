import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getAdminMeQueryKey,
  useAdminRequestOtp,
  useAdminTotpSetup,
  useAdminTotpVerify,
  useAdminVerifyOtp,
} from "@loop/api-client";
import { Notice } from "./lib.js";
import { QrCode } from "@loop/ui";

type Step = "EMAIL" | "CODE" | "MFA_ENROL" | "MFA_REQUIRED";

/** Staff sign-in: emailed code, then an authenticator code. A separate realm from contractor sign-in. */
export function Login() {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>("EMAIL");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [secret, setSecret] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const request = useAdminRequestOtp();
  const verify = useAdminVerifyOtp();
  const setup = useAdminTotpSetup();
  const totp = useAdminTotpVerify();
  const error = request.error ?? verify.error ?? setup.error ?? totp.error;

  const sendEmail = async (e: FormEvent) => {
    e.preventDefault();
    await request.mutateAsync({ data: { email } });
    setStep("CODE");
  };
  const sendCode = async (e: FormEvent) => {
    e.preventDefault();
    const { data } = await verify.mutateAsync({ data: { email, code } });
    setCode("");
    if (data.stage === "MFA_ENROL") {
      const res = await setup.mutateAsync();
      setSecret(res.data);
    }
    setStep(data.stage === "MFA_ENROL" ? "MFA_ENROL" : "MFA_REQUIRED");
  };
  const sendTotp = async (e: FormEvent) => {
    e.preventDefault();
    await totp.mutateAsync({ data: { code } });
    await qc.invalidateQueries({ queryKey: getAdminMeQueryKey() });
  };

  return (
    <main className="login">
      <h1>LOOP Admin</h1>
      {step === "EMAIL" && (
        <form onSubmit={(e) => void sendEmail(e).catch(() => undefined)} className="stack">
          <label>
            Work email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
          </label>
          <button type="submit" disabled={request.isPending}>
            Email me a code
          </button>
        </form>
      )}
      {step === "CODE" && (
        <form onSubmit={(e) => void sendCode(e).catch(() => undefined)} className="stack">
          <p>If that address has a staff account, a code is on its way.</p>
          <label>
            Emailed code
            <input inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} required autoComplete="one-time-code" />
          </label>
          <button type="submit" disabled={verify.isPending}>
            Continue
          </button>
        </form>
      )}
      {(step === "MFA_ENROL" || step === "MFA_REQUIRED") && (
        <form onSubmit={(e) => void sendTotp(e).catch(() => undefined)} className="stack">
          {step === "MFA_ENROL" && secret ? (
            <>
              <p>Scan this code with an authenticator app on your phone (for example Google Authenticator or Microsoft Authenticator), then enter the 6-digit code it shows.</p>
              <QrCode value={secret.otpauthUrl} label="Authenticator setup code" />
              <p className="muted">Can't scan it? In the app choose "enter a setup key" (time-based) and type this key:</p>
              <code className="secret">{secret.secret}</code>
              <button type="button" onClick={() => void navigator.clipboard.writeText(secret.secret)}>
                Copy key
              </button>
              <p className="muted">
                On a phone with an authenticator app installed, <a href={secret.otpauthUrl}>open it there</a> instead.
              </p>
            </>
          ) : (
            <p>Enter the 6-digit code from your authenticator app.</p>
          )}
          <label>
            Authenticator code
            <input inputMode="numeric" pattern="\d{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} required autoComplete="one-time-code" />
          </label>
          <button type="submit" disabled={totp.isPending}>
            Sign in
          </button>
        </form>
      )}
      <Notice error={error} />
    </main>
  );
}
