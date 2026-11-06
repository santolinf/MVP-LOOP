// Answers given before an account exists (profile review, account page). Kept in sessionStorage so they clear with the
// tab, and sent to the API once registration creates the session. Nothing here is a source of truth after that.
const PROFILE_KEY = "loop.join.profile";
const ACCOUNT_KEY = "loop.join.account";
const NOTICE_KEY = "loop.join.notice";

export interface ProfileDraft {
  fullName: string;
  title: string;
  /** Always three entries; blanks are dropped on save. */
  preferredRoles: [string, string, string];
  /** Comma separated, as typed. */
  skills: string;
  additionalRoles: string;
  linkedin: string;
  location: string;
  locationConfirmed: boolean;
}

export interface AccountDraft {
  email: string;
  mobile: string;
  introduced: "yes" | "no" | null;
  introducer: string;
  terms: boolean;
  offers: boolean;
}

export const EMPTY_PROFILE: ProfileDraft = {
  fullName: "",
  title: "",
  preferredRoles: ["", "", ""],
  skills: "",
  additionalRoles: "",
  linkedin: "",
  location: "",
  locationConfirmed: false,
};

export const EMPTY_ACCOUNT: AccountDraft = { email: "", mobile: "", introduced: null, introducer: "", terms: false, offers: false };

function read<T>(key: string, empty: T): T {
  if (typeof sessionStorage === "undefined") return empty;
  try {
    return { ...empty, ...JSON.parse(sessionStorage.getItem(key) ?? "{}") } as T;
  } catch {
    return empty;
  }
}

function write(key: string, value: unknown) {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be blocked; the draft then lasts only as long as the page.
  }
}

export const readProfileDraft = () => read<ProfileDraft>(PROFILE_KEY, EMPTY_PROFILE);
export const writeProfileDraft = (v: ProfileDraft) => write(PROFILE_KEY, v);
export const readAccountDraft = () => read<AccountDraft>(ACCOUNT_KEY, EMPTY_ACCOUNT);
export const writeAccountDraft = (v: AccountDraft) => write(ACCOUNT_KEY, v);

export function clearJoinDrafts() {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(PROFILE_KEY);
  sessionStorage.removeItem(ACCOUNT_KEY);
}

/** One-shot message carried to the next step (for example "we couldn't match your introducer"). */
export function setJoinNotice(message: string) {
  write(NOTICE_KEY, { message });
}

export function takeJoinNotice(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  const v = read<{ message?: string }>(NOTICE_KEY, {});
  sessionStorage.removeItem(NOTICE_KEY);
  return v.message ?? null;
}
