import { MeGate, PANEL } from "./frame";

/** Messages from LOOP, as in the V33 reference. Recruiter messaging arrives with agency access, so it is labelled as coming soon. */
export function MessagesPage() {
  return (
    <MeGate selected="messages" title="Messages" intro="Important account messages and updates from the LOOP team.">
      {() => (
        <div className="grid max-w-[720px] gap-3">
          <section className={PANEL}>
            <h2 className="mb-2 text-sm text-[#f0f6fa]">Messages from LOOP</h2>
            <p className="text-xs text-[#9fb4c3]">
              <strong className="text-[#f0f6fa]">Welcome to your LOOP inbox.</strong> You'll receive important account messages and updates from the LOOP team
              here.
            </p>
          </section>
          <section className={PANEL}>
            <span className="text-[9px] font-extrabold uppercase tracking-wider text-[#c5ee5e]">Coming soon</span>
            <h2 className="mb-1 mt-1 text-sm text-[#f0f6fa]">Recruiter messages &amp; call requests</h2>
            <p className="text-xs text-[#9fb4c3]">
              When the agency and consultancy platform launches, you'll be able to receive enquiries and respond to contact requests.
            </p>
          </section>
          <section className={PANEL}>
            <span className="text-[9px] font-extrabold uppercase tracking-wider text-[#c5ee5e]">Coming soon</span>
            <h2 className="mb-1 mt-1 text-sm text-[#f0f6fa]">My Authorisations — Authority to Represent</h2>
            <p className="text-xs text-[#9fb4c3]">
              Review specific agency representation requests, accept or decline each request and see your history. No agency receives authority
              automatically.
            </p>
          </section>
        </div>
      )}
    </MeGate>
  );
}
