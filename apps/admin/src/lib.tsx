import { useState, type FormEvent, type ReactNode } from "react";
import { createColumnHelper, tableFeatures, useTable, type ColumnDef, type RowData } from "@tanstack/react-table";

export const features = tableFeatures({});
export const columnsFor = <T extends RowData>() => createColumnHelper<typeof features, T>();

/** Stable fallback so an unloaded query does not hand the table a new array every render. */
export const NONE: never[] = [];

/** customFetch throws the RFC 9457 problem body; turn it into one readable line. */
export function errMsg(e: unknown): string {
  if (e && typeof e === "object") {
    const p = e as { detail?: unknown; title?: unknown; errors?: { message?: string }[] };
    if (p.errors?.length) return p.errors.map((x) => x.message).filter(Boolean).join("; ");
    if (typeof p.detail === "string") return p.detail;
    if (typeof p.title === "string") return p.title;
  }
  return "Something went wrong";
}

export function DataTable<T extends RowData>({ data, columns, empty = "Nothing to show." }: { data: T[]; columns: ColumnDef<typeof features, T>[]; empty?: string }) {
  const table = useTable({ features, columns, data });
  const rows = table.getRowModel().rows;
  return (
    <table className="data">
      <thead>
        {table.getHeaderGroups().map((g) => (
          <tr key={g.id}>
            {g.headers.map((h) => (
              <th key={h.id}>{h.isPlaceholder ? null : <table.FlexRender header={h} />}</th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={columns.length} className="muted">
              {empty}
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr key={row.id}>
              {row.getAllCells().map((cell) => (
                <td key={cell.id}>
                  <table.FlexRender cell={cell} />
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const last = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="pager">
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </button>
      <span>
        Page {page} of {last} ({total})
      </span>
      <button type="button" disabled={page >= last} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </div>
  );
}

export function Notice({ error, ok }: { error?: unknown; ok?: string | null }) {
  if (error) return <p role="alert" className="error">{errMsg(error)}</p>;
  if (ok) return <p role="status" className="ok">{ok}</p>;
  return null;
}

export function Panel({ title, onClose, children }: { title: string; onClose?: () => void; children: ReactNode }) {
  return (
    <section className="panel">
      <header>
        <h3>{title}</h3>
        {onClose ? (
          <button type="button" onClick={onClose}>
            Close
          </button>
        ) : null}
      </header>
      {children}
    </section>
  );
}

/** A reason is mandatory for every admin change that overrides or acts on someone's behalf. */
export const MIN_REASON = 10;

export function ReasonForm({ label, submit, pending, onSubmit, children }: {
  label: string;
  submit: string;
  pending: boolean;
  onSubmit: (reason: string) => void;
  children?: ReactNode;
}) {
  const [reason, setReason] = useState("");
  const ok = reason.trim().length >= MIN_REASON;
  const go = (e: FormEvent) => {
    e.preventDefault();
    if (ok) onSubmit(reason.trim());
  };
  return (
    <form onSubmit={go} className="stack">
      {children}
      <label>
        {label}
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} required minLength={MIN_REASON} maxLength={500} />
      </label>
      <button type="submit" disabled={!ok || pending}>
        {pending ? "Saving…" : submit}
      </button>
    </form>
  );
}

export const fmt = (iso: string | null | undefined): string => (iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—");
export const fullName = (a: { firstName: string | null; lastName: string | null }): string => [a.firstName, a.lastName].filter(Boolean).join(" ") || "(no name)";
export const pence = (n: number | null): string => (n === null ? "—" : `£${(n / 100).toFixed(2)}`);
