/**
 * Marketers (owner, 2026-11-26), for the Branch Manager and the Company Admin
 * in PR Management: each marketer's month against their target, who owns
 * which hospital (with a fair split to confirm when someone leaves or joins),
 * new partner hospitals waiting for a decision, and each marketer's work.
 * The marketers themselves use the mobile app (services/marketing).
 */
import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Building2, Check, ClipboardCheck, Hospital, Scale, Target, UserPlus, Users, X } from "lucide-react";
import { useApp } from "@/app/AppState";
import { LEGACY_BRANCH_ID } from "@/data/legacy";
import { getBranch } from "@/data/company";
import { logAudit } from "@/services/audit";
import { useCheckUps } from "@/services/agentMonitor";
import { staffKey, useAccountAccess } from "@/services/accountAccess";
import { can } from "@/services/permissions";
import { ENTRY_TEXT, applyMoves, decidePartner, hospitalFigures, hospitalsOf, marketersOf, monthKey, monthName, monthRange, paceWord, progressFor, setHospitalOwner, setTarget, shiftMonth, suggestSplit, useMarketing, type HospitalInfo, type Move, type Progress } from "@/services/marketing";
import type { StaffRecord } from "@/data/userRecords";
import { formatCount, formatMoney } from "@/shared/format";
import { Badge, Button, EmptyState, SelectMenu } from "@/shared/ui/controls";
import { Modal } from "@/shared/ui/Modal";

const initials = (n: string) =>
  n
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
const agentsText = (n: number) => `${formatCount(n)} agent${n === 1 ? "" : "s"}`;
const when = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) + " · " + new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

/** Everything the section and its dialogs need, worked out once. */
function useMarketersData(branchId: string, ym: string) {
  const { staff, agents } = useApp();
  const st = useMarketing();
  const access = useAccountAccess();
  const checkUps = useCheckUps();
  const marketers = useMemo(() => marketersOf(staff, branchId, (id) => !!access[staffKey(id)]?.off), [staff, branchId, access]);
  const ids = useMemo(() => new Set(marketers.map((m) => m.id)), [marketers]);
  const hospitals = useMemo(() => hospitalsOf(st, branchId, branchId === LEGACY_BRANCH_ID ? agents : [], ids), [st, branchId, agents, ids]);
  const progress = useMemo(() => marketers.map((m) => progressFor(st, branchId, m.id, hospitals, agents, checkUps, ym)), [marketers, st, branchId, hospitals, agents, checkUps, ym]);
  return { st, marketers, hospitals, progress, agents };
}

