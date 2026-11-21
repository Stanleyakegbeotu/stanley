/**
 * Finance & Expenses for one branch (Company Admin, read only).
 *
 *  1. Financial position — Today / This month / This year: money in, costs,
 *     net profit, margin, balances recovered and the outstanding position.
 *  2. Analysis for any period (quick periods or back-dated ranges): income vs
 *     costs, net profit trend, where income came from, payment methods,
 *     expense categories, revenue by service and outstanding ageing.
 *  3. Finance log — every income (patient bill or recovered balance) and every
 *     expense (category, item, PR commission) with its source. Income rows open
 *     the shared patient visit record.
 *  4. Outstanding balances — who still owes, how much has been recovered.
 *
 * Cash basis: income = money received; costs = approved expenses + accrued PR
 * commission (placeholder rate); net profit = income − costs.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, Banknote, CalendarDays, CalendarRange, CircleAlert, Clock3, HandCoins, Percent, Receipt, RotateCcw, Scale, TrendingDown, TrendingUp, Wallet, type LucideIcon } from "lucide-react";
import { getBranch } from "@/data/company";
import type { DateRange, PeriodSelection } from "@/data/types";
import { PAYMENT_METHODS } from "@/data/types";
import { ledger, openBalances, type LedgerEntry, type PatientVisit } from "@/data/demo/dailyLines";
import { financeTotals, financeTrend, type FinanceTotals } from "@/services/finance";
import { periodLabel, resolveRange, serviceRanking } from "@/services/analytics";
import { DEMO_PR_COMMISSION_RATE } from "@/services/businessRules";
import { Reveal, useMotionPreset } from "@/shared/motion";
import { formatCount, formatMoney, formatShortDate, formatTime } from "@/shared/format";
import { AreaLineChart, CHART_COLORS, Donut, HBarList } from "@/shared/ui/charts";
import { Badge, Button, EmptyState, Segmented, SelectMenu } from "@/shared/ui/controls";
import { Modal } from "@/shared/ui/Modal";
import { Pagination } from "@/shared/ui/Pagination";
import { CardHead, FilterBar, SummaryChips, useModalFilters } from "@/features/dashboard/ExpensesPatients";
import { rangeText } from "@/features/dashboard/WelcomeBanner";
import { PatientRecordModal } from "@/features/shared/PatientRecord";

export type LogType = "all" | "income" | "recovered" | "expenses" | "commission";

const BASE_PERIOD: PeriodSelection = { key: "month" };

export function FinanceWorkspace({ branchId, initialLog = "all", focusOutstanding = false }: { branchId: string; initialLog?: LogType; focusOutstanding?: boolean }) {
  const branch = getBranch(branchId);
  const c = branch?.currency ?? "NGN";
  const money = (n: number, compact = false) => formatMoney(n, c, compact);
  const ids = useMemo(() => [branchId], [branchId]);
  const f = useModalFilters(BASE_PERIOD, ids);
  const [logType, setLogType] = useState<LogType>(initialLog);
  const [viewing, setViewing] = useState<PatientVisit | null>(null);
  const [expense, setExpense] = useState<LedgerEntry | null>(null);
  const outRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (focusOutstanding) outRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focusOutstanding]);

  // Fixed position cards (independent of the analysis filter).
  const position = useMemo(
    () =>
      (["today", "month", "year"] as const).map((key) => {
        const range = resolveRange({ key });
        return { key, range, t: financeTotals(branchId, range), openBills: openBalances(branchId, range.to).length };
      }),
    [branchId],
  );

  const label = f.period.key === "custom" ? (f.isDay ? formatShortDate(f.range.from) : "Selected dates") : periodLabel(f.period);
  const t = useMemo(() => financeTotals(branchId, f.range), [branchId, f.range]);
  const tr = useMemo(() => financeTrend(branchId, f.range), [branchId, f.range]);
  const entries = useMemo(() => ledger(ids, f.range, DEMO_PR_COMMISSION_RATE), [ids, f.range]);
  const balances = useMemo(() => openBalances(branchId, f.range.to), [branchId, f.range]);
  const services = useMemo(
    () =>
      serviceRanking(ids, f.range)
        .map((x) => ({ name: x.name, count: x.count, value: x.revenue[c] ?? 0 }))
        .filter((x) => x.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 6),
    [ids, f.range, c],
  );
  const methods = useMemo(() => {
    const totals = PAYMENT_METHODS.map(() => 0);
    for (const e of entries) if (e.direction === "in" && e.method) totals[PAYMENT_METHODS.indexOf(e.method)] += e.amount;
    return PAYMENT_METHODS.map((m, i) => ({ label: m, value: totals[i] }));
  }, [entries]);

  const aging = balances.reduce(
    (a, b) => {
      if (b.ageDays <= 30) a[0] += b.remaining;
      else if (b.ageDays <= 60) a[1] += b.remaining;
      else if (b.ageDays <= 90) a[2] += b.remaining;
      else a[3] += b.remaining;
      return a;
    },
    [0, 0, 0, 0],
  );
  const agingSegs = [
    { label: "0–30 days", value: aging[0], color: "var(--brand-400)" },
    { label: "31–60 days", value: aging[1], color: "var(--warn)" },
    { label: "61–90 days", value: aging[2], color: "var(--kpi-orange)" },
    { label: "Over 90 days", value: aging[3], color: "var(--danger)" },
  ];
  const agingTotal = aging.reduce((a, b) => a + b, 0);

  return (
    <div className="inv fin">
      {/* 1 ── Financial position */}
      <section className="inv-section">
        <header className="inv-section-head">
          <h3>Financial position</h3>
          <span>Money received, costs and net profit · cash basis</span>
        </header>
        <Reveal mode="stagger" className="fin-periods">
          {position.map((p) => (
            <PositionCard key={p.key} title={p.key === "today" ? "Today" : p.key === "month" ? "This month" : "This year"} range={p.range} t={p.t} openBills={p.openBills} money={money} />
          ))}
        </Reveal>
      </section>

      {/* 2 ── Analysis */}
      <section className="inv-section">
        <header className="inv-section-head">
          <h3>Analysis · {label}</h3>
          <span>{rangeText(f.range)} · filter applies to the charts, the finance log and outstanding balances</span>
        </header>
        <div className="fin-stack">
          <FilterBar
            f={f}
            basePeriod={BASE_PERIOD}
            branchSelect={false}
            allowRange
            searchPlaceholder="Reference, patient, test, expense item or method"
            dirty={logType !== "all"}
            onReset={() => {
              f.setPeriod(BASE_PERIOD);
              f.setQ("");
              setLogType("all");
              f.setPage(1);
            }}
            extra={
              <div className="rf-filter">
                <span>Finance log</span>
                <Segmented
                  label="Finance log type"
                  value={logType}
                  onChange={(v) => {
                    setLogType(v);
                    f.setPage(1);
                  }}
                  options={[
                    { value: "all", label: "All" },
                    { value: "income", label: "Income" },
                    { value: "recovered", label: "Recovered" },
                    { value: "expenses", label: "Expenses" },
                    { value: "commission", label: "PR commission" },
                  ]}
                />
              </div>
            }
          />

          <SummaryChips
            items={[
              { label: `Money in · ${label}`, icon: ArrowDownRight, value: money(t.income), caption: `${money(t.paidAtVisit, true)} at visits · ${money(t.recovered, true)} recovered` },
              { label: `Costs · ${label}`, icon: ArrowUpRight, value: money(t.costs), caption: `${money(t.expenses, true)} expenses · ${money(t.commission, true)} PR commission` },
              {
                label: `Net profit · ${label}`,
                icon: t.net >= 0 ? TrendingUp : TrendingDown,
                value: money(t.net),
                caption: t.margin === null ? "No income in this period" : `${t.margin.toFixed(1)}% margin on money received`,
                tone: t.net < 0 ? "danger" : undefined,
              },
              { label: "Outstanding at period end", icon: CircleAlert, value: money(t.outstanding), caption: `${formatCount(balances.length)} open bills · ${money(t.billed, true)} billed in period` },
            ]}
          />

          <Reveal mode="stagger" className="analytics-grid">
            <Reveal hover className="card card-pad span-8">
              <div className="card-head">
                <div>
                  <h3>Income vs costs</h3>
                  <p>{tr.note} · costs = expenses + PR commission</p>
                </div>
                <div className="chart-legend">
                  <span>
                    <i style={{ background: "var(--brand-600)" }} />
                    Money in
                  </span>
                  <span>
                    <i style={{ background: "var(--kpi-orange)" }} />
                    Costs
                  </span>
                  <span>
                    <i style={{ background: "var(--brand-400)" }} />
                    Billed
                  </span>
                </div>
              </div>
              <AreaLineChart
                labels={tr.labels}
                format={(n) => money(n, true)}
                series={[
                  { key: "in", label: "Money in", color: "var(--brand-600)", values: tr.income, area: true },
                  { key: "cost", label: "Costs", color: "var(--kpi-orange)", values: tr.costs, dashed: true },
                  { key: "bill", label: "Billed", color: "var(--brand-400)", values: tr.billed },
                ]}
              />
            </Reveal>

            <Reveal hover className="card card-pad span-4">
              <div className="card-head">
                <div>
                  <h3>Where the money came from</h3>
                  <p>Paid at the visit vs older balances recovered</p>
                </div>
              </div>
              <Donut
                centerLabel="Money in"
                centerValue={money(t.income, true)}
                format={(n) => money(n, true)}
                segments={[
                  { label: "Paid at visit", value: t.paidAtVisit, color: "var(--brand-600)" },
                  { label: "Recovered", value: t.recovered, color: "var(--brand-400)" },
                ]}
              />
            </Reveal>

            <Reveal hover className="card card-pad span-8">
              <div className="card-head">
                <div>
                  <h3>Net profit trend</h3>
                  <p>{tr.note} · money in minus costs. Bars below the line are losses (e.g. salary days).</p>
                </div>
              </div>
              <ProfitBars labels={tr.labels} values={tr.net} format={(n) => money(n, true)} />
            </Reveal>

            <Reveal hover className="card card-pad span-4">
              <div className="card-head">
                <div>
                  <h3>Payment methods</h3>
                  <p>Money received by method · from the finance log</p>
                </div>
              </div>
              <Donut centerLabel="Received" centerValue={money(t.income, true)} format={(n) => money(n, true)} segments={methods.map((x, i) => ({ label: x.label, value: x.value, color: CHART_COLORS[i] }))} />
            </Reveal>

            <Reveal hover className="card card-pad span-4">
              <div className="card-head">
                <div>
                  <h3>Where the money went</h3>
                  <p>Approved expenses by category and PR commission</p>
                </div>
              </div>
              {t.costs > 0 ? (
                <HBarList
                  items={[...t.expensesByCategory, { label: "PR commission", value: t.commission }]
                    .filter((x) => x.value > 0)
                    .sort((a, b) => b.value - a.value)
                    .map((x) => ({ label: x.label, value: x.value, display: money(x.value, true), hint: `${t.costs ? Math.round((x.value / t.costs) * 100) : 0}% of costs`, color: "var(--kpi-orange)" }))}
                />
              ) : (
                <div className="empty">No costs in this period.</div>
              )}
            </Reveal>

            <Reveal hover className="card card-pad span-4">
              <div className="card-head">
                <div>
                  <h3>Revenue by diagnostic service</h3>
                  <p>Billed value · top 6 services</p>
                </div>
              </div>
              {services.length ? (
                <HBarList items={services.map((x) => ({ label: x.name, value: x.value, display: money(x.value, true), hint: `${formatCount(x.count)} performed`, color: "var(--brand-500)" }))} />
              ) : (
                <div className="empty">No services billed in this period.</div>
              )}
            </Reveal>

            <Reveal hover className="card card-pad span-4">
              <div className="card-head">
                <div>
                  <h3>Outstanding balances</h3>
                  <p>Owed by patients on {formatShortDate(f.range.to)} · by age</p>
                </div>
              </div>
              <div className="metric-row">
                <div>
                  <span>Outstanding</span>
                  <strong>{money(t.outstanding, true)}</strong>
                </div>
                <div>
                  <span>Recovered</span>
                  <strong>{money(t.recovered, true)}</strong>
                </div>
                <div>
                  <span>Open bills</span>
                  <strong>{formatCount(balances.length)}</strong>
                </div>
              </div>
              <div className="hint">Ageing of outstanding balances</div>
              <div className="aging" role="img" aria-label="Outstanding balance ageing">
                {agingSegs.map((a) => (a.value > 0 ? <div key={a.label} style={{ flex: agingTotal ? a.value / agingTotal : 0, background: a.color }} title={`${a.label}: ${money(a.value)}`} /> : null))}
              </div>
              <div className="aging-legend">
                {agingSegs.map((a) => (
                  <div key={a.label}>
                    <i style={{ background: a.color }} />
                    <span>{a.label}</span>
                    <b>{money(a.value, true)}</b>
                  </div>
                ))}
              </div>
            </Reveal>
          </Reveal>
        </div>
      </section>

      {/* 3 ── Finance log */}
      <FinanceLog entries={entries} type={logType} q={f.q} label={label} range={f.range} money={money} page={f.page} setPage={f.setPage} pageSize={f.pageSize} setPageSize={f.setPageSize} onVisit={setViewing} onExpense={setExpense} />

      {/* 4 ── Outstanding balances */}
      <section className="inv-section" ref={outRef}>
        <header className="inv-section-head">
          <h3>Outstanding patient balances</h3>
          <span>Bills still owed on {formatShortDate(f.range.to)} {f.range.to.getFullYear()} · oldest are recovered first</span>
        </header>
        <OutstandingTable balances={balances} money={money} onOpen={setViewing} />
      </section>

      <p className="lg-muted" style={{ fontSize: 13 }}>
        Read-only for Company Admin. Demonstration activity built from the real catalogue, prices and PR agents; it reconciles line by line. PR commission uses the placeholder rate ({Math.round(DEMO_PR_COMMISSION_RATE * 100)}%) until the real rate is confirmed.
      </p>

      {viewing && <PatientRecordModal visit={viewing} onClose={() => setViewing(null)} />}
      <ExpenseDetail entry={expense} money={money} onClose={() => setExpense(null)} />
    </div>
  );
}

