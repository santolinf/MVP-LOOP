import type { ReactNode } from "react";
import { Link } from "react-router";

export function Section({
  id,
  alt,
  narrow,
  children,
}: {
  id?: string;
  alt?: boolean;
  narrow?: boolean;
  children: ReactNode;
}) {
  return (
    <section id={id} className={`scroll-mt-20 py-16 ${alt ? "bg-panel" : ""}`}>
      <div className={`mx-auto px-5 ${narrow ? "max-w-3xl" : "max-w-page"}`}>{children}</div>
    </section>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="mb-3 block text-sm font-semibold uppercase tracking-wide text-cyan">{children}</span>;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-card border border-line bg-panel-2 p-6 ${className}`}>{children}</div>;
}

export function Lead({ children }: { children: ReactNode }) {
  return <p className="mb-4 text-xl text-fg">{children}</p>;
}

export function Muted({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`text-muted ${className}`}>{children}</p>;
}

export function Standout({ children }: { children: ReactNode }) {
  return <p className="my-6 text-xl font-semibold text-lime">{children}</p>;
}

export function ButtonLink({
  to,
  children,
  outline,
}: {
  to: string;
  children: ReactNode;
  outline?: boolean;
}) {
  const base = "inline-flex items-center rounded-full px-6 py-3 font-semibold transition-opacity hover:opacity-90";
  const style = outline ? "border border-line text-fg" : "bg-lime text-bg";
  return (
    <Link to={to} className={`${base} ${style}`}>
      {children}
    </Link>
  );
}
