import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Building2, Check, ChevronRight, Download, FileText, Hospital, MapPin, Palette, Plus, Stethoscope, Upload, FlaskConical, ChartLine, Wallet, Users, UserRound } from "lucide-react";
import { useApp } from "@/app/AppState";
import { THEMES } from "@/app/themes";
import { ACTIVE_BRANCHES, BRANCHES, COMPANY, getBranch } from "@/data/demo/catalog";
import { HEADCOUNT } from "@/data/demo/records";
import type { Currency } from "@/data/types";
import { AnimatedPage, CountUp, Reveal, useMotionPreset } from "@/shared/motion";
import { formatCount, formatMoney, moneyEntries } from "@/shared/format";
import { Badge, Button, DemoChip, PageHeader, Row, Table, Tabs } from "@/shared/ui/controls";
import { AreaLineChart } from "@/shared/ui/charts";
import { Modal } from "@/shared/ui/Modal";
import { LogoMark } from "@/shell/Logo";
import { CurrencyTabs, useCurrencyTab } from "@/features/dashboard/FinancialAnalytics";
import { rangeText } from "@/features/dashboard/WelcomeBanner";
import { byBranch, currenciesOf, doctorRanking, hospitalRanking, periodLabel, resolveBranchIds, resolveRange, serviceRanking, summarize, trend } from "@/services/analytics";
import { AuditView, ExpensesTable, InventoryView, MoneyStack, PatientsView, Panel, PRView, StaffBranchPicker, StatTiles, TransactionsTable, TrashView, type Scope } from "@/features/shared/views";

function useScope(): { scope: Scope; scopeLabel: string } {
  const { context } = useApp();
  const b = context === "all" ? null : getBranch(context);
  return { scope: b ? [b.id] : null, scopeLabel: b ? `${b.name} branch` : "All branches" };
}

