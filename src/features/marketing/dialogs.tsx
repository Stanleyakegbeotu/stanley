/**
 * Marketing dialogs (owner, 2026-11-27), for the Branch Manager and the
 * Company Admin: move a hospital (directly, or by asking its marketer), send
 * a caution about a dormant hospital, approve transfers, and set the month's
 * tasks, the bonus and the rules of engagement. Every action is logged.
 */
import { useMemo, useState } from "react";
import { ArrowRight, Check, FileText, Gift, Hospital, Lock, Plus, Send, ShieldAlert, Target, Trash2, X } from "lucide-react";
import { useApp } from "@/app/AppState";
import { can } from "@/services/permissions";
import { logAudit } from "@/services/audit";
import { BONUS_TEXT, DEFAULT_POLICY, EMPTY_BONUS, STAGE_LABEL, decideTransfer, directMove, effectiveTasks, keepLastMonthTasks, monthName, moveMode, policyOf, requestRelease, rulesText, rulesVersion, saveMonthTasks, sendCaution, setBonus, setPolicy, setRulesNotes, type BonusKind, type BonusPlan, type CustomTask, type Policy, type TaskSet, type Transfer } from "@/services/marketing";
import { formatCount } from "@/shared/format";
import { Badge, Button } from "@/shared/ui/controls";
import { Modal } from "@/shared/ui/Modal";
import { useMarketingData, type MarketingData } from "./data";

/** Move a hospital from PR Management (loads the marketing data itself). */
export function MoveFromPR({ branchId, hospital, onClose }: { branchId: string; hospital: string; onClose: () => void }) {
  const d = useMarketingData(branchId);
  return <MoveDialog d={d} hospital={hospital} onClose={onClose} />;
}

const initials = (n: string) =>
  n
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

/* ─────────────── move a hospital ─────────────── */

