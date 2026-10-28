import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useGetReferralLink, useListReferrals } from "@loop/api-client";
import { Muted } from "../marketing/primitives";

// Returns null when there is no session so callers can fall back to the join invitation.
export function ReferralLinkCard() {
  const link = useGetReferralLink();
  const list = useListReferrals();
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState<string | null>(null);

  const url = link.data?.data.url;
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    QRCode.toDataURL(url, { margin: 1, width: 192 })
      .then((d) => !cancelled && setQr(d))
      .catch(() => !cancelled && setQr(null));
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (link.isPending) return <Muted>Loading your link…</Muted>;
  const data = link.data?.data;
  if (link.isError || !data) return null;

  const items = list.data?.data.items ?? [];
  const lifetime = list.data?.data.lifetimeCount ?? 0;
  const reviewing = items.filter((i) => i.underReview).length;

  async function copy() {
    if (!data) return;
    await navigator.clipboard.writeText(data.url);
    setCopied(true);
  }

  return (
    <div className="mb-6">
      <p className="mb-2 text-sm font-semibold">Your introduction link</p>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <code className="break-all rounded-xl border border-[#2b3747] bg-card-grad px-3 py-2 text-sm">{data.url}</code>
        <button type="button" onClick={copy} className="rounded-full border border-[#465366] px-4 py-2 text-sm font-extrabold hover:text-lime">
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
      {qr && (
        <img src={qr} width={192} height={192} alt="QR code for your introduction link" className="mb-3 rounded-lg bg-white p-1" />
      )}
      <Muted className="text-sm">
        {lifetime} introduction{lifetime === 1 ? "" : "s"} counted so far.
        {lifetime >= 5 ? " You've reached the five-introduction milestone, and every further introduction still counts." : " Five is a milestone, not a limit."}
        {reviewing > 0 ? ` ${reviewing} ${reviewing === 1 ? "is" : "are"} being checked before counting.` : ""}
      </Muted>
    </div>
  );
}

export function useHasReferralLink() {
  const link = useGetReferralLink();
  return { pending: link.isPending, has: !link.isError && !!link.data?.data };
}
