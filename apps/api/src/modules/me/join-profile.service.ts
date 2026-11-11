import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@loop/db";
import { EMPTY_JOIN_PROFILE, JoinProfileSchema, type JoinProfile } from "@loop/contracts";
import { AuditService } from "../../common/audit.service.js";
import { ProfileService } from "./profile.service.js";

type Row = NonNullable<Awaited<ReturnType<typeof prisma.contractorJoinProfile.findUnique>>>;

const day = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

/** Legacy rows only have the free-text field; split it so earlier answers become individual places and nothing is lost. */
const splitPlaces = (text: string | null): string[] =>
  (text ?? "")
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 20);

const placesFrom = (r: Row): string[] =>
  r.otherPlaces.length > 0 ? r.otherPlaces : splitPlaces(r.otherLocations);

/** Rows are written only through validated requests; parsing again guards against hand-edited data. */
function toJoinProfile(r: Row | null): JoinProfile {
  if (!r) return EMPTY_JOIN_PROFILE;
  const parsed = JoinProfileSchema.safeParse({
    // The title is the confirmed headline; it is merged in by the service, never read from this row.
    title: null,
    preferredRoles: r.preferredRoles,
    additionalRoles: r.additionalRoles,
    linkedinUrl: r.linkedinUrl,
    location: r.location,
    locationConfirmed: r.locationConfirmed,
    noticePeriodText: r.noticePeriodText,
    earliestStartDate: day(r.earliestStartDate),
    targetDayRatePence: r.targetDayRatePence,
    minDayRatePence: r.minDayRatePence,
    usesUmbrella: r.usesUmbrella,
    umbrellaProvider: r.umbrellaProvider,
    workLocations: r.workLocations,
    otherLocations: r.otherLocations,
    otherPlaces: placesFrom(r),
    londonAreas: r.londonAreas,
    londonOther: r.londonOther,
    workLocationsConfirmed: r.workLocationsConfirmed,
    remoteUk: r.remoteUk,
    workPatterns: r.workPatterns,
    hybridDays: r.hybridDays,
    occasionalTravel: r.occasionalTravel,
  });
  return parsed.success ? parsed.data : EMPTY_JOIN_PROFILE;
}

/**
 * V33 registration answers (profile review and contract preferences). The professional title is stored as the
 * contractor-confirmed `headline` field, the same row the typed headline uses, so there is one source for it.
 * Saving here is never an availability confirmation.
 */
@Injectable()
export class JoinProfileService {
  // Explicit @Inject: the dev runner (tsx/esbuild) does not emit design:paramtypes metadata.
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ProfileService) private readonly profile: ProfileService,
  ) {}

  private async headline(contractorId: string): Promise<string | null> {
    const row = await prisma.confirmedProfileField.findFirst({
      where: { contractorId, extractionRunId: `manual:${contractorId}`, key: "headline" },
    });
    return row?.value ?? null;
  }

  async get(contractorId: string): Promise<JoinProfile> {
    const [row, title] = await Promise.all([
      prisma.contractorJoinProfile.findUnique({ where: { contractorId } }),
      this.headline(contractorId),
    ]);
    return { ...toJoinProfile(row), title };
  }

  /** Replaces the whole set. The title is written through the profile service as the headline. Naturally idempotent. */
  async replace(contractorId: string, req: JoinProfile): Promise<JoinProfile> {
    const exists = await prisma.contractor.findUnique({ where: { id: contractorId }, select: { id: true } });
    if (!exists) throw new NotFoundException("Contractor not found");
    const before = await this.get(contractorId);
    const { title, earliestStartDate, ...rest } = req;
    // Places are the structured source; the legacy text mirrors them so older readers (admin, export) still see the answer.
    // An older client sends only the free text: split it so its answer still becomes places.
    const places = [...new Set(rest.otherPlaces.length > 0 ? rest.otherPlaces.map((p) => p.trim()).filter(Boolean) : splitPlaces(rest.otherLocations))].slice(0, 20);
    const data = { ...rest, otherPlaces: places, otherLocations: places.length > 0 ? places.join(", ").slice(0, 200) : null, earliestStartDate: earliestStartDate ? new Date(`${earliestStartDate}T00:00:00Z`) : null };
    if (title !== before.title) {
      const typed = await this.profile.get(contractorId);
      await this.profile.replace(contractorId, { headline: title, skills: typed.skills });
    }
    await prisma.contractorJoinProfile.upsert({ where: { contractorId }, create: { contractorId, ...data }, update: data });
    const after = await this.get(contractorId);
    await this.audit.record({
      actorId: contractorId,
      entityType: "Contractor",
      entityId: contractorId,
      action: "profile.join.updated",
      before,
      after,
    });
    return after;
  }
}
