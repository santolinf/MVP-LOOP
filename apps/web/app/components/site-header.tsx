import { Link } from "react-router";
import { COPY } from "../lib/copy";
import { ButtonLink } from "../features/marketing/primitives";
import { SIGN_IN_PATH } from "../features/auth/return-target";
import { JOIN_PATH, useSignedIn } from "../features/marketing/use-member-cta";

const NAV = [
  { to: "/#why", label: "Why LOOP" },
  { to: "/#how", label: "How it works" },
  { to: "/#radar", label: "LOOP Radar" },
  { to: "/#rewards", label: "Rewards" },
];

export function SiteHeader() {
  const signedIn = useSignedIn();

  return (
    <header className="sticky top-0 z-10 border-b border-[#263040] bg-[#090c13e8] backdrop-blur-[16px]">
      <div className="mx-auto flex h-[68px] max-w-page items-center justify-between gap-[22px] px-[26px] md:h-20">
        <Link to="/" aria-label="LOOP home" className="shrink-0">
          <img
            src="/assets/loop-logo-header.png"
            alt={COPY.tagline.join("")}
            width={155}
            height={50}
            className="h-[50px] w-[125px] object-contain object-left md:w-[155px]"
          />
        </Link>
        <nav aria-label="Main navigation" className="flex items-center gap-[26px] text-sm text-[#d0d7e2]">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} className="hidden hover:text-lime min-[800px]:inline">
              {n.label}
            </Link>
          ))}
          {signedIn ? (
            <Link to="/my-loop" className="font-extrabold text-lime">
              My LOOP
            </Link>
          ) : (
            <>
              <Link to={SIGN_IN_PATH} className="hover:text-lime">
                Log in
              </Link>
              <ButtonLink to={JOIN_PATH}>{COPY.primary} ↗</ButtonLink>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
