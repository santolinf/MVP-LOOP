import {
  FinalCta,
  Hero,
  HowItWorks,
  LiveAndRadar,
  NetworkLoop,
  Rewards,
  TodayVsLoop,
} from "../features/marketing/home-sections";
import { COPY } from "../lib/copy";

// TODO(spec): canonical host is a placeholder until the production domain is confirmed.
export function meta() {
  const m = COPY.home.meta;
  return [
    { title: m.title },
    { name: "description", content: m.description },
    { property: "og:type", content: "website" },
    { property: "og:title", content: m.title },
    { property: "og:description", content: m.description },
    { property: "og:url", content: m.canonical },
    { tagName: "link", rel: "canonical", href: m.canonical },
  ];
}

export default function Home() {
  return (
    <>
      <Hero />
      <TodayVsLoop />
      <HowItWorks />
      <LiveAndRadar />
      <Rewards />
      <NetworkLoop />
      <FinalCta />
    </>
  );
}
