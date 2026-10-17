import type { ExecutionContext } from "@nestjs/common";
import { createParamDecorator, UnauthorizedException } from "@nestjs/common";

/**
 * Resolves the signed-in contractor id. `AuthGuard` sets `req.contractorId` from the session cookie or
 * bearer token; a non-production LOOP_DEV_CONTRACTOR_ID stands in so the journey can be exercised locally.
 */
export function resolveContractorId(req: { contractorId?: string }, env = process.env): string {
  const id = req.contractorId ?? (env.NODE_ENV === "production" ? undefined : env.LOOP_DEV_CONTRACTOR_ID);
  if (!id) throw new UnauthorizedException("Sign in required");
  return id;
}

export const CurrentContractor = createParamDecorator((_: unknown, ctx: ExecutionContext): string =>
  resolveContractorId(ctx.switchToHttp().getRequest<{ contractorId?: string }>()),
);
