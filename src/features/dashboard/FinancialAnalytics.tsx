import { useMemo, useState } from "react";
import { getBranch } from "@/data/demo/catalog";
import type { Currency, DateRange } from "@/data/types";
import { Reveal, CountUp } from "@/shared/motion";
import { formatCount, formatMoney, formatPct } from "@/shared/format";
import { SectionHeader, Segmented } from "@/shared/ui/controls";
import { AreaLineChart, CHART_COLORS, Donut, HBarList } from "@/shared/ui/charts";
import { byBranch, currenciesOf, expenseMix, paymentMix, serviceRanking, summarize, trend } from "@/services/analytics";

export function useCurrencyTab(branchIds: string[]) {
  const currencies = currenciesOf(branchIds);
  const [sel, setSel] = useState<Currency>("NGN");
  const current = currencies.includes(sel) ? sel : (currencies[0] ?? "NGN");
  return { currencies, current, setCurrency: setSel };
}

export function CurrencyTabs({ currencies, value, onChange }: { currencies: Currency[]; value: Currency; onChange: (c: Currency) => void }) {
  if (currencies.length < 2) return currencies[0] ? <span className="currency-chip">{currencies[0]}</span> : null;
  return <Segmented label="Currency" value={value} onChange={onChange} options={currencies.map((c) => ({ value: c, label: c }))} />;
}

