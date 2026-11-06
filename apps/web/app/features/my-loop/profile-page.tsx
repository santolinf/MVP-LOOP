import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetJoinProfileQueryKey, getGetManualProfileQueryKey, getGetMeQueryKey, getGetReviewQueryKey } from "@loop/api-client";
import { Muted } from "../marketing/primitives";
import type { ProfileDraft } from "../join/join-draft";
import { ProfileForm, profileProblems, saveProfileDraft } from "../join/profile-form";
import { useServerProfileDraft } from "../join/profile-step";
import { BTN_PRIMARY, MeGate, PANEL, Status } from "./frame";

function Editor({ initial }: { initial: ProfileDraft }) {
  const qc = useQueryClient();
  const [value, setValue] = useState(initial);
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setSaved(false);
    const found = profileProblems(value);
    setProblems(found);
    if (found.length > 0) return;
    setError(null);
    setBusy(true);
    try {
      await saveProfileDraft(value);
      await Promise.all([
        qc.invalidateQueries({ queryKey: getGetMeQueryKey() }),
        qc.invalidateQueries({ queryKey: getGetManualProfileQueryKey() }),
        qc.invalidateQueries({ queryKey: getGetJoinProfileQueryKey() }),
        qc.invalidateQueries({ queryKey: getGetReviewQueryKey() }),
      ]);
      setSaved(true);
    } catch {
      setError("We couldn’t save your profile. Please check the details and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className={`${PANEL} grid max-w-[720px] gap-4`}>
      <ProfileForm value={value} onChange={setValue} />
      {problems.length > 0 && (
        <ul role="alert" className="grid gap-1 text-xs text-orange">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <Status error={error} saved={saved} />
      <div>
        <button type="submit" className={BTN_PRIMARY} disabled={busy}>
          Save profile
        </button>
      </div>
    </form>
  );
}

function Loader() {
  const { draft } = useServerProfileDraft();
  const [initial, setInitial] = useState<ProfileDraft | null>(null);
  // Start from what is stored, once, so a background refetch never overwrites what is being typed.
  useEffect(() => {
    if (draft && !initial) setInitial(draft);
  }, [draft, initial]);
  return initial ? <Editor initial={initial} /> : <Muted>Loading…</Muted>;
}

export function ProfilePage() {
  return (
    <MeGate selected="profile" title="Profile details" intro="Keep the details agencies see accurate. Saving here never changes your availability confirmation.">
      {() => <Loader />}
    </MeGate>
  );
}