export function MarketersSection({ branchId }: { branchId: string }) {
  const { user, showToast } = useApp();
  const [ym, setYm] = useState(monthKey());
  const { st, marketers, hospitals, progress, agents } = useMarketersData(branchId, ym);
  const [viewing, setViewing] = useState<string | null>(null);
  const [splitting, setSplitting] = useState<null | "fill" | "even">(null);
  const [moving, setMoving] = useState<HospitalInfo | null>(null);
  const [hq, setHq] = useState<"all" | "none">("all");
  const canManage = can(user.role, "referral.manage");
  const unowned = hospitals.filter((h) => !h.owner);
  const waiting = st.partners.filter((p) => p.branchId === branchId && p.status === "proposed");
  const figs = useMemo(() => hospitalFigures(branchId, monthRange(ym), agents), [branchId, ym, agents]);
  const nameOf = (id: string | null) => marketers.find((m) => m.id === id)?.name ?? "No marketer";
  if (branchId !== LEGACY_BRANCH_ID && !marketers.length) return null;
  const totals = progress.reduce((s, p) => ({ patients: s.patients + p.patients, target: s.target + p.target }), { patients: 0, target: 0 });
  const shown = hq === "none" ? unowned : hospitals;
  const months = [0, -1, -2, -3, -4, -5].map((n) => shiftMonth(monthKey(), n));

  return (
    <section className="bd-sec am-sec mk-sec">
      <header className="bd-sec-head">
        <div>
          <span className="bd-eyebrow">Marketing</span>
          <h2>Marketers and their hospitals</h2>
          <p className="mk-sub">Each hospital belongs to one marketer, and every PR agent there is theirs. Targets come from their own hospitals. Marketers work on the mobile app.</p>
        </div>
        <SelectMenu value={ym} ariaLabel="Month" className="select-btn" options={months.map((m) => ({ value: m, label: monthName(m, true) }))} onChange={setYm} />
      </header>

      {!marketers.length ? (
        <div className="card mk-empty">
          <Users size={22} />
          <span>
            <b>No marketers yet</b>
            <small>Add staff with the Marketer role in Staff Management. They sign in on the mobile app, and you give each one their hospitals here.</small>
          </span>
        </div>
      ) : (
        <>
          <div className="mk-kpis">
            <div>
              <small>Patients from partner hospitals</small>
              <b className="num">{formatCount(totals.patients)}</b>
              <span>of {formatCount(totals.target)} targeted · {monthName(ym, true)}</span>
            </div>
            <div>
              <small>Marketers</small>
              <b className="num">{marketers.length}</b>
              <span>{formatCount(progress.filter((p) => paceWord(p).tone === "ok" || p.pct >= 1).length)} on track or done</span>
            </div>
            <div className={unowned.length ? "is-warn" : ""}>
              <small>Hospitals without a marketer</small>
              <b className="num">{formatCount(unowned.length)}</b>
              <span>of {formatCount(hospitals.length)} partner hospitals</span>
            </div>
            <div className={waiting.length ? "is-warn" : ""}>
              <small>New hospitals to decide</small>
              <b className="num">{formatCount(waiting.length)}</b>
              <span>Registered by marketers</span>
            </div>
          </div>

          <div className="card bp-card rf-table-card">
            <div className="table-wrap thin-scroll">
              <table className="bp-table rf-table mk-table" aria-label="Marketers this month">
                <thead>
                  <tr>
                    <th>Marketer</th>
                    <th className="num">Hospitals</th>
                    <th className="num">PR agents</th>
                    <th>Patients against target</th>
                    <th className="num" title="The same days of last month">Last month</th>
                    <th className="num">Follow-ups</th>
                    <th>Pace</th>
                    <th aria-label="Open" />
                  </tr>
                </thead>
                <tbody>
                  {[...progress]
                    .sort((a, b) => b.pct - a.pct)
                    .map((p, i) => {
                      const m = marketers.find((x) => x.id === p.marketerId)!;
                      const pw = paceWord(p);
                      const diff = p.patients - p.lastMonthSoFar;
                      return (
                        <tr key={p.marketerId} className="pr-row" tabIndex={0} onClick={() => setViewing(p.marketerId)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setViewing(p.marketerId))}>
                          <td>
                            <span className="mk-who">
                              <span className="mk-rank">{i + 1}</span>
                              <span className="mk-av">{initials(m.name)}</span>
                              <span>
                                <strong>{m.name}</strong>
                                <small className="ep-sub">{m.status === "On leave" ? "On leave" : p.hospitals.slice(0, 3).join(", ") || "No hospital yet"}</small>
                              </span>
                            </span>
                          </td>
                          <td className="num">{formatCount(p.hospitals.length)}</td>
                          <td className="num">{formatCount(p.agents)}</td>
                          <td>
                            <TargetBar p={p} />
                          </td>
                          <td className="num">
                            {formatCount(p.lastMonthSoFar)}
                            <small className={`ep-sub ${diff < 0 ? "am-down" : diff > 0 ? "am-up" : ""}`}>
                              {diff > 0 ? <ArrowUpRight size={12} /> : diff < 0 ? <ArrowDownRight size={12} /> : null}
                              {diff === 0 ? "Same" : `${diff > 0 ? "+" : ""}${formatCount(diff)}`}
                            </small>
                          </td>
                          <td className="num">
                            {formatCount(p.followUps)}
                            <small className="ep-sub">
                              {formatCount(p.recruits)} recruit{p.recruits === 1 ? "" : "s"}
                            </small>
                          </td>
                          <td>
                            <Badge tone={pw.tone} dot>
                              {pw.text}
                            </Badge>
                          </td>
                          <td className="rf-td-go">
                            <span className="rf-row-go" aria-hidden="true">
                              <ArrowRight size={15} />
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {waiting.length > 0 && (
        <div className="mk-block">
          <h3>
            <Building2 size={16} /> New hospitals waiting for you
          </h3>
          <ul className="mk-partners">
            {waiting.map((p) => (
              <li key={p.id}>
                <span className="mk-av is-hosp">
                  <Hospital size={16} />
                </span>
                <span className="mk-partner-text">
                  <b>
                    {p.name} <code>{p.code}</code>
                  </b>
                  <small>
                    {p.kind}
                    {p.area ? ` · ${p.area}` : ""} · contact {p.contactName || "not given"}
                    {p.contactPhone ? `, ${p.contactPhone}` : ""} · registered by {p.by}, {when(p.at)}
                  </small>
                  {p.note && <small className="mk-note">{p.note}</small>}
                </span>
                {canManage && (
                  <span className="mk-actions">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        decidePartner(p.id, "declined", user.name, "");
                        logAudit({ category: "PR agents", action: "New hospital not taken on", record: `${p.name} (${p.code})`, details: `Registered by ${p.by}`, branchId });
                        showToast(`${p.name} not taken on`);
                      }}
                    >
                      <X size={14} /> Decline
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        decidePartner(p.id, "partnered", user.name, "");
                        logAudit({ category: "PR agents", action: "New partner hospital", record: `${p.name} (${p.code})`, details: `Registered by ${p.by}; now theirs`, branchId });
                        showToast(`${p.name} is a partner, looked after by ${p.by}`);
                      }}
                    >
                      <Check size={14} /> Take on
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {marketers.length > 0 && (
        <div className="mk-block">
          <h3>
            <Hospital size={16} /> Who looks after each hospital
            <span className="mk-h-tools">
              <span className="mk-toggle" role="group" aria-label="Show">
                <button type="button" className={hq === "all" ? "is-on" : ""} onClick={() => setHq("all")}>
                  All {formatCount(hospitals.length)}
                </button>
                <button type="button" className={hq === "none" ? "is-on" : ""} onClick={() => setHq("none")}>
                  No marketer {formatCount(unowned.length)}
                </button>
              </span>
              {canManage && (
                <>
                  {unowned.length > 0 && (
                    <Button size="sm" onClick={() => setSplitting("fill")}>
                      <UserPlus size={14} /> Share out {formatCount(unowned.length)} hospitals
                    </Button>
                  )}
                  <Button variant="secondary" size="sm" onClick={() => setSplitting("even")}>
                    <Scale size={14} /> Even out the split
                  </Button>
                </>
              )}
            </span>
          </h3>
          <div className="card bp-card rf-table-card">
            <div className="table-wrap thin-scroll mk-hosp-wrap">
              <table className="bp-table rf-table" aria-label="Hospitals and their marketer">
                <thead>
                  <tr>
                    <th>Hospital</th>
                    <th className="num">PR agents</th>
                    <th className="num">Patients · {monthName(ym)}</th>
                    <th className="num">Amount generated</th>
                    <th>Marketer</th>
                    <th aria-label="Change" />
                  </tr>
                </thead>
                <tbody>
                  {shown.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <EmptyState title="Every hospital has a marketer" />
                      </td>
                    </tr>
                  ) : (
                    shown.map((h) => {
                      const f = figs.get(h.key);
                      return (
                        <tr key={h.key} className={canManage ? "pr-row" : ""} onClick={canManage ? () => setMoving(h) : undefined}>
                          <td>
                            <span className="inv-cat-chip">{h.key}</span>
                          </td>
                          <td className="num">{formatCount(h.agentIds.length)}</td>
                          <td className="num">{formatCount(f?.patients ?? 0)}</td>
                          <td className="num">{formatMoney(f?.revenue ?? 0, getBranch(branchId)?.currency ?? "NGN", true)}</td>
                          <td>{h.owner ? <span className="mk-owner">{nameOf(h.owner.marketerId)}</span> : <Badge tone="warn">No marketer</Badge>}</td>
                          <td className="rf-td-go">{canManage && <span className="mk-change">Change</span>}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {viewing && <MarketerDialog branchId={branchId} marketerId={viewing} ym={ym} onClose={() => setViewing(null)} />}
      {splitting && <SplitDialog branchId={branchId} mode={splitting} hospitals={hospitals} marketers={marketers} onClose={() => setSplitting(null)} />}
      {moving && <OwnerDialog branchId={branchId} h={moving} marketers={marketers} onClose={() => setMoving(null)} />}
    </section>
  );
}

function TargetBar({ p }: { p: Progress }) {
  const pct = Math.min(1, p.pct);
  return (
    <span className="mk-bar" title={`${Math.round(p.pct * 100)}% of the target · even pace by today: ${Math.round(p.pace * 100)}%`}>
      <span className="mk-bar-text">
        <b className="num">{formatCount(p.patients)}</b> / {formatCount(p.target)}
        <em>{Math.round(p.pct * 100)}%</em>
      </span>
      <span className="mk-bar-track">
        <i style={{ width: `${pct * 100}%` }} className={p.pct >= 1 ? "is-done" : p.pct >= p.pace ? "is-ok" : p.pct >= p.pace * 0.8 ? "is-warn" : "is-bad"} />
        {p.pace < 1 && <span className="mk-bar-pace" style={{ left: `${p.pace * 100}%` }} />}
      </span>
    </span>
  );
}

/* ─────────────── one marketer ─────────────── */

function MarketerDialog({ branchId, marketerId, ym, onClose }: { branchId: string; marketerId: string; ym: string; onClose: () => void }) {
  const { user, staff, agents, showToast } = useApp();
  const { st, hospitals, progress } = useMarketersData(branchId, ym);
  const checkUps = useCheckUps();
  const m = staff.find((s) => s.id === marketerId);
  const p = progress.find((x) => x.marketerId === marketerId);
  const [target, setTargetText] = useState(String(p?.target ?? ""));
  const history = useMemo(() => [0, -1, -2, -3, -4, -5].map((n) => progressFor(st, branchId, marketerId, hospitals, agents, checkUps, shiftMonth(ym, n))).reverse(), [st, branchId, marketerId, hospitals, agents, checkUps, ym]);
  const figs = useMemo(() => hospitalFigures(branchId, monthRange(ym), agents), [branchId, ym, agents]);
  if (!m || !p) return null;
  const canManage = can(user.role, "referral.manage");
  const myAgents = new Set(hospitals.filter((h) => h.owner?.marketerId === marketerId).flatMap((h) => h.agentIds));
  const work = [
    ...st.entries.filter((e) => e.branchId === branchId && e.marketerId === marketerId).map((e) => ({ at: e.at, title: e.hospital ? `${ENTRY_TEXT[e.kind]} · ${e.hospital}` : ENTRY_TEXT[e.kind], text: e.text, by: e.by })),
    ...checkUps.filter((c) => c.branchId === branchId && myAgents.has(c.agentId) && c.by.name === m.name).map((c) => ({ at: c.at, title: `${c.kind} with ${agents.find((a) => a.id === c.agentId)?.name ?? `agent #${c.agentId}`}`, text: `${c.outcome}${c.note ? ` · ${c.note}` : ""}`, by: c.by.name })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 30);
  const max = Math.max(...history.map((h) => Math.max(h.patients, h.target)), 1);
  const pw = paceWord(p);
  const cur = getBranch(branchId)?.currency ?? "NGN";
  return (
    <Modal
      open
      xl
      onClose={onClose}
      icon={Target}
      title={m.name}
      description={`Marketer · ${monthName(ym, true)} · ${formatCount(p.hospitals.length)} hospital${p.hospitals.length === 1 ? "" : "s"}, ${formatCount(p.agents)} PR agents`}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="mk-detail">
        <div className="mk-kpis is-4">
          <div>
            <small>Patients against target</small>
            <b className="num">
              {formatCount(p.patients)} <span>/ {formatCount(p.target)}</span>
            </b>
            <Badge tone={pw.tone} dot>
              {pw.text}
            </Badge>
          </div>
          <div>
            <small>Amount their hospitals generated</small>
            <b className="num">{formatMoney(p.revenue, cur, true)}</b>
            <span>{formatCount(p.referring)} PR agents sent patients</span>
          </div>
          <div>
            <small>Usual month (last 3)</small>
            <b className="num">{formatCount(p.baseline)}</b>
            <span>{p.patients >= p.lastMonthSoFar ? "Up" : "Down"} on last month, same days ({formatCount(p.lastMonthSoFar)})</span>
          </div>
          <div>
            <small>Their work this month</small>
            <b className="num">{formatCount(p.followUps)}</b>
            <span>
              follow-ups · {formatCount(p.recruits)} recruits · {formatCount(p.newHospitals)} new hospitals
            </span>
          </div>
        </div>

        <div className="mk-two">
          <section>
            <h4>Six months</h4>
            <div className="mk-chart" role="img" aria-label="Patients and target by month">
              {history.map((h) => (
                <div key={h.month} className="mk-col">
                  <span className="mk-col-bars">
                    <i className="is-target" style={{ height: `${(h.target / max) * 100}%` }} title={`Target ${h.target}`} />
                    <i className={h.patients >= h.target ? "is-hit" : "is-got"} style={{ height: `${(h.patients / max) * 100}%` }} title={`${h.patients} patients`} />
                  </span>
                  <small>{monthName(h.month).split(" ")[0]}</small>
                  <em className={h.patients >= h.target ? "is-hit" : ""}>{Math.round(h.pct * 100)}%</em>
                </div>
              ))}
            </div>
            <p className="mk-legend">
              <i className="is-got" /> Patients <i className="is-target" /> Target. Their improvement, or lack of it, shows here and on their phone.
            </p>
            {canManage && (
              <div className="mk-target">
                <label className="field">
                  Target for {monthName(ym, true)} (patients)
                  <input inputMode="numeric" value={target} onChange={(e) => setTargetText(e.target.value.replace(/\D/g, ""))} />
                </label>
                <Button
                  variant="secondary"
                  disabled={!Number(target) || Number(target) === p.target}
                  onClick={() => {
                    setTarget(branchId, marketerId, ym, Number(target), user.name);
                    logAudit({ category: "PR agents", action: "Marketer target set", record: `${m.name} · ${monthName(ym, true)}`, details: `${target} patients (usual month ${p.baseline})`, branchId });
                    showToast(`Target set: ${target} patients`);
                  }}
                >
                  <Target size={15} /> Set target
                </Button>
                <small>{p.targetSetBy ? `Set by ${p.targetSetBy}.` : `Suggested from their usual month plus 10%.`}</small>
              </div>
            )}
          </section>
          <section>
            <h4>Their hospitals · {monthName(ym)}</h4>
            {p.hospitals.length ? (
              <ul className="mk-hosps">
                {p.hospitals.map((k) => {
                  const f = figs.get(k);
                  return (
                    <li key={k}>
                      <span className="inv-cat-chip">{k}</span>
                      <span>{agentsText(hospitals.find((h) => h.key === k)?.agentIds.length ?? 0)}</span>
                      <b className="num">{formatCount(f?.patients ?? 0)} patients</b>
                      <b className="num">{formatMoney(f?.revenue ?? 0, cur, true)}</b>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="fd-note">No hospitals yet. Give them hospitals in "Who looks after each hospital".</p>
            )}
            <h4>
              <ClipboardCheck size={14} /> Their latest work
            </h4>
            {work.length ? (
              <ol className="ir-steps mk-work">
                {work.map((w, i) => (
                  <li key={i}>
                    <b>{w.title}</b>
                    {w.text && <span>{w.text}</span>}
                    <small>
                      {when(w.at)} · {w.by}
                    </small>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="fd-note">Nothing logged yet. Follow-ups, visits, recruits and new hospitals they log on their phone show here.</p>
            )}
          </section>
        </div>
      </div>
    </Modal>
  );
}

/* ─────────────── who owns a hospital ─────────────── */

function OwnerDialog({ branchId, h, marketers, onClose }: { branchId: string; h: HospitalInfo; marketers: StaffRecord[]; onClose: () => void }) {
  const { user, showToast } = useApp();
  const [to, setTo] = useState(h.owner?.marketerId ?? "");
  const [why, setWhy] = useState("");
  const from = marketers.find((m) => m.id === h.owner?.marketerId);
  return (
    <Modal
      open
      onClose={onClose}
      icon={Hospital}
      title={`Who looks after ${h.key}?`}
      description={`${formatCount(h.agentIds.length)} PR agents there go with the hospital to the marketer you choose.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={(to || null) === (h.owner?.marketerId ?? null) || why.trim().length < 3}
            onClick={() => {
              setHospitalOwner(branchId, h.key, to || null, user.name, why);
              const name = marketers.find((m) => m.id === to)?.name;
              logAudit({ category: "PR agents", action: "Hospital marketer changed", record: h.key, details: `${from?.name ?? "No marketer"} → ${name ?? "No marketer"} · ${why.trim()}`, branchId });
              showToast(name ? `${h.key} is now ${name}'s` : `${h.key} has no marketer`);
              onClose();
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="mk-pick" role="radiogroup" aria-label="Marketer">
        {marketers.map((m) => (
          <button key={m.id} type="button" role="radio" aria-checked={to === m.id} className={to === m.id ? "is-on" : ""} onClick={() => setTo(m.id)}>
            <span className="mk-av">{initials(m.name)}</span>
            {m.name}
            {m.id === h.owner?.marketerId && <small>Now</small>}
          </button>
        ))}
        <button type="button" role="radio" aria-checked={to === ""} className={to === "" ? "is-on" : ""} onClick={() => setTo("")}>
          <span className="mk-av is-none">–</span>
          No marketer
        </button>
      </div>
      <label className="field">
        Why (needed)
        <input value={why} maxLength={200} onChange={(e) => setWhy(e.target.value)} placeholder="For example: closer to where she lives, new marketer, Kelechi left" />
      </label>
    </Modal>
  );
}

function SplitDialog({ branchId, mode, hospitals, marketers, onClose }: { branchId: string; mode: "fill" | "even"; hospitals: HospitalInfo[]; marketers: StaffRecord[]; onClose: () => void }) {
  const { user, showToast } = useApp();
  const active = marketers.filter((m) => m.status === "Active");
  const moves: Move[] = useMemo(() => suggestSplit(hospitals, active.map((m) => m.id), mode === "even"), [hospitals, active, mode]);
  const nameOf = (id: string | null) => (id ? (marketers.find((m) => m.id === id)?.name ?? "A former marketer") : "No marketer");
  const load = new Map(active.map((m) => [m.id, 0]));
  for (const h of hospitals) {
    const owner = moves.find((x) => x.hospital === h.key)?.to ?? h.owner?.marketerId;
    if (owner && load.has(owner)) load.set(owner, load.get(owner)! + h.agentIds.length);
  }
  return (
    <Modal
      open
      wide
      onClose={onClose}
      icon={Scale}
      title={mode === "fill" ? "Share out the hospitals without a marketer" : "Even out the split"}
      description={mode === "fill" ? "Each goes to the marketer with the fewest PR agents so far. Check it, then confirm." : "Whole hospitals move from the busiest marketers to the lightest until the PR agents are shared fairly. Check it, then confirm."}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!moves.length}
            onClick={() => {
              applyMoves(branchId, moves, user.name, mode === "fill" ? "Fair split: hospitals without a marketer" : "Fair split: evened out");
              logAudit({ category: "PR agents", action: "Hospitals shared out to marketers", record: `${moves.length} hospitals`, details: moves.map((m) => `${m.hospital} → ${nameOf(m.to)}`).join(", "), branchId });
              showToast(`${moves.length} hospital${moves.length === 1 ? "" : "s"} given to marketers`);
              onClose();
            }}
          >
            <Check size={15} /> Confirm {moves.length} change{moves.length === 1 ? "" : "s"}
          </Button>
        </>
      }
    >
      {moves.length ? (
        <>
          <ul className="mk-moves">
            {moves.map((m) => (
              <li key={m.hospital}>
                <span className="inv-cat-chip">{m.hospital}</span>
                <small>{agentsText(m.agents)}</small>
                <span className="mk-move">
                  {nameOf(m.from)} <ArrowRight size={13} /> <b>{nameOf(m.to)}</b>
                </span>
              </li>
            ))}
          </ul>
          <p className="mk-loads">
            After this:{" "}
            {active.map((m, i) => (
              <span key={m.id}>
                {i > 0 && " · "}
                {m.name.split(" ")[0]} <b>{formatCount(load.get(m.id) ?? 0)}</b> agents
              </span>
            ))}
          </p>
        </>
      ) : (
        <EmptyState title="Nothing to change">The split is already as fair as whole hospitals allow.</EmptyState>
      )}
    </Modal>
  );
}
