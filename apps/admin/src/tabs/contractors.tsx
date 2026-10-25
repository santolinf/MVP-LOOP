import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AvailabilityBadge } from "@loop/ui";
import {
  useAdminConfirmOnBehalf,
  useAdminGetContractor,
  useAdminListContractors,
  useAdminSendLoopMessage,
  type AdminContractorListDtoItemsItem,
} from "@loop/api-client";
import { DataTable, Notice, Pager, Panel, ReasonForm, columnsFor, errMsg, fmt, fullName } from "../lib.js";

const col = columnsFor<AdminContractorListDtoItemsItem>();

export function Contractors({ can }: { can: (p: string) => boolean }) {
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const { data, error } = useAdminListContractors({ q: search || undefined, page, pageSize: 25 });
  const list = data?.data;

  const columns = col.columns([
    col.display({ id: "name", header: "Name", cell: ({ row }) => <button type="button" className="link" onClick={() => setSelected(row.original.id)}>{fullName(row.original)}</button> }),
    col.accessor("email", { header: "Email", cell: (c) => c.getValue() ?? "—" }),
    col.display({ id: "colour", header: "Availability", cell: ({ row }) => <AvailabilityBadge colour={row.original.colour} /> }),
    col.accessor("lastConfirmedAt", { header: "Last confirmed", cell: (c) => fmt(c.getValue()) }),
    col.display({ id: "state", header: "Status", cell: ({ row }) => [row.original.live ? "Live" : "Not live", row.original.paused ? "Paused" : null, row.original.searchSuppressed ? "Suppressed" : null].filter(Boolean).join(" · ") }),
  ]);

  return (
    <>
      <h2>Contractors</h2>
      <form className="row" onSubmit={(e: FormEvent) => { e.preventDefault(); setPage(1); setSearch(q.trim()); }}>
        <label>
          Search name, email or phone
          <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={100} />
        </label>
        <button type="submit">Search</button>
      </form>
      <Notice error={error} />
      <DataTable data={list?.items ?? []} columns={columns} empty="No contractors found." />
      {list ? <Pager page={list.page} pageSize={list.pageSize} total={list.total} onPage={setPage} /> : null}
      {selected ? <Detail id={selected} can={can} onClose={() => setSelected(null)} /> : null}
    </>
  );
}

function Detail({ id, can, onClose }: { id: string; can: (p: string) => boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { data, error } = useAdminGetContractor(id);
  const c = data?.data;
  const confirm = useAdminConfirmOnBehalf();
  const send = useAdminSendLoopMessage();
  const [employment, setEmployment] = useState<"CONTRACTING" | "PERMANENT" | "BETWEEN_CONTRACTS">("BETWEEN_CONTRACTS");
  const [availableFrom, setAvailableFrom] = useState("");
  const [endDate, setEndDate] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries();

  return (
    <Panel title={c ? fullName(c) : "Contractor"} onClose={onClose}>
      <Notice error={error} />
      {c ? (
        <>
          <dl className="facts">
            <dt>Availability</dt><dd><AvailabilityBadge colour={c.colour} /></dd>
            <dt>Email / phone</dt><dd>{c.email ?? "—"} / {c.phone}</dd>
            <dt>Situation</dt><dd>{c.employment ?? "—"}</dd>
            <dt>Available from</dt><dd>{c.availableFrom ?? "—"}</dd>
            <dt>Contract end</dt><dd>{c.contractEndDate ?? "—"}</dd>
            <dt>Last confirmed</dt><dd>{fmt(c.lastConfirmedAt)} {c.confirmationSource ? `(${c.confirmationSource})` : ""}</dd>
            <dt>Introduced by</dt><dd>{c.introducer ? `${c.introducer.referrerName ?? c.introducer.referrerId}${c.introducer.locked ? " (locked)" : ""}` : "—"}</dd>
            <dt>Introductions made</dt><dd>{c.introductionsMade}</dd>
            <dt>Founding place</dt><dd>{c.foundingPlace ?? "—"}</dd>
            <dt>Escalation</dt><dd>{c.escalationStage ?? "None"}{c.openCallTask ? " · call task open" : ""}</dd>
          </dl>
          <h4>Recent confirmations</h4>
          <ul>{c.events.map((e) => <li key={e.id}>{fmt(e.confirmedAt)} · {e.source} · {e.employment}</li>)}</ul>

          {can("availability.confirm") ? (
            <details>
              <summary>Confirm availability on their behalf</summary>
              <ReasonForm
                label="Reason (required, audited)"
                submit="Confirm on behalf"
                pending={confirm.isPending}
                onSubmit={(reason) =>
                  confirm.mutate(
                    { id, data: { employment, availableFrom: availableFrom || null, contractEndDate: endDate || null, reason } },
                    { onSuccess: () => { setDone("Confirmed on their behalf."); void refresh(); } },
                  )
                }
              >
                <label>
                  Situation
                  <select value={employment} onChange={(e) => setEmployment(e.target.value as typeof employment)}>
                    <option value="BETWEEN_CONTRACTS">Between contracts</option>
                    <option value="CONTRACTING">Contracting</option>
                    <option value="PERMANENT">Permanent</option>
                  </select>
                </label>
                <label>Available from<input type="date" value={availableFrom} onChange={(e) => setAvailableFrom(e.target.value)} /></label>
                <label>Contract end date<input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
              </ReasonForm>
              <Notice error={confirm.error} />
            </details>
          ) : null}

          {can("comms.send_message") ? (
            <details>
              <summary>Send a LOOP team message</summary>
              <form className="stack" onSubmit={(e) => { e.preventDefault(); send.mutate({ id, data: { subject, body } }, { onSuccess: () => { setDone("Message sent."); setSubject(""); setBody(""); } }); }}>
                <label>Subject<input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} required /></label>
                <label>Message<textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={4000} required /></label>
                <button type="submit" disabled={send.isPending}>Send</button>
              </form>
              {send.error ? <p role="alert" className="error">{errMsg(send.error)}</p> : null}
            </details>
          ) : null}
          <Notice ok={done} />
        </>
      ) : null}
    </Panel>
  );
}
