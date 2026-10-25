import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAdminLogout, useAdminMe } from "@loop/api-client";
import { Login } from "./login.js";
import { AvailabilityQueue } from "./tabs/availability.js";
import { Communications } from "./tabs/communications.js";
import { Contractors } from "./tabs/contractors.js";
import { Introductions } from "./tabs/introductions.js";
import { Overview } from "./tabs/overview.js";
import { Reviews } from "./tabs/reviews.js";
import { Settings } from "./tabs/settings.js";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "contractors", label: "Contractors" },
  { id: "availability", label: "Availability queue" },
  { id: "introductions", label: "Introductions & Founding" },
  { id: "communications", label: "Communications" },
  { id: "reviews", label: "Review queues" },
  { id: "settings", label: "Settings" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const fromHash = (): TabId => TABS.find((t) => `#${t.id}` === location.hash)?.id ?? "overview";

export function App() {
  const qc = useQueryClient();
  const me = useAdminMe({ query: { retry: false } });
  const logout = useAdminLogout({ mutation: { onSuccess: () => qc.clear() } });
  const [tab, setTab] = useState<TabId>(fromHash());
  useEffect(() => {
    const on = () => setTab(fromHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  if (me.isLoading) return <p className="muted">Loading…</p>;
  const staff = me.data?.data;
  if (me.error || !staff) return <Login />;
  const can = (p: string) => (staff.permissions as string[]).includes(p);

  return (
    <div className="shell">
      <header className="top">
        <strong>LOOP Admin</strong>
        <span className="muted">{staff.email} · {staff.role}</span>
        <button type="button" onClick={() => logout.mutate()}>Sign out</button>
      </header>
      <nav aria-label="Sections">
        {TABS.map((t) => (
          <a key={t.id} href={`#${t.id}`} aria-current={tab === t.id ? "page" : undefined}>{t.label}</a>
        ))}
      </nav>
      <main>
        {tab === "overview" && <Overview />}
        {tab === "contractors" && <Contractors can={can} />}
        {tab === "availability" && <AvailabilityQueue can={can} />}
        {tab === "introductions" && <Introductions can={can} />}
        {tab === "communications" && <Communications can={can} />}
        {tab === "reviews" && <Reviews can={can} />}
        {tab === "settings" && <Settings can={can} />}
      </main>
    </div>
  );
}
