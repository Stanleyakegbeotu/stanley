/**
 * Reports page (owner, 2026-11-26): complaints and issues from PR agents and
 * staff (services/issueReports), in an audit-style table: today's and past
 * reports, New, Attended and Resolved, with search and filters. Each report
 * opens with its full details and history; the person it was sent to can mark
 * it attended, resolve it (saying what was done), reopen it or add a note.
 * Anyone can send a report from here too.
 *
 * Company Admin: "/reports" (every branch, or the chosen one). Branch:
 * "/branch/<id>/reports" (the manager sees reports to the manager and the
 * front desk; the front desk sees reports to the front desk).
 */
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleDot, Flag, Hash, MessagesSquare, Plus, RotateCcw, Send, Siren } from "lucide-react";
import { useApp } from "@/app/AppState";
import { ACTIVE_BRANCHES, getBranch } from "@/data/company";
import { logAudit } from "@/services/audit";
import { REPORT_CATEGORIES, STATUS_TEXT, TO_TEXT, addReport, addReportNote, setReportStatus, useIssueReports, visibleReports, type IssueReport, type ReportCategory, type ReportStatus, type ReportTo } from "@/services/issueReports";
import { formatCount } from "@/shared/format";
import { AnimatedPage } from "@/shared/motion";
import { Badge, Button, EmptyState, SearchInput, Segmented, SelectMenu, type Tone } from "@/shared/ui/controls";
import { Modal } from "@/shared/ui/Modal";
import { Pagination } from "@/shared/ui/Pagination";
import { FieldError } from "@/shared/ui/FieldError";
import { PageHero } from "@/features/shared/PageHero";

const STATUS_TONE: Record<ReportStatus, Tone> = { new: "warn", attended: "info", resolved: "ok" };
const DAY = 86_400_000;
const stamp = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
};
const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

type When = "all" | "today" | "7" | "30";

