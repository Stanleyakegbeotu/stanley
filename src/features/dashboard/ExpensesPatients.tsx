import { useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { ArrowRight, Banknote, CalendarDays, CircleAlert, ListOrdered, Receipt, TrendingUp, Users, Wallet, type LucideIcon } from "lucide-react";
import { FitText } from "@/shared/ui/FitText";
import { useApp } from "@/app/AppState";
import { ACTIVE_BRANCHES, getBranch } from "@/data/company";
import type { Currency, DateRange, Money, PeriodSelection } from "@/data/types";
import { EXPENSE_CATEGORIES } from "@/data/types";
import { isoDate } from "@/data/demo/generator";
import { expenseLines, patientVisits, type ExpenseLine, type PatientVisit } from "@/data/demo/dailyLines";
import { CountUp, Reveal } from "@/shared/motion";
import { formatCount, formatMoney, formatShortDate, formatTime, moneyEntries } from "@/shared/format";
import { Badge, Button, EmptyState, SearchInput, SectionHeader, Segmented, SelectMenu } from "@/shared/ui/controls";
import { Modal } from "@/shared/ui/Modal";
import { Pagination } from "@/shared/ui/Pagination";
import { DATA_START, PERIOD_OPTIONS, TODAY, periodLabel, resolveRange } from "@/services/analytics";
import { rangeText } from "./WelcomeBanner";
import { PatientRecordModal } from "@/features/shared/PatientRecord";

/* ─────────────── helpers ─────────────── */

const QUICK_PERIODS = PERIOD_OPTIONS.filter((o) => o.key !== "custom").map((o) => ({ value: o.key, label: o.label }));
export const MULTI_BRANCH = ACTIVE_BRANCHES.length > 1;

const currencyOf = (branchId: string): Currency => getBranch(branchId)?.currency ?? "NGN";

function sumBy<T extends { branchId: string }>(rows: T[], pick: (r: T) => number): Money {
  const out: Money = {};
  for (const r of rows) {
    const c = currencyOf(r.branchId);
    out[c] = (out[c] ?? 0) + pick(r);
  }
  return out;
}

const moneyText = (m: Money, compact = false) =>
  moneyEntries(m)
    .map(([c, v]) => formatMoney(v, c, compact))
    .join(" · ") || formatMoney(0, "NGN");

/** Date + time when the range spans several days, time only for a single day. */
const when = (d: Date, multiDay: boolean) => (multiDay ? `${formatShortDate(d)} · ${formatTime(d)}` : formatTime(d));

function clickable(onOpen: () => void) {
  return {
    role: "button" as const,
    tabIndex: 0,
    onClick: onOpen,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onOpen();
      }
    },
  };
}

/* ─────────────── Dashboard section ─────────────── */

type ModalKind = "patients" | "expenses";

export function ExpensesPatientsSection({ branchIds, range }: { branchIds: string[]; range: DateRange }) {
  const { period, context } = useApp();
  const visits = useMemo(() => patientVisits(branchIds, range), [branchIds, range]);
  const expenses = useMemo(() => expenseLines(branchIds, range), [branchIds, range]);
  const [modal, setModal] = useState<{ kind: ModalKind; session: number; open: boolean } | null>(null);
  const open = (kind: ModalKind) => setModal((m) => ({ kind, session: (m?.session ?? 0) + 1, open: true }));
  const close = () => setModal((m) => (m ? { ...m, open: false } : m));
  const scope = context === "all" ? "All branches" : `${getBranch(context)?.name ?? "Selected"} branch`;

  return (
    <>
      <SectionHeader
        eyebrow="Expenses & patients"
        title={`Patients & expenses · ${periodLabel(period)}`}
        description="Every patient attended and every approved expense in the reporting period. Open a card for the full list."
        demo
      />
      <Reveal mode="stagger" className="analytics-grid pair-grid">
        <PatientsCard visits={visits} scope={scope} periodText={periodLabel(period)} onOpen={() => open("patients")} />
        <ExpensesCard lines={expenses} scope={scope} periodText={periodLabel(period)} onOpen={() => open("expenses")} />
      </Reveal>
      {modal?.kind === "patients" && <PatientsModal key={modal.session} open={modal.open} basePeriod={period} baseBranchIds={branchIds} onClose={close} />}
      {modal?.kind === "expenses" && <ExpensesModal key={modal.session} open={modal.open} basePeriod={period} baseBranchIds={branchIds} onClose={close} />}
    </>
  );
}

