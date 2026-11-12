import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  deleteMyPhoto,
  getGetMyPhotoQueryKey,
  getJoinProfile,
  updateJoinProfile,
  updateManualProfile,
  updateName,
  useGetMyPhoto,
  type JoinProfileDto,
} from "@loop/api-client";
import { Muted } from "../marketing/primitives";
import { Note, TextField, ConfirmBox } from "./form-bits";
import type { ProfileDraft } from "./join-draft";
import { PHOTO_ACCEPT, PHOTO_HELP, photoProblem, setPendingPhoto, uploadPhoto } from "./photo-upload";

/** Mirrors MIN_SKILLS in @loop/domain; the server enforces it at GO LIVE. */
const MIN_SKILLS = 5;

export const parseSkills = (s: string): string[] => [...new Set(s.split(",").map((x) => x.trim()).filter(Boolean))];

/** "Ada Lovelace" -> first "Ada", last "Lovelace"; everything before the last space is the first name. */
export function splitFullName(full: string): { firstName: string; lastName: string } | null {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] ?? "" };
}

/** What stops the Profile review step from continuing, worded for the contractor. Empty means ready. */
export function profileProblems(d: ProfileDraft): string[] {
  const out: string[] = [];
  if (!splitFullName(d.fullName)) out.push("Enter your first and last name.");
  if (!d.title.trim()) out.push("Enter your professional title.");
  if (parseSkills(d.skills).length < MIN_SKILLS) out.push(`Please enter at least ${MIN_SKILLS} relevant skills, separated by commas.`);
  if (d.linkedin.trim() && !/^https?:\/\/\S+$/i.test(d.linkedin.trim())) out.push("LinkedIn profile must be a web address starting with https://.");
  if (!d.location.trim()) out.push("Enter your current town or city.");
  else if (!d.locationConfirmed) out.push("Confirm that your current location is correct.");
  return out;
}

/**
 * Writes the Profile review answers for a signed-in contractor: name, headline and skills (the confirmed profile
 * fields), then the rest of the V33 profile. Existing preference answers in the same record are kept.
 */
export async function saveProfileDraft(d: ProfileDraft): Promise<void> {
  const name = splitFullName(d.fullName);
  if (!name) throw new Error("name");
  const skills = parseSkills(d.skills);
  const named = await updateName(name);
  if (named.status !== 200) throw new Error("name");
  const typed = await updateManualProfile({ headline: d.title.trim(), skills });
  if (typed.status !== 200) throw new Error("profile");
  const current = await getJoinProfile();
  if (current.status !== 200) throw new Error("join");
  const roles = d.preferredRoles.map((r) => r.trim()).filter(Boolean);
  const next: JoinProfileDto = {
    ...current.data,
    title: d.title.trim(),
    preferredRoles: roles,
    additionalRoles: d.additionalRoles.trim() || null,
    linkedinUrl: d.linkedin.trim() || null,
    location: d.location.trim(),
    locationConfirmed: d.locationConfirmed,
  };
  const saved = await updateJoinProfile(next);
  if (saved.status !== 200) throw new Error("join");
}

/**
 * Profile photograph. Signed in, a chosen image is uploaded and attached straight away; before an account exists it is
 * held in memory and uploaded when registration completes (see register-step), so it is never lost on the way to My LOOP.
 */
export type PhotoChange = { file: File | null; remove: boolean };

