import { useAttributeReferral, useGetMe } from "@loop/api-client";
import { useEffect, useRef, useState } from "react";
import { uuid } from "../../lib/uuid";
import { captureReferralFromUrl, clearReferralCode, readReferralCode } from "./referral-capture";

// Captures ?ref= on any page; once a session exists, attributes it and clears it. This is the fallback: registration
// already sends the code with the account (B5). The code is cleared only once the server has answered, so a failed
// call (network, rate limit, 5xx) is retried on the next page load instead of losing the introduction.
export function ReferralAttribution() {
  const [code, setCode] = useState<string | null>(null);
  const sent = useRef(false);
  useEffect(() => {
    captureReferralFromUrl();
    setCode(readReferralCode());
  }, []);

  const me = useGetMe({ query: { enabled: code !== null } });
  const idempotencyKey = useRef(uuid());
  const attribute = useAttributeReferral({ request: { headers: { "Idempotency-Key": idempotencyKey.current } } });
  const signedIn = me.isSuccess;
  const { mutate } = attribute;

  useEffect(() => {
    if (!code || !signedIn || sent.current) return;
    sent.current = true;
    mutate(
      { data: { code } },
      { onSuccess: () => { clearReferralCode(); setCode(null); } },
    );
  }, [code, signedIn, mutate]);

  return null;
}
