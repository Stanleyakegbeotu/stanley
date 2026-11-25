import { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowDownRight, ArrowRight, ArrowUpRight, ChevronDown, ChevronRight, ChevronsUpDown, Info, Stethoscope, Hospital } from "lucide-react";
import { useApp } from "@/app/AppState";
import type { Currency, DateRange, Money } from "@/data/types";
import { CountUp, Reveal, useMotionPreset } from "@/shared/motion";
import { formatCount, formatMoney, formatPct } from "@/shared/format";
import { Badge, Button, SectionHeader } from "@/shared/ui/controls";
import { CHART_COLORS, Donut, HBarList } from "@/shared/ui/charts";
import { Modal } from "@/shared/ui/Modal";
import {
  branchPerformance,
  compareCount,
  compareMoney,
  doctorRanking,
  hospitalRanking,
  paymentMix,
  periodLabel,
  serviceRanking,
  type BranchPerformance,
} from "@/services/analytics";
import { rangeText } from "./WelcomeBanner";
import { BranchWorkspace } from "@/features/branch/BranchWorkspace";

type Direction = "higher-good" | "higher-bad" | "neutral";

function Change({ pct, direction = "higher-good", suffix = "" }: { pct: number | null; direction?: Direction; suffix?: string }) {
  if (pct == null) return <span className="bp-change">No prior data</span>;
  const up = pct >= 0;
  const tone = direction === "neutral" || Math.abs(pct) < 0.05 ? "" : up === (direction === "higher-good") ? "good" : "bad";
  return (
    <span className={`bp-change ${tone}`} title="Compared with the previous period of equal length">
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%{suffix}
    </span>
  );
}

const moneyPct = (cur: Money, prev: Money | null | undefined, c: Currency) => compareMoney(cur, prev ?? null)[c] ?? null;

/**
 * Branch Performance — one row per branch (consistent at any branch count).
 * Selecting a row opens that branch's full performance for the reporting period.
 */
