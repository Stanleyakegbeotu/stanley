/**
 * Branch workspace viewer — lets the company admin inspect everything about one
 * branch from a single pop-up, without switching into the branch's own
 * workspace: patients, inventory, staff, PR agents, hospitals, finance and
 * expenses, daily reports and the audit log, all for a chosen period.
 */
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Banknote,
  Boxes,
  Building2,
  CalendarDays,
  ChartLine,
  CircleAlert,
  ClipboardList,
  Download,
  Handshake,
  Hospital,
  LayoutDashboard,
  MapPin,
  Percent,
  Receipt,
  ScrollText,
  TrendingUp,
  UserRound,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { useApp } from "@/app/AppState";
import { NOT_ON_RECORD, getBranch } from "@/data/company";
import { AUDIT, HEADCOUNT, STAFF } from "@/data/demo/records";
import { DAILY, DATA_START, addDays, diffDays, isoDate } from "@/data/demo/generator";
import { expenseLines, patientVisits } from "@/data/demo/dailyLines";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, type DateRange, type PeriodSelection } from "@/data/types";
import { LEGACY_BRANCH_ID, buildHospitalDirectory, hasPhone, hospitalKey } from "@/data/legacy";
import { CATALOGUE_INVENTORY } from "@/data/catalogueRules";
import { useMotionPreset } from "@/shared/motion";
import { formatCount, formatMoney, formatPct, formatShortDate, formatTime } from "@/shared/format";
import { Badge, Button, EmptyState, SearchInput, Segmented, SelectMenu } from "@/shared/ui/controls";
import { Pagination } from "@/shared/ui/Pagination";
import { SummaryChips } from "@/features/dashboard/ExpensesPatients";
import { rangeText } from "@/features/dashboard/WelcomeBanner";
import { InventoryCatalog } from "@/features/inventory/InventoryCatalog";
import { TODAY, agentRanking, hospitalRanking, paymentMix, periodLabel, resolveRange, serviceRanking, summarize } from "@/services/analytics";

type Tab = "overview" | "patients" | "inventory" | "staff" | "agents" | "hospitals" | "finance" | "reports" | "audit";

const PERIODS: { value: PeriodSelection["key"]; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
];

/* ─────────────── Generic paginated table ─────────────── */

interface Column<T> {
  label: string;
  align?: "right";
  render: (row: T) => ReactNode;
}