/* ─────────────── Branches ─────────────── */
export function BranchesPage() {
  const { navigate, period } = useApp();
  const m = useMotionPreset();
  const [adding, setAdding] = useState(false);
  const range = resolveRange(period);
  const totalStaff = Object.values(HEADCOUNT).reduce((s, h) => s + h.total, 0);
  const all = summarize(resolveBranchIds("all"), range);
  return (
    <AnimatedPage>
      <PageHeader
        eyebrow="Company structure"
        title="Branches"
        description="Register branches, review their status and enter each branch's operations workspace."
        actions={
          <>
            <Button variant="secondary">
              <Download size={16} /> Export
            </Button>
            <Button onClick={() => setAdding(true)}>
              <Plus size={16} /> Add branch
            </Button>
          </>
        }
      />
      <StatTiles
        items={[
          { label: "Active branches", value: <CountUp value={ACTIVE_BRANCHES.length} format={formatCount} />, hint: `${BRANCHES.length - ACTIVE_BRANCHES.length} in setup` },
          { label: "Total staff", value: <CountUp value={totalStaff} format={formatCount} /> },
          { label: `Patients · ${periodLabel(period)}`, value: <CountUp value={all.patients} format={formatCount} /> },
          { label: `Payments received · ${periodLabel(period)}`, value: <MoneyStack money={all.payments} />, hint: "Kept per currency" },
        ]}
      />
      <Reveal mode="stagger" className="branch-grid">
        {BRANCHES.map((b) => {
          const s = b.status === "Active" ? summarize([b.id], range) : null;
          return (
            <motion.article key={b.id} className={`card branch-card ${s ? "" : "is-inactive"}`} variants={m.revealItem} whileHover={m.cardHover}>
              <div className="branch-card-head">
                <span className="branch-glyph">
                  <Building2 size={21} />
                </span>
                <div>
                  <h3>{b.name}</h3>
                  <p>
                    <MapPin size={13} /> {b.city}, {b.country}
                  </p>
                </div>
                <div className="badges">
                  <Badge tone={s ? "ok" : "neutral"} dot>
                    {b.status}
                  </Badge>
                  <span className="currency-chip">{b.currency}</span>
                </div>
              </div>
              <div className="branch-stats">
                <div>
                  <span>Manager</span>
                  <strong title={b.manager}>{b.manager}</strong>
                </div>
                <div>
                  <span>Staff</span>
                  <strong>{HEADCOUNT[b.id]?.total ?? 0}</strong>
                </div>
                <div>
                  <span>Opened</span>
                  <strong>{b.openedOn === "—" ? "—" : new Date(b.openedOn).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}</strong>
                </div>
                <div>
                  <span>Patients</span>
                  <strong>{s ? formatCount(s.patients) : "—"}</strong>
                </div>
                <div>
                  <span>Revenue</span>
                  <strong>{s ? formatMoney(s.revenue[b.currency] ?? 0, b.currency, true) : "—"}</strong>
                </div>
                <div>
                  <span>Outstanding</span>
                  <strong>{s ? formatMoney(s.outstanding[b.currency] ?? 0, b.currency, true) : "—"}</strong>
                </div>
              </div>
              <p className="hint" style={{ margin: 0 }}>
                {b.address} · {b.phone}
              </p>
              <div className="branch-card-foot">
                <span className="hint">{periodLabel(period)}</span>
                <Button size="sm" variant={s ? "primary" : "secondary"} disabled={!s} onClick={() => navigate(`/branch/${b.id}/dashboard`)}>
                  {s ? "Open branch workspace" : "Setup in progress"} {s && <ArrowRight size={15} />}
                </Button>
              </div>
            </motion.article>
          );
        })}
      </Reveal>

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        wide
        title="Add new branch"
        description="The new branch inherits the official company branding."
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button onClick={() => setAdding(false)}>Create branch</Button>
          </>
        }
      >
        <div className="inherited-brand">
          <span className="sb-logo" style={{ width: 40, height: 40 }}>
            <LogoMark />
          </span>
          <strong>{COMPANY.name}</strong>
          <Badge tone="ok">
            <Check size={13} /> Branding inherited
          </Badge>
        </div>
        <div className="form-grid">
          <label className="field">
            Branch name
            <input placeholder="e.g. Ikeja" />
          </label>
          <label className="field">
            Country
            <select>
              <option>Nigeria</option>
              <option>Ghana</option>
            </select>
          </label>
          <label className="field">
            Recorded currency
            <select>
              <option>NGN — Nigerian naira</option>
              <option>GHS — Ghanaian cedi</option>
            </select>
          </label>
          <label className="field">
            Branch phone number
            <input placeholder="+234" />
          </label>
          <label className="field full">
            Complete physical address
            <textarea placeholder="Street, building, area and other location details" />
          </label>
        </div>
        <div className="notice">
          <Wallet size={17} />
          <span>A branch records all amounts in one currency. Company totals keep each currency separate.</span>
        </div>
      </Modal>
    </AnimatedPage>
  );
}

/* ─────────────── Inventory ─────────────── */
export function InventoryPage() {
  const { route } = useApp();
  const { scope, scopeLabel } = useScope();
  const f = route.query.get("filter");
  return (
    <AnimatedPage>
      <PageHeader eyebrow={`Company inventory · ${scopeLabel}`} title="Inventory" description="Stock levels across branches, with reorder and expiry alerts." actions={<DemoChip />} />
      <InventoryView scope={scope} initialFilter={f === "low" ? "low" : f === "expiring" ? "expiring" : "all"} />
    </AnimatedPage>
  );
}

/* ─────────────── Staff ─────────────── */
export function StaffPage() {
  const { route } = useApp();
  const { scope, scopeLabel } = useScope();
  const [selected, setSelected] = useState<string | null>(route.query.get("branch") ?? (scope?.[0] ?? null));
  return (
    <AnimatedPage>
      <PageHeader
        eyebrow={`Company-wide access · ${scopeLabel}`}
        title="Staff Management"
        description="Branch-first staff management: select a branch to manage its manager, accounts, roles and permissions."
        actions={
          selected ? (
            <Button>
              <Plus size={16} /> Add staff
            </Button>
          ) : (
            <Button variant="secondary">
              <Download size={16} /> Export summary
            </Button>
          )
        }
      />
      <StaffBranchPicker scope={scope} selected={selected} onSelect={setSelected} />
    </AnimatedPage>
  );
}

