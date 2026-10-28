import { ButtonLink, Card, Eyebrow, Lead, PAGE_H1, PAGE_H2, Section } from "../features/marketing/primitives";
import { ReferralLinkCard, useHasReferralLink } from "../features/referrals/referral-link-card";
import { JOIN_PATH } from "../features/marketing/home-sections";

export function meta() {
  return [{ title: "Introduce IT Contractors — LOOP" }];
}

export default function Introduce() {
  const { has } = useHasReferralLink();
  return (
    <Section narrow>
      <Eyebrow>Grow the network</Eyebrow>
      <h1 className={PAGE_H1}>
        Introduce more.
        <br />
        <em className="not-italic text-lime">Earn more.</em>
      </h1>
      <Lead>Help build the LOOP network and get rewarded for bringing fellow UK IT contractors on board.</Lead>
      <Card className="mt-8">
        <h2 className={PAGE_H2}>How it works</h2>
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
        {has ? (
          <ReferralLinkCard />
        ) : (
          <p className="mb-4 text-muted">
            Join LOOP to get your personal introduction link and start inviting fellow IT contractors.
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          {!has && <ButtonLink to={JOIN_PATH}>Introduce IT Contractors →</ButtonLink>}
          <ButtonLink to="/" outline>
            Back to homepage
          </ButtonLink>
        </div>
      </Card>
    </Section>
  );
}
