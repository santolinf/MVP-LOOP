import { useMe } from "../my-loop/use-me";
import { COPY } from "../../lib/copy";

export const JOIN_PATH = "/join";

// Prerendered HTML is always the logged-out variant; the swap happens after hydration.
// TODO(spec): signed-in invite target is /introduce (hosts the referral link card); confirm vs /my-loop.
export const INVITE_PATH = "/introduce";

export function useSignedIn(): boolean {
  const { me } = useMe();
  return me !== undefined;
}

export function useInviteCta() {
  const signedIn = useSignedIn();
  return signedIn
    ? { to: INVITE_PATH, label: COPY.home.rewards.ctaIn }
    : { to: JOIN_PATH, label: COPY.home.rewards.ctaOut };
}
