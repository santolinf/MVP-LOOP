import { useAttributeReferral, useGetMe } from "@loop/api-client";
import { useEffect, useRef, useState } from "react";
import { captureReferralFromUrl, clearReferralCode, readReferralCode } from "./referral-capture";

// Captures ?ref= on any page; once a session exists, attributes it exactly once and clears it.
export function ReferralAttribution() {
  const [code, setCode] = useState<string | null>(null);
  const sent = useRef(false);
  useEffect(() => {
    captureReferralFromUrl();
    setCode(readReferralCode());
  }, []);

  const me = useGetMe({ query: { enabled: code !== null } });
  const idempotencyKey = useRef(crypto.randomUUID());
  const attribute = useAttributeReferral({ request: { headers: { "Idempotency-Key": idempotencyKey.current } } });
  const signedIn = me.isSuccess;
  const { mutate } = attribute;

  useEffect(() => {
    if (!code || !signedIn || sent.current) return;
    sent.current = true;
    mutate(
      { data: { code } },
      { onSettled: () => { clearReferralCode(); setCode(null); } },
    );
  }, [code, signedIn, mutate]);

  return null;
}
