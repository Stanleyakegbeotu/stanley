/**
 * Branch Expenses (owner spec, 2026-11-22): where the branch records what it
 * spends, how much, and who approved it.
 *
 *  • Record expense → ExpenseForm. Approval is always stated: either who
 *    already approved it, or "send for approval".
 *  • Awaiting approval: the Branch Manager approves / rejects (reason required);
 *    other staff see their own requests waiting.
 *  • Filters (period incl. from–to, category, status, source, search), totals,
 *    spend by category, spend by approver, and the full table. Every row opens
 *    the expense record (receipt photo, approval and history, actions).
 *
 * Demo activity expenses (the figures the dashboard and Finance use) are listed
 * too, read-only, so totals match those pages; expenses recorded in STANLEY are
 * marked and are not yet added to the dashboard / Finance totals.
 */
import { useMemo, useState } from "react";
import { BadgeCheck, Banknote, Check, CircleAlert, Hourglass, Pencil, Plus, Receipt, ShieldCheck, Trash2, X, XCircle } from "lucide-react";
import { useApp } from "@/app/AppState";
import type { Branch, PeriodSelection } from "@/data/types";
import { expenseLines, type ExpenseLine } from "@/data/demo/dailyLines";
import { isoDate } from "@/data/demo/generator";
import { RECORD_CATEGORIES, retained, approveExpense, expenseSyncQueue, rejectExpense, useExpenses, type ExpenseRecord, type ExpenseStatus, type Person } from "@/services/expenses";
import { AnimatedPage, Reveal } from "@/shared/motion";
import { formatCount, formatMoney } from "@/shared/format";
import { Badge, Button, EmptyState, SelectMenu } from "@/shared/ui/controls";
import { FieldError, focusFirstError } from "@/shared/ui/FieldError";
import { Modal } from "@/shared/ui/Modal";
import { Pagination } from "@/shared/ui/Pagination";
import { PageHero } from "@/features/shared/PageHero";
import { FilterBar, SummaryChips, useModalFilters } from "@/features/dashboard/ExpensesPatients";
import { rangeText } from "@/features/dashboard/WelcomeBanner";
import { MoveToTrashDialog } from "@/features/admin/AdminLogs";
import { dataErr } from "@/features/settings/ProfileCard";
import { periodLabel } from "@/services/analytics";
import { ExpenseForm } from "./ExpenseForm";
import { can, usePermissions as useRolePermissions } from "@/services/permissions";
import { categoryIcon } from "./categoryIcons";

/* ─────────────── One row for both sources ─────────────── */

export interface ExpenseRow {
  id: string;
  branchId: string;
  at: Date;
  date: string;
  category: string;
  description: string;
  amount: number;
  method: string | null;
  paidTo: string;
  recordedBy: Person | null;
  approvedBy: Person | null;
  status: ExpenseStatus;
  source: "stanley" | "demo";
  rec?: ExpenseRecord;
  line?: ExpenseLine;
}

const fromRecord = (r: ExpenseRecord): ExpenseRow => {
  const rec = new Date(r.recordedAt);
  const at = isoDate(rec) === r.date ? rec : new Date(`${r.date}T12:00:00`);
  return { id: r.id, branchId: r.branchId, at, date: r.date, category: r.category, description: r.description, amount: r.amount, method: r.method, paidTo: r.paidTo, recordedBy: r.recordedBy, approvedBy: r.approvedBy, status: r.status, source: "stanley", rec: r };
};
/** Demo activity lines: approved by the branch manager; names were never recorded, so none are shown. */
const DEMO_APPROVER: Person = { name: "Branch Manager", role: "demo activity" };
const fromLine = (l: ExpenseLine): ExpenseRow => ({ id: l.id, branchId: l.branchId, at: l.at, date: isoDate(l.at), category: l.category, description: l.description, amount: l.amount, method: null, paidTo: "", recordedBy: null, approvedBy: DEMO_APPROVER, status: "Approved", source: "demo", line: l });

