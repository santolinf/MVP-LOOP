import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getJoinProfile, updateJoinProfile, useConfirmAvailability, useGetJoinProfile, type ConfirmAvailabilityDto, type MeDto } from "@loop/api-client";
import { uuid } from "../../lib/uuid";
import { OptionGroup, Radio, TextField } from "../join/form-bits";
import type { ProfileDraft } from "../join/join-draft";
import { PreferencesEditor } from "../join/preferences-form";
import { ProfileForm, profileProblems, saveProfileDraft } from "../join/profile-form";
import { useServerProfileDraft } from "../join/profile-step";
import { Muted } from "../marketing/primitives";
import { BTN, BTN_PRIMARY, BTN_SMALL, PROTO_BUTTONS_WITHIN, PROTO_FONT } from "./desktop-profile-ui";

/** Overlay editors for the desktop My LOOP profile (approved prototype): edit in place, then return to the page. They reuse the existing APIs and rules. */

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  // Callers pass a fresh function each render; a ref keeps the effect (and focus) from re-running while the user types.
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previous?.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="my-loop-edit-heading"
        tabIndex={-1}
        className={`mx-auto max-w-[760px] rounded-[14px] border border-[#4c646c] bg-[#0b2237] p-[25px] text-[15px] leading-normal outline-none ${PROTO_BUTTONS_WITHIN}`}
        style={{ fontFamily: PROTO_FONT }}
      >
        <div className="mb-1 flex items-center justify-between gap-3">
          <h2 id="my-loop-edit-heading" className="text-xl font-bold text-[#f4f9ff]">
            {title}
          </h2>
          <button type="button" onClick={onClose} className={`${BTN} ${BTN_SMALL}`}>
            ✕ Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

type Situation = "in-contract" | "available-now" | "available-soon" | "permanent";
const OPTIONS: { value: Situation; label: string }[] = [
  { value: "in-contract", label: "In Contract" },
  { value: "available-now", label: "Available Now" },
  { value: "available-soon", label: "Available Soon" },
  { value: "permanent", label: "Permanently Employed — open to contracting" },
];

function situationOf(me: MeDto): Situation {
  if (me.employment === "PERMANENT") return "permanent";
  if (me.employment === "BETWEEN_CONTRACTS") return me.availableFrom ? "available-soon" : "available-now";
  return "in-contract";
}

