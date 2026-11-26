/**
 * Incoming referrals on the desktop (owner, 2026-11-26): the same folder as
 * the mobile app, designed for the desktop dashboards.
 *
 *  • Branch dashboard (Branch Manager and Front Desk): the folder with its
 *    waiting count, the patients waiting now (start their bill in one click),
 *    and the full list in a sidebar pop-up: Waiting, Attended, Did not come
 *    or cancelled, This week, and Referral history (earlier weeks, with a
 *    date filter). Each referral opens its details: patient, referral ID
 *    (copy), tests and estimated total, the PR agent's note, voice note and
 *    any reduction asked for, the progress, Update status and Continue to
 *    billing. Search looks through every week, so a patient who brings last
 *    week's referral is still found.
 *  • Company Admin dashboard: every branch's folder side by side (waiting,
 *    oldest wait, attended today, urgent), opening the same list per branch
 *    or for all branches. The admin views; the branch bills.
 *
 * Logic and demo data: services/incoming (shared with the mobile app).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CalendarDays,
  Check,
  CircleX,
  Clock3,
  Copy,
  FolderOpen,
  Hash,
  History,
  Inbox,
  ListChecks,
  Mic,
  Pause,
  Phone,
  Play,
  Siren,
  Stethoscope,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useApp } from "@/app/AppState";
import { getBranch } from "@/data/company";
import { isoDate } from "@/data/demo/generator";
import type { Branch } from "@/data/types";
import { logAudit } from "@/services/audit";
import { DAY_MS, STATUS_TEXT, ago, findIncoming, hash, isOpen, statusLabel, thisWeek, useIncomingFrom, weekStart, type Incoming, type IncomingStatus, type PoolItem, type Urgency } from "@/services/incoming";
import { branchUpdateText, setBranchUpdate, type BranchUpdateKind } from "@/services/referralStatus";
import { formatCount, formatMoney, formatShortDate, formatTime, initials } from "@/shared/format";
import { Reveal, useMotionPreset } from "@/shared/motion";
import { Badge, EmptyState, SearchInput, Segmented, type Tone } from "@/shared/ui/controls";
import { Modal } from "@/shared/ui/Modal";
import { branchPrefix, lookupReferral } from "@/services/billing";
import { Pagination } from "@/shared/ui/Pagination";
import { FieldError } from "@/shared/ui/FieldError";
import { SideModal } from "@/features/branch/SideModal";
import { buildItems, groupCategories } from "@/features/inventory/InventoryCatalog";
import { isManager } from "@/data/userRecords";
import { useReceiptProfile } from "@/services/receiptProfile";

/** "Chioma Okafor, Branch Manager · 0803 …": who the admin asks about a branch's referrals. */
function useBranchContact() {
  const { staff } = useApp();
  const receipt = useReceiptProfile();
  return (branchId: string) => {
    const m = staff.find((p) => p.branchId === branchId && isManager(p) && p.status === "Active");
    const phone = receipt.branches[branchId]?.phone?.trim() || "";
    return { manager: m ? `${m.name}, Branch Manager` : "the Branch Manager", phone };
  };
}

/* ─────────────── data ─────────────── */

/** Incoming referrals for these branches (desktop catalogue), newest first. */
export function useIncomingMany(branchIds: string[]): Incoming[] {
  const { inventory } = useApp();
  const items = useMemo(() => buildItems(inventory), [inventory]);
  const labels = useMemo(() => new Map(groupCategories(items, inventory.categoryNames).map((g) => [g.key, g.label])), [items, inventory.categoryNames]);
  const itemsOf = useCallback((): PoolItem[] => items, [items]);
  const labelOf = useCallback((k: string) => labels.get(k) ?? k, [labels]);
  return useIncomingFrom(branchIds, itemsOf, labelOf);
}

const STATUS_TONE: Record<IncomingStatus, Tone> = { waiting: "warn", billing: "info", attended: "ok", coming: "brand", no_show: "neutral", cancelled: "danger" };
const URGENCY_TONE: Record<Urgency, Tone> = { Routine: "neutral", Urgent: "warn", Emergency: "danger" };
const totalOf = (r: Incoming) => r.services.reduce((s, x) => s + x.price, 0);
const dayText = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const matches = (r: Incoming, t: string) => {
  if (!t) return true;
  const digits = t.replace(/\D/g, "");
  return (
    [r.patient.name, r.patient.phone, r.id, r.agentName, r.hospital, getBranch(r.branchId)?.name ?? "", ...r.services.map((s) => s.name)].join(" ").toLowerCase().includes(t) ||
    (digits.length >= 3 && (r.id.replace(/\D/g, "").includes(digits) || r.patient.phone.includes(digits)))
  );
};

/* ─────────────── dashboard sections ─────────────── */

const urgencyRank = (r: Incoming) => (r.urgency === "Emergency" ? 2 : r.urgency === "Urgent" ? 1 : 0);
/** Urgent first, then the longest waiting. */
const byUrgency = (list: Incoming[]) => [...list].sort((a, b) => urgencyRank(b) - urgencyRank(a) || a.sentAt.getTime() - b.sentAt.getTime());

/**
 * The folder on the branch dashboard (owner, 2026-11-26: compact, no empty
 * space): the folder with its count beside a short table of who is waiting
 * now. A row opens the patient's details; Start bill opens Billing filled in.
 * `canBill`: the person may open Billing.
 */
