import {
  FinalCta,
  FoundingSection,
  Hero,
  IntroductionsSection,
  OverviewStrip,
  ProfitSharingSection,
  RadarSection,
} from "../features/marketing/home-sections";

export default function Home() {
  return (
    <>
      <Hero />
      <OverviewStrip />
      <FoundingSection />
      <ProfitSharingSection />
      <IntroductionsSection />
      <RadarSection />
      <FinalCta />
    </>
  );
}
