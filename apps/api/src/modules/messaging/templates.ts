import type { ReminderType } from "@loop/domain";
import type { RenderedEmail } from "../auth/email-templates.js";

/**
 * Reminder email templates, versioned in code and reviewed like code. Bump `version` whenever the wording changes:
 * every Message records the key and version it was rendered from. Merge fields are escaped for HTML and stripped of
 * line breaks in the subject, so contractor-supplied text can never inject markup or headers.
 * TODO(spec): copy is draft until the product owner signs off the wording.
 */
export interface TemplateVars {
  firstName: string | null;
  /** Contract end date as a display string, when the template mentions it. */
  endDate?: string | null;
  /** One-touch "still the same" link; present only when it is allowed for this reminder. */
  confirmUrl?: string | null;
  /** Sign-in link that returns to the exact action. */
  signInUrl: string;
}

interface TemplateDef {
  key: string;
  version: number;
  subject: string;
  /** Paragraphs; `{{name}}` placeholders are merge fields. */
  body: string[];
}

const T = (key: string, subject: string, body: string[], version = 1): TemplateDef => ({ key, version, subject, body });

const FOOTER = "You get this because you agreed to availability reminders from LOOP. You can change this in My LOOP.";

export const REMINDER_TEMPLATES: Record<ReminderType, TemplateDef> = {
  AVAILABLE_NOW_CHECK: T("reminder.available-now", "Are you still available?", [
    "Hi {{firstName}}, you are showing as Available Now on LOOP.",
    "Is that still right? One tap keeps your profile current.",
  ]),
  CONTRACT_END_PROMPT: T("reminder.contract-end-prompt", "Your contract ends on {{endDate}}", [
    "Hi {{firstName}}, your contract is due to end on {{endDate}}.",
    "Is that date still right? If it has changed, update it so agencies see the right availability.",
  ]),
  CONTRACT_END_DATE: T("reminder.contract-end-date", "Your contract ends today: what's next?", [
    "Hi {{firstName}}, your contract is due to end today ({{endDate}}).",
    "Tell us what happens next: extended, or available for new work? We never change your status until you confirm.",
  ]),
  CONTRACT_END_FOLLOW_UP: T("reminder.contract-end-follow-up", "Update your availability after {{endDate}}", [
    "Hi {{firstName}}, your contract was due to end on {{endDate}} and we have not heard from you.",
    "Please confirm your situation. Until you do, your profile shows as unconfirmed.",
  ]),
  UNCONFIRMED_FOLLOW_UP: T("reminder.unconfirmed-follow-up", "Please confirm your availability", [
    "Hi {{firstName}}, we have not had a recent confirmation of your availability, so your profile now shows as unconfirmed.",
    "Confirm where you are now and it goes straight back to being current.",
  ]),
  IN_CONTRACT_CHECK: T("reminder.in-contract", "Still on your current contract?", [
    "Hi {{firstName}}, a quick check that your contract details are still right.",
  ]),
  PERMANENT_CHECK: T("reminder.permanent", "Still open to contracting?", [
    "Hi {{firstName}}, a quick check that your details are still right and you remain open to contracting.",
  ]),
  PROFILE_REVIEW: T("reminder.profile-review", "Time to review your LOOP profile", [
    "Hi {{firstName}}, it has been a while since you reviewed your whole profile.",
    "Take a minute to check your skills, preferences and details are still accurate.",
  ]),
  CV_REVIEW: T("reminder.cv-review", "Is your CV up to date?", [
    "Hi {{firstName}}, if your CV has changed, upload the new one and we will suggest profile updates for you to review.",
  ]),
  INTRODUCTIONS_NUDGE: T("reminder.introductions", "Introduce a contractor you trust", [
    "Hi {{firstName}}, you have not introduced anyone to LOOP yet.",
    "Introductions help you toward Founding Contractor status.",
  ]),
  FUTURE_START_PROMPT: T("reminder.future-start", "Your start date is coming up", [
    "Hi {{firstName}}, a quick check that your availability dates are still right.",
  ]),
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

function merge(template: string, vars: Record<string, string>, escape: (s: string) => string): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => escape(vars[name] ?? ""));
}

export interface RenderedTemplate extends RenderedEmail {
  templateKey: string;
  templateVersion: number;
}

/** A published admin version of a template (Phase 10). It replaces the wording only; links, note and footer stay in code. */
export interface TemplateOverride {
  version: number;
  subject: string;
  body: string[];
}

export function renderReminder(type: ReminderType, vars: TemplateVars, override?: TemplateOverride | null): RenderedTemplate {
  const base = REMINDER_TEMPLATES[type];
  const def: TemplateDef = override ? { key: base.key, version: override.version, subject: override.subject, body: override.body } : base;
  const values: Record<string, string> = {
    firstName: vars.firstName?.trim() || "there",
    endDate: vars.endDate ?? "",
  };
  const subject = merge(def.subject, values, (s) => s.replace(/[\r\n]+/g, " ")).trim();
  const paragraphs = def.body.map((p) => ({ text: merge(p, values, (s) => s), html: merge(p, values, escapeHtml) }));

  const cta = vars.confirmUrl
    ? { label: "Yes, still the same", url: vars.confirmUrl, note: "This link only confirms. To change anything, sign in." }
    : { label: "Review in My LOOP", url: vars.signInUrl, note: null };
  const signIn = vars.confirmUrl ? { label: "Something changed? Sign in", url: vars.signInUrl } : null;

  const text = [
    ...paragraphs.map((p) => p.text),
    `${cta.label}: ${cta.url}`,
    ...(cta.note ? [cta.note] : []),
    ...(signIn ? [`${signIn.label}: ${signIn.url}`] : []),
    FOOTER,
  ].join("\n\n");
  const html = [
    ...paragraphs.map((p) => `<p>${p.html}</p>`),
    `<p><a href="${escapeHtml(cta.url)}">${escapeHtml(cta.label)}</a></p>`,
    ...(cta.note ? [`<p>${escapeHtml(cta.note)}</p>`] : []),
    ...(signIn ? [`<p><a href="${escapeHtml(signIn.url)}">${escapeHtml(signIn.label)}</a></p>`] : []),
    `<p style="color:#555;font-size:12px">${escapeHtml(FOOTER)}</p>`,
  ].join("");
  return { subject, text: `${text}\n`, html, templateKey: def.key, templateVersion: def.version };
}