/* ─────────────── Position card (Today / Month / Year) ─────────────── */

function PositionCard({ title, range, t, openBills, money }: { title: string; range: DateRange; t: FinanceTotals; openBills: number; money: (n: number, compact?: boolean) => string }) {
  const m = useMotionPreset();
  const Icon = title === "Today" ? Clock3 : title === "This month" ? CalendarDays : CalendarRange;
  const costShare = t.income > 0 ? Math.min(100, (t.costs / t.income) * 100) : t.costs > 0 ? 100 : 0;
  const rows: { icon: LucideIcon; label: string; value: string; sub?: string; tone?: "out" | "due" }[] = [
    { icon: Wallet, label: "Money in", value: money(t.income), sub: `${money(t.paidAtVisit, true)} at visits · ${money(t.recovered, true)} recovered` },
    { icon: Receipt, label: "Expenses", value: `− ${money(t.expenses)}`, tone: "out" },
    { icon: HandCoins, label: "PR commission", value: `− ${money(t.commission)}`, sub: "Accrued · placeholder rate", tone: "out" },
    { icon: Banknote, label: "Billed (revenue)", value: money(t.billed), sub: `${formatCount(t.patients)} patients` },
    { icon: RotateCcw, label: "Balances recovered", value: money(t.recovered) },
    { icon: Scale, label: "Outstanding (end)", value: money(t.outstanding), sub: `${formatCount(openBills)} open bills`, tone: "due" },
  ];
  return (
    <motion.article className="card dcard accent-theme fin-pos" variants={m.revealItem} whileHover={m.cardHover}>
      <CardHead icon={Icon} title={title} sub={rangeText(range)} periodText={t.margin === null ? "No income" : `${t.margin.toFixed(1)}% margin`} />
      <div className="fin-pos-body">
        <div className={`fin-net ${t.net < 0 ? "is-loss" : ""}`}>
          <span>Net profit</span>
          <strong className="num">{money(t.net)}</strong>
          <small>Money in − expenses − PR commission</small>
        </div>
        <div className="fin-ratio" aria-label={`Costs are ${Math.round(costShare)}% of money in`}>
          <div className="fin-ratio-bar">
            <i style={{ width: `${costShare}%` }} />
          </div>
          <span>
            Costs use <b>{Math.round(costShare)}%</b> of money in
          </span>
        </div>
        <ul className="fin-rows">
          {rows.map((r) => (
            <li key={r.label} className={r.tone ? `is-${r.tone}` : ""}>
              <r.icon size={16} aria-hidden="true" />
              <span>
                {r.label}
                {r.sub && <small>{r.sub}</small>}
              </span>
              <b className="num">{r.value}</b>
            </li>
          ))}
        </ul>
      </div>
    </motion.article>
  );
}

