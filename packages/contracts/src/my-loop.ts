import { z } from "zod";

const nullableString = () => z.string().nullable().meta({ type: "string", nullable: true } as never); // OpenAPI 3.0 form; keeps Orval from emitting string[]

/** Mirrors the Phase 7 enums in @loop/domain. */
export const SecurityClearanceSchema = z.enum(["YES", "NO"]);
export const Ir35StatusSchema = z.enum(["INSIDE", "OUTSIDE", "EITHER", "UNSURE"]);
export const WorkPatternSchema = z.enum(["FULL_TIME", "PART_TIME", "FLEXIBLE"]);

/** PUT replaces the whole set; unknown keys are rejected. Rates stay in preferences (rateBand). */
export const ProfileDetailsSchema = z
  .object({
    securityClearance: SecurityClearanceSchema.nullable(),
    ir35Status: Ir35StatusSchema.nullable(),
    workPattern: WorkPatternSchema.nullable(),
  })
  .strict();
export type ProfileDetails = z.infer<typeof ProfileDetailsSchema>;

/** Same limits as registration (RegisterRequest names). */
export const UpdateNameRequestSchema = z
  .object({ firstName: z.string().trim().min(1).max(80), lastName: z.string().trim().min(1).max(80) })
  .strict();
export type UpdateNameRequest = z.infer<typeof UpdateNameRequestSchema>;

export const NameSchema = z.object({ firstName: z.string(), lastName: z.string() });

// ---- Assignments -----------------------------------------------------------------------------

export const AssignmentInputSchema = z
  .object({
    clientName: z.string().trim().min(1).max(120),
    supplyingCompany: z.string().trim().min(1).max(120).nullable(),
    role: z.string().trim().min(1).max(120),
    startDate: z.string().date(),
    endDate: z.string().date().nullable(),
    assignmentRef: z.string().trim().min(1).max(60).nullable(),
  })
  .strict();
export type AssignmentInput = z.infer<typeof AssignmentInputSchema>;

export const AssignmentSchema = AssignmentInputSchema.extend({ id: z.string() });
export type Assignment = z.infer<typeof AssignmentSchema>;

export const AssignmentListSchema = z.object({ items: z.array(AssignmentSchema) });
export type AssignmentList = z.infer<typeof AssignmentListSchema>;

// ---- CV versions -----------------------------------------------------------------------------

export const CvVersionSchema = z.object({
  id: z.string(),
  versionNumber: z.number().int(),
  uploadId: z.string(),
  createdAt: z.string().datetime(),
  pendingChanges: z.number().int(),
});
export const CvVersionListSchema = z.object({ items: z.array(CvVersionSchema) });
export type CvVersionList = z.infer<typeof CvVersionListSchema>;

export const CvChangeSchema = z.object({
  id: z.string(),
  cvVersionId: z.string(),
  key: z.string(),
  kind: z.enum(["ADDED", "REMOVED", "CHANGED"]),
  /** Roles, dates, skills and clearance; the UI must make the contractor look at these. */
  material: z.boolean(),
  previousValue: nullableString(),
  proposedValue: nullableString(),
  proposedExcerpt: nullableString(),
});
export type CvChange = z.infer<typeof CvChangeSchema>;
export const CvChangeListSchema = z.object({ items: z.array(CvChangeSchema) });
export type CvChangeList = z.infer<typeof CvChangeListSchema>;

export const ResolveCvChangeRequestSchema = z.object({ decision: z.enum(["ACCEPT", "REJECT"]) }).strict();
export type ResolveCvChangeRequest = z.infer<typeof ResolveCvChangeRequestSchema>;

// ---- Privacy ---------------------------------------------------------------------------------

export const DeleteAccountRequestSchema = z.object({ confirm: z.literal(true) }).strict();
export type DeleteAccountRequest = z.infer<typeof DeleteAccountRequestSchema>;

export const PrivacyResultSchema = z.object({ status: z.enum(["PAUSED", "ACTIVE", "WITHDRAWN", "ERASURE_REQUESTED", "CV_DELETED"]) });
export type PrivacyResult = z.infer<typeof PrivacyResultSchema>;

/** Self-describing export; sections are plain JSON so it stays readable. */
export const DataExportSchema = z.object({
  exportedAt: z.string().datetime(),
  data: z.record(z.string(), z.unknown()),
});
export type DataExport = z.infer<typeof DataExportSchema>;