export function PhotoEditor({ signedIn, onStage }: { signedIn: boolean; onStage?: (change: PhotoChange) => void }) {
  const qc = useQueryClient();
  const stored = useGetMyPhoto({ query: { enabled: signedIn } });
  const storedUrl = stored.data?.status === 200 ? stored.data.data.url : null;
  const [local, setLocal] = useState<string | null>(null);
  const [notice, setNotice] = useState(PHOTO_HELP);
  const [busy, setBusy] = useState(false);
  const [broken, setBroken] = useState(false);
  const [removed, setRemoved] = useState(false);
  const shown = removed ? null : (local ?? (broken ? null : storedUrl));

  async function pick(file: File | undefined) {
    if (!file) return;
    const problem = photoProblem(file);
    if (problem) {
      setNotice(problem);
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setNotice("Could not read this image.");
    reader.onload = async () => {
      const preview = typeof reader.result === "string" ? reader.result : null;
      if (onStage) {
        // Inside an editor with Save / Cancel: nothing is uploaded until the contractor saves.
        setLocal(preview);
        setRemoved(false);
        onStage({ file, remove: false });
        setNotice("Your photo will be saved when you choose Save changes.");
        return;
      }
      if (!signedIn) {
        setPendingPhoto(file);
        setLocal(preview);
        setNotice("Your photo will be saved when you create your account.");
        return;
      }
      setBusy(true);
      try {
        await uploadPhoto(file);
        setLocal(preview);
        setBroken(false);
        setNotice("Photo saved.");
        await qc.invalidateQueries({ queryKey: getGetMyPhotoQueryKey() });
      } catch {
        setNotice("We couldn't save that photo. Please try again.");
      } finally {
        setBusy(false);
      }
    };
    reader.readAsDataURL(file);
  }

  async function remove() {
    if (onStage) {
      setLocal(null);
      setRemoved(true);
      onStage({ file: null, remove: true });
      setNotice("Your photo will be removed when you choose Save changes.");
      return;
    }
    if (!signedIn) {
      setPendingPhoto(null);
      setLocal(null);
      setNotice(PHOTO_HELP);
      return;
    }
    setBusy(true);
    try {
      await deleteMyPhoto();
      setLocal(null);
      setBroken(true);
      setNotice("Photo removed.");
      await qc.invalidateQueries({ queryKey: getGetMyPhotoQueryKey() });
    } catch {
      setNotice("We couldn't remove that photo. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-5 rounded-xl border border-[#294357] p-4">
      <div className="grid h-[88px] w-[88px] place-items-center overflow-hidden rounded-full border-[3px] border-lime bg-[#113348]">
        {shown ? (
          <img src={shown} alt="Contractor profile preview" className="h-full w-full object-cover" onError={() => (local ? undefined : setBroken(true))} />
        ) : (
          <img src="/assets/loop-logo-header.png" alt="LOOP default profile image" className="w-[70%]" />
        )}
      </div>
      <div className="min-w-[220px] flex-1">
        <strong>Profile photo (optional)</strong>
        <Muted className="mb-2 text-sm">Add a clear photo if you wish. If you don't, your profile will display the LOOP logo.</Muted>
        <label
          className={`inline-flex cursor-pointer items-center rounded-full border border-[#465366] px-4 py-2 text-sm font-extrabold text-fg hover:border-lime ${busy ? "pointer-events-none opacity-50" : ""}`}
        >
          {shown ? "Change photo" : "Add a photo"}
          <input
            type="file"
            className="sr-only"
            accept={PHOTO_ACCEPT}
            disabled={busy}
            onChange={(e) => {
              void pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        {shown && (
          <button type="button" disabled={busy} className="ml-2 rounded-full border border-[#465366] px-4 py-2 text-sm font-extrabold text-fg disabled:opacity-50" onClick={remove}>
            Remove photo
          </button>
        )}
        <p className="mt-2 text-sm text-muted" role="status">
          {notice}
        </p>
      </div>
    </div>
  );
}

/** The Profile review fields, exactly as the V33 reference shows them. Controlled; the caller owns validation and saving. */
export function ProfileForm({
  value,
  onChange,
  signedIn = false,
  onPhotoStage,
}: {
  value: ProfileDraft;
  onChange: (v: ProfileDraft) => void;
  signedIn?: boolean;
  onPhotoStage?: (change: PhotoChange) => void;
}) {
  const set = <K extends keyof ProfileDraft>(k: K, v: ProfileDraft[K]) => onChange({ ...value, [k]: v });
  const setRole = (i: number, v: string) => {
    const roles: [string, string, string] = [...value.preferredRoles];
    roles[i] = v;
    set("preferredRoles", roles);
  };
  return (
    <div className="grid gap-4">
      <PhotoEditor signedIn={signedIn} onStage={onPhotoStage} />
      <TextField label="Full name" required value={value.fullName} placeholder="Your name" autoComplete="name" maxLength={160} onChange={(v) => set("fullName", v)} />
      <TextField label="Professional title" required value={value.title} placeholder="e.g. Senior Data Engineer" maxLength={200} onChange={(v) => set("title", v)} />
      <Note>
        <strong>Three roles that best describe you</strong>
        <Muted className="mt-1 text-sm">
          Choose up to three role titles you want agencies to find you for. These do not replace your actual CV job titles.
        </Muted>
      </Note>
      {[0, 1, 2].map((i) => (
        <TextField
          key={i}
          label={`Preferred role ${i + 1}`}
          value={value.preferredRoles[i] ?? ""}
          placeholder={i === 0 ? "e.g. Senior Data Engineer" : "Optional"}
          maxLength={120}
          onChange={(v) => setRole(i, v)}
        />
      ))}
      <TextField
        label="Key skills (comma separated)"
        required
        value={value.skills}
        placeholder="e.g. Python, SQL, AWS"
        onChange={(v) => set("skills", v)}
        hint="Confirm at least five relevant skills; ten or more is encouraged. Put your five strongest skills first."
      />
      <TextField
        label="Additional roles you would consider (optional)"
        value={value.additionalRoles}
        placeholder="e.g. Data Architect, Analytics Engineer"
        maxLength={300}
        onChange={(v) => set("additionalRoles", v)}
      />
      <TextField
        label="LinkedIn profile"
        type="url"
        value={value.linkedin}
        placeholder="https://www.linkedin.com/in/your-profile"
        maxLength={300}
        onChange={(v) => set("linkedin", v)}
        hint="Add your LinkedIn profile if you have one."
      />
      <Note>
        <strong>Your home location — please confirm manually</strong>
        <Muted className="mt-1 text-sm">
          AI may suggest a location from your CV, but you must check and confirm where you are based. Work locations are selected separately.
        </Muted>
      </Note>
      <TextField label="Your current town or city" required value={value.location} placeholder="e.g. Edinburgh" maxLength={120} onChange={(v) => set("location", v)} />
      <ConfirmBox checked={value.locationConfirmed} onChange={(v) => set("locationConfirmed", v)}>
        I confirm my current location is correct. *
      </ConfirmBox>
    </div>
  );
}
