/**
 * Branch workspace pages that use the shared page banner (PageHero) with its
 * live key-figures strip, like every other page (owner, 2026-11-22):
 * Records, Drafts, Inventory and PR Management.
 *
 * Inventory is the same catalogue as the Company Admin's page (category cards
 * → services, search, smart lists, activity for the period). The Branch
 * Manager can add services, change prices and rename categories; other branch
 * staff get a view-only price list.
 */
import { useMemo, useState } from "react";
import { ChartColumn, FilePenLine, FolderOpen, Handshake, Lock, Package, Plus, ShieldCheck } from "lucide-react";
import { useAuditLog } from "@/services/audit";
import { ReportsHome } from "@/features/reports/ReportsHome";
import { LOCKED_REASON, maxDaysFor, reportsFor, reportsLocked } from "@/features/reports/access";
import { AnalysisPanel } from "@/features/reports/AnalysisPanel";
import { can, usePermissions } from "@/services/permissions";
import { useApp } from "@/app/AppState";
import type { Branch } from "@/data/types";
import { buildHospitalDirectory, LEGACY_BRANCH_ID } from "@/data/legacy";
import { periodLabel, resolveRange, serviceRanking } from "@/services/analytics";
import { useBilling } from "@/services/billing";
import { formatCount, formatMoney } from "@/shared/format";
import { AnimatedPage } from "@/shared/motion";
import { PageHero } from "@/features/shared/PageHero";
import { AddAgentDialog, AddServiceDialog } from "@/features/shared/createForms";
import { PRView } from "@/features/shared/views";
import { InventoryCatalog, type ServiceActivity } from "@/features/inventory/InventoryCatalog";
import { PatientDirectory } from "@/features/patients/PatientDirectory";
import { BillingDrafts } from "@/features/billing/BillingWorkspace";

export function BranchRecordsPage({ branch }: { branch: Branch }) {
  const { route } = useApp();
  return (
    <AnimatedPage>
      <PageHero eyebrow={`Patient records · ${branch.name} branch`} title="Records" period={false} icon={FolderOpen} stats="patients" scope={[branch.id]} />
      <PatientDirectory key={`${branch.id}|${route.query.get("visit") ?? ""}`} branchId={branch.id} initialVisitId={route.query.get("visit")} />
    </AnimatedPage>
  );
}