const naira = (n: number, compact = false) => formatMoney(n, "NGN", compact);
const dayText = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const timeText = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const STATUS_TONE: Record<ExpenseStatus, "ok" | "warn" | "danger"> = { Approved: "ok", Pending: "warn", Rejected: "danger" };
const STATUS_LABEL: Record<ExpenseStatus, string> = { Approved: "Approved", Pending: "Awaiting approval", Rejected: "Rejected" };

function usePermissions() {
  const { user } = useApp();
  // Settings → Roles & Permissions: "Approve or reject expenses".
  useRolePermissions();
  const canApprove = can(user.role, "expenses.approve");
  const mine = (r: ExpenseRecord) => r.recordedBy.name === user.name;
  return {
    canApprove,
    canEdit: (r: ExpenseRecord) => r.status !== "Approved" && (canApprove || mine(r)),
    canTrash: (r: ExpenseRecord) => canApprove || (mine(r) && r.status !== "Approved"),
    me: { name: user.name, role: user.role } as Person,
  };
}

/* ─────────────── Page ─────────────── */

const BASE_PERIOD: PeriodSelection = { key: "month" };

export function ExpensesPage({ branch }: { branch: Branch }) {
  const { user } = useApp();
  const all = useExpenses();
  const perms = usePermissions();
  const recorded = useMemo(() => all.filter((r) => r.branchId === branch.id), [all, branch.id]);
  const f = useModalFilters(BASE_PERIOD, [branch.id]);
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState<"all" | ExpenseStatus>("all");
  const [source, setSource] = useState<"all" | "stanley" | "demo">("all");
  const [form, setForm] = useState<{ n: number; editing: ExpenseRecord | null } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<ExpenseRecord | null>(null);

  const from = isoDate(f.range.from);
  const to = isoDate(f.range.to);
  const periodRows = useMemo(() => {
    const demo = expenseLines([branch.id], f.range).map(fromLine);
    const mine = recorded.filter((r) => r.date >= from && r.date <= to).map(fromRecord);
    return [...mine, ...demo].sort((a, b) => b.at.getTime() - a.at.getTime());
  }, [branch.id, f.range, recorded, from, to]);

  const needle = f.q.trim().toLowerCase();
  const rows = periodRows.filter(
    (r) =>
      (category === "all" || r.category === category) &&
      (status === "all" || r.status === status) &&
      (source === "all" || r.source === source) &&
      (!needle || `${r.id} ${r.description} ${r.category} ${r.paidTo} ${r.method ?? ""} ${r.recordedBy?.name ?? ""} ${r.approvedBy?.name ?? ""} ${r.rec?.reference ?? ""} ${r.rec?.notes ?? ""}`.toLowerCase().includes(needle)),
  );
  const approvedRows = rows.filter((r) => r.status === "Approved");
  const spent = approvedRows.reduce((s, r) => s + r.amount, 0);
  const spentRecorded = approvedRows.filter((r) => r.source === "stanley").reduce((s, r) => s + r.amount, 0);
  const pendingAll = recorded.filter((r) => r.status === "Pending").sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  const pendingShown = perms.canApprove ? pendingAll : pendingAll.filter((r) => r.recordedBy.name === user.name);
  const pendingAmount = pendingAll.reduce((s, r) => s + r.amount, 0);
  const largest = [...approvedRows].sort((a, b) => b.amount - a.amount)[0];
  const queued = expenseSyncQueue(recorded).length;

  const pages = Math.max(1, Math.ceil(rows.length / f.pageSize));
  const page = Math.min(f.page, pages);
  const visible = rows.slice((page - 1) * f.pageSize, page * f.pageSize);
  const dirty = category !== "all" || status !== "all" || source !== "all";
  const openRow = openId ? (periodRows.find((r) => r.id === openId) ?? (recorded.find((r) => r.id === openId) ? fromRecord(recorded.find((r) => r.id === openId)!) : null)) : null;
  const startForm = (editing: ExpenseRecord | null = null) => setForm((x) => ({ n: (x?.n ?? 0) + 1, editing }));

  return (
    <AnimatedPage className="ex-page">
      <PageHero
        eyebrow={`Branch operations · ${branch.name} branch`}
        title="Expenses"
        period={false}
        icon={Banknote}
        actions={
          <button type="button" className="ph-btn solid" onClick={() => startForm()}>
            <Plus size={18} /> Record expense
          </button>
        }
        strip={[
          { label: `Spent · ${f.isDay ? "selected day" : periodLabel(f.period)}`, value: naira(spent) },
          { label: "Awaiting approval", value: `${formatCount(pendingAll.length)} · ${naira(pendingAmount)}` },
          { label: "Recorded in STANLEY", value: formatCount(recorded.length) },
          { label: "Waiting to sync", value: formatCount(queued) },
          { label: "Approval", value: "Every expense names its approver" },
        ]}
      />

      {pendingShown.length > 0 && (
        <ApprovalQueue
          items={pendingShown}
          canApprove={perms.canApprove}
          onOpen={setOpenId}
          onApprove={(r) => approveExpense(r.id, perms.me)}
          onReject={setRejecting}
          total={pendingAll.length}
        />
      )}

      <FilterBar
        f={f}
        basePeriod={BASE_PERIOD}
        branchSelect={false}
        allowRange
        searchPlaceholder="Description, supplier, person, receipt no. or ID"
        dirty={dirty}
        onReset={() => {
          f.setPeriod(BASE_PERIOD);
          f.setQ("");
          setCategory("all");
          setStatus("all");
          setSource("all");
          f.setPage(1);
        }}
        extra={
          <>
            <div className="rf-filter">
              <span>Category</span>
              <SelectMenu
                value={category}
                ariaLabel="Category"
                className="select-btn rf-select"
                options={[{ value: "all", label: "All categories" }, ...RECORD_CATEGORIES.map((c) => ({ value: c, label: c }))]}
                onChange={(x: string) => {
                  setCategory(x);
                  f.setPage(1);
                }}
              />
            </div>
            <div className="rf-filter">
              <span>Status</span>
              <SelectMenu
                value={status}
                ariaLabel="Status"
                className="select-btn rf-select"
                options={[
                  { value: "all", label: "Any status" },
                  { value: "Approved", label: "Approved" },
                  { value: "Pending", label: "Awaiting approval" },
                  { value: "Rejected", label: "Rejected" },
                ]}
                onChange={(x: "all" | ExpenseStatus) => {
                  setStatus(x);
                  f.setPage(1);
                }}
              />
            </div>
            <div className="rf-filter">
              <span>Source</span>
              <SelectMenu
                value={source}
                ariaLabel="Source"
                className="select-btn rf-select"
                options={[
                  { value: "all", label: "All expenses" },
                  { value: "stanley", label: "Recorded in STANLEY" },
                  { value: "demo", label: "Demo activity" },
                ]}
                onChange={(x: "all" | "stanley" | "demo") => {
                  setSource(x);
                  f.setPage(1);
                }}
              />
            </div>
          </>
        }
      />

      <div style={{ height: 18 }} />
      <SummaryChips
        items={[
          { label: "Spent (approved)", icon: Banknote, value: naira(spent), caption: spentRecorded ? `${naira(spentRecorded)} recorded in STANLEY` : `${formatCount(approvedRows.length)} approved expense${approvedRows.length === 1 ? "" : "s"}` },
          { label: "Awaiting approval", icon: Hourglass, value: formatCount(pendingAll.length), caption: pendingAll.length ? `${naira(pendingAmount)} not counted yet` : "Nothing waiting", tone: pendingAll.length ? "danger" : undefined },
          { label: "Average expense", icon: Receipt, value: approvedRows.length ? naira(Math.round(spent / approvedRows.length)) : "—", caption: rangeText(f.range) },
          { label: "Largest expense", icon: CircleAlert, value: largest ? naira(largest.amount) : "—", caption: largest ? `${largest.description} · ${dayText(largest.at)}` : "No approved expenses" },
        ]}
      />

      <div className="ex-insights">
        <CategoryBreakdown
          rows={approvedRows}
          active={category}
          onPick={(c) => {
            setCategory((cur) => (cur === c ? "all" : c));
            f.setPage(1);
          }}
        />
        <ApproverBreakdown rows={approvedRows} />
      </div>

      <div className="card bp-card rf-table-card ex-table-card">
        <div className="inv-table-tools">
          <span className="inv-count">
            {formatCount(rows.length)} expense{rows.length === 1 ? "" : "s"} · {rangeText(f.range)} · newest first
          </span>
        </div>
        <div className="table-wrap thin-scroll">
          <table className="bp-table rf-table ex-table" aria-label="Expenses">
            <thead>
              <tr>
                <th>Date</th>
                <th>Expense</th>
                <th>Category</th>
                <th>Paid to · by</th>
                <th className="right">Amount</th>
                <th>Recorded by</th>
                <th>Approved by</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <EmptyState title={periodRows.length ? "No expenses match these filters" : "No expenses in this period"}>
                      {periodRows.length ? undefined : "Use Record expense to add what the branch spent."}
                    </EmptyState>
                  </td>
                </tr>
              ) : (
                visible.map((r) => (
                  <tr key={r.id} className="pr-row" tabIndex={0} onClick={() => setOpenId(r.id)} onKeyDown={(k) => (k.key === "Enter" || k.key === " ") && (k.preventDefault(), setOpenId(r.id))} aria-label={`${r.description}, ${naira(r.amount)} — open`}>
                    <td className="num ep-nowrap">
                      {dayText(r.at)}
                      <small className="ep-sub">{r.source === "stanley" ? `Recorded ${timeText(new Date(r.rec!.recordedAt))}` : timeText(r.at)}</small>
                    </td>
                    <td>
                      <strong>{r.description}</strong>
                      <small className="ep-sub mono">
                        {r.id} {r.source === "stanley" ? <span className="ex-src">STANLEY</span> : <span className="ex-src is-demo">Demo</span>}
                        {r.rec?.receipt && <span className="ex-src">Receipt</span>}
                      </small>
                    </td>
                    <td>
                      {r.category}
                      {r.rec?.outsourced && (
                        <small className="ep-sub">
                          Patient paid {naira(r.rec.outsourced.charged)} · kept {naira(retained(r.rec.outsourced, r.amount))}
                        </small>
                      )}
                    </td>
                    <td>
                      {r.paidTo || <span className="lg-muted">—</span>}
                      <small className="ep-sub">{r.method ?? "Not recorded"}</small>
                    </td>
                    <td className="right num ep-nowrap">
                      <strong>{naira(r.amount)}</strong>
                    </td>
                    <td>{r.recordedBy ? <PersonCell p={r.recordedBy} /> : <span className="lg-muted">Not recorded</span>}</td>
                    <td>{r.approvedBy ? <PersonCell p={r.approvedBy} /> : r.status === "Pending" ? <span className="ex-wait">Waiting for approval</span> : <span className="lg-muted">Not approved</span>}</td>
                    <td>
                      <Badge tone={STATUS_TONE[r.status]} dot>
                        {STATUS_LABEL[r.status]}
                      </Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={f.pageSize} sizes={[10, 25, 50, 100]} total={rows.length} noun="expenses" onPage={(p) => f.setPage(Math.min(Math.max(1, p), pages))} onPageSize={(s) => (f.setPageSize(s), f.setPage(1))} />
      </div>
      <p className="lg-muted al-note">
        <ShieldCheck size={14} /> Only approved expenses count as money spent. Expenses recorded here are saved on this device and queued for cloud sync; the dashboard and Finance totals still use demo activity, so they don't include them yet. Demo activity expenses are read-only.
      </p>

      {form && <ExpenseForm key={form.n} open onClose={() => setForm(null)} branchId={branch.id} editing={form.editing} />}
      {openRow && (
        <ExpenseDetail
          row={openRow}
          onClose={() => setOpenId(null)}
          onEdit={(r) => {
            setOpenId(null);
            startForm(r);
          }}
          onReject={(r) => setRejecting(r)}
        />
      )}
      <RejectDialog record={rejecting} onClose={() => setRejecting(null)} />
    </AnimatedPage>
  );
}

function PersonCell({ p }: { p: Person }) {
  return (
    <span className="ex-person">
      <strong>{p.name}</strong>
      <small className="ep-sub">{p.role}</small>
    </span>
  );
}

/* ─────────────── Approval queue ─────────────── */

function ApprovalQueue({ items, total, canApprove, onOpen, onApprove, onReject }: { items: ExpenseRecord[]; total: number; canApprove: boolean; onOpen: (id: string) => void; onApprove: (r: ExpenseRecord) => void; onReject: (r: ExpenseRecord) => void }) {
  const { showToast } = useApp();
  const sum = items.reduce((s, r) => s + r.amount, 0);
  return (
    <Reveal as="section" className="card ex-queue" aria-label="Awaiting approval">
      <header className="ex-queue-head">
        <span className="ex-queue-icon" aria-hidden="true">
          <Hourglass size={18} />
        </span>
        <div>
          <h3>{canApprove ? `Waiting for your approval · ${items.length}` : `Your expenses waiting for approval · ${items.length}`}</h3>
          <p>{canApprove ? `${naira(sum)} in total. Approve or reject each one — rejected expenses go back to the person who recorded them.` : `${naira(sum)} in total. The Branch Manager approves or rejects them here.`}</p>
        </div>
      </header>
      <ul className="ex-queue-list">
        {items.map((r) => (
          <li key={r.id}>
            <button type="button" className="ex-queue-main" onClick={() => onOpen(r.id)}>
              <strong>{r.description}</strong>
              <small>
                {r.category} · {r.method}
                {r.paidTo ? ` · ${r.paidTo}` : ""} · {dayText(new Date(`${r.date}T12:00:00`))} · by {r.recordedBy.name}
              </small>
            </button>
            <b className="num ex-queue-amt">{naira(r.amount)}</b>
            {canApprove ? (
              <div className="ex-queue-actions">
                <Button size="sm" variant="secondary" onClick={() => onReject(r)} aria-label={`Reject ${r.description}`}>
                  <X size={14} /> Reject
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    onApprove(r);
                    showToast(`${r.description} · ${naira(r.amount)} approved`);
                  }}
                >
                  <Check size={14} /> Approve
                </Button>
              </div>
            ) : (
              <Badge tone="warn" dot>
                Awaiting approval
              </Badge>
            )}
          </li>
        ))}
      </ul>
    </Reveal>
  );
}

