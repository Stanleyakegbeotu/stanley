import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Bell, Building2, Check, ChevronRight, Download, FileText, Hospital, Lock, MapPin, Palette, Plus, Stethoscope, Upload, FlaskConical, ChartLine, Wallet, Users, UserRound } from "lucide-react";
import { useApp } from "@/app/AppState";
import { THEMES } from "@/app/themes";
import { ACTIVE_BRANCHES, BRANCHES, COMPANY, NOT_ON_RECORD, SERVICES, getBranch, servicePrice } from "@/data/company";
import { HEADCOUNT } from "@/data/demo/records";
import type { Currency } from "@/data/types";
import { AnimatedPage, CountUp, Reveal, useMotionPreset } from "@/shared/motion";
import { formatCount, formatMoney, moneyEntries } from "@/shared/format";
import { Button, DemoChip, PageHeader, Row, Table, Tabs } from "@/shared/ui/controls";
import { AreaLineChart } from "@/shared/ui/charts";
import { Modal } from "@/shared/ui/Modal";
import { LogoMark } from "@/shell/Logo";
import { CurrencyTabs, useCurrencyTab } from "@/features/dashboard/FinancialAnalytics";
import { rangeText } from "@/features/dashboard/WelcomeBanner";
import { agentRanking, byBranch, doctorRanking, hospitalRanking, periodLabel, resolveBranchIds, resolveRange, serviceRanking, summarize, trend } from "@/services/analytics";
import { LEGACY_BRANCH_ID, buildHospitalDirectory } from "@/data/legacy";
import { AuditView, Panel, PRView, StaffBranchPicker, TrashView, type Scope } from "@/features/shared/views";
import { PageHero } from "@/features/shared/PageHero";
import { AddAgentDialog, AddBranchDialog, AddServiceDialog, AddStaffDialog } from "@/features/shared/createForms";
import { PatientDirectory } from "@/features/patients/PatientDirectory";
import { FinanceWorkspace, type LogType } from "@/features/finance/FinanceWorkspace";
import { financeTotals } from "@/services/finance";
import { patientVisits, patientsOnRecord } from "@/data/demo/dailyLines";
import { attentionItems } from "@/services/insights";
import { BranchWorkspace } from "@/features/branch/BranchWorkspace";
import { InventoryCatalog, type ServiceActivity } from "@/features/inventory/InventoryCatalog";

function useScope(): { scope: Scope; scopeLabel: string } {
  const { context } = useApp();
  const b = context === "all" ? null : getBranch(context);
  return { scope: b ? [b.id] : null, scopeLabel: b ? `${b.name} branch` : "All branches" };
}

