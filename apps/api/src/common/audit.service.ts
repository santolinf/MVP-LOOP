import { Injectable } from "@nestjs/common";
import { prisma } from "@loop/db";

/** Every change to contractor, referral, reward or payment data writes an AuditEvent. */
@Injectable()
export class AuditService {
  async record(e: { actorId?: string; actorType?: "CONTRACTOR" | "STAFF" | "SYSTEM"; entityType: string; entityId: string; action: string; before?: object; after?: object }) {
    await prisma.auditEvent.create({ data: e });
  }
}
