import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAdminCreateTemplate,
  useAdminGetReminderSchedule,
  useAdminGetTemplate,
  useAdminListTemplates,
  useAdminPublishReminderSchedule,
  useAdminPublishTemplateVersion,
} from "@loop/api-client";
import { Campaigns } from "./campaigns.js";
import { Notice, Panel, ReasonForm, fmt } from "../lib.js";

export function Communications({ can }: { can: (p: string) => boolean }) {
  return (
    <>
      <h2>Communications</h2>
      <Campaigns can={can} />
      <Templates canEdit={can("comms.manage_templates")} />
      <Schedule canEdit={can("config.write")} />
    </>
  );
}

function Templates({ canEdit }: { canEdit: boolean }) {
  const { data, error } = useAdminListTemplates();
  const [key, setKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  return (
    <>
      <h3>Templates</h3>
      <Notice error={error} />
      <table className="data">
        <thead><tr><th>Name</th><th>Kind</th><th>Version</th><th>Subject</th><th>Updated</th><th /></tr></thead>
        <tbody>
          {(data?.data.items ?? []).map((t) => (
            <tr key={t.key}>
              <td>{t.label}<br /><small className="muted">{t.key}</small></td>
              <td>{t.kind}</td>
              <td>{t.version}</td>
              <td>{t.subject}</td>
              <td>{fmt(t.updatedAt)}</td>
              <td><button type="button" onClick={() => { setCreating(false); setKey(t.key); }}>{canEdit ? "Edit" : "View"}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {canEdit ? <button type="button" onClick={() => { setKey(null); setCreating(true); }}>New LOOP message or notification template</button> : null}
      {key ? <TemplateEditor tkey={key} canEdit={canEdit} onClose={() => setKey(null)} /> : null}
      {creating ? <CreateTemplate onClose={() => setCreating(false)} /> : null}
    </>
  );
}

function TemplateEditor({ tkey, canEdit, onClose }: { tkey: string; canEdit: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { data, error } = useAdminGetTemplate(tkey);
  const t = data?.data;
  const publish = useAdminPublishTemplateVersion({ mutation: { onSuccess: () => qc.invalidateQueries() } });
  const [subject, setSubject] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const subjectValue = subject ?? t?.subject ?? "";
  const bodyValue = body ?? t?.body.join("\n\n") ?? "";
  return (
    <Panel title={t ? `${t.label} (v${t.version})` : "Template"} onClose={onClose}>
      <Notice error={error} />
      {t ? (
        <>
          <p className="muted">Merge fields: {t.placeholders.map((p) => `{{${p}}}`).join(", ")}. Blank lines separate paragraphs. Each save publishes a new version; old versions are kept.</p>
          {canEdit ? (
            <ReasonForm
              label="What changed and why (required, audited)"
              submit="Publish new version"
              pending={publish.isPending}
              onSubmit={(note) =>
                publish.mutate({ key: tkey, data: { subject: subjectValue, body: bodyValue.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean), note } }, { onSuccess: () => { setSubject(null); setBody(null); } })
              }
            >
              <label>Subject<input value={subjectValue} onChange={(e) => setSubject(e.target.value)} maxLength={150} required /></label>
              <label>Body<textarea value={bodyValue} onChange={(e) => setBody(e.target.value)} rows={8} required /></label>
            </ReasonForm>
          ) : (
            <pre>{t.subject + "\n\n" + t.body.join("\n\n")}</pre>
          )}
          <Notice error={publish.error} />
          <h4>History</h4>
          <ul>{t.history.map((h) => <li key={h.version}>v{h.version} · {h.createdBy ? fmt(h.createdAt) : "built-in"} · {h.note ?? "—"}</li>)}</ul>
        </>
      ) : null}
    </Panel>
  );
}

function CreateTemplate({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const create = useAdminCreateTemplate({ mutation: { onSuccess: () => { void qc.invalidateQueries(); onClose(); } } });
  const [kind, setKind] = useState<"LOOP_MESSAGE" | "NOTIFICATION">("LOOP_MESSAGE");
  const [key, setKey] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  return (
    <Panel title="New template" onClose={onClose}>
      <ReasonForm
        label="Note (required, audited)"
        submit="Create"
        pending={create.isPending}
        onSubmit={(note) => create.mutate({ data: { kind, key, subject, body: body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean), note } })}
      >
        <label>Kind<select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}><option value="LOOP_MESSAGE">LOOP team message</option><option value="NOTIFICATION">Notification</option></select></label>
        <label>Key (lower-case, e.g. welcome.note)<input value={key} onChange={(e) => setKey(e.target.value)} required minLength={3} maxLength={80} /></label>
        <label>Subject<input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} required /></label>
        <label>Body<textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} required /></label>
      </ReasonForm>
      <Notice error={create.error} />
    </Panel>
  );
}

const FIELDS: { label: string; path: [string, string] }[] = [
  { label: "Available now: reconfirm every (days)", path: ["availableNow", "intervalDays"] },
  { label: "In contract: reconfirm every (days)", path: ["inContract", "intervalDays"] },
  { label: "Permanent: reconfirm every (days)", path: ["permanent", "intervalDays"] },
  { label: "Profile review every (days)", path: ["profileReview", "intervalDays"] },
  { label: "CV review every (days)", path: ["cvReview", "intervalDays"] },
  { label: "Introductions nudge after (days)", path: ["introductions", "nudgeAfterDays"] },
  { label: "Minimum gap between progress messages (days)", path: ["introductions", "progressMinGapDays"] },
  { label: "Drop unsent reminders after (days)", path: ["staleAfterDays", ""] },
  { label: "Call task after unconfirmed for (days)", path: ["escalation", "callTaskAfterDays"] },
  { label: "Suppress from search after (days)", path: ["escalation", "suppressAfterDays"] },
];

type Cfg = Record<string, unknown>;
const getAt = (c: Cfg, [a, b]: [string, string]): number => Number(b ? (c[a] as Cfg)[b] : c[a]);

function Schedule({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const { data, error } = useAdminGetReminderSchedule();
  const publish = useAdminPublishReminderSchedule({ mutation: { onSuccess: () => qc.invalidateQueries() } });
  const current = data?.data;
  const [draft, setDraft] = useState<Cfg | null>(null);
  const cfg = (draft ?? (current?.config as unknown as Cfg | undefined)) ?? null;
  const [lists, setLists] = useState<Record<string, string>>({});

  if (!current || !cfg) return <Notice error={error} />;
  const setNum = ([a, b]: [string, string], v: number) =>
    setDraft(b ? { ...cfg, [a]: { ...(cfg[a] as Cfg), [b]: v } } : { ...cfg, [a]: v });
  const listFields: { label: string; get: () => number[]; key: string }[] = [
    { label: "Contract-end prompts: days before end", key: "contractEnd.promptDaysBefore", get: () => (cfg["contractEnd"] as { promptDaysBefore: number[] }).promptDaysBefore },
    { label: "Contract-end follow-ups: days after end", key: "contractEnd.followUpDaysAfter", get: () => (cfg["contractEnd"] as { followUpDaysAfter: number[] }).followUpDaysAfter },
  ];
  const parse = (s: string) => s.split(",").map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n > 0);
  const build = (): Cfg => {
    const ce = { ...(cfg["contractEnd"] as Cfg) };
    ce["promptDaysBefore"] = lists["contractEnd.promptDaysBefore"] !== undefined ? parse(lists["contractEnd.promptDaysBefore"]) : ce["promptDaysBefore"];
    ce["followUpDaysAfter"] = lists["contractEnd.followUpDaysAfter"] !== undefined ? parse(lists["contractEnd.followUpDaysAfter"]) : ce["followUpDaysAfter"];
    return { ...cfg, contractEnd: ce };
  };

  return (
    <>
      <h3>Reminder schedule (version {current.version})</h3>
      <p className="muted">Changes publish a new version; the engine picks it up on its next sweep. Never auto-promotes anyone to green.</p>
      <fieldset disabled={!canEdit}>
        <ReasonForm
          label="What changed and why (required, audited)"
          submit="Publish new schedule"
          pending={publish.isPending}
          onSubmit={(note) => publish.mutate({ data: { config: build() as never, note } }, { onSuccess: () => { setDraft(null); setLists({}); } })}
        >
          {FIELDS.map((f) => (
            <label key={f.label}>
              {f.label}
              <input type="number" min={1} value={getAt(cfg, f.path)} onChange={(e) => setNum(f.path, Number(e.target.value))} required />
            </label>
          ))}
          {listFields.map((f) => (
            <label key={f.key}>
              {f.label} (comma separated)
              <input value={lists[f.key] ?? f.get().join(", ")} onChange={(e) => setLists({ ...lists, [f.key]: e.target.value })} />
            </label>
          ))}
        </ReasonForm>
      </fieldset>
      <Notice error={publish.error} />
      <h4>Versions</h4>
      <ul>{current.history.map((h) => <li key={h.version}>v{h.version} · {fmt(h.createdAt)} · {h.note ?? "—"}</li>)}</ul>
    </>
  );
}