export function BranchPerformanceSection({ range, focusId }: { range: DateRange; focusId: string | null }) {
  const { navigate } = useApp();
  const rows = useMemo(() => branchPerformance(range), [range]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const selected = rows.find((r) => r.branch.id === selectedId) ?? null;

  return (
    <>
      <SectionHeader
        eyebrow="Branch performance"
        title="Branch comparison"
        description="Select a branch to see its full performance for the reporting period. Click a column heading to sort; branches are ranked only within their recorded currency."
        demo
        actions={
          <Button variant="secondary" size="sm" onClick={() => navigate("/branches")}>
            All branches <ArrowRight size={15} />
          </Button>
        }
      />
      <BranchTable rows={rows} focusId={focusId} onOpen={setSelectedId} />
      <BranchPerformanceModal row={selected} range={range} onClose={() => setSelectedId(null)} onOpenWorkspace={(id) => setWorkspaceId(id)} />
      <BranchWorkspace branchId={workspaceId} open={workspaceId !== null} onClose={() => setWorkspaceId(null)} />
    </>
  );
}

/* ─────────────── Table ─────────────── */

type SortKey = "name" | "patients" | "orders" | "revenue" | "payments" | "outstanding" | "expenses" | "share" | "change";

const COLUMNS: { key: SortKey; label: string; numeric?: boolean; optional?: boolean }[] = [
  { key: "name", label: "Branch" },
  { key: "patients", label: "Patients", numeric: true },
  { key: "orders", label: "Orders", numeric: true, optional: true },
  { key: "revenue", label: "Revenue", numeric: true },
  { key: "payments", label: "Payments", numeric: true },
  { key: "outstanding", label: "Outstanding", numeric: true },
  { key: "expenses", label: "Expenses", numeric: true, optional: true },
  { key: "share", label: "Revenue share" },
  { key: "change", label: "vs prior", numeric: true },
];

const CURRENCY_NAME: Record<Currency, string> = { NGN: "Nigerian naira", GHS: "Ghanaian cedi" };

function sortValue(r: BranchPerformance, key: SortKey): number | string {
  const c = r.branch.currency;
  const s = r.summary!;
  switch (key) {
    case "name":
      return r.branch.name;
    case "patients":
      return s.patients;
    case "orders":
      return s.orders;
    case "revenue":
      return s.revenue[c] ?? 0;
    case "payments":
      return s.payments[c] ?? 0;
    case "outstanding":
      return s.outstanding[c] ?? 0;
    case "expenses":
      return s.expenses[c] ?? 0;
    case "share":
      return r.currencyShare ?? 0;
    case "change":
      return moneyPct(s.revenue, r.prior?.revenue, c) ?? Number.NEGATIVE_INFINITY;
  }
}

/** Sums within ONE currency group (never across currencies). */
function groupTotals(list: BranchPerformance[], c: Currency) {
  const sum = (f: (r: BranchPerformance) => number) => list.reduce((acc, r) => acc + f(r), 0);
  const revenue = sum((r) => r.summary!.revenue[c] ?? 0);
  const priors = list.map((r) => r.prior?.revenue[c]);
  const priorRevenue = priors.every((v) => v != null) ? priors.reduce<number>((a, b) => a + (b as number), 0) : null;
  return {
    patients: sum((r) => r.summary!.patients),
    orders: sum((r) => r.summary!.orders),
    revenue,
    payments: sum((r) => r.summary!.payments[c] ?? 0),
    outstanding: sum((r) => r.summary!.outstanding[c] ?? 0),
    expenses: sum((r) => r.summary!.expenses[c] ?? 0),
    change: priorRevenue && priorRevenue > 0 ? ((revenue - priorRevenue) / priorRevenue) * 100 : null,
  };
}

function abbreviation(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
}

function ChangePill({ pct }: { pct: number | null }) {
  if (pct == null)
    return (
      <span className="bp-pill" title="No prior-period data">
        —
      </span>
    );
  const flat = Math.abs(pct) < 0.05;
  const up = pct > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`bp-pill ${flat ? "" : up ? "good" : "bad"}`} title="Revenue compared with the previous period of equal length">
      {!flat && <Icon size={13} strokeWidth={2.4} />}
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

/** Two cells hidden on narrow windows keep every row's column count identical. */
const OptionalSpacers = () => (
  <>
    <td className="bp-opt" />
    <td className="bp-opt" />
  </>
);

function BranchTable({ rows, focusId, onOpen }: { rows: BranchPerformance[]; focusId: string | null; onOpen: (id: string) => void }) {
  const m = useMotionPreset();
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "revenue", dir: "desc" });

  const groups = useMemo(() => {
    const active = rows.filter((r) => r.summary);
    const cmp = (a: BranchPerformance, b: BranchPerformance) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      const d = typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return sort.dir === "asc" ? d : -d;
    };
    return (["NGN", "GHS"] as Currency[])
      .map((c) => {
        const list = active.filter((r) => r.branch.currency === c).sort(cmp);
        return { currency: c, list, totals: groupTotals(list, c) };
      })
      .filter((g) => g.list.length > 0);
  }, [rows, sort]);

  const inactive = rows.filter((r) => !r.summary);
  const activeCount = rows.length - inactive.length;

  const toggle = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" }));

  const branchCell = (r: BranchPerformance) => (
    <td>
      <button
        className="bp-branch"
        aria-haspopup="dialog"
        aria-label={`View ${r.branch.name} branch performance`}
        onClick={(e) => {
          e.stopPropagation();
          onOpen(r.branch.id);
        }}
      >
        <span className="bp-avatar" aria-hidden="true">
          {abbreviation(r.branch.name)}
        </span>
        <span className="bp-name">
          <strong>
            {r.branch.name}
            <i className={`bp-status ${r.summary ? "" : "off"}`} title={r.branch.status} />
          </strong>
          <small>
            {r.branch.city}, {r.branch.country}
          </small>
        </span>
      </button>
    </td>
  );

  return (
    <Reveal className="card bp-card">
      <div className="table-wrap thin-scroll">
        <table className="bp-table" aria-label="Branch performance">
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={[col.numeric ? "right" : "", col.optional ? "bp-opt" : ""].join(" ").trim() || undefined}
                  aria-sort={sort.key === col.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                >
                  <button className="bp-sort" onClick={() => toggle(col.key)}>
                    {col.label}
                    {sort.key === col.key ? <ChevronDown size={14} /> : <ChevronsUpDown size={14} />}
                  </button>
                </th>
              ))}
              <th aria-label="Open" />
            </tr>
          </thead>

          {groups.map((g) => {
            const c = g.currency;
            const fm = (n: number) => formatMoney(n, c, true);
            return (
              <motion.tbody key={c} variants={m.rowStagger} initial="hidden" animate="visible">
                <tr className="bp-group">
                  <td colSpan={8}>
                    <span className="bp-group-label">
                      <span className="currency-chip">{c}</span>
                      {CURRENCY_NAME[c]}
                      <small>
                        {g.list.length} branch{g.list.length === 1 ? "" : "es"} · ranked within {c}
                      </small>
                    </span>
                  </td>
                  <OptionalSpacers />
                </tr>

                {g.list.map((r) => {
                  const s = r.summary!;
                  return (
                    <motion.tr key={r.branch.id} variants={m.rowItem} className={`bp-row ${focusId === r.branch.id ? "is-focused" : ""}`} onClick={() => onOpen(r.branch.id)}>
                      {branchCell(r)}
                      <td className="right num">
                        <CountUp value={s.patients} format={formatCount} />
                      </td>
                      <td className="right num bp-opt">
                        <CountUp value={s.orders} format={formatCount} />
                      </td>
                      <td className="right num strong">
                        <CountUp value={s.revenue[c] ?? 0} format={fm} />
                      </td>
                      <td className="right num">
                        <CountUp value={s.payments[c] ?? 0} format={fm} />
                      </td>
                      <td className="right num">
                        <CountUp value={s.outstanding[c] ?? 0} format={fm} />
                      </td>
                      <td className="right num bp-opt">
                        <CountUp value={s.expenses[c] ?? 0} format={fm} />
                      </td>
                      <td>
                        <div className="bp-share" title={`Share of ${c} revenue, ranked #${r.rankInCurrency} among ${c} branches`}>
                          <span className="bp-bar">
                            <motion.i
                              style={{ width: `${Math.max(2, r.currencyShare ?? 0)}%` }}
                              initial={m.reduced ? false : { scaleX: 0 }}
                              whileInView={{ scaleX: 1 }} viewport={{ once: true, amount: 0.3 }}
                              transition={{ duration: 0.7, delay: 0.25 }}
                            />
                          </span>
                          <span className="bp-pct">{formatPct(r.currencyShare ?? 0, 0)}</span>
                          <span className="bp-rank">#{r.rankInCurrency}</span>
                        </div>
                      </td>
                      <td className="right">
                        <ChangePill pct={moneyPct(s.revenue, r.prior?.revenue, c)} />
                      </td>
                      <td className="right">
                        <ChevronRight size={17} className="bp-chev" />
                      </td>
                    </motion.tr>
                  );
                })}

                <tr className="bp-total">
                  <td>
                    <span className="bp-total-label">{c} total</span>
                  </td>
                  <td className="right num">{formatCount(g.totals.patients)}</td>
                  <td className="right num bp-opt">{formatCount(g.totals.orders)}</td>
                  <td className="right num">{fm(g.totals.revenue)}</td>
                  <td className="right num">{fm(g.totals.payments)}</td>
                  <td className="right num">{fm(g.totals.outstanding)}</td>
                  <td className="right num bp-opt">{fm(g.totals.expenses)}</td>
                  <td className="num">
                    <span className="bp-pct" style={{ textAlign: "left" }}>
                      100%
                    </span>
                  </td>
                  <td className="right">
                    <ChangePill pct={g.totals.change} />
                  </td>
                  <td />
                </tr>
              </motion.tbody>
            );
          })}

          {inactive.length > 0 && (
            <tbody>
              <tr className="bp-group muted">
                <td colSpan={8}>
                  <span className="bp-group-label">
                    Not yet operational
                    <small>Excluded from every company total until activated</small>
                  </span>
                </td>
                <OptionalSpacers />
              </tr>
              {inactive.map((r) => (
                <tr key={r.branch.id} className="bp-row is-inactive" onClick={() => onOpen(r.branch.id)}>
                  {branchCell(r)}
                  <td colSpan={6} className="bp-setup">
                    <Badge>Setup in progress</Badge>
                  </td>
                  <OptionalSpacers />
                  <td className="right">
                    <ChevronRight size={17} className="bp-chev" />
                  </td>
                </tr>
              ))}
            </tbody>
          )}
        </table>
      </div>
      <div className="bp-foot">
        <span>
          {rows.length} branches · {activeCount} active · amounts grouped by recorded currency
        </span>
        <span>Amounts are rounded — select a branch for exact figures</span>
      </div>
    </Reveal>
  );
}