/* ─────────────── Shared card pieces (also used by DiagnosticServices) ─────────────── */

export type Accent = "blue" | "orange" | "teal" | "purple";

/** Segment colours for distribution bars; the last one is used for "Other". */
export const SEGMENT_COLORS: Record<Accent, string[]> = {
  orange: ["var(--kpi-orange)", "var(--kpi-blue)", "var(--kpi-purple)", "var(--kpi-teal)", "var(--faint)"],
  purple: ["var(--kpi-purple)", "var(--kpi-blue)", "var(--kpi-teal)", "var(--kpi-orange)", "var(--faint)"],
  blue: ["var(--kpi-blue)", "var(--kpi-teal)", "var(--kpi-purple)", "var(--kpi-orange)", "var(--faint)"],
  teal: ["var(--kpi-teal)", "var(--kpi-blue)", "var(--kpi-purple)", "var(--kpi-orange)", "var(--faint)"],
};

export interface Segment {
  label: string;
  value: number;
  color: string;
}

/** Top N segments plus an "Other" bucket so the bar always adds up to 100%. */
export function toSegments(items: [string, number][], accent: Accent, top = 4): Segment[] {
  const colors = SEGMENT_COLORS[accent];
  const sorted = [...items].sort((a, b) => b[1] - a[1]);
  const head = sorted.slice(0, top).map(([label, value], i) => ({ label, value, color: colors[i] }));
  const rest = sorted.slice(top).reduce((s, [, v]) => s + v, 0);
  return rest > 0 ? [...head, { label: "Other", value: rest, color: colors[colors.length - 1] }] : head;
}

