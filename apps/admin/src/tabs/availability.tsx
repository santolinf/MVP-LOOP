import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AvailabilityBadge } from "@loop/ui";
import { useAdminAvailabilityQueue, useAdminResolveCallTask, type AdminAvailabilityQueueStage, type AdminQueueDtoItemsItem } from "@loop/api-client";
import { DataTable, Notice, Pager, columnsFor, fmt, fullName } from "../lib.js";

const col = columnsFor<AdminQueueDtoItemsItem>();
const STAGES: { value: AdminAvailabilityQueueStage; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "UNCONFIRMED", label: "Unconfirmed (grey)" },
  { value: "CALL_TASK", label: "Needs a call" },
  { value: "SUPPRESSED", label: "Suppressed from search" },
];

/** Contractors who have not confirmed in time, in escalation order. Colour and stage are computed by the API. */
export function AvailabilityQueue({ can }: { can: (p: string) => boolean }) {
  const qc = useQueryClient();
  const [stage, setStage] = useState<AdminAvailabilityQueueStage>("ALL");
  const [page, setPage] = useState(1);
  const { data, error } = useAdminAvailabilityQueue({ stage, page, pageSize: 25 });
  const resolve = useAdminResolveCallTask({ mutation: { onSuccess: () => qc.invalidateQueries() } });
  const list = data?.data;

  const columns = col.columns([
    col.display({ id: "name", header: "Contractor", cell: ({ row }) => fullName(row.original) }),
    col.display({ id: "colour", header: "Availability", cell: ({ row }) => <AvailabilityBadge colour={row.original.colour} /> }),
    col.accessor("unconfirmedSince", { header: "Unconfirmed since", cell: (c) => fmt(c.getValue()) }),
    col.accessor("escalationStage", { header: "Stage", cell: (c) => c.getValue() ?? "—" }),
    col.display({
      id: "task",
      header: "Call task",
      cell: ({ row }) => {
        const t = row.original.callTask;
        if (!t) return "—";
        return can("availability.manage_tasks") ? (
          <span className="row">
            <span>{t.reason}</span>
            <button type="button" disabled={resolve.isPending} onClick={() => resolve.mutate({ id: t.id, data: { outcome: "DONE" } })}>Mark done</button>
            <button type="button" disabled={resolve.isPending} onClick={() => resolve.mutate({ id: t.id, data: { outcome: "CANCELLED" } })}>Cancel</button>
          </span>
        ) : t.reason;
      },
    }),
  ]);

  return (
    <>
      <h2>Availability queue</h2>
      <label>
        Show
        <select value={stage} onChange={(e) => { setPage(1); setStage(e.target.value as AdminAvailabilityQueueStage); }}>
          {STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </label>
      <p className="muted">To confirm someone after a call, open them in Contractors and use “Confirm on their behalf”.</p>
      <Notice error={error ?? resolve.error} />
      <DataTable data={list?.items ?? []} columns={columns} empty="Nobody is waiting." />
      {list ? <Pager page={list.page} pageSize={list.pageSize} total={list.total} onPage={setPage} /> : null}
    </>
  );
}
