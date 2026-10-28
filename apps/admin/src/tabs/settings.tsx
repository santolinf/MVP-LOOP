import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAdminAuditLog,
  useAdminCreateStaff,
  useAdminListStaff,
  useAdminResetStaffMfa,
  useAdminUpdateStaff,
  type AdminAuditListDtoItemsItem,
  type AdminStaffDto,
} from "@loop/api-client";
import { DataTable, Notice, Pager, Panel, ReasonForm, columnsFor, fmt } from "../lib.js";

export function Settings({ can }: { can: (p: string) => boolean }) {
  return (
    <>
      <h2>Settings</h2>
      {can("staff.manage") ? <Staff /> : null}
      {can("audit.read") ? <AuditLog /> : null}
      {!can("staff.manage") && !can("audit.read") ? <p className="muted">Staff and audit settings are for administrators.</p> : null}
    </>
  );
}

const st = columnsFor<AdminStaffDto>();

function Staff() {
  const qc = useQueryClient();
  const { data, error } = useAdminListStaff();
  const refresh = () => qc.invalidateQueries();
  const create = useAdminCreateStaff({ mutation: { onSuccess: () => { setEmail(""); void refresh(); } } });
  const reset = useAdminResetStaffMfa({ mutation: { onSuccess: () => void refresh() } });
  const update = useAdminUpdateStaff({ mutation: { onSuccess: () => { setEditing(null); void refresh(); } } });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"READ_ONLY" | "OPERATOR" | "ADMIN">("READ_ONLY");
  const [editing, setEditing] = useState<{ s: AdminStaffDto; role: "READ_ONLY" | "OPERATOR" | "ADMIN"; active: boolean } | null>(null);

  const columns = st.columns([
    st.accessor("email", { header: "Email" }),
    st.accessor("role", { header: "Role" }),
    st.display({ id: "active", header: "Active", cell: ({ row }) => (row.original.active ? "Yes" : "No") }),
    st.display({ id: "mfa", header: "Authenticator", cell: ({ row }) => (row.original.totpEnrolled ? "Set up" : "Not yet") }),
    st.accessor("lastSignInAt", { header: "Last sign-in", cell: (c) => fmt(c.getValue()) }),
    st.display({
      id: "act",
      header: "",
      cell: ({ row }) => (
        <span className="row">
          <button type="button" onClick={() => setEditing({ s: row.original, role: row.original.role, active: row.original.active })}>Change</button>
          <button type="button" disabled={reset.isPending} onClick={() => { if (window.confirm("Reset their authenticator? They will set up a new one at next sign-in.")) reset.mutate({ id: row.original.id }); }}>Reset authenticator</button>
        </span>
      ),
    }),
  ]);

  return (
    <>
      <h3>Staff</h3>
      <Notice error={error ?? reset.error} />
      <DataTable data={data?.data.items ?? []} columns={columns} />
      <form className="row" onSubmit={(e) => { e.preventDefault(); create.mutate({ data: { email, role } }); }}>
        <label>New staff email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>Role<select value={role} onChange={(e) => setRole(e.target.value as typeof role)}><option value="READ_ONLY">Read-only</option><option value="OPERATOR">Operator</option><option value="ADMIN">Admin</option></select></label>
        <button type="submit" disabled={create.isPending}>Add</button>
      </form>
      <Notice error={create.error} />
      {editing ? (
        <Panel title={`Change ${editing.s.email}`} onClose={() => setEditing(null)}>
          <ReasonForm label="Reason (required, audited)" submit="Save" pending={update.isPending} onSubmit={(reason) => update.mutate({ id: editing.s.id, data: { role: editing.role, active: editing.active, reason } })}>
            <label>Role<select value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value as typeof editing.role })}><option value="READ_ONLY">Read-only</option><option value="OPERATOR">Operator</option><option value="ADMIN">Admin</option></select></label>
            <label className="check"><input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} /> Active</label>
          </ReasonForm>
          <Notice error={update.error} />
        </Panel>
      ) : null}
    </>
  );
}

const au = columnsFor<AdminAuditListDtoItemsItem>();

/** Read-only. There is no way to edit or delete audit events from the portal. */
function AuditLog() {
  const [entityType, setEntityType] = useState("");
  const [entityId, setEntityId] = useState("");
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const { data, error } = useAdminAuditLog({ entityType: entityType || undefined, entityId: entityId || undefined, action: action || undefined, page, pageSize: 25 });
  const list = data?.data;
  const columns = au.columns([
    au.accessor("createdAt", { header: "When", cell: (c) => fmt(c.getValue()) }),
    au.display({ id: "actor", header: "Actor", cell: ({ row }) => `${row.original.actorType}${row.original.actorId ? ` ${row.original.actorId.slice(0, 8)}` : ""}` }),
    au.accessor("action", { header: "Action" }),
    au.display({ id: "entity", header: "Entity", cell: ({ row }) => `${row.original.entityType} ${row.original.entityId.slice(0, 8)}` }),
    au.display({ id: "detail", header: "Change", cell: ({ row }) => (row.original.before || row.original.after ? <details><summary>View</summary><pre>{JSON.stringify({ before: row.original.before, after: row.original.after }, null, 2)}</pre></details> : "—") }),
  ]);
  return (
    <>
      <h3>Audit log</h3>
      <div className="row">
        <label>Entity type<input value={entityType} onChange={(e) => { setPage(1); setEntityType(e.target.value); }} /></label>
        <label>Entity ID<input value={entityId} onChange={(e) => { setPage(1); setEntityId(e.target.value); }} /></label>
        <label>Action contains<input value={action} onChange={(e) => { setPage(1); setAction(e.target.value); }} /></label>
      </div>
      <Notice error={error} />
      <DataTable data={list?.items ?? []} columns={columns} empty="No events." />
      {list ? <Pager page={list.page} pageSize={list.pageSize} total={list.total} onPage={setPage} /> : null}
    </>
  );
}
