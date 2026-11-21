import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, ChartLine, Clock3, CreditCard, FileText, Minus, Percent, TrendingUp, type LucideIcon } from "lucide-react";
import type { Currency, Money } from "@/data/types";
import { CountUp, Reveal, useMotionPreset } from "@/shared/motion";
import { formatCount, formatMoney, moneyEntries } from "@/shared/format";
import { InfoTip } from "@/shared/ui/controls";
import { FitText } from "@/shared/ui/FitText";
import { compareMoney, type Summary } from "@/services/analytics";
import { OPERATING_CONTRIBUTION_RULE } from "@/services/businessRules";

type Direction = "higher-good" | "higher-bad" | "neutral";

function Trend({ cur, prev, direction, multi }: { cur: Money; prev: Money | null; direction: Direction; multi: boolean }) {
  const pct = compareMoney(cur, prev);
  const entries = moneyEntries(cur);
  if (!entries.length) return <span className="trend-pill">No data for this context</span>;
  const withData = entries.filter(([c]) => pct[c] != null);
  if (!withData.length) return <span className="trend-pill">No prior-period data</span>;
  return (
    <>
      {withData.map(([c]) => {
        const v = pct[c] as number;
        const flat = Math.abs(v) < 0.05;
        const up = v > 0;
        const cls = flat || direction === "neutral" ? "" : up === (direction === "higher-good") ? (up ? "up-good" : "down-good") : up ? "up-bad" : "down-bad";
        const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
        return (
          <span key={c} className={`trend-pill ${cls}`}>
            <Icon size={15} />
            {Math.abs(v).toFixed(1)}%{multi ? ` ${c}` : ""}
            <small>vs prior period</small>
          </span>
        );
      })}
      {withData.length < entries.length && <span className="trend-pill">Some currencies: no prior-period data</span>}
    </>
  );
}

function bigFormat(c: Currency) {
  return (n: number) => formatMoney(n, c, n >= 100_000_000);
}

function MoneyValue({ money }: { money: Money }) {
  const entries = moneyEntries(money);
  if (!entries.length) return <div className="kpi-value empty-value">—</div>;
  const [[c0, v0], ...rest] = entries;
  return (
    <>
      <FitText className="kpi-value">
        <CountUp value={v0} format={bigFormat(c0)} />
      </FitText>
      {rest.length > 0 && (
        <div className="kpi-sub-values">
          {rest.map(([c, v]) => (
            <span key={c}>
              <span className="currency-chip">{c}</span>
              <CountUp value={v} format={(n) => formatMoney(n, c)} />
            </span>
          ))}
        </div>
      )}
    </>
  );
}

function KpiCard({
  tone,
  icon: Icon,
  title,
  info,
  value,
  description,
  footer,
}: {
  tone: string;
  icon: LucideIcon;
  title: string;
  info: string;
  value: ReactNode;
  description: ReactNode;
  footer: ReactNode;
}) {
  const m = useMotionPreset();
  return (
    <motion.article className={`kpi ${tone}`} variants={m.revealItem} whileHover={m.cardHover} role="listitem" aria-label={title}>
      <div className="kpi-head">
        <span className="kpi-icon">
          <Icon size={19} strokeWidth={1.9} />
        </span>
        <h3>{title}</h3>
        <InfoTip text={info} label={`About ${title}`} />
      </div>
      {value}
      <p className="kpi-desc">{description}</p>
      <div className="kpi-foot">{footer}</div>
    </motion.article>
  );
}

export function KpiGrid({ summary, prior }: { summary: Summary; prior: Summary | null }) {
  const multi = summary.currencies.length > 1;
  const contribution = OPERATING_CONTRIBUTION_RULE;
  return (
    <Reveal mode="stagger" className="kpi-grid" role="list" aria-label="Financial KPIs">
      <KpiCard
        tone="blue"
        icon={ChartLine}
        title="Revenue Generated"
        info="Value of diagnostic services completed in the selected period. This is billed value — it is not the same as payments received."
        value={<MoneyValue money={summary.revenue} />}
        description="Eligible completed diagnostics in this period"
        footer={<Trend cur={summary.revenue} prev={prior?.revenue ?? null} direction="higher-good" multi={multi} />}
      />
      <KpiCard
        tone="green"
        icon={CreditCard}
        title="Payments Received"
        info="Valid receipts allocated to patient bills in this period, including collections of earlier balances. Bills generated are reported separately as revenue."
        value={<MoneyValue money={summary.payments} />}
        description={`Valid allocated receipts recorded · ${formatCount(summary.transactions)} transactions`}
        footer={<Trend cur={summary.payments} prev={prior?.payments ?? null} direction="higher-good" multi={multi} />}
      />
      <KpiCard
        tone="orange"
        icon={FileText}
        title="Expenses Incurred"
        info="Approved expenses counted by their expense date. Pending and rejected expenses are excluded."
        value={<MoneyValue money={summary.expenses} />}
        description="Approved expense value by expense date"
        footer={<Trend cur={summary.expenses} prev={prior?.expenses ?? null} direction="higher-bad" multi={multi} />}
      />
      <KpiCard
        tone="red"
        icon={Clock3}
        title="Outstanding Patient Balances"
        info="Unpaid and partially paid patient bills at the end of the selected period. This is an amount owed by patients, not a recorded payment."
        value={<MoneyValue money={summary.outstanding} />}
        description={`${formatCount(summary.openBills)} open bills at period end`}
        footer={<Trend cur={summary.outstanding} prev={prior?.outstanding ?? null} direction="higher-bad" multi={multi} />}
      />
      <KpiCard
        tone="purple"
        icon={Percent}
        title="PR Commissions Earned"
        info="Commission accrued to PR officers on referred diagnostics completed in this period."
        value={<MoneyValue money={summary.prCommission} />}
        description={`Accrued on ${formatCount(summary.referrals)} referrals in this period`}
        footer={<Trend cur={summary.prCommission} prev={prior?.prCommission ?? null} direction="neutral" multi={multi} />}
      />
      <KpiCard
        tone="teal"
        icon={TrendingUp}
        title="Estimated Operating Contribution"
        info="Shown only once its formula is confirmed in STANLEY's financial business rules. STANLEY does not estimate it from assumptions."
        value={
          contribution && summary.currencies.length ? (
            <MoneyValue money={Object.fromEntries(summary.currencies.map((c) => [c, contribution(summary, c)]))} />
          ) : (
            <div className="kpi-value empty-value">—</div>
          )
        }
        description={contribution ? "Calculated from the confirmed contribution rule" : "Withheld until the contribution formula is confirmed in business rules"}
        footer={<span className="trend-pill">{contribution ? "Estimate · not a recorded transaction" : "Formula awaiting confirmation"}</span>}
      />
    </Reveal>
  );
}