/* ─────────────── Profit / loss bars (handles negatives) ─────────────── */

function ProfitBars({ labels, values, format }: { labels: string[]; values: number[]; format: (n: number) => string }) {
  const reduced = useReducedMotion();
  const max = Math.max(1, ...values.map((v) => Math.max(0, v)));
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const zero = (max / span) * 100; // % from the top
  const tickEvery = Math.max(1, Math.ceil(labels.length / 8));
  const best = values.length ? Math.max(...values) : 0;
  const worst = values.length ? Math.min(...values) : 0;
  return (
    <div className="fin-bars-wrap">
      <div className="fin-bars" role="img" aria-label="Net profit by period">
        <i className="fin-zero" style={{ top: `${zero}%` }} />
        {values.map((v, i) => (
          <div key={i} className="fin-bar" title={`${labels[i]}: ${format(v)}`}>
            <motion.span
              className={v < 0 ? "is-loss" : ""}
              style={v >= 0 ? { bottom: `${100 - zero}%`, height: `${(v / span) * 100}%`, transformOrigin: "bottom" } : { top: `${zero}%`, height: `${(-v / span) * 100}%`, transformOrigin: "top" }}
              initial={reduced ? false : { scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ duration: 0.5, delay: reduced ? 0 : 0.05 + i * 0.012 }}
            />
            {i % tickEvery === 0 && <small>{labels[i]}</small>}
          </div>
        ))}
      </div>
      <div className="fin-bars-foot">
        <span>
          Best <b className="num">{format(best)}</b>
        </span>
        <span>
          {worst < 0 ? "Largest loss" : "Lowest"} <b className={`num ${worst < 0 ? "is-loss" : ""}`}>{format(worst)}</b>
        </span>
        <span>
          {values.filter((v) => v < 0).length} of {values.length} periods at a loss
        </span>
      </div>
    </div>
  );
}

