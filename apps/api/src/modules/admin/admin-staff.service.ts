import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, prisma } from "@loop/db";
import { normaliseEmail } from "@loop/domain";
import type { AdminCreateStaffSchema, AdminUpdateStaffSchema } from "@loop/contracts";
import type { z } from "zod";
import { AuditService } from "../../common/audit.service.js";
import type { StaffPrincipal } from "./staff-access.js";
import { StaffSessionService } from "./staff-session.service.js";

type Staff = NonNullable<Awaited<ReturnType<typeof prisma.staffUser.findUnique>>>;

const view = (s: Staff) => ({
  id: s.id,
  email: s.email,
  name: s.name,
  role: s.role as "READ_ONLY" | "OPERATOR" | "ADMIN",
  active: s.active,
  totpEnrolled: s.totpEnrolledAt !== null,
  lastSignInAt: s.lastSignInAt?.toISOString() ?? null,
  createdAt: s.createdAt.toISOString(),
});

@Injectable()
export class AdminStaffService {
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(StaffSessionService) private readonly sessions: StaffSessionService,
  ) {}

  async list() {
    return { items: (await prisma.staffUser.findMany({ orderBy: { createdAt: "asc" } })).map(view) };
  }

  /** Creates the account only; the person signs in with an emailed code and enrols an authenticator on first use. */
  async create(body: z.infer<typeof AdminCreateStaffSchema>, staff: StaffPrincipal) {
    try {
      const created = await prisma.staffUser.create({
        data: { email: normaliseEmail(body.email), name: body.name ?? null, role: body.role, createdBy: staff.id },
      });
      await this.audit.record({
        actorId: staff.id,
        actorType: "STAFF",
        entityType: "StaffUser",
        entityId: created.id,
        action: "admin.staff_created",
        after: { role: created.role },
      });
      return view(created);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new ConflictException("That email already has a staff account");
      throw e;
    }
  }

  /** Role, name and active changes. Not on yourself, and never leaving the system without an active admin. */
  async update(id: string, body: z.infer<typeof AdminUpdateStaffSchema>, staff: StaffPrincipal) {
    const before = await this.load(id);
    const demotes = (body.role !== undefined && body.role !== "ADMIN") || body.active === false;
    if (id === staff.id && demotes) throw new BadRequestException("You cannot demote or deactivate yourself");
    if (before.role === "ADMIN" && before.active && demotes) {
      const otherAdmins = await prisma.staffUser.count({ where: { role: "ADMIN", active: true, id: { not: id } } });
      if (otherAdmins === 0) throw new BadRequestException("There must be at least one active admin");
    }
    const after = await prisma.staffUser.update({
      where: { id },
      data: { ...(body.role ? { role: body.role } : {}), ...(body.active !== undefined ? { active: body.active } : {}), ...(body.name !== undefined ? { name: body.name } : {}) },
    });
    // A role change or deactivation takes effect immediately, not at the next sign-in.
    if ((body.role && body.role !== before.role) || body.active === false) await this.sessions.revokeAllFor(id);
    await this.audit.record({
      actorId: staff.id,
      actorType: "STAFF",
      entityType: "StaffUser",
      entityId: id,
      action: "admin.staff_updated",
      before: { role: before.role, active: before.active, name: before.name },
      after: { role: after.role, active: after.active, name: after.name, reason: body.reason },
    });
    return view(after);
  }

  /** Clears the authenticator (lost phone). The person enrols a new one at next sign-in. */
  async resetMfa(id: string, staff: StaffPrincipal) {
    await this.load(id);
    await prisma.staffUser.update({ where: { id }, data: { totpSecretEnc: null, totpEnrolledAt: null, lastTotpStep: null } });
    await this.sessions.revokeAllFor(id);
    await this.audit.record({ actorId: staff.id, actorType: "STAFF", entityType: "StaffUser", entityId: id, action: "admin.staff_mfa_reset" });
    return { ok: true as const };
  }

  private async load(id: string): Promise<Staff> {
    const s = await prisma.staffUser.findUnique({ where: { id } });
    if (!s) throw new NotFoundException("Staff member not found");
    return s;
  }
}
