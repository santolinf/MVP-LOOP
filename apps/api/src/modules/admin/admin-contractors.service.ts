import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@loop/db";
import { describeAvailability, londonDate, phoneSearchVariants, type FreshnessThresholds } from "@loop/domain";
import type {
  AdminConfirmOnBehalfSchema,
  AdminContractorDetail,
  AdminContractorRow,
  AdminQueueSchema,
  AdminResolveCallTaskSchema,
  AdminSendMessageSchema,
} from "@loop/contracts";
import type { z } from "zod";
import { AuditService } from "../../common/audit.service.js";
import { loadFreshnessThresholds } from "../../common/freshness-config.js";
import { StorageService } from "../cv/storage.service.js";
import { InboxService } from "../messaging/inbox.service.js";
import { MeService, factsFor } from "../me/me.service.js";
import type { StaffPrincipal } from "./staff-access.js";

type Contractor = NonNullable<Awaited<ReturnType<typeof prisma.contractor.findUnique>>>;
type Page = { page: number; pageSize: number };
type Queue = z.infer<typeof AdminQueueSchema>;

const dateOnly = (d: Date | null): string | null => (d ? londonDate(d) : null);
const iso = (d: Date | null): string | null => d?.toISOString() ?? null;
const fullName = (c: { firstName: string | null; lastName: string | null } | undefined): string | null =>
  c ? [c.firstName, c.lastName].filter(Boolean).join(" ") || null : null;

/** Colour and label come from the domain (rule 13): the admin client never calculates them. */
export function toRow(c: Contractor, thresholds: FreshnessThresholds, now: Date): AdminContractorRow {
  const a = describeAvailability(factsFor(c, now), thresholds, now);
  return {
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    live: c.live,
    paused: c.paused,
    searchSuppressed: c.searchSuppressed,
    colour: a.colour,
    label: a.label,
    lastConfirmedAt: iso(c.lastConfirmedAt),
    confirmationSource: c.confirmationSource,
    foundingPlace: c.foundingPlace,
  };
}

@Injectable()
export class AdminContractorsService {
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(MeService) private readonly me: MeService,
    @Inject(InboxService) private readonly inbox: InboxService,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  /** ids of contractors whose confirmed profile text (skills, headline) or join profile matches the operator's filters. */
  private async profileFilterIds(q: { role?: string; skill?: string; location?: string; ir35?: string }): Promise<string[] | null> {
    const sets: string[][] = [];
    const ids = (rows: { contractorId: string | null }[]) => rows.flatMap((r) => (r.contractorId ? [r.contractorId] : []));
    if (q.skill) {
      sets.push(ids(await prisma.confirmedProfileField.findMany({ where: { key: "skill", value: { contains: q.skill, mode: "insensitive" } }, select: { contractorId: true }, distinct: ["contractorId"] })));
    }
    if (q.role) {
      const [fromHeadline, fromJoin] = await Promise.all([
        prisma.confirmedProfileField.findMany({ where: { key: "headline", value: { contains: q.role, mode: "insensitive" } }, select: { contractorId: true }, distinct: ["contractorId"] }),
        prisma.contractorJoinProfile.findMany({ select: { contractorId: true, preferredRoles: true, additionalRoles: true } }),
      ]);
      const needle = q.role.toLowerCase();
      const roleHits = fromJoin
        .filter((j) => j.preferredRoles.some((r) => r.toLowerCase().includes(needle)) || (j.additionalRoles ?? "").toLowerCase().includes(needle))
        .map((j) => j.contractorId);
      sets.push([...ids(fromHeadline), ...roleHits]);
    }
    if (q.location) {
      // INV-01: Location matches the home city OR any saved working place (towns, London areas, free text), never just home.
      const has = { contains: q.location, mode: "insensitive" as const };
      const needle = q.location.toLowerCase();
      const rows = await prisma.contractorJoinProfile.findMany({
        where: { OR: [{ location: has }, { otherLocations: has }, { londonOther: has }] },
        select: { contractorId: true },
      });
      const arrays = await prisma.contractorJoinProfile.findMany({ select: { contractorId: true, otherPlaces: true, workLocations: true, londonAreas: true } });
      const arrayHits = arrays
        .filter((j) => [...j.otherPlaces, ...j.workLocations, ...j.londonAreas].some((v) => v.toLowerCase().replace(/_/g, " ").includes(needle)))
        .map((j) => j.contractorId);
      sets.push([...new Set([...rows.map((r) => r.contractorId), ...arrayHits])]);
    }
    if (q.ir35) {
      sets.push((await prisma.contractorProfileDetails.findMany({ where: { ir35Status: q.ir35 }, select: { contractorId: true } })).map((r) => r.contractorId));
    }
    if (sets.length === 0) return null;
    return sets.reduce((acc, set) => acc.filter((id) => set.includes(id)), sets[0] ?? []);
  }

