import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetIntroducerQueryKey, useGetIntroducer, useLookupIntroducer, useSetIntroducer } from "@loop/api-client";
import { Muted } from "../marketing/primitives";
import { clearReferralCode } from "./referral-capture";

const INPUT = "w-full rounded-lg border border-[#465366] bg-transparent p-3 text-fg";
const LINK_BTN = "text-sm font-semibold underline hover:text-lime";

/**
 * "Who introduced you?" A link or QR code may have preselected someone; the registrant confirms or corrects it.
 * A verbal introducer is found by their exact email and confirmed from a masked name; there is no directory.
 * Once registration completes (GO LIVE) the introducer is locked.
 */
export function IntroducerPicker() {
  const qc = useQueryClient();
  const current = useGetIntroducer();
  const lookup = useLookupIntroducer();
  const set = useSetIntroducer();
  const [mode, setMode] = useState<"view" | "email" | "code">("view");
  const [value, setValue] = useState("");
  const [match, setMatch] = useState<{ maskedName: string; code: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const introducer = current.data?.status === 200 ? current.data.data : null;
  const busy = lookup.isPending || set.isPending;

  async function save(code: string, source: "CODE" | "VERBAL") {
    setMessage(null);
    try {
      const res = await set.mutateAsync({ data: { code, source } });
      if (!res.data.attributed) {
        setMessage("We couldn't use that introducer. You can't introduce yourself, and the code must be a LOOP member's.");
        return;
      }
      clearReferralCode();
      await qc.invalidateQueries({ queryKey: getGetIntroducerQueryKey() });
      setMode("view");
      setValue("");
      setMatch(null);
    } catch {
      setMessage("We couldn't save your introducer just now. Please try again.");
    }
  }

  async function find(e: FormEvent) {
    e.preventDefault();
    if (busy || value.trim() === "") return;
    setMessage(null);
    setMatch(null);
    try {
      const res = await lookup.mutateAsync({ data: { email: value.trim() } });
      if (res.status === 200 && res.data.found && res.data.maskedName && res.data.code) {
        setMatch({ maskedName: res.data.maskedName, code: res.data.code });
      } else {
        setMessage("We couldn't find a member with that email address.");
      }
    } catch {
      setMessage("We couldn't check that just now. Please wait a moment and try again.");
    }
  }

  function submitCode(e: FormEvent) {
    e.preventDefault();
    if (busy || value.trim() === "") return;
    void save(value.trim(), "CODE");
  }

  return (
    <section aria-labelledby="introducer-heading" className="mb-8 rounded-xl border border-[#294357] p-5">
      <h2 id="introducer-heading" className="mb-2 text-lg font-bold tracking-[-0.02em] text-fg">
        Who introduced you?
      </h2>
      {introducer?.maskedName ? (
        <p className="mb-2">
          Introduced by <strong>{introducer.maskedName}</strong>
          {introducer.locked ? ". This is now locked." : "."}
        </p>
      ) : (
        <Muted className="mb-2">Optional. If a LOOP member introduced you, tell us who so they get the credit.</Muted>
      )}
      {!introducer?.locked && mode === "view" && (
        <div className="flex flex-wrap gap-4">
          <button type="button" className={LINK_BTN} onClick={() => setMode("email")}>
            Find them by email
          </button>
          <button type="button" className={LINK_BTN} onClick={() => setMode("code")}>
            I have their introduction code
          </button>
        </div>
      )}
      {mode === "email" && (
        <form onSubmit={find} className="grid gap-3">
          <label>
            <span className="mb-1 block font-semibold">Their email address</span>
            <input className={INPUT} type="email" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} />
          </label>
          <Muted className="text-sm">We only confirm an exact match, and show you part of their name. We never list members.</Muted>
          {match && (
            <p>
              Is this them? <strong>{match.maskedName}</strong>{" "}
              <button type="button" className={LINK_BTN} disabled={busy} onClick={() => void save(match.code, "VERBAL")}>
                Yes, confirm
              </button>
            </p>
          )}
          <div className="flex gap-4">
            <button type="submit" className={LINK_BTN} disabled={busy}>
              Check
            </button>
            <button type="button" className={LINK_BTN} onClick={() => { setMode("view"); setMatch(null); setMessage(null); }}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {mode === "code" && (
        <form onSubmit={submitCode} className="grid gap-3">
          <label>
            <span className="mb-1 block font-semibold">Introduction code</span>
            <input className={INPUT} autoComplete="off" maxLength={32} value={value} onChange={(e) => setValue(e.target.value)} />
          </label>
          <div className="flex gap-4">
            <button type="submit" className={LINK_BTN} disabled={busy}>
              Use this code
            </button>
            <button type="button" className={LINK_BTN} onClick={() => { setMode("view"); setMessage(null); }}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {message && (
        <p role="alert" className="mt-2 text-red">
          {message}
        </p>
      )}
    </section>
  );
}
