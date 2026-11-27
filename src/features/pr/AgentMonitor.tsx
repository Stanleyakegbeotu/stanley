/**
 * PR Management additions (owner, 2026-11-26):
 *
 *  • PR agent monitor: who is sending, who is slipping, who has gone quiet,
 *    with what to do about each, as a list or as a visit plan by hospital.
 *    Marketers log each check-up (visit, call or message, how it went, the
 *    next date) and the agent's flag goes off. Company Admin, Branch Manager
 *    and front desk (services/agentMonitor).
 *  • Monthly payouts: after paying the agents' monthly commission, mark the
 *    month paid per agent or for everyone. The Branch Manager for their own
 *    branch, the Company Admin for any branch (services/payoutMonths). The
 *    agents only see "Ended ✓" in their app; if one reports an issue with the
 *    month, it shows here and on the Reports page.
 */
import { useMemo, useRef, useState } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, CalendarCheck, CheckCircle2, ChevronDown, ClipboardCheck, Flag, MapPinned, PhoneCall, RotateCcw, Siren, TrendingUp, UserRoundX, Users } from "lucide-react";
import { useApp } from "@/app/AppState";
import { branchRoute } from "@/app/router";
import { getBranch } from "@/data/company";
import { LEGACY_BRANCH_ID, hasPhone } from "@/data/legacy";
import { isoDate } from "@/data/demo/generator";
import { logAudit } from "@/services/audit";
import { agentRanking, resolveRange } from "@/services/analytics";
import { can } from "@/services/permissions";
import { ATTENTION, OUTCOMES, STATUS_HINT, STATUS_LABEL, addCheckUp, useAgentHealth, useCheckUps, type AgentHealth, type AgentStatus, type CheckKind, type Outcome } from "@/services/agentMonitor";
import { useIssueReports } from "@/services/issueReports";
import { useMarketing } from "@/services/marketing";
import { canMarkPaid, lastMonths, markPaid, monthLabel, paidMark, unmarkPaid, usePaidMarks } from "@/services/payoutMonths";
import { formatCount, formatMoney } from "@/shared/format";
import { Badge, EmptyState, SearchInput, Segmented, SelectMenu, type Tone } from "@/shared/ui/controls";
import { Modal } from "@/shared/ui/Modal";
import { Pagination } from "@/shared/ui/Pagination";
import { Popover } from "@/shared/ui/Popover";

/** Rows a page (owner, 2026-11-26). */
const PER_PAGE = 15;

const TONE: Record<AgentStatus, Tone> = { top: "ok", rising: "ok", steady: "neutral", slipping: "danger", quiet: "warn", inactive: "warn", never: "neutral" };
const when = (d: Date | null) => (d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "Never");
const ago = (iso: string) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
};

function Spark({ weeks }: { weeks: number[] }) {
  const max = Math.max(1, ...weeks);
  return (
    <span className="am-spark" aria-hidden="true">
      {weeks.map((w, i) => (
        <i key={i} style={{ height: `${Math.max(2, Math.round((w / max) * 22))}px` }} className={i >= 8 ? "is-recent" : ""} />
      ))}
    </span>
  );
}

/* ─────────────── PR agent monitor ─────────────── */