  async list(q: { q?: string; live?: "true" | "false"; colour?: string; role?: string; skill?: string; location?: string; ir35?: string } & Page, now = new Date()) {
    const term = q.q?.trim();
    // ADM-02: a phone copied in national, 0044 or spaced form must match the stored E.164 value.
    const phones = term ? phoneSearchVariants(term) : [];
    const filterIds = await this.profileFilterIds(q);
    const where = {
      erasedAt: null,
      ...(q.live ? { live: q.live === "true" } : {}),
      ...(q.colour ? { searchColour: q.colour } : {}),
      ...(filterIds ? { id: { in: filterIds } } : {}),
      ...(term
        ? {
            OR: [
              { firstName: { contains: term, mode: "insensitive" as const } },
              { lastName: { contains: term, mode: "insensitive" as const } },
              { email: { contains: term, mode: "insensitive" as const } },
              ...phones.map((p) => ({ phone: { contains: p } })),
            ],
          }
        : {}),
    };
    const [rows, total, thresholds] = await Promise.all([
      prisma.contractor.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      prisma.contractor.count({ where }),
      loadFreshnessThresholds(),
    ]);
    const idList = rows.map((r) => r.id);
    const [join, details, titles] = idList.length
      ? await Promise.all([
          prisma.contractorJoinProfile.findMany({ where: { contractorId: { in: idList } } }),
          prisma.contractorProfileDetails.findMany({ where: { contractorId: { in: idList } } }),
          prisma.confirmedProfileField.findMany({ where: { contractorId: { in: idList }, key: "headline" } }),
        ])
      : [[], [], []];
    const joinBy = new Map(join.map((j) => [j.contractorId, j]));
    const detailBy = new Map(details.map((d) => [d.contractorId, d]));
    const titleBy = new Map(titles.map((t) => [t.contractorId, t.value]));
    return {
      items: rows.map((c) => ({
        ...toRow(c, thresholds, now),
        title: titleBy.get(c.id) ?? null,
        location: joinBy.get(c.id)?.location ?? null,
        targetDayRatePence: joinBy.get(c.id)?.targetDayRatePence ?? null,
        ir35Status: detailBy.get(c.id)?.ir35Status ?? null,
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  private async profile(id: string, c: Contractor): Promise<AdminContractorDetail["profile"]> {
    const [join, details, fields, cv] = await Promise.all([
      prisma.contractorJoinProfile.findUnique({ where: { contractorId: id } }),
      prisma.contractorProfileDetails.findUnique({ where: { contractorId: id } }),
      prisma.confirmedProfileField.findMany({ where: { contractorId: id, key: { in: ["headline", "skill"] } }, orderBy: { fieldId: "asc" } }),
      this.latestCv(id),
    ]);
    return {
      title: fields.find((f) => f.key === "headline")?.value ?? null,
      summary: details?.summary ?? null,
      skills: fields.filter((f) => f.key === "skill").map((f) => f.value),
      preferredRoles: join?.preferredRoles ?? [],
      location: join?.location ?? null,
      workLocations: join?.workLocations ?? [],
      otherPlaces: join?.otherPlaces ?? [],
      londonAreas: join?.londonAreas ?? [],
      remoteUk: join?.remoteUk ?? null,
      londonOther: join?.londonOther ?? null,
      includeHomeCity: join?.includeHomeCity ?? true,
      workPatterns: join?.workPatterns ?? [],
      hybridDays: join?.hybridDays ?? null,
      occasionalTravel: join?.occasionalTravel ?? null,
      targetDayRatePence: join?.targetDayRatePence ?? null,
      minDayRatePence: join?.minDayRatePence ?? null,
      ir35Status: details?.ir35Status ?? null,
      noticePeriodText: join?.noticePeriodText ?? null,
      securityClearance: details?.securityClearance ?? null,
      cvVersion: cv?.versionNumber ?? null,
      hasCv: cv !== null,
      hasPhoto: Boolean(c.photoKey),
    };
  }

  /** Newest CV version whose file is READY (a rejected or pending upload is never offered). */
  private async latestCv(id: string) {
    const versions = await prisma.cvVersion.findMany({ where: { contractorId: id }, orderBy: { versionNumber: "desc" } });
    for (const v of versions) {
      const upload = await prisma.cvUpload.findUnique({ where: { id: v.cvUploadId } });
      if (upload?.status === "READY" && upload.objectKey && upload.detectedType) return { versionNumber: v.versionNumber, upload };
    }
    return null;
  }

  /** Short-lived link to the contractor's current CV. The access itself is audited. */
  async cvLink(id: string, staff: StaffPrincipal) {
    await this.exists(id);
    const cv = await this.latestCv(id);
    if (!cv?.upload.objectKey) throw new NotFoundException("No CV on file");
    const ttl = 300;
    const ext = cv.upload.detectedType === "PDF" ? "pdf" : cv.upload.detectedType === "DOCX" ? "docx" : cv.upload.detectedType === "DOC" ? "doc" : "bin";
    await this.audit.record({
      actorId: staff.id,
      actorType: "STAFF",
      entityType: "Contractor",
      entityId: id,
      action: "admin.cv_accessed",
      after: { versionNumber: cv.versionNumber },
    });
    // INV-02: a verified PDF is shown in the browser; Word documents stay a forced download.
    if (cv.upload.detectedType === "PDF") {
      return { url: await this.storage.presignInlinePdf(cv.upload.objectKey, `cv.${ext}`, ttl), expiresInSeconds: ttl, inline: true };
    }
    return { url: await this.storage.presignGet(cv.upload.objectKey, `cv.${ext}`, ttl), expiresInSeconds: ttl, inline: false };
  }

  async photoLink(id: string) {
    const c = await prisma.contractor.findFirst({ where: { id, erasedAt: null }, select: { photoKey: true, photoContentType: true } });
    if (!c) throw new NotFoundException("Contractor not found");
    const ttl = 300;
    if (!c.photoKey || !c.photoContentType || !["image/jpeg", "image/png", "image/webp"].includes(c.photoContentType)) return { url: null, expiresInSeconds: ttl };
    return { url: await this.storage.presignInlineImage(c.photoKey, c.photoContentType, ttl), expiresInSeconds: ttl };
  }

  async detail(id: string, now = new Date()): Promise<AdminContractorDetail> {
    const c = await prisma.contractor.findFirst({ where: { id, erasedAt: null } });
    if (!c) throw new NotFoundException("Contractor not found");
    const [thresholds, referral, introductionsMade, events, task] = await Promise.all([
      loadFreshnessThresholds(),
      prisma.referral.findUnique({ where: { refereeId: id } }),
      prisma.referral.count({ where: { referrerId: id, lockedAt: { not: null } } }),
      prisma.confirmationEvent.findMany({ where: { contractorId: id }, orderBy: { confirmedAt: "desc" }, take: 10 }),
      prisma.manualCallTask.findFirst({ where: { contractorId: id, status: "OPEN" } }),
    ]);
    const referrer = referral ? await prisma.contractor.findUnique({ where: { id: referral.referrerId }, select: { firstName: true, lastName: true } }) : null;
    const a = describeAvailability(factsFor(c, now), thresholds, now);
    return {
      ...toRow(c, thresholds, now),
      profile: await this.profile(id, c),
      phone: c.phone,
      employment: c.employmentSituation,
      availableFrom: dateOnly(c.availableFrom),
      contractEndDate: dateOnly(c.contractEndDate),
      underlyingStatus: a.underlyingStatus,
      freshnessState: a.freshnessState,
      unconfirmedSince: iso(c.unconfirmedSince),
      escalationStage: c.escalationStage,
      createdAt: c.createdAt.toISOString(),
      introducer: referral
        ? { referralId: referral.id, referrerId: referral.referrerId, referrerName: fullName(referrer ?? undefined), locked: referral.lockedAt !== null }
        : null,
      introductionsMade,
      events: events.map((e) => ({
        id: e.id,
        source: e.source,
        employment: e.employmentSituation,
        availableFrom: dateOnly(e.availableFrom),
        contractEndDate: dateOnly(e.contractEndDate),
        confirmedAt: e.confirmedAt.toISOString(),
      })),
      openCallTask: task ? { id: task.id, reason: task.reason, createdAt: task.createdAt.toISOString() } : null,
    };
  }

  /**
   * Manual confirm "on behalf" (source = ADMIN, reason mandatory). It is a meaningful confirmation like any other, so
   * it ends escalation; an open call task for the contractor is closed because the call has now happened.
   */
  async confirmOnBehalf(id: string, body: z.infer<typeof AdminConfirmOnBehalfSchema>, staff: StaffPrincipal, now = new Date()) {
    await this.exists(id);
    // ADM-07: same rule as the contractor form. An unknown contract end would silently derive Unconfirmed, so refuse it.
    if (body.employment === "CONTRACTING" && !body.contractEndDate) {
      throw new BadRequestException("contractEndDate: Enter the expected contract end date before confirming a contract");
    }
    const me = await this.me.confirmAvailability(
      id,
      { employment: body.employment, availableFrom: body.availableFrom, contractEndDate: body.contractEndDate ?? null },
      now,
      "ADMIN",
      { staffId: staff.id, reason: body.reason },
    );
    const closed = await prisma.manualCallTask.updateMany({ where: { contractorId: id, status: "OPEN" }, data: { status: "DONE", resolvedAt: now } });
    if (closed.count > 0) {
      await this.audit.record({
        actorId: staff.id,
        actorType: "STAFF",
        entityType: "Contractor",
        entityId: id,
        action: "admin.call_task_closed_by_confirmation",
        after: { closed: closed.count },
      });
    }
    return me;
  }

  async sendMessage(id: string, body: z.infer<typeof AdminSendMessageSchema>, staff: StaffPrincipal) {
    await this.exists(id);
    const msg = await this.inbox.sendMessage(id, body.subject, body.body, staff.id);
    await this.audit.record({
      actorId: staff.id,
      actorType: "STAFF",
      entityType: "Contractor",
      entityId: id,
      action: "admin.loop_message_sent",
      after: { messageId: msg.id, subject: body.subject, templateKey: body.templateKey ?? null },
    });
    return { id: msg.id };
  }

  private async exists(id: string) {
    const c = await prisma.contractor.findFirst({ where: { id, erasedAt: null }, select: { id: true } });
    if (!c) throw new NotFoundException("Contractor not found");
  }

  /** LIVE contractors whose availability is unconfirmed, awaiting a call, or already suppressed from search. */
  async queue(q: { stage: "ALL" | "UNCONFIRMED" | "CALL_TASK" | "SUPPRESSED" } & Page, now = new Date()): Promise<Queue> {
    const stageWhere = {
      UNCONFIRMED: { freshnessState: "UNCONFIRMED" },
      CALL_TASK: { escalationStage: "CALL_TASK" },
      SUPPRESSED: { escalationStage: "SUPPRESS" },
      ALL: { OR: [{ freshnessState: "UNCONFIRMED" }, { escalationStage: { not: null } }] },
    }[q.stage];
    const where = { erasedAt: null, live: true, ...stageWhere };
    const [rows, total, thresholds] = await Promise.all([
      prisma.contractor.findMany({ where, orderBy: [{ unconfirmedSince: "asc" }, { createdAt: "asc" }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      prisma.contractor.count({ where }),
      loadFreshnessThresholds(),
    ]);
    const tasks = rows.length
      ? await prisma.manualCallTask.findMany({ where: { contractorId: { in: rows.map((r) => r.id) }, status: "OPEN" } })
      : [];
    const byContractor = new Map(tasks.map((t) => [t.contractorId, t]));
    return {
      items: rows.map((c) => {
        const t = byContractor.get(c.id);
        return {
          ...toRow(c, thresholds, now),
          unconfirmedSince: iso(c.unconfirmedSince),
          escalationStage: c.escalationStage,
          callTask: t ? { id: t.id, reason: t.reason, createdAt: t.createdAt.toISOString() } : null,
        };
      }),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  async resolveCallTask(taskId: string, body: z.infer<typeof AdminResolveCallTaskSchema>, staff: StaffPrincipal, now = new Date()) {
    const res = await prisma.manualCallTask.updateMany({ where: { id: taskId, status: "OPEN" }, data: { status: body.outcome, resolvedAt: now } });
    if (res.count !== 1) throw new NotFoundException("Open call task not found");
    const task = await prisma.manualCallTask.findUnique({ where: { id: taskId } });
    await this.audit.record({
      actorId: staff.id,
      actorType: "STAFF",
      entityType: "ManualCallTask",
      entityId: taskId,
      action: "admin.call_task_resolved",
      before: { status: "OPEN" },
      after: { status: body.outcome, note: body.note ?? null, contractorId: task?.contractorId ?? null },
    });
    return { ok: true as const };
  }
}
