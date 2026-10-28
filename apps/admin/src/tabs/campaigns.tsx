import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAdminApproveCampaign,
  useAdminCancelCampaign,
  useAdminCreateCampaign,
  useAdminGetCampaignSettings,
  useAdminListCampaignDeliveries,
  useAdminListCampaigns,
  useAdminPreviewCampaignAudience,
  useAdminPublishCampaignSettings,
  useAdminRejectCampaign,
  type AdminCampaignListDtoItemsItem,
  type AdminCampaignPreviewDtoAudience,
} from "@loop/api-client";
import { Notice, Pager, Panel, ReasonForm, fmt } from "../lib.js";

type Situation = "CONTRACTING" | "PERMANENT" | "BETWEEN_CONTRACTS";
type Colour = "LIME" | "ORANGE" | "RED" | "BLUE" | "GREY";
const SITUATIONS: { id: Situation; label: string }[] = [
  { id: "BETWEEN_CONTRACTS", label: "Between contracts" },
  { id: "CONTRACTING", label: "Contracting" },
  { id: "PERMANENT", label: "Permanent" },
];
const COLOURS: { id: Colour; label: string }[] = [
  { id: "LIME", label: "Available now" },
  { id: "ORANGE", label: "Ending soon" },
  { id: "RED", label: "Unavailable" },
  { id: "BLUE", label: "Permanent" },
  { id: "GREY", label: "Unconfirmed" },
];
const SKIP_LABEL: Record<string, string> = {
  NO_CONSENT: "no consent",
  NO_EMAIL: "no email address",
  EMAIL_SUPPRESSED: "address suppressed",
  ERASED: "erased",
  DAILY_CAP: "already messaged today",
  CANCELLED: "send cancelled",
};
const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export function Campaigns({ can }: { can: (p: string) => boolean }) {
  const [status, setStatus] = useState<"" | "PENDING_APPROVAL" | "SENDING" | "SENT" | "REJECTED" | "CANCELLED">("");
  const [page, setPage] = useState(1);
  const [composing, setComposing] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const { data, error } = useAdminListCampaigns({ status: status || undefined, page, pageSize: 15 });
  const list = data?.data;

  return (
    <>
      <h3>Broadcast and targeted messages</h3>
      <p className="muted">
        Sends go by email and into My LOOP. The server applies each contractor&apos;s consent: broadcasts need marketing consent, targeted
        messages need operational email consent. Large sends need a second person to approve.
      </p>
      {can("comms.send_message") ? <button type="button" onClick={() => setComposing(true)}>New message</button> : null}
      <label>
        Status
        <select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value as typeof status); }}>
          <option value="">All</option>
          <option value="PENDING_APPROVAL">Awaiting approval</option>
          <option value="SENDING">Sending</option>
          <option value="SENT">Sent</option>
          <option value="REJECTED">Rejected</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </label>
      <Notice error={error} />
      <table className="data">
        <thead><tr><th>Name</th><th>Type</th><th>Status</th><th>Recipients</th><th>Sent / failed / skipped</th><th>Created</th><th /></tr></thead>
        <tbody>
          {(list?.items ?? []).map((c) => (
            <tr key={c.id}>
              <td>{c.name}<br /><small className="muted">{c.subject}</small></td>
              <td>{c.kind === "BROADCAST" ? "Broadcast" : "Targeted"}</td>
              <td>{c.status.replace("_", " ").toLowerCase()}</td>
              <td>{c.recipientCount}{c.skippedCount ? <small className="muted"> (+{c.skippedCount} filtered out)</small> : null}</td>
              <td>{c.counts.sent} / {c.counts.failed} / {c.counts.skipped}</td>
              <td>{fmt(c.createdAt)}</td>
              <td><button type="button" onClick={() => setOpen(c.id)}>Open</button></td>
            </tr>
          ))}
          {list && list.items.length === 0 ? <tr><td colSpan={7} className="muted">No messages yet.</td></tr> : null}
        </tbody>
      </table>
      {list ? <Pager page={list.page} pageSize={list.pageSize} total={list.total} onPage={setPage} /> : null}

      {composing ? <Compose onClose={() => setComposing(false)} /> : null}
      {open ? <CampaignDetail campaign={list?.items.find((c) => c.id === open) ?? null} can={can} onClose={() => setOpen(null)} /> : null}
      <Settings canEdit={can("config.write")} />
    </>
  );
}