export function MoveDialog({ d, hospital, onClose }: { d: MarketingData; hospital: string; onClose: () => void }) {
  const { user, showToast } = useApp();
  const canDirectReassign = can(user.role, "marketing.hospitals.reassign");
  const s = d.statuses.get(hospital);
  const h = d.hospitals.find((x) => x.key === hospital);
  const owner = s?.owner ?? null;
  const m = moveMode(s, owner ? d.isActive(owner) : true);
  const [to, setTo] = useState("");
  const [why, setWhy] = useState("");
  const choices = d.marketers.filter((x) => x.status === "Active" && x.id !== owner);
  const pending = d.openTransfers.find((t) => t.hospital === hospital);
  return (
    <Modal
      open
      onClose={onClose}
      icon={Hospital}
      title={`Move ${hospital}`}
      description={`${formatCount(h?.agentIds.length ?? 0)} PR agents go with it. Now with ${d.nameOf(owner)}.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          {m.mode !== "locked" && !pending && (m.mode !== "direct" || canDirectReassign) && (
            <Button
              disabled={!to || why.trim().length < 3}
              onClick={() => {
                if (m.mode === "direct") {
                  directMove(d.branchId, hospital, owner, to, why, user.name, user.role);
                  showToast(`${hospital} moved to ${d.nameOf(to)}`);
                } else {
                  requestRelease(d.branchId, hospital, owner!, to, why, user.name);
                  showToast(`Request sent to ${d.nameOf(owner)}`);
                }
                onClose();
              }}
            >
              {m.mode === "direct" ? (
                <>
                  <Check size={15} /> Move now
                </>
              ) : (
                <>
                  <Send size={15} /> Ask {d.nameOf(owner).split(" ")[0]} to release it
                </>
              )}
            </Button>
          )}
        </>
      }
    >
      <div className={`mkx-rule is-${m.mode}`}>
        {m.mode === "locked" ? <Lock size={18} /> : m.mode === "direct" ? <Check size={18} /> : <Send size={18} />}
        <span>
          <b>{m.mode === "locked" ? "Locked" : m.mode === "direct" ? "You can move it now" : "The marketer must agree"}</b>
          <small>{m.why}</small>
        </span>
      </div>
      {pending ? (
        <p className="fd-note">
          A move is already waiting: {d.nameOf(pending.to)} · {STAGE_LABEL[pending.stage]}.
        </p>
      ) : m.mode !== "locked" ? (
        <>
          <p className="mkx-label">Move to</p>
          <div className="mk-pick" role="radiogroup" aria-label="Marketer">
            {choices.map((x) => {
              const p = d.progress.find((y) => y.marketerId === x.id);
              return (
                <button key={x.id} type="button" role="radio" aria-checked={to === x.id} className={to === x.id ? "is-on" : ""} onClick={() => setTo(x.id)}>
                  <span className="mk-av">{initials(x.name)}</span>
                  <span className="mkx-pick-text">
                    {x.name}
                    <small>
                      {formatCount(p?.hospitals.length ?? 0)} hospitals · {formatCount(p?.agents ?? 0)} agents
                    </small>
                  </span>
                </button>
              );
            })}
          </div>
          <label className="field">
            Why (needed)
            <input value={why} maxLength={200} onChange={(e) => setWhy(e.target.value)} placeholder={s?.dormant === "flagged" || s?.dormant === "overdue" ? "For example: dormant for 40 days, a fresh start to revive it" : "For example: new marketer, closer to their area"} />
          </label>
          <p className="fd-note">The patients it sent before the move stay credited to {d.nameOf(owner)}. The new marketer gets a {policyOf(d.st, d.branchId).handoverDays}-day handover.</p>
        </>
      ) : null}
    </Modal>
  );
}

/* ─────────────── caution ─────────────── */

export function CautionDialog({ d, hospital, onClose }: { d: MarketingData; hospital: string; onClose: () => void }) {
  const { user, showToast } = useApp();
  const s = d.statuses.get(hospital)!;
  const pol = policyOf(d.st, d.branchId);
  const [msg, setMsg] = useState(`${hospital} has sent ${s.daysSince === null ? "no patient in a long time" : `no patient for ${s.daysSince} days`}. Please tell me why, and your plan to revive it, within ${pol.replyDays} days.`);
  return (
    <Modal
      open
      onClose={onClose}
      icon={ShieldAlert}
      title={`Caution: ${hospital}`}
      description={`To ${d.nameOf(s.owner)}. They answer with a reason and a plan; it shows on their dashboard and bell.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={msg.trim().length < 10 || !s.owner}
            onClick={() => {
              sendCaution({ branchId: d.branchId, hospital, marketerId: s.owner!, by: user.name, message: msg });
              showToast(`Caution sent to ${d.nameOf(s.owner)}`);
              onClose();
            }}
          >
            <Send size={15} /> Send caution
          </Button>
        </>
      }
    >
      <label className="field">
        Message
        <textarea value={msg} maxLength={500} onChange={(e) => setMsg(e.target.value)} rows={4} />
      </label>
      <p className="fd-note">
        {s.cautions ? `${s.cautions} earlier caution${s.cautions === 1 ? "" : "s"} for this hospital.` : "First caution for this hospital."} If it is still dormant {pol.snoozeDays} days after their answer, it is flagged again.
      </p>
    </Modal>
  );
}

/* ─────────────── transfers waiting ─────────────── */

export function TransferRow({ d, t }: { d: MarketingData; t: Transfer }) {
  const { user, showToast } = useApp();
  const canDecide = can(user.role, "marketing.transfers.decide");
  const [note, setNote] = useState("");
  return (
    <li className="mkx-transfer">
      <span className="mk-av is-hosp">
        <Hospital size={16} />
      </span>
      <span className="mkx-transfer-text">
        <b>
          {t.hospital}: {d.nameOf(t.from)} <ArrowRight size={13} /> {d.nameOf(t.to)}
        </b>
        <small>
          {t.kind === "offer" ? "Offered by the marketer, accepted by the colleague" : t.kind === "request" ? "Your request to release it" : "Moved"} · {t.reason}
        </small>
        <small>
          <Badge tone={t.stage === "manager" ? "warn" : "info"}>{STAGE_LABEL[t.stage]}</Badge>
        </small>
      </span>
      {t.stage === "manager" && canDecide && (
        <span className="mk-actions">
          <input className="mkx-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" />
          <Button variant="secondary" size="sm" onClick={() => (decideTransfer(t.id, false, user.name, note, user.role), showToast("Not approved"))}>
            <X size={14} /> Decline
          </Button>
          <Button size="sm" onClick={() => (decideTransfer(t.id, true, user.name, note, user.role), showToast(`${t.hospital} moved to ${d.nameOf(t.to)}`))}>
            <Check size={14} /> Approve
          </Button>
        </span>
      )}
    </li>
  );
}

