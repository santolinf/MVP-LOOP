import { z } from "zod";

// TODO(spec): Phase 5 gives no value lists for preferences; these are proposed and approved in review.
export const WorkTypeSchema = z.enum(["CONTRACT_INSIDE_IR35", "CONTRACT_OUTSIDE_IR35", "FIXED_TERM", "PERMANENT"]);
/** Day-rate bands in GBP. */
export const RateBandSchema = z.enum(["UNDER_300", "R300_400", "R400_500", "R500_600", "R600_750", "OVER_750"]);
export const RemotePreferenceSchema = z.enum(["ONSITE", "HYBRID", "REMOTE"]);
export const RegionSchema = z.enum([
  "LONDON",
  "SOUTH_EAST",
  "SOUTH_WEST",
  "EAST_OF_ENGLAND",
  "WEST_MIDLANDS",
  "EAST_MIDLANDS",
  "NORTH_WEST",
  "NORTH_EAST",
  "YORKSHIRE",
  "WALES",
  "SCOTLAND",
  "NORTHERN_IRELAND",
]);
export const SectorSchema = z.enum([
  "FINANCIAL_SERVICES",
  "PUBLIC_SECTOR",
  "HEALTHCARE",
  "RETAIL",
  "ENERGY_UTILITIES",
  "TELECOMS",
  "MEDIA",
  "MANUFACTURING",
  "TRANSPORT",
  "CONSULTING",
  "OTHER",
]);
export const NoticePeriodSchema = z.enum(["IMMEDIATE", "ONE_WEEK", "TWO_WEEKS", "FOUR_WEEKS", "EIGHT_WEEKS", "TWELVE_WEEKS"]);

const distinct = <T extends z.ZodTypeAny>(item: T, max: number) =>
  z.array(item).max(max).refine((a) => new Set(a).size === a.length, "Duplicate values");

export const PreferencesSchema = z.object({
  workTypes: distinct(WorkTypeSchema, 4),
  rateBand: RateBandSchema.nullable(),
  remote: RemotePreferenceSchema.nullable(),
  regions: distinct(RegionSchema, 12),
  sectors: distinct(SectorSchema, 11),
  noticePeriod: NoticePeriodSchema.nullable(),
});
export type Preferences = z.infer<typeof PreferencesSchema>;

/** PUT replaces the whole preference set; unknown keys are rejected. */
export const UpdatePreferencesRequestSchema = PreferencesSchema.strict();
export type UpdatePreferencesRequest = z.infer<typeof UpdatePreferencesRequestSchema>;