/* ─────────────── Branches ─────────────── */
export function BranchesPage() {
  const { period } = useApp();
  const m = useMotionPreset();
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const range = resolveRange(period);
  const periodText = periodLabel(period);
  const totalStaff = Object.values(HEADCOUNT).reduce((s, h) => s + h.total, 0);
  const all = summarize(resolveBranchIds("all"), range);
  const payments = moneyEntries(all.payments);

  return (
    <AnimatedPage>
      <PageHero
        eyebrow="Company structure"
        title="Branches"
        actions={
          <>
            <button type="button" className="ph-btn ghost">
              <Download size={17} /> Export
            </button>
            <button type="button" className="ph-btn solid" onClick={() => setAdding(true)}>
              <Plus size={18} /> Add branch
            </button>
          </>
        }
      />

      <Reveal mode="stagger" className="bx-kpis">
        {[
          { label: "Active branches", value: <CountUp value={ACTIVE_BRANCHES.length} format={formatCount} />, sub: `${BRANCHES.length - ACTIVE_BRANCHES.length} in setup` },
          { label: "Assigned staff", value: <CountUp value={totalStaff} format={formatCount} />, sub: "Across all branches" },
          { label: `Patient visits · ${periodText}`, value: <CountUp value={all.patients} format={formatCount} />, sub: `${formatCount(all.newPatients)} new patients` },
          {
            label: `Payments received · ${periodText}`,
            value: payments.length ? <CountUp value={payments[0][1]} format={(n) => formatMoney(n, payments[0][0])} /> : formatMoney(0, "NGN"),
            sub: payments.length > 1 ? payments.slice(1).map(([c, v]) => `+ ${formatMoney(v, c)}`).join(" · ") : "Kept per currency",
          },
        ].map((k) => (
          <motion.div key={k.label} className="bx-kpi" variants={m.revealItem} whileHover={m.cardHover}>
            <strong className="num">{k.value}</strong>
            <span>{k.label}</span>
            <small>{k.sub}</small>
          </motion.div>
        ))}
      </Reveal>

      <Reveal mode="stagger" className="bx-grid">
        {BRANCHES.map((b) => (
          <BranchCard key={b.id} branchId={b.id} periodText={periodText} onOpen={() => setViewing(b.id)} />
        ))}
        <motion.button type="button" className="bx-add" variants={m.revealItem} onClick={() => setAdding(true)}>
          <span className="bx-add-icon">
            <Plus size={26} />
          </span>
          <strong>Add another branch</strong>
          <small>Register a new location with its own referral ID prefix and currency.</small>
        </motion.button>
      </Reveal>

      <AddBranchDialog open={adding} onClose={() => setAdding(false)} />
      <BranchWorkspace branchId={viewing} open={viewing !== null} onClose={() => setViewing(null)} />
    </AnimatedPage>
  );
}

