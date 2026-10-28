// Deep-link resume: a sign-in may carry a target id, never a URL. Each id maps to a fixed in-site route.

export const RETURN_TARGETS = {
  MY_LOOP: "/my-loop",
  AVAILABILITY: "/my-loop/availability",
  INTRODUCE: "/introduce",
  FOUNDING: "/founding",
  JOIN_CV: "/join/cv",
} as const;

export type ReturnTargetId = keyof typeof RETURN_TARGETS;

export const RETURN_TARGET_IDS = Object.keys(RETURN_TARGETS) as [ReturnTargetId, ...ReturnTargetId[]];

export const DEFAULT_RETURN_ROUTE = RETURN_TARGETS.MY_LOOP;

export function isReturnTargetId(value: unknown): value is ReturnTargetId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(RETURN_TARGETS, value);
}

/** Maps an id to its fixed route; anything unknown falls back to My LOOP. */
export function routeForReturnTarget(value: unknown): string {
  return isReturnTargetId(value) ? RETURN_TARGETS[value] : DEFAULT_RETURN_ROUTE;
}
