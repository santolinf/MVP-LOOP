import { JOIN_PATH } from "../features/marketing/home-sections";
import { FoundingProgress } from "../features/marketing/founding-progress";
import { ButtonLink, Card, Eyebrow, Lead, Muted, PAGE_H1, PAGE_H2, Section } from "../features/marketing/primitives";

export function meta() {
  return [{ title: "Founding Membership — LOOP" }];
}

const STEPS = [
  { n: "01", title: "Join LOOP", body: "Register, complete your contractor profile and go LIVE." },
  {
    n: "02",
    title: "Introduce five",
    body: "Five different UK IT contractors must successfully register and confirm you as their introducer. Verbal recommendations count too.",
  },
  { n: "03", title: "Get the app", body: "Download LOOP and sign in successfully once." },
  { n: "04", title: "Stay current", body: "Keep your availability and profile up to date." },
];

const METRICS = [
  {
    title: "Annual net profits",
    body: "A proposed pool shared between eligible Founding Members when LOOP makes a profit.",
  },
  {
    title: "If LOOP is sold",
    body: "A separate proposed pool shared between eligible Founding Members on a qualifying sale.",
  },
];

export default function Founding() {
  return (
    <Section narrow>
      <Eyebrow>Founding Membership</Eyebrow>
      <h1 className={PAGE_H1}>
        Help build LOOP.
        <br />
        <em className="not-italic text-lime">Share in its success.</em>
      </h1>
      <Lead>The first 50,000 qualifying UK IT contractors can secure Founding Membership for life.</Lead>
      <FoundingProgress />
      <div className="mb-[30px] mt-8 grid gap-4 sm:grid-cols-2">
        {STEPS.map((s) => (
          <Card key={s.n} className="p-6">
            <span className="text-sm font-extrabold tracking-[0.2em] text-lime">{s.n}</span>
            <h3 className="mb-2 mt-2 text-xl font-bold text-fg">{s.title}</h3>
            <Muted>{s.body}</Muted>
          </Card>
        ))}
      </div>
      <div className="mb-10 rounded-r-[14px] border-l-[3px] border-lime bg-[#112b3d] px-6 py-[21px] text-fg">
        Once you meet the criteria while places remain, your Founding Membership is yours for life. You don’t have to
        wait for LOOP’s commercial launch.
      </div>
      <h2 className={PAGE_H2}>What could Founding Members share in?</h2>
      <div className="mb-10 mt-4 grid gap-4 sm:grid-cols-2">
        {METRICS.map((m) => (
          <article key={m.title} className="rounded-[15px] border border-[#35556b] bg-[#0e283d] p-[30px]">
            <div className="text-[clamp(52px,8vw,75px)] font-black leading-none tracking-[-0.04em] text-lime">5%</div>
            <h3 className="mb-2 mt-3 text-xl font-bold text-fg">{m.title}</h3>
            <Muted>{m.body}</Muted>
          </article>
        ))}
      </div>
      <h2 className={PAGE_H2}>Five is the starting point, not the limit.</h2>
      <Muted className="mb-8">
        Introduce more contractors and grow your potential rewards. You can earn a separate one-off £50 for every
        directly introduced contractor who completes three months of agency-verified service on their first qualifying
        LOOP contract.
      </Muted>
      <h2 className={PAGE_H2}>Founding status and payment eligibility are different.</h2>
      <Muted className="mb-8">
        Founding Membership stays with you once earned. Eligibility for any future financial distribution will depend
        on the final programme rules, including keeping your profile current.
      </Muted>
      {/* TODO(spec): detailed copy pending separate approval; keep the "proposed / not guaranteed / not equity" disclaimers. */}
      <div className="mb-8 rounded-xl border border-[#5e7c89] bg-[#112536] p-4 text-[13px] leading-relaxed text-muted">
        The 5% arrangements are proposals, subject to final legal, tax and eligibility rules. Payments are not
        guaranteed. Founding Membership is intended as contractual participation, not company equity.
      </div>
      <div className="flex flex-wrap gap-3">
        <ButtonLink to={JOIN_PATH}>Join LOOP →</ButtonLink>
        <ButtonLink to="/introduce" outline>
          Introduce IT Contractors →
        </ButtonLink>
        <ButtonLink to="/" outline>
          Back to homepage
        </ButtonLink>
      </div>
    </Section>
  );
}
