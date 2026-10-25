import type { ReactNode } from "react";
import { Link } from "react-router";

export function Section({
  id,
  dark,
  line,
  narrow,
  children,
}: {
  id?: string;
  dark?: boolean;
  line?: boolean;
  narrow?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-20 py-[70px] md:py-[105px] ${dark ? "bg-panel" : ""} ${line ? "border-t border-[#202b38]" : ""}`}
    >
      <div className={`mx-auto px-[26px] ${narrow ? "max-w-3xl" : "max-w-page"}`}>{children}</div>
    </section>
  );
}

export function Eyebrow({ children, compact }: { children: ReactNode; compact?: boolean }) {
  return (
    <div className={compact ? "leading-[16px]" : "leading-[1.55]"}>
      <span className="text-xs font-extrabold uppercase tracking-[0.2em] text-lime">{children}</span>
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[22px] border border-[#2b3747] bg-card-grad p-[30px] ${className}`}>{children}</div>;
}

export function Lead({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`max-w-[560px] text-xl leading-[1.55] text-muted ${className}`}>{children}</p>;
}

export function Muted({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`text-muted ${className}`}>{children}</p>;
}

export function Standout({ children }: { children: ReactNode }) {
  return <p className="mb-4 mt-[30px] text-center font-extrabold text-lime">{children}</p>;
}

/** Shared page-level styles so every web page uses the homepage type scale. */
export const PAGE_H1 = "mb-4 mt-3 text-[clamp(35px,4vw,55px)] font-black leading-[1.12] tracking-[-0.04em] text-fg";
export const PAGE_H2 = "mb-3 mt-3 text-[23px] font-bold tracking-[-0.02em] text-fg";
export const BTN_SOLID =
  "inline-flex items-center gap-2.5 rounded-full bg-lime px-[25px] py-3.5 font-extrabold text-[#0a1114] transition-transform duration-200 hover:-translate-y-0.5 disabled:opacity-40";
export const BTN_OUTLINE =
  "inline-flex items-center gap-2.5 rounded-full border border-[#465366] px-[25px] py-3.5 font-extrabold text-fg transition-transform duration-200 hover:-translate-y-0.5";

export function ButtonLink({
  to,
  children,
  outline,
}: {
  to: string;
  children: ReactNode;
  outline?: boolean;
}) {
  const base =
    "inline-flex items-center gap-2.5 rounded-full px-[18px] py-3 font-extrabold transition-transform duration-200 hover:-translate-y-0.5 md:px-[25px] md:py-3.5";
  const style = outline ? "border border-[#465366] text-fg" : "bg-lime text-[#0a1114]";
  return (
    <Link to={to} className={`${base} ${style}`}>
      {children}
    </Link>
  );
}
