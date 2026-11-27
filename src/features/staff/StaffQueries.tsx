/**
 * Staff profile panels (owner, 2026-11-26):
 * - Queries: issue a query to a member of staff, record their response and the
 *   outcome; every step is kept (services/staffQueries).
 * - Account: deactivate or reactivate a front desk account or a PR agent's
 *   account, with a reason (services/accountAccess). Branch Manager and
 *   Company Admin only.
 */
import { useState } from "react";
import { CheckCircle2, ChevronDown, FileWarning, History, Plus, Power, PowerOff, RotateCcw, Send } from "lucide-react";
import { useApp } from "@/app/AppState";
import { logAudit } from "@/services/audit";
import { setAccountOff, useAccountAccess } from "@/services/accountAccess";
import { QUERY_OUTCOMES, QUERY_REASONS, STAGE_TEXT, closeQuery, issueQuery, queriesOf, recordResponse, reopenQuery, stageOf, useStaffQueries, type QueryOutcome, type QueryStage, type StaffQuery } from "@/services/staffQueries";
import { Badge, Button, type Tone } from "@/shared/ui/controls";
import { Modal } from "@/shared/ui/Modal";
import { FieldError } from "@/shared/ui/FieldError";

const today = () => new Date().toISOString().slice(0, 10);
const day = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const stamp = (iso: string) => `${day(iso)} · ${new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
const STAGE_TONE: Record<QueryStage, Tone> = { awaiting: "warn", responded: "info", closed: "neutral" };
const OUTCOME_TONE: Record<QueryOutcome, Tone> = { Cleared: "ok", "Verbal warning": "warn", "Written warning": "warn", "Final warning": "danger", Suspended: "danger", Dismissed: "danger" };

/* ─────────────── Queries ─────────────── */

export function QueriesPanel({ staffId, staffName, branchId }: { staffId: string; staffName: string; branchId: string }) {
  const all = useStaffQueries();
  const list = queriesOf(all, staffId);
  const [issuing, setIssuing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(list[0]?.id ?? null);
  const open = list.filter((q) => !q.outcome).length;
  const warnings = list.filter((q) => q.outcome && q.outcome.value !== "Cleared").length;
  return (
    <>
      <section className="fd-section">
        <h3 className="fd-section-title">
          <span>Queries</span>
          <Button variant="secondary" size="sm" onClick={() => setIssuing(true)}>
            <Plus size={15} /> Issue a query
          </Button>
        </h3>
        <div className="sq-sum">
          <span>
            <b>{list.length}</b> issued
          </span>
          <span className={open ? "is-warn" : ""}>
            <b>{open}</b> open
          </span>
          <span className={warnings ? "is-danger" : ""}>
            <b>{warnings}</b> ended with action
          </span>
        </div>
        {list.length ? (
          <ul className="sq-list">
            {list.map((q) => (
              <QueryCard key={q.id} q={q} open={openId === q.id} onToggle={() => setOpenId(openId === q.id ? null : q.id)} />
            ))}
          </ul>
        ) : (
          <p className="fd-note">No queries on record for {staffName}. When one is issued, record the date, the reason, their response and the outcome here; the full history stays on their profile.</p>
        )}
      </section>
      {issuing && <IssueQueryDialog staffId={staffId} staffName={staffName} branchId={branchId} onClose={() => setIssuing(false)} onIssued={(id) => (setIssuing(false), setOpenId(id))} />}
    </>
  );
}

function QueryCard({ q, open, onToggle }: { q: StaffQuery; open: boolean; onToggle: () => void }) {
  const { user, showToast } = useApp();
  const stage = stageOf(q);
  const [reply, setReply] = useState(q.response?.text ?? "");
  const [replyOn, setReplyOn] = useState(q.response?.on ?? today());
  const [editingReply, setEditingReply] = useState(!q.response);
  const [outcome, setOutcome] = useState<QueryOutcome>("Cleared");
  const [note, setNote] = useState("");
  const [why, setWhy] = useState("");
  const [reopening, setReopening] = useState(false);
  const overdue = stage === "awaiting" && q.replyBy && q.replyBy < today();
  return (
    <li className={`sq-card ${open ? "is-open" : ""}`}>
      <button type="button" className="sq-head" onClick={onToggle} aria-expanded={open}>
        <span className="sq-icon" aria-hidden="true">
          <FileWarning size={17} />
        </span>
        <span className="sq-title">
          <b>{q.reason}</b>
          <small>
            Issued {day(q.issuedOn)} by {q.issuedBy} · <span className="mono">{q.id}</span>
          </small>
        </span>
        {q.outcome ? (
          <Badge tone={OUTCOME_TONE[q.outcome.value]} dot>
            {q.outcome.value}
          </Badge>
        ) : (
          <Badge tone={overdue ? "danger" : STAGE_TONE[stage]} dot>
            {overdue ? "Reply overdue" : STAGE_TEXT[stage]}
          </Badge>
        )}
        <ChevronDown size={17} className="sq-chev" />
      </button>
      {open && (
        <div className="sq-body">
          <dl className="sq-dl">
            <div>
              <dt>Date issued</dt>
              <dd>{day(q.issuedOn)}</dd>
            </div>
            <div>
              <dt>Reply asked for by</dt>
              <dd>{q.replyBy ? day(q.replyBy) : "No date set"}</dd>
            </div>
            <div className="full">
              <dt>Reason and details</dt>
              <dd>{q.details || q.reason}</dd>
            </div>
          </dl>

          <div className="sq-block">
            <h4>Their response</h4>
            {q.response && !editingReply ? (
              <>
                <p className="sq-quote">{q.response.text}</p>
                <small className="sq-meta">
                  Received {day(q.response.on)} · recorded by {q.response.recordedBy}
                  {!q.outcome && (
                    <button type="button" className="sq-link" onClick={() => setEditingReply(true)}>
                      Edit
                    </button>
                  )}
                </small>
              </>
            ) : q.outcome ? (
              <p className="fd-note">No response was recorded.</p>
            ) : (
              <div className="sq-form">
                <label className="field">
                  What they said (written or verbal)
                  <textarea value={reply} maxLength={1500} onChange={(e) => setReply(e.target.value)} placeholder="Their reply to the query, in their words where possible" />
                </label>
                <label className="field sq-date">
                  Received on
                  <input type="date" value={replyOn} max={today()} min={q.issuedOn} onChange={(e) => setReplyOn(e.target.value)} />
                </label>
                <Button
                  variant="secondary"
                  disabled={reply.trim().length < 3}
                  onClick={() => {
                    recordResponse(q.id, reply, replyOn, user.name);
                    logAudit({ category: "Staff", action: "Query response recorded", record: q.id, details: q.reason, branchId: q.branchId });
                    setEditingReply(false);
                    showToast("Response recorded");
                  }}
                >
                  <Send size={15} /> Save response
                </Button>
              </div>
            )}
          </div>

          <div className="sq-block">
            <h4>Outcome</h4>
            {q.outcome ? (
              <>
                <p className="sq-outcome">
                  <Badge tone={OUTCOME_TONE[q.outcome.value]} dot>
                    {q.outcome.value}
                  </Badge>
                  {q.outcome.note && <span>{q.outcome.note}</span>}
                </p>
                <small className="sq-meta">
                  Decided {day(q.outcome.on)} by {q.outcome.by}
                  {!reopening && (
                    <button type="button" className="sq-link" onClick={() => setReopening(true)}>
                      Reopen
                    </button>
                  )}
                </small>
                {reopening && (
                  <div className="sq-form">
                    <label className="field">
                      Why reopen it (needed)
                      <input value={why} maxLength={200} onChange={(e) => setWhy(e.target.value)} placeholder="For example: new information, appeal" />
                    </label>
                    <Button
                      variant="secondary"
                      disabled={why.trim().length < 3}
                      onClick={() => {
                        reopenQuery(q.id, user.name, why);
                        logAudit({ category: "Staff", action: "Query reopened", record: q.id, details: why.trim(), branchId: q.branchId });
                        setReopening(false);
                        setWhy("");
                      }}
                    >
                      <RotateCcw size={15} /> Reopen
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <div className="sq-form">
                <div className="sq-outcomes" role="radiogroup" aria-label="Outcome">
                  {QUERY_OUTCOMES.map((o) => (
                    <button key={o.value} type="button" role="radio" aria-checked={outcome === o.value} className={outcome === o.value ? "is-on" : ""} onClick={() => setOutcome(o.value)}>
                      <b>{o.value}</b>
                      <small>{o.hint}</small>
                    </button>
                  ))}
                </div>
                <label className="field">
                  Note {outcome === "Cleared" ? "(optional)" : "(needed)"}
                  <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder={outcome === "Suspended" ? "For example: two weeks without pay, from 1 Dec" : "What was decided and why"} />
                </label>
                <Button
                  disabled={outcome !== "Cleared" && note.trim().length < 3}
                  onClick={() => {
                    closeQuery(q.id, outcome, note, user.name);
                    logAudit({ category: "Staff", action: `Query closed: ${outcome}`, record: q.id, details: `${q.reason}${note.trim() ? ` · ${note.trim()}` : ""}`, branchId: q.branchId });
                    showToast(`Query closed: ${outcome}`);
                    setNote("");
                  }}
                >
                  <CheckCircle2 size={15} /> Close the query
                </Button>
              </div>
            )}
          </div>

          <div className="sq-block">
            <h4>
              <History size={14} /> History
            </h4>
            <ol className="sq-history">
              {[...q.history].reverse().map((h, i) => (
                <li key={i}>
                  <b>{h.action}</b>
                  {h.note && <span>{h.note}</span>}
                  <small>
                    {stamp(h.at)} · {h.by}
                  </small>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </li>
  );
}

function IssueQueryDialog({ staffId, staffName, branchId, onClose, onIssued }: { staffId: string; staffName: string; branchId: string; onClose: () => void; onIssued: (id: string) => void }) {
  const { user, showToast } = useApp();
  const [on, setOn] = useState(today());
  const [reason, setReason] = useState<string>(QUERY_REASONS[0]);
  const [other, setOther] = useState("");
  const [details, setDetails] = useState("");
  const [replyBy, setReplyBy] = useState("");
  const [tried, setTried] = useState(false);
  const why = reason === "Other" ? other.trim() : reason;
  const bad = { why: !why ? "Say what the query is about" : "", details: details.trim().length < 5 ? "Describe what happened" : "" };
  const submit = () => {
    setTried(true);
    if (bad.why || bad.details) return;
    const q = issueQuery({ staffId, branchId, issuedOn: on, issuedBy: user.name, reason: why, details, replyBy: replyBy || undefined });
    logAudit({ category: "Staff", action: "Query issued", record: `${staffName} · ${q.id}`, details: why, branchId });
    showToast(`Query issued to ${staffName}`);
    onIssued(q.id);
  };
  return (
    <Modal
      open
      onClose={onClose}
      icon={FileWarning}
      title={`Issue a query to ${staffName}`}
      description="It goes on their profile with the date and reason. Record their response and the outcome when you have them."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit}>
            <FileWarning size={15} /> Issue query
          </Button>
        </>
      }
    >
      <div className="sq-grid">
        <label className="field">
          Date issued
          <input type="date" value={on} max={today()} onChange={(e) => setOn(e.target.value)} />
        </label>
        <label className="field">
          Reply asked for by (optional)
          <input type="date" value={replyBy} min={on} onChange={(e) => setReplyBy(e.target.value)} />
        </label>
      </div>
      <label className="field">
        Reason
        <select value={reason} onChange={(e) => setReason(e.target.value)}>
          {QUERY_REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      {reason === "Other" && (
        <label className="field">
          What it is about
          <input value={other} maxLength={80} onChange={(e) => setOther(e.target.value)} placeholder="A short reason" />
          <FieldError msg={tried && bad.why} />
        </label>
      )}
      <label className="field">
        What happened
        <textarea value={details} maxLength={1500} onChange={(e) => setDetails(e.target.value)} placeholder="Dates, what was seen or reported, anything already said" />
        <FieldError msg={tried && bad.details} />
      </label>
    </Modal>
  );
}

/* ─────────────── Account access ─────────────── */

/** Deactivate or reactivate a sign-in account (front desk or PR agent). */
export function AccountAccessPanel({ accountKey, name, what, branchId }: { accountKey: string; name: string; what: string; branchId: string | null }) {
  const { user, showToast } = useApp();
  const access = useAccountAccess()[accountKey];
  const off = !!access?.off;
  const [asking, setAsking] = useState(false);
  const [why, setWhy] = useState("");
  return (
    <section className="fd-section">
      <h3 className="fd-section-title">
        <span>Account</span>
      </h3>
      <div className={`sq-account ${off ? "is-off" : ""}`}>
        <span className="sq-account-icon" aria-hidden="true">
          {off ? <PowerOff size={18} /> : <Power size={18} />}
        </span>
        <span>
          <b>{off ? "Deactivated" : "Active"}</b>
          <small>{off ? `${name} can't sign in. Their record, history and figures are kept.` : `${name} can sign in to STANLEY as ${what}.`}</small>
        </span>
        <Button variant={off ? "primary" : "secondary"} className={off ? "" : "st-trash"} onClick={() => (setWhy(""), setAsking(true))}>
          {off ? (
            <>
              <Power size={15} /> Reactivate
            </>
          ) : (
            <>
              <PowerOff size={15} /> Deactivate account
            </>
          )}
        </Button>
      </div>
      {access?.history.length ? (
        <ol className="sq-history">
          {access.history.map((h, i) => (
            <li key={i}>
              <b>{h.action}</b>
              {h.reason && <span>{h.reason}</span>}
              <small>
                {stamp(h.at)} · {h.by}
              </small>
            </li>
          ))}
        </ol>
      ) : null}
      {asking && (
        <Modal
          open
          onClose={() => setAsking(false)}
          icon={off ? Power : PowerOff}
          title={off ? `Reactivate ${name}'s account?` : `Deactivate ${name}'s account?`}
          description={off ? `${name} will be able to sign in again.` : `${name} won't be able to sign in. Nothing is deleted: their record, history and figures stay, and you can reactivate the account later.`}
          footer={
            <>
              <Button variant="secondary" onClick={() => setAsking(false)}>
                Cancel
              </Button>
              <Button
                variant={off ? "primary" : "danger"}
                disabled={why.trim().length < 3}
                onClick={() => {
                  setAccountOff(accountKey, !off, user.name, why);
                  logAudit({ category: accountKey.startsWith("agent:") ? "PR agents" : "Staff", action: off ? "Account reactivated" : "Account deactivated", record: name, details: why.trim(), branchId });
                  showToast(off ? `${name}'s account is active again` : `${name}'s account is deactivated`);
                  setAsking(false);
                }}
              >
                {off ? "Reactivate" : "Deactivate"}
              </Button>
            </>
          }
        >
          <label className="field">
            Why (needed)
            <textarea value={why} maxLength={300} onChange={(e) => setWhy(e.target.value)} placeholder={off ? "For example: back from suspension" : "For example: left the company, suspended pending a query"} />
          </label>
        </Modal>
      )}
    </section>
  );
}