export function BranchReferralsSection({ branch, canBill }: { branch: Branch; canBill: boolean }) {
  const { navigate } = useApp();
  const ids = useMemo(() => [branch.id], [branch.id]);
  const all = useIncomingMany(ids);
  const week = thisWeek(all);
  const waiting = week.filter(isOpen);
  const today = week.filter((r) => isoDate(r.sentAt) === isoDate(new Date()));
  const attendedWeek = week.filter((r) => r.status === "attended").length;
  const [open, setOpen] = useState<null | ListView>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [finding, setFinding] = useState(false);
  const bill = (q: string) => navigate(`/branch/${branch.id}/billing?${q}`);
  const startBill = (r: Incoming) => (r.draftId ? bill(`draft=${encodeURIComponent(r.draftId)}`) : bill(`incoming=${encodeURIComponent(r.id)}`));
  const current = detail ? (all.find((r) => r.id === detail) ?? null) : null;

  return (
    <Reveal as="section" className="bd-sec rf-sec">
      <header className="bd-sec-head">
        <div>
          <span className="bd-eyebrow">From PR agents</span>
          <h2>Incoming referrals</h2>
          <p>When a referred patient walks in, open their row and start the bill: the patient, the PR agent and the tests are filled in.</p>
        </div>
        <div className="rf-head-actions">
          <button type="button" className="bd-head-link" onClick={() => setOpen("history")}>
            <History size={16} /> Referral history
          </button>
          <button type="button" className="bd-head-link" onClick={() => setFinding(true)}>
            <Hash size={16} /> Enter a referral ID
          </button>
        </div>
      </header>

      <div className="rf-layout">
        <Folder waiting={waiting} onOpen={() => setOpen("waiting")} empty="No referred patient is waiting this week" />
        <div className="rf-now">
          <div className="rf-strip-stats">
            <MiniStat icon={Clock3} label="Waiting" value={formatCount(waiting.length)} tone={waiting.length ? "warn" : undefined} onClick={() => setOpen("waiting")} />
            <MiniStat icon={Siren} label="Urgent" value={formatCount(waiting.filter((r) => r.urgency !== "Routine").length)} tone={waiting.some((r) => r.urgency !== "Routine") ? "danger" : undefined} onClick={() => setOpen("waiting")} />
            <MiniStat icon={CalendarDays} label="Sent today" value={formatCount(today.length)} onClick={() => setOpen("week")} />
            <MiniStat icon={BadgeCheck} label="Attended this week" value={`${week.length ? Math.round((attendedWeek / week.length) * 100) : 0}%`} onClick={() => setOpen("attended")} />
          </div>
          <WaitingTable rows={byUrgency(waiting)} total={waiting.length} onRow={(r) => setDetail(r.id)} onAll={() => setOpen("waiting")} action={canBill ? startBill : undefined} />
        </div>
      </div>

      {open && <ReferralsModal branchIds={ids} list={all} initial={open} canBill={canBill} onStart={startBill} onClose={() => setOpen(null)} />}
      {current && <ReferralDetail r={current} canBill={canBill} onStart={startBill} onClose={() => setDetail(null)} />}
      {finding && (
        <FindReferralDialog
          branchIds={ids}
          list={all}
          onFound={(r) => (setFinding(false), setDetail(r.id))}
          onRegistered={canBill ? (id) => (setFinding(false), bill(`refid=${encodeURIComponent(id)}`)) : undefined}
          onClose={() => setFinding(false)}
        />
      )}
    </Reveal>
  );
}

/** The folder: tab, the newest papers peeking out, the pocket and the count. Stretches to its row. */
function Folder({ waiting, onOpen, empty, sub }: { waiting: Incoming[]; onOpen: () => void; empty: string; sub?: string }) {
  const n = waiting.length;
  const oldest = waiting.reduce<Incoming | null>((o, r) => (!o || r.sentAt < o.sentAt ? r : o), null);
  return (
    <button type="button" className={`rf-folder ${n ? "has-waiting" : ""}`} onClick={onOpen} aria-label={`Open the referrals folder, ${n} waiting`}>
      <span className="rf-folder-back" aria-hidden="true" />
      <span className="rf-folder-tab" aria-hidden="true">
        Referrals in
      </span>
      <span className="rf-papers" aria-hidden="true">
        {(n ? waiting.slice(0, 3) : [null, null]).map((r, i) => (
          <motion.span key={r?.id ?? i} className="rf-paper" style={{ top: i * 26, rotate: [-2.4, 1.6, -0.8][i], zIndex: i }} initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.08 * i, duration: 0.35 }}>
            {r ? (
              <>
                <i className={`rf-dot is-${r.urgency.toLowerCase()}`} />
                <b>{r.patient.name}</b>
                <small>{ago(r.sentAt)}</small>
              </>
            ) : (
              <span className="rf-paper-line" />
            )}
          </motion.span>
        ))}
      </span>
      <span className="rf-pocket">
        <Inbox className="cat-mark" size={110} strokeWidth={1.2} aria-hidden="true" />
        <span className="rf-pocket-text">
          <b>{n ? `${formatCount(n)} waiting` : "All attended"}</b>
          <small>{n ? (sub ?? `Newest ${ago(waiting[0]!.sentAt)}${oldest && oldest !== waiting[0] ? ` · oldest ${ago(oldest.sentAt)}` : ""}`) : empty}</small>
        </span>
        <span className="rf-pocket-go">
          Open the folder <ArrowRight size={16} />
        </span>
      </span>
      <span className="rf-count" aria-hidden="true">
        {n > 0 && <span className="rf-count-ping" />}
        <span className={`rf-count-num ${n ? "" : "is-clear"}`}>{n ? (n > 99 ? "99+" : n) : <BadgeCheck size={22} />}</span>
      </span>
    </button>
  );
}

function MiniStat({ icon: Icon, label, value, tone, onClick }: { icon: LucideIcon; label: string; value: string; tone?: "warn" | "danger"; onClick: () => void }) {
  return (
    <button type="button" className={`rf-mini ${tone ? `is-${tone}` : ""}`} onClick={onClick}>
      <span className="rf-mini-icon" aria-hidden="true">
        <Icon size={16} />
      </span>
      <span>
        <strong className="num">{value}</strong>
        <small>{label}</small>
      </span>
    </button>
  );
}

