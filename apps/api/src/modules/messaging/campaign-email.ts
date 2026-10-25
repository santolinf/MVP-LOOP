import { CAMPAIGN_FOOTER, type CampaignKind } from "@loop/domain";
import type { RenderedEmail } from "../auth/email-templates.js";
import { escapeHtml } from "./templates.js";

const FIELD = /\{\{\s*(\w+)\s*\}\}/g;

/**
 * Renders an admin send. Merge fields are escaped for HTML and the subject is stripped of line breaks, so a
 * contractor-supplied name can never inject markup or headers. Only `firstName` exists for LOOP messages (domain allow-list).
 */
export function renderCampaign(c: { kind: CampaignKind; subject: string; body: readonly string[] }, firstName: string | null): RenderedEmail & { plainBody: string[] } {
  const name = firstName?.trim() || "there";
  const merge = (t: string, esc: (s: string) => string) => t.replace(FIELD, (_m, field: string) => (field === "firstName" ? esc(name) : ""));
  const subject = merge(c.subject, (s) => s.replace(/[\r\n]+/g, " ")).trim();
  const plainBody = c.body.map((p) => merge(p, (s) => s));
  const footer = CAMPAIGN_FOOTER[c.kind];
  const text = [...plainBody, footer].join("\n\n") + "\n";
  const html = [...c.body.map((p) => `<p>${merge(p, escapeHtml)}</p>`), `<p style="color:#555;font-size:12px">${escapeHtml(footer)}</p>`].join("");
  return { subject, text, html, plainBody };
}