/* ─────────────── PR ─────────────── */
export function PRPage() {
  const { scope, scopeLabel } = useScope();
  return (
    <AnimatedPage>
      <PageHeader eyebrow={`Referral partnerships · ${scopeLabel}`} title="PR Management" description="PR officers, their referral partners and commissions accrued in the reporting period." actions={<DemoChip />} />
      <PRView scope={scope} />
    </AnimatedPage>
  );
}

/* ─────────────── Patients ─────────────── */
export function PatientsPage() {
  const { route } = useApp();
  const { scope, scopeLabel } = useScope();
  return (
    <AnimatedPage>
      <PageHeader
        eyebrow={`Company-wide directory · ${scopeLabel}`}
        title="Patients"
        description="Search every branch by patient name, ID or phone number."
        actions={
          <Button>
            <Plus size={16} /> Register patient
          </Button>
        }
      />
      <PatientsView scope={scope} initialQuery={route.query.get("q") ?? ""} />
    </AnimatedPage>
  );
}

/* ─────────────── Finance & Expenses ─────────────── */
type FinanceTab = "overview" | "payments" | "expenses" | "outstanding";

export function FinancePage() {
  const { route, period, navigate } = useApp();
  const { scope, scopeLabel } = useScope();
  const ids = scope ?? resolveBranchIds("all");
  const tabParam = route.query.get("tab") as FinanceTab | null;
  const tab: FinanceTab = tabParam && ["overview", "payments", "expenses", "outstanding"].includes(tabParam) ? tabParam : "overview";
  const range = resolveRange(period);
  const currencies = currenciesOf(ids);
  const perCurrency = useMemo(() => currencies.map((c) => ({ c, s: summarize(ids.filter((id) => getBranch(id)?.currency === c), range) })), [ids.join(), range]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AnimatedPage>
      <PageHeader eyebrow={`Company finance · ${scopeLabel}`} title="Finance & Expenses" description={`${periodLabel(period)} · ${rangeText(range)}. Figures are grouped by recorded currency and never combined.`} actions={<DemoChip />} />
      <Reveal>
        <Tabs
          label="Finance sections"
          value={tab}
          onChange={(t) => navigate(`/finance?tab=${t}`)}
          tabs={[
            { value: "overview", label: "Overview" },
            { value: "payments", label: "Payments" },
            { value: "expenses", label: "Expenses & approvals" },
            { value: "outstanding", label: "Outstanding balances" },
          ]}
        />
      </Reveal>
      {tab === "overview" && (
        <>
          <Panel title="Currency summary" description="One row per recorded currency — totals are never added across currencies">
            <Table headers={["Currency", { label: "Revenue generated", align: "right" }, { label: "Payments received", align: "right" }, { label: "Approved expenses", align: "right" }, { label: "Outstanding (period end)", align: "right" }, { label: "Open bills", align: "right" }]} label="Currency summary">
              {perCurrency.map(({ c, s }) => (
                <Row key={c}>
                  <td>
                    <span className="currency-chip">{c}</span>
                  </td>
                  <td className="right num">
                    <strong>{formatMoney(s.revenue[c] ?? 0, c)}</strong>
                  </td>
                  <td className="right num">{formatMoney(s.payments[c] ?? 0, c)}</td>
                  <td className="right num">{formatMoney(s.expenses[c] ?? 0, c)}</td>
                  <td className="right num">{formatMoney(s.outstanding[c] ?? 0, c)}</td>
                  <td className="right num">{formatCount(s.openBills)}</td>
                </Row>
              ))}
            </Table>
          </Panel>
          <div style={{ height: 22 }} />
          <Panel title="Branch financial position" description="Each branch in its own recorded currency">
            <Table headers={["Branch", "Currency", { label: "Revenue generated", align: "right" }, { label: "Payments received", align: "right" }, { label: "Expenses", align: "right" }, { label: "Outstanding", align: "right" }]} label="Branch finance">
              {ids.map((id) => {
                const b = getBranch(id)!;
                const s = summarize([id], range);
                const c = b.currency;
                return (
                  <Row key={id}>
                    <td>
                      <strong>{b.name}</strong>
                    </td>
                    <td>
                      <span className="currency-chip">{c}</span>
                    </td>
                    <td className="right num">{formatMoney(s.revenue[c] ?? 0, c)}</td>
                    <td className="right num">{formatMoney(s.payments[c] ?? 0, c)}</td>
                    <td className="right num">{formatMoney(s.expenses[c] ?? 0, c)}</td>
                    <td className="right num">{formatMoney(s.outstanding[c] ?? 0, c)}</td>
                  </Row>
                );
              })}
            </Table>
          </Panel>
        </>
      )}
      {tab === "payments" && <TransactionsTable scope={scope} title="Company payment transactions" />}
      {tab === "expenses" && <ExpensesTable scope={scope} canApprove />}
      {tab === "outstanding" && (
        <Panel title="Outstanding patient balances" description="Amounts owed by patients at the end of the reporting period, with ageing">
          <Table headers={["Branch", { label: "Outstanding", align: "right" }, { label: "Unpaid", align: "right" }, { label: "Partially paid", align: "right" }, { label: "0–30 days", align: "right" }, { label: "31–60", align: "right" }, { label: "61–90", align: "right" }, { label: "90+", align: "right" }, { label: "Open bills", align: "right" }]} label="Outstanding">
            {ids.map((id) => {
              const b = getBranch(id)!;
              const s = summarize([id], range);
              const c = b.currency;
              const a = s.aging[c];
              const f = (n?: number) => formatMoney(n ?? 0, c, true);
              return (
                <Row key={id}>
                  <td>
                    <strong>{b.name}</strong> <span className="currency-chip">{c}</span>
                  </td>
                  <td className="right num">
                    <strong>{f(s.outstanding[c])}</strong>
                  </td>
                  <td className="right num">{f(s.outstandingUnpaid[c])}</td>
                  <td className="right num">{f(s.outstandingPartial[c])}</td>
                  <td className="right num">{f(a?.d0_30)}</td>
                  <td className="right num">{f(a?.d31_60)}</td>
                  <td className="right num" style={{ color: a && a.d61_90 > 0 ? "var(--warn)" : undefined }}>
                    {f(a?.d61_90)}
                  </td>
                  <td className="right num" style={{ color: a && a.d90p > 0 ? "var(--danger)" : undefined }}>
                    {f(a?.d90p)}
                  </td>
                  <td className="right num">{formatCount(s.openBills)}</td>
                </Row>
              );
            })}
          </Table>
        </Panel>
      )}
    </AnimatedPage>
  );
}