function BranchCard({ branchId, periodText, onOpen }: { branchId: string; periodText: string; onOpen: () => void }) {
  const { period } = useApp();
  const m = useMotionPreset();
  const b = getBranch(branchId)!;
  const active = b.status === "Active";
  const range = resolveRange(period);
  const s = active ? summarize([b.id], range) : null;
  const c = b.currency;
  const billed = s?.revenue[c] ?? 0;
  const paid = s?.payments[c] ?? 0;
  const collected = billed > 0 ? Math.min(100, (paid / billed) * 100) : 0;
  const alerts = active ? attentionItems([b.id], range, false).length : 0;
  const staff = HEADCOUNT[b.id]?.total ?? 0;
  const hasAddress = b.address !== NOT_ON_RECORD;

  return (
    <motion.article className={`card bcard ${active ? "" : "is-inactive"}`} variants={m.revealItem} whileHover={m.cardHover}>
      <div className="bcard-head">
        <span className="bcard-icon" aria-hidden="true">
          <Building2 size={24} />
        </span>
        <div className="bcard-title">
          <span className="bcard-eyebrow">Branch overview · {periodText}</span>
          <h3>{b.name}</h3>
          <p>
            <MapPin size={16} />
            <span>{hasAddress ? `${b.address}, ${b.city}, ${b.country}` : `${b.city}, ${b.country} · street address not on record`}</span>
          </p>
        </div>
        <div className="bcard-flags">
          <span className={`bcard-status ${active ? "" : "is-off"}`}>
            <i /> {b.status}
          </span>
          <button
            type="button"
            className="bcard-bell"
            aria-label={`${alerts} item${alerts === 1 ? "" : "s"} need attention at ${b.name}`}
            title={`${alerts} item${alerts === 1 ? "" : "s"} need attention`}
            onClick={onOpen}
          >
            <Bell size={18} />
            {alerts > 0 && <b>{alerts}</b>}
          </button>
        </div>
      </div>

      <div className="bcard-stats">
        <div>
          <span>Branch code</span>
          <code>{b.code}</code>
        </div>
        <div>
          <span>Referral ID prefix</span>
          <strong className="is-muted" title="No referral prefix was recorded for this branch in the legacy export">
            <Lock size={15} /> Not set
          </strong>
        </div>
        <div>
          <span>Branch referrals</span>
          <strong className="num">{s ? formatCount(s.referrals) : "—"}</strong>
        </div>
      </div>

      <div className="bcard-body">
        <div className="bcard-pay">
          <span className="bcard-pay-label">
            <Wallet size={17} /> Payments received
          </span>
          <strong className="num">{s ? <CountUp value={paid} format={(n) => formatMoney(n, c)} /> : "—"}</strong>
          <div className="bcard-pay-bar" aria-hidden="true">
            <motion.i style={{ width: `${Math.max(billed > 0 ? 2 : 0, collected)}%` }} initial={m.reduced ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.8, delay: 0.2 }} />
          </div>
          <small>{billed > 0 ? `${Math.round(collected)}% of ${formatMoney(billed, c)} billed in this period` : "Nothing billed in this period"}</small>
        </div>

        <div className="bcard-grid">
          {[
            { label: "Patient visits", value: s ? formatCount(s.patients) : "—" },
            { label: "New patients", value: s ? formatCount(s.newPatients) : "—" },
            { label: "Revenue billed", value: s ? formatMoney(billed, c, true) : "—" },
            { label: "Outstanding", value: s ? formatMoney(s.outstanding[c] ?? 0, c, true) : "—", danger: (s?.outstanding[c] ?? 0) > 0 },
            { label: "Expenses", value: s ? formatMoney(s.expenses[c] ?? 0, c, true) : "—" },
            { label: "Assigned staff", value: formatCount(staff) },
          ].map((x) => (
            <div key={x.label}>
              <span>{x.label}</span>
              <strong className={`num ${x.danger ? "is-danger" : ""}`}>{x.value}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="bcard-foot">
        <span className="bcard-meta">
          <span className="currency-chip">{c}</span>
          Manager: {b.manager}
        </span>
        <Button disabled={!active} onClick={onOpen}>
          {active ? "Open branch workspace" : "Setup in progress"} {active && <ArrowRight size={16} />}
        </Button>
      </div>
    </motion.article>
  );
}

/* ─────────────── Inventory ─────────────── */
export function InventoryPage() {
  const { route } = useApp();
  const { scope, scopeLabel } = useScope();
  const { period } = useApp();
  const f = route.query.get("filter");
  const [adding, setAdding] = useState<{ category?: string; session: number } | null>(null);
  const openAdd = (category?: string) => setAdding((a) => ({ category, session: (a?.session ?? 0) + 1 }));
  // While a category is open its own banner replaces the page hero (period filter + Add service).
  const [inCategory, setInCategory] = useState(false);
  const range = resolveRange(period);
  const activity = useMemo(() => {
    const map: ServiceActivity = new Map();
    for (const s of serviceRanking(scope ?? resolveBranchIds("all"), range)) if (s.count) map.set(s.id, { count: s.count, revenue: s.revenue.NGN ?? 0 });
    return map;
  }, [scope, range]);
  return (
    <AnimatedPage>
      {!inCategory && (
        <PageHero
          eyebrow={`Service catalogue · ${scopeLabel}`}
          title="Inventory"
          actions={
            <button type="button" className="ph-btn solid" onClick={() => openAdd()}>
              <Plus size={18} /> Add service
            </button>
          }
        />
      )}
      <InventoryCatalog scope={scope} initialFilter={f ?? "all"} activity={activity} periodText={periodLabel(period)} onAddService={openAdd} onDetailChange={setInCategory} />
      {adding && <AddServiceDialog key={adding.session} open onClose={() => setAdding(null)} initialCategory={adding.category} />}
    </AnimatedPage>
  );
}

/* ─────────────── Staff ─────────────── */
export function StaffPage() {
  const { route } = useApp();
  const { scope, scopeLabel } = useScope();
  const [selected, setSelected] = useState<string | null>(route.query.get("branch") ?? (scope?.[0] ?? null));
  const [adding, setAdding] = useState(false);
  return (
    <AnimatedPage>
      <AddStaffDialog key={selected ?? "none"} open={adding} onClose={() => setAdding(false)} branchId={selected} />
      <PageHeader
        eyebrow={`Company-wide access · ${scopeLabel}`}
        title="Staff Management"
        description="Branch-first staff management: select a branch to manage its manager, accounts, roles and permissions."
        actions={
          selected ? (
            <Button onClick={() => setAdding(true)}>
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
/**
 * PR / Hospital management. On the company dashboard the admin first picks a
 * branch (a company can run several), then sees that branch's hospital cards
 * and PR agents. When the dashboard is already focused on one branch — or a
 * deep link names a hospital / agent — the branch step is skipped.
 */
export function PRPage() {
  const { scope } = useScope();
  const { route, navigate, period, agents } = useApp();
  const q = route.query;
  const deepLink = q.get("hospital") || q.get("agent") || q.get("tab");
  // The legacy PR network belongs to BR001, so deep links without a branch resolve there.
  const branchId = scope?.[0] ?? q.get("branch") ?? (deepLink ? LEGACY_BRANCH_ID : null);
  const branch = branchId ? getBranch(branchId) : undefined;
  const [adding, setAdding] = useState<number | null>(null);
  const directory = useMemo(() => buildHospitalDirectory(branchId === LEGACY_BRANCH_ID ? agents : []), [branchId, agents]);

  return (
    <AnimatedPage>
      <PageHero
        eyebrow={`Referral network · ${branch ? `${branch.name} branch` : "All branches"}`}
        title="PR / Hospital Management"
        actions={
          branch && (
            <button type="button" className="ph-btn solid" onClick={() => setAdding((n) => (n ?? 0) + 1)}>
              <Plus size={18} /> Add PR agent
            </button>
          )
        }
      />
      {!branch ? (
        <PRBranchPicker onPick={(id) => navigate(`/pr?branch=${id}`)} />
      ) : (
        <>
          {!scope && (
            <nav className="inv-back" aria-label="Breadcrumb" style={{ marginBottom: 18 }}>
              <button type="button" className="inv-back-btn" onClick={() => navigate("/pr")}>
                <span className="inv-back-icon" aria-hidden="true">
                  <ArrowLeft size={17} />
                </span>
                All branches
              </button>
              <span className="inv-crumb">
                PR / Hospital Management <ChevronRight size={14} /> <b>{branch.name} branch</b> · {branch.code} · {periodLabel(period)}
              </span>
            </nav>
          )}
          <PRView scope={[branch.id]} />
        </>
      )}
      {adding !== null && <AddAgentDialog key={adding} open onClose={() => setAdding(null)} hospitals={directory.map((h) => ({ key: h.key, count: h.agentCount, raw: h.rawVariants }))} />}
    </AnimatedPage>
  );
}

function PRBranchPicker({ onPick }: { onPick: (branchId: string) => void }) {
  const { agents, period } = useApp();
  const m = useMotionPreset();
  const range = resolveRange(period);
  const periodText = periodLabel(period);
  return (
    <section className="inv-section">
      <header className="inv-section-head">
        <h3>Choose a branch</h3>
        <span>Each branch has its own hospitals and PR agents</span>
      </header>
      <Reveal mode="stagger" className="prb-grid">
        {BRANCHES.map((b) => {
          const active = b.status === "Active";
          const network = b.id === LEGACY_BRANCH_ID ? agents : [];
          const hospitals = buildHospitalDirectory(network).length;
          const ranked = active ? agentRanking([b.id], range) : [];
          const referrals = ranked.reduce((s, a) => s + a.referrals, 0);
          const revenue = ranked.reduce((s, a) => s + (a.revenue[b.currency] ?? 0), 0);
          return (
            <motion.button key={b.id} type="button" className="prb-card" variants={m.revealItem} whileHover={m.cardHover} disabled={!active} onClick={() => onPick(b.id)} aria-label={`${b.name} branch — view hospitals and PR agents`}>
              <div className="prb-head">
                <span className="prb-icon" aria-hidden="true">
                  <Building2 size={24} />
                </span>
                <div className="prb-title">
                  <h3>{b.name}</h3>
                  <p>
                    <MapPin size={14} /> {b.code} · {b.city}, {b.country}
                  </p>
                </div>
                <span className={`bcard-status ${active ? "" : "is-off"}`}>
                  <i /> {b.status}
                </span>
              </div>
              <dl className="prb-stats">
                <div>
                  <dt>PR agents</dt>
                  <dd className="num">{formatCount(network.length)}</dd>
                </div>
                <div>
                  <dt>Hospitals</dt>
                  <dd className="num">{formatCount(hospitals)}</dd>
                </div>
                <div>
                  <dt>Referrals · {periodText}</dt>
                  <dd className="num">{formatCount(referrals)}</dd>
                </div>
                <div>
                  <dt>Referral revenue</dt>
                  <dd className="num">{formatMoney(revenue, b.currency, true)}</dd>
                </div>
              </dl>
              <div className="prb-foot">
                <span>{network.length - network.filter((a) => a.hospital.trim()).length} agents without a hospital</span>
                <span className="inv-card-go">
                  View hospitals & PR agents <ArrowRight size={15} />
                </span>
              </div>
            </motion.button>
          );
        })}
      </Reveal>
    </section>
  );
}

/* ─────────────── Patients ─────────────── */
/*
 * Company Admin can view patients but never register them or create bills —
 * that is branch manager / staff work. Pick a branch first (unless the
 * dashboard context is already one branch), then see that branch's patients.
 */
export function PatientsPage() {
  const { route, navigate } = useApp();
  const { scope } = useScope();
  const q = route.query.get("q") ?? "";
  const branchId = scope?.[0] ?? route.query.get("branch");
  const branch = branchId ? getBranch(branchId) : undefined;
  const withQuery = (path: string) => (q ? `${path}${path.includes("?") ? "&" : "?"}q=${encodeURIComponent(q)}` : path);

  return (
    <AnimatedPage>
      <PageHero eyebrow={`Patient records · ${branch ? `${branch.name} branch` : "All branches"}`} title="Patients" period={false} />
      {!branch ? (
        <PatientsBranchPicker onPick={(id) => navigate(withQuery(`/patients?branch=${id}`))} />
      ) : (
        <>
          {!scope && (
            <nav className="inv-back" aria-label="Breadcrumb" style={{ marginBottom: 18 }}>
              <button type="button" className="inv-back-btn" onClick={() => navigate("/patients")}>
                <span className="inv-back-icon" aria-hidden="true">
                  <ArrowLeft size={17} />
                </span>
                All branches
              </button>
              <span className="inv-crumb">
                Patients <ChevronRight size={14} /> <b>{branch.name} branch</b> · {branch.code}
              </span>
            </nav>
          )}
          <PatientDirectory key={branch.id} branchId={branch.id} initialQuery={q} />
        </>
      )}
    </AnimatedPage>
  );
}

function PatientsBranchPicker({ onPick }: { onPick: (branchId: string) => void }) {
  const m = useMotionPreset();
  const today = resolveRange({ key: "today" });
  return (
    <section className="inv-section">
      <header className="inv-section-head">
        <h3>Choose a branch</h3>
        <span>Each branch keeps its own patient records</span>
      </header>
      <Reveal mode="stagger" className="prb-grid">
        {BRANCHES.map((b) => {
          const active = b.status === "Active";
          const visits = active ? patientVisits([b.id], today) : [];
          const onRecord = active ? patientsOnRecord(b.id) : { total: 0, registered: 0 };
          const generated = visits.reduce((s, v) => s + v.billed, 0);
          const newToday = visits.filter((v) => v.isNew).length;
          return (
            <motion.button key={b.id} type="button" className="prb-card" variants={m.revealItem} whileHover={m.cardHover} disabled={!active} onClick={() => onPick(b.id)} aria-label={`${b.name} branch — view patients`}>
              <div className="prb-head">
                <span className="prb-icon" aria-hidden="true">
                  <Building2 size={24} />
                </span>
                <div className="prb-title">
                  <h3>{b.name}</h3>
                  <p>
                    <MapPin size={14} /> {b.code} · {b.city}, {b.country}
                  </p>
                </div>
                <span className={`bcard-status ${active ? "" : "is-off"}`}>
                  <i /> {b.status}
                </span>
              </div>
              <dl className="prb-stats">
                <div>
                  <dt>Patients today</dt>
                  <dd className="num">{formatCount(new Set(visits.map((v) => v.patientRef)).size)}</dd>
                </div>
                <div>
                  <dt>Visits today</dt>
                  <dd className="num">{formatCount(visits.length)}</dd>
                </div>
                <div>
                  <dt>Generated today</dt>
                  <dd className="num">{formatMoney(generated, b.currency, true)}</dd>
                </div>
                <div>
                  <dt>Patients on record</dt>
                  <dd className="num">{formatCount(onRecord.total)}</dd>
                </div>
              </dl>
              <div className="prb-foot">
                <span>{formatCount(newToday)} new patients today</span>
                <span className="inv-card-go">
                  View patients <ArrowRight size={15} />
                </span>
              </div>
            </motion.button>
          );
        })}
      </Reveal>
    </section>
  );
}

/* ─────────────── Finance & Expenses ─────────────── */
/*
 * Branch-first (admin rule): pick a branch, then see its financial position
 * (today / month / year), analysis charts, the finance log and outstanding
 * balances. Old deep links (?tab=payments|expenses|outstanding) still work and
 * resolve to the legacy branch when no branch is given.
 */
export function FinancePage() {
  const { route, navigate } = useApp();
  const { scope } = useScope();
  const tab = route.query.get("tab");
  const branchId = scope?.[0] ?? route.query.get("branch") ?? (tab ? LEGACY_BRANCH_ID : null);
  const branch = branchId ? getBranch(branchId) : undefined;
  const initialLog: LogType = tab === "payments" ? "income" : tab === "expenses" ? "expenses" : "all";

  return (
    <AnimatedPage>
      <PageHero eyebrow={`Company finance · ${branch ? `${branch.name} branch` : "All branches"}`} title="Finance & Expenses" period={false} />
      {!branch ? (
        <FinanceBranchPicker onPick={(id) => navigate(`/finance?branch=${id}`)} />
      ) : (
        <>
          {!scope && (
            <nav className="inv-back" aria-label="Breadcrumb" style={{ marginBottom: 18 }}>
              <button type="button" className="inv-back-btn" onClick={() => navigate("/finance")}>
                <span className="inv-back-icon" aria-hidden="true">
                  <ArrowLeft size={17} />
                </span>
                All branches
              </button>
              <span className="inv-crumb">
                Finance & Expenses <ChevronRight size={14} /> <b>{branch.name} branch</b> · {branch.code} · {branch.currency}
              </span>
            </nav>
          )}
          <FinanceWorkspace key={`${branch.id}|${tab ?? ""}`} branchId={branch.id} initialLog={initialLog} focusOutstanding={tab === "outstanding"} />
        </>
      )}
    </AnimatedPage>
  );
}

function FinanceBranchPicker({ onPick }: { onPick: (branchId: string) => void }) {
  const m = useMotionPreset();
  return (
    <section className="inv-section">
      <header className="inv-section-head">
        <h3>Choose a branch</h3>
        <span>Each branch keeps its own books, in its recorded currency</span>
      </header>
      <Reveal mode="stagger" className="prb-grid">
        {BRANCHES.map((b) => {
          const active = b.status === "Active";
          const today = active ? financeTotals(b.id, resolveRange({ key: "today" })) : null;
          const month = active ? financeTotals(b.id, resolveRange({ key: "month" })) : null;
          const year = active ? financeTotals(b.id, resolveRange({ key: "year" })) : null;
          const f = (n?: number) => formatMoney(n ?? 0, b.currency, true);
          return (
            <motion.button key={b.id} type="button" className="prb-card" variants={m.revealItem} whileHover={m.cardHover} disabled={!active} onClick={() => onPick(b.id)} aria-label={`${b.name} branch — view finance`}>
              <div className="prb-head">
                <span className="prb-icon" aria-hidden="true">
                  <Building2 size={24} />
                </span>
                <div className="prb-title">
                  <h3>{b.name}</h3>
                  <p>
                    <MapPin size={14} /> {b.code} · {b.city}, {b.country} · {b.currency}
                  </p>
                </div>
                <span className={`bcard-status ${active ? "" : "is-off"}`}>
                  <i /> {b.status}
                </span>
              </div>
              <dl className="prb-stats">
                <div>
                  <dt>Money in today</dt>
                  <dd className="num">{f(today?.income)}</dd>
                </div>
                <div>
                  <dt>Net profit · month</dt>
                  <dd className="num" style={month && month.net < 0 ? { color: "var(--danger)" } : undefined}>
                    {f(month?.net)}
                  </dd>
                </div>
                <div>
                  <dt>Net profit · year</dt>
                  <dd className="num" style={year && year.net < 0 ? { color: "var(--danger)" } : undefined}>
                    {f(year?.net)}
                  </dd>
                </div>
                <div>
                  <dt>Outstanding</dt>
                  <dd className="num">{f(today?.outstanding)}</dd>
                </div>
              </dl>
              <div className="prb-foot">
                <span>{year ? `${f(year.recovered)} recovered this year` : "Not trading yet"}</span>
                <span className="inv-card-go">
                  View finance <ArrowRight size={15} />
                </span>
              </div>
            </motion.button>
          );
        })}
      </Reveal>
    </section>
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
            { value: "doctors", label: "PR agents (referring doctors)" },
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
        <Panel title="PR agents (referring doctors)" description={`Full ranking · ${rangeText(range)}`}>
          <Table headers={["#", "PR agent", "Hospital", "Branch", { label: "Referrals", align: "right" }, { label: "Referral contribution", align: "right" }]} label="PR agents">
            {doctorRanking(ids, range).map((d, i) => (
              <Row key={`${d.name}-${i}`}>
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
              <Row key={`${s.name}-${i}`}>
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
    { title: "PR agents", text: "Referring doctors ranked by referrals", icon: Stethoscope, to: "/reports?tab=doctors" },
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
                <input defaultValue="NGN (each currency is always kept separate)" readOnly />
              </label>
              <label className="field full">
                Registered address
                <textarea defaultValue="" placeholder={`${NOT_ON_RECORD} — not included in the legacy export`} />
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

/** Sample lines use real catalogue items and their actual prices (FULL BLOOD COUNT, PELVIC ULTRASOUND). */
const RECEIPT_SAMPLE = [1, 125].map((id) => SERVICES.find((s) => s.id === id)).filter((s): s is (typeof SERVICES)[number] => !!s);

export function ReceiptPreview({ open, onClose }: { open: boolean; onClose: () => void }) {
  const b = BRANCHES[0];
  const total = RECEIPT_SAMPLE.reduce((sum, s) => sum + servicePrice(s, b.currency), 0);
  return (
    <Modal open={open} onClose={onClose} wide title="Receipt branding preview" description="Sample receipt — real catalogue items and prices, no patient data" footer={<Button onClick={onClose}>Done</Button>}>
      <div className="receipt">
        <div className="receipt-head">
          <span className="sb-logo" style={{ width: 52, height: 52 }}>
            <LogoMark />
          </span>
          <div>
            <strong>{COMPANY.name}</strong>
            <span>
              {b.name} Branch ({b.code})
            </span>
          </div>
        </div>
        <div className="receipt-title">
          <h2>Payment receipt</h2>
          <span className="mono">SAMPLE</span>
        </div>
        <Table headers={["Diagnostic service", "Qty", { label: "Amount", align: "right" }]}>
          {RECEIPT_SAMPLE.map((s) => (
            <Row key={s.id}>
              <td>{s.name}</td>
              <td>1</td>
              <td className="right">{formatMoney(servicePrice(s, b.currency), b.currency)}</td>
            </Row>
          ))}
        </Table>
        <div className="receipt-total">
          <span>Total paid</span>
          <strong>{formatMoney(total, b.currency)}</strong>
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
