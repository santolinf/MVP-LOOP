import { Link } from "react-router";
import { BTN_OUTLINE, BTN_SOLID, Card, Eyebrow, Muted, PAGE_H1 } from "../marketing/primitives";
import { SIGN_IN_PATH } from "../auth/return-target";
import { useMe } from "../my-loop/use-me";

/**
 * "Get the app" (V33 welcome screen) after GO LIVE. The app is not published yet, so the QR code and store buttons are
 * honest placeholders and never link anywhere.
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
            <Muted className="mb-6">
              Your profile is ready. Get the contractor app to manage your availability, introductions, rewards and Founding progress.
            </Muted>
            <div className="mb-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-[#294357] p-4">
                <h2 className="mb-2 font-bold text-fg">On your computer</h2>
                <div
                  role="img"
                  aria-label="QR code placeholder; no app destination published"
                  className="mb-2 grid h-[120px] w-[120px] place-items-center rounded-lg border border-dashed border-[#465366] p-2 text-center text-xs font-bold text-muted"
                >
                  QR CODE
                  <small className="font-normal">Available when the app launches</small>
                </div>
                <Muted className="text-sm">Scan the QR code when the app is published. This page does not link to an app store.</Muted>
              </div>
              <div className="rounded-xl border border-[#294357] p-4">
                <h2 className="mb-2 font-bold text-fg">On your phone</h2>
                <Muted className="mb-3 text-sm">Use the App Store or Google Play when LOOP is available.</Muted>
                <p className="mb-2 rounded-full border border-[#465366] px-4 py-2 text-sm text-muted">App Store · coming soon</p>
                <p className="mb-2 rounded-full border border-[#465366] px-4 py-2 text-sm text-muted">Google Play · coming soon</p>
                <Muted className="text-sm">An email download link will also be provided.</Muted>
              </div>
            </div>
            <div className="mb-4 flex flex-wrap gap-3">
              <Link to="/my-loop" className={BTN_OUTLINE}>
                Continue without app →
              </Link>
            </div>
            <Muted className="text-sm">App sign-in is required for Founding Membership, but not for a LIVE profile.</Muted>
          </>
        )}
      </Card>
    </section>
  );
}
