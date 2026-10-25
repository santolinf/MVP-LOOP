import { prisma } from "@loop/db";
import { mergeReminderConfig, validateReminderConfig, type ReminderConfig } from "@loop/domain";

export interface VersionedReminderConfig {
  /** 0 means no version has been published yet and the domain defaults are in force. */
  version: number;
  config: ReminderConfig;
}

/** The latest published cadence config, merged over the domain defaults so an older version still loads. */
export async function loadReminderConfig(): Promise<VersionedReminderConfig> {
  const row = await prisma.reminderConfigVersion.findFirst({ orderBy: { version: "desc" } });
  return row ? { version: row.version, config: mergeReminderConfig(row.config) } : { version: 0, config: mergeReminderConfig(null) };
}

/** Appends a new version (history is never edited). Rejects configs the engine could not run safely. */
export async function publishReminderConfig(
  config: ReminderConfig,
  createdBy: string | null,
  note: string | null,
): Promise<VersionedReminderConfig> {
  const issues = validateReminderConfig(config);
  if (issues.length > 0) throw new Error(`Invalid reminder config: ${issues.join("; ")}`);
  const row = await prisma.reminderConfigVersion.create({ data: { config: config as never, createdBy, note } });
  return { version: row.version, config };
}
