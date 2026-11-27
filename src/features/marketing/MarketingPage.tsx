/**
 * Marketing page (owner, 2026-11-27), for the Branch Manager and the Company
 * Admin. Everything about marketers in one place:
 *   • what still needs setting up (this month's tasks, the bonus, the rules,
 *     hospitals without a marketer), with a count in the menu;
 *   • a card for each marketer (amount against target, sourcing, tasks),
 *     opening their hospitals, with each hospital's state and Move;
 *   • transfers to approve, dormant hospitals (caution, move), hospitals
 *     without a marketer, small hospitals that need growth, new hospitals
 *     registered by marketers;
 *   • the PR agent monitor;
 *   • settings: monthly tasks, bonus, rules of engagement.
 * The marketers themselves work on the mobile app.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Building2, CalendarClock, Check, ChevronRight, FileText, Gift, Hospital, Lock, Megaphone, Scale, Send, ShieldAlert, Sprout, Target, UserPlus, Users, X } from "lucide-react";
import { useApp } from "@/app/AppState";
import { getBranch } from "@/data/company";
import { LEGACY_BRANCH_ID } from "@/data/legacy";
import type { Branch } from "@/data/types";
import { logAudit } from "@/services/audit";
import { can } from "@/services/permissions";
import { DORMANT_TEXT, ENTRY_TEXT, bonusEstimate, bonusFor, decidePartner, monthName, needsAction, paceWord, progressFor, setTarget, shiftMonth, taskDoneAt, tasksFor, type HospitalStatus } from "@/services/marketing";
import { AnimatedPage } from "@/shared/motion";
import { formatCount } from "@/shared/format";
import { Badge, Button, EmptyState } from "@/shared/ui/controls";
import { Modal } from "@/shared/ui/Modal";
import { PageHero } from "@/features/shared/PageHero";
import { AgentMonitorSection } from "@/features/pr/AgentMonitor";
import { SplitDialog, TargetBar } from "@/features/pr/Marketers";
import { useMarketingData, type MarketingData } from "./data";
import { BonusDialog, CautionDialog, MoveDialog, RulesDialog, TasksDialog, TransferRow } from "./dialogs";

const initials = (n: string) =>
  n
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
const when = (iso: string) => `${new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · ${new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
const DORMANT_TONE = { active: "ok", grace: "neutral", flagged: "danger", cautioned: "warn", overdue: "danger", snoozed: "info", revived: "ok" } as const;

type Dialog = { kind: "tasks" | "bonus" | "rules" | "split-fill" | "split-even" } | { kind: "move" | "caution"; hospital: string } | { kind: "marketer"; id: string } | null;

/* ─────────────── pages ─────────────── */

export function BranchMarketingPage({ branch }: { branch: Branch }) {
  return (
    <AnimatedPage>
      <PageHero eyebrow={`Marketers · ${branch.name} branch`} title="Marketing" icon={Megaphone} period={false} />
      <MarketingWorkspace branchId={branch.id} />
    </AnimatedPage>
  );
}

export function CompanyMarketingPage() {
  const { context } = useApp();
  const scope = context === "all" ? null : [context];
  const branchId = scope?.[0] ?? LEGACY_BRANCH_ID;
  const branch = getBranch(branchId);
  return (
    <AnimatedPage>
      <PageHero eyebrow={`Marketers · ${branch ? `${branch.name} branch` : "All branches"}`} title="Marketing" icon={Megaphone} period={false} />
      {!scope && <p className="mkx-scope">Showing {branch?.name} branch, where the PR agents are. Pick a branch at the top to see another.</p>}
      <MarketingWorkspace branchId={branchId} />
    </AnimatedPage>
  );
}

/* ─────────────── the workspace ─────────────── */