/* ─────────────── Reports ─────────────── */
type ReportTab = "overview" | "doctors" | "hospitals" | "services";

export function ReportsView({ ids, basePath }: { ids: string[]; basePath: string }) {
  const { route, period, navigate, showToast } = useApp();
  const range = resolveRange(period);
  const t = route.query.get("tab") as ReportTab | null;
  const tab: ReportTab = t && ["overview", "doctors", "hospitals", "services"].includes(t) ? t : "overview";
  const { currencies, current, setCurrency } = useCurrencyTab(ids);
  const tr = useMemo(() => trend(ids, range, current), [ids, range, current]);
  const fm = (n: number) => formatMoney(n, current, true);
  const money = (mny: Partial<Record<Currency, number>>) =>
    moneyEntries(mny)
      .map(([c, v]) => formatMoney(v, c))
      .join(" · ");

  return (
    <>
      <Reveal>
        <Tabs
          label="Report sections"
          value={tab}
          onChange={(v) => navigate(`${basePath}?tab=${v}`)}
          tabs={[
            { value: "overview", label: "Revenue report" },
            { value: "doctors", label: "Referring doctors" },
            { value: "hospitals", label: "Referring hospitals" },
            { value: "services", label: "Diagnostic services" },
          ]}
        />
      </Reveal>
      {tab === "overview" && (
        <Panel
          title="Revenue report"
          description={`${rangeText(range)} · ${tr.note}`}
          actions={
            <>
              <CurrencyTabs currencies={currencies} value={current} onChange={setCurrency} />
              <Button size="sm" variant="secondary" onClick={() => showToast("PDF export queued (demo)")}>
                <Download size={15} /> PDF
              </Button>
              <Button size="sm" variant="secondary" onClick={() => showToast("CSV export queued (demo)")}>
                <Download size={15} /> CSV
              </Button>
            </>
          }
        >
          <AreaLineChart
            labels={tr.labels}
            format={fm}
            height={280}
            series={[
              { key: "rev", label: "Revenue generated", color: "var(--kpi-blue)", values: tr.revenue, area: true },
              { key: "pay", label: "Payments received", color: "var(--kpi-green)", values: tr.payments },
            ]}
          />
          <div style={{ height: 18 }} />
          <Table headers={["Branch", { label: "Revenue generated", align: "right" }]} label="Revenue by branch">
            {byBranch(range, current, "revenue", ids).map((r) => (
              <Row key={r.branch.id}>
                <td>{r.branch.name}</td>
                <td className="right num">
                  <strong>{formatMoney(r.value, current)}</strong>
                </td>
              </Row>
            ))}
          </Table>
        </Panel>
      )}
      {tab === "doctors" && (
        <Panel title="Referring doctors" description={`Full ranking · ${rangeText(range)}`}>
          <Table headers={["#", "Doctor", "Specialty", "Branch", { label: "Referrals", align: "right" }, { label: "Referral contribution", align: "right" }]} label="Referring doctors">
            {doctorRanking(ids, range).map((d, i) => (
              <Row key={d.name}>
                <td className="num">{i + 1}</td>
                <td>
                  <strong>{d.name}</strong>
                </td>
                <td>{d.specialty}</td>
                <td>{d.branch.name}</td>
                <td className="right num">{formatCount(d.referrals)}</td>
                <td className="right num">{money(d.revenue)}</td>
              </Row>
            ))}
          </Table>
        </Panel>
      )}
      {tab === "hospitals" && (
        <Panel title="Referring hospitals & organisations" description={`Full ranking · ${rangeText(range)}`}>
          <Table headers={["#", "Organisation", "Branch", { label: "Referrals", align: "right" }, { label: "Referral contribution", align: "right" }]} label="Referring hospitals">
            {hospitalRanking(ids, range).map((d, i) => (
              <Row key={d.name}>
                <td className="num">{i + 1}</td>
                <td>
                  <strong>{d.name}</strong>
                </td>
                <td>{d.branch.name}</td>
                <td className="right num">{formatCount(d.referrals)}</td>
                <td className="right num">{money(d.revenue)}</td>
              </Row>
            ))}
          </Table>
        </Panel>
      )}
      {tab === "services" && (
        <Panel title="Diagnostic services" description={`Number performed and billed value · ${rangeText(range)}`}>
          <Table headers={["#", "Service", "Category", { label: "Performed", align: "right" }, { label: "Revenue contribution", align: "right" }]} label="Diagnostic services">
            {serviceRanking(ids, range).map((s, i) => (
              <Row key={s.name}>
                <td className="num">{i + 1}</td>
                <td>
                  <strong>{s.name}</strong>
                </td>
                <td>{s.category}</td>
                <td className="right num">{formatCount(s.count)}</td>
                <td className="right num">{money(s.revenue)}</td>
              </Row>
            ))}
          </Table>
        </Panel>
      )}
    </>
  );
}

