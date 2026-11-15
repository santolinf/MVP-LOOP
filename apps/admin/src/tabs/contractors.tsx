import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AvailabilityBadge } from "@loop/ui";
import {
  adminGetContractorCv,
  useAdminConfirmOnBehalf,
  useAdminGetContractor,
  useAdminGetContractorPhoto,
  useAdminListContractors,
  useAdminSendLoopMessage,
  type AdminContractorListDtoItemsItem,
} from "@loop/api-client";
import { DataTable, Notice, Pager, Panel, ReasonForm, columnsFor, errMsg, fmt, fullName, pence } from "../lib.js";

const COLOUR_OPTIONS = [
  ["LIME", "Available Now"],
  ["ORANGE", "Available Soon"],
  ["RED", "In Contract"],
  ["BLUE", "Permanently Employed"],
  ["GREY", "Unconfirmed"],
] as const;
const IR35_OPTIONS = ["INSIDE", "OUTSIDE", "EITHER", "UNSURE"] as const;
type Filters = { colour: string; role: string; skill: string; location: string; ir35: string };
const NO_FILTERS: Filters = { colour: "", role: "", skill: "", location: "", ir35: "" };

const col = columnsFor<AdminContractorListDtoItemsItem>();

export function Contractors({ can }: { can: (p: string) => boolean }) {
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Filters>(NO_FILTERS);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const { data, error } = useAdminListContractors({
    q: search || undefined,
    colour: (filters.colour || undefined) as (typeof COLOUR_OPTIONS)[number][0] | undefined,
    role: filters.role || undefined,
    skill: filters.skill || undefined,
    location: filters.location || undefined,
    ir35: (filters.ir35 || undefined) as (typeof IR35_OPTIONS)[number] | undefined,
    page,
    pageSize: 25,
  });
  const list = data?.data;

  const columns = col.columns([
    col.display({ id: "name", header: "Name", cell: ({ row }) => <button type="button" className="link" onClick={() => setSelected(row.original.id)}>{fullName(row.original)}</button> }),
    col.accessor("email", { header: "Email", cell: (c) => c.getValue() ?? "—" }),
    col.accessor("title", { header: "Title", cell: (c) => c.getValue() ?? "—" }),
    col.accessor("location", { header: "Location", cell: (c) => c.getValue() ?? "—" }),
    col.accessor("targetDayRatePence", { header: "Target rate", cell: (c) => pence(c.getValue()) }),
    col.accessor("ir35Status", { header: "IR35", cell: (c) => c.getValue() ?? "—" }),
    col.display({ id: "colour", header: "Availability", cell: ({ row }) => <AvailabilityBadge colour={row.original.colour} /> }),
    col.accessor("lastConfirmedAt", { header: "Last confirmed", cell: (c) => fmt(c.getValue()) }),
    col.display({ id: "state", header: "Status", cell: ({ row }) => [row.original.live ? "Live" : "Not live", row.original.paused ? "Paused" : null, row.original.searchSuppressed ? "Suppressed" : null].filter(Boolean).join(" · ") }),
  ]);

  return (
    <>
      <h2>Contractors</h2>
      <form className="row" onSubmit={(e: FormEvent) => { e.preventDefault(); setPage(1); setSearch(q.trim()); setFilters(draft); }}>
        <label>
          Search name, email or phone
          <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={100} />
        </label>
        <label>
          Availability
          <select value={draft.colour} onChange={(e) => setDraft({ ...draft, colour: e.target.value })}>
            <option value="">Any</option>
            {COLOUR_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label>Role<input value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} maxLength={100} /></label>
        <label>Skill<input value={draft.skill} onChange={(e) => setDraft({ ...draft, skill: e.target.value })} maxLength={100} /></label>
        <label>Location<input value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} maxLength={100} /></label>
        <label>
          IR35
          <select value={draft.ir35} onChange={(e) => setDraft({ ...draft, ir35: e.target.value })}>
            <option value="">Any</option>
            {IR35_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        <button type="submit">Search</button>
        <button type="button" onClick={() => { setQ(""); setSearch(""); setDraft(NO_FILTERS); setFilters(NO_FILTERS); setPage(1); }}>Clear</button>
      </form>
      <Notice error={error} />
      <DataTable data={list?.items ?? []} columns={columns} empty="No contractors found." />
      {list ? <Pager page={list.page} pageSize={list.pageSize} total={list.total} onPage={setPage} /> : null}
      {selected ? <Detail key={selected} id={selected} can={can} onClose={() => setSelected(null)} /> : null}
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
  const [formError, setFormError] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries();
  const photo = useAdminGetContractorPhoto(id, { query: { enabled: Boolean(c?.profile.hasPhoto) } });
  const photoUrl = photo.data?.data.url ?? null;

  // ADM-01: start the form from the saved record (and re-sync after a save), never from fixed defaults.
  // The panel is keyed by contractor id, so values cannot leak from one contractor to the next.
  const savedEmployment = c?.employment ?? null;
  const savedFrom = c?.availableFrom ?? null;
  const savedEnd = c?.contractEndDate ?? null;
  const loaded = Boolean(c);
  useEffect(() => {
    if (!loaded) return;
    setEmployment(savedEmployment === "CONTRACTING" || savedEmployment === "PERMANENT" || savedEmployment === "BETWEEN_CONTRACTS" ? savedEmployment : "BETWEEN_CONTRACTS");
    setAvailableFrom(savedFrom ?? "");
    setEndDate(savedEnd ?? "");
  }, [loaded, savedEmployment, savedFrom, savedEnd]);

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
          <h4>Professional profile</h4>
          {photoUrl ? <img src={photoUrl} alt="Profile photograph" width={96} height={96} /> : null}
          <dl className="facts" data-testid="profile">
            <dt>Title</dt><dd>{c.profile.title ?? "—"}</dd>
            <dt>Preferred roles</dt><dd>{c.profile.preferredRoles.join(", ") || "—"}</dd>
            <dt>Skills</dt><dd>{c.profile.skills.join(", ") || "—"}</dd>
            <dt>Location</dt><dd>{c.profile.location ?? "—"}</dd>
            <dt>Work locations</dt><dd>{[...c.profile.workLocations, ...c.profile.otherPlaces, ...c.profile.londonAreas].join(", ") || "—"}{c.profile.remoteUk ? " · Remote UK" : ""}</dd>
            <dt>Work patterns</dt><dd>{c.profile.workPatterns.join(", ") || "—"}</dd>
            <dt>Day rate (target / minimum)</dt><dd>{pence(c.profile.targetDayRatePence)} / {pence(c.profile.minDayRatePence)}</dd>
            <dt>IR35</dt><dd>{c.profile.ir35Status ?? "—"}</dd>
            <dt>Notice period</dt><dd>{c.profile.noticePeriodText ?? "—"}</dd>
            <dt>Security clearance</dt><dd>{c.profile.securityClearance ?? "—"}</dd>
            <dt>CV</dt>
            <dd>
              {c.profile.hasCv ? (
                <button type="button" className="link" onClick={() => { void adminGetContractorCv(id).then((r) => { if (r.status === 200) window.open(r.data.url, "_blank", "noopener,noreferrer"); }); }}>
                  View CV (version {c.profile.cvVersion})
                </button>
              ) : "No CV on file"}
            </dd>
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
                onSubmit={(reason) => {
                  // ADM-07: a contract needs an expected end date (an unknown one would silently become Unconfirmed).
                  if (employment === "CONTRACTING" && !endDate) { setFormError("Enter the expected contract end date to confirm a contract."); return; }
                  setFormError(null);
                  confirm.mutate(
                    { id, data: { employment, availableFrom: availableFrom || null, contractEndDate: endDate || null, reason } },
                    { onSuccess: () => { setDone("Confirmed on their behalf."); void refresh(); } },
                  );
                }}
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
                <label>Contract end date{employment === "CONTRACTING" ? " (required)" : ""}<input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
              </ReasonForm>
              <Notice error={confirm.error} />
              {formError ? <p role="alert" className="error">{formError}</p> : null}
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