/** "Update availability": the contractor explicitly confirms status. An end date alone never turns them green (B3). */
export function AvailabilityEditor({ me, onClose }: { me: MeDto; onClose: () => void }) {
  const qc = useQueryClient();
  const saved = useGetJoinProfile();
  const profile = saved.data?.status === 200 ? saved.data.data : null;
  const [situation, setSituation] = useState<Situation | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [start, setStart] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const key = useRef(uuid());
  const confirm = useConfirmAvailability({ request: { headers: { "Idempotency-Key": key.current } } });

  const current = situation ?? situationOf(me);
  const endValue = endDate ?? me.contractEndDate ?? "";
  const fromValue = from ?? me.availableFrom ?? "";
  const noticeValue = notice ?? profile?.noticePeriodText ?? "";
  const startValue = start ?? profile?.earliestStartDate ?? "";
  const missing =
    (current === "in-contract" && !endValue) || (current === "available-soon" && !fromValue) || (current === "permanent" && (!noticeValue.trim() || !startValue));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (missing) {
      setError(
        current === "in-contract"
          ? "Enter your expected contract end date."
          : current === "available-soon"
            ? "Enter the date you are available from."
            : "Enter your notice period and earliest possible start date.",
      );
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const data: ConfirmAvailabilityDto =
        current === "in-contract"
          ? { employment: "CONTRACTING", availableFrom: null, contractEndDate: endValue }
          : current === "permanent"
            ? { employment: "PERMANENT", availableFrom: null, contractEndDate: null }
            : { employment: "BETWEEN_CONTRACTS", availableFrom: current === "available-soon" ? fromValue : null, contractEndDate: null };
      await confirm.mutateAsync({ data });
      // Notice and start date belong to permanent employees only; keep the stored record in step with the answer.
      const stored = await getJoinProfile();
      if (stored.status === 200) {
        await updateJoinProfile({
          ...stored.data,
          noticePeriodText: current === "permanent" ? noticeValue.trim() : null,
          earliestStartDate: current === "permanent" ? startValue : null,
        });
      }
      await qc.invalidateQueries();
      onClose();
    } catch {
      setError("We couldn't save that. Please check the dates and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Update availability" onClose={onClose}>
      <p className="mb-3 text-xs text-[#9fb1b8]">Only save the details you want to change.</p>
      <form onSubmit={submit} noValidate className="grid gap-4">
        <OptionGroup legend="Availability status">
          {OPTIONS.map((o) => (
            <Radio key={o.value} name="situation" label={o.label} checked={current === o.value} onChange={() => setSituation(o.value)} />
          ))}
        </OptionGroup>
        {current === "in-contract" && <TextField label="Expected contract end date" type="date" required value={endValue} onChange={setEndDate} />}
        {current === "available-soon" && <TextField label="Available from" type="date" required value={fromValue} onChange={setFrom} />}
        {current === "permanent" && (
          <>
            <TextField label="Notice period" required value={noticeValue} placeholder="e.g. 4 weeks" maxLength={60} onChange={setNotice} />
            <TextField label="Earliest possible start date" type="date" required value={startValue} onChange={setStart} />
          </>
        )}
        <p className="text-[11px] text-[#89a4b5]">Available Now requires your explicit confirmation. An end date alone will not make you green.</p>
        {error && (
          <p role="alert" className="text-xs text-red">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2.5">
          <button type="button" onClick={onClose} className={BTN}>
            Cancel
          </button>
          <button type="submit" className={BTN_PRIMARY} disabled={busy}>
            Save changes
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ProfileDetails({ initial, onClose }: { initial: ProfileDraft; onClose: () => void }) {
  const qc = useQueryClient();
  const [value, setValue] = useState(initial);
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const found = profileProblems(value);
    setProblems(found);
    if (found.length > 0) return;
    setError(null);
    setBusy(true);
    try {
      await saveProfileDraft(value);
      await qc.invalidateQueries();
      onClose();
    } catch {
      setError("We couldn’t save your profile. Please check the details and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate aria-label="Professional details" className="grid gap-4">
      <ProfileForm value={value} onChange={setValue} signedIn />
      {problems.length > 0 && (
        <ul role="alert" className="grid gap-1 text-xs text-orange">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-xs text-red">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2.5">
        <button type="button" onClick={onClose} className={BTN}>
          Cancel
        </button>
        <button type="submit" className={BTN_PRIMARY} disabled={busy}>
          Save changes
        </button>
      </div>
    </form>
  );
}

/** "Edit my profile": professional details, then rates, locations and working pattern, each saved through the existing profile APIs. */
export function ProfileEditor({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { draft } = useServerProfileDraft();
  const [initial, setInitial] = useState<ProfileDraft | null>(null);
  const [prefsSaved, setPrefsSaved] = useState(false);
  // Start from what is stored, once, so a background refetch never overwrites what is being typed.
  useEffect(() => {
    if (draft && !initial) setInitial(draft);
  }, [draft, initial]);

  return (
    <Modal title="Edit my profile" onClose={onClose}>
      <p className="mb-3 text-xs text-[#9fb4c3]">Only save the details you want to change. Saving here never changes your availability confirmation.</p>
      {initial ? <ProfileDetails initial={initial} onClose={onClose} /> : <Muted>Loading…</Muted>}
      <h3 className="mb-2 mt-6 border-t border-[#1a4153] pt-4 text-sm font-bold text-[#f0f6fa]">Rates, locations &amp; working pattern</h3>
      <div className="[&_a[href='/my-loop']]:hidden">
        <PreferencesEditor
          backTo="/my-loop"
          submitLabel="Save preferences"
          onSaved={() => {
            setPrefsSaved(true);
            void qc.invalidateQueries();
          }}
        />
      </div>
      {prefsSaved && (
        <p role="status" className="mt-2 text-xs text-lime">
          Preferences saved.
        </p>
      )}
    </Modal>
  );
}