export function ReportsPage() {
  const { period } = useApp();
  const { scope, scopeLabel } = useScope();
  const ids = useMemo(() => scope ?? resolveBranchIds("all"), [scope?.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const m = useMotionPreset();
  const { navigate } = useApp();
  const cards = [
    { title: "Revenue reports", text: "Billed value and trends", icon: ChartLine, to: "/reports?tab=overview" },
    { title: "Referring doctors", text: "Full referral ranking", icon: Stethoscope, to: "/reports?tab=doctors" },
    { title: "Referring hospitals", text: "Organisations and referral sources", icon: Hospital, to: "/reports?tab=hospitals" },
    { title: "Diagnostic services", text: "Volumes and billed value", icon: FlaskConical, to: "/reports?tab=services" },
    { title: "Payments & balances", text: "Collections and outstanding", icon: Wallet, to: "/finance?tab=outstanding" },
    { title: "Staff activity", text: "Headcount and activity", icon: Users, to: "/staff" },
  ];
  return (
    <AnimatedPage>
      <PageHeader eyebrow={`Business intelligence · ${scopeLabel}`} title="Reports" description={`Reporting period: ${periodLabel(period)}. Change it from the dashboard banner.`} actions={<DemoChip />} />
      <Reveal mode="stagger" className="report-grid">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <motion.button key={c.title} className="card report-card" variants={m.revealItem} whileHover={m.cardHover} onClick={() => navigate(c.to)}>
              <span className="activity-icon">
                <Icon size={19} />
              </span>
              <span>
                <strong>{c.title}</strong>
                <small>{c.text}</small>
              </span>
              <ChevronRight size={17} />
            </motion.button>
          );
        })}
      </Reveal>
      <div style={{ height: 24 }} />
      <ReportsView ids={ids} basePath="/reports" />
    </AnimatedPage>
  );
}