export function StackBar({ segments, label }: { segments: Segment[]; label: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  return (
    <div className="dc-stack" role="img" aria-label={label}>
      {segments.map((s) => (
        <i key={s.label} style={{ flexGrow: total ? s.value : 0, background: s.color }} title={`${s.label}: ${total ? Math.round((s.value / total) * 100) : 0}%`} />
      ))}
    </div>
  );
}

export function CardHead({ icon: Icon, title, sub, periodText, onClick }: { icon: LucideIcon; title: string; sub: string; periodText: string; onClick?: () => void }) {
  const inner = (
    <>
      <span className="dc-icon" aria-hidden="true">
        <Icon size={19} strokeWidth={2} />
      </span>
      <div className="dc-title">
        <h3>{title}</h3>
        <p>{sub}</p>
      </div>
      <span className="dc-period">{periodText}</span>
    </>
  );
  return onClick ? (
    <button type="button" className="dc-head is-button" onClick={onClick} aria-haspopup="dialog" aria-label={` — open full list`}>
      {inner}
    </button>
  ) : (
    <div className="dc-head">{inner}</div>
  );
}

export function CardShell({
  accent,
  icon,
  title,
  sub,
  periodText,
  cta,
  onOpen,
  children,
}: {
  accent: Accent;
  icon: LucideIcon;
  title: string;
  sub: string;
  periodText: string;
  cta: string;
  onOpen: () => void;
  children: ReactNode;
}) {
  return (
    <Reveal hover className={`card span-6 dcard ep-card accent-${accent}`} {...clickable(onOpen)} aria-label={`${title} — ${cta}`}>
      <CardHead icon={icon} title={title} sub={sub} periodText={periodText} />
      <div className="dc-body">{children}</div>
      <div className="dc-foot">
        <span className="dc-link">
          {cta} <ArrowRight size={15} />
        </span>
      </div>
    </Reveal>
  );
}

function PatientsCard({ visits, scope, periodText, onOpen }: { visits: PatientVisit[]; scope: string; periodText: string; onOpen: () => void }) {
  const total = visits.length;
  const newCount = visits.filter((v) => v.isNew).length;
  const returning = total - newCount;
  const referred = visits.filter((v) => v.agentId !== null).length;
  const latest = visits.slice(0, 3);
  const multiDay = new Set(visits.map((v) => isoDate(v.at))).size > 1;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  return (
    <CardShell accent="blue" icon={Users} title="Patients" sub={scope} periodText={periodText} cta="View all patients" onOpen={onOpen}>
      <div className="dc-hero">
        <div>
          <span className="dc-hero-label">Patients attended</span>
          <strong className="num">
            <CountUp value={total} format={formatCount} />
          </strong>
        </div>
      </div>

      <StackBar
        label={`${newCount} new and ${returning} returning patients`}
        segments={[
          { label: "New", value: newCount, color: "var(--kpi-blue)" },
          { label: "Returning", value: returning, color: "color-mix(in srgb, var(--kpi-blue) 30%, var(--canvas-2))" },
        ]}
      />

      <div className="dc-tiles">
        <div>
          <span>
            <i style={{ background: "var(--kpi-blue)" }} />
            New
          </span>
          <strong className="num">{formatCount(newCount)}</strong>
          <small>{pct(newCount)}% of visits</small>
        </div>
        <div>
          <span>
            <i style={{ background: "color-mix(in srgb, var(--kpi-blue) 30%, var(--canvas-2))" }} />
            Returning
          </span>
          <strong className="num">{formatCount(returning)}</strong>
          <small>{pct(returning)}% of visits</small>
        </div>
        <div>
          <span>
            <i style={{ background: "var(--kpi-teal)" }} />
            Referred
          </span>
          <strong className="num">{formatCount(referred)}</strong>
          <small>by PR agents</small>
        </div>
      </div>

      <div className="dc-list">
        <span className="dc-list-label">Latest arrivals</span>
        {latest.length === 0 ? (
          <p className="dc-none">No patients recorded in this period.</p>
        ) : (
          latest.map((v) => (
            <div key={v.id} className="dc-row">
              <span className="dc-avatar" aria-hidden="true">
                <Users size={15} />
              </span>
              <span className="dc-main">
                <strong>
                  {v.patientRef}
                  {v.isNew && <em>New</em>}
                </strong>
                <small>
                  {when(v.at, multiDay)} · {v.services[0]?.name ?? "—"}
                  {v.services.length > 1 ? ` +${v.services.length - 1}` : ""}
                </small>
              </span>
              <span className="dc-amt num">{formatMoney(v.billed, currencyOf(v.branchId), true)}</span>
            </div>
          ))
        )}
      </div>
    </CardShell>
  );
}

function ExpensesCard({ lines, scope, periodText, onOpen }: { lines: ExpenseLine[]; scope: string; periodText: string; onOpen: () => void }) {
  const total = sumBy(lines, (l) => l.amount);
  const entries = moneyEntries(total);
  const primary = entries[0];
  // Category breakdown in the primary currency only — currencies are never combined.
  const segments = useMemo(() => {
    if (!primary) return [];
    const [c] = primary;
    const map = new Map<string, number>();
    for (const l of lines) if (currencyOf(l.branchId) === c) map.set(l.category, (map.get(l.category) ?? 0) + l.amount);
    return toSegments([...map.entries()], "orange");
  }, [lines, primary]);
  const catTotal = segments.reduce((s, x) => s + x.value, 0);

  return (
    <CardShell accent="orange" icon={Receipt} title="Expenses" sub={scope} periodText={periodText} cta="View all expenses" onOpen={onOpen}>
      <div className="dc-hero">
        <div>
          <span className="dc-hero-label">Approved expenses</span>
          <strong className="num">{primary ? <CountUp value={primary[1]} format={(n) => formatMoney(n, primary[0])} /> : formatMoney(0, "NGN")}</strong>
          {entries.slice(1).map(([c, v]) => (
            <small key={c} className="num">
              + {formatMoney(v, c)}
            </small>
          ))}
        </div>
        <span className="dc-chip num">
          {formatCount(lines.length)} expense{lines.length === 1 ? "" : "s"}
        </span>
      </div>

      {segments.length > 0 && <StackBar label="Expenses by category" segments={segments} />}

      <div className="dc-list">
        <span className="dc-list-label">By category</span>
        {segments.length === 0 ? (
          <p className="dc-none">No expenses recorded in this period.</p>
        ) : (
          segments.map((s) => (
            <div key={s.label} className="dc-legend">
              <i style={{ background: s.color }} aria-hidden="true" />
              <span className="dc-legend-name">{s.label}</span>
              <span className="dc-legend-pct num">{catTotal ? Math.round((s.value / catTotal) * 100) : 0}%</span>
              <span className="dc-amt num">{formatMoney(s.value, primary![0], true)}</span>
            </div>
          ))
        )}
      </div>
    </CardShell>
  );
}

/* ─────────────── Shared modal filters ─────────────── */

/** "all" unless the dashboard is focused on one branch out of several. */
export const defaultBranch = (ids: string[]) => (ids.length === 1 && MULTI_BRANCH ? ids[0] : "all");

export function useModalFilters(basePeriod: PeriodSelection, baseBranchIds: string[]) {
  const [period, setPeriod] = useState<PeriodSelection>(basePeriod);
  const [branchId, setBranchId] = useState(defaultBranch(baseBranchIds));
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const range = useMemo(() => resolveRange(period), [period]);
  const ids = useMemo(() => (branchId === "all" ? ACTIVE_BRANCHES.map((b) => b.id) : [branchId]), [branchId]);
  const isDay = period.key === "custom" && period.from === period.to;
  return { period, setPeriod, branchId, setBranchId, q, setQ, page, setPage, pageSize, setPageSize, range, ids, isDay };
}

export type Filters = ReturnType<typeof useModalFilters>;

export function FilterBar({
  f,
  basePeriod,
  searchPlaceholder,
  extra,
  dirty,
  onReset,
  branchSelect = true,
  allowRange = false,
}: {
  f: Filters;
  basePeriod: PeriodSelection;
  searchPlaceholder: string;
  extra?: ReactNode;
  dirty: boolean;
  onReset: () => void;
  /** Show the branch selector (hidden when the page has already fixed the branch). */
  branchSelect?: boolean;
  /** Offer a from–to date range instead of a single day. */
  allowRange?: boolean;
}) {
  const custom = f.period.key === "custom";
  const setCustom = (from: string, to: string) => {
    f.setPeriod({ key: "custom", from: from <= to ? from : to, to: from <= to ? to : from });
    f.setPage(1);
  };
  return (
    <div className="rf-filters" role="group" aria-label="Filters">
      <div className="rf-filter-row">
        <div className="rf-filter">
          <span>Period</span>
          <Segmented
            label="Period"
            value={custom ? ("custom" as PeriodSelection["key"]) : f.period.key}
            onChange={(key) => {
              f.setPeriod({ key });
              f.setPage(1);
            }}
            options={QUICK_PERIODS}
          />
        </div>
        {allowRange ? (
          <>
            <label className="rf-filter">
              <span>Or from</span>
              <span className={`rf-date ${custom ? "is-set" : ""}`}>
                <CalendarDays size={16} />
                <input
                  type="date"
                  value={custom ? (f.period.from ?? "") : ""}
                  min={isoDate(DATA_START)}
                  max={isoDate(TODAY)}
                  onChange={(e) => e.target.value && setCustom(e.target.value, custom ? (f.period.to ?? e.target.value) : e.target.value)}
                  aria-label="Start date"
                />
              </span>
            </label>
            <label className="rf-filter">
              <span>To</span>
              <span className={`rf-date ${custom ? "is-set" : ""}`}>
                <CalendarDays size={16} />
                <input
                  type="date"
                  value={custom ? (f.period.to ?? "") : ""}
                  min={isoDate(DATA_START)}
                  max={isoDate(TODAY)}
                  onChange={(e) => e.target.value && setCustom(custom ? (f.period.from ?? e.target.value) : e.target.value, e.target.value)}
                  aria-label="End date"
                />
              </span>
            </label>
          </>
        ) : (
          <label className="rf-filter">
            <span>Or pick a day</span>
            <span className={`rf-date ${f.isDay ? "is-set" : ""}`}>
              <CalendarDays size={16} />
              <input
                type="date"
                value={f.isDay ? (f.period.from ?? "") : ""}
                min={isoDate(DATA_START)}
                max={isoDate(TODAY)}
                onChange={(e) => {
                  if (!e.target.value) return;
                  f.setPeriod({ key: "custom", from: e.target.value, to: e.target.value });
                  f.setPage(1);
                }}
                aria-label="Pick a specific day"
              />
            </span>
          </label>
        )}
      </div>
      <div className="rf-filter-row">
        {MULTI_BRANCH && branchSelect && (
          <div className="rf-filter">
            <span>Branch</span>
            <SelectMenu
              value={f.branchId}
              ariaLabel="Branch"
              className="select-btn rf-select"
              options={[{ value: "all", label: "All branches", description: `${ACTIVE_BRANCHES.length} active branches` }, ...ACTIVE_BRANCHES.map((b) => ({ value: b.id, label: b.name, description: `${b.city} · ${b.currency}` }))]}
              onChange={(v: string) => {
                f.setBranchId(v);
                f.setPage(1);
              }}
            />
          </div>
        )}
        {extra}
        <div className="rf-filter grow">
          <span>Search</span>
          <SearchInput
            placeholder={searchPlaceholder}
            value={f.q}
            onChange={(v) => {
              f.setQ(v);
              f.setPage(1);
            }}
          />
        </div>
        {(dirty || f.q || f.period.key !== basePeriod.key || f.isDay) && (
          <button className="text-link rf-reset" onClick={onReset}>
            Reset filters
          </button>
        )}
      </div>
    </div>
  );
}

export interface SummaryItem {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  caption?: string;
  tone?: "danger";
}

/** KPI-style summary tiles for the data pop-ups (theme accent, icon, value, caption). */
export function SummaryChips({ items }: { items: SummaryItem[] }) {
  return (
    <div className="rf-kpis md-kpis">
      {items.map(({ label, value, icon: Icon, caption, tone }) => (
        <div key={label} className={`rf-kpi ${tone === "danger" ? "is-danger" : ""}`}>
          <div className="rf-kpi-head">
            <span className="rf-kpi-icon">
              <Icon size={18} strokeWidth={1.9} />
            </span>
            <span className="rf-kpi-label">{label}</span>
          </div>
          <FitText className="rf-kpi-value">{value}</FitText>
          {caption && <p className="rf-kpi-caption">{caption}</p>}
        </div>
      ))}
    </div>
  );
}

/* ─────────────── Patients modal ─────────────── */

type VisitFilter = "all" | "new" | "returning" | "referred";

function PatientsModal({ open, basePeriod, baseBranchIds, onClose }: { open: boolean; basePeriod: PeriodSelection; baseBranchIds: string[]; onClose: () => void }) {
  const { agents, navigate } = useApp();
  const f = useModalFilters(basePeriod, baseBranchIds);
  const [type, setType] = useState<VisitFilter>("all");
  const [viewing, setViewing] = useState<PatientVisit | null>(null);
  const agentName = useMemo(() => {
    const map = new Map(agents.map((a) => [a.id, a.name]));
    return (id: number | null) => (id === null ? null : (map.get(id) ?? `Agent #${id}`));
  }, [agents]);

  const all = useMemo(() => patientVisits(f.ids, f.range), [f.ids, f.range]);
  const needle = f.q.trim().toLowerCase();
  const rows = all.filter((v) => {
    if (type === "new" && !v.isNew) return false;
    if (type === "returning" && v.isNew) return false;
    if (type === "referred" && v.agentId === null) return false;
    if (!needle) return true;
    return `${v.patientRef} ${v.id} ${v.services.map((s) => s.name).join(" ")} ${agentName(v.agentId) ?? ""} ${getBranch(v.branchId)?.name}`.toLowerCase().includes(needle);
  });
  const pages = Math.max(1, Math.ceil(rows.length / f.pageSize));
  const page = Math.min(f.page, pages);
  const visible = rows.slice((page - 1) * f.pageSize, page * f.pageSize);
  const multiDay = f.range.days > 1;
  const billed = sumBy(rows, (v) => v.billed);
  const paid = sumBy(rows, (v) => v.paid);
  const balance = sumBy(rows, (v) => v.billed - v.paid);
  const showBranch = MULTI_BRANCH && f.branchId === "all";
  const branchLabel = f.branchId === "all" ? "All branches" : `${getBranch(f.branchId)?.name} branch`;

  return (
    <>
    <Modal
      open={open}
      onClose={onClose}
      xl
      icon={Users}
      title={`Patients · ${f.isDay ? "Selected day" : periodLabel(f.period)}`}
      description={`${rangeText(f.range)} · ${branchLabel}`}
      footer={
        <>
          <span className="left">Demonstration data · patients shown as anonymous references (no patient records were exported)</span>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button
            onClick={() => {
              onClose();
              navigate("/patients");
            }}
          >
            Open Patients <ArrowRight size={15} />
          </Button>
        </>
      }
    >
      <FilterBar
        f={f}
        basePeriod={basePeriod}
        searchPlaceholder="Patient ref, service or referrer"
        dirty={type !== "all" || f.branchId !== (defaultBranch(baseBranchIds))}
        onReset={() => {
          f.setPeriod(basePeriod);
          f.setBranchId(defaultBranch(baseBranchIds));
          f.setQ("");
          setType("all");
          f.setPage(1);
        }}
        extra={
          <div className="rf-filter">
            <span>Visit type</span>
            <Segmented
              label="Visit type"
              value={type}
              onChange={(v) => {
                setType(v);
                f.setPage(1);
              }}
              options={[
                { value: "all", label: "All" },
                { value: "new", label: "New" },
                { value: "returning", label: "Returning" },
                { value: "referred", label: "Referred" },
              ]}
            />
          </div>
        }
      />

      <SummaryChips
        items={[
          { label: "Patients", icon: Users, value: formatCount(rows.length), caption: `${formatCount(rows.filter((v) => v.isNew).length)} new · ${formatCount(rows.filter((v) => v.agentId !== null).length)} referred` },
          { label: "Billed", icon: Banknote, value: moneyText(billed), caption: "Diagnostics billed to these patients" },
          { label: "Paid at visit", icon: Wallet, value: moneyText(paid), caption: `${formatCount(rows.filter((v) => v.payment === "Paid").length)} fully paid` },
          {
            label: "Balance",
            icon: CircleAlert,
            value: moneyText(balance),
            caption: `${formatCount(rows.filter((v) => v.payment !== "Paid").length)} with a balance`,
            tone: moneyEntries(balance).some(([, v]) => v > 0) ? "danger" : undefined,
          },
        ]}
      />

      <div className="card bp-card rf-table-card">
        <div className="table-wrap thin-scroll">
          <table className="bp-table rf-table ep-table" aria-label="Patients">
            <thead>
              <tr>
                <th>{multiDay ? "Date & time" : "Time"}</th>
                <th>Patient</th>
                <th>Diagnostics</th>
                {showBranch && <th>Branch</th>}
                <th>Referred by</th>
                <th className="right">Billed</th>
                <th className="right">Paid</th>
                <th>Payment</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={showBranch ? 8 : 7}>
                    <EmptyState title={needle ? `No patients match “${f.q}”` : "No patients in this period"} />
                  </td>
                </tr>
              ) : (
                visible.map((v) => {
                  const c = currencyOf(v.branchId);
                  const ref = agentName(v.agentId);
                  return (
                    <tr key={v.id} className="pr-row" {...clickable(() => setViewing(v))} aria-label={`Open visit record for ${v.patientRef}`}>
                      <td className="num ep-nowrap">{when(v.at, multiDay)}</td>
                      <td>
                        <span className="ep-patient">
                          <strong>{v.patientRef}</strong>
                          <Badge tone={v.isNew ? "brand" : "neutral"}>{v.isNew ? "New" : "Returning"}</Badge>
                        </span>
                        <small className="ep-sub mono">{v.id}</small>
                      </td>
                      <td className="ep-services" title={v.services.map((s) => `${s.name} — ${formatMoney(s.price, c)}`).join("\n")}>
                        {v.services[0]?.name ?? "—"}
                        {v.services.length > 1 && <span className="ep-more">+{v.services.length - 1} more</span>}
                        <small className="ep-sub">
                          {v.services.length} test{v.services.length === 1 ? "" : "s"}
                        </small>
                      </td>
                      {showBranch && (
                        <td>
                          {getBranch(v.branchId)?.name} <span className="currency-chip">{c}</span>
                        </td>
                      )}
                      <td>{ref ?? <span className="lg-muted">Walk-in</span>}</td>
                      <td className="right num strong ep-nowrap">{formatMoney(v.billed, c)}</td>
                      <td className="right num ep-nowrap">{formatMoney(v.paid, c)}</td>
                      <td>
                        <Badge tone={v.payment === "Paid" ? "ok" : v.payment === "Part-paid" ? "warn" : "danger"} dot>
                          {v.payment}
                        </Badge>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={page}
          pageSize={f.pageSize}
          sizes={[10, 25, 50]}
          total={rows.length}
          noun="patients"
          onPage={(p) => f.setPage(Math.min(Math.max(1, p), pages))}
          onPageSize={(s) => {
            f.setPageSize(s);
            f.setPage(1);
          }}
        />
      </div>
    </Modal>
    {viewing && <PatientRecordModal visit={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}

/* ─────────────── Expenses modal ─────────────── */

function ExpensesModal({ open, basePeriod, baseBranchIds, onClose }: { open: boolean; basePeriod: PeriodSelection; baseBranchIds: string[]; onClose: () => void }) {
  const { navigate } = useApp();
  const f = useModalFilters(basePeriod, baseBranchIds);
  const [category, setCategory] = useState("all");

  const all = useMemo(() => expenseLines(f.ids, f.range), [f.ids, f.range]);
  const needle = f.q.trim().toLowerCase();
  const rows = all.filter((l) => (category === "all" || l.category === category) && (!needle || `${l.id} ${l.description} ${l.category} ${getBranch(l.branchId)?.name}`.toLowerCase().includes(needle)));
  const pages = Math.max(1, Math.ceil(rows.length / f.pageSize));
  const page = Math.min(f.page, pages);
  const visible = rows.slice((page - 1) * f.pageSize, page * f.pageSize);
  const multiDay = f.range.days > 1;
  const total = sumBy(rows, (l) => l.amount);
  const largest = [...rows].sort((a, b) => b.amount - a.amount)[0];
  const showBranch = MULTI_BRANCH && f.branchId === "all";
  const branchLabel = f.branchId === "all" ? "All branches" : `${getBranch(f.branchId)?.name} branch`;
  const baseBranch = defaultBranch(baseBranchIds);

  return (
    <Modal
      open={open}
      onClose={onClose}
      xl
      icon={Receipt}
      title={`Expenses · ${f.isDay ? "Selected day" : periodLabel(f.period)}`}
      description={`${rangeText(f.range)} · ${branchLabel}`}
      footer={
        <>
          <span className="left">Demonstration data · only approved expenses count towards totals</span>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button
            onClick={() => {
              onClose();
              navigate("/finance?tab=expenses");
            }}
          >
            Open Finance & Expenses <ArrowRight size={15} />
          </Button>
        </>
      }
    >
      <FilterBar
        f={f}
        basePeriod={basePeriod}
        searchPlaceholder="Description, reference or category"
        dirty={category !== "all" || f.branchId !== baseBranch}
        onReset={() => {
          f.setPeriod(basePeriod);
          f.setBranchId(baseBranch);
          f.setQ("");
          setCategory("all");
          f.setPage(1);
        }}
        extra={
          <div className="rf-filter">
            <span>Category</span>
            <SelectMenu
              value={category}
              ariaLabel="Expense category"
              className="select-btn rf-select"
              options={[{ value: "all", label: "All categories" }, ...EXPENSE_CATEGORIES.map((c) => ({ value: c as string, label: c }))]}
              onChange={(v: string) => {
                setCategory(v);
                f.setPage(1);
              }}
            />
          </div>
        }
      />

      <SummaryChips
        items={[
          { label: "Total expenses", icon: Receipt, value: moneyText(total), caption: "Approved expenses in this view" },
          { label: "Expense lines", icon: ListOrdered, value: formatCount(rows.length), caption: (() => {
              const n = new Set(rows.map((r) => r.category)).size;
              return `${n} ${n === 1 ? "category" : "categories"}`;
            })(),
          },
          {
            label: "Largest expense",
            icon: TrendingUp,
            value: largest ? formatMoney(largest.amount, currencyOf(largest.branchId)) : "—",
            caption: largest ? `${largest.description} · ${largest.category}` : "No expenses in this view",
          },
        ]}
      />

      <div className="card bp-card rf-table-card">
        <div className="table-wrap thin-scroll">
          <table className="bp-table rf-table ep-table" aria-label="Expenses">
            <thead>
              <tr>
                <th>{multiDay ? "Date & time" : "Time"}</th>
                <th>Expense</th>
                <th>Category</th>
                {showBranch && <th>Branch</th>}
                <th className="right">Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={showBranch ? 6 : 5}>
                    <EmptyState title={needle ? `No expenses match “${f.q}”` : "No expenses in this period"} />
                  </td>
                </tr>
              ) : (
                visible.map((l) => {
                  const c = currencyOf(l.branchId);
                  return (
                    <tr key={l.id}>
                      <td className="num ep-nowrap">{when(l.at, multiDay)}</td>
                      <td>
                        <strong>{l.description}</strong>
                        <small className="ep-sub mono">{l.id}</small>
                      </td>
                      <td>{l.category}</td>
                      {showBranch && (
                        <td>
                          {getBranch(l.branchId)?.name} <span className="currency-chip">{c}</span>
                        </td>
                      )}
                      <td className="right num strong ep-nowrap">{formatMoney(l.amount, c)}</td>
                      <td>
                        <Badge tone="ok" dot>
                          {l.status}
                        </Badge>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={page}
          pageSize={f.pageSize}
          sizes={[10, 25, 50]}
          total={rows.length}
          noun="expenses"
          onPage={(p) => f.setPage(Math.min(Math.max(1, p), pages))}
          onPageSize={(s) => {
            f.setPageSize(s);
            f.setPage(1);
          }}
        />
      </div>
    </Modal>
  );
}
