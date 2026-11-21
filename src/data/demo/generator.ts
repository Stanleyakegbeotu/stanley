/**
 * DEMONSTRATION DATA — deterministic daily activity per active branch.
 *
 * Every dashboard figure is *calculated* from these day records (sums, period
 * windows, FIFO balance ageing), so period/context switches stay internally
 * consistent. Replace this module with real ledger queries for production.
 */
import { ACTIVE_BRANCHES, SERVICES } from "./catalog";
import type { AgingBuckets, Branch, Currency, DayRecord } from "../types";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function diffDays(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86_400_000);
}

export function isoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function parseIso(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

const NOW = new Date();
export const TODAY = startOfDay(NOW);
/** Demo records begin on 1 January of the current year. */
export const DATA_START = new Date(TODAY.getFullYear(), 0, 1);

const SCALE: Record<Currency, { salary: number; util: number; maint: number; logi: number; admin: number; bill: number }> = {
  NGN: { salary: 90_000, util: 6_000, maint: 9_000, logi: 900, admin: 500, bill: 14_500 },
  GHS: { salary: 1_000, util: 70, maint: 100, logi: 10, admin: 6, bill: 170 },
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Relative speed at which each branch collects old balances (demo variation). */
const COLLECTION_EFFICIENCY: Record<string, number> = {
  "gra-port-harcourt": 0.5,
  "lokoja-central": 0.82,
  "accra-osu": 0.9,
};

function generateBranch(branch: Branch, seedIndex: number): DayRecord[] {
  const rand = mulberry32(1000 + seedIndex * 7919);
  const days = diffDays(DATA_START, TODAY) + 1;
  const scale = SCALE[branch.currency];
  const queue: { day: number; amount: number; partial: boolean }[] = [];
  const out: DayRecord[] = [];
  const hourNow = NOW.getHours() + NOW.getMinutes() / 60;

  for (let i = 0; i < days; i++) {
    const date = addDays(DATA_START, i);
    const wd = date.getDay();
    const isToday = i === days - 1;
    const dayFrac = isToday ? clamp((hourNow - 7) / 11, 0.06, 1) : 1;
    const wf = [0.38, 1.06, 1.0, 1.0, 1.03, 1.09, 0.78][wd];
    const growth = 1 + 0.14 * (i / 365);
    const season = 1 + 0.06 * Math.sin(i / 58 + seedIndex);

    const patients = Math.max(
      0,
      Math.round(branch.basePatients * wf * growth * season * (0.86 + 0.28 * rand()) * dayFrac),
    );
    const newPatients = Math.round(patients * (0.15 + 0.07 * rand()));
    const referrals = Math.round(patients * (0.3 + 0.12 * rand()));
    const serviceCounts = SERVICES.map((s) => Math.round(patients * s.mix * (0.75 + 0.5 * rand())));
    const orders = serviceCounts.reduce((a, b) => a + b, 0);
    const completedOrders = isToday ? Math.round(orders * (0.82 + 0.1 * rand())) : orders;
    const revenue = serviceCounts.reduce((sum, c, idx) => sum + c * SERVICES[idx].price[branch.currency], 0);

    // Same-day payments; the remainder becomes an outstanding patient balance.
    const paidSameDay = revenue * (0.76 + 0.14 * rand());
    const unpaid = revenue - paidSameDay;
    if (unpaid > 0) {
      queue.push({ day: i, amount: unpaid * 0.62, partial: true });
      queue.push({ day: i, amount: unpaid * 0.38, partial: false });
    }

    // Later collections settle the oldest balances first (FIFO).
    const outstandingBefore = queue.reduce((s, e) => s + e.amount, 0);
    let collect = outstandingBefore * (0.03 + 0.025 * rand()) * dayFrac * (COLLECTION_EFFICIENCY[branch.id] ?? 1);
    const collected = collect;
    while (collect > 0 && queue.length) {
      const head = queue[0];
      const take = Math.min(head.amount, collect);
      head.amount -= take;
      collect -= take;
      if (head.amount < 1) queue.shift();
    }
    const payments = paidSameDay + collected;
    const avgBill = patients > 0 ? revenue / patients : scale.bill;
    const transactions = Math.round(patients * (1 + 0.1 * rand()) + collected / Math.max(avgBill, 1));

    const methodW = [0.2 + 0.05 * rand(), 0.38 + 0.06 * rand(), 0.32 + 0.06 * rand(), 0.1 + 0.03 * rand()];
    const wSum = methodW.reduce((a, b) => a + b, 0);
    const paymentsByMethod = methodW.map((w) => (payments * w) / wSum);

    const b = branch.basePatients;
    const expensesByCategory = [
      revenue * (0.1 + 0.04 * rand()),
      date.getDate() === 25 ? b * scale.salary * (0.97 + 0.06 * rand()) : 0,
      wd === 1 ? b * scale.util * (0.9 + 0.2 * rand()) : 0,
      rand() < 0.06 ? b * scale.maint * (0.5 + rand()) : 0,
      b * scale.logi * (0.6 + 0.8 * rand()) * (wd === 0 ? 0.3 : 1) * dayFrac,
      b * scale.admin * (0.5 + rand()) * dayFrac,
    ];
    const expenses = expensesByCategory.reduce((a, c) => a + c, 0);
    const prCommission = revenue * (patients > 0 ? referrals / patients : 0) * 0.05;

    const aging: AgingBuckets = { d0_30: 0, d31_60: 0, d61_90: 0, d90p: 0 };
    let outstanding = 0;
    let outstandingUnpaid = 0;
    let outstandingPartial = 0;
    for (const e of queue) {
      const age = i - e.day;
      outstanding += e.amount;
      if (e.partial) outstandingPartial += e.amount;
      else outstandingUnpaid += e.amount;
      if (age <= 30) aging.d0_30 += e.amount;
      else if (age <= 60) aging.d31_60 += e.amount;
      else if (age <= 90) aging.d61_90 += e.amount;
      else aging.d90p += e.amount;
    }

    out.push({
      date: isoDate(date),
      patients,
      newPatients,
      referrals,
      orders,
      completedOrders,
      transactions,
      revenue,
      payments,
      expenses,
      prCommission,
      serviceCounts,
      paymentsByMethod,
      expensesByCategory,
      outstanding,
      outstandingUnpaid,
      outstandingPartial,
      openBills: Math.round(outstanding / scale.bill),
      aging,
    });
  }
  return out;
}

/** branchId → day records, index 0 = DATA_START. Inactive branches have none. */
export const DAILY: Record<string, DayRecord[]> = Object.fromEntries(
  ACTIVE_BRANCHES.map((b, idx) => [b.id, generateBranch(b, idx)]),
);
