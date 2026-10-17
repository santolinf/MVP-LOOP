import { useState } from "react";
import { useGetReferralLink, useListReferrals } from "@loop/api-client";
import { Muted } from "../marketing/primitives";

// Returns null when there is no session so callers can fall back to the join invitation.
export function ReferralLinkCard() {
  const link = useGetReferralLink();
  const list = useListReferrals();
  const [copied, setCopied] = useState(false);

  if (link.isPending) return <Muted>Loading your link…</Muted>;
  const data = link.data?.data;
  if (link.isError || !data) return null;

  const items = list.data?.data.items ?? [];

  async function copy() {
    if (!data) return;
    await navigator.clipboard.writeText(data.url);
    setCopied(true);
  }

  return (
    <div className="mb-6">
      <p className="mb-2 text-sm font-semibold">Your introduction link</p>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <code className="break-all rounded border border-line px-3 py-2 text-sm">{data.url}</code>
        <button type="button" onClick={copy} className="rounded border border-line px-3 py-2 text-sm hover:underline">
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
      <Muted className="text-sm">
        {items.length} introduction{items.length === 1 ? "" : "s"}, {items.filter((i) => i.counted).length} counting
        towards Founding.
      </Muted>
    </div>
  );
}

export function useHasReferralLink() {
  const link = useGetReferralLink();
  return { pending: link.isPending, has: !link.isError && !!link.data?.data };
}
