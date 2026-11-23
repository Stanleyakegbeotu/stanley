/**
 * Analysis panel (owner, 2026-11-22) — live figures above the report cards on
 * the branch Analysis page and the Company Admin's Reports page.
 *
 *  • Money in at a glance: today, this week, this month (+ this year for the
 *    manager and admin).
 *  • Key figures for a chosen period, compared with the period before: money
 *    in, billed, patients, tests, referrals, balances still owed.
 *  • Trend (billed vs money in), payment methods, most-done tests, top PR
 *    agents and top referring hospitals.
 *
 * Who sees what:
 *  • Company Admin — everything, including expenses and NET PROFIT, any period.
 *  • Branch Manager — their branch, up to the whole year. No net profit.
 *  • Front Desk — their branch, up to the month. No net profit.
 * Figures come from the same sources as the dashboard, so they always agree.
 * Charts use the one theme colour (owner rule).
 */
import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Banknote, CalendarDays, FlaskConical, Handshake, Hospital, Receipt, TrendingUp, UserRound, Wallet, type LucideIcon } from "lucide-react";
import type { PeriodSelection } from "@/data/types";
import { agentRanking, compareCount, compareMoney, hospitalRanking, paymentMix, periodLabel, priorRange, resolveRange, serviceRanking, summarize, trend } from "@/services/analytics";
import { financeTotals } from "@/services/finance";
import { useCommission } from "@/services/commission";
import { formatCount, formatMoney } from "@/shared/format";
import { Segmented } from "@/shared/ui/controls";
import { AreaLineChart, HBarList } from "@/shared/ui/charts";
import { rangeText } from "@/features/dashboard/WelcomeBanner";

export type AnalysisLevel = "admin" | "manager" | "staff";

const PERIODS: Record<AnalysisLevel, PeriodSelection["key"][]> = {
  admin: ["today", "yesterday", "week", "month", "year"],
  manager: ["today", "yesterday", "week", "month", "year"],
  // Front desk: what is happening within the month — never the year.
  staff: ["today", "yesterday", "week", "month"],
};
const SHORT: Partial<Record<PeriodSelection["key"], string>> = { today: "Today", yesterday: "Yesterday", week: "This week", month: "This month", year: "This year" };

const naira = (n: number, compact = false) => formatMoney(n, "NGN", compact);

