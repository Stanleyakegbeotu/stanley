/**
 * Branch dashboard (manager and staff share it; access follows each person's
 * permissions). Owner's sequence (2026-11-21):
 *
 *  1. Welcome banner (reporting period)
 *  2. Quick actions — shortcuts to the daily branch work
 *  3. Daily payment summary — money received by method (Cash, POS, Transfer);
 *     each opens a table of the patients who paid that way
 *  4. Quick stats — the branch position for the period and month to date
 *  5. Daily test category summary — tests, patients, revenue, payments by category
 *  6. PR agent & hospital summary — referrals, revenue and commission
 *  7. Work queue (what needs attention) + recent records (latest visits)
 *
 * Every figure comes from the same sources as Finance & Patients, so the
 * dashboard always agrees with them. One theme colour throughout.
 */
import { useMemo, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ArrowRightLeft,
  Banknote,
  BarChart3,
  CircleCheck,
  CircleDashed,
  CircleX,
  Hourglass,
  Boxes,
  ClipboardList,
  CreditCard,
  FilePlus2,
  FileStack,
  FolderOpen,
  Handshake,
  Hospital,
  ReceiptText,
  Tag,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useApp } from "@/app/AppState";
import type { Branch, PaymentMethod } from "@/data/types";
import { CATALOGUE_CATEGORIES, CATALOGUE_INVENTORY } from "@/data/catalogueRules";
import { DRAFTS } from "@/data/demo/records";
import { ledger, openBalances, patientVisits, recordVisits, type LedgerEntry, type PatientVisit } from "@/data/demo/dailyLines";
import { useBilling } from "@/services/billing";
import { hasPhone, hospitalKey } from "@/data/legacy";
import { periodLabel, resolveRange } from "@/services/analytics";
import { pct, rateFor, rateSummary, useCommission } from "@/services/commission";
import { financeTotals } from "@/services/finance";
import { AnimatedPage, Reveal, useMotionPreset } from "@/shared/motion";
import { formatCount, formatMoney, formatShortDate, formatTime, greeting, initials } from "@/shared/format";
import { Badge, EmptyState, SearchInput, Segmented } from "@/shared/ui/controls";
import { Pagination } from "@/shared/ui/Pagination";
import { rangeText } from "@/features/dashboard/WelcomeBanner";
import { WelcomeBanner } from "@/features/dashboard/WelcomeBanner";
import { useDashboardData } from "@/features/dashboard/useDashboardData";
import { PatientRecordModal } from "@/features/shared/PatientRecord";
import { categoryMeta } from "@/features/inventory/InventoryCatalog";
import { SideModal } from "./SideModal";

/** "today", "yesterday", "this week" … or "in the selected dates" — reads naturally after a verb. */
const whenText = (pl: string) => (pl === "today" || pl === "yesterday" || pl.startsWith("this ") ? pl : "in the selected dates");

const CATEGORY_OF = new Map(CATALOGUE_INVENTORY.map((i) => [i.id, i.catalogueCategory]));

/* ─────────────── Section frame ─────────────── */

function Section({ eyebrow, title, description, action, children, className = "" }: { eyebrow: string; title: string; description?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Reveal as="section" className={`bd-sec ${className}`}>
      <header className="bd-sec-head">
        <div>
          <span className="bd-eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {action}
      </header>
      {children}
    </Reveal>
  );
}

function HeadLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" className="bd-head-link" onClick={onClick}>
      {children} <ArrowRight size={16} />
    </button>
  );
}

/* ─────────────── Page ─────────────── */

export function BranchHome({ branch }: { branch: Branch }) {
  const { period, user, navigate } = useApp();
  const ids = useMemo(() => [branch.id], [branch.id]);
  const { range, summary } = useDashboardData(ids, period);
  const pl = periodLabel(period).toLowerCase();
  const go = (page: string) => navigate(`/branch/${branch.id}/${page}`);
  const [viewing, setViewing] = useState<PatientVisit | null>(null);

  return (
    <AnimatedPage>
      <WelcomeBanner
        eyebrow={`Branch operations · ${branch.name}`}
        title={`${greeting()}, ${user.firstName}.`}
        subtitle={`Here is the work and money picture for the ${branch.name} branch — ${whenText(pl)}.`}
        summary={summary}
        range={range}
      />
      <QuickActions go={go} />
      <PaymentSummary branch={branch} range={range} periodText={pl} go={go} onOpenVisit={setViewing} />
      <PaymentStatus branch={branch} range={range} periodText={pl} onOpenVisit={setViewing} />
      <QuickStats branch={branch} range={range} periodText={pl} />
      <CategorySummary branch={branch} range={range} periodText={pl} go={go} />
      <ReferralSummary branch={branch} range={range} periodText={pl} go={go} />
      <div className="bd-pair">
        <WorkQueue branch={branch} range={range} go={go} />
        <RecentRecords branch={branch} range={range} go={go} onOpen={setViewing} />
      </div>
      <PatientRecordModal visit={viewing} onClose={() => setViewing(null)} />
    </AnimatedPage>
  );
}

/* ─────────────── 2. Quick actions ─────────────── */

const ACTIONS: { page: string; title: string; text: string; icon: LucideIcon }[] = [
  { page: "billing", title: "New Patient Entry", text: "Register a patient and begin billing", icon: FilePlus2 },
  { page: "expenses", title: "Expenses", text: "Record and monitor branch expenditure", icon: ReceiptText },
  { page: "records", title: "Patient Records", text: "Search and manage patient information", icon: FolderOpen },
  { page: "pr", title: "PR Management", text: "Referral partners, hospitals and performance", icon: Handshake },
  { page: "analysis", title: "Analysis", text: "Daily financial and operational performance", icon: BarChart3 },
  { page: "staff", title: "Staff Management", text: "Branch staff and their permissions", icon: Users },
  { page: "inventory", title: "Inventory", text: "Diagnostic tests, services and pricing", icon: Boxes },
  { page: "drafts", title: "Saved Drafts", text: "Continue unfinished billing work", icon: FileStack },
];

function QuickActions({ go }: { go: (page: string) => void }) {
  const m = useMotionPreset();
  return (
    <Section eyebrow="Branch shortcuts" title="Quick Actions" description="The most important branch work, one click away.">
      <Reveal mode="stagger" className="bd-actions">
        {ACTIONS.map((a) => (
          <motion.button key={a.page} type="button" className="bd-action" variants={m.revealItem} onClick={() => go(a.page)}>
            <a.icon className="cat-mark" size={92} strokeWidth={1.3} aria-hidden="true" />
            <span className="bd-action-icon" aria-hidden="true">
              <a.icon size={20} />
            </span>
            <span className="bd-action-text">
              <b>{a.title}</b>
              <small>{a.text}</small>
            </span>
            <span className="bd-action-go" aria-hidden="true">
              <ArrowRight size={16} />
            </span>
          </motion.button>
        ))}
      </Reveal>
    </Section>
  );
}

/* ─────────────── 3. Daily payment summary ─────────────── */