/** Who is waiting now, one compact row each (like the mobile list). A row opens the patient's details. */
function WaitingTable({ rows, total, onRow, onAll, action, showBranch }: { rows: Incoming[]; total: number; onRow: (r: Incoming) => void; onAll: () => void; action?: (r: Incoming) => void; showBranch?: boolean }) {
  const shown = rows;
  return (
    <div className="rf-wait">
      <div className="rf-wait-head">
        <b>
          Waiting now <span className="rf-wait-n">{formatCount(total)}</span>
        </b>
        <button type="button" className="rf-more" onClick={onAll}>
          Open the folder <ArrowRight size={14} />
        </button>
      </div>
      {shown.length ? (
        <div className="rf-wait-scroll thin-scroll">
        <table className="rf-wait-table" aria-label="Referred patients waiting now">
          <tbody>
            {shown.map((r) => (
              <tr key={`${r.id}|${r.branchId}`} tabIndex={0} onClick={() => onRow(r)} onKeyDown={(k) => (k.key === "Enter" || k.key === " ") && (k.preventDefault(), onRow(r))} className={`is-${r.urgency.toLowerCase()}`}>
                <td>
                  <span className="rf-w-patient">
                  <i className={`rf-dot is-${r.urgency.toLowerCase()}`} title={r.urgency} />
                  <span>
                    <b>{r.patient.name}</b>
                    <small>
                      <span className="mono">{r.id}</span>
                      {showBranch ? ` · ${getBranch(r.branchId)?.name ?? ""}` : ` · ${r.patient.gender}, ${r.patient.age}`}
                    </small>
                  </span>
                  </span>
                </td>
                <td className="rf-w-tests" title={r.services.map((s) => s.name).join(", ")}>
                  <span className="rf-w-test">
                    {r.services[0]?.name}
                    {r.services.length > 1 && <em> +{r.services.length - 1}</em>}
                  </span>
                  <small>by {r.agentName}</small>
                </td>
                <td className="rf-w-when">
                  {r.urgency !== "Routine" ? <Badge tone={URGENCY_TONE[r.urgency]}>{r.urgency}</Badge> : r.status !== "waiting" ? <Badge tone={STATUS_TONE[r.status]}>{statusLabel(r)}</Badge> : null}
                  <small>{ago(r.sentAt)}</small>
                </td>
                {action && (
                  <td className="rf-w-go">
                    <button
                      type="button"
                      className="rf-row-go"
                      onClick={(e) => {
                        e.stopPropagation();
                        action(r);
                      }}
                    >
                      {r.status === "billing" ? "Continue" : "Start bill"} <ArrowRight size={14} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      ) : (
        <div className="rf-clear">
          <BadgeCheck size={22} />
          <span>
            <b>No one is waiting</b>
            <small>New referrals from PR agents appear here the moment they are sent.</small>
          </span>
        </div>
      )}
    </div>
  );
}

/* ─────────────── the full list (sidebar pop-up) ─────────────── */

type ListView = "waiting" | "attended" | "not" | "week" | "history";
const VIEW_META: Record<ListView, { label: string; icon: LucideIcon; hint: string }> = {
  waiting: { label: "Waiting", icon: Clock3, hint: "Waiting, bill started or coming later" },
  attended: { label: "Attended", icon: BadgeCheck, hint: "Billed this week" },
  not: { label: "Did not come or cancelled", icon: CircleX, hint: "Closed by the branch this week" },
  week: { label: "This week", icon: CalendarDays, hint: "Every referral since Monday" },
  history: { label: "Referral history", icon: History, hint: "Earlier weeks, never deleted" },
};
type When = "any" | "last" | "month" | "4w" | "custom";

/**
 * Every referral for these branches. Branch: by status (one branch). Company
 * Admin (`admin`): by branch, with the status as a filter.
 */
function ReferralsModal({ branchIds, list, initial, initialBranch, canBill, admin, onStart, onClose }: { branchIds: string[]; list: Incoming[]; initial: ListView; initialBranch?: string; canBill: boolean; admin?: boolean; onStart?: (r: Incoming) => void; onClose: () => void }) {
  const [view, setView] = useState<ListView>(initial);
  const [branchPick, setBranchPick] = useState<string>(initialBranch ?? (branchIds.length === 1 ? branchIds[0]! : "all"));
  const [q, setQ] = useState("");
  const [when, setWhen] = useState<When>("any");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const [detail, setDetail] = useState<string | null>(null);
  useEffect(() => setPage(1), [view, branchPick, q, when, from, to]);

  const scoped = admin && branchPick !== "all" ? list.filter((r) => r.branchId === branchPick) : list;
  const monday = weekStart().getTime();
  const week = scoped.filter((r) => r.sentAt.getTime() >= monday);
  const earlier = scoped.filter((r) => r.sentAt.getTime() < monday);
  const byView = (v: ListView, src = week) =>
    v === "waiting" ? src.filter(isOpen) : v === "attended" ? src.filter((r) => r.status === "attended") : v === "not" ? src.filter((r) => !isOpen(r) && r.status !== "attended") : v === "week" ? src : earlier;
  const bounds = useMemo((): [number, number] => {
    const now = new Date();
    const day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (when === "last") return [monday - 7 * DAY_MS, monday];
    if (when === "month") return [new Date(now.getFullYear(), now.getMonth(), 1).getTime(), Infinity];
    if (when === "4w") return [day0 - 27 * DAY_MS, Infinity];
    if (when === "custom") return [from ? new Date(`${from}T00:00:00`).getTime() : -Infinity, to ? new Date(`${to}T00:00:00`).getTime() + DAY_MS : Infinity];
    return [-Infinity, Infinity];
  }, [when, from, to, monday]);
  const t = q.trim().toLowerCase();
  // A search looks through every week, so a patient with last week's referral is still found.
  const base = t ? scoped : byView(view);
  const rows = base.filter((r) => matches(r, t) && (view !== "history" || t || (r.sentAt.getTime() >= bounds[0] && r.sentAt.getTime() < bounds[1])));
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const safe = Math.min(page, pages);
  const visible = rows.slice((safe - 1) * size, safe * size);
  const current = detail ? (list.find((r) => `${r.id}|${r.branchId}` === detail) ?? null) : null;
  const waiting = week.filter(isOpen);
  const today = week.filter((r) => isoDate(r.sentAt) === isoDate(new Date()));
  const attended = week.filter((r) => r.status === "attended").length;
  const earlierAtt = earlier.filter((r) => r.status === "attended").length;
  const multi = branchIds.length > 1;
  const scopeName = admin ? (branchPick === "all" ? `${branchIds.length} branch${branchIds.length === 1 ? "" : "es"}` : `${getBranch(branchPick)?.name ?? ""} branch`) : `${getBranch(branchIds[0]!)?.name ?? ""} branch`;
  const money = (n: number) => formatMoney(n, getBranch(branchPick === "all" ? branchIds[0]! : branchPick)?.currency ?? "NGN");

  const nav = admin
    ? [
        { value: "all", label: "All branches", icon: FolderOpen, count: formatCount(thisWeek(list).filter(isOpen).length), amount: `${formatCount(thisWeek(list).length)} this week` },
        ...branchIds.map((id) => {
          const mine = thisWeek(list.filter((r) => r.branchId === id));
          return { value: id, label: `${getBranch(id)?.name ?? id} branch`, icon: FolderOpen, count: formatCount(mine.filter(isOpen).length), amount: `${formatCount(mine.length)} this week` };
        }),
      ]
    : (Object.keys(VIEW_META) as ListView[]).map((v) => ({ value: v, label: VIEW_META[v].label, icon: VIEW_META[v].icon, count: formatCount(byView(v).length), amount: VIEW_META[v].hint }));

  return (
    <SideModal
      icon={FolderOpen}
      eyebrow={admin ? "Incoming referrals · all branches" : "Incoming referrals"}
      title={admin ? "Referrals by branch" : "Referrals folder"}
      subtitle={`${scopeName} · the folder starts fresh every Monday`}
      navLabel={admin ? "Branch" : "Show"}
      nav={nav}
      value={admin ? branchPick : view}
      onChange={(v: string) => (admin ? setBranchPick(v) : setView(v as ListView))}
      kpis={[
        { label: "Waiting", icon: Clock3, value: formatCount(waiting.length), caption: `${formatCount(waiting.filter((r) => r.urgency !== "Routine").length)} urgent`, tone: waiting.length ? "danger" : undefined },
        { label: "Sent today", icon: CalendarDays, value: formatCount(today.length), caption: `${formatCount(today.filter((r) => r.status === "attended").length)} attended so far` },
        { label: "Attended this week", icon: BadgeCheck, value: `${week.length ? Math.round((attended / week.length) * 100) : 0}%`, caption: `${formatCount(attended)} of ${formatCount(week.length)} referrals` },
        { label: "Earlier weeks", icon: History, value: formatCount(earlier.length), caption: `${earlier.length ? Math.round((earlierAtt / earlier.length) * 100) : 0}% attended` },
      ]}
      sideNote="Referrals from the Referrer Portal reach the branch through the cloud connection. Until it is connected, the folder shows sample referrals."
      mainEyebrow={t ? "Search · every week" : `${VIEW_META[view].label} · ${scopeName}`}
      mainTitle={t ? `Results for “${q.trim()}”` : view === "history" ? "Referral history" : VIEW_META[view].label}
      description={
        t
          ? "Searching every week, including the history."
          : view === "waiting"
            ? admin
              ? "Referred patients the branch has not attended yet. Open one to see the details."
              : "When a referred patient walks in, find them here and start their bill. Search by the name they give you."
            : view === "history"
              ? "Earlier weeks and their status. A past week's referral nobody updated closed as Not attended."
              : VIEW_META[view].hint
      }
      onClose={onClose}
    >
      <>
        <div className="spm-tools">
          <SearchInput placeholder="Patient name, phone, referral ID, test or PR agent" value={q} onChange={setQ} />
          {admin && (
            <Segmented
              label="Show"
              value={view}
              onChange={setView}
              options={[
                { value: "waiting", label: "Waiting" },
                { value: "attended", label: "Attended" },
                { value: "week", label: "This week" },
                { value: "history", label: "History" },
              ]}
            />
          )}
        </div>
        {view === "history" && !t && (
          <div className="spm-tools rf-dates">
            <Segmented
              label="Dates"
              value={when}
              onChange={setWhen}
              options={[
                { value: "any", label: "Any date" },
                { value: "last", label: "Last week" },
                { value: "month", label: "This month" },
                { value: "4w", label: "Last 4 weeks" },
                { value: "custom", label: "Choose dates" },
              ]}
            />
            {when === "custom" && (
              <span className="rf-range">
                <label>
                  From <input type="date" className="input" value={from} max={to || isoDate(new Date())} onChange={(e) => setFrom(e.target.value)} />
                </label>
                <label>
                  To <input type="date" className="input" value={to} min={from || undefined} max={isoDate(new Date())} onChange={(e) => setTo(e.target.value)} />
                </label>
              </span>
            )}
          </div>
        )}

        <div className="spm-table-card">
          <div className="spm-table-head">
            <span>
              <b>{formatCount(rows.length)}</b> referral{rows.length === 1 ? "" : "s"} · <b>{money(rows.reduce((s, r) => s + totalOf(r), 0))}</b> in tests
            </span>
            <small>Newest first</small>
          </div>
          <div className="table-wrap thin-scroll">
            <table className="bp-table rf-table bd-table spm-table" aria-label="Referrals">
              <thead>
                <tr>
                  <th>Sent</th>
                  <th>Patient · referral ID</th>
                  <th>Tests</th>
                  <th>Referred by</th>
                  <th>Status</th>
                  <th className="num">Est. total</th>
                  {canBill && !admin && <th aria-label="Action" />}
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <EmptyState title={t ? `No referral matches “${q.trim()}”` : view === "waiting" ? "No one is waiting" : "Nothing here yet"}>
                        {t ? "Ask the patient if they were given a referral ID. If not, start a new patient bill." : "New referrals from PR agents appear here the moment they are sent."}
                      </EmptyState>
                    </td>
                  </tr>
                ) : (
                  visible.map((r) => (
                    <tr key={`${r.id}|${r.branchId}`} className="pr-row" tabIndex={0} onClick={() => setDetail(`${r.id}|${r.branchId}`)} onKeyDown={(k) => (k.key === "Enter" || k.key === " ") && (k.preventDefault(), setDetail(`${r.id}|${r.branchId}`))}>
                      <td className="num">
                        <strong>{isoDate(r.sentAt) === isoDate(new Date()) ? formatTime(r.sentAt) : formatShortDate(r.sentAt)}</strong>
                        <small className="ep-sub">{ago(r.sentAt)}</small>
                      </td>
                      <td>
                        <span className="rf-cell-patient">
                          <i className={`rf-dot is-${r.urgency.toLowerCase()}`} title={r.urgency} />
                          <span>
                            <strong>{r.patient.name}</strong>
                            <small className="ep-sub">
                              <span className="mono">{r.id}</span> · {r.patient.gender}, {r.patient.age}
                              {multi ? ` · ${getBranch(r.branchId)?.name ?? ""}` : ""}
                            </small>
                          </span>
                        </span>
                      </td>
                      <td className="bd-pm-tests" title={r.services.map((s) => s.name).join(", ")}>
                        {r.services[0]?.name}
                        {r.services.length > 1 && <small> + {r.services.length - 1} more</small>}
                      </td>
                      <td>
                        {r.agentName}
                        <small className="ep-sub">{r.hospital}</small>
                      </td>
                      <td>
                        <Badge tone={r.urgency !== "Routine" && r.status === "waiting" ? URGENCY_TONE[r.urgency] : STATUS_TONE[r.status]}>{r.status === "waiting" && r.urgency !== "Routine" ? `${r.urgency} · waiting` : statusLabel(r)}</Badge>
                        {r.attended?.invoiceNo && <small className="ep-sub mono">{r.attended.invoiceNo}</small>}
                        {r.status === "coming" && r.update?.date && <small className="ep-sub">{dayText(r.update.date)}</small>}
                      </td>
                      <td className="num">
                        <strong>{money(totalOf(r))}</strong>
                        {r.priceAsk && <small className="ep-sub">asks {money(r.priceAsk.amount)} off</small>}
                      </td>
                      {canBill && !admin && (
                        <td className="rf-td-go">
                          {(r.status === "waiting" || r.status === "coming" || r.status === "billing") && onStart && (
                            <button
                              type="button"
                              className="rf-row-go"
                              onClick={(e) => {
                                e.stopPropagation();
                                onStart(r);
                              }}
                            >
                              {r.status === "billing" ? "Continue bill" : "Start bill"} <ArrowRight size={14} />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={safe} pageSize={size} sizes={[10, 25, 50]} total={rows.length} noun="referrals" onPage={(p) => setPage(Math.min(Math.max(1, p), pages))} onPageSize={(s) => (setSize(s), setPage(1))} />
        </div>
      </>
      {current && <ReferralDetail r={current} canBill={canBill && !admin} admin={admin} onStart={onStart} onClose={() => setDetail(null)} />}
    </SideModal>
  );
}

/* ─────────────── one referral ─────────────── */

function ReferralDetail({ r, canBill, admin, onStart, onClose }: { r: Incoming; canBill: boolean; admin?: boolean; onStart?: (r: Incoming) => void; onClose: () => void }) {
  const { showToast } = useApp();
  const [statusOpen, setStatusOpen] = useState(false);
  const branch = getBranch(r.branchId);
  const contact = useBranchContact()(r.branchId);
  const money = (n: number) => formatMoney(n, branch?.currency ?? "NGN");
  const canUpdate = !admin && r.status !== "attended" && r.status !== "billing";
  const copy = () => {
    void navigator.clipboard?.writeText(r.id).catch(() => {});
    showToast(`Referral ID ${r.id} copied`);
  };
  const footer = admin ? (
    <div className="rf-foot">
      <span className="rf-foot-note">
        <UserRound size={15} /> Ask the {branch?.name} branch: {contact.manager}
        {contact.phone ? ` · ${contact.phone}` : ""}
      </span>
      <button type="button" className="bl-btn" onClick={onClose}>
        Close
      </button>
    </div>
  ) : r.status === "attended" ? undefined : (
    <div className="rf-foot">
      {canUpdate && (
        <button type="button" className="bl-btn" onClick={() => setStatusOpen(true)}>
          <ListChecks size={16} /> Update status
        </button>
      )}
      {canBill && onStart && (
        <button type="button" className="bl-btn is-primary is-lg" onClick={() => onStart(r)}>
          {r.status === "billing" ? "Continue the bill" : "Continue to billing"} <ArrowRight size={17} />
        </button>
      )}
    </div>
  );
  return (
    <>
      <Modal open onClose={onClose} title={r.patient.name} description={`Referral ${r.id} · sent ${ago(r.sentAt)} · ${branch?.name ?? ""} branch`} icon={FolderOpen} xl footer={footer}>
        <div className="rf-detail">
          <div className={`rf-hero is-${r.status === "waiting" ? r.urgency.toLowerCase() : r.status === "attended" ? "done" : "other"}`}>
            <FolderOpen className="rf-hero-mark" size={150} strokeWidth={1.1} aria-hidden="true" />
            <span className="rf-hero-avatar">{initials(r.patient.name)}</span>
            <span className="rf-hero-text">
              <span className="rf-hero-badges">
                {r.status === "waiting" ? (
                  <Badge tone={URGENCY_TONE[r.urgency]}>
                    {r.urgency === "Routine" ? <Clock3 size={13} /> : <Siren size={13} />} {r.urgency} · waiting
                  </Badge>
                ) : (
                  <Badge tone={STATUS_TONE[r.status]}>
                    {r.status === "attended" && <BadgeCheck size={13} />} {statusLabel(r)}
                  </Badge>
                )}
              </span>
              <b>{r.patient.name}</b>
              <small>
                {r.patient.gender}, {r.patient.age} years · <Phone size={13} /> {r.patient.phone}
              </small>
            </span>
            <span className="rf-id">
              <small>Referral ID</small>
              <b className="mono">{r.id}</b>
              <button type="button" onClick={copy}>
                <Copy size={14} /> Copy
              </button>
            </span>
          </div>

          <div className="rf-facts">
            <span>
              <CalendarDays size={16} />
              <small>Sent</small>
              <b>
                {formatShortDate(r.sentAt)}, {formatTime(r.sentAt)}
              </b>
            </span>
            <span>
              <ListChecks size={16} />
              <small>Tests</small>
              <b>{r.services.length}</b>
            </span>
            <span>
              <Hash size={16} />
              <small>Estimated total</small>
              <b className="num">{money(totalOf(r))}</b>
            </span>
            <span>
              <Siren size={16} />
              <small>Urgency</small>
              <b>{r.urgency}</b>
            </span>
          </div>
          <div className="rf-detail-grid">
            <div className="rf-col">
              <section className="rf-card">
                <h3>
                  <i><ListChecks size={14} /></i> Tests requested
                </h3>
                <ul className="rf-tests">
                  {r.services.map((s) => (
                    <li key={s.id}>
                      <span>
                        <b>{s.name}</b>
                        <small>{s.category}</small>
                      </span>
                      <strong className="num">{money(s.price)}</strong>
                    </li>
                  ))}
                  <li className="rf-tests-total">
                    <span>Estimated total</span>
                    <strong className="num">{money(totalOf(r))}</strong>
                  </li>
                </ul>
                {r.priceAsk && (
                  <div className="rf-ask">
                    <b>The PR agent asked for {money(r.priceAsk.amount)} off</b>
                    <p>{r.priceAsk.reason}</p>
                    <small>It is filled in as a discount when the bill is started. The Branch Manager approves it.</small>
                  </div>
                )}
              </section>
              {(r.indication || r.note || r.voiceNote) && (
                <section className="rf-card is-note">
                  <h3>
                    <i><Stethoscope size={14} /></i> From the referrer
                  </h3>
                  {r.indication && (
                    <p className="rf-line">
                      <Stethoscope size={16} />
                      <span>
                        <b>Reason for the tests:</b> {r.indication}
                      </span>
                    </p>
                  )}
                  {r.note && (
                    <p className="rf-line">
                      <ListChecks size={16} />
                      <span>
                        <b>Note:</b> {r.note}
                      </span>
                    </p>
                  )}
                  {r.voiceNote && <VoiceNote seed={Number(r.id.replace(/\D/g, ""))} duration={r.voiceNote.duration} by={r.agentName} />}
                </section>
              )}
            </div>

            <div className="rf-col">
              <section className="rf-card">
                <h3>
                  <i><UserRound size={14} /></i> Referred by
                </h3>
                <div className="rf-person">
                  <span className="rf-avatar is-agent">{initials(r.agentName)}</span>
                  <span>
                    <b>{r.agentName}</b>
                    <small>PR agent{r.hospital ? ` · ${r.hospital}` : ""}</small>
                  </span>
                </div>
              </section>
              {(r.update || r.closed || canUpdate) && (
                <section className={`rf-card ${r.update ? "is-update" : ""}`}>
                  <div className="rf-card-row">
                    <h3>
                      <i><Clock3 size={14} /></i> Referral status
                    </h3>
                    {canUpdate && (
                      <button type="button" className="rf-link" onClick={() => setStatusOpen(true)}>
                        Update
                      </button>
                    )}
                  </div>
                  <b className="rf-status-name">{statusLabel(r)}</b>
                  <p className="rf-muted">{r.update ? branchUpdateText(r.update) : r.closed ? "Not updated during its week, so it closed as not attended." : "No update yet. Set one if the patient will come later or will not come."}</p>
                  {r.update && (
                    <small className="rf-muted">
                      {r.update.by.name}, {r.update.by.role} · {formatShortDate(new Date(r.update.at))}, {formatTime(new Date(r.update.at))} · the PR agent sees this
                    </small>
                  )}
                </section>
              )}
              <section className="rf-card">
                <h3>
                  <i><BadgeCheck size={14} /></i> Progress
                </h3>
                <ol className="rf-steps">
                  <Step on title="Referral sent" sub={`${formatShortDate(r.sentAt)}, ${formatTime(r.sentAt)} by ${r.agentName}`} />
                  {r.update ? (
                    <Step on title={STATUS_TEXT[r.update.status]} sub={branchUpdateText(r.update)} />
                  ) : (
                    <Step on={r.status === "billing" || r.status === "attended"} title={r.status === "billing" || r.status === "attended" ? "Patient arrived, bill started" : r.closed ? "Closed as not attended" : "Waiting for the patient to arrive"} sub={r.status === "waiting" ? "Start the bill when they come in" : undefined} />
                  )}
                  <Step on={r.status === "attended"} title="Attended" sub={r.attended ? `${formatTime(r.attended.at)}${r.attended.invoiceNo ? ` · ${r.attended.invoiceNo}` : ""}${r.attended.by ? ` · ${r.attended.by}` : ""}` : "Saved bill with this referral ID"} />
                </ol>
              </section>
            </div>
          </div>
        </div>
      </Modal>
      {statusOpen && <StatusDialog r={r} onClose={() => setStatusOpen(false)} />}
    </>
  );
}

function Step({ on, title, sub }: { on: boolean; title: string; sub?: string }) {
  return (
    <li className={on ? "is-on" : ""}>
      <i aria-hidden="true">{on && <Check size={11} strokeWidth={3} />}</i>
      <b>{title}</b>
      {sub && <small>{sub}</small>}
    </li>
  );
}

/** The referrer's voice note: play, pause, a waveform that fills as it plays, and the time left. */
function VoiceNote({ seed, duration, by }: { seed: number; duration: number; by: string }) {
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  useEffect(() => {
    if (!playing) return;
    const t = window.setInterval(() => setPos((p) => (p + 0.1 >= duration ? (setPlaying(false), 0) : p + 0.1)), 100);
    return () => window.clearInterval(t);
  }, [playing, duration]);
  const bars = Array.from({ length: 44 }, (_, i) => 6 + (hash(seed * 31 + i) % 22));
  const done = pos / duration;
  const fmt = (n: number) => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, "0")}`;
  return (
    <div className="rf-voice">
      <button type="button" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause the voice note" : "Play the voice note"}>
        {playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
      </button>
      <span className="rf-wave" aria-hidden="true">
        {bars.map((h, i) => (
          <i key={i} className={i / bars.length < done ? "is-on" : ""} style={{ height: h }} />
        ))}
      </span>
      <small>
        Voice note from {by} · {fmt(playing || pos ? duration - pos : duration)}
      </small>
    </div>
  );
}

/* ─────────────── status update ─────────────── */

const CHOICES: { k: BranchUpdateKind | "waiting"; title: string; sub: string; icon: LucideIcon }[] = [
  { k: "waiting", title: "Still waiting", sub: "No news yet. Keeps it in the folder.", icon: Clock3 },
  { k: "coming", title: "Coming later", sub: "The patient said when they will come", icon: CalendarClock },
  { k: "no_show", title: "Did not come", sub: "Closes it as not attended", icon: Users },
  { k: "cancelled", title: "Cancelled", sub: "The patient or the referrer cancelled", icon: CircleX },
];

/** The front desk or manager says what happened. The PR agent sees it on their request. */
function StatusDialog({ r, onClose }: { r: Incoming; onClose: () => void }) {
  const { user, showToast } = useApp();
  const [k, setK] = useState<BranchUpdateKind | "waiting">(r.update?.status ?? "waiting");
  const [date, setDate] = useState(r.update?.date ?? "");
  const [note, setNote] = useState(r.update?.note ?? "");
  const [tried, setTried] = useState(false);
  const err = k === "coming" && !date ? "Choose the day the patient said they will come." : k === "cancelled" && note.trim().length < 3 ? "Say why it was cancelled." : null;
  const save = () => {
    if (err) return setTried(true);
    setBranchUpdate(r.id, k === "waiting" ? null : { status: k, date: k === "coming" ? date : undefined, note: note.trim() || undefined, by: { name: user.name, role: user.role }, at: new Date().toISOString() });
    logAudit({ category: "PR agents", action: k === "waiting" ? "Referral status cleared" : `Referral status: ${STATUS_TEXT[k]}`, record: `${r.patient.name} (${r.id})`, details: [k === "coming" && date ? `coming on ${date}` : "", note.trim(), `referred by ${r.agentName}`].filter(Boolean).join(" · "), branchId: r.branchId });
    showToast(k === "waiting" ? "Status cleared" : `${STATUS_TEXT[k]} saved. ${r.agentName} can see it.`);
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Referral status"
      description={`${r.patient.name} · ${r.id} · the PR agent who referred the patient sees this status`}
      footer={
        <>
          <button type="button" className="bl-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="bl-btn is-primary" onClick={save}>
            Save status
          </button>
        </>
      }
    >
      <div className="rf-choices" role="radiogroup" aria-label="Status">
        {CHOICES.map((c) => (
          <button key={c.k} type="button" role="radio" aria-checked={k === c.k} className={k === c.k ? "is-on" : ""} onClick={() => setK(c.k)}>
            <span className="rf-choice-icon">
              <c.icon size={18} />
            </span>
            <span>
              <b>{c.title}</b>
              <small>{c.sub}</small>
            </span>
            <i aria-hidden="true">{k === c.k && <Check size={12} strokeWidth={3} />}</i>
          </button>
        ))}
      </div>
      {k === "coming" && (
        <label className={`field rf-field ${tried && !date ? "is-error" : ""}`}>
          The day they will come
          <input type="date" value={date} min={isoDate(new Date())} onChange={(e) => setDate(e.target.value)} />
        </label>
      )}
      {k !== "waiting" && (
        <label className={`field rf-field ${tried && k === "cancelled" && note.trim().length < 3 ? "is-error" : ""}`}>
          {k === "cancelled" ? "Reason" : "Note (optional)"}
          <textarea value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder={k === "coming" ? "For example: will come after work on Friday" : k === "no_show" ? "For example: called twice, no answer" : "For example: the doctor changed the tests"} />
        </label>
      )}
      {tried && <FieldError msg={err} />}
    </Modal>
  );
}

/* ─────────────── billing start screen ─────────────── */

/** The folder's strip on the Billing start screen: who is waiting, and the list. */
export function BillingReferralsStrip({ branch, onStart }: { branch: Branch; onStart: (r: Incoming) => void }) {
  const ids = useMemo(() => [branch.id], [branch.id]);
  const all = useIncomingMany(ids);
  const waiting = thisWeek(all).filter(isOpen);
  const [open, setOpen] = useState(false);
  const urgent = waiting.filter((r) => r.urgency !== "Routine").length;
  return (
    <>
      <button type="button" className={`rf-strip ${waiting.length ? "has-waiting" : ""}`} onClick={() => setOpen(true)}>
        <span className="rf-strip-icon" aria-hidden="true">
          <FolderOpen size={22} />
          {waiting.length > 0 && <em>{waiting.length > 99 ? "99+" : waiting.length}</em>}
        </span>
        <span className="rf-strip-text">
          <b>{waiting.length ? `${formatCount(waiting.length)} referred patient${waiting.length === 1 ? "" : "s"} waiting` : "No referred patient is waiting"}</b>
          <small>{waiting.length ? `${urgent ? `${urgent} urgent · ` : ""}newest ${ago(waiting[0]!.sentAt)}. When one walks in, start their bill from the folder: everything is filled in.` : "Referrals from PR agents appear here the moment they are sent."}</small>
        </span>
        <span className="rf-strip-go">
          Open the folder <ArrowRight size={15} />
        </span>
      </button>
      {open && (
        <ReferralsModal
          branchIds={ids}
          list={all}
          initial="waiting"
          canBill
          onStart={(r) => {
            setOpen(false);
            onStart(r);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/* ─────────────── Company Admin dashboard ─────────────── */

/**
 * Every branch's referrals in one compact section (owner, 2026-11-26): the
 * folder for all branches, who is waiting now (with the branch), and a short
 * table of how each branch is attending to its referrals. The admin views;
 * the branch bills.
 */
export function CompanyReferralsSection({ branchIds }: { branchIds: string[] }) {
  const all = useIncomingMany(branchIds);
  const week = thisWeek(all);
  const contactOf = useBranchContact();
  const [open, setOpen] = useState<string | null>(null);
  const [history, setHistory] = useState(false);
  const [finding, setFinding] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const today = isoDate(new Date());
  const waiting = week.filter(isOpen);
  const late = waiting.filter((r) => Date.now() - r.sentAt.getTime() > 4 * 3_600_000).length;
  const attended = week.filter((r) => r.status === "attended").length;
  const sentToday = week.filter((r) => isoDate(r.sentAt) === today);
  const rows = branchIds
    .map((id) => {
      const mine = week.filter((r) => r.branchId === id);
      const w = mine.filter(isOpen);
      const st = mine.filter((r) => isoDate(r.sentAt) === today);
      const oldest = w.reduce<Incoming | null>((o, r) => (!o || r.sentAt < o.sentAt ? r : o), null);
      return { id, b: getBranch(id)!, mine, waiting: w, sentToday: st.length, doneToday: st.filter((r) => r.status === "attended").length, oldest, urgent: w.filter((r) => r.urgency !== "Routine").length };
    })
    .sort((a, b) => b.waiting.length - a.waiting.length);
  const current = detail ? (all.find((r) => `${r.id}|${r.branchId}` === detail) ?? null) : null;
  const multi = branchIds.length > 1;

  return (
    <Reveal as="section" className="bd-sec rf-sec">
      <header className="bd-sec-head">
        <div>
          <span className="bd-eyebrow">Incoming referrals</span>
          <h2>Referred patients{multi ? ", branch by branch" : ""}</h2>
          <p>What PR agents sent this week and how quickly {multi ? "each branch attends" : "the branch attends"} to it. The admin views; the branch bills.</p>
        </div>
        <div className="rf-head-actions">
          <button type="button" className="bd-head-link" onClick={() => setHistory(true)}>
            <History size={16} /> Referral history
          </button>
          <button type="button" className="bd-head-link" onClick={() => setFinding(true)}>
            <Hash size={16} /> Find a referral ID
          </button>
        </div>
      </header>

      <div className="rf-layout">
        <Folder waiting={waiting} onOpen={() => setOpen("all")} empty={`Every referral is attended · ${branchIds.length} branch${branchIds.length === 1 ? "" : "es"}`} sub={late ? `${formatCount(late)} waiting over 4 hours` : undefined} />
        <div className="rf-now">
          <div className="rf-strip-stats">
            <MiniStat icon={Clock3} label="Waiting" value={formatCount(waiting.length)} tone={waiting.length ? "warn" : undefined} onClick={() => setOpen("all")} />
            <MiniStat icon={Siren} label="Over 4 hours" value={formatCount(late)} tone={late ? "danger" : undefined} onClick={() => setOpen("all")} />
            <MiniStat icon={CalendarDays} label="Sent today" value={formatCount(sentToday.length)} onClick={() => setOpen("all")} />
            <MiniStat icon={BadgeCheck} label="Attended this week" value={`${week.length ? Math.round((attended / week.length) * 100) : 0}%`} onClick={() => setOpen("all")} />
          </div>
          <WaitingTable rows={byUrgency(waiting)} total={waiting.length} showBranch onRow={(r) => setDetail(`${r.id}|${r.branchId}`)} onAll={() => setOpen("all")} />
        </div>
      </div>

      <div className="rf-branches">
        <div className="rf-wait-head">
          <b>By branch</b>
          <small>This week · open a branch to see its referrals</small>
        </div>
        <div className="rf-wait-scroll is-short thin-scroll">
        <table className="rf-wait-table rf-branch-table" aria-label="Referrals by branch">
          <thead>
            <tr>
              <th>Branch</th>
              <th className="num">Waiting</th>
              <th>Oldest waiting</th>
              <th>Attended today</th>
              <th>Ask</th>
              <th aria-label="Open" />
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => {
              const rate = x.sentToday ? Math.round((x.doneToday / x.sentToday) * 100) : 100;
              const c = contactOf(x.id);
              return (
                <tr key={x.id} tabIndex={0} onClick={() => setOpen(x.id)} onKeyDown={(k) => (k.key === "Enter" || k.key === " ") && (k.preventDefault(), setOpen(x.id))}>
                  <td>
                    <b>{x.b.name} branch</b>
                    <small>{formatCount(x.mine.length)} referrals this week</small>
                  </td>
                  <td className="num">
                    <span className={`rf-count-chip ${x.waiting.length ? "" : "is-clear"}`}>{x.waiting.length}</span>
                    {x.urgent > 0 && (
                      <Badge tone="danger">
                        <Siren size={12} /> {x.urgent} urgent
                      </Badge>
                    )}
                  </td>
                  <td>{x.oldest ? <span className={Date.now() - x.oldest.sentAt.getTime() > 4 * 3_600_000 ? "rf-late" : ""}>{ago(x.oldest.sentAt)}</span> : <span className="lg-muted">Nothing waiting</span>}</td>
                  <td className="rf-w-rate">
                    <span>
                      {x.doneToday} of {x.sentToday} · {rate}%
                    </span>
                    <span className={`rf-bar ${rate >= 80 ? "is-ok" : rate >= 50 ? "is-warn" : "is-danger"}`}>
                      <i style={{ width: `${rate}%` }} />
                    </span>
                  </td>
                  <td className="rf-w-agent">
                    {c.manager}
                    {c.phone && <small>{c.phone}</small>}
                  </td>
                  <td className="rf-w-go">
                    <span className="rf-row-link">
                      View <ArrowRight size={14} />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      {open && <ReferralsModal branchIds={branchIds} list={all} initial="waiting" initialBranch={open} canBill={false} admin onClose={() => setOpen(null)} />}
      {history && <ReferralsModal branchIds={branchIds} list={all} initial="history" initialBranch="all" canBill={false} admin onClose={() => setHistory(false)} />}
      {current && <ReferralDetail r={current} canBill={false} admin onClose={() => setDetail(null)} />}
      {finding && <FindReferralDialog branchIds={branchIds} list={all} onFound={(r) => (setFinding(false), setDetail(`${r.id}|${r.branchId}`))} onClose={() => setFinding(false)} />}
    </Reveal>
  );
}

/* ─────────────── find a referral by its ID ─────────────── */

/**
 * "Enter a referral ID" (owner, 2026-11-26): a pop-up, not a trip to Billing.
 * A referral in the folder opens its details; a referred patient already
 * registered at the branch (`onRegistered`) continues in Billing.
 */
function FindReferralDialog({ branchIds, list, onFound, onRegistered, onClose }: { branchIds: string[]; list: Incoming[]; onFound: (r: Incoming) => void; onRegistered?: (id: string) => void; onClose: () => void }) {
  const one = branchIds.length === 1 ? branchIds[0]! : null;
  const prefix = one ? `${branchPrefix(one)}-R` : "";
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const full = one ? `${prefix}${value.replace(/\D/g, "").padStart(6, "0")}` : value.trim().toUpperCase();
  const find = () => {
    if (one ? value.replace(/\D/g, "").length !== 6 : !/^[A-Z]{3}-R\d{6}$/.test(full)) {
      setError(one ? "Enter all six digits of the referral ID." : "Enter the whole referral ID, for example ABJ-R000123.");
      return;
    }
    const r = findIncoming(list, full);
    if (r) return onFound(r);
    if (one && onRegistered && lookupReferral(one, full)) return onRegistered(full);
    setError(`Referral ${full} was not found. Check the number, or the referral may not have reached the branch yet (the PR agent's phone needs internet to send it).`);
  };
  return (
    <Modal
      open
      onClose={onClose}
      icon={Hash}
      title="Find a referral"
      description={one ? `Type the six digits on the patient's slip or message. The ${getBranch(one)?.name ?? ""} prefix (${prefix}) is filled in.` : "Type the referral ID on the patient's slip or message."}
      footer={
        <>
          <button type="button" className="bl-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="bl-btn is-primary" onClick={find}>
            Find referral <ArrowRight size={16} />
          </button>
        </>
      }
    >
      <form
        className="rf-find"
        onSubmit={(e) => {
          e.preventDefault();
          find();
        }}
      >
        <label className={`rf-find-box ${error ? "is-error" : ""}`}>
          <Hash size={20} />
          {one && <span className="mono rf-find-prefix">{prefix}</span>}
          <input
            className="mono"
            value={value}
            autoFocus
            inputMode={one ? "numeric" : "text"}
            maxLength={one ? 6 : 12}
            placeholder={one ? "000000" : "ABJ-R000000"}
            aria-label="Referral ID"
            onChange={(e) => {
              setValue(one ? e.target.value.replace(/\D/g, "").slice(0, 6) : e.target.value.toUpperCase());
              setError(null);
            }}
          />
        </label>
        <FieldError msg={error} />
        <p className="rf-muted">The patient's details, the PR agent and the requested tests come up, ready to continue to billing.</p>
      </form>
    </Modal>
  );
}