export function BranchDraftsPage({ branch }: { branch: Branch }) {
  const { navigate } = useApp();
  const store = useBilling();
  const drafts = store.drafts.filter((d) => d.branchId === branch.id);
  const value = drafts.reduce((s, d) => s + d.services.reduce((t, sv) => t + (sv.overridePrice ?? sv.price), 0), 0);
  const oldest = drafts.map((d) => d.lastSaved ?? d.startedAt).sort()[0];
  const today = new Date().toDateString();
  const billedToday = store.orders.filter((o) => o.branchId === branch.id && new Date(o.createdAt).toDateString() === today).length;
  return (
    <AnimatedPage>
      <PageHero
        eyebrow={`Branch operations · ${branch.name} branch`}
        title="Drafts"
        period={false}
        icon={FilePenLine}
        actions={
          <button type="button" className="ph-btn solid" onClick={() => navigate(`/branch/${branch.id}/billing`)}>
            <Plus size={18} /> New bill
          </button>
        }
        strip={[
          { label: "Saved drafts", value: formatCount(drafts.length) },
          { label: "Services in drafts", value: formatMoney(value, branch.currency) },
          { label: "Oldest draft", value: oldest ? new Date(oldest).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—" },
          { label: "Bills saved today", value: formatCount(billedToday) },
          { label: "Drafts", value: "Not bills — nothing is charged until saved" },
        ]}
      />
      <BillingDrafts branch={branch} />
    </AnimatedPage>
  );
}

export function BranchInventoryPage({ branch, initialFilter }: { branch: Branch; initialFilter: string }) {
  const { period, user } = useApp();
  // Prices and the catalogue are controlled by the Branch Manager (and the Company Admin); staff see a price list.
  // Settings → Roles & Permissions: "Edit the catalogue" (applies company-wide).
  usePermissions();
  const canEdit = can(user.role, "services.edit");
  const [adding, setAdding] = useState<{ category?: string; session: number } | null>(null);
  const openAdd = (category?: string) => setAdding((a) => ({ category, session: (a?.session ?? 0) + 1 }));
  const [inCategory, setInCategory] = useState(false);
  const range = resolveRange(period);
  const activity = useMemo(() => {
    const map: ServiceActivity = new Map();
    for (const s of serviceRanking([branch.id], range)) if (s.count) map.set(s.id, { count: s.count, revenue: s.revenue.NGN ?? 0 });
    return map;
  }, [branch.id, range]);
  return (
    <AnimatedPage>
      {!inCategory && (
        <PageHero
          eyebrow={canEdit ? `Service catalogue · ${branch.name} branch` : `Price list · ${branch.name} branch · view only`}
          title="Inventory"
          icon={Package}
          stats="inventory"
          scope={[branch.id]}
          actions={
            canEdit && (
              <button type="button" className="ph-btn solid" onClick={() => openAdd()}>
                <Plus size={18} /> Add service
              </button>
            )
          }
        />
      )}
      <InventoryCatalog scope={[branch.id]} initialFilter={initialFilter} activity={activity} periodText={periodLabel(period)} onAddService={openAdd} onDetailChange={setInCategory} readOnly={!canEdit} />
      {adding && canEdit && <AddServiceDialog key={adding.session} open onClose={() => setAdding(null)} initialCategory={adding.category} />}
    </AnimatedPage>
  );
}

export function BranchPrPage({ branch }: { branch: Branch }) {
  const { agents, user } = useApp();
  const [adding, setAdding] = useState<number | null>(null);
  const directory = useMemo(() => buildHospitalDirectory(branch.id === LEGACY_BRANCH_ID ? agents : []), [branch.id, agents]);
  return (
    <AnimatedPage>
      <PageHero
        eyebrow={`Referral network · ${branch.name} branch`}
        title="PR / Hospital Management"
        icon={Handshake}
        stats="pr"
        scope={[branch.id]}
        actions={
          can(user.role, "referral.manage") && (
            <button type="button" className="ph-btn solid" onClick={() => setAdding((n) => (n ?? 0) + 1)}>
              <Plus size={18} /> Add PR agent
            </button>
          )
        }
      />
      <PRView scope={[branch.id]} />
      {adding !== null && <AddAgentDialog key={adding} open onClose={() => setAdding(null)} hospitals={directory.map((h) => ({ key: h.key, count: h.agentCount, raw: h.rawVariants }))} />}
    </AnimatedPage>
  );
}

/**
 * Analysis — the branch's reports page (same builder as the Company Admin's
 * Reports: choose → preview → print, PDF or CSV), always for this branch only,
 * with the reports the signed-in role is allowed to create (see reports/access.ts).
 */
export function BranchAnalysisPage({ branch }: { branch: Branch }) {
  const { user } = useApp();
  const audit = useAuditLog();
  const reports = reportsFor(user.role);
  const locked = user.kind === "staff" ? reportsLocked(user.role) : [];
  const types = reports.reduce((n, r) => n + r.variants.length, 0);
  const mine = audit.filter((e) => e.category === "Reports" && e.branchId === branch.id);
  const today = new Date().toDateString();
  return (
    <AnimatedPage>
      <PageHero
        eyebrow={`Reports & analysis · ${branch.name} branch`}
        title="Analysis"
        period={false}
        icon={ChartColumn}
        strip={[
          { label: "Your access", value: user.kind === "staff" ? user.role : `${user.role} · every report` },
          { label: "Reports available", value: `${reports.length} · ${types} report types` },
          { label: "Made today", value: formatCount(mine.filter((e) => e.at.toDateString() === today).length) },
          { label: "Last report", value: mine[0] ? `${mine[0].record} · ${mine[0].at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : "None yet" },
          { label: "Covers", value: `${branch.name} branch only` },
        ]}
      />

      <AnalysisPanel ids={[branch.id]} level={can(user.role, "analytics.year") ? "manager" : "staff"} scopeLabel={`${branch.name} branch`} />

      <section className="an-access" aria-label="Your report access">
        <span className="an-access-icon" aria-hidden="true">
          <ShieldCheck size={20} />
        </span>
        <div className="an-access-text">
          <b>{user.kind === "staff" ? `Reports for your role · ${user.role}` : `Every report for the ${branch.name} branch`}</b>
          <small>
            {user.kind === "staff"
              ? "Payments for cashing up, balances to follow up, tests and prices, and PR agent / hospital performance for the marketers' monthly targets — up to one month at a time. The profit statement, commission payout and staff activity are kept for the Branch Manager."
              : `As ${user.role} you can create every report for this branch. Company-wide reports (all branches together) are with the Company Admin.`}
          </small>
        </div>
        {locked.length > 0 && (
          <ul className="an-locked" aria-label="Kept for the Branch Manager">
            {locked.map(({ spec, partial }) => (
              <li key={spec.id} title={partial ? `Only some types are available to your role` : `Includes ${LOCKED_REASON[spec.id] ?? "manager-only figures"}`}>
                <Lock size={13} /> {spec.title}
                {partial ? <em>some types</em> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <ReportsHome
        key={user.role}
        reports={reports}
        basePath={`/branch/${branch.id}/analysis`}
        lockedBranch={branch.id}
        initialBranch={branch.id}
        maxDays={maxDaysFor(user.role)}
        heading={user.kind === "staff" ? "Your reports" : "Choose a report"}
        subheading="Create report → choose the period and content, preview it, then print, download a PDF or export to a spreadsheet"
      />
    </AnimatedPage>
  );
}
