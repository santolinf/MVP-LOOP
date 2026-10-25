import { useAdminOverview } from "@loop/api-client";

export function Overview() {
  const { data, error } = useAdminOverview();
  const o = data?.data;
  if (error) return <p role="alert" className="error">Could not load the overview.</p>;
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
      <ul className="tiles">
        {Object.entries(o.colours).map(([colour, n]) => (
          <li key={colour}>
            <strong>{n}</strong>
            <span>{colour}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
