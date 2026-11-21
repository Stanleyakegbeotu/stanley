/**
 * Company analytics service.
 *
 * The single source of calculated figures for dashboards, reports and
 * STANLEY Intelligence. Every function keeps money grouped by recorded
 * currency — values in different currencies are never summed together.
 */
import { ACTIVE_BRANCHES, BRANCHES, DOCTORS, HOSPITALS, SERVICES, getBranch } from "@/data/demo/catalog";
import { DAILY, DATA_START, TODAY, addDays, diffDays, isoDate, parseIso } from "@/data/demo/generator";
import {
  EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
  type AgingBuckets,
  type Branch,
  type Currency,
  type DateRange,
  type DayRecord,
  type Money,
  type PeriodSelection,
} from "@/data/types";

export { DATA_START, TODAY };

/* ─────────────── Periods ─────────────── */

export const PERIOD_OPTIONS: { key: PeriodSelection["key"]; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "year", label: "This Year" },
  { key: "custom", label: "Custom Date Range" },
];

function mkRange(from: Date, to: Date): DateRange {
  return { from, to, days: diffDays(from, to) + 1 };
}

export function resolveRange(sel: PeriodSelection): DateRange {
  switch (sel.key) {
    case "today":
      return mkRange(TODAY, TODAY);
    case "yesterday": {
      const y = addDays(TODAY, -1);
      return mkRange(y, y);
    }
    case "week": {
      const offset = (TODAY.getDay() + 6) % 7; // weeks start on Monday
      return mkRange(addDays(TODAY, -offset), TODAY);
    }
    case "month":
      return mkRange(new Date(TODAY.getFullYear(), TODAY.getMonth(), 1), TODAY);
    case "year":
      return mkRange(new Date(TODAY.getFullYear(), 0, 1), TODAY);
    case "custom": {
      let from = sel.from ? parseIso(sel.from) : addDays(TODAY, -6);
      let to = sel.to ? parseIso(sel.to) : TODAY;
      if (from > to) [from, to] = [to, from];
      if (from < DATA_START) from = DATA_START;
      if (to > TODAY) to = TODAY;
      return mkRange(from, to);
    }
  }
}

/** The equally long window immediately before `r`, or null if no data exists for it. */
export function priorRange(r: DateRange): DateRange | null {
  const to = addDays(r.from, -1);
  const from = addDays(to, -(r.days - 1));
  if (from < DATA_START) return null;
  return mkRange(from, to);
}

export function periodLabel(sel: PeriodSelection): string {
  return PERIOD_OPTIONS.find((p) => p.key === sel.key)?.label ?? "Custom";
}

/* ─────────────── Low-level access ─────────────── */

function records(branchId: string, r: DateRange): DayRecord[] {
  const all = DAILY[branchId];
  if (!all) return [];
  const start = Math.max(0, diffDays(DATA_START, r.from));
  const end = Math.min(all.length - 1, diffDays(DATA_START, r.to));
  return end < start ? [] : all.slice(start, end + 1);
}

function recordAt(branchId: string, d: Date): DayRecord | undefined {
  const all = DAILY[branchId];
  if (!all) return undefined;
  const idx = Math.min(all.length - 1, diffDays(DATA_START, d));
  return idx >= 0 ? all[idx] : undefined;
}

function add(money: Money, c: Currency, v: number) {
  money[c] = (money[c] ?? 0) + v;
}

export function resolveBranchIds(context: string): string[] {
  if (context === "all") return ACTIVE_BRANCHES.map((b) => b.id);
  const b = getBranch(context);
  return b && b.status === "Active" ? [b.id] : [];
}

export function currenciesOf(branchIds: string[]): Currency[] {
  const set = new Set(branchIds.map((id) => getBranch(id)?.currency).filter(Boolean) as Currency[]);
  return (["NGN", "GHS"] as Currency[]).filter((c) => set.has(c));
}

/* ─────────────── Summary ─────────────── */

export interface Summary {
  revenue: Money;
  payments: Money;
  expenses: Money;
  prCommission: Money;
  outstanding: Money;
  outstandingUnpaid: Money;
  outstandingPartial: Money;
  aging: Partial<Record<Currency, AgingBuckets>>;
  openBills: number;
  patients: number;
  newPatients: number;
  referrals: number;
  orders: number;
  completedOrders: number;
  transactions: number;
  currencies: Currency[];
}