/* ─────────────── monthly tasks ─────────────── */

const num = (v: string) => Number(v.replace(/[^\d.]/g, "")) || 0;

export function TasksDialog({ d, onClose }: { d: MarketingData; onClose: () => void }) {
  const { user, showToast } = useApp();
  const { tasks, set } = effectiveTasks(d.st, d.branchId, d.ym);
  const [base, setBase] = useState<TaskSet>(tasks.base);
  const [over, setOver] = useState<Record<string, Partial<TaskSet>>>(tasks.overrides);
  const [custom, setCustom] = useState<CustomTask[]>(set ? tasks.custom : []);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [who, setWho] = useState("");
  const field = (k: keyof TaskSet, label: string, hint: string) => (
    <label className="field">
      {label}
      <input inputMode="numeric" value={String(base[k] ?? "")} onChange={(e) => setBase({ ...base, [k]: num(e.target.value) })} />
      <small className="mkx-hint">{hint}</small>
    </label>
  );
  return (
    <Modal
      open
      xl
      onClose={onClose}
      icon={Target}
      title={`Marketer tasks · ${monthName(d.ym, true)}`}
      description={set ? `Set by ${tasks.setBy}${tasks.carried ? " (carried over)" : ""}. Changes show on every marketer's dashboard.` : "Not set for this month yet. Keep last month's or set new ones."}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          {tasks.setBy && (
            <Button
              variant="secondary"
              onClick={() => {
                keepLastMonthTasks(d.branchId, d.ym, user.name, user.role);
                showToast("Last month's tasks kept for this month");
                onClose();
              }}
            >
              Keep last month's
            </Button>
          )}
          <Button
            onClick={() => {
              saveMonthTasks(d.branchId, d.ym, { base, overrides: over, custom }, user.name, user.role);
              showToast(`Tasks set for ${monthName(d.ym, true)}`);
              onClose();
            }}
          >
            <Check size={15} /> Save for {monthName(d.ym)}
          </Button>
        </>
      }
    >
      <div className="mkx-cols">
        <section>
          <p className="mkx-label">For every marketer</p>
          <div className="mkx-seg" role="radiogroup" aria-label="Money target">
            {(
              [
                ["auto", "Usual month + %"],
                ["fixed", "A set amount"],
              ] as const
            ).map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={base.amountMode === k} className={base.amountMode === k ? "is-on" : ""} onClick={() => setBase({ ...base, amountMode: k })}>
                {l}
              </button>
            ))}
          </div>
          {base.amountMode === "auto" ? field("autoPct", "Grow by (%)", "Each marketer's hospitals' usual month (last 3) plus this share.") : field("fixedAmount", "Money target (₦)", "The same amount for every marketer, unless set below.")}
          {field("newHospitals", "New partner hospitals this month", "Counted when you take a hospital they registered on.")}
          {field("newAgents", "New PR agents with a first patient", "Counted when the new agent sends their first patient.")}
          {field("followUpsPerWeek", "Follow-ups a week", "Visits, calls or messages they log.")}
        </section>
        <section>
          <p className="mkx-label">Different for one marketer (optional)</p>
          <div className="mkx-over">
            {d.marketers.map((m) => (
              <div key={m.id} className="mkx-over-row">
                <span className="mk-av">{initials(m.name)}</span>
                <b>{m.name}</b>
                <input inputMode="numeric" placeholder="₦ target" value={over[m.id]?.fixedAmount ? String(over[m.id]!.fixedAmount) : ""} onChange={(e) => setOver({ ...over, [m.id]: { ...over[m.id], ...(num(e.target.value) ? { amountMode: "fixed" as const, fixedAmount: num(e.target.value) } : { amountMode: undefined, fixedAmount: undefined }) } })} aria-label={`${m.name} money target`} />
                <input inputMode="numeric" placeholder="Hosp." value={over[m.id]?.newHospitals != null ? String(over[m.id]!.newHospitals) : ""} onChange={(e) => setOver({ ...over, [m.id]: { ...over[m.id], newHospitals: e.target.value === "" ? undefined : num(e.target.value) } })} aria-label={`${m.name} new hospitals`} />
              </div>
            ))}
          </div>
          <p className="mkx-label">Extra tasks this month</p>
          <ul className="mkx-custom">
            {custom.map((c) => (
              <li key={c.id}>
                <span>
                  <b>{c.title}</b>
                  <small>
                    {c.marketerIds.length ? c.marketerIds.map((id) => d.nameOf(id)).join(", ") : "Everyone"}
                    {c.due ? ` · by ${new Date(`${c.due}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
                  </small>
                </span>
                <button type="button" onClick={() => setCustom(custom.filter((x) => x.id !== c.id))} aria-label="Remove task">
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
          <div className="mkx-add">
            <input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="For example: visit every hospital in Garki" />
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" />
            <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="For">
              <option value="">Everyone</option>
              {d.marketers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <Button variant="secondary" size="sm" disabled={title.trim().length < 3} onClick={() => (setCustom([...custom, { id: `T${Date.now()}`, title: title.trim(), due: due || undefined, marketerIds: who ? [who] : [] }]), setTitle(""), setDue(""))}>
              <Plus size={14} /> Add
            </Button>
          </div>
        </section>
      </div>
    </Modal>
  );
}

/* ─────────────── bonus ─────────────── */

export function BonusDialog({ d, onClose }: { d: MarketingData; onClose: () => void }) {
  const { user, showToast } = useApp();
  const cur = d.st.bonus[d.branchId];
  const [b, setB] = useState<BonusPlan>(cur?.base ?? { ...EMPTY_BONUS });
  const [over, setOver] = useState<Record<string, Partial<BonusPlan>>>(cur?.overrides ?? {});
  const kinds: BonusKind[] = ["fixed", "percentOver", "percentAll", "none"];
  const n = (k: keyof BonusPlan, label: string, hint: string) => (
    <label className="field">
      {label}
      <input inputMode="numeric" value={String(b[k] ?? "")} onChange={(e) => setB({ ...b, [k]: num(e.target.value) })} />
      <small className="mkx-hint">{hint}</small>
    </label>
  );
  return (
    <Modal
      open
      wide
      onClose={onClose}
      icon={Gift}
      title="Marketer bonus"
      description={cur ? `Set by ${cur.setBy}. Marketers see their bonus on their dashboard.` : "Not set yet. Marketers see it on their dashboard once it is set."}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setBonus(d.branchId, { base: b, overrides: over }, user.name);
              showToast("Bonus saved");
              onClose();
            }}
          >
            <Check size={15} /> Save bonus
          </Button>
        </>
      }
    >
      <p className="mkx-label">Type of bonus</p>
      <div className="mkx-kinds">
        {kinds.map((k) => (
          <button key={k} type="button" aria-pressed={b.kind === k} className={b.kind === k ? "is-on" : ""} onClick={() => setB({ ...b, kind: k })}>
            {BONUS_TEXT[k]}
          </button>
        ))}
      </div>
      <div className="mkx-grid">
        {b.kind === "fixed" && n("amount", "Amount (₦)", "Paid when they reach the target.")}
        {(b.kind === "percentOver" || b.kind === "percentAll") && n("pct", "Percent", b.kind === "percentOver" ? "Of the amount above their target." : "Of everything their hospitals generated.")}
        {b.kind !== "none" && n("minPct", "Reach this % of the target", "100 = the full target. 90 pays at 90%.")}
        {n("perHospital", "Extra for each new hospital (₦)", "0 for none.")}
        {n("perAgent", "Extra for each new PR agent with a first patient (₦)", "0 for none.")}
      </div>
      <label className="field">
        Anything else (optional)
        <input value={b.note} maxLength={160} onChange={(e) => setB({ ...b, note: e.target.value })} placeholder="For example: marketer of the month gets a day off" />
      </label>
      {b.kind === "fixed" && (
        <>
          <p className="mkx-label">Different amount for one marketer (optional)</p>
          <div className="mkx-over">
            {d.marketers.map((m) => (
              <div key={m.id} className="mkx-over-row">
                <span className="mk-av">{initials(m.name)}</span>
                <b>{m.name}</b>
                <input inputMode="numeric" placeholder="₦ amount" value={over[m.id]?.amount ? String(over[m.id]!.amount) : ""} onChange={(e) => setOver({ ...over, [m.id]: num(e.target.value) ? { amount: num(e.target.value) } : {} })} aria-label={`${m.name} bonus`} />
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}

/* ─────────────── rules of engagement and policy ─────────────── */

export function RulesDialog({ d, onClose }: { d: MarketingData; onClose: () => void }) {
  const { user, showToast } = useApp();
  const [p, setP] = useState<Policy>(policyOf(d.st, d.branchId));
  const [notes, setNotes] = useState(d.st.rules[d.branchId]?.notes ?? "");
  const preview = useMemo(() => rulesText({ ...d.st, policy: { ...d.st.policy, [d.branchId]: p } }, d.branchId), [d.st, d.branchId, p]);
  const version = rulesVersion(d.st, d.branchId);
  const agreed = d.marketers.filter((m) => (d.st.acks[m.id]?.version ?? -1) >= version && version > 0);
  const n = (k: keyof Policy, label: string, hint: string) => (
    <label className="field">
      {label}
      <input inputMode="numeric" value={String(p[k])} onChange={(e) => setP({ ...p, [k]: num(e.target.value) || DEFAULT_POLICY[k] })} />
      <small className="mkx-hint">{hint}</small>
    </label>
  );
  return (
    <Modal
      open
      xl
      onClose={onClose}
      icon={FileText}
      title="Rules of engagement"
      description={version ? `Version ${version} · ${agreed.length} of ${d.marketers.length} marketers have agreed to it.` : "Not published yet. Marketers read and agree to the rules on their phone."}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setPolicy(d.branchId, p, user.name);
              setRulesNotes(d.branchId, notes, user.name);
              logAudit({ category: "PR agents", action: "Rules of engagement published", record: `Version ${version + 2}`, details: `By ${user.name}`, branchId: d.branchId });
              showToast("Rules published. Marketers are asked to read and agree.");
              onClose();
            }}
          >
            <Send size={15} /> Publish to marketers
          </Button>
        </>
      }
    >
      <div className="mkx-cols">
        <section>
          <p className="mkx-label">The numbers</p>
          <div className="mkx-seg" role="radiogroup" aria-label="Handover">
            {([7, 14] as const).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={p.handoverDays === k} className={p.handoverDays === k ? "is-on" : ""} onClick={() => setP({ ...p, handoverDays: k })}>
                {k}-day handover
              </button>
            ))}
          </div>
          {n("dormantDays", "Dormant after (days without a patient)", "The hospital is flagged on this page.")}
          {n("replyDays", "Days to answer a caution", "Their answer: a reason and a plan.")}
          {n("snoozeDays", "Flag again after (days)", "If still dormant this long after their answer.")}
          {n("lockTop", "Locked best hospitals per marketer", "By amount over the last three months.")}
          {n("growthMaxAgents", "Needs growth at (agents or fewer)", "Small hospitals to grow with more PR agents.")}
          <label className="field">
            Branch notes (optional)
            <textarea rows={4} value={notes} maxLength={1200} onChange={(e) => setNotes(e.target.value)} placeholder="Anything else for this branch: meeting days, reporting times…" />
          </label>
        </section>
        <section className="mkx-preview">
          <p className="mkx-label">What marketers read</p>
          {preview.map((s) => (
            <div key={s.title}>
              <b>{s.title}</b>
              <ul>
                {s.points.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          ))}
          {notes.trim() && (
            <div>
              <b>From your branch</b>
              <p>{notes.trim()}</p>
            </div>
          )}
          <p className="mkx-label">Agreed</p>
          <p className="mkx-agreed">
            {d.marketers.map((m) => (
              <Badge key={m.id} tone={agreed.includes(m) ? "ok" : "neutral"} dot>
                {m.name}
              </Badge>
            ))}
          </p>
        </section>
      </div>
    </Modal>
  );
}