export function AgentMonitorSection({ branchId }: { branchId: string }) {
  const all = useAgentHealth(branchId);
  // Each agent's marketer: whoever looks after their hospital (owner, 2026-11-27).
  const { staff } = useApp();
  const mk = useMarketing();
  const ownerOf = (hospital: string) => mk.owners[branchId]?.[hospital]?.marketerId ?? null;
  const nameOf = (id: string | null) => (id ? (staff.find((x) => x.id === id)?.name ?? "Former marketer") : "No marketer");
  const [who, setWho] = useState<string>("all");
  const list = who === "all" ? all : all.filter((a) => (ownerOf(a.hospital) ?? "none") === who);
  const byMarketer = useMemo(() => {
    const m = new Map<string, { due: number; all: number }>();
    for (const a of all) {
      const k = ownerOf(a.hospital) ?? "none";
      const v = m.get(k) ?? { due: 0, all: 0 };
      v.all += 1;
      if (a.due) v.due += 1;
      m.set(k, v);
    }
    return [...m.entries()].sort((a, b) => b[1].due - a[1].due);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, mk]);
  const [view, setView] = useState<"due" | "all" | "plan">("due");
  const [status, setStatus] = useState<AgentStatus | "all">("all");
  const [q, setQ] = useState("");
  const [logging, setLogging] = useState<AgentHealth | null>(null);
  const [page, setPage] = useState(1);
  const count = (s: AgentStatus) => list.filter((a) => a.status === s).length;
  const due = list.filter((a) => a.due);
  const t = q.trim().toLowerCase();
  const rows = (view === "all" ? list : due).filter((a) => (status === "all" || a.status === status) && (!t || `${a.agent.name} ${a.hospital} ${a.agent.phone}`.toLowerCase().includes(t)));
  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const safe = Math.min(page, pages);
  const plan = useMemo(() => {
    const m = new Map<string, AgentHealth[]>();
    for (const a of due) m.set(a.hospital, [...(m.get(a.hospital) ?? []), a]);
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [due]);
  const loading = !all.length;
  if (loading && branchId !== LEGACY_BRANCH_ID) return null;
  const chips: { s: AgentStatus; icon: typeof Users }[] = [
    { s: "slipping", icon: ArrowDownRight },
    { s: "quiet", icon: PhoneCall },
    { s: "inactive", icon: UserRoundX },
    { s: "never", icon: Users },
    { s: "top", icon: TrendingUp },
    { s: "rising", icon: ArrowUpRight },
  ];

  return (
    <section className="bd-sec am-sec">
      <header className="bd-sec-head">
        <div>
          <span className="bd-eyebrow">Marketing</span>
          <h2>PR agent monitor</h2>
          <p>Who is sending patients, who is slipping and who has gone quiet, with what to do about each. Log every visit or call so the branch knows, and the agent's flag goes off.</p>
        </div>
        <span className={`am-due ${loading || due.length ? "" : "is-clear"}`}>
          <Flag size={16} /> {loading ? "Working out who to check up on…" : <><b>{formatCount(due.length)}</b> to check up on</>}
        </span>
      </header>
      {byMarketer.length > 1 && (
        <div className="am-who" role="radiogroup" aria-label="Marketer">
          <button type="button" role="radio" aria-checked={who === "all"} className={who === "all" ? "is-on" : ""} onClick={() => (setWho("all"), setPage(1))}>
            <b>Everyone</b>
            <small>{formatCount(all.filter((a) => a.due).length)} to check up on</small>
          </button>
          {byMarketer.map(([k, v]) => (
            <button key={k} type="button" role="radio" aria-checked={who === k} className={`${who === k ? "is-on" : ""} ${k === "none" ? "is-none" : ""}`} onClick={() => (setWho(k), setPage(1))}>
              <b>{k === "none" ? "No marketer" : nameOf(k)}</b>
              <small>
                {formatCount(v.due)} to check up on · {formatCount(v.all)} agents
              </small>
            </button>
          ))}
        </div>
      )}
      <div className="am-chips">
        {chips.map(({ s, icon: Icon }) => (
          <button key={s} type="button" className={`am-chip is-${s} ${status === s ? "is-on" : ""}`} onClick={() => (setStatus(status === s ? "all" : s), setView(ATTENTION.includes(s) ? view : "all"), setPage(1))} title={STATUS_HINT[s]}>
            <Icon size={16} />
            <span>
              <strong className="num">{formatCount(count(s))}</strong>
              <small>{STATUS_LABEL[s]}</small>
            </span>
          </button>
        ))}
      </div>
      <div className="am-tools">
        <Segmented
          label="View"
          value={view}
          onChange={(v) => (setView(v), setPage(1))}
          options={[
            { value: "due", label: `Check up on ${due.length}` },
            { value: "plan", label: "Visit plan by hospital" },
            { value: "all", label: `All agents ${list.length}` },
          ]}
        />
        {view !== "plan" && <SearchInput placeholder="Search agent, hospital or phone" value={q} onChange={(v) => (setQ(v), setPage(1))} />}
      </div>

      {view === "plan" ? (
        plan.length ? (
          <div className="am-plan">
            {plan.map(([hospital, agents]) => (
              <article key={hospital} className="am-hosp">
                <header>
                  <MapPinned size={18} />
                  <b>{hospital}</b>
                  <small>
                    {agents.length} agent{agents.length === 1 ? "" : "s"} to see · {nameOf(ownerOf(hospital))}
                  </small>
                </header>
                <ul>
                  {agents.map((a) => (
                    <li key={a.agent.id}>
                      <span>
                        <b>{a.agent.name}</b>
                        <small>{a.action}</small>
                      </span>
                      <Badge tone={TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>
                      <button type="button" className="rf-row-go" onClick={() => setLogging(a)}>
                        Log check-up
                      </button>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title="Nobody to check up on">Every agent who needed attention has been checked up on.</EmptyState>
        )
      ) : (
        <div className="card bp-card rf-table-card">
          <div className="table-wrap thin-scroll">
            <table className="bp-table rf-table am-table" aria-label="PR agents">
              <thead>
                <tr>
                  <th>PR agent</th>
                  <th>Marketer</th>
                  <th>Status</th>
                  <th className="num">Last 4 weeks</th>
                  <th>12 weeks</th>
                  <th>Last referral</th>
                  <th>What to do</th>
                  <th>Last check-up</th>
                  <th aria-label="Action" />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={9}>
                      <EmptyState title={view === "due" ? "Nobody to check up on" : "No agent matches"}>{view === "due" ? "Every agent who needed attention has been checked up on." : "Try another search."}</EmptyState>
                    </td>
                  </tr>
                ) : (
                  rows.slice((safe - 1) * PER_PAGE, safe * PER_PAGE).map((a) => (
                    <tr key={a.agent.id} className="pr-row" tabIndex={0} onClick={() => setLogging(a)}>
                      <td>
                        <strong>{a.agent.name}</strong>
                        <small className="ep-sub">
                          {a.hospital}
                          {hasPhone(a.agent.phone) ? ` · ${a.agent.phone}` : ""}
                        </small>
                      </td>
                      <td className={ownerOf(a.hospital) ? "" : "lg-muted"}>{nameOf(ownerOf(a.hospital))}</td>
                      <td>
                        <Badge tone={TONE[a.status]} dot={a.due}>
                          {STATUS_LABEL[a.status]}
                        </Badge>
                      </td>
                      <td className="num">
                        <strong>{a.last28}</strong>
                        <small className={`ep-sub ${a.last28 < a.prev28 ? "am-down" : a.last28 > a.prev28 ? "am-up" : ""}`}>
                          {a.last28 === a.prev28 ? "same as before" : `${a.last28 > a.prev28 ? "up" : "down"} from ${a.prev28}`}
                        </small>
                      </td>
                      <td>
                        <Spark weeks={a.weeks} />
                      </td>
                      <td>
                        {when(a.lastAt)}
                        {a.daysSince !== null && <small className="ep-sub">{a.daysSince === 0 ? "today" : a.daysSince === 1 ? "yesterday" : `${a.daysSince} days ago`}</small>}
                      </td>
                      <td className="am-action">{a.action}</td>
                      <td>{a.lastCheck ? <span className="am-check">{a.lastCheck.kind} {ago(a.lastCheck.at)}<small className="ep-sub">{a.lastCheck.outcome}</small></span> : <span className="lg-muted">None yet</span>}</td>
                      <td className="rf-td-go">
                        <button
                          type="button"
                          className="rf-row-go"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLogging(a);
                          }}
                        >
                          Log check-up
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={safe} pageSize={PER_PAGE} sizes={[PER_PAGE]} total={rows.length} noun="agents" onPage={(n) => setPage(Math.min(Math.max(1, n), pages))} onPageSize={() => setPage(1)} />
        </div>
      )}
      {logging && <CheckUpDialog a={logging} branchId={branchId} onClose={() => setLogging(null)} />}
    </section>
  );
}

function CheckUpDialog({ a, branchId, onClose }: { a: AgentHealth; branchId: string; onClose: () => void }) {
  const { user, showToast } = useApp();
  const history = useCheckUps().filter((c) => c.agentId === a.agent.id && c.branchId === branchId);
  const [kind, setKind] = useState<CheckKind>("Visit");
  const [outcome, setOutcome] = useState<Outcome>("Will send patients");
  const [note, setNote] = useState("");
  const [next, setNext] = useState(isoDate(new Date(Date.now() + 14 * 86_400_000)));
  const inDays = (n: number) => isoDate(new Date(Date.now() + n * 86_400_000));
  const trend = a.last28 - a.prev28;
  const save = () => {
    addCheckUp({ agentId: a.agent.id, branchId, by: { name: user.name, role: user.role }, kind, outcome, note: note.trim() || undefined, next: next || undefined });
    logAudit({ category: "PR agents", action: `Check-up logged: ${kind}`, record: a.agent.name, details: [outcome, note.trim(), next ? `next ${next}` : ""].filter(Boolean).join(" · "), branchId });
    showToast(`Check-up with ${a.agent.name} saved. The flag is off until ${next ? new Date(`${next}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "two weeks from now"}.`);
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      icon={ClipboardCheck}
      xl
      title={a.agent.name}
      description={`${a.hospital}${hasPhone(a.agent.phone) ? ` · ${a.agent.phone}` : ""}`}
      footer={
        <>
          <button type="button" className="bl-btn" onClick={onClose}>
            Close
          </button>
          <button type="button" className="bl-btn is-primary is-lg" onClick={save}>
            <CheckCircle2 size={16} /> Save check-up
          </button>
        </>
      }
    >
      <div className="cu">
        {/* Who and how they are doing */}
        <div className={`cu-hero is-${a.status}`}>
          <span className="cu-avatar">{a.agent.name.replace(/^(dr|nrs|mr|mrs|ms)\.?\s+/i, "").slice(0, 2).toUpperCase()}</span>
          <span className="cu-hero-text">
            <Badge tone={TONE[a.status]} dot>
              {STATUS_LABEL[a.status]}
            </Badge>
            <b>{a.action}</b>
            <small>{STATUS_HINT[a.status]}</small>
          </span>
          <span className="cu-trend">
            <small>12 weeks</small>
            <Spark weeks={a.weeks} />
          </span>
        </div>
        <div className="cu-facts">
          <span>
            <small>Last 7 days</small>
            <b>{a.last7}</b>
          </span>
          <span>
            <small>Last 4 weeks</small>
            <b>
              {a.last28}{" "}
              {trend !== 0 && (
                <em className={trend < 0 ? "is-down" : "is-up"}>
                  {trend < 0 ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />} {Math.abs(trend)}
                </em>
              )}
            </b>
          </span>
          <span>
            <small>4 weeks before</small>
            <b>{a.prev28}</b>
          </span>
          <span>
            <small>Last referral</small>
            <b>{when(a.lastAt)}</b>
          </span>
          <span>
            <small>Last check-up</small>
            <b>{a.lastCheck ? ago(a.lastCheck.at) : "None yet"}</b>
          </span>
        </div>

        <div className="cu-grid">
          {/* Log the check-up */}
          <section className="cu-card">
            <h3>Log this check-up</h3>
            <p className="cu-label">How</p>
            <div className="cu-seg" role="radiogroup" aria-label="How">
              {(["Visit", "Call", "Message"] as const).map((k) => (
                <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? "is-on" : ""} onClick={() => setKind(k)}>
                  {k === "Visit" ? <MapPinned size={15} /> : k === "Call" ? <PhoneCall size={15} /> : <Users size={15} />} {k}
                </button>
              ))}
            </div>
            <p className="cu-label">How it went</p>
            <div className="cu-chips" role="radiogroup" aria-label="How it went">
              {OUTCOMES.map((o) => (
                <button key={o} type="button" role="radio" aria-checked={outcome === o} className={outcome === o ? "is-on" : ""} onClick={() => setOutcome(o)}>
                  {o}
                </button>
              ))}
            </div>
            <label className="field cu-field">
              Note (optional)
              <textarea value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="What they said, what they need from the branch …" />
            </label>
            <p className="cu-label">Next check-up</p>
            <div className="cu-next">
              {(
                [
                  [7, "In a week"],
                  [14, "In 2 weeks"],
                  [30, "In a month"],
                ] as const
              ).map(([n, l]) => (
                <button key={n} type="button" className={next === inDays(n) ? "is-on" : ""} onClick={() => setNext(inDays(n))}>
                  {l}
                </button>
              ))}
              <input type="date" className="input" value={next} min={isoDate(new Date())} onChange={(e) => setNext(e.target.value)} aria-label="Next check-up date" />
            </div>
          </section>

          {/* Earlier check-ups */}
          <section className="cu-card">
            <h3>Earlier check-ups</h3>
            {history.length ? (
              <ol className="ir-steps">
                {history.map((c) => (
                  <li key={c.id}>
                    <b>
                      {c.kind} · {c.outcome}
                    </b>
                    <small>
                      {c.by.name}, {c.by.role} · {new Date(c.at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      {c.next ? ` · next ${new Date(`${c.next}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
                    </small>
                    {c.note && <p>{c.note}</p>}
                  </li>
                ))}
              </ol>
            ) : (
              <div className="cu-empty">
                <ClipboardCheck size={26} />
                <b>No check-up yet</b>
                <small>The first one you log shows here, with who did it.</small>
              </div>
            )}
          </section>
        </div>
      </div>
    </Modal>
  );
}

/* ─────────────── month picker (in the app, with years) ─────────────── */

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A month picker that opens inside the app: choose the year, then the month (only months that have ended). */
function MonthPicker({ value, onChange }: { value: string; onChange: (m: string) => void }) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const now = new Date();
  const thisYear = now.getFullYear();
  const [year, setYear] = useState(Number(value.slice(0, 4)));
  const years = [thisYear - 2, thisYear - 1, thisYear];
  return (
    <>
      <button ref={anchor} type="button" className="mp-btn" aria-haspopup="dialog" aria-expanded={open} onClick={() => (setYear(Number(value.slice(0, 4))), setOpen((o) => !o))}>
        <CalendarCheck size={16} /> {monthLabel(value)} <ChevronDown size={16} />
      </button>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} placement="bottom-end" width={300} label="Choose a month">
        <div className="mp">
          <div className="mp-years" role="tablist" aria-label="Year">
            {years.map((y) => (
              <button key={y} type="button" role="tab" aria-selected={year === y} className={year === y ? "is-on" : ""} onClick={() => setYear(y)}>
                {y}
              </button>
            ))}
          </div>
          <div className="mp-grid">
            {MONTHS_SHORT.map((m, i) => {
              const key = `${year}-${String(i + 1).padStart(2, "0")}`;
              // Only months that have ended can be settled.
              const future = year > thisYear || (year === thisYear && i >= now.getMonth());
              return (
                <button
                  key={m}
                  type="button"
                  disabled={future}
                  className={key === value ? "is-on" : ""}
                  onClick={() => {
                    onChange(key);
                    setOpen(false);
                  }}
                >
                  {m}
                </button>
              );
            })}
          </div>
        </div>
      </Popover>
    </>
  );
}

/* ─────────────── monthly payouts ─────────────── */

/** Mark each agent's month paid (Branch Manager: own branch; Company Admin: any branch). */
export function PayoutMonthsSection({ branchId }: { branchId: string }) {
  const { user, route, agents, showToast, navigate } = useApp();
  const marks = usePaidMarks();
  const reports = useIssueReports();
  const br = branchRoute(route);
  const allowed = can(user.role, "referral.commission") && canMarkPaid(user, br?.branchId ?? null, branchId);
  const [month, setMonth] = useState(lastMonths(2)[1]!);
  const [picked, setPicked] = useState<number[]>([]);
  const [ref, setRef] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [undo, setUndo] = useState<{ id: number; name: string } | null>(null);
  const [why, setWhy] = useState("");
  const range = useMemo(() => resolveRange({ key: "custom", from: `${month}-01`, to: isoDate(new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0)) }), [month]);
  const rows = useMemo(() => (allowed ? agentRanking([branchId], range).filter((a) => a.referrals > 0) : []), [allowed, branchId, range]);
  const byId = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);
  if (!allowed) return null;
  const c = getBranch(branchId)?.currency ?? "NGN";
  const unpaid = rows.filter((a) => !paidMark(marks, branchId, month, a.id));
  const issues = reports.filter((r) => r.aboutKind === "payout" && r.month === month && r.branchId === branchId && r.status !== "resolved");
  const total = rows.reduce((s, a) => s + (a.commission[c] ?? 0), 0);
  const t = q.trim().toLowerCase();
  const shown = rows.filter((a) => !t || `${a.name} ${a.hospitalKey}`.toLowerCase().includes(t));
  const pages = Math.max(1, Math.ceil(shown.length / PER_PAGE));
  const safe = Math.min(page, pages);
  const visible = shown.slice((safe - 1) * PER_PAGE, safe * PER_PAGE);
  const toggle = (id: number) => setPicked((x) => (x.includes(id) ? x.filter((i) => i !== id) : [...x, id]));
  const mark = (ids: number[]) => {
    if (!ids.length) return;
    markPaid(branchId, month, ids, { name: user.name, role: user.role }, ref);
    logAudit({ category: "Commission", action: `Month marked paid: ${monthLabel(month)}`, record: `${ids.length} PR agent${ids.length === 1 ? "" : "s"}`, details: [ids.map((i) => byId.get(i)?.name ?? i).join(", "), ref.trim() ? `ref ${ref.trim()}` : ""].filter(Boolean).join(" · "), branchId });
    showToast(`${monthLabel(month)} marked paid for ${ids.length} agent${ids.length === 1 ? "" : "s"}. They see it as Ended ✓.`);
    setPicked([]);
  };
  return (
    <section className="bd-sec am-sec">
      <header className="bd-sec-head">
        <div>
          <span className="bd-eyebrow">Commission</span>
          <h2>Monthly payouts</h2>
          <p>After paying the agents for a month, mark it paid. Agents see the month as Ended ✓ in their app (never the amount). {user.kind === "admin" ? "As Company Admin you can mark any branch." : "You can mark your own branch."}</p>
        </div>
        <MonthPicker value={month} onChange={(m) => (setMonth(m), setPicked([]), setPage(1))} />
      </header>
      {issues.length > 0 && (
        <button type="button" className="am-issue" onClick={() => navigate(br ? `/branch/${branchId}/reports` : "/reports")}>
          <Flag size={16} /> {issues.length} agent{issues.length === 1 ? " has" : "s have"} reported an issue with {monthLabel(month)}: {issues.map((r) => r.from.name).join(", ")}. Open Reports <ArrowRight size={14} />
        </button>
      )}
      <div className="am-paybar">
        <span>
          <b>{formatCount(rows.length - unpaid.length)}</b> of <b>{formatCount(rows.length)}</b> agents marked paid · {formatMoney(total, c)} commission for {monthLabel(month)}
        </span>
        <input className="am-ref" value={ref} maxLength={40} onChange={(e) => setRef(e.target.value)} placeholder="Transfer reference (optional)" />
        <button type="button" className="bl-btn" disabled={!picked.length} onClick={() => mark(picked)}>
          <CalendarCheck size={15} /> Mark selected paid ({picked.length})
        </button>
        <button type="button" className="bl-btn is-primary" disabled={!unpaid.length} onClick={() => mark(unpaid.map((a) => a.id))}>
          <CheckCircle2 size={15} /> Mark all paid
        </button>
      </div>
      <div className="am-tools">
        <SearchInput placeholder="Search agent or hospital" value={q} onChange={(v) => (setQ(v), setPage(1))} />
      </div>
      <div className="card bp-card rf-table-card">
        <div className="table-wrap thin-scroll">
          <table className="bp-table rf-table am-pay" aria-label="Monthly payouts">
            <thead>
              <tr>
                <th aria-label="Select" />
                <th>PR agent</th>
                <th className="num">Referrals</th>
                <th className="num">Commission</th>
                <th>Bank</th>
                <th>Status</th>
                <th aria-label="Undo" />
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState title={rows.length ? "No agent matches" : "No referrals that month"}>{rows.length ? "Try another search." : `Nothing to pay for ${monthLabel(month)}.`}</EmptyState>
                  </td>
                </tr>
              ) : (
                visible.map((a) => {
                  const p = paidMark(marks, branchId, month, a.id);
                  const bank = byId.get(a.id)?.bank;
                  const issue = issues.find((r) => r.from.agentId === a.id);
                  const on = picked.includes(a.id);
                  return (
                    // Owner, 2026-11-26: clicking anywhere on the row ticks it.
                    <tr key={a.id} className={`pr-row ${on ? "is-picked" : ""} ${p ? "is-paid" : ""}`} onClick={() => !p && toggle(a.id)} tabIndex={p ? -1 : 0} onKeyDown={(k) => !p && (k.key === " " || k.key === "Enter") && (k.preventDefault(), toggle(a.id))}>
                      <td>{p ? <CheckCircle2 size={18} className="am-paid-tick" /> : <input type="checkbox" aria-label={`Select ${a.name}`} checked={on} onClick={(e) => e.stopPropagation()} onChange={() => toggle(a.id)} />}</td>
                      <td>
                        <strong>{a.name}</strong>
                        <small className="ep-sub">{a.hospitalKey || "No hospital"}</small>
                      </td>
                      <td className="num">{a.referrals}</td>
                      <td className="num">
                        <strong>{formatMoney(a.commission[c] ?? 0, c)}</strong>
                      </td>
                      <td>
                        {bank ? (
                          <span className="am-bank">
                            {bank.bankName}
                            <small className="ep-sub mono">{bank.accountNumber}</small>
                          </span>
                        ) : (
                          <span className="lg-muted">No bank details</span>
                        )}
                      </td>
                      <td>
                        {issue ? <Badge tone="danger">Issue reported</Badge> : p ? <Badge tone="ok" dot>Paid</Badge> : <Badge tone="warn">Not marked</Badge>}
                        {p && (
                          <small className="ep-sub">
                            {p.by.name} · {new Date(p.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                            {p.reference ? ` · ${p.reference}` : ""}
                          </small>
                        )}
                      </td>
                      <td className="rf-td-go">
                        {p && (
                          <button
                            type="button"
                            className="am-undo"
                            onClick={(e) => {
                              e.stopPropagation();
                              setWhy("");
                              setUndo({ id: a.id, name: a.name });
                            }}
                          >
                            <RotateCcw size={14} /> Undo
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={safe} pageSize={PER_PAGE} sizes={[PER_PAGE]} total={shown.length} noun="agents" onPage={(n) => setPage(Math.min(Math.max(1, n), pages))} onPageSize={() => setPage(1)} />
      </div>
      {undo && (
        <Modal
          open
          onClose={() => setUndo(null)}
          icon={RotateCcw}
          title={`Undo "paid" for ${undo.name}?`}
          description={`${monthLabel(month)} goes back to Not marked, and the agent's month shows Ended without the tick.`}
          footer={
            <>
              <button type="button" className="bl-btn" onClick={() => setUndo(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="bl-btn is-danger"
                disabled={why.trim().length < 3}
                onClick={() => {
                  unmarkPaid(branchId, month, undo.id);
                  logAudit({ category: "Commission", action: `Paid mark removed: ${monthLabel(month)}`, record: undo.name, details: why.trim(), branchId });
                  showToast("Paid mark removed");
                  setUndo(null);
                }}
              >
                <RotateCcw size={15} /> Undo paid
              </button>
            </>
          }
        >
          <label className="field">
            Why (needed)
            <textarea value={why} maxLength={300} onChange={(e) => setWhy(e.target.value)} placeholder="For example: marked by mistake, the transfer failed" />
          </label>
        </Modal>
      )}
    </section>
  );
}