export function summarize(branchIds: string[], r: DateRange): Summary {
  const s: Summary = {
    revenue: {},
    payments: {},
    expenses: {},
    prCommission: {},
    outstanding: {},
    outstandingUnpaid: {},
    outstandingPartial: {},
    aging: {},
    openBills: 0,
    patients: 0,
    newPatients: 0,
    referrals: 0,
    orders: 0,
    completedOrders: 0,
    transactions: 0,
    currencies: currenciesOf(branchIds),
  };
  for (const id of branchIds) {
    const branch = getBranch(id);
    if (!branch) continue;
    const c = branch.currency;
    for (const d of records(id, r)) {
      add(s.revenue, c, d.revenue);
      add(s.payments, c, d.payments);
      add(s.expenses, c, d.expenses);
      add(s.prCommission, c, d.prCommission);
      s.patients += d.patients;
      s.newPatients += d.newPatients;
      s.referrals += d.referrals;
      s.orders += d.orders;
      s.completedOrders += d.completedOrders;
      s.transactions += d.transactions;
    }
    // Balances are a position at the end of the period, not a sum of days.
    const end = recordAt(id, r.to);
    if (end) {
      add(s.outstanding, c, end.outstanding);
      add(s.outstandingUnpaid, c, end.outstandingUnpaid);
      add(s.outstandingPartial, c, end.outstandingPartial);
      s.openBills += end.openBills;
      const a = (s.aging[c] ??= { d0_30: 0, d31_60: 0, d61_90: 0, d90p: 0 });
      a.d0_30 += end.aging.d0_30;
      a.d31_60 += end.aging.d31_60;
      a.d61_90 += end.aging.d61_90;
      a.d90p += end.aging.d90p;
    }
  }
  return s;
}

/** Percentage change per currency; null where no prior figure exists. */
export function compareMoney(cur: Money, prev: Money | null): Partial<Record<Currency, number | null>> {
  const out: Partial<Record<Currency, number | null>> = {};
  for (const c of Object.keys(cur) as Currency[]) {
    const p = prev?.[c];
    out[c] = p && p > 0 ? (((cur[c] ?? 0) - p) / p) * 100 : null;
  }
  return out;
}

export function compareCount(cur: number, prev: number | null): number | null {
  return prev && prev > 0 ? ((cur - prev) / prev) * 100 : null;
}

/* ─────────────── Trends ─────────────── */

export interface TrendData {
  labels: string[];
  revenue: number[];
  payments: number[];
  expenses: number[];
  note: string;
}

const monthShort = new Intl.DateTimeFormat("en-GB", { month: "short" });
const dayShort = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

export function trend(branchIds: string[], r: DateRange, currency: Currency): TrendData {
  const ids = branchIds.filter((id) => getBranch(id)?.currency === currency);
  // A single day has no shape, so short periods show the trailing 14 days for context.
  const window = r.days < 7 ? mkRange(addDays(r.to, -13), r.to) : r;
  const from = window.from < DATA_START ? DATA_START : window.from;
  const w = mkRange(from, window.to);
  const bucket: "day" | "week" | "month" = w.days <= 45 ? "day" : w.days <= 120 ? "week" : "month";
  const map = new Map<string, { label: string; revenue: number; payments: number; expenses: number }>();
  for (let i = 0; i < w.days; i++) {
    const d = addDays(w.from, i);
    let key: string;
    let label: string;
    if (bucket === "day") {
      key = isoDate(d);
      label = dayShort.format(d);
    } else if (bucket === "week") {
      const monday = addDays(d, -((d.getDay() + 6) % 7));
      key = isoDate(monday);
      label = dayShort.format(monday);
    } else {
      key = `${d.getFullYear()}-${d.getMonth()}`;
      label = monthShort.format(d);
    }
    const entry = map.get(key) ?? { label, revenue: 0, payments: 0, expenses: 0 };
    for (const id of ids) {
      const rec = recordAt(id, d);
      if (!rec || rec.date !== isoDate(d)) continue;
      entry.revenue += rec.revenue;
      entry.payments += rec.payments;
      entry.expenses += rec.expenses;
    }
    map.set(key, entry);
  }
  const rows = [...map.values()];
  return {
    labels: rows.map((r) => r.label),
    revenue: rows.map((r) => r.revenue),
    payments: rows.map((r) => r.payments),
    expenses: rows.map((r) => r.expenses),
    note:
      window !== r
        ? "Trailing 14 days shown for context"
        : bucket === "day"
          ? "Daily totals"
          : bucket === "week"
            ? "Weekly totals (week starting)"
            : "Monthly totals",
  };
}

/* ─────────────── Breakdowns ─────────────── */

export function byBranch(
  r: DateRange,
  currency: Currency,
  field: "revenue" | "payments" | "expenses" | "outstanding",
  restrictTo?: string[],
): { branch: Branch; value: number }[] {
  return ACTIVE_BRANCHES.filter((b) => b.currency === currency && (!restrictTo || restrictTo.includes(b.id)))
    .map((b) => {
      const s = summarize([b.id], r);
      return { branch: b, value: s[field][currency] ?? 0 };
    })
    .sort((a, b) => b.value - a.value);
}

