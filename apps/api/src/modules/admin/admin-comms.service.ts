import { ConflictException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { Prisma, prisma } from "@loop/db";
import { TEMPLATE_KEY, TEMPLATE_PLACEHOLDERS, validateTemplate, type ReminderConfig, type TemplateKind } from "@loop/domain";
import type {
  AdminCreateTemplateSchema,
  AdminNewTemplateVersionSchema,
  AdminPublishReminderConfigSchema,
} from "@loop/contracts";
import type { z } from "zod";
import { AuditService } from "../../common/audit.service.js";
import { loadReminderConfig, publishReminderConfig } from "../../common/reminder-config.js";
import { REMINDER_TEMPLATES } from "../messaging/templates.js";
import type { StaffPrincipal } from "./staff-access.js";

interface Effective {
  key: string;
  kind: TemplateKind;
  label: string;
  version: number;
  subject: string;
  body: string[];
  updatedAt: Date | null;
}

const CODE_TEMPLATES = Object.entries(REMINDER_TEMPLATES).map(([type, t]) => ({
  key: t.key,
  label: type
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" "),
  version: t.version,
  subject: t.subject,
  body: t.body,
}));
const CODE_BY_KEY = new Map(CODE_TEMPLATES.map((t) => [t.key, t]));

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/** Phase 10: versioned LOOP message / notification / reminder templates, and the reminder-schedule config. */
@Injectable()
export class AdminCommsService {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  // ---- templates ----------------------------------------------------------------------------------------------

  private async effective(): Promise<Effective[]> {
    const rows = await prisma.templateVersion.findMany({ orderBy: { version: "desc" } });
    const latest = new Map<string, (typeof rows)[number]>();
    for (const r of rows) if (!latest.has(r.key)) latest.set(r.key, r);
    const out: Effective[] = CODE_TEMPLATES.map((c) => {
      const db = latest.get(c.key);
      return db
        ? { key: c.key, kind: "REMINDER_EMAIL", label: c.label, version: db.version, subject: db.subject, body: db.body, updatedAt: db.createdAt }
        : { key: c.key, kind: "REMINDER_EMAIL", label: c.label, version: c.version, subject: c.subject, body: c.body, updatedAt: null };
    });
    for (const [key, db] of latest) {
      if (CODE_BY_KEY.has(key)) continue;
      out.push({ key, kind: db.kind as TemplateKind, label: key, version: db.version, subject: db.subject, body: db.body, updatedAt: db.createdAt });
    }
    return out;
  }

  async listTemplates() {
    return {
      items: (await this.effective()).map((t) => ({
        key: t.key,
        kind: t.kind,
        label: t.label,
        version: t.version,
        subject: t.subject,
        updatedAt: t.updatedAt?.toISOString() ?? null,
      })),
    };
  }

  async templateDetail(key: string) {
    const t = (await this.effective()).find((x) => x.key === key);
    if (!t) throw new NotFoundException("Template not found");
    const rows = await prisma.templateVersion.findMany({ where: { key }, orderBy: { version: "desc" } });
    const code = CODE_BY_KEY.get(key);
    return {
      key: t.key,
      kind: t.kind,
      label: t.label,
      version: t.version,
      subject: t.subject,
      body: t.body,
      updatedAt: t.updatedAt?.toISOString() ?? null,
      placeholders: [...TEMPLATE_PLACEHOLDERS[t.kind]],
      history: [
        ...rows.map((r) => ({
          version: r.version,
          subject: r.subject,
          body: r.body,
          note: r.note,
          createdBy: r.createdBy,
          createdAt: r.createdAt.toISOString(),
        })),
        ...(code ? [{ version: code.version, subject: code.subject, body: code.body, note: "Built-in default", createdBy: null, createdAt: new Date(0).toISOString() }] : []),
      ],
    };
  }

  private assertValid(kind: TemplateKind, subject: string, body: string[]) {
    const issues = validateTemplate({ kind, subject, body });
    if (issues.length > 0) throw new UnprocessableEntityException(issues.join("; "));
  }

  /** Appends a version; history is never edited. Reminder keys continue the version numbering of the built-in default. */
  async newVersion(key: string, body: z.infer<typeof AdminNewTemplateVersionSchema>, staff: StaffPrincipal) {
    const code = CODE_BY_KEY.get(key);
    const existing = await prisma.templateVersion.findFirst({ where: { key }, orderBy: { version: "desc" } });
    if (!code && !existing) throw new NotFoundException("Template not found");
    const kind: TemplateKind = code ? "REMINDER_EMAIL" : (existing?.kind as TemplateKind);
    this.assertValid(kind, body.subject, body.body);
    const version = Math.max(code?.version ?? 0, existing?.version ?? 0) + 1;
    return this.save({ kind, key, version, subject: body.subject.trim(), body: body.body, note: body.note }, staff);
  }

  async createTemplate(body: z.infer<typeof AdminCreateTemplateSchema>, staff: StaffPrincipal) {
    if (!TEMPLATE_KEY.test(body.key)) throw new UnprocessableEntityException("Key must be lower-case letters, digits, dots and hyphens");
    if (CODE_BY_KEY.has(body.key) || (await prisma.templateVersion.findFirst({ where: { key: body.key } }))) {
      throw new ConflictException("A template with that key already exists");
    }
    this.assertValid(body.kind, body.subject, body.body);
    return this.save({ kind: body.kind, key: body.key, version: 1, subject: body.subject.trim(), body: body.body, note: body.note }, staff);
  }

  private async save(t: { kind: TemplateKind; key: string; version: number; subject: string; body: string[]; note: string }, staff: StaffPrincipal) {
    try {
      await prisma.templateVersion.create({ data: { ...t, createdBy: staff.id } });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException("Someone else just published this template; reload and try again");
      throw e;
    }
    await this.audit.record({
      actorId: staff.id,
      actorType: "STAFF",
      entityType: "Template",
      entityId: t.key,
      action: "admin.template_version_published",
      after: { kind: t.kind, version: t.version, subject: t.subject, note: t.note },
    });
    return this.templateDetail(t.key);
  }

  // ---- reminder schedule --------------------------------------------------------------------------------------

  async reminderConfig() {
    const [current, history] = await Promise.all([
      loadReminderConfig(),
      prisma.reminderConfigVersion.findMany({ orderBy: { version: "desc" }, take: 20, select: { version: true, note: true, createdBy: true, createdAt: true } }),
    ]);
    return {
      version: current.version,
      config: current.config,
      history: history.map((h) => ({ version: h.version, note: h.note, createdBy: h.createdBy, createdAt: h.createdAt.toISOString() })),
    };
  }

  /** Writes a new config version (never edits an old one). The engine reads the highest version on its next sweep. */
  async publishReminderConfig(body: z.infer<typeof AdminPublishReminderConfigSchema>, staff: StaffPrincipal) {
    const before = await loadReminderConfig();
    let published;
    try {
      published = await publishReminderConfig(body.config as ReminderConfig, staff.id, body.note);
    } catch (e) {
      throw new UnprocessableEntityException(e instanceof Error ? e.message : "Invalid reminder config");
    }
    await this.audit.record({
      actorId: staff.id,
      actorType: "STAFF",
      entityType: "ReminderConfig",
      entityId: String(published.version),
      action: "admin.reminder_config_published",
      before: { version: before.version, config: before.config },
      after: { version: published.version, config: published.config, note: body.note },
    });
    return this.reminderConfig();
  }
}
