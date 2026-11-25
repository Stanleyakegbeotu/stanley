import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Bell, Building2, ChevronRight, Download, Hospital, Lock, MapPin, Plus, Stethoscope, FlaskConical, ChartLine, Wallet } from "lucide-react";
import { TRASH_RETENTION_DAYS, useApp } from "@/app/AppState";
import { ACTIVE_BRANCHES, BRANCHES, NOT_ON_RECORD, getBranch } from "@/data/company";
import { HEADCOUNT } from "@/data/demo/records";
import type { Currency } from "@/data/types";
import { AnimatedPage, CountUp, Reveal, useMotionPreset } from "@/shared/motion";
import { formatCount, formatMoney, moneyEntries } from "@/shared/format";
import { Button, DemoChip, PageHeader, Row, Table, Tabs } from "@/shared/ui/controls";
import { AreaLineChart } from "@/shared/ui/charts";
import { CurrencyTabs, useCurrencyTab } from "@/features/dashboard/FinancialAnalytics";
import { rangeText } from "@/features/dashboard/WelcomeBanner";
import { agentRanking, byBranch, doctorRanking, hospitalRanking, periodLabel, resolveBranchIds, resolveRange, serviceRanking, summarize, trend } from "@/services/analytics";
import { LEGACY_BRANCH_ID, buildHospitalDirectory } from "@/data/legacy";
import { AuditView, Panel, PRView, StaffBranchPicker, TrashView, type Scope } from "@/features/shared/views";
import { PageHero } from "@/features/shared/PageHero";
import { AddAgentDialog, AddServiceDialog, AddStaffDialog } from "@/features/shared/createForms";
import { NewBranchDialog } from "@/features/settings/admin/Branches";
import { useBranches } from "@/services/org";
import { PatientDirectory } from "@/features/patients/PatientDirectory";
import { FinanceWorkspace, type LogType } from "@/features/finance/FinanceWorkspace";
import { ReportsHome } from "@/features/reports/ReportsHome";
import { AnalysisPanel } from "@/features/reports/AnalysisPanel";
import { StaffBranchView } from "@/features/staff/StaffWorkspace";
import { AuditLogView, TrashLogView } from "@/features/admin/AdminLogs";
import { managerOf } from "@/data/userRecords";
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
  // Re-render when a branch is added or its status changes (Settings → Branch Management).
  useBranches();
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
        stats="branches"
        actions={
          <button type="button" className="ph-btn solid" onClick={() => setAdding(true)}>
            <Plus size={18} /> Add branch
          </button>
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

      {adding && <NewBranchDialog open onClose={() => setAdding(false)} />}
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
            <motion.i style={{ width: `${Math.max(billed > 0 ? 2 : 0, collected)}%` }} initial={m.reduced ? false : { scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true, amount: 0.3 }} transition={{ duration: 0.8, delay: 0.2 }} />
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
          stats="inventory"
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
/*
 * Staff Management: pick a branch (unless the dashboard is already one
 * branch), then see its manager — head of every staff member — and its staff.
 * Cards open the staff profile pop-up.
 */
export function StaffPage() {
  const { route, navigate } = useApp();
  const { scope } = useScope();
  const branchId = scope?.[0] ?? route.query.get("branch");
  const branch = branchId ? getBranch(branchId) : undefined;
  const [adding, setAdding] = useState<{ role?: string; session: number } | null>(null);
  return (
    <AnimatedPage>
      <PageHero
        eyebrow={`Staff management · ${branch ? `${branch.name} branch` : "All branches"}`}
        title="Staff Management"
        period={false}
        stats="staff"
        actions={
          branch && (
            <button type="button" className="ph-btn solid" onClick={() => setAdding((a) => ({ session: (a?.session ?? 0) + 1 }))}>
              <Plus size={18} /> Add staff
            </button>
          )
        }
      />
      {!branch ? (
        <StaffBranchCards onPick={(id) => navigate(`/staff?branch=${id}`)} />
      ) : (
        <>
          {!scope && (
            <nav className="inv-back" aria-label="Breadcrumb" style={{ marginBottom: 18 }}>
              <button type="button" className="inv-back-btn" onClick={() => navigate("/staff")}>
                <span className="inv-back-icon" aria-hidden="true">
                  <ArrowLeft size={17} />
                </span>
                All branches
              </button>
              <span className="inv-crumb">
                Staff Management <ChevronRight size={14} /> <b>{branch.name} branch</b> · {branch.code}
              </span>
            </nav>
          )}
          <StaffBranchView branchId={branch.id} onAdd={(role) => setAdding((a) => ({ role, session: (a?.session ?? 0) + 1 }))} />
        </>
      )}
      {adding && branch && <AddStaffDialog key={adding.session} open onClose={() => setAdding(null)} branchId={branch.id} presetRole={adding.role} />}
    </AnimatedPage>
  );
}

function StaffBranchCards({ onPick }: { onPick: (branchId: string) => void }) {
  const { staff } = useApp();
  const m = useMotionPreset();
  return (
    <section className="inv-section">
      <header className="inv-section-head">
        <h3>Choose a branch</h3>
        <span>Each branch has one manager who heads its staff</span>
      </header>
      <Reveal mode="stagger" className="prb-grid">
        {BRANCHES.map((b) => {
          const active = b.status === "Active";
          const people = staff.filter((s) => s.branchId === b.id && s.status !== "Left");
          const manager = managerOf(staff, b.id);
          return (
            <motion.button key={b.id} type="button" className="prb-card" variants={m.revealItem} whileHover={m.cardHover} disabled={!active} onClick={() => onPick(b.id)} aria-label={`${b.name} branch — view manager and staff`}>
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
                <div style={{ gridColumn: "1 / -1" }}>
                  <dt>Branch manager</dt>
                  <dd>{manager ? manager.name : "Not assigned yet"}</dd>
                </div>
                <div>
                  <dt>Staff</dt>
                  <dd className="num">{formatCount(people.length)}</dd>
                </div>
                <div>
                  <dt>Active</dt>
                  <dd className="num">{formatCount(people.filter((s) => s.status === "Active").length)}</dd>
                </div>
              </dl>
              <div className="prb-foot">
                <span>{people.length ? `${formatCount(people.filter((s) => s.status === "On leave").length)} on leave` : "No staff added yet"}</span>
                <span className="inv-card-go">
                  View manager & staff <ArrowRight size={15} />
                </span>
              </div>
            </motion.button>
          );
        })}
      </Reveal>
    </section>
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
        stats="pr"
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
      <PageHero eyebrow={`Patient records · ${branch ? `${branch.name} branch` : "All branches"}`} title="Patients" period={false} stats="patients" />
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
          <PatientDirectory key={`${branch.id}|${route.query.get("visit") ?? ""}`} branchId={branch.id} initialQuery={q} initialVisitId={route.query.get("visit")} />
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
      <PageHero eyebrow={`Company finance · ${branch ? `${branch.name} branch` : "All branches"}`} title="Finance & Expenses" period={false} stats="finance" />
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
          <FinanceWorkspace key={`${branch.id}|${tab ?? ""}|${route.query.get("day") ?? ""}`} branchId={branch.id} initialLog={initialLog} focusOutstanding={tab === "outstanding"} initialDay={route.query.get("day")} />
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

/*
 * Reports: one card per report; each opens the report builder pop-up
 * (choose → preview → print / download PDF / export spreadsheet).
 */
export function ReportsPage() {
  const { scope, scopeLabel } = useScope();
  return (
    <AnimatedPage>
      <PageHero eyebrow={`Reports & exports · ${scopeLabel}`} title="Reports" period={false} stats="reports" />
      <AnalysisPanel ids={scope ?? ACTIVE_BRANCHES.map((b) => b.id)} level="admin" scopeLabel={scopeLabel} />
      <ReportsHome initialBranch={scope?.[0]} />
    </AnimatedPage>
  );
}

/* ─────────────── Audit & Trash ─────────────── */
export function AuditPage() {
  const { scope, scopeLabel } = useScope();
  return (
    <AnimatedPage>
      <PageHero eyebrow={`Read-only record · ${scopeLabel}`} title="Audit Log" period={false} stats="audit" />
      <AuditLogView scope={scope} />
    </AnimatedPage>
  );
}

export function TrashPage() {
  const { scope, scopeLabel } = useScope();
  return (
    <AnimatedPage>
      <PageHero eyebrow={`Recoverable for ${TRASH_RETENTION_DAYS} days · ${scopeLabel}`} title="Trash" period={false} stats="trash" />
      <TrashLogView scope={scope} />
    </AnimatedPage>
  );
}
