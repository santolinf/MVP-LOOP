import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListAssignmentsQueryKey,
  useCreateAssignment,
  useDeleteAssignment,
  useListAssignments,
  useUpdateAssignment,
  type AssignmentInputDto,
  type AssignmentListDtoItemsItem,
} from "@loop/api-client";
import { Muted } from "../marketing/primitives";
import { BTN_DANGER, BTN_PRIMARY, BTN_SMALL, Field, INPUT, MeGate, PANEL, Status } from "./frame";

const EMPTY: AssignmentInputDto = { clientName: "", supplyingCompany: null, role: "", startDate: "", endDate: null, assignmentRef: null };

function AssignmentForm({ initial, id, onDone }: { initial: AssignmentInputDto; id?: string; onDone: () => void }) {
  const qc = useQueryClient();
  const create = useCreateAssignment();
  const update = useUpdateAssignment();
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const data: AssignmentInputDto = {
      clientName: v.clientName.trim(),
      supplyingCompany: v.supplyingCompany?.trim() || null,
      role: v.role.trim(),
      startDate: v.startDate,
      endDate: v.endDate || null,
      assignmentRef: v.assignmentRef?.trim() || null,
    };
    try {
      if (id) await update.mutateAsync({ assignmentId: id, data });
      else await create.mutateAsync({ data });
      await qc.invalidateQueries({ queryKey: getListAssignmentsQueryKey() });
      onDone();
    } catch {
      setError("We couldn’t save that. The start date can’t be in the future and the end date can’t be before the start.");
    }
  }

  return (
    <form onSubmit={submit} className={`${PANEL} grid max-w-[720px] gap-3`}>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Client">
          <input className={INPUT} required maxLength={120} value={v.clientName} onChange={(e) => setV({ ...v, clientName: e.target.value })} />
        </Field>
        <Field label="Supplying company (agency), if any">
          <input className={INPUT} maxLength={120} value={v.supplyingCompany ?? ""} onChange={(e) => setV({ ...v, supplyingCompany: e.target.value })} />
        </Field>
        <Field label="Role">
          <input className={INPUT} required maxLength={120} value={v.role} onChange={(e) => setV({ ...v, role: e.target.value })} />
        </Field>
        <Field label="Assignment ID, if known">
          <input className={INPUT} maxLength={60} value={v.assignmentRef ?? ""} onChange={(e) => setV({ ...v, assignmentRef: e.target.value })} />
        </Field>
        <Field label="Start date">
          <input type="date" className={INPUT} required value={v.startDate} onChange={(e) => setV({ ...v, startDate: e.target.value })} />
        </Field>
        <Field label="End date (leave blank if ongoing)">
          <input type="date" className={INPUT} value={v.endDate ?? ""} onChange={(e) => setV({ ...v, endDate: e.target.value })} />
        </Field>
      </div>
      <Status error={error} saved={false} />
      <div className="flex gap-2">
        <button type="submit" className={BTN_PRIMARY} disabled={create.isPending || update.isPending}>
          {id ? "Save changes" : "Add assignment"}
        </button>
        <button type="button" className={BTN_SMALL} onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function Row({ a, onEdit }: { a: AssignmentListDtoItemsItem; onEdit: () => void }) {
  const qc = useQueryClient();
  const del = useDeleteAssignment();
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm(`Delete "${a.role}" at ${a.clientName}?`)) return;
    setError(null);
    try {
      await del.mutateAsync({ assignmentId: a.id });
      await qc.invalidateQueries({ queryKey: getListAssignmentsQueryKey() });
    } catch {
      setError("We couldn’t delete that. Please try again.");
    }
  }

  return (
    <li className={`${PANEL} flex flex-wrap items-start justify-between gap-3`}>
      <div className="text-xs text-[#edf5f7]">
        <p className="text-sm font-bold text-[#f0f6fa]">{a.role}</p>
        <p>
          {a.clientName}
          {a.supplyingCompany ? ` · via ${a.supplyingCompany}` : ""}
        </p>
        <p className="text-[#a0b8c6]">
          {a.startDate} – {a.endDate ?? "ongoing"}
          {a.assignmentRef ? ` · ID ${a.assignmentRef}` : ""}
        </p>
        <Status error={error} saved={false} />
      </div>
      <div className="flex gap-2">
        <button type="button" className={BTN_SMALL} onClick={onEdit}>
          Edit
        </button>
        <button type="button" className={BTN_DANGER} onClick={remove} disabled={del.isPending}>
          Delete
        </button>
      </div>
    </li>
  );
}

function List() {
  const q = useListAssignments();
  // "new" = adding, an id = editing that row, null = just the list.
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const items = q.data?.status === 200 ? q.data.data.items : null;
  if (!items) return <Muted>{q.isError ? "We couldn’t load your assignments." : "Loading…"}</Muted>;
  return (
    <div className="grid gap-3">
      {items.length === 0 && editing !== "new" && <Muted>No assignments yet. Add your past and current assignments, no CV needed.</Muted>}
      <ul className="grid gap-2.5">
        {items.map((a) =>
          editing === a.id ? (
            <li key={a.id}>
              <AssignmentForm id={a.id} initial={a} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <Row key={a.id} a={a} onEdit={() => setEditing(a.id)} />
          ),
        )}
      </ul>
      {editing === "new" ? (
        <AssignmentForm initial={EMPTY} onDone={() => setEditing(null)} />
      ) : (
        <div>
          <button type="button" className={BTN_PRIMARY} onClick={() => setEditing("new")}>
            Add an assignment
          </button>
        </div>
      )}
    </div>
  );
}

export function AssignmentsPage() {
  return (
    <MeGate
      selected="assignments"
      title="Assignments"
      intro="Your assignment history. These details can also be used as evidence when you introduce contractors and rewards are reviewed."
    >
      {() => <List />}
    </MeGate>
  );
}
