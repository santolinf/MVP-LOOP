import type { ReturnTargetIdValue } from "@loop/contracts";

/** Routes a sign-in may resume at. Mirrors RETURN_TARGETS in @loop/domain; the server resolves the signed id, never a URL. */
const TARGET_BY_ROUTE: Record<string, ReturnTargetIdValue> = {
  "/my-loop": "MY_LOOP",
  "/my-loop/availability": "AVAILABILITY",
  "/introduce": "INTRODUCE",
  "/founding": "FOUNDING",
  "/join/cv": "JOIN_CV",
};

export const SIGN_IN_PATH = "/sign-in";
export const DEFAULT_SIGNED_IN_PATH = "/my-loop";

/** The return target for a route, or null when that route is not allow-listed. */
export function returnTargetFor(route: string | null | undefined): ReturnTargetIdValue | null {
  return route && Object.prototype.hasOwnProperty.call(TARGET_BY_ROUTE, route) ? (TARGET_BY_ROUTE[route] ?? null) : null;
}

/** `/sign-in`, carrying the current route as `?next=` only when it can be resumed. */
export function signInPathFor(route: string | null | undefined): string {
  return returnTargetFor(route) && route ? `${SIGN_IN_PATH}?next=${encodeURIComponent(route)}` : SIGN_IN_PATH;
}
