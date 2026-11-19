import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetJoinProfileQueryKey,
  getGetManualProfileQueryKey,
  getGetMeQueryKey,
  useGetJoinProfile,
  useGetManualProfile,
} from "@loop/api-client";
import { BTN_OUTLINE, BTN_SOLID, Card, Muted, PAGE_H1 } from "../marketing/primitives";
import { useMe } from "../my-loop/use-me";
import { Note } from "./form-bits";
import { readProfileDraft, writeProfileDraft, type ProfileDraft } from "./join-draft";
import { ProfileForm, profileProblems, saveProfileDraft } from "./profile-form";
import { StepBar } from "./step-bar";

/** Builds the editable draft from what the server already holds (a contractor who is signed in). */
export function useServerProfileDraft(): { draft: ProfileDraft | null; ready: boolean } {
  const { me } = useMe();
  const manual = useGetManualProfile({ query: { enabled: !!me } });
  const join = useGetJoinProfile({ query: { enabled: !!me } });
  const m = manual.data?.status === 200 ? manual.data.data : null;
  const j = join.data?.status === 200 ? join.data.data : null;
  if (!me || !m || !j) return { draft: null, ready: !me };
  const roles = [...j.preferredRoles, "", "", ""].slice(0, 3) as [string, string, string];
  return {
    ready: true,
    draft: {
      fullName: [me.firstName, me.lastName].filter(Boolean).join(" "),
      title: j.title ?? m.headline ?? "",
      preferredRoles: roles,
      skills: m.skills.join(", "),
      additionalRoles: j.additionalRoles ?? "",
      linkedin: j.linkedinUrl ?? "",
      location: j.location ?? "",
      locationConfirmed: j.locationConfirmed,
    },
  };
}

/**
 * Join step 2 (V33 "Profile review"). Before an account exists the answers are held in the browser and sent when the
 * account is created; a contractor who is already signed in has them saved straight away.
 * TODO(spec): CV auto-population is deferred (issue #18); the fields start empty until extraction can fill them.
 */
export function ProfileStep() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { me, isPending } = useMe();
  const server = useServerProfileDraft();
  const [value, setValue] = useState<ProfileDraft>(() => readProfileDraft());
  const [loaded, setLoaded] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A signed-in contractor edits what is stored, not an old browser draft. Applied once.
  useEffect(() => {
    if (loaded || !server.draft) return;
    setLoaded(true);
    setValue(server.draft);
  }, [server.draft, loaded]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const found = profileProblems(value);
    setProblems(found);
    if (found.length > 0) return;
    setError(null);
    writeProfileDraft(value);
    if (!me) {
      navigate("/join/register");
      return;
    }
    setBusy(true);
    try {
      await saveProfileDraft(value);
      await Promise.all([
        qc.invalidateQueries({ queryKey: getGetMeQueryKey() }),
        qc.invalidateQueries({ queryKey: getGetManualProfileQueryKey() }),
        qc.invalidateQueries({ queryKey: getGetJoinProfileQueryKey() }),
      ]);
      navigate("/join/availability");
    } catch {
      setError("We couldn't save your profile. Please check the details and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-[720px] px-5 py-12">
      <StepBar step={2} />
      <Card className="!border-[#294357] !bg-[#0b2237] !bg-none !p-8">
        <h1 className={PAGE_H1}>Review your CV profile</h1>
        <Muted className="mb-6">
          AI will pre-populate what it can from your CV — including your name, previous job titles, relevant skills and other supported details. Review,
          correct, confirm and add anything missing.
        </Muted>
        <div className="mb-6">
          <Note>
            <strong>Not switched on yet:</strong> automatic pre-population from your CV is coming. For now, please enter your details yourself; you
            always confirm them.
          </Note>
        </div>
        {isPending ? (
          <Muted>Loading…</Muted>
        ) : (
          <form onSubmit={submit} noValidate className="grid gap-5">
            <ProfileForm value={value} onChange={setValue} signedIn={!!me} />
            {problems.length > 0 && (
              <ul role="alert" className="grid gap-1 text-orange">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            {error && (
              <p role="alert" className="text-red">
                {error}
              </p>
            )}
            <div className="flex items-center justify-between gap-3">
              <Link to="/join/cv" className={BTN_OUTLINE}>
                ← Back
              </Link>
              <button type="submit" className={BTN_SOLID} disabled={busy}>
                Continue →
              </button>
            </div>
          </form>
        )}
      </Card>
    </section>
  );
}