function Compose({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<"BROADCAST" | "TARGETED">("BROADCAST");
  const [liveOnly, setLiveOnly] = useState(true);
  const [situations, setSituations] = useState<Situation[]>([]);
  const [colours, setColours] = useState<Colour[]>([]);
  const [ids, setIds] = useState("");
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const preview = useAdminPreviewCampaignAudience();
  const create = useAdminCreateCampaign({ mutation: { onSuccess: () => { void qc.invalidateQueries(); onClose(); } } });

  const idList = ids.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  const audience: AdminCampaignPreviewDtoAudience =
    kind === "BROADCAST" ? { kind, liveOnly, situations, colours } : { kind, contractorIds: idList };
  const audienceKey = JSON.stringify(audience);
  const [previewedKey, setPreviewedKey] = useState<string | null>(null);
  const result = preview.data?.data;
  const fresh = previewedKey === audienceKey && !!result;
  const paragraphs = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const ready = fresh && result.eligible > 0 && name.trim().length >= 3 && subject.trim() && paragraphs.length > 0;

  return (
    <Panel title="New message" onClose={onClose}>
      <div className="stack">
        <label>
          Type
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="BROADCAST">Broadcast to a group (marketing consent)</option>
            <option value="TARGETED">Targeted to named contractors (operational consent)</option>
          </select>
        </label>
        {kind === "BROADCAST" ? (
          <fieldset className="stack">
            <label className="check"><input type="checkbox" checked={liveOnly} onChange={(e) => setLiveOnly(e.target.checked)} /> Only LIVE profiles</label>
            <div className="row">
              <strong>Situation</strong>
              {SITUATIONS.map((s) => (
                <label key={s.id} className="check"><input type="checkbox" checked={situations.includes(s.id)} onChange={() => setSituations(toggle(situations, s.id))} /> {s.label}</label>
              ))}
            </div>
            <div className="row">
              <strong>Status colour</strong>
              {COLOURS.map((s) => (
                <label key={s.id} className="check"><input type="checkbox" checked={colours.includes(s.id)} onChange={() => setColours(toggle(colours, s.id))} /> {s.label}</label>
              ))}
            </div>
            <small className="muted">Leave a group empty to include everyone in it.</small>
          </fieldset>
        ) : (
          <label>
            Contractor IDs (one per line or comma separated, up to 500)
            <textarea rows={4} value={ids} onChange={(e) => setIds(e.target.value)} />
          </label>
        )}
        <div className="row">
          <button type="button" disabled={preview.isPending || (kind === "TARGETED" && idList.length === 0)} onClick={() => preview.mutate({ data: { audience } }, { onSuccess: () => setPreviewedKey(audienceKey) })}>
            Preview audience
          </button>
        </div>
        <Notice error={preview.error} />
        {result ? (
          <div role="status" className={fresh ? undefined : "muted"}>
            <p>
              <strong>{result.eligible}</strong> of {result.matched} matched contractors can be emailed
              {result.skipped.length > 0 ? ` (${result.skipped.map((s) => `${s.count} ${SKIP_LABEL[s.reason] ?? s.reason}`).join(", ")})` : ""}.
              {" "}Requires {result.consentRequired === "LOOP_MARKETING" ? "marketing" : "operational email"} consent.
            </p>
            {result.sample.length > 0 ? <p className="muted">For example: {result.sample.map((s) => s.name ?? "(no name)").join(", ")}</p> : null}
            <p>
              {result.requiresApproval
                ? `Above ${result.approvalThreshold} recipients: a second person must approve before anything is sent.`
                : `At or below ${result.approvalThreshold} recipients: it sends straight away.`}
            </p>
            {fresh ? null : <p className="error">The audience changed. Preview it again before sending.</p>}
          </div>
        ) : null}
        <label>Internal name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} /></label>
        <label>Subject<input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} /></label>
        <label>
          Message (blank line between paragraphs; merge field {"{{firstName}}"})
          <textarea rows={7} value={body} onChange={(e) => setBody(e.target.value)} />
        </label>
        <button
          type="button"
          disabled={!ready || create.isPending}
          onClick={() => create.mutate({ data: { name: name.trim(), audience, subject: subject.trim(), body: paragraphs } })}
        >
          {create.isPending ? "Submitting…" : result?.requiresApproval ? "Submit for approval" : "Send"}
        </button>
        <Notice error={create.error} />
      </div>
    </Panel>
  );
}

