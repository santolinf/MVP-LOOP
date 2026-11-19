import { z } from "zod";

// OpenAPI 3.0 nullable form; keeps Orval from emitting string[] / unions.
const nullableDate = () => z.string().date().nullable().meta({ type: "string", format: "date", nullable: true } as never);
const nullableBool = () => z.boolean().nullable().meta({ type: "boolean", nullable: true } as never);

/** Mirrors WORK_LOCATIONS, LONDON_AREAS and WORK_PATTERNS in @loop/domain. */
export const WorkLocationSchema = z.enum([
  "ANYWHERE",
  "LONDON",
  "SOUTH_EAST",
  "SOUTH_WEST",
  "MIDLANDS",
  "NORTH_WEST",
  "NORTH_EAST",
  "YORKSHIRE",
  "SCOTLAND",
  "WALES",
  "NORTHERN_IRELAND",
]);
export const LondonAreaSchema = z.enum(["ANYWHERE_LONDON", "CENTRAL", "NORTH", "SOUTH", "EAST", "WEST"]);
export const WorkPatternChoiceSchema = z.enum(["REMOTE", "HYBRID", "ONSITE"]);

export const OccasionalTravelSchema = z.enum(["YES", "NO", "DEPENDS"]);

const distinct = <T extends z.ZodTypeAny>(item: T, max: number) =>
  z.array(item).max(max).refine((a) => new Set(a).size === a.length, "Duplicate values");

/** The max day rate accepted, in pence (GBP 5,000). Money is always integer pence. */
export const MAX_DAY_RATE_PENCE = 500_000;

/**
 * Everything the V33 registration journey collects that is not already a typed headline/skills, security
 * clearance or IR35 status. PUT replaces the whole set; unknown keys are rejected. Completeness is decided by
 * the domain at GO LIVE, so a partly filled set can be saved.
 */
export const JoinProfileSchema = z
  .object({
    /** Professional title. Also stored as the confirmed headline. */
    title: z.string().trim().min(1).max(200).nullable().meta({ type: "string", nullable: true } as never),
    preferredRoles: z.array(z.string().trim().min(1).max(120)).max(3),
    additionalRoles: z.string().trim().min(1).max(300).nullable().meta({ type: "string", nullable: true } as never),
    linkedinUrl: z.string().trim().url().max(300).nullable().meta({ type: "string", nullable: true } as never),
    location: z.string().trim().min(1).max(120).nullable().meta({ type: "string", nullable: true } as never),
    locationConfirmed: z.boolean(),
    /** Free text such as "4 weeks"; only asked of permanent employees. */
    noticePeriodText: z.string().trim().min(1).max(60).nullable().meta({ type: "string", nullable: true } as never),
    /** Earliest possible start (permanent employees). Contractors between contracts use availableFrom on /me. */
    earliestStartDate: nullableDate(),
    targetDayRatePence: z.number().int().min(1).max(MAX_DAY_RATE_PENCE).nullable().meta({ type: "integer", nullable: true } as never),
    minDayRatePence: z.number().int().min(1).max(MAX_DAY_RATE_PENCE).nullable().meta({ type: "integer", nullable: true } as never),
    usesUmbrella: nullableBool(),
    umbrellaProvider: z.string().trim().min(1).max(120).nullable().meta({ type: "string", nullable: true } as never),
    workLocations: distinct(WorkLocationSchema, 11),
    otherLocations: z.string().trim().min(1).max(200).nullable().meta({ type: "string", nullable: true } as never),
    /** Individually chosen additional towns/cities. Optional on input so older clients keep working; `otherLocations` is derived from it. */
    otherPlaces: distinct(z.string().trim().min(1).max(60), 20).default([]),
    londonAreas: distinct(LondonAreaSchema, 6),
    londonOther: z.string().trim().min(1).max(200).nullable().meta({ type: "string", nullable: true } as never),
    workLocationsConfirmed: z.boolean(),
    remoteUk: nullableBool(),
    workPatterns: distinct(WorkPatternChoiceSchema, 3),
    hybridDays: z.number().int().min(1).max(4).nullable().meta({ type: "integer", nullable: true } as never),
    /** Occasional travel for client meetings. Null = not answered; never assume willingness to travel. */
    occasionalTravel: OccasionalTravelSchema.nullable().default(null).meta({ type: "string", enum: ["YES", "NO", "DEPENDS"], nullable: true } as never),
  })
  .strict();
export type JoinProfile = z.infer<typeof JoinProfileSchema>;

export const EMPTY_JOIN_PROFILE: JoinProfile = {
  title: null,
  preferredRoles: [],
  additionalRoles: null,
  linkedinUrl: null,
  location: null,
  locationConfirmed: false,
  noticePeriodText: null,
  earliestStartDate: null,
  targetDayRatePence: null,
  minDayRatePence: null,
  usesUmbrella: null,
  umbrellaProvider: null,
  workLocations: [],
  otherLocations: null,
  otherPlaces: [],
  londonAreas: [],
  londonOther: null,
  workLocationsConfirmed: false,
  remoteUk: null,
  workPatterns: [],
  hybridDays: null,
  occasionalTravel: null,
};
