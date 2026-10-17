import { useGetFoundingStatus, useListRewards } from "@loop/api-client";
import { Muted } from "../marketing/primitives";

export function RewardsFoundingCard() {
  const founding = useGetFoundingStatus();
  const rewards = useListRewards();
  const f = founding.data?.data;
  const items = rewards.data?.data.items ?? [];

  return (
    <>
      <h2 className="mb-2 text-xl font-semibold">Rewards and Founding status</h2>
      {f ? (
        <p className="mb-3">
          {f.place !== null
            ? `Founding Contractor #${f.place}`
            : f.eligible
              ? "You qualify for Founding Membership."
              : `${Math.min(f.registeredReferrals, f.required)} of ${f.required} introductions registered${f.isCurrentProfile ? "" : " — confirm your availability to stay current"}.`}
        </p>
      ) : (
        <Muted className="mb-3">Founding status unavailable.</Muted>
      )}
      {items.length === 0 ? (
        <Muted>No rewards yet. Rewards appear once an introduction completes agency-verified service.</Muted>
      ) : (
        <ul className="space-y-1 text-sm">
          {items.map((r) => (
            <li key={r.id}>
              {r.type} — {r.status}
              {r.amountPence !== null ? ` — £${(r.amountPence / 100).toFixed(2)}` : ""}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
