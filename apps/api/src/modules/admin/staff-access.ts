import { ApiQuery } from "@nestjs/swagger";
import { applyDecorators, Controller, createParamDecorator, SetMetadata, type ExecutionContext } from "@nestjs/common";
import type { Permission, StaffRole } from "@loop/domain";

/** The authenticated staff member, attached to the request by StaffGuard. */
export interface StaffPrincipal {
  id: string;
  email: string;
  name: string | null;
  role: StaffRole;
  sessionId: string;
}

export interface StaffRequest {
  method: string;
  url: string;
  ip?: string;
  params: Record<string, string>;
  query: Record<string, unknown>;
  headers: Record<string, string | string[] | undefined>;
  staff?: StaffPrincipal;
  /** Set for the pending-MFA endpoints. */
  staffPendingId?: string;
  staffSessionId?: string;
}

export type StaffAccess =
  | { kind: "public" }
  /** OTP passed, TOTP outstanding. */
  | { kind: "pending" }
  /** Any fully signed-in staff member, regardless of role. */
  | { kind: "authenticated" }
  | { kind: "permission"; permission: Permission };

export const STAFF_REALM = "loop:staff-realm";
export const STAFF_ACCESS = "loop:staff-access";
export const STAFF_AUDIT = "loop:staff-audit";

/**
 * Marks a controller as part of the staff realm (mounted under `admin/`). Every handler in it must also declare its
 * access with one of the decorators below; StaffGuard refuses any handler that does not (deny by default).
 */
export const StaffController = (path: string) => applyDecorators(Controller(`admin/${path}`), SetMetadata(STAFF_REALM, true));

export const RequirePermission = (permission: Permission) => SetMetadata(STAFF_ACCESS, { kind: "permission", permission } satisfies StaffAccess);
export const StaffPublic = () => SetMetadata(STAFF_ACCESS, { kind: "public" } satisfies StaffAccess);
export const StaffPendingMfa = () => SetMetadata(STAFF_ACCESS, { kind: "pending" } satisfies StaffAccess);
export const StaffAuthenticated = () => SetMetadata(STAFF_ACCESS, { kind: "authenticated" } satisfies StaffAccess);

export interface AuditAccessOptions {
  entityType: string;
  /** Name of the route param holding the entity id; omitted for list views. */
  idParam?: string;
  /** Appended to `admin.` to form the audit action, e.g. "contractor.viewed". */
  action: string;
}

/** Every view of personal data writes an AuditEvent (before the response leaves). Put it on each read handler. */
export const AuditAccess = (options: AuditAccessOptions) => SetMetadata(STAFF_AUDIT, options);

export const CurrentStaff = createParamDecorator((_data: unknown, ctx: ExecutionContext): StaffPrincipal => {
  const staff = ctx.switchToHttp().getRequest<StaffRequest>().staff;
  if (!staff) throw new Error("CurrentStaff used on a route without a signed-in staff member");
  return staff;
});

interface QuerySpec {
  name: string;
  enum?: readonly string[];
  number?: boolean;
}

/**
 * Documents query parameters in the OpenAPI spec so the generated client can send them. The dev runner (tsx/esbuild)
 * emits no parameter types, so Swagger cannot infer them from the validated query DTO.
 */
export const ApiQueries = (...specs: QuerySpec[]) =>
  applyDecorators(
    ...specs.map((s) => (s.enum ? ApiQuery({ name: s.name, required: false, enum: [...s.enum] }) : ApiQuery({ name: s.name, required: false, type: s.number ? Number : String }))),
  );

export const PAGE_QUERY: QuerySpec[] = [
  { name: "page", number: true },
  { name: "pageSize", number: true },
];
