import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@loop/db";
import { londonDate, validateAssignmentDates } from "@loop/domain";
import type { Assignment, AssignmentInput, AssignmentList } from "@loop/contracts";
import { AuditService } from "../../common/audit.service.js";

type Row = NonNullable<Awaited<ReturnType<typeof prisma.assignment.findUnique>>>;

const toDate = (v: string | null): Date | null => (v ? new Date(`${v}T00:00:00Z`) : null);

function toAssignment(r: Row): Assignment {
  return {
    id: r.id,
    clientName: r.clientName,
    supplyingCompany: r.supplyingCompany,
    role: r.role,
    startDate: londonDate(r.startDate),
    endDate: r.endDate ? londonDate(r.endDate) : null,
    assignmentRef: r.assignmentRef,
  };
}

/**
 * Phase 7 assignment history typed by the contractor (no CV needed). The same rows are the evidence the Phase 9
 * reward looks at, so edits and deletes are audited with before/after.
 */
@Injectable()
export class AssignmentsService {
  // Explicit @Inject: the dev runner (tsx/esbuild) does not emit design:paramtypes metadata.
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  async list(contractorId: string): Promise<AssignmentList> {
    const rows = await prisma.assignment.findMany({ where: { contractorId }, orderBy: [{ startDate: "desc" }, { createdAt: "desc" }] });
    return { items: rows.map(toAssignment) };
  }

  async create(contractorId: string, input: AssignmentInput, now = new Date()): Promise<Assignment> {
    this.validate(input, now);
    const row = await prisma.assignment.create({ data: { contractorId, ...this.data(input) } });
    await this.audit.record({ actorId: contractorId, entityType: "Assignment", entityId: row.id, action: "assignment.created", after: toAssignment(row) });
    return toAssignment(row);
  }

  async update(contractorId: string, id: string, input: AssignmentInput, now = new Date()): Promise<Assignment> {
    this.validate(input, now);
    const before = await this.owned(contractorId, id);
    const row = await prisma.assignment.update({ where: { id }, data: this.data(input) });
    await this.audit.record({
      actorId: contractorId,
      entityType: "Assignment",
      entityId: id,
      action: "assignment.updated",
      before: toAssignment(before),
      after: toAssignment(row),
    });
    return toAssignment(row);
  }

  async remove(contractorId: string, id: string): Promise<void> {
    const before = await this.owned(contractorId, id);
    await prisma.assignment.delete({ where: { id } });
    await this.audit.record({ actorId: contractorId, entityType: "Assignment", entityId: id, action: "assignment.deleted", before: toAssignment(before) });
  }

  private validate(input: AssignmentInput, now: Date): void {
    const issue = validateAssignmentDates({ startDate: input.startDate, endDate: input.endDate }, londonDate(now));
    if (issue) throw new BadRequestException(issue);
  }

  private data(input: AssignmentInput) {
    return {
      clientName: input.clientName,
      supplyingCompany: input.supplyingCompany,
      role: input.role,
      startDate: toDate(input.startDate) as Date,
      endDate: toDate(input.endDate),
      assignmentRef: input.assignmentRef,
    };
  }

  /** Foreign and missing rows are indistinguishable. */
  private async owned(contractorId: string, id: string): Promise<Row> {
    const row = await prisma.assignment.findFirst({ where: { id, contractorId } });
    if (!row) throw new NotFoundException("Assignment not found");
    return row;
  }
}
