import type { CallHandler, ExecutionContext, NestInterceptor } from "@nestjs/common";
import { Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { mergeMap, type Observable } from "rxjs";
import { AuditService } from "../../common/audit.service.js";
import { STAFF_AUDIT, type AuditAccessOptions, type StaffRequest } from "./staff-access.js";

/**
 * Writes an AuditEvent for every read handler marked with @AuditAccess, before the response is released: if the
 * audit write fails the view fails. Only the names of the filters used are recorded, never their values (a search
 * term can itself be an email address).
 */
@Injectable()
export class StaffAuditInterceptor implements NestInterceptor {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const opts = this.reflector.get<AuditAccessOptions | undefined>(STAFF_AUDIT, context.getHandler());
    if (!opts || context.getType() !== "http") return next.handle();
    const req = context.switchToHttp().getRequest<StaffRequest>();
    return next.handle().pipe(
      mergeMap(async (data: unknown) => {
        const staff = req.staff;
        if (staff) {
          await this.audit.record({
            actorId: staff.id,
            actorType: "STAFF",
            entityType: opts.entityType,
            entityId: opts.idParam ? (req.params[opts.idParam] ?? "unknown") : "list",
            action: `admin.${opts.action}`,
            after: { filters: Object.keys(req.query).sort() },
          });
        }
        return data;
      }),
    );
  }
}