export function paymentMix(branchIds: string[], r: DateRange, currency: Currency) {
  const totals = PAYMENT_METHODS.map(() => 0);
  for (const id of branchIds) {
    if (getBranch(id)?.currency !== currency) continue;
    for (const d of records(id, r)) d.paymentsByMethod.forEach((v, i) => (totals[i] += v));
  }
  return PAYMENT_METHODS.map((m, i) => ({ label: m, value: totals[i] }));
}

export function expenseMix(branchIds: string[], r: DateRange, currency: Currency) {
  const totals = EXPENSE_CATEGORIES.map(() => 0);
  for (const id of branchIds) {
    if (getBranch(id)?.currency !== currency) continue;
    for (const d of records(id, r)) d.expensesByCategory.forEach((v, i) => (totals[i] += v));
  }
  return EXPENSE_CATEGORIES.map((c, i) => ({ label: c, value: totals[i] })).sort((a, b) => b.value - a.value);
}

export interface ServiceRank {
  name: string;
  category: string;
  count: number;
  revenue: Money;
}

export function serviceRanking(branchIds: string[], r: DateRange): ServiceRank[] {
  const rows: ServiceRank[] = SERVICES.map((s) => ({ name: s.name, category: s.category, count: 0, revenue: {} }));
  for (const id of branchIds) {
    const branch = getBranch(id);
    if (!branch) continue;
    for (const d of records(id, r)) {
      d.serviceCounts.forEach((count, i) => {
        rows[i].count += count;
        add(rows[i].revenue, branch.currency, count * SERVICES[i].price[branch.currency]);
      });
    }
  }
  return rows.sort((a, b) => b.count - a.count);
}

export interface ReferrerRank {
  name: string;
  branch: Branch;
  referrals: number;
  revenue: Money;
  specialty?: string;
}

function referrerRanking(list: typeof DOCTORS, branchIds: string[], r: DateRange): ReferrerRank[] {
  const perBranch = new Map<string, { referrals: number; referredRevenue: number }>();
  for (const id of branchIds) {
    let referrals = 0;
    let referredRevenue = 0;
    for (const d of records(id, r)) {
      referrals += d.referrals;
      referredRevenue += d.patients > 0 ? d.revenue * (d.referrals / d.patients) : 0;
    }
    perBranch.set(id, { referrals, referredRevenue });
  }
  return list
    .filter((ref) => perBranch.has(ref.branchId))
    .map((ref) => {
      const b = getBranch(ref.branchId)!;
      const t = perBranch.get(ref.branchId)!;
      return {
        name: ref.name,
        branch: b,
        specialty: ref.specialty,
        referrals: Math.round(t.referrals * ref.weight),
        revenue: { [b.currency]: t.referredRevenue * ref.weight } as Money,
      };
    })
    .sort((a, b) => b.referrals - a.referrals);
}

export const doctorRanking = (ids: string[], r: DateRange) => referrerRanking(DOCTORS, ids, r);
export const hospitalRanking = (ids: string[], r: DateRange) => referrerRanking(HOSPITALS, ids, r);

/* ─────────────── Branch performance ─────────────── */

export interface BranchPerformance {
  branch: Branch;
  summary: Summary | null;
  prior: Summary | null;
  /** Share of company revenue recorded in the same currency. */
  currencyShare: number | null;
  rankInCurrency: number | null;
}

export function branchPerformance(r: DateRange): BranchPerformance[] {
  const prior = priorRange(r);
  const rows = BRANCHES.map((branch) => {
    if (branch.status !== "Active") return { branch, summary: null, prior: null, currencyShare: null, rankInCurrency: null };
    return {
      branch,
      summary: summarize([branch.id], r),
      prior: prior ? summarize([branch.id], prior) : null,
      currencyShare: null as number | null,
      rankInCurrency: null as number | null,
    };
  });
  for (const c of ["NGN", "GHS"] as Currency[]) {
    const peers = rows.filter((x) => x.summary && x.branch.currency === c);
    const total = peers.reduce((s, x) => s + (x.summary!.revenue[c] ?? 0), 0);
    [...peers]
      .sort((a, b) => (b.summary!.revenue[c] ?? 0) - (a.summary!.revenue[c] ?? 0))
      .forEach((x, i) => {
        x.rankInCurrency = i + 1;
        x.currencyShare = total > 0 ? ((x.summary!.revenue[c] ?? 0) / total) * 100 : 0;
      });
  }
  return rows;
}
