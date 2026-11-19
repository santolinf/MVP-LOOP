import { Link } from "react-router";
import { QrCode } from "@loop/ui";
import { BTN_OUTLINE, BTN_SOLID, Card, Eyebrow, Muted, PAGE_H1 } from "../marketing/primitives";
import { SIGN_IN_PATH } from "../auth/return-target";
import { useMe } from "../my-loop/use-me";

const IOS_URL = import.meta.env.VITE_IOS_APP_URL || undefined;
const ANDROID_URL = import.meta.env.VITE_ANDROID_APP_URL || undefined;

/**
 * "Get the app" (V33 welcome screen) after GO LIVE. App-first (founder decision, 7 Nov): store links and the QR code appear only once real URLs are configured; there are no
 * "coming soon" buttons, demo previews or "continue without app" path, and the LIVE account is always preserved.
 */
export function WelcomePage() {
  const { me, isPending, unauthenticated } = useMe();

  return (
    <section className="mx-auto max-w-[720px] px-5 py-12">
      <Eyebrow>Registration complete</Eyebrow>
      <Card className="mt-6 !border-[#294357] !bg-[#0b2237] !bg-none !p-8">
        {isPending && <Muted>Loading…</Muted>}
        {unauthenticated && (
          <>
            <h1 className={PAGE_H1}>Sign in</h1>
            <p role="alert" className="mb-6 text-red">
              Please sign in to see your welcome page.
            </p>
            <Link to={SIGN_IN_PATH} className={BTN_SOLID}>
              Sign in
            </Link>
          </>
        )}
        {me && !me.live && (
          <>
            <h1 className={PAGE_H1}>Almost there</h1>
            <Muted className="mb-6">Your profile isn't live yet. Review it and go live when you're ready.</Muted>
            <Link to="/join/review" className={BTN_SOLID}>
              Review and go live
            </Link>
          </>
        )}
        {me?.live && (
          <>
            <h1 className={PAGE_H1}>Welcome to LOOP.</h1>
            <p className="mb-4 text-xl text-muted">You're LIVE. Now stay in the LOOP.</p>
            <p className="mb-2 font-bold text-fg">Complete your app sign-in to become eligible for Founding Membership.</p>
            <Muted className="mb-6">
              Use the app to keep your availability current in seconds, receive reminders, introduce contractors and follow your progress. Installing the
              app does not by itself make you a Founding Contractor.
            </Muted>
            {IOS_URL || ANDROID_URL ? (
              <div className="mb-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-[#294357] p-4">
                  <h2 className="mb-2 font-bold text-fg">On your computer</h2>
                  <QrCode value={IOS_URL ?? ANDROID_URL ?? ""} label="QR code for the LOOP app download page" size={140} />
                  <Muted className="mt-2 text-sm">Scan with your phone to open the app listing.</Muted>
                </div>
                <div className="rounded-xl border border-[#294357] p-4">
                  <h2 className="mb-2 font-bold text-fg">On your phone</h2>
                  <div className="grid gap-2">
                    {IOS_URL && (
                      <a href={IOS_URL} className={BTN_SOLID} rel="noopener">
                        Download on the App Store
                      </a>
                    )}
                    {ANDROID_URL && (
                      <a href={ANDROID_URL} className={BTN_SOLID} rel="noopener">
                        Get it on Google Play
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <p role="status" className="mb-6 rounded-xl border border-[#294357] p-4 text-muted">
                {/* TODO(spec): QA-010 — store links and QR are configured with VITE_IOS_APP_URL / VITE_ANDROID_APP_URL at release. */}
                The LOOP app is launching shortly. Your profile stays LIVE, and we'll email you a download link as soon as it is available.
              </p>
            )}
            <div className="mb-4 flex flex-wrap gap-3">
              <Link to="/my-loop" className={BTN_OUTLINE}>
                Go to My LOOP →
              </Link>
            </div>
            <Muted className="text-sm">
              Your account remains LIVE. Founding eligibility is incomplete until you sign in to the app.
            </Muted>
          </>
        )}
      </Card>
    </section>
  );
}
