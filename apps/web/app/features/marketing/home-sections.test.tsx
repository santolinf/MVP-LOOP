import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { COPY } from "../../lib/copy";
import {
  FinalCta,
  Hero,
  HowItWorks,
  LiveAndRadar,
  NetworkLoop,
  Rewards,
  TodayVsLoop,
} from "./home-sections";

// Renders the prerender-equivalent (logged-out) HTML: queries never resolve in a static render.
function html(node: React.ReactElement) {
  const client = new QueryClient();
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <StaticRouter location="/">{node}</StaticRouter>
    </QueryClientProvider>,
  );
}

const sections = [
  ["Hero", Hero, "top"],
  ["TodayVsLoop", TodayVsLoop, "why"],
  ["HowItWorks", HowItWorks, "how"],
  ["LiveAndRadar", LiveAndRadar, "radar"],
  ["Rewards", Rewards, "rewards"],
  ["NetworkLoop", NetworkLoop, "network"],
  ["FinalCta", FinalCta, "join"],
] as const;

describe("home sections", () => {
  it.each(sections)("%s renders with anchor id #%s", (_name, Component, id) => {
    expect(html(<Component />)).toContain(`id="${id}"`);
  });

  it("hero has one h1 and Join goes to /join", () => {
    const out = html(<Hero />);
    expect(out.match(/<h1/g)).toHaveLength(1);
    expect(out).toContain('href="/join"');
  });

  it("phone mock is aria-hidden and labelled illustrative", () => {
    const out = html(<Hero />);
    expect(out).toContain('aria-hidden="true"');
    expect(out).toContain(COPY.home.hero.mockLabel);
  });

  it("prerendered rewards CTA is the logged-out variant", () => {
    const out = html(<Rewards />);
    expect(out).toContain(COPY.home.rewards.ctaOut);
    expect(out).not.toContain(COPY.home.rewards.ctaIn);
    expect(out).toContain('href="/join"');
  });

  it("rewards copy keeps the guardrails", () => {
    const out = html(<Rewards />);
    expect(out).toContain("Not 5% each");
    expect(out).toContain("agency-verified");
    expect(out).toContain("Proposed");
  });

  it("radar is Phase 2 and earns no £50", () => {
    expect(html(<LiveAndRadar />)).toMatch(/phase 2/i);
    expect(COPY.home.rewards.exampleNotes.join(" ")).toContain("LOOP Radar contracts do not qualify");
  });

  it("contains no concept artefacts or mobile-app references", () => {
    const all = sections.map(([, C]) => html(<C />)).join(" ");
    expect(all).not.toMatch(/concept|for review|not connected here|\?member=1|app store|google play/i);
  });
});