/* ─────────────── Breakdowns (single series → one theme colour, direct labels, hover detail) ─────────────── */

function CategoryBreakdown({ rows, active, onPick }: { rows: ExpenseRow[]; active: string; onPick: (c: string) => void }) {
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const data = RECORD_CATEGORIES.map((c) => {
    const list = rows.filter((r) => r.category === c);
    return { label: c, value: list.reduce((s, r) => s + r.amount, 0), count: list.length };
  }).sort((a, b) => b.value - a.value);
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <section className="card ex-panel" aria-label="Spend by category">
      <header className="ex-panel-head">
        <h3>Spend by category</h3>
        <p>Approved expenses in the filtered period · select a bar to filter</p>
      </header>
      {total === 0 ? (
        <p className="ex-none">No approved expenses in this period.</p>
      ) : (
        <ul className="ex-bars">
          {data.map((d) => {
            const pct = total ? Math.round((d.value / total) * 100) : 0;
            return (
              <li key={d.label}>
                <button type="button" className={`ex-bar ${active === d.label ? "is-active" : ""} ${active !== "all" && active !== d.label ? "is-dim" : ""}`} onClick={() => onPick(d.label)} aria-pressed={active === d.label} aria-label={`${d.label}: ${naira(d.value)}, ${pct}% of spend, ${d.count} expenses`}>
                  <span className="ex-bar-label">
                    <BarIcon category={d.label} />
                    {d.label}
                  </span>
                  <span className="ex-bar-track">
                    <i style={{ width: d.value ? `max(3px, ${(d.value / max) * 100}%)` : 0 }} />
                  </span>
                  <span className="ex-bar-value num">{d.value ? naira(d.value, true) : "—"}</span>
                  <span className="ex-tip" role="presentation">
                    <b>{d.label}</b>
                    {naira(d.value)} · {pct}% of spend · {formatCount(d.count)} expense{d.count === 1 ? "" : "s"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function BarIcon({ category }: { category: string }) {
  const Icon = categoryIcon(category);
  return <Icon size={15} className="ex-bar-icon" aria-hidden="true" />;
}

function ApproverBreakdown({ rows }: { rows: ExpenseRow[] }) {
  const map = new Map<string, { p: Person; value: number; count: number; demo: boolean }>();
  for (const r of rows) {
    if (!r.approvedBy) continue;
    const k = `${r.approvedBy.name}|${r.approvedBy.role}`;
    const cur = map.get(k) ?? { p: r.approvedBy, value: 0, count: 0, demo: r.source === "demo" };
    cur.value += r.amount;
    cur.count += 1;
    map.set(k, cur);
  }
  const list = [...map.values()].sort((a, b) => b.value - a.value);
  return (
    <section className="card ex-panel" aria-label="Who approved">
      <header className="ex-panel-head">
        <h3>Who approved</h3>
        <p>Every approved expense, by the person who approved it</p>
      </header>
      {list.length === 0 ? (
        <p className="ex-none">No approved expenses in this period.</p>
      ) : (
        <ul className="ex-approvers">
          {list.map((a) => (
            <li key={`${a.p.name}|${a.p.role}`}>
              <span className="ex-approver-icon" aria-hidden="true">
                {a.demo ? <ShieldCheck size={16} /> : <BadgeCheck size={16} />}
              </span>
              <span className="ex-approver-name">
                <strong>{a.p.name}</strong>
                <small>{a.demo ? "Demo activity — approver names weren't recorded" : a.p.role}</small>
              </span>
              <span className="ex-approver-val">
                <b className="num">{naira(a.value)}</b>
                <small>
                  {formatCount(a.count)} expense{a.count === 1 ? "" : "s"}
                </small>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ─────────────── Expense record pop-up ─────────────── */

function ExpenseDetail({ row, onClose, onEdit, onReject }: { row: ExpenseRow; onClose: () => void; onEdit: (r: ExpenseRecord) => void; onReject: (r: ExpenseRecord) => void }) {
  const { moveExpenseToTrash, showToast } = useApp();
  const perms = usePermissions();
  const [trashing, setTrashing] = useState(false);
  const [bigReceipt, setBigReceipt] = useState(false);
  const r = row.rec;
  const approvalText = !r
    ? "Approved by the Branch Manager (demo activity — the approver's name wasn't recorded)."
    : r.status === "Approved"
      ? r.approval === "stated"
        ? `Approval stated by ${r.recordedBy.name} when recording it.`
        : `Approved in STANLEY on ${dayText(new Date(r.approvedAt!))} at ${timeText(new Date(r.approvedAt!))}.`
      : r.status === "Pending"
        ? "Waiting for the Branch Manager to approve or reject it. It doesn't count as spent yet."
        : `Rejected by ${r.rejectedBy?.name ?? "the approver"}${r.rejectReason ? ` — “${r.rejectReason}”` : ""}. Edit it to resubmit.`;

  return (
    <>
      <Modal
        open
        onClose={onClose}
        wide
        icon={Receipt}
        title={row.description}
        description={`${row.id} · ${row.category}`}
        footer={
          <>
            {r && perms.canTrash(r) && (
              <Button variant="secondary" className="st-trash" onClick={() => setTrashing(true)}>
                <Trash2 size={15} /> Move to trash
              </Button>
            )}
            <span className="left" />
            {r && perms.canEdit(r) && (
              <Button variant="secondary" onClick={() => onEdit(r)}>
                <Pencil size={15} /> {r.status === "Rejected" ? "Edit & resubmit" : "Edit"}
              </Button>
            )}
            {r && r.status === "Pending" && perms.canApprove && (
              <>
                <Button variant="secondary" onClick={() => onReject(r)}>
                  <XCircle size={15} /> Reject
                </Button>
                <Button
                  onClick={() => {
                    approveExpense(r.id, perms.me);
                    showToast(`${r.description} approved`);
                  }}
                >
                  <Check size={15} /> Approve
                </Button>
              </>
            )}
            {!(r && r.status === "Pending" && perms.canApprove) && <Button onClick={onClose}>Done</Button>}
          </>
        }
      >
        <div className="ex-detail-hero">
          <div>
            <span>Amount spent</span>
            <strong className="num">{naira(row.amount)}</strong>
          </div>
          <Badge tone={STATUS_TONE[row.status]} dot>
            {STATUS_LABEL[row.status]}
          </Badge>
        </div>

        <div className={`ex-approval is-${row.status.toLowerCase()}`}>
          <span className="ex-approval-icon" aria-hidden="true">
            {row.status === "Approved" ? <BadgeCheck size={20} /> : row.status === "Pending" ? <Hourglass size={20} /> : <XCircle size={20} />}
          </span>
          <div>
            <b>{row.approvedBy ? `Approved by ${row.approvedBy.name}` : row.status === "Pending" ? "Not approved yet" : "Not approved"}</b>
            <small>
              {row.approvedBy && row.source === "stanley" ? `${row.approvedBy.role} · ` : ""}
              {approvalText}
            </small>
          </div>
        </div>

        {r?.outsourced && (
          <div className="ex-partner">
            <span className="ex-receipt-label">Outsourced to a partner</span>
            <dl>
              <div>
                <dt>Service</dt>
                <dd>{r.outsourced.service}</dd>
              </div>
              <div>
                <dt>Patient</dt>
                <dd>{r.outsourced.patient || "Not recorded"}</dd>
              </div>
              <div>
                <dt>Partner</dt>
                <dd>{r.paidTo}</dd>
              </div>
              <div>
                <dt>Patient paid us</dt>
                <dd className="num">{naira(r.outsourced.charged)}</dd>
              </div>
              <div>
                <dt>Paid to partner</dt>
                <dd className="num">{naira(r.amount)}</dd>
              </div>
              <div className={retained(r.outsourced, r.amount) < 0 ? "is-loss" : "is-kept"}>
                <dt>{retained(r.outsourced, r.amount) < 0 ? "Branch loses" : "Branch keeps"}</dt>
                <dd className="num">{naira(Math.abs(retained(r.outsourced, r.amount)))}</dd>
              </div>
            </dl>
          </div>
        )}

        <dl className="fin-detail">
          <div>
            <dt>Date spent</dt>
            <dd>{dayText(row.at)}</dd>
          </div>
          <div>
            <dt>Category</dt>
            <dd>{row.category}</dd>
          </div>
          <div>
            <dt>Paid by</dt>
            <dd>{row.method ?? "Not recorded"}</dd>
          </div>
          <div>
            <dt>Paid to</dt>
            <dd>{row.paidTo || "Not recorded"}</dd>
          </div>
          <div>
            <dt>Recorded by</dt>
            <dd>
              {r ? (
                <>
                  {r.recordedBy.name}
                  <small>
                    {r.recordedBy.role} · {dayText(new Date(r.recordedAt))} {timeText(new Date(r.recordedAt))}
                  </small>
                </>
              ) : (
                "Not recorded (demo activity)"
              )}
            </dd>
          </div>
          <div>
            <dt>Receipt / invoice no.</dt>
            <dd className="mono">{r?.reference || "—"}</dd>
          </div>
          {r?.notes && (
            <div style={{ gridColumn: "1 / -1" }}>
              <dt>Notes</dt>
              <dd>{r.notes}</dd>
            </div>
          )}
          <div style={{ gridColumn: "1 / -1" }}>
            <dt>Sync</dt>
            <dd>{r ? (r.sync === "queued" ? "Saved on this device · waiting to sync to the cloud" : "Synced") : "Demo activity — part of the dashboard figures"}</dd>
          </div>
        </dl>

        {r?.receipt && (
          <div className="ex-receipt">
            <span className="ex-receipt-label">Receipt photo</span>
            <button type="button" onClick={() => setBigReceipt(true)} aria-label="View the receipt photo larger">
              <img src={r.receipt} alt={`Receipt for ${r.description}`} />
            </button>
          </div>
        )}

        {r && (
          <div className="ex-history">
            <span className="ex-receipt-label">History</span>
            <ol>
              {[...r.history].reverse().map((h, i) => (
                <li key={i}>
                  <b>{h.action}</b>
                  <small>
                    {h.by.name} · {h.by.role} · {dayText(new Date(h.at))} {timeText(new Date(h.at))}
                  </small>
                  {h.note && <p>{h.note}</p>}
                </li>
              ))}
            </ol>
          </div>
        )}
        {!r && <p className="fd-note">Demo activity expenses make up the dashboard and Finance figures. They are read-only and can't be edited or deleted.</p>}
      </Modal>

      {r && (
        <MoveToTrashDialog
          open={trashing}
          name={r.description}
          what="expense"
          onClose={() => setTrashing(false)}
          onConfirm={(reason) => {
            moveExpenseToTrash(r.id, reason);
            setTrashing(false);
            showToast(`${r.description} moved to trash`);
            onClose();
          }}
        />
      )}
      {r?.receipt && (
        <Modal open={bigReceipt} onClose={() => setBigReceipt(false)} wide title="Receipt photo" description={`${r.description} · ${naira(r.amount)}`} footer={<Button onClick={() => setBigReceipt(false)}>Close</Button>}>
          <img src={r.receipt} alt={`Receipt for ${r.description}`} className="ex-receipt-big" />
        </Modal>
      )}
    </>
  );
}

/* ─────────────── Reject (reason required) ─────────────── */

function RejectDialog({ record, onClose }: { record: ExpenseRecord | null; onClose: () => void }) {
  const { showToast } = useApp();
  const perms = usePermissions();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const close = () => {
    setReason("");
    setError("");
    onClose();
  };
  return (
    <Modal
      open={!!record}
      onClose={close}
      icon={XCircle}
      title={record ? `Reject “${record.description}”?` : ""}
      description={record ? `${naira(record.amount)} · recorded by ${record.recordedBy.name}. They can edit it and send it again.` : ""}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (!record) return;
              if (!reason.trim()) {
                setError("Say why it's rejected so the person can fix it.");
                return focusFirstError();
              }
              rejectExpense(record.id, perms.me, reason);
              showToast(`${record.description} rejected`);
              close();
            }}
          >
            <XCircle size={15} /> Reject expense
          </Button>
        </>
      }
    >
      <label className={`rcm-field ${error ? "is-error" : ""}`} {...dataErr(error)}>
        <span>Reason</span>
        <textarea value={reason} maxLength={200} onChange={(e) => (setReason(e.target.value), error && setError(""))} placeholder="e.g. Amount doesn't match the receipt" rows={3} />
        <FieldError msg={error} />
      </label>
    </Modal>
  );
}
