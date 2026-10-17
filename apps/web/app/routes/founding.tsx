import { JOIN_PATH } from "../features/marketing/home-sections";
import { FoundingProgress } from "../features/marketing/founding-progress";
import { ButtonLink, Eyebrow, Lead, Muted, Section } from "../features/marketing/primitives";

export function meta() {
  return [{ title: "Founding Membership — LOOP" }];
}

export default function Founding() {
  return (
    <Section narrow>
      <Eyebrow>Founding Membership</Eyebrow>
      <h1 className="mb-4 text-4xl font-bold leading-tight">Become a Founding Member for life</h1>
      <Lead>The first 50,000 qualifying UK IT contractors.</Lead>
      <FoundingProgress />
      <Muted className="mb-3">
        Join LOOP and activate your profile. Introduce 5 UK IT contractors who successfully register. Keep your
        availability up to date. Complete these steps while places remain.
      </Muted>
      <Muted className="mb-8">Once qualified, Founding Membership is locked in for life.</Muted>
      <h2 className="mb-3 text-2xl font-semibold">Proposed financial participation</h2>
      <Muted className="mb-3">
        A proposed 5% pool of LOOP’s annual net profits and a separate proposed 5% pool if LOOP is sold, shared
        between eligible Founding Members under the final rules.
      </Muted>
      {/* TODO(spec): detailed copy pending separate approval; keep the "proposed / not guaranteed / not equity" disclaimers. */}
      <Muted className="mb-8 text-sm">
        The arrangements remain subject to final legal, tax and eligibility rules. Financial distributions are not
        guaranteed, and Founding Membership does not constitute company equity.
      </Muted>
      <div className="flex flex-wrap gap-3">
        <ButtonLink to={JOIN_PATH}>Join LOOP →</ButtonLink>
        <ButtonLink to="/" outline>
          Back to homepage
        </ButtonLink>
      </div>
    </Section>
  );
}
