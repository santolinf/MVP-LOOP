import { Inject, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { prisma } from "@loop/db";
import { decideGoLive, GO_LIVE_PROFILE_FIELD_KEYS, londonDate, preferenceGaps, profileGaps, type GoLiveBlocker } from "@loop/domain";
import type { GoLiveResult, Review } from "@loop/contracts";
import { AuditService } from "../../common/audit.service.js";
import { ConsentService } from "../consent/consent.service.js";
import { ReferralsService } from "../referrals/referrals.service.js";
import { DetailsService } from "./details.service.js";
import { JoinProfileService } from "./join-profile.service.js";
import { ProfileService } from "./profile.service.js";
import { MeService } from "./me.service.js";
import { PreferencesService } from "./preferences.service.js";

const FIELD_LABELS: Record<string, string> = {
  headline: "Headline",
  currentRole: "Current role",
  skill: "Skill",
  location: "Location",
  yearsExperience: "Years of experience",
  summary: "Summary",
  roleDates: "Role dates",
  clearance: "Security clearance",
};

/**
 * TODO(spec): the visibility rules for agencies are not defined yet (agency access is flagged off). Until they
 * are, the review shows the contractor's name, confirmed profile fields, availability and preferences, and
 * states that contact details and the CV file are not shown.
 */
const HIDDEN = ["Email address", "Mobile number", "Your CV file"];

/** Phase 6: the pre-LIVE review and the GO LIVE action. Readiness is decided only by the domain's decideGoLive. */
@Injectable()
export class GoLiveService {
  // Explicit @Inject: the dev runner (tsx/esbuild) does not emit design:paramtypes metadata.
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ConsentService) private readonly consents: ConsentService,
    @Inject(MeService) private readonly me: MeService,
    @Inject(PreferencesService) private readonly preferences: PreferencesService,
    @Inject(ReferralsService) private readonly referrals: ReferralsService,
    @Inject(ProfileService) private readonly profile: ProfileService,
    @Inject(DetailsService) private readonly details: DetailsService,
    @Inject(JoinProfileService) private readonly joinProfile: JoinProfileService,
  ) {}

  private async facts(contractorId: string) {
    const [contractor, fields, eligibility, active, typed, details, join] = await Promise.all([
      prisma.contractor.findUnique({ where: { id: contractorId } }),
      prisma.confirmedProfileField.findMany({ where: { contractorId }, orderBy: { createdAt: "asc" } }),
      prisma.eligibilityDeclaration.count({ where: { contractorId, ukBased: true, rightToWork: true } }),
      this.consents.active(contractorId),
      this.profile.get(contractorId),
      this.details.get(contractorId),
      this.joinProfile.get(contractorId),
    ]);
    if (!contractor) throw new NotFoundException("Contractor not found");
    const decision = decideGoLive({
      firstName: contractor.firstName,
      lastName: contractor.lastName,
      eligibilityDeclared: eligibility > 0,
      availabilityConfirmed: contractor.employmentSituation !== null && contractor.lastConfirmedAt !== null,
      confirmedProfileFields: fields.filter((f) => GO_LIVE_PROFILE_FIELD_KEYS.includes(f.key)).length,
      profileComplete:
        profileGaps({ title: join.title, skillCount: typed.skills.length, location: join.location, locationConfirmed: join.locationConfirmed }).length === 0,
      preferencesComplete:
        preferenceGaps({
          targetDayRatePence: join.targetDayRatePence,
          minDayRatePence: join.minDayRatePence,
          ir35Status: details.ir35Status,
          usesUmbrella: join.usesUmbrella,
          umbrellaProvider: join.umbrellaProvider,
          workLocations: join.workLocations,
          otherLocations: join.otherLocations,
          workLocationsConfirmed: join.workLocationsConfirmed,
          securityClearance: details.securityClearance,
          workPatterns: join.workPatterns,
        }).length === 0,
      activeConsents: active,
    });
    return { contractor, fields, decision };
  }

  async review(contractorId: string, now = new Date()): Promise<Review> {
    const { contractor, fields, decision } = await this.facts(contractorId);
    const me = await this.me.get(contractorId, now);
    return {
      live: contractor.live,
      visible: {
        name: [contractor.firstName, contractor.lastName].filter(Boolean).join(" "),
        profile: fields.map((f) => ({ key: f.key, label: FIELD_LABELS[f.key] ?? f.key, value: f.value })),
        availability: me.availability,
        availableFrom: contractor.availableFrom ? londonDate(contractor.availableFrom) : null,
        preferences: await this.preferences.get(contractorId),
      },
      hidden: HIDDEN,
      consents: (await this.consents.list(contractorId)).items,
      canGoLive: decision.allowed,
      blockers: decision.allowed ? [] : decision.blockers,
    };
  }

  /** Sets `live` only when the domain says every requirement is met. Safe to repeat. */
  async goLive(contractorId: string, now = new Date()): Promise<GoLiveResult> {
    const { contractor, decision } = await this.facts(contractorId);
    if (!decision.allowed) {
      const blockers: GoLiveBlocker[] = decision.blockers;
      throw new UnprocessableEntityException(`Not ready to go live: ${blockers.join(", ")}`);
    }
    if (!contractor.live) {
      // Conditional so two parallel requests record one transition.
      const flipped = await prisma.contractor.updateMany({ where: { id: contractorId, live: false }, data: { live: true } });
      if (flipped.count === 1) {
        await this.audit.record({
          actorId: contractorId,
          entityType: "Contractor",
          entityId: contractorId,
          action: "golive.activated",
          before: { live: false },
          after: { live: true },
        });
      }
    }
    // Completed registration locks the introducer (Phase 9). Idempotent, so a retry repairs a failed first attempt.
    await this.referrals.lockOnRegistration(contractorId, now);
    return { me: await this.me.get(contractorId, now) };
  }
}
