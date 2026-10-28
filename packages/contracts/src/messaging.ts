import { z } from "zod";

/** Phase 8: LOOP team messages and system notifications are separate stores, both shown in My LOOP. */
export const LoopMessageSchema = z.object({
  id: z.string(),
  subject: z.string(),
  body: z.string(),
  createdAt: z.string().datetime(),
  read: z.boolean(),
});
export type LoopMessage = z.infer<typeof LoopMessageSchema>;

export const LoopMessageListSchema = z.object({ items: z.array(LoopMessageSchema), unreadCount: z.number().int() });
export type LoopMessageList = z.infer<typeof LoopMessageListSchema>;

export const NotificationKindSchema = z.enum(["REMINDER", "CONFIRMATION", "SECURITY"]);

export const NotificationSchema = z.object({
  id: z.string(),
  kind: NotificationKindSchema,
  title: z.string(),
  body: z.string(),
  /** In-site return target id (see RETURN_TARGETS), never a URL. */
  target: z.string().nullable().meta({ type: "string", nullable: true } as never), // OpenAPI 3.0 form; keeps Orval from emitting string[]
  createdAt: z.string().datetime(),
  read: z.boolean(),
});
export type Notification = z.infer<typeof NotificationSchema>;

export const NotificationListSchema = z.object({ items: z.array(NotificationSchema), unreadCount: z.number().int() });
export type NotificationList = z.infer<typeof NotificationListSchema>;

/** The token comes from the emailed link. It is the only credential, so it is never logged. */
export const RedeemConfirmLinkRequestSchema = z.object({ token: z.string().min(20).max(200) }).strict();
export type RedeemConfirmLinkRequest = z.infer<typeof RedeemConfirmLinkRequestSchema>;

/**
 * A link can only confirm "still the same". Any other outcome tells the client to send the contractor through
 * sign-in and on to the availability page; the reason is for wording only and reveals no profile data.
 */
export const RedeemConfirmLinkResultSchema = z.object({
  outcome: z.enum(["CONFIRMED", "SIGN_IN_REQUIRED"]),
  reason: z.enum(["INVALID", "USED", "EXPIRED", "FACTS_CHANGED", "END_DATE_PASSED"]).nullable(),
  returnTarget: z.enum(["AVAILABILITY"]).nullable(),
});
export type RedeemConfirmLinkResult = z.infer<typeof RedeemConfirmLinkResultSchema>;
