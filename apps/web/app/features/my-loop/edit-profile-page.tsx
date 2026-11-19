import { useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetMeQueryKey,
  getListAssignmentsQueryKey,
  useConfirmAvailability,
  useCreateAssignment,
  useListAssignments,
  type MeDto,
} from "@loop/api-client";
import { uuid } from "../../lib/uuid";
import { Muted } from "../marketing/primitives";
import { Upload } from "./cv-page";
import { BTN_PRIMARY, BTN_SMALL, Field, INPUT, MeGate, PANEL, Status } from "./frame";

/** Confirms the current situation again with a (possibly new) contract end date, or unchanged for "my profile is current". */
function useConfirm() {
  const qc = useQueryClient();
  const key = useRef(uuid());
  const confirm = useConfirmAvailability({ request: { headers: { "Idempotency-Key": key.current } } });
  return {
    pending: confirm.isPending,
    run: async (data: Parameters<typeof confirm.mutateAsync>[0]["data"]) => {
      key.current = uuid();
      await confirm.mutateAsync({ data });
      await qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
    },
  };
}

function EndDate({ me }: { me: MeDto }) {
  const confirm = useConfirm();
  const [date, setDate] = useState(me.contractEndDate ?? "");
  const [msg, setMsg] = useState<{ error: string | null; saved: boolean }>({ error: null, saved: false });

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!date) return setMsg({ error: "Please enter an end date.", saved: false });
    try {
      await confirm.run({ employment: "CONTRACTING", availableFrom: null, contractEndDate: date });
      setMsg({ error: null, saved: true });
    } catch {
      setMsg({ error: "We couldn’t save that date. Please try again.", saved: false });
    }
  }

  return (
    <form onSubmit={save} className={`${PANEL} grid gap-3`}>
      <h2 className="text-sm text-[#f0f6fa]">1 · Update your contract end date</h2>
      <Muted className="text-xs">
        If your contract extends or finishes early, just change the date. A date passing does not automatically mean you are available.
      </Muted>
      <Field label="Expected contract end date">
        <input type="date" className={INPUT} value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Status error={msg.error} saved={msg.saved} />
      <p className="text-xs text-[#9fb4c3]">Current availability: {me.availability.label}</p>
      <div>
        <button type="submit" className={BTN_PRIMARY} disabled={confirm.pending}>
          Save end date
        </button>
      </div>
    </form>
  );
}