export function MarketingWorkspace({ branchId }: { branchId: string }) {
  const { user } = useApp();
  const d = useMarketingData(branchId);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [allDormant, setAllDormant] = useState(false);
  const canManage = can(user.role, "referral.manage");
  const totals = d.progress.reduce((s, p) => ({ revenue: s.revenue + p.revenue, target: s.target + p.target, sourced: s.sourced + p.sourcedHospitals }), { revenue: 0, target: 0, sourced: 0 });
  const sourceTarget = d.marketers.reduce((s, m) => s + tasksFor(d.st, branchId, m.id).newHospitals, 0);
  const statuses = [...d.statuses.values()];
  const flagged = statuses.filter((s) => s.owner && ["flagged", "overdue", "cautioned", "snoozed", "revived"].includes(s.dormant)).sort((a, b) => Number(needsAction(b)) - Number(needsAction(a)) || (b.daysSince ?? 999) - (a.daysSince ?? 999));
  const growth = statuses.filter((s) => s.owner && s.growth).sort((a, b) => (d.figs.get(b.key)?.revenue ?? 0) - (d.figs.get(a.key)?.revenue ?? 0));
  const waiting = d.st.partners.filter((p) => p.branchId === branchId && p.status === "proposed");
  const recruits = d.st.entries.filter((e) => e.branchId === branchId && e.kind === "recruit" && e.at.slice(0, 7) === d.ym);
  const missing = d.setup.filter((x) => !x.done);
  const open = (k: "tasks" | "bonus" | "rules" | "owners") => setDialog(k === "owners" ? { kind: "split-fill" } : { kind: k });

  if (!d.marketers.length)
    return (
      <div className="card mk-empty">
        <Users size={22} />
        <span>
          <b>No marketers yet</b>
          <small>Add staff with the Marketer role in Staff Management. They sign in on the mobile app, and you give each one their hospitals here.</small>
        </span>
      </div>
    );

  return (
    <div className="mkx">
      {/* What still needs setting up */}
      {missing.length > 0 && canManage && (
        <section className="mkx-setup">
          <span className="mkx-setup-icon">
            <AlertTriangle size={20} />
          </span>
          <div className="mkx-setup-body">
            <b>Finish setting up marketing for {monthName(d.ym, true)}</b>
            <small>Marketers see their tasks, bonus and rules on their phones once these are set.</small>
            <ul>
              {d.setup.map((x) => (
                <li key={x.key} className={x.done ? "is-done" : ""}>
                  <span className="mkx-check">{x.done ? <Check size={13} /> : null}</span>
                  <span>
                    <b>{x.label}</b>
                    {!x.done && <small>{x.hint}</small>}
                  </span>
                  {!x.done && (
                    <Button size="sm" onClick={() => open(x.key)}>
                      {x.key === "owners" ? "Share out" : "Set up"} <ArrowRight size={13} />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <div className="mk-kpis">
        <div>
          <small>Amount from partner hospitals</small>
          <b className="num">{d.money(totals.revenue)}</b>
          <span>
            of {d.money(totals.target)} targeted · {monthName(d.ym, true)}
          </span>
        </div>
        <div>
          <small>New hospitals this month</small>
          <b className="num">
            {formatCount(totals.sourced)} <span>/ {formatCount(sourceTarget)}</span>
          </b>
          <span>{formatCount(waiting.length)} waiting for you</span>
        </div>
        <div className={flagged.filter(needsAction).length ? "is-warn" : ""}>
          <small>Dormant hospitals</small>
          <b className="num">{formatCount(flagged.filter((s) => s.dormant !== "revived").length)}</b>
          <span>{formatCount(flagged.filter(needsAction).length)} need your action</span>
        </div>
        <div className={d.approvals.length ? "is-warn" : ""}>
          <small>Transfers to approve</small>
          <b className="num">{formatCount(d.approvals.length)}</b>
          <span>{formatCount(d.openTransfers.length)} waiting for a marketer</span>
        </div>
      </div>

      {/* Marketers */}
      <section className="mkx-sec">
        <header className="mkx-head">
          <h2>
            <Users size={18} /> Marketers
          </h2>
          {canManage && (
            <span className="mkx-head-tools">
              <Button variant="secondary" size="sm" onClick={() => setDialog({ kind: "tasks" })}>
                <Target size={14} /> Monthly tasks
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setDialog({ kind: "bonus" })}>
                <Gift size={14} /> Bonus
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setDialog({ kind: "rules" })}>
                <FileText size={14} /> Rules
              </Button>
            </span>
          )}
        </header>
        <div className="mkx-cards">
          {[...d.progress]
            .sort((a, b) => b.pct - a.pct)
            .map((p) => {
              const m = d.marketers.find((x) => x.id === p.marketerId)!;
              const t = tasksFor(d.st, branchId, m.id);
              const pw = paceWord(p);
              const mine = statuses.filter((s) => s.owner === m.id);
              const dormant = mine.filter((s) => s.dormant === "flagged" || s.dormant === "overdue" || s.dormant === "cautioned").length;
              const hand = mine.filter((s) => s.handoverUntil).length;
              return (
                <button key={m.id} type="button" className="mkx-card" onClick={() => setDialog({ kind: "marketer", id: m.id })}>
                  <span className="mkx-card-top">
                    <span className="mkx-av">{initials(m.name)}</span>
                    <span className="mkx-card-name">
                      <b>{m.name}</b>
                      <small>
                        {formatCount(p.hospitals.length)} hospitals · {formatCount(p.agents)} PR agents
                      </small>
                    </span>
                    <Badge tone={pw.tone} dot>
                      {pw.text}
                    </Badge>
                  </span>
                  <TargetBar p={p} money={d.money} />
                  <span className="mkx-card-stats">
                    <span>
                      <b>{formatCount(p.sourcedHospitals)}</b>/{t.newHospitals} new hospitals
                    </span>
                    <span>
                      <b>{formatCount(p.firstPatientAgents)}</b>/{t.newAgents} new agents
                    </span>
                    <span>
                      <b>{formatCount(p.weekFollowUps)}</b>/{t.followUpsPerWeek} follow-ups this week
                    </span>
                  </span>
                  <span className="mkx-card-tags">
                    {dormant > 0 && <Badge tone="danger">{dormant} dormant</Badge>}
                    {hand > 0 && <Badge tone="info">{hand} in handover</Badge>}
                    {m.status === "On leave" && <Badge tone="warn">On leave</Badge>}
                    <span className="mkx-open">
                      Their hospitals <ChevronRight size={15} />
                    </span>
                  </span>
                </button>
              );
            })}
        </div>
      </section>

      {/* Needs attention */}
      {(d.approvals.length > 0 || d.openTransfers.length > 0) && (
        <section className="mkx-sec">
          <header className="mkx-head">
            <h2>
              <Scale size={18} /> Hospital transfers
            </h2>
          </header>
          <ul className="mkx-list">
            {[...d.approvals, ...d.openTransfers].map((t) => (
              <TransferRow key={t.id} d={d} t={t} />
            ))}
          </ul>
        </section>
      )}

      {d.unowned.length > 0 && (
        <section className="mkx-sec">
          <header className="mkx-head">
            <h2>
              <Hospital size={18} /> Hospitals without a marketer
            </h2>
            {canManage && (
              <Button size="sm" onClick={() => setDialog({ kind: "split-fill" })}>
                <UserPlus size={14} /> Share them out
              </Button>
            )}
          </header>
          <p className="mkx-sub">Their PR agents are on your own follow-up list until a marketer has them. A marketer's hospitals come here when their account is deactivated.</p>
          <div className="mkx-chips">
            {d.unowned.map((h) => (
              <button key={h.key} type="button" className="mkx-chip" onClick={() => canManage && setDialog({ kind: "move", hospital: h.key })}>
                <b>{h.key}</b> {formatCount(h.agentIds.length)} agents
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="mkx-sec">
        <header className="mkx-head">
          <h2>
            <ShieldAlert size={18} /> Dormant hospitals
          </h2>
        </header>
        <p className="mkx-sub">No patient for {d.st.policy[branchId]?.dormantDays ?? 30} days. Send a caution; the marketer answers with a reason and a plan. Still dormant after that, you can move it to another marketer to revive it.</p>
        {flagged.length ? (
          <ul className="mkx-list">
            {(allDormant ? flagged : flagged.slice(0, 8)).map((s) => (
              <DormantRow key={s.key} d={d} s={s} onCaution={() => setDialog({ kind: "caution", hospital: s.key })} onMove={() => setDialog({ kind: "move", hospital: s.key })} canManage={canManage} />
            ))}
          </ul>
        ) : null}
        {flagged.length > 8 && (
          <Button variant="secondary" style={{ justifySelf: "start" }} onClick={() => setAllDormant((x) => !x)}>
            {allDormant ? "Show fewer" : `Show all ${flagged.length}`}
          </Button>
        )}
        {!flagged.length && (
          <EmptyState title="No dormant hospitals">Every hospital sent a patient in the last {d.st.policy[branchId]?.dormantDays ?? 30} days.</EmptyState>
        )}
      </section>

      {waiting.length > 0 && (
        <section className="mkx-sec">
          <header className="mkx-head">
            <h2>
              <Building2 size={18} /> New hospitals waiting for you
            </h2>
          </header>
          <ul className="mk-partners">
            {waiting.map((p) => (
              <PartnerRow key={p.id} d={d} id={p.id} />
            ))}
          </ul>
        </section>
      )}

      <section className="mkx-sec">
        <header className="mkx-head">
          <h2>
            <Sprout size={18} /> Small hospitals that need growth
          </h2>
        </header>
        <p className="mkx-sub">{formatCount(growth.length)} hospitals have {d.st.policy[branchId]?.growthMaxAgents ?? 3} PR agents or fewer. Their marketer is prompted to meet more doctors and nurses there and bring in new agents.</p>
        <div className="mkx-chips">
          {growth.slice(0, 30).map((s) => (
            <span key={s.key} className="mkx-chip is-static">
              <b>{s.key}</b> {formatCount(d.hospitals.find((h) => h.key === s.key)?.agentIds.length ?? 0)} agents · {d.nameOf(s.owner).split(" ")[0]}
            </span>
          ))}
        </div>
      </section>

      {recruits.length > 0 && (
        <section className="mkx-sec">
          <header className="mkx-head">
            <h2>
              <UserPlus size={18} /> New PR agents this month
            </h2>
          </header>
          <ul className="mkx-list">
            {recruits.map((e) => (
              <li key={e.id} className="mkx-line">
                <b>{e.text}</b>
                <small>
                  By {e.by} · {when(e.at)}
                </small>
              </li>
            ))}
          </ul>
        </section>
      )}

      <AgentMonitorSection branchId={branchId} />

      {dialog?.kind === "tasks" && <TasksDialog d={d} onClose={() => setDialog(null)} />}
      {dialog?.kind === "bonus" && <BonusDialog d={d} onClose={() => setDialog(null)} />}
      {dialog?.kind === "rules" && <RulesDialog d={d} onClose={() => setDialog(null)} />}
      {dialog?.kind === "move" && <MoveDialog d={d} hospital={dialog.hospital} onClose={() => setDialog(null)} />}
      {dialog?.kind === "caution" && <CautionDialog d={d} hospital={dialog.hospital} onClose={() => setDialog(null)} />}
      {dialog?.kind === "marketer" && <MarketerDetail d={d} id={dialog.id} onMove={(h) => setDialog({ kind: "move", hospital: h })} onClose={() => setDialog(null)} />}
      {(dialog?.kind === "split-fill" || dialog?.kind === "split-even") && <SplitDialog branchId={branchId} mode={dialog.kind === "split-fill" ? "fill" : "even"} hospitals={d.hospitals} marketers={d.marketers} onClose={() => setDialog(null)} />}
    </div>
  );
}

function DormantRow({ d, s, onCaution, onMove, canManage }: { d: MarketingData; s: HospitalStatus; onCaution: () => void; onMove: () => void; canManage: boolean }) {
  return (
    <li className={`mkx-dormant ${needsAction(s) ? "is-hot" : ""}`}>
      <span className={`mk-av is-hosp is-${DORMANT_TONE[s.dormant]}`}>
        <Hospital size={16} />
      </span>
      <span className="mkx-transfer-text">
        <b>
          {s.key} <Badge tone={DORMANT_TONE[s.dormant]}>{DORMANT_TEXT[s.dormant]}</Badge>
          {s.locked && (
            <span className="mkx-lock" title="One of the marketer's top hospitals">
              <Lock size={12} />
            </span>
          )}
        </b>
        <small>
          {d.nameOf(s.owner)} · {s.daysSince === null ? "no patient in 6 months" : `last patient ${s.daysSince} days ago`}
          {s.cautions ? ` · ${s.cautions} caution${s.cautions === 1 ? "" : "s"}` : ""}
          {s.dormant === "snoozed" && s.snoozedUntil ? ` · watching until ${new Date(`${s.snoozedUntil}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
        </small>
        {s.caution?.reply && (
          <small className="mkx-reply">
            “{s.caution.reply.reason}: {s.caution.reply.plan}” · by {new Date(`${s.caution.reply.date}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
          </small>
        )}
      </span>
      {canManage && s.dormant !== "revived" && (
        <span className="mk-actions">
          {(s.dormant === "flagged" || s.dormant === "snoozed") && (
            <Button variant="secondary" size="sm" onClick={onCaution}>
              <Send size={14} /> Caution
            </Button>
          )}
          {needsAction(s) && (
            <Button size="sm" onClick={onMove}>
              <ArrowRight size={14} /> Move
            </Button>
          )}
        </span>
      )}
    </li>
  );
}

function PartnerRow({ d, id }: { d: MarketingData; id: string }) {
  const { user, showToast } = useApp();
  const p = d.st.partners.find((x) => x.id === id)!;
  return (
    <li>
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
      <span className="mk-actions">
        <Button variant="secondary" size="sm" onClick={() => (decidePartner(p.id, "declined", user.name, ""), logAudit({ category: "PR agents", action: "New hospital not taken on", record: `${p.name} (${p.code})`, details: `Registered by ${p.by}`, branchId: d.branchId }), showToast(`${p.name} not taken on`))}>
          <X size={14} /> Decline
        </Button>
        <Button size="sm" onClick={() => (decidePartner(p.id, "partnered", user.name, ""), logAudit({ category: "PR agents", action: "New partner hospital", record: `${p.name} (${p.code})`, details: `Registered by ${p.by}; now theirs`, branchId: d.branchId }), showToast(`${p.name} is a partner, looked after by ${p.by}`))}>
          <Check size={14} /> Take on
        </Button>
      </span>
    </li>
  );
}

/* ─────────────── one marketer ─────────────── */

function MarketerDetail({ d, id, onMove, onClose }: { d: MarketingData; id: string; onMove: (h: string) => void; onClose: () => void }) {
  const { user, showToast } = useApp();
  const m = d.marketers.find((x) => x.id === id)!;
  const p = d.progress.find((x) => x.marketerId === id)!;
  const t = tasksFor(d.st, d.branchId, id);
  const plan = bonusFor(d.st, d.branchId, id);
  const est = plan ? bonusEstimate(plan, p) : null;
  const [target, setT] = useState(String(p.target));
  const history = useMemo(() => [-5, -4, -3, -2, -1, 0].map((n) => progressFor(d.st, d.branchId, id, d.hospitals, d.agents, d.checkUps, shiftMonth(d.ym, n), m.name)), [d, id, m.name]);
  const max = Math.max(...history.map((h) => Math.max(h.revenue, h.target)), 1);
  const mine = [...d.statuses.values()].filter((s) => s.owner === id).sort((a, b) => (d.figs.get(b.key)?.revenue ?? 0) - (d.figs.get(a.key)?.revenue ?? 0));
  const canManage = can(user.role, "referral.manage");
  const done = t.custom.filter((c) => taskDoneAt(d.st, d.branchId, d.ym, id, c.id)).length;
  const work = d.st.entries.filter((e) => e.branchId === d.branchId && e.marketerId === id).slice(0, 12);
  const agreed = (d.st.acks[id]?.version ?? -1) >= (d.st.rules[d.branchId]?.version ?? 0) && !!d.st.rules[d.branchId];
  return (
    <Modal open xl onClose={onClose} icon={Target} title={m.name} description={`Marketer · ${monthName(d.ym, true)} · ${formatCount(p.hospitals.length)} hospitals, ${formatCount(p.agents)} PR agents${agreed ? " · agreed to the rules" : " · has not agreed to the latest rules yet"}`} footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      <div className="mk-detail">
        <div className="mk-kpis is-4">
          <div>
            <small>Amount against target</small>
            <b className="num">
              {d.money(p.revenue)} <span>/ {d.money(p.target)}</span>
            </b>
            <Badge tone={paceWord(p).tone} dot>
              {paceWord(p).text}
            </Badge>
          </div>
          <div>
            <small>This week</small>
            <b className="num">
              {d.money(p.week.revenue)} <span>/ {d.money(p.week.target)}</span>
            </b>
            <span>{formatCount(p.week.patients)} patients</span>
          </div>
          <div>
            <small>Tasks</small>
            <b className="num">
              {p.sourcedHospitals}/{t.newHospitals} <span>hospitals</span>
            </b>
            <span>
              {p.firstPatientAgents}/{t.newAgents} new agents · {p.weekFollowUps}/{t.followUpsPerWeek} follow-ups this week{t.custom.length ? ` · ${done}/${t.custom.length} extra tasks` : ""}
            </span>
          </div>
          <div>
            <small>Bonus</small>
            <b className="num">{plan && plan.kind !== "none" ? d.money(est!.now) : "—"}</b>
            <span>{plan ? (plan.kind === "none" ? "No money bonus set" : est!.qualifies ? "Earned so far" : `${d.money(est!.atTarget)} when they reach ${plan.minPct}% of target`) : "Not set up yet"}</span>
          </div>
        </div>

        <div className="mk-two">
          <section>
            <h4>Their hospitals</h4>
            <ul className="mkx-hosps">
              {mine.map((s) => (
                <li key={s.key}>
                  <span className="mkx-hosp-name">
                    <b>
                      {s.key}
                      {s.locked && (
                        <span className="mkx-lock" title="One of their top hospitals: locked">
                          <Lock size={12} />
                        </span>
                      )}
                    </b>
                    <small>
                      {formatCount(d.hospitals.find((h) => h.key === s.key)?.agentIds.length ?? 0)} agents · {formatCount(d.figs.get(s.key)?.patients ?? 0)} patients · {d.money(d.figs.get(s.key)?.revenue ?? 0)}
                    </small>
                  </span>
                  <span className="mkx-hosp-tags">
                    {s.dormant !== "active" && <Badge tone={DORMANT_TONE[s.dormant]}>{DORMANT_TEXT[s.dormant]}</Badge>}
                    {s.growth && <Badge tone="info">Needs growth</Badge>}
                    {s.handoverUntil && <Badge tone="brand">Handover</Badge>}
                  </span>
                  {canManage && (
                    <button type="button" className="mkx-move" onClick={() => onMove(s.key)} disabled={s.locked && s.dormant !== "flagged" && s.dormant !== "overdue"} title={s.locked ? "Locked: one of their top hospitals" : "Move to another marketer"}>
                      {s.locked && s.dormant !== "flagged" && s.dormant !== "overdue" ? <Lock size={14} /> : "Move"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h4>Six months</h4>
            <div className="mk-chart" role="img" aria-label="Amount and target by month">
              {history.map((h) => (
                <div key={h.month} className="mk-col">
                  <span className="mk-col-bars">
                    <i className="is-target" style={{ height: `${(h.target / max) * 100}%` }} />
                    <i className={h.revenue >= h.target ? "is-hit" : "is-got"} style={{ height: `${(h.revenue / max) * 100}%` }} />
                  </span>
                  <small>{monthName(h.month).split(" ")[0]}</small>
                  <em className={h.revenue >= h.target ? "is-hit" : ""}>{Math.round(h.pct * 100)}%</em>
                </div>
              ))}
            </div>
            {canManage && (
              <div className="mk-target">
                <label className="field">
                  Their target for {monthName(d.ym, true)} (₦)
                  <input inputMode="numeric" value={target} onChange={(e) => setT(e.target.value.replace(/\D/g, ""))} />
                </label>
                <Button
                  variant="secondary"
                  disabled={!Number(target) || Number(target) === p.target}
                  onClick={() => {
                    setTarget(d.branchId, id, d.ym, Number(target), user.name);
                    logAudit({ category: "PR agents", action: "Marketer target set", record: `${m.name} · ${monthName(d.ym, true)}`, details: `${d.money(Number(target))}`, branchId: d.branchId });
                    showToast(`Target set: ${d.money(Number(target))}`);
                  }}
                >
                  <Target size={15} /> Set
                </Button>
                <small>From this month's tasks unless you set an amount here.</small>
              </div>
            )}
            <h4>
              <CalendarClock size={14} /> Latest work
            </h4>
            {work.length ? (
              <ol className="ir-steps mk-work">
                {work.map((w) => (
                  <li key={w.id}>
                    <b>{ENTRY_TEXT[w.kind]}{w.hospital ? ` · ${w.hospital}` : ""}</b>
                    {w.text && <span>{w.text}</span>}
                    <small>{when(w.at)}</small>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="fd-note">Nothing logged yet.</p>
            )}
          </section>
        </div>
      </div>
    </Modal>
  );
}
