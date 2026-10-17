import { ButtonLink, Card, Eyebrow, Lead, Muted, Section, Standout } from "./primitives";

// "Join LOOP" leads to the UK eligibility gate, which then continues to the CV step.
export const JOIN_PATH = "/join";

const OVERVIEW = [
  { title: "Why LOOP?", text: "Help your next contract find you.", href: "#why-loop" },
  { title: "Founding Membership", text: "Join early. Introduce five. Qualify for life.", href: "#founding" },
  { title: "Share in our success", text: "Proposed 5% profit and sale participation.", href: "#profit-sharing" },
  { title: "Introduce IT Contractors", text: "£50 qualifying rewards.", href: "#introductions" },
  { title: "LOOP Radar", text: "More opportunities finding you. Stage 2.", href: "#radar" },
];

export function Hero() {
  return (
    <Section id="why-loop">
      <h1 className="mb-4 text-4xl font-bold leading-tight md:text-5xl">
        Your next contract. Your network. <em className="not-italic text-lime">Your share.</em>
      </h1>
      <Lead>We’re building LOOP with UK IT contractors, for UK IT contractors.</Lead>
      <Muted className="mb-3">
        One live profile. Better visibility to recruitment agencies. Less time searching for your next contract.
      </Muted>
      <Muted className="mb-6">And if you help us build the network, we want you to share in its success.</Muted>
      <ul className="mb-6 flex flex-wrap gap-x-6 gap-y-2 text-lime">
        <li>✓ Free to join</li>
        <li>✓ Easy availability updates</li>
      </ul>
      <ButtonLink to={JOIN_PATH}>Join LOOP →</ButtonLink>
    </Section>
  );
}