function AddAssignment() {
  const qc = useQueryClient();
  const create = useCreateAssignment();
  const list = useListAssignments();
  const items = list.data?.status === 200 ? list.data.data.items : [];
  const [v, setV] = useState({ client: "", role: "", start: "", end: "" });
  const [msg, setMsg] = useState<{ error: string | null; saved: boolean }>({ error: null, saved: false });

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await create.mutateAsync({
        data: {
          clientName: v.client.trim(),
          supplyingCompany: null,
          role: v.role.trim(),
          startDate: `${v.start}-01`,
          endDate: v.end ? `${v.end}-01` : null,
          assignmentRef: null,
        },
      });
      await qc.invalidateQueries({ queryKey: getListAssignmentsQueryKey() });
      setV({ client: "", role: "", start: "", end: "" });
      setMsg({ error: null, saved: true });
    } catch {
      setMsg({ error: "We couldn’t save that. The start date can’t be in the future and the end date can’t be before the start.", saved: false });
    }
  }

  return (
    <form onSubmit={submit} className={`${PANEL} grid gap-3`}>
      <h2 className="text-sm text-[#f0f6fa]">2 · Add your latest assignment</h2>
      <Muted className="text-xs">No new CV needed. Add an assignment to your living LOOP profile.</Muted>
      <Field label="Client / company">
        <input className={INPUT} required maxLength={120} placeholder="e.g. Tesco Bank" value={v.client} onChange={(e) => setV({ ...v, client: e.target.value })} />
      </Field>
      <Field label="Job title">
        <input className={INPUT} required maxLength={120} placeholder="e.g. Senior Data Engineer" value={v.role} onChange={(e) => setV({ ...v, role: e.target.value })} />
      </Field>
      <Field label="Start date">
        <input type="month" className={INPUT} required value={v.start} onChange={(e) => setV({ ...v, start: e.target.value })} />
      </Field>
      <Field label="End date (leave blank if ongoing)">
        <input type="month" className={INPUT} value={v.end} onChange={(e) => setV({ ...v, end: e.target.value })} />
      </Field>
      <Status error={msg.error} saved={msg.saved} />
      <div>
        <button type="submit" className={BTN_PRIMARY} disabled={create.isPending}>
          Add assignment to profile →
        </button>
      </div>
      {items.length > 0 ? (
        <ul className="grid gap-1 text-xs text-[#a7bdc9]">
          {items.map((a) => (
            <li key={a.id}>
              <strong className="text-[#f0f6fa]">{a.role}</strong> · {a.clientName} · {a.startDate} – {a.endDate ?? "Ongoing"}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-[#9fb4c3]">No assignments added yet.</p>
      )}
    </form>
  );
}

function ConfirmCurrent({ me }: { me: MeDto }) {
  const confirm = useConfirm();
  const [msg, setMsg] = useState<{ error: string | null; saved: boolean }>({ error: null, saved: false });
  const last = me.availability.lastConfirmedAt ? new Date(me.availability.lastConfirmedAt).toLocaleDateString("en-GB") : "Not yet confirmed";

  async function confirmNow() {
    if (!me.employment) return setMsg({ error: "Confirm your availability first.", saved: false });
    try {
      await confirm.run({ employment: me.employment, availableFrom: me.availableFrom, contractEndDate: me.contractEndDate });
      setMsg({ error: null, saved: true });
    } catch {
      setMsg({ error: "We couldn’t record that. If a date has passed, update your availability first.", saved: false });
    }
  }

  return (
    <section className={`${PANEL} grid gap-3`}>
      <h2 className="text-sm text-[#f0f6fa]">4 · Confirm your profile is current</h2>
      <Muted className="text-xs">Review your details, assignments and availability before confirming.</Muted>
      <p className="text-xs text-[#9fb4c3]">Last verified: {last}</p>
      <Status error={msg.error} saved={msg.saved} />
      <div className="flex flex-wrap gap-2">
        <Link to="/my-loop" className={BTN_SMALL}>
          Review my profile
        </Link>
        <button type="button" className={BTN_PRIMARY} disabled={confirm.pending} onClick={confirmNow}>
          I confirm my profile is current
        </button>
      </div>
    </section>
  );
}

/** "Edit my profile" (the V33 reference's "Profile updates"): four simple ways to keep a LIVE profile current, no repeated CV upload needed. */
export function EditProfilePage() {
  const qc = useQueryClient();
  return (
    <MeGate selected="edit" title="Edit my profile" intro="Keep your profile current. Four simple ways to keep your experience and availability up to date.">
      {(me) => (
        <div className="grid max-w-[720px] gap-3">
          <EndDate me={me} />
          <AddAssignment />
          <section className="grid gap-3">
            <Muted className="text-xs">3 · Upload a replacement CV. We compare it with your confirmed profile and ask you to approve any changes.</Muted>
            <Upload onUploaded={() => void qc.invalidateQueries()} />
          </section>
          <ConfirmCurrent me={me} />
          <div className="flex flex-wrap gap-2">
            <Link to="/my-loop" className={BTN_SMALL}>
              ← My LOOP
            </Link>
            <Link to="/my-loop/profile" className={BTN_SMALL}>
              Edit profile details
            </Link>
            <Link to="/my-loop/preferences" className={BTN_SMALL}>
              Edit preferences
            </Link>
          </div>
        </div>
      )}
    </MeGate>
  );
}