/* ─────────────── Settings ─────────────── */
const SETTINGS_SECTIONS = [
  { id: "company", label: "Company profile", icon: Building2 },
  { id: "branding", label: "Logo & branding", icon: Upload },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "profile", label: "My profile", icon: UserRound },
  { id: "permissions", label: "Users & permissions", icon: Users },
  { id: "documents", label: "Receipts & documents", icon: FileText },
];

export function AppearanceSettings() {
  const { theme, setTheme } = useApp();
  const m = useMotionPreset();
  return (
    <>
      <p className="hint" style={{ marginTop: 0 }}>
        The selected theme applies to the entire application — sidebar, header, dashboards, pages, cards, dropdowns and dialogs. STANLEY is light-mode only.
      </p>
      <motion.div className="theme-cards" variants={m.staggerGroup} initial="hidden" animate="visible">
        {THEMES.map((t) => (
          <motion.button key={t.id} className={`theme-card ${theme === t.id ? "is-active" : ""}`} variants={m.revealItem} whileHover={m.cardHover} onClick={() => setTheme(t.id)} aria-pressed={theme === t.id}>
            <span className="theme-preview" aria-hidden="true">
              <i style={{ background: t.sidebar }} />
              <span>
                <b style={{ background: t.accent }} />
                <em />
                <em />
              </span>
            </span>
            <span className="theme-name">
              {t.name}
              {theme === t.id && <Check size={16} />}
            </span>
          </motion.button>
        ))}
      </motion.div>
    </>
  );
}

export function SettingsPage() {
  const { route, navigate, user } = useApp();
  const section = route.query.get("section") ?? "company";
  const current = SETTINGS_SECTIONS.find((s) => s.id === section) ?? SETTINGS_SECTIONS[0];
  const [receipt, setReceipt] = useState(false);
  return (
    <AnimatedPage>
      <PageHeader eyebrow="Company configuration" title="Settings" description="Company identity, branding, appearance and access." />
      <Reveal className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {SETTINGS_SECTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <button key={s.id} className={s.id === current.id ? "is-active" : ""} onClick={() => navigate(`/settings?section=${s.id}`)} aria-current={s.id === current.id ? "page" : undefined}>
                <Icon size={17} />
                {s.label}
                <ChevronRight size={15} className="chev" />
              </button>
            );
          })}
        </nav>
        <div className="card card-pad settings-content">
          <div className="card-head">
            <div>
              <h3>{current.label}</h3>
              <p>Changes apply company-wide.</p>
            </div>
            {current.id !== "appearance" && <Button size="sm">Save changes</Button>}
          </div>
          {current.id === "appearance" && <AppearanceSettings />}
          {current.id === "company" && (
            <div className="form-grid">
              <label className="field">
                Company name
                <input defaultValue={COMPANY.name} />
              </label>
              <label className="field">
                Company owner
                <input defaultValue={COMPANY.owner} />
              </label>
              <label className="field">
                Primary country
                <input defaultValue="Nigeria" />
              </label>
              <label className="field">
                Operating currencies
                <input defaultValue="NGN, GHS (kept separate)" readOnly />
              </label>
              <label className="field full">
                Registered address
                <textarea defaultValue="14 Adeola Odeku Street, Victoria Island, Lagos" />
              </label>
            </div>
          )}
          {current.id === "branding" && (
            <div className="upload-card">
              <span className="sb-logo" style={{ width: 72, height: 72, borderRadius: 20 }}>
                <LogoMark />
              </span>
              <div>
                <h3 style={{ margin: 0 }}>Official company logo</h3>
                <p className="hint">PNG · used across all branches, receipts and company documents.</p>
                <div className="toolbar">
                  <Button variant="secondary" size="sm">
                    <Upload size={15} /> Replace logo
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setReceipt(true)}>
                    Preview receipt
                  </Button>
                </div>
              </div>
            </div>
          )}
          {current.id === "profile" && (
            <div className="form-grid">
              <label className="field">
                Full name
                <input defaultValue={user.name} />
              </label>
              <label className="field">
                Role
                <input defaultValue={user.role} readOnly />
              </label>
              <label className="field full">
                Email
                <input defaultValue={user.email} />
              </label>
            </div>
          )}
          {current.id === "permissions" && (
            <Table headers={["Role", "Workspace", "Access"]} label="Roles">
              {[
                ["Company Admin", "Company administration + every branch", "Full access, approvals, configuration"],
                ["Branch Manager", "Own branch operations", "Billing, staff, expenses, branch settings"],
                ["Billing Officer", "Own branch operations", "Billing, drafts, records"],
                ["Lab Scientist", "Own branch operations", "Records and results"],
              ].map((r) => (
                <Row key={r[0]}>
                  <td>
                    <strong>{r[0]}</strong>
                  </td>
                  <td>{r[1]}</td>
                  <td>{r[2]}</td>
                </Row>
              ))}
            </Table>
          )}
          {current.id === "documents" && (
            <div className="receipt-setting">
              <div>
                <strong>Automatic receipt branding</strong>
                <p className="hint" style={{ margin: "4px 0 0" }}>
                  Company and branch details are added to every generated receipt.
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setReceipt(true)}>
                Preview receipt
              </Button>
            </div>
          )}
        </div>
      </Reveal>
      <ReceiptPreview open={receipt} onClose={() => setReceipt(false)} />
    </AnimatedPage>
  );
}