export function AnalysisPanel({ ids, level, scopeLabel }: { ids: string[]; level: AnalysisLevel; scopeLabel: string }) {
  const { version } = useCommission();
  const [key, setKey] = useState<PeriodSelection["key"]>(level === "staff" ? "month" : "month");
  const range = useMemo(() => resolveRange({ key }), [key]);
  const prior = useMemo(() => priorRange(range), [range]);

  const data = useMemo(() => {
    const s = summarize(ids, range);
    const p = prior ? summarize(ids, prior) : null;
    const fin = ids.map((id) => financeTotals(id, range)).reduce((a, f) => ({ income: a.income + f.income, expenses: a.expenses + f.costs, net: a.net + f.net }), { income: 0, expenses: 0, net: 0 });
    const services = serviceRanking(ids, range).filter((x) => x.count > 0);
    const agents = agentRanking(ids, range);
    const hospitals = hospitalRanking(ids, range);
    return {
      s,
      p,
      fin,
      trend: trend(ids, range, "NGN"),
      methods: paymentMix(ids, range, "NGN"),
      tests: services.reduce((n, x) => n + x.count, 0),
      services: services.slice(0, 8),
      agents: agents.slice(0, 6),
      hospitals: hospitals.slice(0, 6),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join("|"), range, prior, version]);

  // Money in for the fixed windows (the "at a glance" strip).
  const glance = useMemo(() => {
    const keys: PeriodSelection["key"][] = level === "staff" ? ["today", "week", "month"] : ["today", "week", "month", "year"];
    return keys.map((k) => {
      const r = resolveRange({ key: k });
      return { key: k, label: SHORT[k]!, value: summarize(ids, r).payments.NGN ?? 0, sub: rangeText(r) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join("|"), level, version]);

  const { s, p } = data;
  const moneyIn = s.payments.NGN ?? 0;
  const billed = s.revenue.NGN ?? 0;
  const change = (cur: number, prev: number | null | undefined) => (prev === null || prev === undefined ? null : compareCount(cur, prev));
  const tiles: { label: string; icon: LucideIcon; value: string; caption: string; delta: number | null; tone?: "danger" }[] = [
    { label: "Money in", icon: Wallet, value: naira(moneyIn), caption: "Paid at visits + balances recovered", delta: p ? (compareMoney(s.payments, p.payments).NGN ?? null) : null },
    { label: "Billed", icon: Receipt, value: naira(billed), caption: `${formatCount(s.transactions)} bills`, delta: p ? (compareMoney(s.revenue, p.revenue).NGN ?? null) : null },
    { label: "Patients", icon: UserRound, value: formatCount(s.patients), caption: `${formatCount(s.newPatients)} new · ${formatCount(s.patients - s.newPatients)} returning`, delta: change(s.patients, p?.patients) },
    { label: "Tests done", icon: FlaskConical, value: formatCount(data.tests), caption: s.patients ? `${(data.tests / s.patients).toFixed(1)} per patient` : "—", delta: null },
    { label: "Referred patients", icon: Handshake, value: formatCount(s.referrals), caption: s.patients ? `${Math.round((s.referrals / s.patients) * 100)}% of patients` : "—", delta: change(s.referrals, p?.referrals) },
    { label: "Still owed", icon: Banknote, value: naira(s.outstanding.NGN ?? 0), caption: `${formatCount(s.openBills)} open bills at the end of the period`, delta: null, tone: (s.outstanding.NGN ?? 0) > 0 ? "danger" : undefined },
  ];
  if (level === "admin")
    tiles.push(
      { label: "Costs", icon: ArrowDownRight, value: naira(data.fin.expenses), caption: "Approved expenses + PR commission", delta: null },
      { label: "Net profit", icon: TrendingUp, value: naira(data.fin.net), caption: data.fin.income ? `${Math.round((data.fin.net / data.fin.income) * 100)}% of money in · admin only` : "Admin only", delta: null, tone: data.fin.net < 0 ? "danger" : undefined },
    );
  const methodTotal = data.methods.reduce((n, m) => n + m.value, 0);

  return (
    <section className="an-panel" aria-label="Analysis">
      <header className="an-head">
        <div>
          <h3>Analysis · {scopeLabel}</h3>
          <p>
            {SHORT[key]} · {rangeText(range)}
            {prior ? " · compared with the period before" : ""}
          </p>
        </div>
        <Segmented label="Analysis period" value={key} onChange={(k) => setKey(k)} options={PERIODS[level].map((k) => ({ value: k, label: SHORT[k]! }))} />
      </header>

      {/* Money in at a glance */}
      <div className={`an-glance is-${glance.length}`}>
        {glance.map((g) => (
          <button key={g.key} type="button" className={`an-glance-item ${g.key === key ? "is-on" : ""}`} onClick={() => setKey(g.key)} aria-pressed={g.key === key}>
            <span>
              <CalendarDays size={14} /> Money in · {g.label}
            </span>
            <b className="num">{naira(g.value)}</b>
            <small>{g.sub}</small>
          </button>
        ))}
      </div>

      {/* Key figures */}
      <div className={`an-tiles ${tiles.length > 6 ? "is-8" : ""}`}>
        {tiles.map((t) => (
          <div key={t.label} className={`an-tile ${t.tone === "danger" ? "is-danger" : ""} ${t.label === "Net profit" ? "is-profit" : ""}`}>
            <span className="an-tile-head">
              <span className="an-tile-icon" aria-hidden="true">
                <t.icon size={16} />
              </span>
              {t.label}
            </span>
            <b className="num">{t.value}</b>
            <small>
              {t.delta !== null && Number.isFinite(t.delta) && (
                <em className={t.delta >= 0 ? "is-up" : "is-down"}>
                  {t.delta >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                  {Math.abs(t.delta).toFixed(1)}%
                </em>
              )}
              {t.caption}
            </small>
          </div>
        ))}
      </div>

      {/* Trend + payment methods */}
      <div className="an-row">
        <div className="card an-card an-trend">
          <header>
            <div>
              <h4>Billed and money in</h4>
              <p>{data.trend.note}</p>
            </div>
            <ul className="an-legend" aria-label="Legend">
              <li>
                <i className="is-solid" /> Money in
              </li>
              <li>
                <i className="is-dashed" /> Billed
              </li>
            </ul>
          </header>
          <AreaLineChart
            labels={data.trend.labels}
            format={(n) => naira(n, true)}
            height={220}
            series={[
              { key: "in", label: "Money in", color: "var(--brand-600)", values: data.trend.payments, area: true },
              { key: "bill", label: "Billed", color: "var(--brand-400)", values: data.trend.revenue, dashed: true },
            ]}
          />
        </div>
        <div className="card an-card">
          <header>
            <div>
              <h4>How patients paid</h4>
              <p>Money in by payment method · {periodLabel({ key })}</p>
            </div>
          </header>
          {methodTotal ? (
            <HBarList items={data.methods.map((m) => ({ label: m.label, value: m.value, display: naira(m.value, true), tipValue: naira(m.value), color: "var(--brand-600)" }))} valueLabel="Money in" />
          ) : (
            <p className="an-none">No payments in this period.</p>
          )}
        </div>
      </div>

      {/* Tests, agents, hospitals */}
      <div className="an-row is-three">
        <div className="card an-card">
          <header>
            <div>
              <h4>Most-done tests</h4>
              <p>By times performed</p>
            </div>
          </header>
          {data.services.length ? (
            <HBarList items={data.services.map((x) => ({ label: x.name, value: x.count, display: formatCount(x.count), hint: `${x.category} · ${naira(x.revenue.NGN ?? 0)} billed`, color: "var(--brand-600)" }))} valueLabel="Times performed" />
          ) : (
            <p className="an-none">No tests in this period.</p>
          )}
        </div>
        <div className="card an-card">
          <header>
            <div>
              <h4>Top PR agents</h4>
              <p>Patients referred — for monthly targets</p>
            </div>
            <Handshake size={17} className="an-card-icon" aria-hidden="true" />
          </header>
          {data.agents.length ? (
            <HBarList items={data.agents.map((a) => ({ label: a.name, value: a.referrals, display: formatCount(a.referrals), hint: `${a.hospitalKey || "No hospital"} · ${naira(a.revenue.NGN ?? 0)} billed`, color: "var(--brand-600)" }))} valueLabel="Patients referred" />
          ) : (
            <p className="an-none">No referrals in this period.</p>
          )}
        </div>
        <div className="card an-card">
          <header>
            <div>
              <h4>Top referring hospitals</h4>
              <p>Referrals from their PR agents</p>
            </div>
            <Hospital size={17} className="an-card-icon" aria-hidden="true" />
          </header>
          {data.hospitals.length ? (
            <HBarList items={data.hospitals.map((h) => ({ label: h.name, value: h.referrals, display: formatCount(h.referrals), hint: `${formatCount(h.activeAgents)} active agent${h.activeAgents === 1 ? "" : "s"} · ${naira(h.revenue.NGN ?? 0)} billed`, color: "var(--brand-600)" }))} valueLabel="Referrals" />
          ) : (
            <p className="an-none">No hospital referrals in this period.</p>
          )}
        </div>
      </div>
      {level !== "admin" && <p className="an-foot">Net profit and company-wide figures are shown to the Company Admin only.{level === "staff" ? " Your figures go up to the current month." : ""}</p>}
    </section>
  );
}
