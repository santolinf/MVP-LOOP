import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { SignInRequired } from "./sign-in-required";

const html = (location: string) =>
  renderToStaticMarkup(
    <StaticRouter location={location}>
      <SignInRequired message="Please sign in to see My LOOP." />
    </StaticRouter>,
  );

describe("SignInRequired", () => {
  it("links to sign-in and resumes at an allow-listed route", () => {
    const out = html("/my-loop/availability");
    expect(out).toContain("Sign in required");
    expect(out).toContain('href="/sign-in?next=%2Fmy-loop%2Favailability"');
  });

  it("links to plain sign-in from a route that cannot be resumed", () => {
    expect(html("/welcome")).toContain('href="/sign-in"');
  });
});
