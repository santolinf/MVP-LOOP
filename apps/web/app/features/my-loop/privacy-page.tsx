import { useState } from "react";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  exportMyData,
  getGetConsentsQueryKey,
  getGetMeQueryKey,
  getGetReviewQueryKey,
  useDeleteMyAccount,
  useGetConsents,
  usePauseProfile,
  useUnpauseProfile,
  useUpdateConsents,
  useWithdrawProfile,
  type ConsentListDtoItemsItem,
  type MeDto,
} from "@loop/api-client";
import { Muted } from "../marketing/primitives";
import { BTN_DANGER, BTN_PRIMARY, BTN_SMALL, MeGate, PANEL, Status } from "./frame";

function Visibility({ me }: { me: MeDto }) {
  const qc = useQueryClient();
  const pause = usePauseProfile();
  const unpause = useUnpauseProfile();
  const withdraw = useWithdrawProfile();
  const [error, setError] = useState<string | null>(null);
  const busy = pause.isPending || unpause.isPending || withdraw.isPending;

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await Promise.all([
        qc.invalidateQueries({ queryKey: getGetMeQueryKey() }),
        qc.invalidateQueries({ queryKey: getGetConsentsQueryKey() }),
        qc.invalidateQueries({ queryKey: getGetReviewQueryKey() }),
      ]);
    } catch {
      setError("We couldn’t update your visibility. Please try again.");
    }
  }

  return (
    <section className={`${PANEL} grid gap-3`}>
      <h2 className="text-sm text-[#f0f6fa]">Visibility</h2>
      <p className="text-xs">
        Your profile is currently <strong>{me.paused ? "paused" : me.live ? "live" : "not live"}</strong>.
      </p>
      {me.live && (
        <div>
          <p className="mb-2 text-xs text-[#a0b8c6]">Pause hides you from search for now. You stay set up and can switch back on at any time.</p>
          {me.paused ? (
            <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => run(() => unpause.mutateAsync())}>
              Unpause my profile
            </button>
          ) : (
            <button type="button" className={BTN_SMALL} disabled={busy} onClick={() => run(() => pause.mutateAsync())}>
              Pause my profile
            </button>
          )}
        </div>
      )}
      {(me.live || me.paused) && (
        <div>
          <p className="mb-2 text-xs text-[#a0b8c6]">
            Withdraw takes your profile off LIVE and withdraws your visibility consent. We keep your details, and you can go LIVE again later.
          </p>
          <button
            type="button"
            className={BTN_DANGER}
            disabled={busy}
            onClick={() => window.confirm("Withdraw your profile from LOOP?") && run(() => withdraw.mutateAsync())}
          >
            Withdraw my profile
          </button>
        </div>
      )}
      <Status error={error} saved={false} />
    </section>
  );
}

function Consents() {
  const qc = useQueryClient();
  const q = useGetConsents();
  const update = useUpdateConsents();
  const [error, setError] = useState<string | null>(null);
  const items = q.data?.status === 200 ? q.data.data.items : null;
  if (!items) return <Muted>{q.isError ? "We couldn’t load your choices." : "Loading…"}</Muted>;

  async function toggle(c: ConsentListDtoItemsItem, granted: boolean) {
    setError(null);
    try {
      await update.mutateAsync({ data: { changes: [granted ? { purpose: c.purpose, granted: true, wordingVersion: c.wordingVersion } : { purpose: c.purpose, granted: false }] } });
      await Promise.all([
        qc.invalidateQueries({ queryKey: getGetConsentsQueryKey() }),
        qc.invalidateQueries({ queryKey: getGetMeQueryKey() }),
        qc.invalidateQueries({ queryKey: getGetReviewQueryKey() }),
      ]);
    } catch {
      setError("We couldn’t save that choice. Please refresh and try again.");
    }
  }

  return (
    <section className={`${PANEL} grid gap-2.5`}>
      <h2 className="text-sm text-[#f0f6fa]">Your choices</h2>
      {items.map((c) => (
        <label key={c.purpose} className="flex items-start gap-3 text-xs">
          <input type="checkbox" className="mt-0.5 accent-lime" checked={c.granted} disabled={update.isPending} onChange={(e) => toggle(c, e.target.checked)} />
          <span>
            {c.wording}
            <span className="ml-2 text-[#89a4b5]">{c.required ? "(needed to be LIVE)" : "(optional)"}</span>
          </span>
        </label>
      ))}
      <Muted className="text-xs">Service and security emails, such as sign-in codes, are always sent.</Muted>
      <Status error={error} saved={false} />
    </section>
  );
}

function YourData() {
  const navigate = useNavigate();
  const del = useDeleteMyAccount();
  const [error, setError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");

  async function download() {
    setError(null);
    try {
      const res = await exportMyData();
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "my-loop-data.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("We couldn’t prepare your export. Please try again.");
    }
  }

  async function erase() {
    setError(null);
    try {
      await del.mutateAsync({ data: { confirm: true } });
      navigate("/", { replace: true });
    } catch {
      setError("We couldn’t start deleting your account. Please try again.");
    }
  }

  return (
    <section className={`${PANEL} grid gap-4`}>
      <h2 className="text-sm text-[#f0f6fa]">Your data</h2>
      <div>
        <p className="mb-2 text-xs text-[#a0b8c6]">Download everything we hold about you as a JSON file.</p>
        <button type="button" className={BTN_SMALL} onClick={download}>
          Export my data
        </button>
      </div>
      <div>
        <p className="mb-2 text-xs text-[#a0b8c6]">
          Deleting your account signs you out everywhere, removes your profile, CVs and details, and can’t be undone. Type DELETE to confirm.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input aria-label="Type DELETE to confirm" className="rounded-lg border border-[#465366] bg-transparent p-2 text-xs text-fg" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
          <button type="button" className={BTN_DANGER} disabled={confirmText !== "DELETE" || del.isPending} onClick={erase}>
            Delete my account
          </button>
        </div>
      </div>
      <Status error={error} saved={false} />
    </section>
  );
}

export function PrivacyPage() {
  return (
    <MeGate selected="privacy" title="Privacy & visibility" intro="Control who can see your profile, what we email you, and your data.">
      {(me) => (
        <div className="grid max-w-[820px] gap-3">
          <Visibility me={me} />
          <Consents />
          <YourData />
        </div>
      )}
    </MeGate>
  );
}
