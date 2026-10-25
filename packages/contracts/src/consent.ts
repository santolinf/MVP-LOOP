import { z } from "zod";
import { MeSchema } from "./me.js";
import { PreferencesSchema } from "./preferences.js";

/** Mirrors CONSENT_PURPOSES in @loop/domain. */
export const ConsentPurposeSchema = z.enum(["PROFILE_VISIBILITY", "OPERATIONAL_EMAIL", "LOOP_MARKETING", "PARTNER_MARKETING"]);
export type ConsentPurposeValue = z.infer<typeof ConsentPurposeSchema>;

export const ConsentItemSchema = z.object({
  purpose: ConsentPurposeSchema,
  /** Whether the contractor currently consents. False until they actively tick the box. */
  granted: z.boolean(),
  required: z.boolean(),
  /** Current wording and its version; send this version back when granting. */
  wordingVersion: z.string(),
  wording: z.string(),
  grantedAt: z.string().datetime().nullable().meta({ type: "string", nullable: true } as never),
});
export type ConsentItem = z.infer<typeof ConsentItemSchema>;

export const ConsentListSchema = z.object({ items: z.array(ConsentItemSchema) });
export type ConsentList = z.infer<typeof ConsentListSchema>;

/**
 * Sets one or more purposes. `wordingVersion` must be the version the contractor was shown; a stale page is
 * refused (409) so nobody consents to text they have not seen. Withdrawing needs no version.
 */
export const UpdateConsentsRequestSchema = z
  .object({
    changes: z
      .array(
        z
          .object({
            purpose: ConsentPurposeSchema,
            granted: z.boolean(),
            wordingVersion: z.string().min(1).max(32).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(4),
  })
  .strict()
  .refine((v) => new Set(v.changes.map((c) => c.purpose)).size === v.changes.length, "Each purpose may appear once")
  .refine((v) => v.changes.every((c) => !c.granted || c.wordingVersion), "wordingVersion is required when granting");
export type UpdateConsentsRequest = z.infer<typeof UpdateConsentsRequestSchema>;

export const GoLiveBlockerSchema = z.enum([
  "NAME_MISSING",
  "ELIGIBILITY_MISSING",
  "AVAILABILITY_NOT_CONFIRMED",
  "PROFILE_FIELD_MISSING",
  "CONSENT_PROFILE_VISIBILITY",
  "CONSENT_OPERATIONAL_EMAIL",
]);
export type GoLiveBlockerValue = z.infer<typeof GoLiveBlockerSchema>;

export const VisibleFieldSchema = z.object({ key: z.string(), label: z.string(), value: z.string() });

/** Exactly what an approved agency would see once LIVE. Built from the same data the search view will use. */
export const ReviewSchema = z.object({
  live: z.boolean(),
  /** What will be visible, and nothing else. */
  visible: z.object({
    name: z.string(),
    profile: z.array(VisibleFieldSchema),
    availability: MeSchema.shape.availability,
    availableFrom: z.string().date().nullable(),
    preferences: PreferencesSchema,
  }),
  /** Details deliberately not shown to agencies. */
  hidden: z.array(z.string()),
  consents: z.array(ConsentItemSchema),
  /** Computed by the domain; the client only displays it. */
  canGoLive: z.boolean(),
  blockers: z.array(GoLiveBlockerSchema),
});
export type Review = z.infer<typeof ReviewSchema>;

export const GoLiveResultSchema = z.object({ me: MeSchema });
export type GoLiveResult = z.infer<typeof GoLiveResultSchema>;

/**
 * Details the contractor types themselves (for example when the CV could not be read). Stored as
 * contractor-confirmed profile fields; never mixed with AI output (A5).
 */
export const ManualProfileSchema = z
  .object({
    headline: z.string().trim().min(1).max(200).nullable(),
    skills: z.array(z.string().trim().min(1).max(60)).max(20),
  })
  .strict();
export type ManualProfile = z.infer<typeof ManualProfileSchema>;