export function IssueReportsPage({ branchId }: { branchId: string | null }) {
  const { user, context } = useApp();
  const all = useIssueReports();
  const kind: "admin" | "manager" | "staff" = !branchId ? "admin" : user.kind === "staff" ? "staff" : "manager";
  const scope = branchId ? [branchId] : context === "all" ? null : [context];
  const mine = useMemo(() => visibleReports(all, { kind, branchId }, scope), [all, kind, branchId, scope?.join(",")]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<ReportStatus | "all">("all");
  const [when, setWhen] = useState<When>("all");
  const [cat, setCat] = useState<ReportCategory | "all">("all");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [openId, setOpenId] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const t = q.trim().toLowerCase();
  const since = when === "today" ? new Date(new Date().toDateString()).getTime() : when === "all" ? 0 : Date.now() - Number(when) * DAY;
  const rows = mine.filter(
    (r) =>
      (status === "all" || r.status === status) &&
      (cat === "all" || r.category === cat) &&
      new Date(r.at).getTime() >= since &&
      (!t || `${r.id} ${r.subject} ${r.details} ${r.from.name} ${r.about ?? ""} ${r.patientRef ?? ""} ${r.category} ${getBranch(r.branchId)?.name ?? ""}`.toLowerCase().includes(t)),
  );
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const safe = Math.min(page, pages);
  const visible = rows.slice((safe - 1) * size, safe * size);
  const open = openId ? (mine.find((r) => r.id === openId) ?? null) : null;
  const count = (s: ReportStatus) => mine.filter((r) => r.status === s).length;
  const scopeLabel = branchId ? `${getBranch(branchId)?.name ?? ""} branch` : scope ? `${getBranch(scope[0]!)?.name ?? ""} branch` : "All branches";
  const reset = () => setPage(1);

  return (
    <AnimatedPage>
      <PageHero
        eyebrow={`Complaints and issues · ${scopeLabel}`}
        title="Reports"
        period={false}
        icon={Flag}
        strip={[
          { label: "Today", value: formatCount(mine.filter((r) => isToday(r.at)).length) },
          { label: "New", value: formatCount(count("new")) },
          { label: "Attended", value: formatCount(count("attended")) },
          { label: "Resolved", value: formatCount(count("resolved")) },
        ]}
        actions={
          <Button onClick={() => setWriting(true)}>
            <Plus size={16} /> Send a report
          </Button>
        }
      />

      <p className="ir-intro">
        {kind === "admin"
          ? "Every report from PR agents and staff, across the branches. Open one to see the details, attend to it and resolve it."
          : kind === "manager"
            ? "Reports sent to you and to the front desk of this branch, from PR agents and staff."
            : "Reports sent to the front desk, from PR agents and staff."}
      </p>

      <div className="inv-toolbar al-toolbar ir-toolbar">
        <SearchInput placeholder="Search report, person, referral ID or details" value={q} onChange={(v) => (setQ(v), reset())} />
        <Segmented
          label="Status"
          value={status}
          onChange={(v) => (setStatus(v), reset())}
          options={[
            { value: "all", label: `All ${mine.length}` },
            { value: "new", label: `New ${count("new")}` },
            { value: "attended", label: `Attended ${count("attended")}` },
            { value: "resolved", label: `Resolved ${count("resolved")}` },
          ]}
        />
        <Segmented
          label="When"
          value={when}
          onChange={(v) => (setWhen(v), reset())}
          options={[
            { value: "today", label: "Today" },
            { value: "7", label: "7 days" },
            { value: "30", label: "30 days" },
            { value: "all", label: "All" },
          ]}
        />
        <SelectMenu value={cat} ariaLabel="Type" className="select-btn inv-sort" options={[{ value: "all", label: "All types" }, ...REPORT_CATEGORIES.map((c) => ({ value: c, label: c }))]} onChange={(v) => (setCat(v as ReportCategory | "all"), reset())} />
      </div>

      <div className="card bp-card rf-table-card">
        <div className="inv-table-tools">
          <span className="inv-count">
            {formatCount(rows.length)} of {formatCount(mine.length)} reports · newest first
          </span>
        </div>
        <div className="table-wrap thin-scroll">
          <table className="bp-table rf-table al-table ir-table" aria-label="Reports">
            <thead>
              <tr>
                <th>Received</th>
                <th>From</th>
                <th>Report</th>
                <th>Sent to</th>
                {!branchId && <th>Branch</th>}
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState title={mine.length ? "No report matches these filters" : "No reports yet"}>Reports from PR agents and staff appear here.</EmptyState>
                  </td>
                </tr>
              ) : (
                visible.map((r) => (
                  <tr key={r.id} className="pr-row" tabIndex={0} onClick={() => setOpenId(r.id)} onKeyDown={(k) => (k.key === "Enter" || k.key === " ") && (k.preventDefault(), setOpenId(r.id))}>
                    <td className="al-when">
                      <b>{isToday(r.at) ? "Today" : new Date(r.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</b>
                      <small>
                        {new Date(r.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} · <span className="mono">{r.id}</span>
                      </small>
                    </td>
                    <td>
                      <strong>{r.from.name}</strong>
                      <small className="ep-sub">{r.from.role}</small>
                    </td>
                    <td className="ir-subject">
                      <strong>
                        {r.urgent && <Siren size={14} className="ir-urgent" aria-label="Urgent" />} {r.subject}
                      </strong>
                      <small className="ep-sub">
                        {r.category}
                        {r.about ? ` · about ${r.about}` : ""}
                        {r.patientRef ? ` · ${r.patientRef}` : ""}
                      </small>
                    </td>
                    <td>{TO_TEXT[r.to]}</td>
                    {!branchId && <td>{getBranch(r.branchId)?.name ?? ""}</td>}
                    <td>
                      <Badge tone={STATUS_TONE[r.status]} dot>
                        {STATUS_TEXT[r.status]}
                      </Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={safe} pageSize={size} sizes={[10, 25, 50, 100]} total={rows.length} noun="reports" onPage={(p) => setPage(Math.min(Math.max(1, p), pages))} onPageSize={(s) => (setSize(s), setPage(1))} />
      </div>

      {open && <ReportDetail r={open} kind={kind} onClose={() => setOpenId(null)} />}
      {writing && <NewReport branchId={branchId} kind={kind} onClose={() => setWriting(false)} onSent={(id) => (setWriting(false), setOpenId(id))} />}
    </AnimatedPage>
  );
}

/* ─────────────── one report ─────────────── */

function ReportDetail({ r, kind, onClose }: { r: IssueReport; kind: "admin" | "manager" | "staff"; onClose: () => void }) {
  const { user, navigate, showToast } = useApp();
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  // The person it was sent to acts on it (the admin can act on any; the manager also on the front desk's).
  const canAct = kind === "admin" || (kind === "manager" && r.to !== "admin") || (kind === "staff" && r.to === "frontdesk");
  const branch = getBranch(r.branchId);
  const act = (s: ReportStatus) => {
    if (s === "resolved" && note.trim().length < 5) return setErr("Say what was done to resolve it.");
    setReportStatus(r.id, s, `${user.name}, ${user.role}`, note);
    logAudit({ category: "Reports", action: s === "attended" ? "Report attended" : s === "resolved" ? "Report resolved" : "Report reopened", record: `${r.id} · ${r.subject}`, details: [note.trim(), `from ${r.from.name}`].filter(Boolean).join(" · "), branchId: r.branchId });
    showToast(s === "attended" ? "Marked attended" : s === "resolved" ? "Report resolved" : "Report reopened");
    setNote("");
    setErr(null);
  };
  const addNote = () => {
    if (note.trim().length < 3) return setErr("Write the note first.");
    addReportNote(r.id, `${user.name}, ${user.role}`, note);
    setNote("");
    setErr(null);
    showToast("Note added");
  };
  const inbox = kind === "admin" ? "/messages" : `/branch/${r.branchId}/messages`;
  return (
    <Modal
      open
      onClose={onClose}
      icon={Flag}
      xl
      title={r.subject}
      description={`${r.id} · ${r.category} · ${branch?.name ?? ""} branch · sent to ${TO_TEXT[r.to]}`}
      footer={
        <div className="ir-foot">
          <button type="button" className="bl-btn" onClick={() => navigate(inbox)}>
            <MessagesSquare size={15} /> Message {r.from.kind === "agent" ? "the PR agent" : r.from.name}
          </button>
          {canAct && (
            <>
              {r.status === "new" && (
                <button type="button" className="bl-btn" onClick={() => act("attended")}>
                  <CircleDot size={15} /> Mark attended
                </button>
              )}
              {r.status !== "resolved" ? (
                <button type="button" className="bl-btn is-primary" onClick={() => act("resolved")}>
                  <CheckCircle2 size={15} /> Resolve
                </button>
              ) : (
                <button type="button" className="bl-btn" onClick={() => act("new")}>
                  <RotateCcw size={15} /> Reopen
                </button>
              )}
            </>
          )}
        </div>
      }
    >
      <div className="ir-detail">
        <div className="ir-facts">
          <span>
            <small>Status</small>
            <Badge tone={STATUS_TONE[r.status]} dot>
              {STATUS_TEXT[r.status]}
            </Badge>
          </span>
          <span>
            <small>From</small>
            <b>
              {r.from.name}, {r.from.role}
            </b>
          </span>
          <span>
            <small>Received</small>
            <b>{stamp(r.at)}</b>
          </span>
          {r.patientRef && (
            <span>
              <small>Referral / patient</small>
              <b className="mono">{r.patientRef}</b>
            </span>
          )}
          {r.about && (
            <span>
              <small>About</small>
              <b>{r.about}</b>
            </span>
          )}
          {r.urgent && (
            <span className="is-urgent">
              <small>Priority</small>
              <b>
                <AlertTriangle size={14} /> Urgent
              </b>
            </span>
          )}
        </div>
        <section className="ir-card">
          <h3>What was reported</h3>
          <p className="ir-text">{r.details}</p>
        </section>
        <section className="ir-card">
          <h3>History</h3>
          <ol className="ir-steps">
            {r.history.map((h, i) => (
              <li key={i}>
                <b>{h.action}</b>
                <small>
                  {h.by} · {stamp(h.at)}
                </small>
                {h.note && <p>{h.note}</p>}
              </li>
            ))}
          </ol>
        </section>
        {canAct && (
          <label className={`field ${err ? "is-error" : ""}`}>
            {r.status === "resolved" ? "Note" : "What was done (needed to resolve)"}
            <textarea value={note} maxLength={600} onChange={(e) => (setNote(e.target.value), setErr(null))} placeholder="For example: spoke with the receptionist and called the patient to apologise." />
            <FieldError msg={err} />
            <button type="button" className="ir-note-btn" onClick={addNote}>
              <Plus size={14} /> Add as a note only
            </button>
          </label>
        )}
      </div>
    </Modal>
  );
}

/* ─────────────── send a report ─────────────── */

function NewReport({ branchId, kind, onClose, onSent }: { branchId: string | null; kind: "admin" | "manager" | "staff"; onClose: () => void; onSent: (id: string) => void }) {
  const { user, showToast } = useApp();
  const [branch, setBranch] = useState(branchId ?? ACTIVE_BRANCHES[0]?.id ?? "");
  const toOptions: ReportTo[] = kind === "admin" ? ["manager", "frontdesk"] : kind === "manager" ? ["admin", "frontdesk"] : ["manager", "admin"];
  const [to, setTo] = useState<ReportTo>(toOptions[0]!);
  const [category, setCategory] = useState<ReportCategory>("Other");
  const [subject, setSubject] = useState("");
  const [details, setDetails] = useState("");
  const [about, setAbout] = useState("");
  const [ref, setRef] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [tried, setTried] = useState(false);
  const errs = { subject: subject.trim().length < 5 ? "Give the report a short title." : null, details: details.trim().length < 10 ? "Describe what happened." : null };
  const send = () => {
    setTried(true);
    if (errs.subject || errs.details) return;
    const r = addReport({ branchId: branch, from: { kind: "staff", name: user.name, role: user.role }, to, category, subject: subject.trim(), details: details.trim(), about: about.trim() || undefined, patientRef: ref.trim().toUpperCase() || undefined, urgent }, `${user.name}, ${user.role}`);
    logAudit({ category: "Reports", action: "Report sent", record: `${r.id} · ${r.subject}`, details: `to ${TO_TEXT[to]} · ${category}`, branchId: branch });
    showToast(`Report sent to the ${TO_TEXT[to]}`);
    onSent(r.id);
  };
  return (
    <Modal
      open
      onClose={onClose}
      icon={Send}
      wide
      title="Send a report"
      description="A complaint or an issue that needs attention. The person you send it to sees it on their Reports page."
      footer={
        <>
          <button type="button" className="bl-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="bl-btn is-primary" onClick={send}>
            <Send size={15} /> Send report
          </button>
        </>
      }
    >
      <div className="ir-form">
        {!branchId && (
          <label className="field">
            Branch
            <select value={branch} onChange={(e) => setBranch(e.target.value)}>
              {ACTIVE_BRANCHES.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} branch
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          Send to
          <select value={to} onChange={(e) => setTo(e.target.value as ReportTo)}>
            {toOptions.map((o) => (
              <option key={o} value={o}>
                {TO_TEXT[o]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Type
          <select value={category} onChange={(e) => setCategory(e.target.value as ReportCategory)}>
            {REPORT_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className={`field full ${tried && errs.subject ? "is-error" : ""}`}>
          Title
          <input value={subject} maxLength={120} onChange={(e) => setSubject(e.target.value)} placeholder="For example: Patient says she was spoken to rudely" />
          {tried && <FieldError msg={errs.subject} />}
        </label>
        <label className={`field full ${tried && errs.details ? "is-error" : ""}`}>
          What happened
          <textarea value={details} maxLength={2000} onChange={(e) => setDetails(e.target.value)} placeholder="Who, when, and what happened. Press Enter for a new line." />
          {tried && <FieldError msg={errs.details} />}
        </label>
        <label className="field">
          About (optional)
          <input value={about} maxLength={80} onChange={(e) => setAbout(e.target.value)} placeholder="A person, the front desk, a test …" />
        </label>
        <label className="field">
          <span>
            <Hash size={13} /> Referral or patient ID (optional)
          </span>
          <input className="mono" value={ref} maxLength={20} onChange={(e) => setRef(e.target.value)} placeholder="ABJ-R000123" />
        </label>
        <label className="ir-check full">
          <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} /> Urgent: it needs attention today
        </label>
      </div>
    </Modal>
  );
}