function CampaignDetail({ campaign, can, onClose }: { campaign: AdminCampaignListDtoItemsItem | null; can: (p: string) => boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<"" | "QUEUED" | "SENT" | "FAILED" | "SKIPPED">("");
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<"approve" | "reject" | "cancel" | null>(null);
  const id = campaign?.id ?? "";
  const log = useAdminListCampaignDeliveries(id, { status: status || undefined, page, pageSize: 20 }, { query: { enabled: !!campaign } });
  const done = { mutation: { onSuccess: () => { setAction(null); void qc.invalidateQueries(); } } };
  const approve = useAdminApproveCampaign(done);
  const reject = useAdminRejectCampaign(done);
  const cancel = useAdminCancelCampaign(done);
  if (!campaign) return null;
  const mutation = action === "approve" ? approve : action === "reject" ? reject : cancel;
  const cancellable = (campaign.status === "PENDING_APPROVAL" || campaign.status === "SENDING") && can("comms.send_message");
  const rows = log.data?.data;

  return (
    <Panel title={campaign.name} onClose={onClose}>
      <p>
        <strong>{campaign.subject}</strong>
      </p>
      <pre>{campaign.body.join("\n\n")}</pre>
      <p className="muted">
        {campaign.kind === "BROADCAST" ? "Broadcast" : "Targeted"} · {campaign.recipientCount} recipients · queued {campaign.counts.queued}, sent {campaign.counts.sent}, failed {campaign.counts.failed}, skipped {campaign.counts.skipped}
        {campaign.approvedAt ? ` · approved ${fmt(campaign.approvedAt)}` : ""}
        {campaign.decisionNote ? ` · note: ${campaign.decisionNote}` : ""}
      </p>
      {campaign.status === "PENDING_APPROVAL" && !campaign.canApprove ? (
        <p className="muted">Waiting for approval. The person who submitted a send cannot approve it, and approval needs the Admin role.</p>
      ) : null}
      <div className="row">
        {campaign.canApprove ? <button type="button" onClick={() => setAction("approve")}>Approve and send</button> : null}
        {campaign.canApprove ? <button type="button" onClick={() => setAction("reject")}>Reject</button> : null}
        {cancellable ? <button type="button" onClick={() => setAction("cancel")}>Cancel send</button> : null}
      </div>
      {action ? (
        <ReasonForm
          label="Note (required, audited)"
          submit={action === "approve" ? "Approve" : action === "reject" ? "Reject" : "Cancel send"}
          pending={mutation.isPending}
          onSubmit={(note) => mutation.mutate({ id: campaign.id, data: { note } })}
        />
      ) : null}
      <Notice error={mutation.error} />

      <h4>Delivery log</h4>
      <label>
        Show
        <select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value as typeof status); }}>
          <option value="">All</option>
          <option value="QUEUED">Queued</option>
          <option value="SENT">Sent</option>
          <option value="FAILED">Failed</option>
          <option value="SKIPPED">Skipped</option>
        </select>
      </label>
      <Notice error={log.error} />
      <table className="data">
        <thead><tr><th>Contractor</th><th>Outcome</th><th>Sent</th><th>Provider events</th></tr></thead>
        <tbody>
          {(rows?.items ?? []).map((r) => (
            <tr key={r.contractorId}>
              <td>{r.name ?? r.contractorId}</td>
              <td>{r.status.toLowerCase()}{r.skipReason ? ` (${SKIP_LABEL[r.skipReason] ?? r.skipReason})` : ""}</td>
              <td>{fmt(r.sentAt)}</td>
              <td>{r.events.length === 0 ? "—" : r.events.map((e) => `${e.event.toLowerCase()} ${fmt(e.occurredAt)}`).join(" · ")}</td>
            </tr>
          ))}
          {rows && rows.items.length === 0 ? <tr><td colSpan={4} className="muted">Nothing to show.</td></tr> : null}
        </tbody>
      </table>
      {rows ? <Pager page={rows.page} pageSize={rows.pageSize} total={rows.total} onPage={setPage} /> : null}
    </Panel>
  );
}

function Settings({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const { data, error } = useAdminGetCampaignSettings();
  const publish = useAdminPublishCampaignSettings({ mutation: { onSuccess: () => { setThreshold(null); setRate(null); void qc.invalidateQueries(); } } });
  const [threshold, setThreshold] = useState<number | null>(null);
  const [rate, setRate] = useState<number | null>(null);
  const s = data?.data;
  if (!s) return <Notice error={error} />;
  return (
    <>
      <h3>Sending limits</h3>
      <p className="muted">Last changed {fmt(s.updatedAt)}. Nothing is sent from 21:00 to 08:00 London time, and a contractor gets at most one admin message a day.</p>
      <fieldset disabled={!canEdit}>
        <ReasonForm
          label="What changed and why (required, audited)"
          submit="Save limits"
          pending={publish.isPending}
          onSubmit={(note) => publish.mutate({ data: { approvalThreshold: threshold ?? s.approvalThreshold, ratePerMinute: rate ?? s.ratePerMinute, note } })}
        >
          <label>
            Second approver needed above (recipients)
            <input type="number" min={0} max={100000} value={threshold ?? s.approvalThreshold} onChange={(e) => setThreshold(Number(e.target.value))} required />
          </label>
          <label>
            Send rate (messages per minute)
            <input type="number" min={1} max={2000} value={rate ?? s.ratePerMinute} onChange={(e) => setRate(Number(e.target.value))} required />
          </label>
        </ReasonForm>
      </fieldset>
      <Notice error={publish.error} />
    </>
  );
}
