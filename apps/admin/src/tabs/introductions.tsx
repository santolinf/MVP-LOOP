import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAdminApproveReward,
  useAdminFounding,
  useAdminListIntroductions,
  useAdminListRewards,
  useAdminOverrideIntroducer,
  useAdminRecordRewardVerification,
  useAdminResolveReferralFlag,
  type AdminReferralListDtoItemsItem,
  type AdminRewardListDtoItemsItem,
} from "@loop/api-client";
import { DataTable, Notice, Pager, Panel, ReasonForm, columnsFor, fmt, pence } from "../lib.js";

const ref = columnsFor<AdminReferralListDtoItemsItem>();
const rw = columnsFor<AdminRewardListDtoItemsItem>();

export function Introductions({ can }: { can: (p: string) => boolean }) {
  return (
    <>
      <h2>Introductions &amp; Founding</h2>
      <FoundingSummary />
      <ReferralSection can={can} />
      <RewardSection can={can} />
    </>
  );
}

function FoundingSummary() {
  const { data } = useAdminFounding();
  const f = data?.data;
  return f ? (
    <p>
      <strong>{f.allocated.toLocaleString("en-GB")}</strong> of {f.cap.toLocaleString("en-GB")} Founding places allocated.
    </p>
  ) : null;
}

function ReferralSection({ can }: { can: (p: string) => boolean }) {
  const qc = useQueryClient();
  const [flagged, setFlagged] = useState(false);
  const [page, setPage] = useState(1);
  const [overriding, setOverriding] = useState<AdminReferralListDtoItemsItem | null>(null);
  const [newReferrer, setNewReferrer] = useState("");
  const { data, error } = useAdminListIntroductions({ flagged: flagged ? "true" : undefined, page, pageSize: 25 });
  const refresh = () => qc.invalidateQueries();
  const override = useAdminOverrideIntroducer({ mutation: { onSuccess: () => { setOverriding(null); setNewReferrer(""); void refresh(); } } });
  const resolveFlag = useAdminResolveReferralFlag({ mutation: { onSuccess: () => void refresh() } });
  const [flagNote, setFlagNote] = useState<{ id: string; status: "CLEARED" | "CONFIRMED" } | null>(null);
  const list = data?.data;

  const columns = ref.columns([
    ref.display({ id: "referrer", header: "Introducer", cell: ({ row }) => row.original.referrer.name ?? row.original.referrer.id }),
    ref.display({ id: "referee", header: "Introduced", cell: ({ row }) => row.original.referee.name ?? row.original.referee.id }),
    ref.accessor("source", { header: "Source" }),
    ref.display({ id: "counts", header: "Counts", cell: ({ row }) => (row.original.counted ? "Yes" : row.original.locked ? "Held" : "Not yet") }),
    ref.display({
      id: "flags",
      header: "Review flags",
      cell: ({ row }) =>
        row.original.flags.length === 0 ? "—" : (
          <ul>
            {row.original.flags.map((f) => (
              <li key={f.id}>
                {f.reason}: {f.status}
                {f.status === "OPEN" && can("introductions.review") ? (
                  <>
                    {" "}
                    <button type="button" onClick={() => setFlagNote({ id: f.id, status: "CLEARED" })}>Clear</button>
                    <button type="button" onClick={() => setFlagNote({ id: f.id, status: "CONFIRMED" })}>Confirm</button>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        ),
    }),
    ref.display({
      id: "act",
      header: "",
      cell: ({ row }) => (can("introductions.override") ? <button type="button" onClick={() => setOverriding(row.original)}>Override introducer</button> : null),
    }),
  ]);

  return (
    <>
      <h3>Introductions</h3>
      <label className="check">
        <input type="checkbox" checked={flagged} onChange={(e) => { setPage(1); setFlagged(e.target.checked); }} /> Only those with an open review flag
      </label>
      <Notice error={error} />
      <DataTable data={list?.items ?? []} columns={columns} empty="No introductions." />
      {list ? <Pager page={list.page} pageSize={list.pageSize} total={list.total} onPage={setPage} /> : null}

      {flagNote ? (
        <Panel title={flagNote.status === "CLEARED" ? "Clear flag (introduction will count)" : "Confirm flag (introduction will not count)"} onClose={() => setFlagNote(null)}>
          <ReasonForm
            label="Note (required, audited)"
            submit="Save"
            pending={resolveFlag.isPending}
            onSubmit={(note) => resolveFlag.mutate({ id: flagNote.id, data: { status: flagNote.status, note } }, { onSuccess: () => setFlagNote(null) })}
          />
          <Notice error={resolveFlag.error} />
        </Panel>
      ) : null}

      {overriding ? (
        <Panel title={`Override introducer for ${overriding.referee.name ?? overriding.referee.id}`} onClose={() => setOverriding(null)}>
          <p>Currently: {overriding.referrer.name ?? overriding.referrer.id}. Refused once an introducer reward is approved or paid; unpaid rewards move to the new introducer.</p>
          <ReasonForm
            label="Reason (required, audited with before and after)"
            submit="Change introducer"
            pending={override.isPending}
            onSubmit={(reason) => override.mutate({ id: overriding.id, data: { referrerId: newReferrer.trim(), reason } })}
          >
            <label>
              New introducer contractor ID
              <input value={newReferrer} onChange={(e) => setNewReferrer(e.target.value)} required pattern="[0-9a-fA-F-]{36}" />
            </label>
          </ReasonForm>
          <Notice error={override.error} />
        </Panel>
      ) : null}
    </>
  );
}

function RewardSection({ can }: { can: (p: string) => boolean }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<"" | "PENDING" | "UNDER_VERIFICATION" | "APPROVED" | "PAID">("UNDER_VERIFICATION");
  const [page, setPage] = useState(1);
  const [recording, setRecording] = useState<AdminRewardListDtoItemsItem | null>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reference, setReference] = useState("");
  const { data, error } = useAdminListRewards({ status: status || undefined, page, pageSize: 25 });
  const refresh = () => qc.invalidateQueries();
  const approve = useAdminApproveReward({ mutation: { onSuccess: () => void refresh() } });
  const verify = useAdminRecordRewardVerification({ mutation: { onSuccess: () => { setRecording(null); void refresh(); } } });
  const list = data?.data;

  const columns = rw.columns([
    rw.accessor("type", { header: "Type", cell: (c) => (c.getValue() === "CONTRACTOR_PLACEMENT" ? "Contractor" : "Introducer") }),
    rw.display({ id: "who", header: "Beneficiary", cell: ({ row }) => row.original.beneficiary.name ?? row.original.beneficiary.id }),
    rw.display({ id: "for", header: "Placement of", cell: ({ row }) => row.original.qualifyingContractor.name ?? row.original.qualifyingContractor.id }),
    rw.accessor("amountPence", { header: "Amount", cell: (c) => pence(c.getValue()) }),
    rw.accessor("status", { header: "Status" }),
    rw.display({
      id: "evidence",
      header: "Evidence",
      cell: ({ row }) => {
        const r = row.original;
        if (!r.agencyVerifiedAt) return "None yet";
        const ref = typeof r.evidence?.["reference"] === "string" ? r.evidence["reference"] : "—";
        return `${r.supplyingCompany ?? "Agency"} · ${r.serviceStart} to ${r.serviceEnd} (${r.paidServiceMonths} months) · ref ${ref}`;
      },
    }),
    rw.display({
      id: "act",
      header: "",
      cell: ({ row }) => {
        const r = row.original;
        return (
          <span className="stack">
            {r.status === "PENDING" && can("rewards.verify") ? <button type="button" onClick={() => setRecording(r)}>Record agency evidence</button> : null}
            {r.status === "UNDER_VERIFICATION" && can("rewards.approve") ? (
              <>
                <button type="button" disabled={!r.approval.allowed || approve.isPending} onClick={() => approve.mutate({ id: r.id })}>Approve</button>
                {r.approval.blockedReason ? <small className="muted">{r.approval.blockedReason}</small> : null}
              </>
            ) : null}
            {r.approvedAt ? <small className="muted">Approved {fmt(r.approvedAt)}</small> : null}
          </span>
        );
      },
    }),
  ]);

  return (
    <>
      <h3>Reward review</h3>
      <p className="muted">Payment is not live. Approval needs agency-verified paid service of at least 3 months, and the person who recorded the evidence cannot approve it.</p>
      <label>
        Status
        <select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value as typeof status); }}>
          <option value="">All</option>
          <option value="PENDING">Waiting for evidence</option>
          <option value="UNDER_VERIFICATION">Awaiting approval</option>
          <option value="APPROVED">Approved</option>
          <option value="PAID">Paid</option>
        </select>
      </label>
      <Notice error={error ?? approve.error} />
      <DataTable data={list?.items ?? []} columns={columns} empty="No rewards." />
      {list ? <Pager page={list.page} pageSize={list.pageSize} total={list.total} onPage={setPage} /> : null}

      {recording ? (
        <Panel title="Record agency evidence" onClose={() => setRecording(null)}>
          <p>Enter only what the agency has supplied. The contractor never provides this.</p>
          <form
            className="stack"
            onSubmit={(e) => { e.preventDefault(); verify.mutate({ id: recording.id, data: { serviceStart: start, serviceEnd: end, reference } }); }}
          >
            <label>Service start<input type="date" value={start} onChange={(e) => setStart(e.target.value)} required /></label>
            <label>Service end<input type="date" value={end} onChange={(e) => setEnd(e.target.value)} required /></label>
            <label>Agency reference<input value={reference} onChange={(e) => setReference(e.target.value)} required minLength={3} maxLength={200} /></label>
            <button type="submit" disabled={verify.isPending}>Save evidence</button>
          </form>
          <Notice error={verify.error} />
        </Panel>
      ) : null}
    </>
  );
}