export function ReceiptPreview({ open, onClose }: { open: boolean; onClose: () => void }) {
  const b = BRANCHES[0];
  return (
    <Modal open={open} onClose={onClose} wide title="Receipt branding preview" description="Demonstration receipt" footer={<Button onClick={onClose}>Done</Button>}>
      <div className="receipt">
        <div className="receipt-head">
          <span className="sb-logo" style={{ width: 52, height: 52 }}>
            <LogoMark />
          </span>
          <div>
            <strong>{COMPANY.name}</strong>
            <span>
              {b.name} Branch · {b.address}
            </span>
            <span>{b.phone}</span>
          </div>
        </div>
        <div className="receipt-title">
          <h2>Payment receipt</h2>
          <span className="mono">RC-2026-084291</span>
        </div>
        <Table headers={["Diagnostic service", "Qty", { label: "Amount", align: "right" }]}>
          <Row>
            <td>Full Blood Count</td>
            <td>1</td>
            <td className="right">{formatMoney(8500, "NGN")}</td>
          </Row>
          <Row>
            <td>Abdominal Ultrasound</td>
            <td>1</td>
            <td className="right">{formatMoney(24000, "NGN")}</td>
          </Row>
        </Table>
        <div className="receipt-total">
          <span>Total paid</span>
          <strong>{formatMoney(32500, "NGN")}</strong>
        </div>
        <p className="hint" style={{ textAlign: "center", margin: 0 }}>
          Thank you for choosing {COMPANY.name}. Powered by STANLEY.
        </p>
      </div>
    </Modal>
  );
}

/* ─────────────── Audit & Trash ─────────────── */
export function AuditPage() {
  const { scope, scopeLabel } = useScope();
  return (
    <AnimatedPage>
      <PageHeader eyebrow={`Read-only record · ${scopeLabel}`} title="Audit Log" description="Every administrative and financial change, with who made it and when." actions={<DemoChip />} />
      <AuditView scope={scope} />
    </AnimatedPage>
  );
}

export function TrashPage() {
  const { scope, scopeLabel } = useScope();
  return (
    <AnimatedPage>
      <PageHeader eyebrow={`Recoverable items · ${scopeLabel}`} title="Trash" description="Deleted records stay recoverable for 30 days." />
      <TrashView scope={scope} />
    </AnimatedPage>
  );
}