/* ─────────────── Finance log ─────────────── */

const KIND_LABEL: Record<LedgerEntry["kind"], string> = { visit: "Patient bill", recovery: "Recovered", expense: "Expense", commission: "PR commission" };

function FinanceLog({
  entries,
  type,
  q,
  label,
  range,
  money,
  page,
  setPage,
  pageSize,
  setPageSize,
  onVisit,
  onExpense,
}: {
  entries: LedgerEntry[];
  type: LogType;
  q: string;
  label: string;
  range: DateRange;
  money: (n: number, compact?: boolean) => string;
  page: number;
  setPage: (n: number) => void;
  pageSize: number;
  setPageSize: (n: number) => void;
  onVisit: (v: PatientVisit) => void;
  onExpense: (e: LedgerEntry) => void;
}) {
  const [sort, setSort] = useState<"newest" | "oldest" | "largest">("newest");
  const needle = q.trim().toLowerCase();
  const rows = entries
    .filter((e) => {
      if (type === "income" && e.direction !== "in") return false;
      if (type === "recovered" && e.kind !== "recovery") return false;
      if (type === "expenses" && e.kind !== "expense") return false;
      if (type === "commission" && e.kind !== "commission") return false;
      if (!needle) return true;
      return `${e.id} ${e.source} ${e.detail} ${e.category} ${e.method ?? ""} ${e.recordedBy} ${e.visit?.id ?? ""}`.toLowerCase().includes(needle);
    })
    .sort((a, b) => (sort === "largest" ? b.amount - a.amount : sort === "oldest" ? a.at.getTime() - b.at.getTime() : b.at.getTime() - a.at.getTime()));
  const totalIn = rows.reduce((s, e) => s + (e.direction === "in" ? e.amount : 0), 0);
  const totalOut = rows.reduce((s, e) => s + (e.direction === "out" ? e.amount : 0), 0);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safe = Math.min(page, pages);
  const visible = rows.slice((safe - 1) * pageSize, safe * pageSize);
  const multiDay = range.days > 1;
  const open = (e: LedgerEntry) => (e.visit ? onVisit(e.visit) : onExpense(e));

  return (
    <section className="inv-section">
      <header className="inv-section-head">
        <h3>Finance log · {label}</h3>
        <span>Every naira in and out, with its source · select an entry for details</span>
      </header>
      <div className="card bp-card rf-table-card">
        <div className="inv-table-tools fin-log-tools">
          <span className="fin-tot is-in">
            In <b className="num">{money(totalIn)}</b>
          </span>
          <span className="fin-tot is-out">
            Out <b className="num">{money(totalOut)}</b>
          </span>
          <span className={`fin-tot ${totalIn - totalOut < 0 ? "is-out" : "is-net"}`}>
            Net <b className="num">{money(totalIn - totalOut)}</b>
          </span>
          <span className="inv-count">{formatCount(rows.length)} entries</span>
          <SelectMenu
            value={sort}
            ariaLabel="Sort finance log"
            className="select-btn inv-sort"
            options={[
              { value: "newest", label: "Newest first" },
              { value: "oldest", label: "Oldest first" },
              { value: "largest", label: "Largest amount" },
            ]}
            onChange={(v: "newest" | "oldest" | "largest") => {
              setSort(v);
              setPage(1);
            }}
          />
        </div>
        <div className="table-wrap thin-scroll">
          <table className="bp-table rf-table ep-table fin-log" aria-label="Finance log">
            <thead>
              <tr>
                <th>{multiDay ? "Date & time" : "Time"}</th>
                <th>Type</th>
                <th>Source</th>
                <th>Category</th>
                <th>Method</th>
                <th>Recorded by</th>
                <th className="right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState title={needle || type !== "all" ? "No entries match these filters" : "No money in or out in this period"} />
                  </td>
                </tr>
              ) : (
                visible.map((e) => (
                  <tr key={e.id} className="pr-row" tabIndex={0} onClick={() => open(e)} onKeyDown={(k) => (k.key === "Enter" || k.key === " ") && (k.preventDefault(), open(e))} aria-label={`${KIND_LABEL[e.kind]} ${e.id} — open details`}>
                    <td className="num ep-nowrap">
                      {multiDay ? `${formatShortDate(e.at)} · ${formatTime(e.at)}` : formatTime(e.at)}
                      <small className="ep-sub mono">{e.id}</small>
                    </td>
                    <td>
                      <Badge tone={e.kind === "visit" ? "ok" : e.kind === "recovery" ? "brand" : e.kind === "commission" ? "info" : "warn"} dot>
                        {KIND_LABEL[e.kind]}
                      </Badge>
                    </td>
                    <td className="fin-src">
                      <strong>{e.source}</strong>
                      <small className="ep-sub" title={e.detail}>
                        {e.detail}
                      </small>
                    </td>
                    <td>{e.category}</td>
                    <td>{e.method ?? <span className="lg-muted">—</span>}</td>
                    <td>{e.recordedBy}</td>
                    <td className={`right num strong ep-nowrap fin-amt ${e.direction === "in" ? "is-in" : "is-out"}`}>
                      {e.direction === "in" ? "+" : "−"} {money(e.amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={safe}
          pageSize={pageSize}
          sizes={[10, 25, 50, 100]}
          total={rows.length}
          noun="entries"
          onPage={(n) => setPage(Math.min(Math.max(1, n), pages))}
          onPageSize={(s) => {
            setPageSize(s);
            setPage(1);
          }}
        />
      </div>
    </section>
  );
}

/* ─────────────── Outstanding balances ─────────────── */

function OutstandingTable({ balances, money, onOpen }: { balances: ReturnType<typeof openBalances>; money: (n: number, compact?: boolean) => string; onOpen: (v: PatientVisit) => void }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState<"oldest" | "largest">("largest");
  const rows = [...balances].sort((a, b) => (sort === "largest" ? b.remaining - a.remaining : b.ageDays - a.ageDays));
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safe = Math.min(page, pages);
  const visible = rows.slice((safe - 1) * pageSize, safe * pageSize);
  const total = rows.reduce((s, b) => s + b.remaining, 0);
  const repaid = rows.reduce((s, b) => s + b.repaid, 0);
  return (
    <div className="card bp-card rf-table-card">
      <div className="inv-table-tools fin-log-tools">
        <span className="fin-tot is-out">
          Still owed <b className="num">{money(total)}</b>
        </span>
        <span className="fin-tot is-net">
          Already recovered on these bills <b className="num">{money(repaid)}</b>
        </span>
        <span className="inv-count">{formatCount(rows.length)} open bills</span>
        <SelectMenu
          value={sort}
          ariaLabel="Sort outstanding balances"
          className="select-btn inv-sort"
          options={[
            { value: "largest", label: "Largest balance" },
            { value: "oldest", label: "Oldest first" },
          ]}
          onChange={(v: "oldest" | "largest") => {
            setSort(v);
            setPage(1);
          }}
        />
      </div>
      <div className="table-wrap thin-scroll">
        <table className="bp-table rf-table ep-table" aria-label="Outstanding patient balances">
          <thead>
            <tr>
              <th>Patient</th>
              <th>Visit</th>
              <th className="right">Age</th>
              <th className="right">Billed</th>
              <th className="right">Owed after visit</th>
              <th className="right">Recovered since</th>
              <th className="right">Still owed</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <EmptyState title="No outstanding balances" />
                </td>
              </tr>
            ) : (
              visible.map((b) => (
                <tr key={b.visit.id} className="pr-row" tabIndex={0} onClick={() => onOpen(b.visit)} onKeyDown={(k) => (k.key === "Enter" || k.key === " ") && (k.preventDefault(), onOpen(b.visit))} aria-label={`Open visit record for ${b.visit.patientRef}`}>
                  <td>
                    <span className="ep-patient">
                      <strong>{b.visit.patientRef}</strong>
                      <Badge tone={b.repaid > 0 ? "warn" : "danger"}>{b.repaid > 0 ? "Paying" : b.visit.payment}</Badge>
                    </span>
                  </td>
                  <td className="num ep-nowrap">
                    {formatShortDate(b.visit.at)} {b.visit.at.getFullYear()}
                    <small className="ep-sub mono">{b.visit.id}</small>
                  </td>
                  <td className={`right num ${b.ageDays > 90 ? "fin-amt is-out" : ""}`}>{b.ageDays} d</td>
                  <td className="right num ep-nowrap">{money(b.visit.billed)}</td>
                  <td className="right num ep-nowrap">{money(b.owed)}</td>
                  <td className="right num ep-nowrap">{b.repaid > 0 ? money(b.repaid) : "—"}</td>
                  <td className="right num strong ep-nowrap fin-amt is-out">{money(b.remaining)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pagination
        page={safe}
        pageSize={pageSize}
        sizes={[10, 25, 50]}
        total={rows.length}
        noun="bills"
        onPage={(n) => setPage(Math.min(Math.max(1, n), pages))}
        onPageSize={(s) => {
          setPageSize(s);
          setPage(1);
        }}
      />
    </div>
  );
}

/* ─────────────── Expense / commission detail ─────────────── */

function ExpenseDetail({ entry, money, onClose }: { entry: LedgerEntry | null; money: (n: number, compact?: boolean) => string; onClose: () => void }) {
  const branch = entry ? getBranch(entry.branchId) : undefined;
  return (
    <Modal
      open={!!entry}
      onClose={onClose}
      icon={entry?.kind === "commission" ? Percent : Receipt}
      title={entry ? (entry.kind === "commission" ? "PR commission" : "Expense") : ""}
      description={entry ? `${entry.id} · ${entry.at.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}` : ""}
      footer={<Button onClick={onClose}>Done</Button>}
    >
      {entry && (
        <dl className="fin-detail">
          <div>
            <dt>Amount</dt>
            <dd className="num fin-amt is-out">− {money(entry.amount)}</dd>
          </div>
          <div>
            <dt>{entry.kind === "commission" ? "What it is for" : "Item"}</dt>
            <dd>{entry.source}</dd>
          </div>
          <div>
            <dt>Category</dt>
            <dd>{entry.category}</dd>
          </div>
          <div>
            <dt>Details</dt>
            <dd>{entry.detail}</dd>
          </div>
          <div>
            <dt>Recorded</dt>
            <dd>
              {formatTime(entry.at)} · {entry.recordedBy}
              {entry.kind === "expense" && <small>Name appears once staff accounts exist</small>}
            </dd>
          </div>
          <div>
            <dt>Branch</dt>
            <dd>
              {branch?.name} · {branch?.code}
            </dd>
          </div>
        </dl>
      )}
    </Modal>
  );
}
