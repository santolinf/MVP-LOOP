import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAdminFoundingTracker,
  useAdminListIntroductions,
  useAdminListProfileChanges,
  useAdminResolveReferralFlag,
  type AdminFoundingTrackerDtoItemsItem,
  type AdminProfileChangeListDtoItemsItem,
  type AdminReferralListDtoItemsItem,
} from "@loop/api-client";
import { DataTable, Notice, Pager, Panel, ReasonForm, columnsFor, fmt } from "../lib.js";

const fc = columnsFor<AdminFoundingTrackerDtoItemsItem>();
const pc = columnsFor<AdminProfileChangeListDtoItemsItem>();
const rc = columnsFor<AdminReferralListDtoItemsItem>();

export function Reviews({ can }: { can: (p: string) => boolean }) {
  return (
    <>
      <h2>Review queues</h2>
      <FoundingTracker />
      <FlaggedReferrals can={can} />
      <ProfileChanges />
    </>
  );
}

function FoundingTracker() {
  const [page, setPage] = useState(1);
  const { data, error } = useAdminFoundingTracker({ page, pageSize: 20 });
  const t = data?.data;
  const columns = fc.columns([
    fc.display({ id: "who", header: "Contractor", cell: ({ row }) => row.original.name ?? row.original.contractorId }),
    fc.display({ id: "progress", header: "Counted introductions", cell: ({ row }) => `${row.original.registeredReferrals} of ${row.original.required}` }),
    fc.display({ id: "current", header: "Current profile", cell: ({ row }) => (row.original.isCurrent ? "Yes" : "No (unconfirmed)") }),
    fc.display({
      id: "state",
      header: "State",
      cell: ({ row }) => (row.original.state === "QUALIFIED" ? "Qualified, no place yet" : "In progress"),
    }),
  ]);
  return (
    <>
      <h3>Founding tracker</h3>
      {t ? <p><strong>{t.allocated.toLocaleString("en-GB")}</strong> of {t.cap.toLocaleString("en-GB")} places allocated · {t.remaining.toLocaleString("en-GB")} left. Places are only ever allocated automatically; this list is read-only.</p> : null}
      <Notice error={error} />
      <DataTable data={t?.items ?? []} columns={columns} empty="Nobody is working toward a place yet." />
      {t ? <Pager page={t.page} pageSize={t.pageSize} total={t.total} onPage={setPage} /> : null}
    </>
  );
}

function FlaggedReferrals({ can }: { can: (p: string) => boolean }) {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState<{ id: string; status: "CLEARED" | "CONFIRMED" } | null>(null);
  const { data, error } = useAdminListIntroductions({ flagged: "true", page, pageSize: 20 });
  const resolve = useAdminResolveReferralFlag({ mutation: { onSuccess: () => { setPending(null); void qc.invalidateQueries(); } } });
  const list = data?.data;
  const columns = rc.columns([
    rc.display({ id: "referrer", header: "Introducer", cell: ({ row }) => row.original.referrer.name ?? row.original.referrer.id }),
    rc.display({ id: "referee", header: "Introduced", cell: ({ row }) => row.original.referee.name ?? row.original.referee.id }),
    rc.display({ id: "created", header: "Introduced on", cell: ({ row }) => fmt(row.original.createdAt) }),
    rc.display({
      id: "flags",
      header: "Open flags",
      cell: ({ row }) => (
        <ul>
          {row.original.flags.filter((f) => f.status === "OPEN").map((f) => (
            <li key={f.id}>
              {f.reason === "SAME_DEVICE" ? "Same device as other introductions" : f.reason === "SELF_IDENTITY" ? "Possible self-introduction" : f.reason}
              {can("introductions.review") ? (
                <>
                  {" "}
                  <button type="button" onClick={() => setPending({ id: f.id, status: "CLEARED" })}>Clear</button>
                  <button type="button" onClick={() => setPending({ id: f.id, status: "CONFIRMED" })}>Confirm</button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ),
    }),
  ]);
  return (
    <>
      <h3>Flagged referrals</h3>
      <p className="muted">Flagged introductions do not count toward Founding until reviewed. Clearing lets it count; confirming keeps it out.</p>
      <Notice error={error} />
      <DataTable data={list?.items ?? []} columns={columns} empty="No flagged introductions." />
      {list ? <Pager page={list.page} pageSize={list.pageSize} total={list.total} onPage={setPage} /> : null}
      {pending ? (
        <Panel title={pending.status === "CLEARED" ? "Clear flag (introduction will count)" : "Confirm flag (introduction will not count)"} onClose={() => setPending(null)}>
          <ReasonForm
            label="Note (required, audited)"
            submit="Save"
            pending={resolve.isPending}
            onSubmit={(note) => resolve.mutate({ id: pending.id, data: { status: pending.status, note } })}
          />
          <Notice error={resolve.error} />
        </Panel>
      ) : null}
    </>
  );
}

function ProfileChanges() {
  const [page, setPage] = useState(1);
  const [materialOnly, setMaterialOnly] = useState(false);
  const { data, error } = useAdminListProfileChanges({ materialOnly: materialOnly ? "true" : undefined, page, pageSize: 20 });
  const list = data?.data;
  const columns = pc.columns([
    pc.display({ id: "who", header: "Contractor", cell: ({ row }) => row.original.name ?? row.original.contractorId }),
    pc.accessor("pending", { header: "Suggestions waiting" }),
    pc.accessor("material", { header: "Of which material (roles, dates, skills, clearance)" }),
    pc.display({ id: "oldest", header: "Waiting since", cell: ({ row }) => fmt(row.original.oldestAt) }),
  ]);
  return (
    <>
      <h3>Profile changes awaiting the contractor</h3>
      <p className="muted">New CV uploads create suggestions; nothing changes until the contractor accepts it. Staff can see who is stuck but cannot accept or reject on their behalf.</p>
      <label className="check">
        <input type="checkbox" checked={materialOnly} onChange={(e) => { setPage(1); setMaterialOnly(e.target.checked); }} /> Only contractors with material changes
      </label>
      <Notice error={error} />
      <DataTable data={list?.items ?? []} columns={columns} empty="No suggestions are waiting." />
      {list ? <Pager page={list.page} pageSize={list.pageSize} total={list.total} onPage={setPage} /> : null}
    </>
  );
}
