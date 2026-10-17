import { ButtonLink, Card, Lead, Section } from "../features/marketing/primitives";
import { JOIN_PATH } from "../features/marketing/home-sections";

export function meta() {
  return [{ title: "Introduce IT Contractors — LOOP" }];
}

export default function Introduce() {
  return (
    <Section narrow>
      <span className="mb-3 block text-sm font-semibold uppercase tracking-wide text-cyan">Grow the network</span>
      <h1 className="mb-4 text-4xl font-bold leading-tight">
        Introduce more.
        <br />
        <em className="not-italic text-lime">Earn more.</em>
      </h1>
      <Lead>Help build the LOOP network and get rewarded for bringing fellow UK IT contractors on board.</Lead>
      <Card>
        <h3 className="mb-4 text-xl font-semibold">How it works</h3>
        <p className="mb-4 text-muted">
          <strong className="text-fg">5 introductions</strong>
          <br />
          Introduce five UK IT contractors who successfully register. This counts towards Founding Membership,
          alongside the other qualification criteria.
        </p>
        <p className="mb-4 text-muted">
          <strong className="text-fg">£50 per successful introduction</strong>
          <br />
          Earn £50 when someone you directly introduce completes three months of agency-verified service on their
          first qualifying LOOP contract.
        </p>
        <p className="mb-6 text-muted">
          <strong className="text-fg">Unlimited introductions</strong>
          <br />
          Keep introducing more. Each different qualifying contractor can earn you another one-off £50 reward.
        </p>
        {/* TODO(spec): signed-in/LIVE users should see their referral link from the real backend (Phase 5). Every visitor sees the join invitation for now. */}
        <p className="mb-4 text-muted">
          Join LOOP to get your personal introduction link and start inviting fellow IT contractors.
        </p>
        <div className="flex flex-wrap gap-3">
          <ButtonLink to={JOIN_PATH}>Introduce IT Contractors →</ButtonLink>
          <ButtonLink to="/" outline>
            Back to homepage
          </ButtonLink>
        </div>
      </Card>
    </Section>
  );
}