/* ─────────────── Detail modal ─────────────── */

function BranchPerformanceModal({ row, range, onClose, onOpenWorkspace }: { row: BranchPerformance | null; range: DateRange; onClose: () => void; onOpenWorkspace: (branchId: string) => void }) {
  const { navigate, period } = useApp();
  // Keep the last branch while the dialog animates closed.
  const last = useRef<BranchPerformance | null>(null);
  if (row) last.current = row;
  const r = row ?? last.current;

  const detail = useMemo(() => {
    if (!r?.summary) return null;
    const ids = [r.branch.id];
    return {
      methods: paymentMix(ids, range, r.branch.currency),
      services: serviceRanking(ids, range).slice(0, 5),
      doctors: doctorRanking(ids, range).slice(0, 3),
      hospitals: hospitalRanking(ids, range).slice(0, 3),
    };
  }, [r, range]);

  if (!r) return null;
  const { branch, summary: s, prior: p } = r;
  const c = branch.currency;
  const fm = (n: number) => formatMoney(n, c, true);
  const full = (n: number) => formatMoney(n, c);
  const isToday = period.key === "today";

  const footer = (
    <>
      <span className="left">Demonstration data · calculated by STANLEY analytics</span>
      <Button variant="secondary" onClick={onClose}>
        Close
      </Button>
      <Button
        onClick={() => {
          onClose();
          if (s) onOpenWorkspace(branch.id);
          else navigate("/branches");
        }}
      >
        {s ? "Open branch workspace" : "View branch setup"} <ArrowRight size={15} />
      </Button>
    </>
  );

  return (
    <Modal
      open={!!row}
      onClose={onClose}
      xl
      title={`${branch.name} branch performance`}
      description={`${isToday ? "Today" : periodLabel(period)} · ${rangeText(range)} · ${branch.city}, ${branch.country} · amounts in ${c}`}
      footer={footer}
    >
      {!s || !detail ? (
        <div className="notice">
          <Info size={17} />
          <span>This branch is not operational yet. It has no recorded activity and is excluded from every company total until it is activated.</span>
        </div>
      ) : (
        <>
          <div className="bp-kpis">
            <div className="bp-kpi blue">
              <span>Revenue generated</span>
              <strong>
                <CountUp value={s.revenue[c] ?? 0} format={full} />
              </strong>
              <Change pct={moneyPct(s.revenue, p?.revenue, c)} />
            </div>
            <div className="bp-kpi green">
              <span>Payments received</span>
              <strong>
                <CountUp value={s.payments[c] ?? 0} format={full} />
              </strong>
              <Change pct={moneyPct(s.payments, p?.payments, c)} />
            </div>
            <div className="bp-kpi orange">
              <span>Approved expenses</span>
              <strong>
                <CountUp value={s.expenses[c] ?? 0} format={full} />
              </strong>
              <Change pct={moneyPct(s.expenses, p?.expenses, c)} direction="higher-bad" />
            </div>
            <div className="bp-kpi red">
              <span>Outstanding balances</span>
              <strong>
                <CountUp value={s.outstanding[c] ?? 0} format={full} />
              </strong>
              <Change pct={moneyPct(s.outstanding, p?.outstanding, c)} direction="higher-bad" />
            </div>
          </div>

          <div className="bp-ops">
            <div>
              <span>Patients</span>
              <strong>{formatCount(s.patients)}</strong>
              <Change pct={compareCount(s.patients, p?.patients ?? null)} direction="neutral" />
            </div>
            <div>
              <span>New patients</span>
              <strong>{formatCount(s.newPatients)}</strong>
            </div>
            <div>
              <span>Referrals</span>
              <strong>{formatCount(s.referrals)}</strong>
            </div>
            <div>
              <span>Diagnostic orders</span>
              <strong>{formatCount(s.orders)}</strong>
              <small>{formatCount(s.completedOrders)} completed</small>
            </div>
            <div>
              <span>Payment transactions</span>
              <strong>{formatCount(s.transactions)}</strong>
            </div>
            <div>
              <span>PR commissions earned</span>
              <strong>{fm(s.prCommission[c] ?? 0)}</strong>
            </div>
            <div title="Payments received ÷ revenue generated. Can exceed 100% when older balances are collected.">
              <span>Collection ratio</span>
              <strong>{(s.revenue[c] ?? 0) > 0 ? formatPct(((s.payments[c] ?? 0) / (s.revenue[c] ?? 1)) * 100, 0) : "—"}</strong>
            </div>
          </div>

          <div className="bp-panels">
            <section className="bp-panel">
              <h4>Payment methods</h4>
              <Donut
                size={132}
                centerLabel="Received"
                centerValue={fm(detail.methods.reduce((a, b) => a + b.value, 0))}
                format={fm}
                segments={detail.methods.map((x, i) => ({ label: x.label, value: x.value, color: CHART_COLORS[i] }))}
              />
            </section>
            <section className="bp-panel">
              <h4>Top diagnostic services</h4>
              {detail.services.some((x) => x.count > 0) ? (
                <HBarList
                  items={detail.services.map((x) => ({
                    label: x.name,
                    value: x.count,
                    display: `${formatCount(x.count)} · ${fm(x.revenue[c] ?? 0)}`,
                    color: "var(--kpi-blue)",
                  }))}
                />
              ) : (
                <div className="empty">No services recorded in this period.</div>
              )}
            </section>
            <section className="bp-panel">
              <h4>Outstanding balances at period end</h4>
              <div className="metric-row">
                <div>
                  <span>Unpaid</span>
                  <strong>{fm(s.outstandingUnpaid[c] ?? 0)}</strong>
                </div>
                <div>
                  <span>Partially paid</span>
                  <strong>{fm(s.outstandingPartial[c] ?? 0)}</strong>
                </div>
                <div>
                  <span>Open bills</span>
                  <strong>{formatCount(s.openBills)}</strong>
                </div>
              </div>
              <AgingBar aging={s.aging[c]} fm={fm} />
            </section>
            <section className="bp-panel">
              <h4>Top referrers</h4>
              <ul className="bp-referrers">
                {detail.doctors.map((d, i) => (
                  <li key={`${d.name}-${i}`}>
                    <Stethoscope size={15} />
                    <span>
                      <strong>{d.name}</strong>
                      <small>{d.specialty}</small>
                    </span>
                    <b>{formatCount(d.referrals)}</b>
                  </li>
                ))}
                {detail.hospitals.map((h) => (
                  <li key={h.name}>
                    <Hospital size={15} />
                    <span>
                      <strong>{h.name}</strong>
                      <small>Hospital / organisation</small>
                    </span>
                    <b>{formatCount(h.referrals)}</b>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <p className="hint" style={{ margin: 0 }}>
            Share of {c} revenue: <b>{formatPct(r.currencyShare ?? 0, 0)}</b>, ranked #{r.rankInCurrency} among {c} branches.
          </p>
        </>
      )}
    </Modal>
  );
}

function AgingBar({ aging, fm }: { aging?: { d0_30: number; d31_60: number; d61_90: number; d90p: number }; fm: (n: number) => string }) {
  const a = aging ?? { d0_30: 0, d31_60: 0, d61_90: 0, d90p: 0 };
  const total = a.d0_30 + a.d31_60 + a.d61_90 + a.d90p;
  const segs = [
    { label: "0–30 days", value: a.d0_30, color: "var(--brand-400)" },
    { label: "31–60 days", value: a.d31_60, color: "var(--warn)" },
    { label: "61–90 days", value: a.d61_90, color: "var(--kpi-orange)" },
    { label: "Over 90 days", value: a.d90p, color: "var(--danger)" },
  ];
  return (
    <>
      <div className="aging" role="img" aria-label="Outstanding balance ageing">
        {segs.map((sg) => (sg.value > 0 ? <div key={sg.label} style={{ flex: total ? sg.value / total : 0, background: sg.color }} title={`${sg.label}: ${fm(sg.value)}`} /> : null))}
      </div>
      <div className="aging-legend">
        {segs.map((sg) => (
          <div key={sg.label}>
            <i style={{ background: sg.color }} />
            <span>{sg.label}</span>
            <b>{fm(sg.value)}</b>
          </div>
        ))}
      </div>
    </>
  );
}