export function OverviewStrip() {
  return (
    <nav aria-label="Page sections" className="mx-auto max-w-page px-5">
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {OVERVIEW.map((o) => (
          <li key={o.href}>
            <a href={o.href} className="block h-full rounded-card border border-line bg-panel p-4 hover:border-cyan">
              <strong className="block text-fg">{o.title}</strong>
              <span className="text-sm text-muted">{o.text}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

const STEPS = [
  { n: "01", title: "Join LOOP", text: "Activate your profile" },
  { n: "02", title: "Introduce 5", text: "UK IT contractors who register" },
  { n: "03", title: "Stay current", text: "Keep availability updated" },
];

export function FoundingSection() {
  return (
    <Section id="founding" alt>
      <h2 className="mb-3 text-3xl font-bold">Become a Founding Member for life</h2>
      <Lead>The first 50,000 qualifying UK IT contractors.</Lead>
      <Muted className="mb-8">
        Help us build LOOP and secure your Founding Membership before commercial launch.
      </Muted>
      <ol className="mb-8 grid gap-4 md:grid-cols-3">
        {STEPS.map((s) => (
          <li key={s.n}>
            <Card className="h-full">
              <span className="text-2xl font-bold text-cyan">{s.n}</span>
              <h3 className="mt-2 text-xl font-semibold">{s.title}</h3>
              <Muted>{s.text}</Muted>
            </Card>
          </li>
        ))}
      </ol>
      <p className="rounded-card border border-lime p-4 text-fg">
        Once qualified, your Founding Membership is locked in for life. Complete the criteria while places remain. No
        need to wait for LOOP to launch commercially.
      </p>
    </Section>
  );
}

export function ProfitSharingSection() {
  return (
    <Section id="profit-sharing">
      <h2 className="mb-3 text-3xl font-bold">Share in LOOP’s success</h2>
      <Lead>Help us build LOOP. Share in what we achieve.</Lead>
      {/* Percentages are display copy only; eligibility is stored, never calculated here (B10). */}
      <div className="my-8 grid gap-4 md:grid-cols-2">
        <Card>
          <span className="text-4xl font-bold text-lime">5%</span>
          <h3 className="mt-2 text-xl font-semibold">Of LOOP’s annual net profits</h3>
          <Muted>Shared between eligible Founding Members when LOOP makes a profit.</Muted>
        </Card>
        <Card>
          <span className="text-4xl font-bold text-lime">5%</span>
          <h3 className="mt-2 text-xl font-semibold">If LOOP is sold</h3>
          <Muted>Shared between eligible Founding Members if LOOP is sold.</Muted>
        </Card>
      </div>
      <Muted className="mb-6 text-sm">
        Proposed benefits, subject to final legal, tax and eligibility rules. Founding Membership is for life once
        earned, but payments are not guaranteed. The scheme is intended as contractual participation, not company
        equity.
      </Muted>
      <ButtonLink to="/founding" outline>
        Learn about Founding Membership →
      </ButtonLink>
    </Section>
  );
}

export function IntroductionsSection() {
  return (
    <Section id="introductions" alt>
      <Eyebrow>Introduce IT Contractors</Eyebrow>
      <h2 className="mb-3 text-3xl font-bold">Help us grow. Get rewarded.</h2>
      <Muted className="mb-8">
        Introduce five UK IT contractors who successfully register to qualify for Founding Membership.{" "}
        <strong className="text-fg">But why stop at five?</strong> Keep introducing more and increase your potential
        £50 rewards.
      </Muted>
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <Card>
          <span className="text-3xl font-bold text-lime">£50</span>
          <h3 className="mt-2 text-xl font-semibold">For you</h3>
          <Muted>Complete your first qualifying LOOP contract.</Muted>
        </Card>
        <Card>
          <span className="text-3xl font-bold text-lime">£50</span>
          <h3 className="mt-2 text-xl font-semibold">For every successful introduction</h3>
          <Muted>
            When someone you’ve introduced completes their first qualifying LOOP contract.
          </Muted>
        </Card>
      </div>
      <Muted className="mb-6 text-sm">
        <strong className="text-fg">Unlimited direct introductions.</strong> £50 per successful introduction, paid
        once the referred contractor completes three months of agency-verified service on their first qualifying LOOP
        contract. One-off reward per qualifying contractor.
      </Muted>
      <ButtonLink to="/introduce">Introduce IT Contractors →</ButtonLink>
    </Section>
  );
}

export function RadarSection() {
  return (
    <Section id="radar" narrow>
      <Eyebrow>LOOP Radar</Eyebrow>
      <span className="mb-3 inline-block rounded-full border border-line px-3 py-1 text-xs font-semibold text-cyan">
        COMING IN STAGE 2
      </span>
      <h2 className="mb-3 text-3xl font-bold">Less searching. More opportunities finding you.</h2>
      <Muted>
        Live IT contract requirements matching your skills, rate, location and availability — brought together for
        you.
      </Muted>
      <Standout>One profile. Relevant opportunities. Less searching.</Standout>
      <Muted className="text-sm">
        Planned for Stage 2, not available at initial launch. Coverage will grow as LOOP develops.
      </Muted>
    </Section>
  );
}

export function FinalCta() {
  return (
    <Section alt narrow>
      <h2 className="mb-4 text-3xl font-bold">Let’s build LOOP together.</h2>
      <Muted className="mb-3">
        We’re starting with UK IT contractors and building the network before launching agency access at scale.
      </Muted>
      <Muted className="mb-3">
        Join now, keep your availability current and introduce 5 UK IT contractors who register to qualify for
        Founding Membership.{" "}
        <strong className="text-fg">
          Introduce more than five to increase your potential £50 referral rewards.
        </strong>{" "}
        Give us a little time to build something worthwhile.
      </Muted>
      <Standout>Join early. Secure your place. Share in our future.</Standout>
      <ButtonLink to={JOIN_PATH}>Join LOOP →</ButtonLink>
      <p className="mt-8 text-muted">Stay current. Stay visible. Stay in the LOOP.</p>
    </Section>
  );
}
