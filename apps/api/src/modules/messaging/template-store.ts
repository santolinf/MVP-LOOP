import { prisma } from "@loop/db";
import type { TemplateOverride } from "./templates.js";

/** The latest admin-published version of a template key, or null while the code default is in force. */
export async function loadTemplateOverride(key: string): Promise<TemplateOverride | null> {
  const row = await prisma.templateVersion.findFirst({ where: { key }, orderBy: { version: "desc" } });
  return row ? { version: row.version, subject: row.subject, body: row.body } : null;
}