const METHOD_META: Record<PaymentMethod, { label: string; icon: LucideIcon; hint: string }> = {
  Cash: { label: "Cash", icon: Banknote, hint: "Paid in cash at the front desk" },
  POS: { label: "POS", icon: CreditCard, hint: "Card payments on the POS terminal" },
  Transfer: { label: "Bank Transfer", icon: ArrowRightLeft, hint: "Paid by bank transfer" },
};

function PaymentSummary({ branch, range, periodText, go, onOpenVisit }: { branch: Branch; range: ReturnType<typeof resolveRange>; periodText: string; go: (page: string) => void; onOpenVisit: (v: PatientVisit) => void }) {
  const { version } = useCommission();
  const money = (n: number) => formatMoney(n, branch.currency);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const ins = useMemo(
    () => ledger([branch.id], range).filter((e) => e.direction === "in"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [branch.id, range, version],
  );
  const data = useMemo(() => {
    const by = new Map<PaymentMethod, { amount: number; count: number; recovered: number }>();
    for (const e of ins) {
      const k = e.method ?? "Cash";
      const cur = by.get(k) ?? { amount: 0, count: 0, recovered: 0 };
      cur.amount += e.amount;
      cur.count += 1;
      if (e.kind === "recovery") cur.recovered += e.amount;
      by.set(k, cur);
    }
    const total = ins.reduce((s, e) => s + e.amount, 0);
    const recovered = ins.filter((e) => e.kind === "recovery").reduce((s, e) => s + e.amount, 0);
    return { by, total, count: ins.length, recovered };
  }, [ins]);

  return (
    <Section
      eyebrow="Daily payments received"
      title="Daily Payment Summary"
      description={`Money actually received ${whenText(periodText)}, by payment method — patient payments and balances recovered.`}
      action={<HeadLink onClick={() => go("billing")}>Open billing</HeadLink>}
    >
      <div className="bd-pay-total">
        <Wallet size={18} />
        <span>
          <b>{money(data.total)}</b> received from {formatCount(data.count)} payment{data.count === 1 ? "" : "s"}
          {data.recovered > 0 && <> · {money(data.recovered)} of it recovered balances</>}
        </span>
      </div>
      <div className="bd-pays">
        {(Object.keys(METHOD_META) as PaymentMethod[]).map((k) => {
          const meta = METHOD_META[k];
          const d = data.by.get(k) ?? { amount: 0, count: 0, recovered: 0 };
          const share = data.total ? (d.amount / data.total) * 100 : 0;
          return (
            <button key={k} type="button" className="bd-pay" onClick={() => setMethod(k)} aria-label={`${meta.label}: ${money(d.amount)} from ${d.count} transactions — view the patients who paid`}>
              <meta.icon className="cat-mark" size={84} strokeWidth={1.3} aria-hidden="true" />
              <div className="bd-pay-top">
                <span className="bd-pay-icon" aria-hidden="true">
                  <meta.icon size={19} />
                </span>
                <span className="bd-pay-label">
                  <b>{meta.label}</b>
                  <small>{meta.hint}</small>
                </span>
              </div>
              <strong className="bd-pay-amount num">{money(d.amount)}</strong>
              <span className="bd-pay-count">
                {formatCount(d.count)} transaction{d.count === 1 ? "" : "s"} · {share >= 1 || !share ? Math.round(share) : "<1"}%
              </span>
              <span className="bd-pay-bar" aria-hidden="true">
                <i style={{ width: `${Math.max(share ? 2 : 0, share)}%` }} />
              </span>
              <span className="bd-pay-link">
                View transactions <ArrowRight size={15} />
              </span>
            </button>
          );
        })}
      </div>
      {method && <PaymentsModal branch={branch} range={range} periodText={periodText} entries={ins} method={method} onMethod={setMethod} onClose={() => setMethod(null)} onOpenVisit={onOpenVisit} />}
    </Section>
  );
}

/** Everyone who paid by one method in the period — a table, switchable between methods. */
function PaymentsModal({
  branch,
  range,
  periodText,
  entries,
  method,
  onMethod,
  onClose,
  onOpenVisit,
}: {
  branch: Branch;
  range: ReturnType<typeof resolveRange>;
  periodText: string;
  entries: LedgerEntry[];
  method: PaymentMethod;
  onMethod: (m: PaymentMethod) => void;
  onClose: () => void;
  onOpenVisit: (v: PatientVisit) => void;
}) {
  const { agents } = useApp();
  const money = (n: number) => formatMoney(n, branch.currency);
  const meta = METHOD_META[method];
  // "cash", "bank transfer" — but keep "POS" in capitals.
  const word = method === "POS" ? "POS" : meta.label.toLowerCase();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | "visit" | "recovery">("all");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const agentName = useMemo(() => new Map(agents.map((a) => [a.id, a.name])), [agents]);

  const ofMethod = entries.filter((e) => e.method === method).sort((a, b) => b.at.getTime() - a.at.getTime());
  const term = q.trim().toLowerCase();
  const rows = ofMethod.filter((e) => {
    if (kind !== "all" && e.kind !== kind) return false;
    if (!term) return true;
    const v = e.visit;
    return `${v?.patientName ?? ""} ${v?.patientRef ?? ""} ${v?.id ?? ""} ${v?.services.map((s) => s.name).join(" ") ?? ""} ${e.recordedBy}`.toLowerCase().includes(term);
  });
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const safe = Math.min(page, pages);
  const visible = rows.slice((safe - 1) * size, safe * size);
  const total = ofMethod.reduce((s, e) => s + e.amount, 0);
  const recovered = ofMethod.filter((e) => e.kind === "recovery").reduce((s, e) => s + e.amount, 0);
  const patients = new Set(ofMethod.map((e) => e.visit?.patientRef)).size;
  const shownTotal = rows.reduce((s, e) => s + e.amount, 0);
  const multiDay = range.days > 1;
  const of = (m: PaymentMethod) => entries.filter((e) => e.method === m);
  const when = periodText === "today" ? "Today" : rangeText(range);

  return (
    <SideModal
      icon={meta.icon}
      eyebrow="Daily payment summary"
      title={`${meta.label} payments`}
      subtitle={`${when} · ${branch.name} branch`}
      navLabel="Payment method"
      nav={(Object.keys(METHOD_META) as PaymentMethod[]).map((m) => ({
        value: m,
        label: METHOD_META[m].label,
        icon: METHOD_META[m].icon,
        count: formatCount(of(m).length),
        amount: money(of(m).reduce((s, e) => s + e.amount, 0)),
      }))}
      value={method}
      onChange={(m) => {
        onMethod(m);
        setPage(1);
      }}
      kpis={[
        { label: "Patients", icon: Users, value: formatCount(patients), caption: `Paid by ${word}` },
        { label: "Transactions", icon: ReceiptText, value: formatCount(ofMethod.length), caption: `${formatCount(ofMethod.filter((e) => e.kind === "visit").length)} at visit · ${formatCount(ofMethod.filter((e) => e.kind === "recovery").length)} balances` },
        { label: "Amount received", icon: meta.icon, value: money(total), caption: `By ${word}` },
        { label: "Balances recovered", icon: Wallet, value: money(recovered), caption: "Older bills paid off" },
      ]}
      sideNote="Demo patients carry sample names; patients billed in STANLEY show their real names."
      mainEyebrow={`${meta.label} · ${when}`}
      mainTitle="Patients who paid"
      description={`Every patient who paid by ${word} ${whenText(periodText)}. Select a row to open the patient's visit record.`}
      onClose={onClose}
    >
      <>
        <div className="spm-tools">
          <SearchInput
            placeholder="Search patient ID, visit number, test or staff"
            value={q}
            onChange={(v) => {
              setQ(v);
              setPage(1);
            }}
          />
          <Segmented
            label="Payment for"
            value={kind}
            onChange={(v) => {
              setKind(v);
              setPage(1);
            }}
            options={[
              { value: "all", label: "All payments" },
              { value: "visit", label: "Paid at visit" },
              { value: "recovery", label: "Balance recovered" },
            ]}
          />
        </div>

        <div className="spm-table-card">
          <div className="spm-table-head">
            <span>
              <b>{formatCount(rows.length)}</b> payment{rows.length === 1 ? "" : "s"} · <b>{money(shownTotal)}</b>
            </span>
            <small>Newest first</small>
          </div>
          <div className="table-wrap thin-scroll">
            <table className="bp-table rf-table bd-table bd-pm-table spm-table" aria-label={`${meta.label} payments`}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>{multiDay ? "Date & time" : "Time"}</th>
                  <th>Patient · visit no.</th>
                  <th>Tests</th>
                  <th>Payment for</th>
                  <th>Referred by</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={9}>
                      <EmptyState title={ofMethod.length ? "No payments match these filters" : `No ${word} payments ${periodText === "today" ? "today" : "in this period"}`} />
                    </td>
                  </tr>
                ) : (
                  visible.map((e, i) => {
                    const v = e.visit;
                    return (
                      <tr
                        key={e.id}
                        className="pr-row"
                        tabIndex={0}
                        onClick={() => v && onOpenVisit(v)}
                        onKeyDown={(k) => (k.key === "Enter" || k.key === " ") && v && (k.preventDefault(), onOpenVisit(v))}
                        aria-label={`${v?.patientRef ?? "Payment"} — open visit record`}
                      >
                        <td>
                          <span className="bd-rank">{(safe - 1) * size + i + 1}</span>
                        </td>
                        <td className="num">{multiDay ? `${formatShortDate(e.at)}, ${formatTime(e.at)}` : formatTime(e.at)}</td>
                        <td>
                          <strong>{v?.patientName ?? "—"}</strong>
                          <small className="ep-sub mono">
                            {v?.patientRef} · {v?.id}
                          </small>
                          <small className="ep-sub">{v ? (v.isNew ? "New patient" : "Returning patient") : ""}</small>
                        </td>
                        <td className="bd-pm-tests" title={v?.services.map((s) => s.name).join(", ")}>
                          {v?.services[0]?.name}
                          {v && v.services.length > 1 && <small> + {v.services.length - 1} more</small>}
                        </td>
                        <td>
                          {e.kind === "recovery" ? (
                            <>
                              <Badge tone="brand">Balance recovered</Badge>
                              <small className="ep-sub">Visit of {v ? formatShortDate(v.at) : "—"}</small>
                            </>
                          ) : (
                            <>
                              <Badge tone={v?.payment === "Paid" ? "ok" : "warn"}>{v?.payment === "Paid" ? "Paid in full" : "Part payment"}</Badge>
                              {v && v.payment !== "Paid" && <small className="ep-sub">{money(v.billed - v.paid)} left</small>}
                            </>
                          )}
                        </td>
                        <td className="spm-ref">{v?.agentId != null ? (agentName.get(v.agentId) ?? `PR agent #${v.agentId}`) : <span className="lg-muted">Walk-in</span>}</td>
                        <td className="num">
                          <strong>{money(e.amount)}</strong>
                          <small className="ep-sub">by {e.recordedBy}</small>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            page={safe}
            pageSize={size}
            sizes={[10, 25, 50]}
            total={rows.length}
            noun="payments"
            onPage={(p) => setPage(Math.min(Math.max(1, p), pages))}
            onPageSize={(s) => {
              setSize(s);
              setPage(1);
            }}
          />
        </div>
      </>
    </SideModal>
  );
}

/* ─────────────── 3b. Patient payment status ─────────────── */

type StatusKey = "paid" | "part" | "unpaid" | "owing";

interface StatusRow {
  v: PatientVisit;
  /** Still owed now (at the end of the period); 0 when cleared. */
  owed: number;
  /** Days since the visit (outstanding list). */
  age?: number;
}

const STATUS_META: Record<StatusKey, { label: string; short: string; icon: LucideIcon; hint: string }> = {
  paid: { label: "Paid in full", short: "Paid in full", icon: CircleCheck, hint: "Paid the whole bill at the visit" },
  part: { label: "Part payment", short: "Part payment", icon: CircleDashed, hint: "Paid some of the bill at the visit" },
  unpaid: { label: "Not paid", short: "Not paid", icon: CircleX, hint: "Paid nothing at the visit" },
  owing: { label: "Outstanding balances", short: "Outstanding", icon: Hourglass, hint: "Every bill still owed, from any date" },
};

function usePaymentStatus(branchId: string, range: ReturnType<typeof resolveRange>) {
  const { version } = useCommission();
  return useMemo(() => {
    const visits = patientVisits([branchId], range);
    const open = openBalances(branchId, range.to);
    const owedNow = new Map(open.map((o) => [o.visit.id, o.remaining]));
    const row = (v: PatientVisit): StatusRow => ({ v, owed: owedNow.get(v.id) ?? 0 });
    return {
      paid: visits.filter((v) => v.payment === "Paid").map(row),
      part: visits.filter((v) => v.payment === "Part-paid").map(row),
      unpaid: visits.filter((v) => v.payment === "Unpaid").map(row),
      // Oldest first — the ones to follow up on first.
      owing: open.map((o) => ({ v: o.visit, owed: o.remaining, age: o.ageDays })).sort((a, b) => b.age! - a.age!),
    } satisfies Record<StatusKey, StatusRow[]>;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, range, version]);
}

function PaymentStatus({ branch, range, periodText, onOpenVisit }: { branch: Branch; range: ReturnType<typeof resolveRange>; periodText: string; onOpenVisit: (v: PatientVisit) => void }) {
  const money = (n: number) => formatMoney(n, branch.currency);
  const data = usePaymentStatus(branch.id, range);
  const [open, setOpen] = useState<StatusKey | null>(null);
  const when = whenText(periodText);
  const sum = (rows: StatusRow[], f: (r: StatusRow) => number) => rows.reduce((s, r) => s + f(r), 0);
  const visits = data.paid.length + data.part.length + data.unpaid.length;

  const cards: { key: StatusKey; value: string; amount: string; lines: string[] }[] = [
    { key: "paid", value: formatCount(data.paid.length), amount: money(sum(data.paid, (r) => r.v.paid)), lines: [`${visits ? Math.round((data.paid.length / visits) * 100) : 0}% of visits ${when}`, "Nothing left to pay"] },
    {
      key: "part",
      value: formatCount(data.part.length),
      amount: money(sum(data.part, (r) => r.v.paid)),
      lines: [`Paid of ${money(sum(data.part, (r) => r.v.billed))} billed`, `${money(sum(data.part, (r) => r.owed))} still owed now`],
    },
    {
      key: "unpaid",
      value: formatCount(data.unpaid.length),
      amount: money(sum(data.unpaid, (r) => r.v.billed)),
      lines: ["Billed, nothing paid at the visit", `${money(sum(data.unpaid, (r) => r.owed))} still owed now`],
    },
    {
      key: "owing",
      value: formatCount(data.owing.length),
      amount: money(sum(data.owing, (r) => r.owed)),
      lines: [`Bills still owed at the end of ${periodText === "today" ? "today" : "the period"}`, data.owing.length ? `Oldest: ${data.owing[0].age} days` : "None"],
    },
  ];

  return (
    <Section eyebrow="Payment status" title="Patient Payment Status" description={`Who paid in full, who part-paid and who has not paid ${when} — and every balance still owed. Select a card to see the patients.`}>
      <div className="bd-status">
        {cards.map((c) => {
          const meta = STATUS_META[c.key];
          return (
            <button key={c.key} type="button" className={`bd-pay bd-st is-${c.key}`} onClick={() => setOpen(c.key)}>
              <meta.icon className="cat-mark" size={84} strokeWidth={1.3} aria-hidden="true" />
              <div className="bd-pay-top">
                <span className="bd-pay-icon" aria-hidden="true">
                  <meta.icon size={19} />
                </span>
                <span className="bd-pay-label">
                  <b>{meta.label}</b>
                  <small>{meta.hint}</small>
                </span>
              </div>
              <div className="bd-st-figs">
                <strong className="num">{c.value}</strong>
                <span>{c.key === "owing" ? "bills" : "patients"}</span>
              </div>
              <span className="bd-st-amount num">{c.amount}</span>
              {c.lines.map((l) => (
                <small key={l} className="bd-st-line">
                  {l}
                </small>
              ))}
              <span className="bd-pay-link">
                View patients <ArrowRight size={15} />
              </span>
            </button>
          );
        })}
      </div>
      <p className="bd-note">Status is how much each patient paid at their visit. "Still owed now" also counts balances paid off later, so a part-paid bill may already be cleared.</p>
      {open && <StatusModal branch={branch} range={range} periodText={periodText} data={data} status={open} onStatus={setOpen} onClose={() => setOpen(null)} onOpenVisit={onOpenVisit} />}
    </Section>
  );
}

function StatusModal({
  branch,
  range,
  periodText,
  data,
  status,
  onStatus,
  onClose,
  onOpenVisit,
}: {
  branch: Branch;
  range: ReturnType<typeof resolveRange>;
  periodText: string;
  data: Record<StatusKey, StatusRow[]>;
  status: StatusKey;
  onStatus: (s: StatusKey) => void;
  onClose: () => void;
  onOpenVisit: (v: PatientVisit) => void;
}) {
  const { agents } = useApp();
  const money = (n: number) => formatMoney(n, branch.currency);
  const meta = STATUS_META[status];
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const agentName = useMemo(() => new Map(agents.map((a) => [a.id, a.name])), [agents]);
  const all = data[status];
  const term = q.trim().toLowerCase();
  const rows = all.filter((r) => !term || `${r.v.patientName} ${r.v.patientRef} ${r.v.id} ${r.v.services.map((s) => s.name).join(" ")} ${r.v.agentId != null ? (agentName.get(r.v.agentId) ?? "") : "walk-in"}`.toLowerCase().includes(term));
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const safe = Math.min(page, pages);
  const visible = rows.slice((safe - 1) * size, safe * size);
  const owing = status === "owing";
  const multiDay = owing || range.days > 1;
  const billed = all.reduce((s, r) => s + r.v.billed, 0);
  const paid = all.reduce((s, r) => s + r.v.paid, 0);
  const owed = all.reduce((s, r) => s + r.owed, 0);
  const when = whenText(periodText);

  const period = owing ? `As at ${formatShortDate(range.to)}` : periodText === "today" ? "Today" : rangeText(range);
  const amountOf = (k: StatusKey) => money(k === "owing" || k === "unpaid" ? data[k].reduce((s, r) => s + (k === "owing" ? r.owed : r.v.billed), 0) : data[k].reduce((s, r) => s + r.v.paid, 0));

  return (
    <SideModal
      icon={meta.icon}
      eyebrow="Patient payment status"
      title={meta.label}
      subtitle={`${period} · ${branch.name} branch`}
      navLabel="Payment status"
      nav={(Object.keys(STATUS_META) as StatusKey[]).map((k) => ({
        value: k,
        label: STATUS_META[k].label,
        icon: STATUS_META[k].icon,
        count: formatCount(data[k].length),
        amount: `${amountOf(k)} ${k === "owing" ? "owed" : k === "unpaid" ? "unpaid" : "paid"}`,
      }))}
      value={status}
      onChange={(s) => {
        onStatus(s);
        setPage(1);
      }}
      kpis={[
        { label: owing ? "Bills owing" : "Patients", icon: Users, value: formatCount(all.length), caption: owing ? `${formatCount(new Set(all.map((r) => r.v.patientRef)).size)} patients` : meta.hint },
        { label: "Billed", icon: ReceiptText, value: money(billed), caption: owing ? "Original bills" : "Value of their tests" },
        { label: "Paid at visit", icon: Wallet, value: money(paid), caption: owing ? "Before the balance" : `${billed ? Math.round((paid / billed) * 100) : 0}% of the billed amount` },
        { label: "Still owed now", icon: Hourglass, value: money(owed), caption: owing ? "Total to recover" : owed ? "Not yet recovered" : "Nothing outstanding", tone: owed ? "danger" : undefined },
      ]}
      sideNote={'Status is what each patient paid at the visit. "Still owed" also counts balances paid off later.'}
      mainEyebrow={`${meta.label} · ${period}`}
      mainTitle={owing ? "Bills still owed" : "Patients"}
      description={owing ? "Every bill still owed at the branch, oldest first — follow these up. Select a row to open the patient's visit record." : `Patients whose visit ${when} was ${meta.label.toLowerCase()}. Select a row to open the patient's visit record.`}
      onClose={onClose}
    >
      <>
        <div className="spm-tools">
          <SearchInput
            placeholder="Search patient ID, visit number, test or PR agent"
            value={q}
            onChange={(v) => {
              setQ(v);
              setPage(1);
            }}
          />
        </div>

        <div className="spm-table-card">
          <div className="spm-table-head">
            <span>
              <b>{formatCount(rows.length)}</b> {owing ? "bill" : "visit"}
              {rows.length === 1 ? "" : "s"} · <b>{money(rows.reduce((s, r) => s + (owing ? r.owed : r.v.billed), 0))}</b> {owing ? "owed" : "billed"}
            </span>
            <small>{owing ? "Oldest first" : "Newest first"}</small>
          </div>
          <div className="table-wrap thin-scroll">
            <table className="bp-table rf-table bd-table bd-pm-table spm-table" aria-label={meta.label}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>{multiDay ? "Visit date" : "Time"}</th>
                  <th>Patient · visit no.</th>
                  <th>Tests</th>
                  <th className="num">Billed</th>
                  <th className="num">Paid at visit</th>
                  <th className="num">Still owed</th>
                  <th>Referred by</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={9}>
                      <EmptyState title={all.length ? "No patients match this search" : owing ? "No balances outstanding" : `No ${meta.label.toLowerCase()} visits ${when}`} />
                    </td>
                  </tr>
                ) : (
                  visible.map((r, i) => {
                    const v = r.v;
                    const leftAtVisit = v.billed - v.paid;
                    return (
                      <tr key={v.id} className="pr-row" tabIndex={0} onClick={() => onOpenVisit(v)} onKeyDown={(k) => (k.key === "Enter" || k.key === " ") && (k.preventDefault(), onOpenVisit(v))} aria-label={`${v.patientRef} — open visit record`}>
                        <td>
                          <span className="bd-rank">{(safe - 1) * size + i + 1}</span>
                        </td>
                        <td className="num">{multiDay ? `${formatShortDate(v.at)}, ${formatTime(v.at)}` : formatTime(v.at)}</td>
                        <td>
                          <strong>{v.patientName}</strong>
                          <small className="ep-sub mono">
                            {v.patientRef} · {v.id}
                          </small>
                          <small className="ep-sub">{v.isNew ? "New patient" : "Returning patient"}</small>
                        </td>
                        <td className="bd-pm-tests" title={v.services.map((s) => s.name).join(", ")}>
                          {v.services[0]?.name}
                          {v.services.length > 1 && <small> + {v.services.length - 1} more</small>}
                        </td>
                        <td className="num">{money(v.billed)}</td>
                        <td className="num">
                          {v.paid ? money(v.paid) : <span className="lg-muted">₦0</span>}
                          {v.method && <small className="ep-sub">{v.method === "Transfer" ? "Bank transfer" : v.method}</small>}
                        </td>
                        <td className="num">
                          {r.owed > 0 ? (
                            <>
                              <strong className="bd-owed">{money(r.owed)}</strong>
                              <small className="ep-sub">{owing ? `${r.age} day${r.age === 1 ? "" : "s"} old` : leftAtVisit > r.owed ? `${money(leftAtVisit - r.owed)} recovered` : "Not yet recovered"}</small>
                            </>
                          ) : leftAtVisit > 0 ? (
                            <Badge tone="ok">Cleared later</Badge>
                          ) : (
                            <Badge tone="ok">Nothing owed</Badge>
                          )}
                        </td>
                        <td className="spm-ref">{v.agentId != null ? (agentName.get(v.agentId) ?? `PR agent #${v.agentId}`) : <span className="lg-muted">Walk-in</span>}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            page={safe}
            pageSize={size}
            sizes={[10, 25, 50]}
            total={rows.length}
            noun={owing ? "bills" : "visits"}
            onPage={(p) => setPage(Math.min(Math.max(1, p), pages))}
            onPageSize={(s) => {
              setSize(s);
              setPage(1);
            }}
          />
        </div>
      </>
    </SideModal>
  );
}

/* ─────────────── 4. Quick stats ─────────────── */

function QuickStats({ branch, range, periodText }: { branch: Branch; range: ReturnType<typeof resolveRange>; periodText: string }) {
  const { version } = useCommission();
  const money = (n: number) => formatMoney(n, branch.currency);
  const d = useMemo(() => {
    const t = financeTotals(branch.id, range);
    const mo = financeTotals(branch.id, resolveRange({ key: "month" }));
    const visits = patientVisits([branch.id], range);
    return { t, mo, fully: visits.filter((v) => v.payment === "Paid").length, visits: visits.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch.id, range, version]);
  const when = whenText(periodText);
  const stats: { label: string; value: ReactNode; caption: string; tone?: "warn" | "down" }[] = [
    { label: "Revenue generated", value: money(d.t.billed), caption: "Value of tests billed · not cash collected" },
    { label: "Patients served", value: formatCount(d.t.patients), caption: `With a visit ${when}` },
    { label: "Discounts granted", value: "Not recorded", caption: "Bills carry no discount data yet" },
    { label: "Fully paid visits", value: formatCount(d.fully), caption: `Of ${formatCount(d.visits)} visits · no balance left` },
    { label: "Patients owing", value: formatCount(d.t.openBills), caption: `${money(d.t.outstanding)} outstanding at period end`, tone: d.t.openBills ? "warn" : undefined },
    { label: "Expenses incurred", value: money(d.t.expenses), caption: "Approved expenses by date" },
    { label: "Net profit", value: money(d.t.net), caption: "Money in − expenses − PR commission", tone: d.t.net < 0 ? "down" : undefined },
    { label: "Monthly expenses", value: money(d.mo.expenses), caption: `${resolveRange({ key: "month" }).from.toLocaleDateString("en-GB", { month: "long", year: "numeric" })} to date` },
    { label: "Monthly net profit", value: money(d.mo.net), caption: "Month to date, after expenses and commission", tone: d.mo.net < 0 ? "down" : undefined },
  ];
  return (
    <Section eyebrow="Branch snapshot" title="Quick Stats" description={`Position ${when}. Monthly figures run to this date.`}>
      <div className="bd-stats">
        {stats.map((s) => (
          <div key={s.label} className={`bd-stat ${s.tone ? `is-${s.tone}` : ""}`}>
            <span>{s.label}</span>
            <strong className="num">{s.value}</strong>
            <small>{s.caption}</small>
          </div>
        ))}
      </div>
      <p className="bd-note">Net profit is cash-based: money received minus approved expenses and PR commission ({rateSummary()}). It matches the Finance & Expenses page.</p>
    </Section>
  );
}

/* ─────────────── 5. Daily test category summary ─────────────── */

function CategorySummary({ branch, range, periodText, go }: { branch: Branch; range: ReturnType<typeof resolveRange>; periodText: string; go: (page: string) => void }) {
  const { inventory } = useApp();
  const money = (n: number) => formatMoney(n, branch.currency);
  const rows = useMemo(() => {
    const acc = new Map<string, { tests: number; patients: Set<string>; revenue: number; paid: number }>();
    for (const c of CATALOGUE_CATEGORIES) acc.set(c.key, { tests: 0, patients: new Set(), revenue: 0, paid: 0 });
    for (const v of patientVisits([branch.id], range)) {
      const sum = v.services.reduce((s, x) => s + x.price, 0) || 1;
      for (const s of v.services) {
        const key = CATEGORY_OF.get(s.id) ?? "Other";
        const r = acc.get(key) ?? { tests: 0, patients: new Set<string>(), revenue: 0, paid: 0 };
        r.tests += 1;
        r.patients.add(v.patientRef);
        r.revenue += s.price;
        // Payments received at the visit, shared across its tests by price.
        r.paid += (v.paid * s.price) / sum;
        acc.set(key, r);
      }
    }
    return [...acc.entries()].map(([key, r]) => ({ key, label: inventory.categoryNames[key] ?? key, tests: r.tests, patients: r.patients.size, revenue: r.revenue, paid: Math.round(r.paid) })).sort((a, b) => b.revenue - a.revenue || a.label.localeCompare(b.label));
  }, [branch.id, range, inventory.categoryNames]);
  const total = rows.reduce((s, r) => ({ tests: s.tests + r.tests, revenue: s.revenue + r.revenue, paid: s.paid + r.paid }), { tests: 0, revenue: 0, paid: 0 });
  const top = Math.max(1, ...rows.map((r) => r.revenue));

  return (
    <Section
      eyebrow="Diagnostic services"
      title="Daily Test Category Summary"
      description={`Tests performed ${whenText(periodText)} by catalogue category, with the revenue and payments they brought in.`}
      action={<HeadLink onClick={() => go("inventory")}>Service catalogue</HeadLink>}
    >
      <div className="spm-table-card">
        <div className="spm-table-head">
          <span>
            <b>{rows.filter((r) => r.tests).length}</b> of {rows.length} categories used · <b>{money(total.revenue)}</b> revenue
          </span>
          <small>Highest revenue first</small>
        </div>
        <div className="table-wrap thin-scroll">
          <table className="bp-table rf-table bd-table spm-table bd-cat-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Category</th>
                <th className="num">Tests done</th>
                <th className="num">Patients</th>
                <th>Revenue generated</th>
                <th className="num">Payments received</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const meta = categoryMeta(r.key);
                const share = total.revenue ? (r.revenue / total.revenue) * 100 : 0;
                return (
                  <tr key={r.key} className={`is-hover ${r.tests ? "" : "is-zero"}`}>
                    <td>
                      <span className="bd-rank">{i + 1}</span>
                    </td>
                    <td>
                      <span className="bd-cat-cell">
                        <span className="bd-cat-icon" aria-hidden="true">
                          <meta.icon size={16} />
                        </span>
                        <span>
                          <strong>{r.label}</strong>
                          <small>{meta.label}</small>
                        </span>
                      </span>
                    </td>
                    <td className="num">
                      <strong>{formatCount(r.tests)}</strong>
                    </td>
                    <td className="num">{formatCount(r.patients)}</td>
                    <td>
                      <span className="bd-rev">
                        <span className="bd-rev-bar" aria-hidden="true">
                          <i style={{ width: `${(r.revenue / top) * 100}%` }} />
                        </span>
                        <b className="num">{money(r.revenue)}</b>
                        <small className="bd-rev-pct num">{r.revenue ? `${share >= 1 ? Math.round(share) : "<1"}%` : "—"}</small>
                      </span>
                    </td>
                    <td className="num">
                      {money(r.paid)}
                      {r.revenue > 0 && <small className="ep-sub">{Math.round((r.paid / r.revenue) * 100)}% collected</small>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td />
                <td>Total</td>
                <td className="num">{formatCount(total.tests)}</td>
                <td className="num">—</td>
                <td>
                  <b className="num">{money(total.revenue)}</b>
                </td>
                <td className="num">{money(total.paid)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      <p className="bd-note">Payments received are what patients paid at their visits, shared across each visit's tests by price. Balances recovered later appear in the Daily Payment Summary.</p>
    </Section>
  );
}

/* ─────────────── 6. PR agent & hospital summary ─────────────── */

type ReferralTab = "agents" | "hospitals";

interface AgentRow {
  id: number;
  name: string;
  phone: string;
  hospital: string;
  patients: Set<string>;
  visits: number;
  billed: number;
  commission: number;
  rate: number;
}
interface HospitalRow {
  key: string;
  agents: Set<number>;
  patients: Set<string>;
  billed: number;
  commission: number;
}

function useReferrals(branchId: string, range: ReturnType<typeof resolveRange>) {
  const { agents } = useApp();
  const { version } = useCommission();
  return useMemo(() => {
    const byId = new Map(agents.map((a) => [a.id, a]));
    const referred = patientVisits([branchId], range).filter((v) => v.agentId !== null);
    const ag = new Map<number, AgentRow>();
    for (const v of referred) {
      const a = byId.get(v.agentId!);
      const cur = ag.get(v.agentId!) ?? { id: v.agentId!, name: a?.name ?? `PR agent #${v.agentId}`, phone: a && hasPhone(a.phone) ? a.phone : "", hospital: hospitalKey(a?.hospital ?? "") || "No hospital", patients: new Set<string>(), visits: 0, billed: 0, commission: 0, rate: rateFor(v.agentId!) };
      cur.patients.add(v.patientRef);
      cur.visits += 1;
      cur.billed += v.billed;
      cur.commission += v.billed * rateFor(v.agentId!);
      ag.set(v.agentId!, cur);
    }
    const agentRows = [...ag.values()].sort((a, b) => b.billed - a.billed);
    const hos = new Map<string, HospitalRow>();
    for (const a of agentRows) {
      const cur = hos.get(a.hospital) ?? { key: a.hospital, agents: new Set<number>(), patients: new Set<string>(), billed: 0, commission: 0 };
      cur.agents.add(a.id);
      a.patients.forEach((p) => cur.patients.add(p));
      cur.billed += a.billed;
      cur.commission += a.commission;
      hos.set(a.hospital, cur);
    }
    return {
      agentRows,
      hospitalRows: [...hos.values()].sort((a, b) => b.billed - a.billed),
      patients: new Set(referred.map((v) => v.patientRef)).size,
      visits: referred.length,
      billed: referred.reduce((s, v) => s + v.billed, 0),
      commission: agentRows.reduce((s, a) => s + a.commission, 0),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, range, agents, version]);
}

function ReferralSummary({ branch, range, periodText, go }: { branch: Branch; range: ReturnType<typeof resolveRange>; periodText: string; go: (page: string) => void }) {
  const money = (n: number) => formatMoney(n, branch.currency);
  const d = useReferrals(branch.id, range);
  const [open, setOpen] = useState<ReferralTab | null>(null);
  const when = whenText(periodText);

  const kpis = [
    { label: "Active PR agents", value: formatCount(d.agentRows.length), caption: `Referred patients ${when}` },
    { label: "Referred patients", value: formatCount(d.patients), caption: "Sent by a PR agent" },
    { label: "Referral revenue", value: money(d.billed), caption: "Full bills of referred patients" },
    { label: "PR commission", value: money(d.commission), caption: rateSummary() },
  ];
  const topAgent = d.agentRows[0];
  const topHospital = d.hospitalRows.find((h) => h.key !== "No hospital") ?? d.hospitalRows[0];
  const launch: { key: ReferralTab; title: string; hint: string; icon: LucideIcon; count: string; noun: string; amount: string; top: string }[] = [
    {
      key: "agents",
      title: "PR agent performance",
      hint: "Every agent who referred patients, with commission",
      icon: Handshake,
      count: formatCount(d.agentRows.length),
      noun: d.agentRows.length === 1 ? "agent" : "agents",
      amount: `${money(d.billed)} billed · ${money(d.commission)} commission`,
      top: topAgent ? `Top: ${topAgent.name} · ${money(topAgent.billed)}` : `No referrals ${when}`,
    },
    {
      key: "hospitals",
      title: "Hospital performance",
      hint: "Partner hospitals ranked by referral revenue",
      icon: Hospital,
      count: formatCount(d.hospitalRows.length),
      noun: d.hospitalRows.length === 1 ? "hospital" : "hospitals",
      amount: `${formatCount(d.patients)} referred patient${d.patients === 1 ? "" : "s"}`,
      top: topHospital ? `Top: ${topHospital.key} · ${money(topHospital.billed)}` : `No referrals ${when}`,
    },
  ];

  return (
    <Section eyebrow="Referral network" title="PR Agent & Hospital Summary" description="Who is sending patients, what they billed and the commission earned. Open a card to see the full list." action={<HeadLink onClick={() => go("pr")}>Open PR Management</HeadLink>}>
      <div className="bd-stats is-four">
        {kpis.map((k) => (
          <div key={k.label} className="bd-stat">
            <span>{k.label}</span>
            <strong className="num">{k.value}</strong>
            <small>{k.caption}</small>
          </div>
        ))}
      </div>
      <div className="bd-ref-cards">
        {launch.map((c) => (
          <button key={c.key} type="button" className="bd-pay bd-ref" onClick={() => setOpen(c.key)}>
            <c.icon className="cat-mark" size={96} strokeWidth={1.3} aria-hidden="true" />
            <div className="bd-pay-top">
              <span className="bd-pay-icon" aria-hidden="true">
                <c.icon size={19} />
              </span>
              <span className="bd-pay-label">
                <b>{c.title}</b>
                <small>{c.hint}</small>
              </span>
            </div>
            <div className="bd-st-figs">
              <strong className="num">{c.count}</strong>
              <span>{c.noun}</span>
            </div>
            <span className="bd-st-line">{c.amount}</span>
            <span className="bd-st-line">{c.top}</span>
            <span className="bd-pay-link">
              View {c.key === "agents" ? "PR agents" : "hospitals"} <ArrowRight size={15} />
            </span>
          </button>
        ))}
      </div>
      {open && <ReferralModal branch={branch} range={range} periodText={periodText} data={d} tab={open} onTab={setOpen} onClose={() => setOpen(null)} go={go} />}
    </Section>
  );
}

function ReferralModal({
  branch,
  range,
  periodText,
  data: d,
  tab,
  onTab,
  onClose,
  go,
}: {
  branch: Branch;
  range: ReturnType<typeof resolveRange>;
  periodText: string;
  data: ReturnType<typeof useReferrals>;
  tab: ReferralTab;
  onTab: (t: ReferralTab) => void;
  onClose: () => void;
  go: (page: string) => void;
}) {
  const money = (n: number) => formatMoney(n, branch.currency);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const period = periodText === "today" ? "Today" : rangeText(range);
  const agentsTab = tab === "agents";
  const term = q.trim().toLowerCase();
  const agentRows = d.agentRows.filter((a) => !term || `${a.name} ${a.hospital} ${a.phone}`.toLowerCase().includes(term));
  const hospitalRows = d.hospitalRows.filter((h) => !term || h.key.toLowerCase().includes(term));
  const total = agentsTab ? agentRows.length : hospitalRows.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const safe = Math.min(page, pages);
  const from = (safe - 1) * size;
  const topBilled = Math.max(1, ...(agentsTab ? d.agentRows.map((a) => a.billed) : d.hospitalRows.map((h) => h.billed)));
  const openRow = (path: string) => {
    onClose();
    go(path);
  };

  return (
    <SideModal
      icon={agentsTab ? Handshake : Hospital}
      eyebrow="Referral network"
      title={agentsTab ? "PR agent performance" : "Hospital performance"}
      subtitle={`${period} · ${branch.name} branch`}
      navLabel="Show"
      nav={[
        { value: "agents" as ReferralTab, label: "PR agents", icon: Handshake, count: formatCount(d.agentRows.length), amount: `${money(d.commission)} commission` },
        { value: "hospitals" as ReferralTab, label: "Hospitals", icon: Hospital, count: formatCount(d.hospitalRows.length), amount: `${money(d.billed)} billed` },
      ]}
      value={tab}
      onChange={(t) => {
        onTab(t);
        setQ("");
        setPage(1);
      }}
      kpis={[
        { label: agentsTab ? "Active agents" : "Hospitals", icon: agentsTab ? Handshake : Hospital, value: formatCount(agentsTab ? d.agentRows.length : d.hospitalRows.length), caption: `Referred ${periodText === "today" ? "today" : "in this period"}` },
        { label: "Referred patients", icon: Users, value: formatCount(d.patients), caption: `${formatCount(d.visits)} referred visits` },
        { label: "Referral revenue", icon: ReceiptText, value: money(d.billed), caption: "Full bills of referred patients" },
        { label: "PR commission", icon: Wallet, value: money(d.commission), caption: rateSummary() },
      ]}
      sideNote="Commission = each referred patient's full bill × the agent's rate (company rate unless the agent has their own)."
      mainEyebrow={`${agentsTab ? "PR agents" : "Hospitals"} · ${period}`}
      mainTitle={agentsTab ? "Agents who referred patients" : "Hospitals that sent patients"}
      description={agentsTab ? "Ranked by referral revenue. Select an agent to open their profile in PR Management." : "Ranked by referral revenue. Select a hospital to see its PR agents in PR Management."}
      onClose={onClose}
    >
      <>
        <div className="spm-tools">
          <SearchInput
            placeholder={agentsTab ? "Search agent name, hospital or phone" : "Search hospital"}
            value={q}
            onChange={(v) => {
              setQ(v);
              setPage(1);
            }}
          />
        </div>
        <div className="spm-table-card">
          <div className="spm-table-head">
            <span>
              <b>{formatCount(total)}</b> {agentsTab ? (total === 1 ? "agent" : "agents") : total === 1 ? "hospital" : "hospitals"} · <b>{money(agentsTab ? agentRows.reduce((s, a) => s + a.billed, 0) : hospitalRows.reduce((s, h) => s + h.billed, 0))}</b> billed
            </span>
            <small>Highest revenue first</small>
          </div>
          <div className="table-wrap thin-scroll">
            <table className="bp-table rf-table bd-table spm-table" aria-label={agentsTab ? "PR agent performance" : "Hospital performance"}>
              {agentsTab ? (
                <>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>PR agent</th>
                      <th>Hospital</th>
                      <th className="num">Patients</th>
                      <th>Billed</th>
                      <th className="num">Rate</th>
                      <th className="num">Commission</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agentRows.length === 0 ? (
                      <tr>
                        <td colSpan={7}>
                          <EmptyState title={d.agentRows.length ? "No agents match this search" : `No referrals ${periodText === "today" ? "today" : "in this period"}`} />
                        </td>
                      </tr>
                    ) : (
                      agentRows.slice(from, from + size).map((a, i) => (
                        <tr key={a.id} className="pr-row" tabIndex={0} onClick={() => openRow(`pr?agent=${a.id}`)} onKeyDown={(k) => (k.key === "Enter" || k.key === " ") && (k.preventDefault(), openRow(`pr?agent=${a.id}`))} aria-label={`${a.name} — open profile`}>
                          <td>
                            <span className="bd-rank">{from + i + 1}</span>
                          </td>
                          <td className="spm-ref">
                            <strong>{a.name}</strong>
                            <small className="ep-sub">{a.phone || "No phone on record"}</small>
                          </td>
                          <td className={a.hospital === "No hospital" ? "lg-muted" : ""}>{a.hospital}</td>
                          <td className="num">
                            {formatCount(a.patients.size)}
                            {a.visits > a.patients.size && <small className="ep-sub">{a.visits} visits</small>}
                          </td>
                          <td>
                            <span className="bd-rev">
                              <span className="bd-rev-bar" aria-hidden="true">
                                <i style={{ width: `${(a.billed / topBilled) * 100}%` }} />
                              </span>
                              <b className="num">{money(a.billed)}</b>
                            </span>
                          </td>
                          <td className="num">{pct(a.rate)}</td>
                          <td className="num">
                            <strong>{money(a.commission)}</strong>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </>
              ) : (
                <>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Hospital</th>
                      <th className="num">Active agents</th>
                      <th className="num">Patients</th>
                      <th>Billed</th>
                      <th className="num">Commission</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hospitalRows.length === 0 ? (
                      <tr>
                        <td colSpan={6}>
                          <EmptyState title={d.hospitalRows.length ? "No hospitals match this search" : `No referrals ${periodText === "today" ? "today" : "in this period"}`} />
                        </td>
                      </tr>
                    ) : (
                      hospitalRows.slice(from, from + size).map((h, i) => {
                        const known = h.key !== "No hospital";
                        const path = known ? `pr?hospital=${encodeURIComponent(h.key)}` : "pr?tab=agents";
                        return (
                          <tr key={h.key} className="pr-row" tabIndex={0} onClick={() => openRow(path)} onKeyDown={(k) => (k.key === "Enter" || k.key === " ") && (k.preventDefault(), openRow(path))} aria-label={`${h.key} — open in PR Management`}>
                            <td>
                              <span className="bd-rank">{from + i + 1}</span>
                            </td>
                            <td>
                              <span className="bd-cat-cell">
                                <span className="bd-cat-icon" aria-hidden="true">
                                  <Hospital size={16} />
                                </span>
                                <span>
                                  <strong>{h.key}</strong>
                                  <small>{known ? "Partner hospital" : "Agents with no hospital on record"}</small>
                                </span>
                              </span>
                            </td>
                            <td className="num">{formatCount(h.agents.size)}</td>
                            <td className="num">{formatCount(h.patients.size)}</td>
                            <td>
                              <span className="bd-rev">
                                <span className="bd-rev-bar" aria-hidden="true">
                                  <i style={{ width: `${(h.billed / topBilled) * 100}%` }} />
                                </span>
                                <b className="num">{money(h.billed)}</b>
                              </span>
                            </td>
                            <td className="num">
                              <strong>{money(h.commission)}</strong>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </>
              )}
            </table>
          </div>
          <Pagination
            page={safe}
            pageSize={size}
            sizes={[10, 25, 50]}
            total={total}
            noun={agentsTab ? "agents" : "hospitals"}
            onPage={(p) => setPage(Math.min(Math.max(1, p), pages))}
            onPageSize={(s) => {
              setSize(s);
              setPage(1);
            }}
          />
        </div>
      </>
    </SideModal>
  );
}

/* ─────────────── 7. Work queue + recent records ─────────────── */

function WorkQueue({ branch, range, go }: { branch: Branch; range: ReturnType<typeof resolveRange>; go: (page: string) => void }) {
  const { inventory } = useApp();
  const money = (n: number) => formatMoney(n, branch.currency, true);
  const q = useMemo(() => {
    const open = openBalances(branch.id, range.to);
    const visits = patientVisits([branch.id], range);
    return {
      open: open.length,
      owed: open.reduce((s, x) => s + x.remaining, 0),
      overdue: open.filter((x) => x.ageDays > 14).length,
      unpaid: visits.filter((v) => v.payment === "Unpaid").length,
      drafts: DRAFTS.filter((x) => x.branchId === branch.id).length,
    };
  }, [branch.id, range]);
  const noPrice = CATALOGUE_INVENTORY.filter((i) => {
    const e = inventory.edits[i.id];
    return (e && "price" in e && e.price !== undefined ? e.price : i.price) === null;
  }).length;
  const items: { title: string; text: string; count: number; page: string; icon: LucideIcon }[] = [
    { title: "Bills with a balance", text: `${money(q.owed)} still owed by patients`, count: q.open, page: "records", icon: Wallet },
    { title: "Overdue balances", text: "Unpaid for more than 14 days — follow up", count: q.overdue, page: "records", icon: ClipboardList },
    { title: "Unpaid visits", text: "Nothing paid at the visit in this period", count: q.unpaid, page: "billing", icon: ReceiptText },
    { title: "Saved billing drafts", text: "Continue unfinished billing work", count: q.drafts, page: "drafts", icon: FileStack },
    { title: "Services without a price", text: "Cannot be billed until a price is set", count: noPrice, page: "inventory?filter=noprice", icon: Tag },
  ];
  return (
    <Section eyebrow="Work queue" title="What needs attention" className="is-half" action={<span className="bd-head-meta">Current branch workload</span>}>
      <ul className="bd-queue">
        {items.map((it) => (
          <li key={it.title}>
            <button type="button" onClick={() => go(it.page)} className={it.count ? "" : "is-clear"}>
              <span className="bd-queue-icon" aria-hidden="true">
                <it.icon size={17} />
              </span>
              <span className="bd-queue-text">
                <b>{it.title}</b>
                <small>{it.text}</small>
              </span>
              <span className="bd-queue-count num">{formatCount(it.count)}</span>
              <ArrowRight size={16} className="bd-queue-go" />
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function RecentRecords({ branch, range, go, onOpen }: { branch: Branch; range: ReturnType<typeof resolveRange>; go: (page: string) => void; onOpen: (v: PatientVisit) => void }) {
  const money = (n: number) => formatMoney(n, branch.currency, true);
  const billing = useBilling();
  const latest = useMemo(() => {
    // Demo activity + bills saved in STANLEY. If nothing happened in the period yet, show the most recent visits.
    const inRange = recordVisits([branch.id], range);
    return (inRange.length ? inRange : recordVisits([branch.id], resolveRange({ key: "week" }))).slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch.id, range, billing.orders]);
  return (
    <Section eyebrow="Recent records" title="Latest visits" className="is-half" action={<HeadLink onClick={() => go("records")}>View records</HeadLink>}>
      {latest.length === 0 ? (
        <EmptyState title="No visits recorded yet" />
      ) : (
        <ul className="bd-recent">
          {latest.map((v) => (
            <li key={v.id}>
              <button type="button" onClick={() => onOpen(v)} aria-label={`${v.patientName} — open visit record`}>
                <span className="bd-recent-avatar" aria-hidden="true">
                  {initials(v.patientName)}
                </span>
                <span className="bd-recent-text">
                  <b>{v.patientName}</b>
                  <small>
                    {v.patientRef} · {v.services[0]?.name}
                    {v.services.length > 1 ? ` + ${v.services.length - 1} more` : ""} · {v.id}
                  </small>
                </span>
                <span className="bd-recent-end">
                  <Badge tone={v.payment === "Paid" ? "ok" : v.payment === "Part-paid" ? "warn" : "danger"}>{v.payment}</Badge>
                  <small>
                    {money(v.billed)} · {formatShortDate(v.at)}, {formatTime(v.at)}
                  </small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="bd-note">
        <Hospital size={13} /> Select a visit to open the patient's visit record.
      </p>
    </Section>
  );
}