function DataTable<T>({ rows, columns, rowKey, empty, noun, resetKey }: { rows: T[]; columns: Column<T>[]; rowKey: (r: T, i: number) => string; empty: string; noun: string; resetKey: string }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [lastKey, setLastKey] = useState(resetKey);
  if (lastKey !== resetKey) {
    setLastKey(resetKey);
    setPage(1);
  }
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safe = Math.min(page, pages);
  const visible = rows.slice((safe - 1) * pageSize, safe * pageSize);
  return (
    <div className="card bp-card rf-table-card">
      <div className="table-wrap thin-scroll">
        <table className="bp-table rf-table ep-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.label} className={c.align === "right" ? "right" : undefined}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  <EmptyState title={empty} />
                </td>
              </tr>
            ) : (
              visible.map((r, i) => (
                <tr key={rowKey(r, i)}>
                  {columns.map((c) => (
                    <td key={c.label} className={c.align === "right" ? "right num ep-nowrap" : undefined}>
                      {c.render(r)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={safe} pageSize={pageSize} sizes={[10, 25, 50]} total={rows.length} noun={noun} onPage={(p) => setPage(Math.min(Math.max(1, p), pages))} onPageSize={(s) => { setPageSize(s); setPage(1); }} />
    </div>
  );
}

function Toolbar({ children, count }: { children: ReactNode; count?: string }) {
  return (
    <div className="bw-toolbar">
      {children}
      {count && <span className="bw-count">{count}</span>}
    </div>
  );
}

function Panel({ title, action, children }: { title: string; action?: { label: string; onClick: () => void }; children: ReactNode }) {
  return (
    <section className="bw-panel">
      <header>
        <h4>{title}</h4>
        {action && (
          <button type="button" className="bw-link" onClick={action.onClick}>
            {action.label} <ArrowRight size={14} />
          </button>
        )}
      </header>
      {children}
    </section>
  );
}

function MiniList({ rows, empty }: { rows: { key: string; main: ReactNode; sub?: ReactNode; value: ReactNode; meta?: ReactNode }[]; empty: string }) {
  if (!rows.length) return <p className="bw-none">{empty}</p>;
  return (
    <ul className="bw-mini">
      {rows.map((r) => (
        <li key={r.key}>
          <span className="bw-mini-main">
            <strong>{r.main}</strong>
            {r.sub && <small>{r.sub}</small>}
          </span>
          <span className="bw-mini-val">
            <strong className="num">{r.value}</strong>
            {r.meta && <small>{r.meta}</small>}
          </span>
        </li>
      ))}
    </ul>
  );
}

function downloadCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ─────────────── Workspace ─────────────── */

export function BranchWorkspace({ branchId, open, onClose }: { branchId: string | null; open: boolean; onClose: () => void }) {
  const m = useMotionPreset();
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  // Keep the last branch while the dialog animates closed.
  const last = useRef<string | null>(null);
  if (branchId) last.current = branchId;
  const id = branchId ?? last.current;

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      // Only the top-most dialog layer reacts, so Escape never closes a stack at once.
      const layers = document.querySelectorAll(".modal-layer");
      if (e.key === "Escape" && layers[layers.length - 1] === box.current?.parentElement) onClose();
    };
    document.addEventListener("keydown", onKey);
    const raf = window.requestAnimationFrame(() => box.current?.querySelector<HTMLElement>(".bw-nav button")?.focus());
    return () => {
      document.removeEventListener("keydown", onKey);
      window.cancelAnimationFrame(raf);
      opener.current?.focus?.();
    };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && id && (
        <motion.div className="modal-layer bw-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          <motion.div ref={box} className="bw" role="dialog" aria-modal="true" aria-labelledby={titleId} initial={m.modal.initial} animate={m.modal.animate} exit={m.modal.exit}>
            <WorkspaceBody key={id} branchId={id} titleId={titleId} onClose={onClose} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function WorkspaceBody({ branchId, titleId, onClose }: { branchId: string; titleId: string; onClose: () => void }) {
  const { period: globalPeriod, agents: allAgents, userAgents, user } = useApp();
  const b = getBranch(branchId)!;
  const c = b.currency;
  const isLegacy = b.id === LEGACY_BRANCH_ID;
  const [tab, setTab] = useState<Tab>("overview");
  const [period, setPeriod] = useState<PeriodSelection>(globalPeriod);
  const range = useMemo(() => resolveRange(period), [period]);
  const isDay = period.key === "custom" && period.from === period.to;
  const periodText = isDay ? "Selected day" : periodLabel(period);

  /* Data for the branch and period (each computed once). */
  const s = useMemo(() => summarize([b.id], range), [b.id, range]);
  const visits = useMemo(() => patientVisits([b.id], range), [b.id, range]);
  const expenses = useMemo(() => expenseLines([b.id], range), [b.id, range]);
  const services = useMemo(() => serviceRanking([b.id], range), [b.id, range]);
  const agentAct = useMemo(() => new Map(agentRanking([b.id], range).map((a) => [a.id, a])), [b.id, range]);
  const hospitalAct = useMemo(() => new Map(hospitalRanking([b.id], range).map((h) => [h.key, h])), [b.id, range]);
  const agents = useMemo(() => (isLegacy ? allAgents : []), [isLegacy, allAgents]);
  const directory = useMemo(() => buildHospitalDirectory(agents), [agents]);
  const inventory = isLegacy ? CATALOGUE_INVENTORY : [];
  const staff = STAFF.filter((x) => x.branchId === b.id);
  const days = useMemo(() => dailyRows(b.id, range), [b.id, range]);
  const audit = useMemo(() => auditRows(b.id, range, userAgents, user.name, isLegacy), [b.id, range, userAgents, user.name, isLegacy]);

  const billed = s.revenue[c] ?? 0;
  const paid = s.payments[c] ?? 0;
  const collected = billed > 0 ? (paid / billed) * 100 : 0;

  const nav: { id: Tab; label: string; icon: LucideIcon; count?: number }[] = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "patients", label: "Patients", icon: Users, count: visits.length },
    { id: "inventory", label: "Inventory", icon: Boxes, count: inventory.length },
    { id: "staff", label: "Staff", icon: UserRound, count: staff.length },
    { id: "agents", label: "PR agents", icon: Handshake, count: agents.length },
    { id: "hospitals", label: "Hospitals", icon: Hospital, count: directory.length },
    { id: "finance", label: "Finance & expenses", icon: Wallet, count: expenses.length },
    { id: "reports", label: "Reports", icon: ChartLine, count: days.length },
    { id: "audit", label: "Audit log", icon: ScrollText, count: audit.length },
  ];
  const current = nav.find((n) => n.id === tab)!;
  const Icon = current.icon;

  return (
    <>
      {/* Side panel */}
      <aside className="bw-side">
        <div className="bw-brand">
          <span className="bw-brand-icon" aria-hidden="true">
            <Building2 size={24} />
          </span>
          <div>
            <span className="bw-brand-eyebrow">Branch workspace</span>
            <strong>{b.name}</strong>
            <small>
              {b.code} · {b.city}, {b.country}
            </small>
          </div>
        </div>
        <span className={`bw-status ${b.status === "Active" ? "" : "is-off"}`}>
          <i /> {b.status} · {c}
        </span>

        <nav className="bw-nav" aria-label="Branch workspace sections">
          {nav.map((n) => {
            const NIcon = n.icon;
            return (
              <button key={n.id} type="button" className={tab === n.id ? "is-active" : ""} aria-current={tab === n.id ? "page" : undefined} onClick={() => setTab(n.id)}>
                <NIcon size={18} />
                <span>{n.label}</span>
                {n.count !== undefined && <b className="num">{formatCount(n.count)}</b>}
              </button>
            );
          })}
        </nav>

        <div className="bw-side-card">
          <span>
            <Wallet size={15} /> Payments · {periodText}
          </span>
          <strong className="num">{formatMoney(paid, c)}</strong>
          <div className="bw-side-bar" aria-hidden="true">
            <i style={{ width: `${Math.min(100, Math.max(billed > 0 ? 2 : 0, collected))}%` }} />
          </div>
          <small>{billed > 0 ? `${Math.round(collected)}% of ${formatMoney(billed, c, true)} billed` : "Nothing billed in this period"}</small>
        </div>
      </aside>

      {/* Main */}
      <section className="bw-main">
        <header className="bw-head">
          <div className="bw-head-top">
            <span className="bw-head-icon" aria-hidden="true">
              <Icon size={22} />
            </span>
            <div className="bw-head-titles">
              <span className="bw-eyebrow">
                {b.name} · {current.label}
              </span>
              <h2 id={titleId}>{tabTitle(tab)}</h2>
              <p>
                {rangeText(range)} · {periodText} · amounts in {c}
              </p>
            </div>
            <button type="button" className="fd-close" onClick={onClose} aria-label="Close branch workspace" data-close>
              <X size={20} />
            </button>
          </div>
          <div className="bw-periods">
            <Segmented label="Period" value={isDay ? ("custom" as PeriodSelection["key"]) : period.key} onChange={(key) => setPeriod({ key })} options={PERIODS} />
            <label className={`rf-date ${isDay ? "is-set" : ""}`}>
              <CalendarDays size={16} />
              <input
                type="date"
                aria-label="Pick a specific day"
                value={isDay ? (period.from ?? "") : ""}
                min={isoDate(DATA_START)}
                max={isoDate(TODAY)}
                onChange={(e) => e.target.value && setPeriod({ key: "custom", from: e.target.value, to: e.target.value })}
              />
            </label>
          </div>
        </header>

        <div className="bw-body thin-scroll">
          {tab === "overview" && (
            <>
              <SummaryChips
                items={[
                  { label: "Patient visits", icon: Users, value: formatCount(s.patients), caption: `${formatCount(s.newPatients)} new · ${formatCount(s.referrals)} referred` },
                  { label: "Revenue billed", icon: Banknote, value: formatMoney(billed, c), caption: `${formatCount(s.orders)} tests ordered` },
                  { label: "Payments received", icon: Wallet, value: formatMoney(paid, c), caption: `${formatCount(s.transactions)} transactions` },
                  { label: "Outstanding", icon: CircleAlert, value: formatMoney(s.outstanding[c] ?? 0, c), caption: `${formatCount(s.openBills)} open bills at period end`, tone: (s.outstanding[c] ?? 0) > 0 ? "danger" : undefined },
                ]}
              />
              <div className="bw-panels">
                <Panel title="Latest patients" action={{ label: "All patients", onClick: () => setTab("patients") }}>
                  <MiniList
                    empty="No patients in this period."
                    rows={visits.slice(0, 5).map((v) => ({
                      key: v.id,
                      main: v.patientRef,
                      sub: `${range.days > 1 ? `${formatShortDate(v.at)} · ` : ""}${formatTime(v.at)} · ${v.services[0]?.name ?? "—"}${v.services.length > 1 ? ` +${v.services.length - 1}` : ""}`,
                      value: formatMoney(v.billed, c, true),
                      meta: v.payment,
                    }))}
                  />
                </Panel>
                <Panel title="Top diagnostic services" action={{ label: "Inventory", onClick: () => setTab("inventory") }}>
                  <MiniList
                    empty="No tests performed in this period."
                    rows={services
                      .filter((x) => x.count > 0)
                      .slice(0, 5)
                      .map((x) => ({ key: String(x.id), main: x.name, sub: `${x.category} · ${formatCount(x.count)} performed`, value: formatMoney(x.revenue[c] ?? 0, c, true) }))}
                  />
                </Panel>
                <Panel title="Top PR agents" action={{ label: "All PR agents", onClick: () => setTab("agents") }}>
                  <MiniList
                    empty="No referrals in this period."
                    rows={[...agentAct.values()].slice(0, 5).map((a) => ({
                      key: String(a.id),
                      main: a.name,
                      sub: `${formatCount(a.referrals)} referral${a.referrals === 1 ? "" : "s"}${a.hospitalKey ? ` · ${a.hospitalKey}` : ""}`,
                      value: formatMoney(a.revenue[c] ?? 0, c, true),
                      meta: `${formatMoney(a.commission[c] ?? 0, c, true)} comm.`,
                    }))}
                  />
                </Panel>
                <Panel title="Recent expenses" action={{ label: "Finance", onClick: () => setTab("finance") }}>
                  <MiniList
                    empty="No expenses in this period."
                    rows={expenses.slice(0, 5).map((e) => ({ key: e.id, main: e.description, sub: `${e.category} · ${range.days > 1 ? formatShortDate(e.at) : formatTime(e.at)}`, value: formatMoney(e.amount, c, true) }))}
                  />
                </Panel>
              </div>
            </>
          )}

          {tab === "patients" && <PatientsTab visits={visits} agents={allAgents} currency={c} multiDay={range.days > 1} resetKey={period.key + range.from.toISOString()} />}
          {tab === "inventory" && <InventoryCatalog scope={[b.id]} compact currency={c} periodText={periodText} activity={new Map(services.filter((x) => x.count > 0).map((x) => [x.id, { count: x.count, revenue: x.revenue[c] ?? 0 }]))} />}
          {tab === "staff" && <StaffTab branchId={b.id} staff={staff} />}
          {tab === "agents" && <AgentsTab agents={agents} activity={agentAct} currency={c} />}
          {tab === "hospitals" && <HospitalsTab directory={directory} activity={hospitalAct} currency={c} />}
          {tab === "finance" && <FinanceTab branchId={b.id} range={range} s={s} expenses={expenses} currency={c} />}
          {tab === "reports" && <ReportsTab days={days} currency={c} branchCode={b.code} />}
          {tab === "audit" && <AuditTab rows={audit} />}
        </div>

        <footer className="bw-foot">
          <span>
            Viewing as {user.role} · {b.address === NOT_ON_RECORD ? `${b.city}, ${b.country}` : b.address}
            <MapPin size={13} />
          </span>
          <span className="bw-foot-note">Demonstration activity over real catalogue, PR agents and hospitals</span>
        </footer>
      </section>
    </>
  );
}

function tabTitle(t: Tab): string {
  return {
    overview: "Branch overview",
    patients: "Patients attended",
    inventory: "Inventory & services",
    staff: "Staff",
    agents: "PR agents",
    hospitals: "Partner hospitals",
    finance: "Finance & expenses",
    reports: "Daily reports",
    audit: "Audit log",
  }[t];
}

/* ─────────────── Tabs ─────────────── */

function PatientsTab({ visits, agents, currency: c, multiDay, resetKey }: { visits: ReturnType<typeof patientVisits>; agents: { id: number; name: string }[]; currency: "NGN" | "GHS"; multiDay: boolean; resetKey: string }) {
  const [q, setQ] = useState("");
  const [type, setType] = useState<"all" | "new" | "returning" | "referred" | "balance">("all");
  const names = useMemo(() => new Map(agents.map((a) => [a.id, a.name])), [agents]);
  const needle = q.trim().toLowerCase();
  const rows = visits.filter((v) => {
    if (type === "new" && !v.isNew) return false;
    if (type === "returning" && v.isNew) return false;
    if (type === "referred" && v.agentId === null) return false;
    if (type === "balance" && v.payment === "Paid") return false;
    return !needle || `${v.patientRef} ${v.id} ${v.services.map((x) => x.name).join(" ")} ${v.agentId !== null ? names.get(v.agentId) : ""}`.toLowerCase().includes(needle);
  });
  const billed = rows.reduce((a, v) => a + v.billed, 0);
  const paid = rows.reduce((a, v) => a + v.paid, 0);
  return (
    <>
      <SummaryChips
        items={[
          { label: "Patients", icon: Users, value: formatCount(rows.length), caption: `${formatCount(rows.filter((v) => v.isNew).length)} new` },
          { label: "Billed", icon: Banknote, value: formatMoney(billed, c), caption: `${formatCount(rows.reduce((a, v) => a + v.services.length, 0))} tests` },
          { label: "Paid at visit", icon: Wallet, value: formatMoney(paid, c), caption: `${formatCount(rows.filter((v) => v.payment === "Paid").length)} fully paid` },
          { label: "Balance", icon: CircleAlert, value: formatMoney(billed - paid, c), caption: `${formatCount(rows.filter((v) => v.payment !== "Paid").length)} with a balance`, tone: billed - paid > 0 ? "danger" : undefined },
        ]}
      />
      <Toolbar count={`${formatCount(rows.length)} of ${formatCount(visits.length)} visits`}>
        <SearchInput placeholder="Patient ref, test or referrer" value={q} onChange={setQ} />
        <Segmented
          label="Visit filter"
          value={type}
          onChange={setType}
          options={[
            { value: "all", label: "All" },
            { value: "new", label: "New" },
            { value: "returning", label: "Returning" },
            { value: "referred", label: "Referred" },
            { value: "balance", label: "With balance" },
          ]}
        />
      </Toolbar>
      <DataTable
        rows={rows}
        noun="patients"
        empty={needle ? `No patients match “${q}”` : "No patients in this period"}
        resetKey={`${resetKey}|${q}|${type}`}
        rowKey={(v) => v.id}
        columns={[
          { label: multiDay ? "Date & time" : "Time", render: (v) => <span className="num ep-nowrap">{multiDay ? `${formatShortDate(v.at)} · ${formatTime(v.at)}` : formatTime(v.at)}</span> },
          {
            label: "Patient",
            render: (v) => (
              <>
                <span className="ep-patient">
                  <strong>{v.patientRef}</strong>
                  <Badge tone={v.isNew ? "brand" : "neutral"}>{v.isNew ? "New" : "Returning"}</Badge>
                </span>
                <small className="ep-sub mono">{v.id}</small>
              </>
            ),
          },
          {
            label: "Diagnostics",
            render: (v) => (
              <span title={v.services.map((x) => `${x.name} — ${formatMoney(x.price, c)}`).join("\n")}>
                {v.services[0]?.name ?? "—"}
                {v.services.length > 1 && <span className="ep-more">+{v.services.length - 1} more</span>}
              </span>
            ),
          },
          { label: "Referred by", render: (v) => (v.agentId !== null ? names.get(v.agentId) ?? `Agent #${v.agentId}` : <span className="lg-muted">Walk-in</span>) },
          { label: "Billed", align: "right", render: (v) => <strong>{formatMoney(v.billed, c)}</strong> },
          { label: "Paid", align: "right", render: (v) => formatMoney(v.paid, c) },
          {
            label: "Payment",
            render: (v) => (
              <Badge tone={v.payment === "Paid" ? "ok" : v.payment === "Part-paid" ? "warn" : "danger"} dot>
                {v.payment}
              </Badge>
            ),
          },
        ]}
      />
    </>
  );
}

function StaffTab({ branchId, staff }: { branchId: string; staff: typeof STAFF }) {
  const h = HEADCOUNT[branchId] ?? { total: 0, active: 0, onLeave: 0 };
  return (
    <>
      <SummaryChips
        items={[
          { label: "Assigned staff", icon: Users, value: formatCount(h.total), caption: "On this branch's roster" },
          { label: "Active", icon: UserRound, value: formatCount(h.active), caption: "Currently working" },
          { label: "On leave", icon: CalendarDays, value: formatCount(h.onLeave), caption: "Away this period" },
        ]}
      />
      {staff.length === 0 ? (
        <div className="bw-empty-card">
          <EmptyState title="No staff records yet">Staff were not part of the legacy export. Staff added in Staff Management will appear here with their role, status and last activity.</EmptyState>
        </div>
      ) : (
        <DataTable
          rows={staff}
          noun="staff"
          empty="No staff"
          resetKey="staff"
          rowKey={(x) => x.id}
          columns={[
            { label: "Name", render: (x) => <strong>{x.name}</strong> },
            { label: "Role", render: (x) => x.role },
            { label: "Status", render: (x) => <Badge tone={x.status === "Active" ? "ok" : "warn"} dot>{x.status}</Badge> },
            { label: "Email", render: (x) => x.email },
            { label: "Last active", render: (x) => formatShortDate(x.lastActive) },
          ]}
        />
      )}
    </>
  );
}

function AgentsTab({ agents, activity, currency: c }: { agents: ReturnType<typeof useApp>["agents"]; activity: Map<number, ReturnType<typeof agentRanking>[number]>; currency: "NGN" | "GHS" }) {
  const [q, setQ] = useState("");
  const [show, setShow] = useState<"all" | "referred" | "unassigned">("referred");
  const needle = q.trim().toLowerCase();
  const rows = agents
    .filter((a) => (show !== "referred" || activity.has(a.id)) && (show !== "unassigned" || !hospitalKey(a.hospital)) && (!needle || `${a.name} ${a.id} ${a.hospital} ${a.phone}`.toLowerCase().includes(needle)))
    .slice()
    .sort((a, b) => (activity.get(b.id)?.referrals ?? 0) - (activity.get(a.id)?.referrals ?? 0) || a.order - b.order);
  const referred = [...activity.values()];
  const revenue = referred.reduce((a, x) => a + (x.revenue[c] ?? 0), 0);
  const commission = referred.reduce((a, x) => a + (x.commission[c] ?? 0), 0);
  if (!agents.length) return <EmptyState title="No PR agents for this branch" />;
  return (
    <>
      <SummaryChips
        items={[
          { label: "PR agents", icon: Handshake, value: formatCount(agents.length), caption: `${formatCount(agents.filter((a) => hospitalKey(a.hospital)).length)} with a hospital` },
          { label: "Referred in period", icon: TrendingUp, value: formatCount(referred.length), caption: `${formatCount(referred.reduce((a, x) => a + x.referrals, 0))} referrals` },
          { label: "Revenue generated", icon: Banknote, value: formatMoney(revenue, c), caption: "Billed value of referred tests" },
          { label: "Commission earned", icon: Percent, value: formatMoney(commission, c), caption: "Placeholder rate until confirmed" },
        ]}
      />
      <Toolbar count={`${formatCount(rows.length)} agents`}>
        <SearchInput placeholder="Agent name, ID, hospital or phone" value={q} onChange={setQ} />
        <Segmented
          label="Show"
          value={show}
          onChange={setShow}
          options={[
            { value: "referred", label: "Referred in period" },
            { value: "all", label: "All agents" },
            { value: "unassigned", label: "No hospital" },
          ]}
        />
      </Toolbar>
      <DataTable
        rows={rows}
        noun="PR agents"
        empty={show === "referred" ? "No agents referred patients in this period" : "No agents match"}
        resetKey={`${q}|${show}`}
        rowKey={(a) => String(a.id)}
        columns={[
          { label: "ID", render: (a) => <span className="mono">#{a.id}</span> },
          {
            label: "PR agent",
            render: (a) => (
              <>
                <strong>{a.name}</strong>
                {a.source === "user" && <Badge tone="brand">Added in app</Badge>}
              </>
            ),
          },
          { label: "Hospital", render: (a) => (hospitalKey(a.hospital) ? <span className="lg-chip">{hospitalKey(a.hospital)}</span> : <span className="lg-muted">Unassigned</span>) },
          { label: "Phone", render: (a) => (hasPhone(a.phone) ? a.phone : <span className="lg-muted">N/A</span>) },
          { label: "Referrals", align: "right", render: (a) => <strong>{formatCount(activity.get(a.id)?.referrals ?? 0)}</strong> },
          { label: "Revenue", align: "right", render: (a) => (activity.has(a.id) ? formatMoney(activity.get(a.id)!.revenue[c] ?? 0, c) : "—") },
          { label: "Commission", align: "right", render: (a) => (activity.has(a.id) ? formatMoney(activity.get(a.id)!.commission[c] ?? 0, c) : "—") },
        ]}
      />
    </>
  );
}

function HospitalsTab({ directory, activity, currency: c }: { directory: ReturnType<typeof buildHospitalDirectory>; activity: Map<string, ReturnType<typeof hospitalRanking>[number]>; currency: "NGN" | "GHS" }) {
  const [q, setQ] = useState("");
  const [show, setShow] = useState<"all" | "referred">("all");
  const needle = q.trim().toLowerCase();
  const rows = directory
    .filter((h) => (show === "all" || activity.has(h.key)) && (!needle || `${h.key} ${h.rawVariants.join(" ")}`.toLowerCase().includes(needle)))
    .slice()
    .sort((a, b) => (activity.get(b.key)?.referrals ?? 0) - (activity.get(a.key)?.referrals ?? 0) || b.agentCount - a.agentCount);
  const act = [...activity.values()];
  if (!directory.length) return <EmptyState title="No hospitals for this branch" />;
  return (
    <>
      <SummaryChips
        items={[
          { label: "Partner hospitals", icon: Hospital, value: formatCount(directory.length), caption: "From PR-agent assignments" },
          { label: "Referred in period", icon: TrendingUp, value: formatCount(act.length), caption: `${formatCount(act.reduce((a, h) => a + h.referrals, 0))} referrals` },
          { label: "Revenue from referrals", icon: Banknote, value: formatMoney(act.reduce((a, h) => a + (h.revenue[c] ?? 0), 0), c), caption: "Billed value of referred tests" },
          { label: "Codes needing review", icon: CircleAlert, value: formatCount(directory.filter((h) => h.notes.length > 0).length), caption: "Possible duplicates or mis-keys" },
        ]}
      />
      <Toolbar count={`${formatCount(rows.length)} hospitals`}>
        <SearchInput placeholder="Hospital code" value={q} onChange={setQ} />
        <Segmented
          label="Show"
          value={show}
          onChange={setShow}
          options={[
            { value: "all", label: "All hospitals" },
            { value: "referred", label: "Referred in period" },
          ]}
        />
      </Toolbar>
      <DataTable
        rows={rows}
        noun="hospitals"
        empty="No hospitals match"
        resetKey={`${q}|${show}`}
        rowKey={(h) => h.key}
        columns={[
          {
            label: "Hospital",
            render: (h) => (
              <>
                <strong>{h.key}</strong>
                {h.rawVariants.length > 1 && <small className="ep-sub">Recorded as {h.rawVariants.join(", ")}</small>}
              </>
            ),
          },
          { label: "PR agents", align: "right", render: (h) => formatCount(h.agentCount) },
          { label: "Active agents", align: "right", render: (h) => formatCount(activity.get(h.key)?.activeAgents ?? 0) },
          { label: "Referrals", align: "right", render: (h) => <strong>{formatCount(activity.get(h.key)?.referrals ?? 0)}</strong> },
          { label: "Revenue", align: "right", render: (h) => (activity.has(h.key) ? formatMoney(activity.get(h.key)!.revenue[c] ?? 0, c) : "—") },
          { label: "Review", render: (h) => (h.notes.length ? <Badge tone="warn">Check</Badge> : <span className="lg-muted">—</span>) },
        ]}
      />
    </>
  );
}

function FinanceTab({ branchId, range, s, expenses, currency: c }: { branchId: string; range: DateRange; s: ReturnType<typeof summarize>; expenses: ReturnType<typeof expenseLines>; currency: "NGN" | "GHS" }) {
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const methods = paymentMix([branchId], range, c);
  const methodTotal = methods.reduce((a, x) => a + x.value, 0);
  const byCat = EXPENSE_CATEGORIES.map((name) => ({ name, value: expenses.filter((e) => e.category === name).reduce((a, e) => a + e.amount, 0) })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
  const expTotal = expenses.reduce((a, e) => a + e.amount, 0);
  const needle = q.trim().toLowerCase();
  const rows = expenses.filter((e) => (cat === "all" || e.category === cat) && (!needle || `${e.description} ${e.id} ${e.category}`.toLowerCase().includes(needle)));
  const billed = s.revenue[c] ?? 0;
  const paid = s.payments[c] ?? 0;
  return (
    <>
      <SummaryChips
        items={[
          { label: "Revenue billed", icon: Banknote, value: formatMoney(billed, c), caption: "Completed diagnostics" },
          { label: "Payments received", icon: Wallet, value: formatMoney(paid, c), caption: billed > 0 ? `${Math.round((paid / billed) * 100)}% of billed` : "Nothing billed" },
          { label: "Approved expenses", icon: Receipt, value: formatMoney(s.expenses[c] ?? 0, c), caption: `${formatCount(expenses.length)} expense lines` },
          { label: "PR commission", icon: Percent, value: formatMoney(s.prCommission[c] ?? 0, c), caption: "Accrued on referrals" },
        ]}
      />
      <div className="bw-panels">
        <Panel title="Payments by method">
          <MiniList
            empty="No payments in this period."
            rows={methods.map((x, i) => ({ key: PAYMENT_METHODS[i], main: x.label, sub: methodTotal ? `${formatPct((x.value / methodTotal) * 100, 0)} of payments` : undefined, value: formatMoney(x.value, c, true) }))}
          />
        </Panel>
        <Panel title="Expenses by category">
          <MiniList empty="No expenses in this period." rows={byCat.map((x) => ({ key: x.name, main: x.name, sub: expTotal ? `${formatPct((x.value / expTotal) * 100, 0)} of expenses` : undefined, value: formatMoney(x.value, c, true) }))} />
        </Panel>
      </div>
      <Toolbar count={`${formatCount(rows.length)} expense lines`}>
        <SearchInput placeholder="Description or reference" value={q} onChange={setQ} />
        <SelectMenu value={cat} ariaLabel="Expense category" className="select-btn rf-select" options={[{ value: "all", label: "All categories" }, ...EXPENSE_CATEGORIES.map((x) => ({ value: x as string, label: x }))]} onChange={(v: string) => setCat(v)} />
      </Toolbar>
      <DataTable
        rows={rows}
        noun="expenses"
        empty="No expenses match"
        resetKey={`${cat}|${q}|${range.from.toISOString()}|${range.days}`}
        rowKey={(e) => e.id}
        columns={[
          { label: range.days > 1 ? "Date & time" : "Time", render: (e) => <span className="num ep-nowrap">{range.days > 1 ? `${formatShortDate(e.at)} · ${formatTime(e.at)}` : formatTime(e.at)}</span> },
          {
            label: "Expense",
            render: (e) => (
              <>
                <strong>{e.description}</strong>
                <small className="ep-sub mono">{e.id}</small>
              </>
            ),
          },
          { label: "Category", render: (e) => e.category },
          { label: "Amount", align: "right", render: (e) => <strong>{formatMoney(e.amount, c)}</strong> },
          { label: "Status", render: (e) => <Badge tone="ok" dot>{e.status}</Badge> },
        ]}
      />
    </>
  );
}

interface DayRow {
  date: Date;
  patients: number;
  newPatients: number;
  referrals: number;
  tests: number;
  billed: number;
  paid: number;
  expenses: number;
}

function dailyRows(branchId: string, range: DateRange): DayRow[] {
  const all = DAILY[branchId] ?? [];
  const start = Math.max(0, diffDays(DATA_START, range.from));
  const end = Math.min(all.length - 1, diffDays(DATA_START, range.to));
  const out: DayRow[] = [];
  for (let i = end; i >= start; i--) {
    const d = all[i];
    out.push({ date: addDays(DATA_START, i), patients: d.patients, newPatients: d.newPatients, referrals: d.referrals, tests: d.orders, billed: d.revenue, paid: d.payments, expenses: d.expenses });
  }
  return out;
}

function ReportsTab({ days, currency: c, branchCode }: { days: DayRow[]; currency: "NGN" | "GHS"; branchCode: string }) {
  const tot = days.reduce((a, d) => ({ patients: a.patients + d.patients, billed: a.billed + d.billed, paid: a.paid + d.paid, expenses: a.expenses + d.expenses }), { patients: 0, billed: 0, paid: 0, expenses: 0 });
  const best = [...days].sort((a, b) => b.billed - a.billed)[0];
  const n = Math.max(1, days.length);
  return (
    <>
      <SummaryChips
        items={[
          { label: "Days reported", icon: CalendarDays, value: formatCount(days.length), caption: days.length ? `${formatShortDate(days[days.length - 1].date)} – ${formatShortDate(days[0].date)}` : "No days" },
          { label: "Patients per day", icon: Users, value: (tot.patients / n).toFixed(1), caption: `${formatCount(tot.patients)} in total` },
          { label: "Billed per day", icon: Banknote, value: formatMoney(tot.billed / n, c), caption: `${formatMoney(tot.billed, c, true)} in total` },
          { label: "Best day", icon: TrendingUp, value: best ? formatMoney(best.billed, c) : "—", caption: best ? formatShortDate(best.date) : "No days" },
        ]}
      />
      <Toolbar count={`${formatCount(days.length)} day${days.length === 1 ? "" : "s"}`}>
        <Button
          variant="secondary"
          size="sm"
          disabled={!days.length}
          onClick={() =>
            downloadCsv(
              `${branchCode}-daily-report.csv`,
              ["Date", "Patients", "New patients", "Referrals", "Tests", `Billed (${c})`, `Payments (${c})`, `Expenses (${c})`],
              days.map((d) => [isoDate(d.date), d.patients, d.newPatients, d.referrals, d.tests, Math.round(d.billed), Math.round(d.paid), Math.round(d.expenses)]),
            )
          }
        >
          <Download size={15} /> Download CSV
        </Button>
      </Toolbar>
      <DataTable
        rows={days}
        noun="days"
        empty="No days in this period"
        resetKey={days.length ? isoDate(days[0].date) + days.length : "none"}
        rowKey={(d) => isoDate(d.date)}
        columns={[
          { label: "Date", render: (d) => <strong className="ep-nowrap">{d.date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</strong> },
          { label: "Patients", align: "right", render: (d) => formatCount(d.patients) },
          { label: "New", align: "right", render: (d) => formatCount(d.newPatients) },
          { label: "Referrals", align: "right", render: (d) => formatCount(d.referrals) },
          { label: "Tests", align: "right", render: (d) => formatCount(d.tests) },
          { label: "Billed", align: "right", render: (d) => <strong>{formatMoney(d.billed, c)}</strong> },
          { label: "Payments", align: "right", render: (d) => formatMoney(d.paid, c) },
          { label: "Expenses", align: "right", render: (d) => formatMoney(d.expenses, c) },
        ]}
      />
    </>
  );
}

interface AuditRow {
  id: string;
  at: Date;
  user: string;
  role: string;
  action: string;
  record: string;
  change: string;
}

/** Recorded changes for the branch: the baseline import plus changes made in this session. */
function auditRows(branchId: string, range: DateRange, userAgents: ReturnType<typeof useApp>["userAgents"], userName: string, isLegacy: boolean): AuditRow[] {
  const from = range.from.getTime();
  const to = addDays(range.to, 1).getTime();
  const rows: AuditRow[] = [
    ...AUDIT.filter((a) => a.branchId === branchId).map((a, i) => ({ id: `A${i}`, at: a.at, user: a.user, role: a.role, action: a.action, record: a.record, change: a.change })),
    ...(isLegacy
      ? userAgents.map((a) => ({
          id: `U${a.id}`,
          at: new Date(a.createdAt ?? Date.now()),
          user: userName,
          role: "Company Admin",
          action: "PR agent added",
          record: `#${a.id} ${a.name}`,
          change: a.hospital ? `Assigned to ${a.hospital}` : "No hospital assigned",
        }))
      : []),
  ];
  return rows.filter((r) => r.at.getTime() >= from && r.at.getTime() < to).sort((a, b) => b.at.getTime() - a.at.getTime());
}

function AuditTab({ rows }: { rows: AuditRow[] }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const filtered = rows.filter((r) => !needle || `${r.user} ${r.action} ${r.record} ${r.change}`.toLowerCase().includes(needle));
  return (
    <>
      <SummaryChips
        items={[
          { label: "Changes recorded", icon: ScrollText, value: formatCount(rows.length), caption: "In this period" },
          { label: "People involved", icon: UserRound, value: formatCount(new Set(rows.map((r) => r.user)).size), caption: "Distinct users" },
          { label: "Latest change", icon: ClipboardList, value: rows[0] ? formatShortDate(rows[0].at) : "—", caption: rows[0] ? rows[0].action : "Nothing changed in this period" },
        ]}
      />
      <Toolbar count={`${formatCount(filtered.length)} entries`}>
        <SearchInput placeholder="User, action or record" value={q} onChange={setQ} />
      </Toolbar>
      <DataTable
        rows={filtered}
        noun="entries"
        empty={rows.length ? "No entries match" : "No changes were recorded for this branch in this period"}
        resetKey={q}
        rowKey={(r) => r.id}
        columns={[
          { label: "When", render: (r) => <span className="num ep-nowrap">{`${formatShortDate(r.at)} · ${formatTime(r.at)}`}</span> },
          {
            label: "User",
            render: (r) => (
              <>
                <strong>{r.user}</strong>
                <small className="ep-sub">{r.role}</small>
              </>
            ),
          },
          { label: "Action", render: (r) => <Badge tone="brand">{r.action}</Badge> },
          { label: "Record", render: (r) => r.record },
          { label: "Change", render: (r) => <span className="bw-wrap">{r.change}</span> },
        ]}
      />
      <p className="bw-note">The audit log lists the baseline import and every change made in STANLEY for this branch. Bills, payments and staff changes will appear here once they are recorded in the database.</p>
    </>
  );
}
