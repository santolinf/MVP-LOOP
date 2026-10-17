import { Link, NavLink } from "react-router";
import { COPY } from "../lib/copy";

// TODO(spec): Log in and My LOOP links arrive with auth (Phase 2+).
const NAV = [
  { to: "/", label: "Why LOOP" },
  { to: "/introduce", label: "Introduce IT Contractors" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-bg/90 backdrop-blur-md">
      <div className="mx-auto flex min-h-20 w-[min(var(--container-page),calc(100%-30px))] items-center justify-between gap-5">
        <Link to="/" aria-label="LOOP home" className="flex flex-col items-start gap-0.5">
          <img src="/assets/loop-logo-header.png" alt="LOOP" width={142} height={46} className="h-[46px] w-[142px] object-contain" />
          <span className="text-xs text-muted">
            {COPY.tagline[0]}
            <strong className="text-lime">{COPY.tagline[1]}</strong>
          </span>
        </Link>
        <nav aria-label="Main navigation" className="hidden gap-6 md:flex">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end className="text-sm text-slate-200 hover:text-lime">
              {n.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}
