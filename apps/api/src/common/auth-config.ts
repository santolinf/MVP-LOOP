import { prisma } from "@loop/db";
import { DEFAULT_OTP_CONFIG, type OtpConfig } from "@loop/domain";

const KEY = "auth.otp";

function isPositiveInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}

/** OTP limits from ReminderConfig row `auth.otp`, field by field over the domain defaults. */
export async function loadOtpConfig(): Promise<OtpConfig> {
  const row = await prisma.reminderConfig.findUnique({ where: { key: KEY } });
  const out: OtpConfig = { ...DEFAULT_OTP_CONFIG };
  if (row && typeof row.value === "object" && row.value !== null && !Array.isArray(row.value)) {
    const v = row.value as Record<string, unknown>;
    for (const k of Object.keys(DEFAULT_OTP_CONFIG) as (keyof OtpConfig)[]) {
      const candidate = v[k];
      if (isPositiveInt(candidate)) out[k] = candidate;
    }
  }
  return out;
}
