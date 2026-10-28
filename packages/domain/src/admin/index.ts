// Phase 10 admin rules. Pure: roles and permissions, the reward four-eyes rule, template checks and the IP allow-list.

export const STAFF_ROLES = ["READ_ONLY", "OPERATOR", "ADMIN"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const PERMISSIONS = [
  "contractors.read",
  "availability.read",
  "availability.confirm",
  "availability.manage_tasks",
  "introductions.read",
  "introductions.review",
  "introductions.override",
  "rewards.read",
  "rewards.verify",
  "rewards.approve",
  "comms.read",
  "comms.send_message",
  "comms.manage_templates",
  "comms.approve",
  "config.read",
  "config.write",
  "audit.read",
  "staff.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const READ: readonly Permission[] = ["contractors.read", "availability.read", "introductions.read", "rewards.read", "comms.read", "config.read"];
const OPERATE: readonly Permission[] = [
  ...READ,
  "availability.confirm",
  "availability.manage_tasks",
  "introductions.review",
  "rewards.verify",
  "comms.send_message",
];

/** Deny by default: a role has exactly these permissions and nothing else. */
export const ROLE_PERMISSIONS: Record<StaffRole, readonly Permission[]> = {
  READ_ONLY: READ,
  OPERATOR: OPERATE,
  ADMIN: PERMISSIONS,
};

export function isStaffRole(v: unknown): v is StaffRole {
  return typeof v === "string" && (STAFF_ROLES as readonly string[]).includes(v);
}

export function hasPermission(role: string, permission: Permission): boolean {
  return isStaffRole(role) && ROLE_PERMISSIONS[role].includes(permission);
}

export function permissionsFor(role: string): Permission[] {
  return isStaffRole(role) ? [...ROLE_PERMISSIONS[role]] : [];
}

/**
 * B7 four-eyes: the person who recorded a reward's verification evidence (the requester) may not approve it when the
 * amount is above the threshold. TODO(spec): the threshold is undecided; the config default of 0 covers every reward.
 */
export function mayApproveReward(p: { approverId: string; requesterId: string | null; amountPence: number | null; thresholdPence: number }): boolean {
  if (p.requesterId === null || p.requesterId !== p.approverId) return true;
  return (p.amountPence ?? 0) <= p.thresholdPence;
}

export const TEMPLATE_KINDS = ["REMINDER_EMAIL", "LOOP_MESSAGE", "NOTIFICATION"] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

/** Merge fields each kind can use. Anything else is rejected so a typo never reaches a contractor. */
export const TEMPLATE_PLACEHOLDERS: Record<TemplateKind, readonly string[]> = {
  REMINDER_EMAIL: ["firstName", "endDate"],
  LOOP_MESSAGE: ["firstName"],
  NOTIFICATION: ["firstName", "endDate"],
};

export const TEMPLATE_LIMITS = { subject: 150, paragraph: 2000, paragraphs: 12 } as const;
export const TEMPLATE_KEY = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;

const FIELD = /\{\{\s*(\w+)\s*\}\}/g;

/** Returns human-readable problems; empty when the template is safe to publish as a new version. */
export function validateTemplate(t: { kind: TemplateKind; subject: string; body: string[] }): string[] {
  const issues: string[] = [];
  const allowed = TEMPLATE_PLACEHOLDERS[t.kind];
  const check = (label: string, text: string) => {
    for (const m of text.matchAll(FIELD)) {
      const name = m[1] ?? "";
      if (!allowed.includes(name)) issues.push(`${label}: unknown merge field {{${name}}} (allowed: ${allowed.join(", ")})`);
    }
    // Well-formed fields are removed above; any brace pair left over is malformed.
    if (/\{\{|\}\}/.test(text.replace(FIELD, ""))) issues.push(`${label}: malformed merge field`);
  };
  if (!t.subject.trim()) issues.push("subject is required");
  if (t.subject.length > TEMPLATE_LIMITS.subject) issues.push(`subject must be ${TEMPLATE_LIMITS.subject} characters or fewer`);
  if (/[\r\n]/.test(t.subject)) issues.push("subject must be a single line");
  check("subject", t.subject);
  if (t.body.length === 0 || t.body.every((p) => !p.trim())) issues.push("body is required");
  if (t.body.length > TEMPLATE_LIMITS.paragraphs) issues.push(`body must be ${TEMPLATE_LIMITS.paragraphs} paragraphs or fewer`);
  t.body.forEach((p, i) => {
    if (p.length > TEMPLATE_LIMITS.paragraph) issues.push(`paragraph ${i + 1} must be ${TEMPLATE_LIMITS.paragraph} characters or fewer`);
    check(`paragraph ${i + 1}`, p);
  });
  return issues;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p) || Number(p) > 255) return null;
    n = n * 256 + Number(p);
  }
  return n;
}

const normaliseIp = (ip: string): string => (ip.startsWith("::ffff:") && ip.includes(".") ? ip.slice(7) : ip.toLowerCase());

/**
 * Staff IP allow-list: exact addresses or IPv4 CIDR ranges. An empty list means no restriction (the edge enforces it
 * instead); a non-empty list with an unknown caller address denies.
 */
export function isIpAllowed(ip: string | undefined, allowList: readonly string[]): boolean {
  if (allowList.length === 0) return true;
  if (!ip) return false;
  const addr = normaliseIp(ip);
  for (const entry of allowList) {
    const slash = entry.indexOf("/");
    if (slash < 0) {
      if (normaliseIp(entry) === addr) return true;
      continue;
    }
    const base = ipv4ToInt(entry.slice(0, slash));
    const bits = Number(entry.slice(slash + 1));
    const value = ipv4ToInt(addr);
    if (base === null || value === null || !Number.isInteger(bits) || bits < 0 || bits > 32) continue;
    const size = 2 ** (32 - bits);
    if (Math.floor(base / size) === Math.floor(value / size)) return true;
  }
  return false;
}
