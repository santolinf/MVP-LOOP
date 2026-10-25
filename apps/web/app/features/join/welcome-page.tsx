import { Link } from "react-router";
import { AvailabilityBadge } from "@loop/ui";
import { BTN_OUTLINE, BTN_SOLID, Card, Eyebrow, Muted, PAGE_H1 } from "../marketing/primitives";
import { useMe } from "../my-loop/use-me";

/** Web only: no app download or QR prompts while the mobile app is deferred. */
export function WelcomePage() {
  const { me, isPending, unauthenticated } = useMe();

  return (
    <main className="mx-auto max-w-[720px] px-5 py-12">
      <Eyebrow>You're in the LOOP</Eyebrow>
      <Card className="mt-6 !border-[#294357] !bg-[#0b2237] !bg-none !p-8">
        {isPending && <Muted>Loading…</Muted>}
        {unauthenticated && <p role="alert" className="text-red">Please sign in to see your welcome page.</p>}
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
            <h1 className={PAGE_H1}>Welcome to LOOP{me.firstName ? `, ${me.firstName}` : ""}</h1>
            <div className="mb-4">
              <AvailabilityBadge colour={me.availability.colour} />
            </div>
            <Muted className="mb-6">
              Your profile is live. We'll email you when it's time to confirm your availability, so you stay current and visible.
            </Muted>
            <div className="flex flex-wrap gap-3">
              <Link to="/my-loop" className={BTN_SOLID}>
                Go to My LOOP
              </Link>
              <Link to="/introduce" className={BTN_OUTLINE}>
                Introduce contractors
              </Link>
            </div>
          </>
        )}
      </Card>
    </main>
  );
}
