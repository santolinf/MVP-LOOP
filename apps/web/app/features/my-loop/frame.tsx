import type { MeDto } from "@loop/api-client";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { Muted } from "../marketing/primitives";
import { SignInRequired } from "../auth/sign-in-required";
import { useMe } from "./use-me";

export const PANEL = "rounded-md border border-[#20485b] bg-[#09283b] p-[15px]";
export const INPUT = "w-full rounded-lg border border-[#465366] bg-transparent p-3 text-fg";
export const BTN_SMALL = "rounded-full border border-[#465366] px-4 py-2 text-xs font-extrabold text-fg hover:border-lime disabled:opacity-40";
export const BTN_PRIMARY = "rounded-full bg-lime px-5 py-2.5 text-xs font-extrabold text-[#0a1114] disabled:opacity-40";
export const BTN_DANGER = "rounded-full border border-red px-4 py-2 text-xs font-extrabold text-red disabled:opacity-40";

/**
 * Every signed-in My LOOP screen. Only those flagged `tab` appear in the tab row: they are the ones no dashboard
 * button leads to. The rest are reached from the dashboard (profile and availability editors, "Replace CV", the
 * assignments link inside the profile editor) and from the header's My LOOP link.
 */
const SECTIONS = [
  { id: "overview", to: "/my-loop", label: "My Profile", tab: false },
  { id: "availability", to: "/my-loop/availability", label: "Availability", tab: false },
  { id: "messages", to: "/my-loop/messages", label: "Messages", tab: true },
  { id: "assignments", to: "/my-loop/assignments", label: "Experience", tab: false },
  { id: "introduce", to: "/introduce", label: "Introductions & rewards", tab: true },
  { id: "edit", to: "/my-loop/edit", label: "Edit my profile", tab: false },
  { id: "profile", to: "/my-loop/profile", label: "Profile details", tab: false },
  { id: "preferences", to: "/my-loop/preferences", label: "Preferences", tab: false },
  { id: "cv", to: "/my-loop/cv", label: "CV & documents", tab: false },
  { id: "privacy", to: "/my-loop/privacy", label: "Privacy & visibility", tab: true },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];

function TabLink({ to, children, selected }: { to: string; children: ReactNode; selected: boolean }) {
  return (
    <Link
      to={to}
      aria-current={selected ? "page" : undefined}
      className={`whitespace-nowrap border-b-4 px-3 py-3 text-xs text-[#c5d4dc] hover:text-[#e7fffd] ${
        selected ? "border-[#b9f443] font-bold text-[#e7fffd]" : "border-transparent"
      }`}
    >
      {children}
    </Link>
  );
}

/** Horizontal tab row shared by every signed-in My LOOP screen. Sign out lives in the site header. */
export function MyLoopNav({ selected }: { selected: SectionId }) {
  return (
    <nav aria-label="My LOOP" className="flex overflow-x-auto border-b border-[#1b4052] bg-[#041726] px-2.5">
      {SECTIONS.filter((s) => s.tab).map((s) => (
        <TabLink key={s.id} to={s.to} selected={s.id === selected}>
          {s.label}
        </TabLink>
      ))}
    </nav>
  );
}

/** Tab row plus content area shared by every signed-in My LOOP screen. */
export function MyLoopFrame({ selected, title, intro, children }: { selected: SectionId; title: string; intro?: string; children: ReactNode }) {
  return (
    <div className="mx-auto my-6 w-[min(1390px,calc(100%-20px))] overflow-hidden rounded-lg border border-[#1d4052] bg-[#041c2c]">
      <MyLoopNav selected={selected} />
      <section className="p-[23px] pb-7">
        <div className="mb-[18px]">
          <h1 className="text-[27px] font-bold text-[#f4f9ff]">{title}</h1>
          {intro && <p className="text-xs text-[#9fb4c3]">{intro}</p>}
        </div>
        {children}
      </section>
    </div>
  );
}

/** Loading, signed-out and error states; renders the frame only once the contractor is known. */
export function MeGate({ selected, title, intro, children }: { selected: SectionId; title: string; intro?: string; children: (me: MeDto) => ReactNode }) {
  const { me, isPending, isError, unauthenticated } = useMe();
  if (isPending)
    return (
      <section className="mx-auto w-[min(56rem,calc(100%-30px))] py-16">
        <Muted>Loading…</Muted>
      </section>
    );
  if (unauthenticated)
    return (
      <SignInRequired message="Please sign in to see My LOOP." />
    );
  if (isError || !me)
    return (
      <section className="mx-auto max-w-3xl px-[26px] py-[70px] md:py-[90px]">
        <p role="alert" className="text-red">
          We couldn’t load your profile. Please try again.
        </p>
      </section>
    );
  return (
    <MyLoopFrame selected={selected} title={title} intro={intro}>
      {children(me)}
    </MyLoopFrame>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-[#c5d4dc]">{label}</span>
      {children}
    </label>
  );
}

export function Status({ error, saved }: { error: string | null; saved: boolean }) {
  if (error)
    return (
      <p role="alert" className="text-xs text-red">
        {error}
      </p>
    );
  return saved ? (
    <p role="status" className="text-xs text-lime">
      Saved.
    </p>
  ) : null;
}
