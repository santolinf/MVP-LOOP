import { useState } from "react";
import { AvailabilityBadge } from "@loop/ui";
import { useAdminOverview, type AdminOverviewParams } from "@loop/api-client";
import { errMsg } from "../lib.js";

type Range = NonNullable<AdminOverviewParams["range"]>;
const RANGES: { value: Range; label: string }[] = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "all", label: "All time" },
];
const COLOURS = ["LIME", "ORANGE", "RED", "BLUE", "GREY"] as const;

/** ADM-04: registrations per day. Plain SVG bars: no chart dependency, with a text alternative for screen readers. */
function GrowthChart({ points }: { points: { date: string; count: number }[] }) {
  const max = Math.max(1, ...points.map((p) => p.count));
  const w = 600;
  const h = 140;
  const bar = w / Math.max(1, points.length);
  return (
    <svg viewBox={`0 0 ${w} ${h + 20}`} role="img" aria-label="Registrations per day" className="growth-chart" data-testid="growth-chart">
      {points.map((p, i) => {
        const bh = (p.count / max) * h;
        return (
          <rect key={p.date} x={i * bar + 1} y={h - bh} width={Math.max(1, bar - 2)} height={bh} fill="currentColor">
            <title>{`${p.date}: ${p.count}`}</title>
          </rect>
        );
      })}
      <text x="0" y={h + 14} fontSize="11" fill="currentColor">{points[0]?.date ?? ""}</text>
      <text x={w} y={h + 14} fontSize="11" fill="currentColor" textAnchor="end">{points[points.length - 1]?.date ?? ""}</text>
    </svg>
  );
}

export function Overview() {
  const [range, setRange] = useState<Range>("30");
  const { data, error } = useAdminOverview({ range });
  const o = data?.data;
  if (error) return <p role="alert" className="error">Could not load the overview. {errMsg(error)}</p>;
  if (!o) return <p className="muted">Loading…</p>;
  const tiles: [string, number | string][] = [
    ["Contractors", o.contractors.total],
    ["Live", o.contractors.live],
    ["Paused", o.contractors.paused],
    ["Search-suppressed", o.contractors.searchSuppressed],
    ["Open call tasks", o.queues.openCallTasks],
    ["Referral flags to review", o.queues.openReferralFlags],
    ["Rewards awaiting evidence", o.queues.rewardsAwaitingVerification],
    ["Rewards awaiting approval", o.queues.rewardsAwaitingApproval],
    ["Founding places", `${o.founding.allocated} / ${o.founding.cap}`],
  ];
  return (
    <>
      <h2>Overview</h2>
      <ul className="tiles">
        {tiles.map(([label, value]) => (
          <li key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </li>
        ))}
      </ul>
      <h3>Live contractors by availability</h3>
      <p className="muted">Live contractors only; contractors who are not live are excluded.</p>
      <ul className="tiles" data-testid="availability-tiles">
        {COLOURS.map((colour) => (
          <li key={colour}>
            <strong>{o.colours[colour]}</strong>
            <AvailabilityBadge colour={colour} />
          </li>
        ))}
      </ul>
      <h3>Registrations</h3>
      <div className="row" role="group" aria-label="Registration range">
        {RANGES.map((r) => (
          <button key={r.value} type="button" aria-pressed={range === r.value} className={range === r.value ? "active" : undefined} onClick={() => setRange(r.value)}>
            {r.label}
          </button>
        ))}
      </div>
      <p data-testid="growth-total"><strong>{o.growth.total}</strong> registered {range === "all" ? "in total" : `in the last ${range} days`}</p>
      <GrowthChart points={o.growth.points} />
    </>
  );
}
