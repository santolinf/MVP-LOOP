// Anonymous CV draft token (spec A1/A2). Kept in sessionStorage so it clears with the tab.
const KEY = "loop.join.draft";

export interface DraftToken {
  draftToken: string;
  expiresAt: string;
}

export function readDraft(now = new Date()): DraftToken | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<DraftToken>;
    if (typeof v.draftToken !== "string" || typeof v.expiresAt !== "string") return null;
    if (new Date(v.expiresAt).getTime() <= now.getTime()) return null;
    return { draftToken: v.draftToken, expiresAt: v.expiresAt };
  } catch {
    return null;
  }
}

export function writeDraft(value: DraftToken): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(KEY, JSON.stringify(value));
}

export function clearDraft(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(KEY);
}