export function FinancialAnalytics({ branchIds, range, title = "Revenue, collections, balances & expenses" }: { branchIds: string[]; range: DateRange; title?: string }) {
  const { currencies, current: cur, setCurrency } = useCurrencyTab(branchIds);
  const ids = useMemo(() => branchIds.filter((id) => getBranch(id)?.currency === cur), [branchIds, cur]);
  const fm = (n: number) => formatMoney(n, cur, true);

  const data = useMemo(() => {
    const s = summarize(ids, range);
    const revByBranch = byBranch(range, cur, "revenue", ids);
    return {
      s,
      trend: trend(ids, range, cur),
      methods: paymentMix(ids, range, cur),
      expenses: expenseMix(ids, range, cur),
      services: serviceRanking(ids, range)
        .map((x) => ({ name: x.name, count: x.count, value: x.revenue[cur] ?? 0 }))
        .filter((x) => x.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 6),
      collections: byBranch(range, cur, "payments", ids).map((x) => ({
        ...x,
        rate: (() => {
          const rev = revByBranch.find((r) => r.branch.id === x.branch.id)?.value ?? 0;
          return rev > 0 ? (x.value / rev) * 100 : 0;
        })(),
      })),
      expensesByBranch: byBranch(range, cur, "expenses", ids),
      outstandingByBranch: byBranch(range, cur, "outstanding", ids),
    };
  }, [ids, range, cur]);

  const { s } = data;
  const aging = s.aging[cur] ?? { d0_30: 0, d31_60: 0, d61_90: 0, d90p: 0 };
  const agingTotal = aging.d0_30 + aging.d31_60 + aging.d61_90 + aging.d90p;
  const agingSegs = [
    { label: "0–30 days", value: aging.d0_30, color: "var(--brand-400)" },
    { label: "31–60 days", value: aging.d31_60, color: "var(--warn)" },
    { label: "61–90 days", value: aging.d61_90, color: "var(--kpi-orange)" },
    { label: "Over 90 days", value: aging.d90p, color: "var(--danger)" },
  ];
  const totalPayments = data.methods.reduce((a, b) => a + b.value, 0);

  if (!branchIds.length) return null;

  return (
    <>
      <SectionHeader
        eyebrow="Financial analytics"
        title={title}
        description="Billed value, collected payments, approved expenses and outstanding balances are shown side by side — never netted against each other."
        demo
        actions={<CurrencyTabs currencies={currencies} value={cur} onChange={setCurrency} />}
      />

      <Reveal className="legend-strip" aria-label="How to read these figures">
        <div>
          <i style={{ background: "var(--kpi-blue)" }} />
          <span>
            <b>Billed value</b>Revenue generated from completed diagnostics
          </span>
        </div>
        <div>
          <i style={{ background: "var(--kpi-green)" }} />
          <span>
            <b>Collected payments</b>Receipts actually received
          </span>
        </div>
        <div>
          <i style={{ background: "var(--kpi-orange)" }} />
          <span>
            <b>Approved expenses</b>Costs by expense date
          </span>
        </div>
        <div>
          <i style={{ background: "var(--kpi-red)" }} />
          <span>
            <b>Outstanding balances</b>Owed by patients at period end
          </span>
        </div>
      </Reveal>

      <Reveal mode="stagger" className="analytics-grid">
        <Reveal hover className="card card-pad span-8">
          <div className="card-head">
            <div>
              <h3>Revenue performance</h3>
              <p>
                {data.trend.note} · {cur}
              </p>
            </div>
            <div className="chart-legend">
              <span>
                <i style={{ background: "var(--kpi-blue)" }} />
                Revenue generated
              </span>
              <span>
                <i style={{ background: "var(--kpi-green)" }} />
                Payments received
              </span>
              <span>
                <i style={{ background: "var(--kpi-orange)" }} />
                Expenses
              </span>
            </div>
          </div>
          <AreaLineChart
            labels={data.trend.labels}
            format={fm}
            series={[
              { key: "rev", label: "Revenue", color: "var(--kpi-blue)", values: data.trend.revenue, area: true },
              { key: "pay", label: "Payments", color: "var(--kpi-green)", values: data.trend.payments },
              { key: "exp", label: "Expenses", color: "var(--kpi-orange)", values: data.trend.expenses, dashed: true },
            ]}
          />
        </Reveal>

        <Reveal hover className="card card-pad span-4">
          <div className="card-head">
            <div>
              <h3>Collections performance</h3>
              <p>
                Payment method breakdown · <CountUp value={s.transactions} format={formatCount} /> transactions
              </p>
            </div>
          </div>
          <Donut
            centerLabel="Payments received"
            centerValue={fm(totalPayments)}
            format={fm}
            segments={data.methods.map((x, i) => ({ label: x.label, value: x.value, color: CHART_COLORS[i] }))}
          />
        </Reveal>

        <Reveal hover className="card card-pad span-4">
          <div className="card-head">
            <div>
              <h3>Revenue by diagnostic service</h3>
              <p>Billed value of completed services</p>
            </div>
          </div>
          <HBarList items={data.services.map((x) => ({ label: x.name, value: x.value, display: fm(x.value), hint: `${formatCount(x.count)} performed`, color: "var(--kpi-blue)" }))} />
        </Reveal>

        <Reveal hover className="card card-pad span-4">
          <div className="card-head">
            <div>
              <h3>Outstanding balances</h3>
              <p>Position at period end</p>
            </div>
          </div>
          <div className="metric-row">
            <div>
              <span>Unpaid</span>
              <strong>
                <CountUp value={s.outstandingUnpaid[cur] ?? 0} format={fm} />
              </strong>
            </div>
            <div>
              <span>Partially paid</span>
              <strong>
                <CountUp value={s.outstandingPartial[cur] ?? 0} format={fm} />
              </strong>
            </div>
            <div>
              <span>Open bills</span>
              <strong>
                <CountUp value={s.openBills} format={formatCount} />
              </strong>
            </div>
          </div>
          <div className="hint">Ageing of outstanding balances</div>
          <div className="aging" role="img" aria-label="Outstanding balance ageing">
            {agingSegs.map((a) =>
              a.value > 0 ? <div key={a.label} style={{ flex: agingTotal ? a.value / agingTotal : 0, background: a.color }} title={`${a.label}: ${fm(a.value)}`} /> : null,
            )}
          </div>
          <div className="aging-legend">
            {agingSegs.map((a) => (
              <div key={a.label}>
                <i style={{ background: a.color }} />
                <span>{a.label}</span>
                <b>{fm(a.value)}</b>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal hover className="card card-pad span-4">
          <div className="card-head">
            <div>
              <h3>Expense categories</h3>
              <p>Approved expenses by category</p>
            </div>
          </div>
          {data.expenses.some((x) => x.value > 0) ? (
            <HBarList items={data.expenses.filter((x) => x.value > 0).map((x) => ({ label: x.label, value: x.value, display: fm(x.value), color: "var(--kpi-orange)" }))} />
          ) : (
            <div className="empty">No approved expenses in this period.</div>
          )}
          {data.expenses.some((x) => x.value === 0) && data.expenses.some((x) => x.value > 0) && (
            <p className="hint" style={{ margin: "14px 0 0" }}>
              No {data.expenses.filter((x) => x.value === 0).map((x) => x.label.toLowerCase()).join(", ")} recorded in this period.
            </p>
          )}
        </Reveal>

        <Reveal hover className="card card-pad span-6">
          <div className="card-head">
            <div>
              <h3>Collections by branch</h3>
              <p>Payments received and collection ratio (payments ÷ revenue generated). It can exceed 100% when older balances are collected.</p>
            </div>
          </div>
          <HBarList
            items={data.collections.map((x) => ({
              label: x.branch.name,
              value: x.value,
              display: `${fm(x.value)} · ${formatPct(x.rate, 0)}`,
              color: "var(--kpi-green)",
            }))}
          />
        </Reveal>

        <Reveal hover className="card card-pad span-6">
          <div className="card-head">
            <div>
              <h3>Expenses & outstanding by branch</h3>
              <p>Approved expenses in the period and balances at period end</p>
            </div>
          </div>
          <HBarList
            items={data.expensesByBranch.map((x) => {
              const out = data.outstandingByBranch.find((o) => o.branch.id === x.branch.id)?.value ?? 0;
              return { label: x.branch.name, value: x.value, display: `${fm(x.value)} exp. · ${fm(out)} owed`, color: "var(--kpi-orange)" };
            })}
          />
        </Reveal>
      </Reveal>
    </>
  );
}
