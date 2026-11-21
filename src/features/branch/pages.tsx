import { useMemo, useState, type ReactNode } from "react";
import { Building2, Plus, ReceiptText } from "lucide-react";
import { useApp } from "@/app/AppState";
import { SERVICES, getBranch, servicePrice } from "@/data/company";
import type { Branch } from "@/data/types";
import { AnimatedPage, Reveal } from "@/shared/motion";
import { formatMoney, greeting } from "@/shared/format";
import { Badge, Button, DemoChip, PageHeader, SectionHeader } from "@/shared/ui/controls";
import { Modal } from "@/shared/ui/Modal";
import { SearchSelect } from "@/shared/ui/SearchSelect";
import { WelcomeBanner } from "@/features/dashboard/WelcomeBanner";
import { KpiGrid } from "@/features/dashboard/KpiGrid";
import { FinancialAnalytics } from "@/features/dashboard/FinancialAnalytics";
import { ActivityAttentionSection, StaffOverviewCard, TopPerformanceSection } from "@/features/dashboard/Sections";
import { useDashboardData } from "@/features/dashboard/useDashboardData";
import { IntelligenceBriefing } from "@/features/intelligence/Intelligence";
import { AuditView, DraftsView, ExpensesTable, InventoryView, Panel, PatientsView, PRView, StaffTable, TransactionsTable, TrashView } from "@/features/shared/views";
import { ReceiptPreview, ReportsView } from "@/features/company/pages";

function ContextNotice({ branch }: { branch: Branch }) {
  const { user } = useApp();
  return (
    <Reveal className="notice" style={{ marginBottom: 22 }}>
      <Building2 size={18} />
      <span>
        <strong>You are working inside the {branch.name} branch workspace.</strong> Changes here apply only to this branch. Signed in as {user.role}.
      </span>
    </Reveal>
  );
}

export function BranchDashboard({ branch }: { branch: Branch }) {
  const { period, user } = useApp();
  const ids = useMemo(() => [branch.id], [branch.id]);
  const { range, summary, prior } = useDashboardData(ids, period);
  return (
    <AnimatedPage>
      <WelcomeBanner
        eyebrow={`Branch operations · ${branch.name}`}
        title={`${greeting()}, ${user.name}.`}
        subtitle={`Here is today's operational and financial picture for the ${branch.name} branch (${branch.city}).`}
        summary={summary}
        range={range}
      />
      <SectionHeader eyebrow="Branch financial intelligence" title="Branch Performance Overview" description={`All amounts are recorded in ${branch.currency}.`} demo />
      <KpiGrid summary={summary} prior={prior} />
      <FinancialAnalytics branchIds={ids} range={range} title="Branch revenue, collections & expenses" />
      <TopPerformanceSection branchIds={ids} range={range} basePath={`/branch/${branch.id}/analysis`} />
      <ActivityAttentionSection branchIds={ids} range={range} includeCompany={false} />
      <SectionHeader eyebrow="People & insight" title="Branch staff & STANLEY Intelligence" />
      <Reveal mode="stagger" className="split-grid">
        <StaffOverviewCard branchIds={ids} staffPath={`/branch/${branch.id}/staff`} />
        <IntelligenceBriefing branchIds={ids} range={range} summary={summary} prior={prior} scope={`${branch.name} branch`} />
      </Reveal>
    </AnimatedPage>
  );
}

function BillingPage({ branch }: { branch: Branch }) {
  const [receipt, setReceipt] = useState(false);
  const [creating, setCreating] = useState(false);
  const [service, setService] = useState("");
  const [referrer, setReferrer] = useState("");
  const { agents } = useApp();
  const { showToast } = useApp();
  return (
    <AnimatedPage>
      <PageHeader
        eyebrow={`Branch operations · ${branch.name}`}
        title="Billing"
        description="Create patient bills, record payments and issue receipts."
        actions={
          <>
            <Button variant="secondary" onClick={() => setReceipt(true)}>
              <ReceiptText size={16} /> Receipt preview
            </Button>
            <Button onClick={() => setCreating(true)}>
              <Plus size={16} /> New bill
            </Button>
          </>
        }
      />
      <ContextNotice branch={branch} />
      <TransactionsTable scope={[branch.id]} title="Recent bills & payments" />
      <ReceiptPreview open={receipt} onClose={() => setReceipt(false)} />
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        wide
        title="New patient bill"
        description={`Prices are those configured for ${branch.name} (${branch.currency}).`}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setCreating(false);
                showToast("Saved to drafts (demo — not saved)");
              }}
            >
              Save as draft
            </Button>
            <Button
              onClick={() => {
                setCreating(false);
                showToast("Bill created (demo — not saved)");
              }}
            >
              Create bill
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <label className="field">
            Patient
            <input placeholder="Search name or patient ID" />
          </label>
          <div className="field">
            Referring PR agent (optional)
            <SearchSelect
              value={referrer}
              ariaLabel="Referring PR agent"
              placeholder="No referrer"
              searchPlaceholder={`Search ${agents.length} PR agents by name, hospital or phone`}
              options={[{ value: "", label: "No referrer" }, ...agents.map((a) => ({ value: String(a.id), label: a.name, description: a.hospital ? a.hospital.toUpperCase() : "No hospital assigned", keywords: `${a.phone} ${a.id}` }))]}
              onChange={setReferrer}
            />
          </div>
          <div className="field full">
            Diagnostic service
            <SearchSelect
              value={service}
              ariaLabel="Diagnostic service"
              placeholder="Select a service"
              searchPlaceholder={`Search ${SERVICES.length} billable services`}
              options={SERVICES.map((s) => ({ value: String(s.id), label: s.name, description: `${s.category} · ${formatMoney(servicePrice(s, branch.currency), branch.currency)}` }))}
              onChange={setService}
            />
          </div>
        </div>
        <p className="hint" style={{ margin: 0 }}>
          Services and prices come from the real catalogue. Items without a price on file are not billable until priced.
        </p>
      </Modal>
    </AnimatedPage>
  );
}

function SettingsPage({ branch }: { branch: Branch }) {
  return (
    <AnimatedPage>
      <PageHeader eyebrow={`Branch configuration · ${branch.name}`} title="Settings" description="Branch profile and the branch's service catalogue and prices." />
      <ContextNotice branch={branch} />
      <InventoryView scope={[branch.id]} />
      <div style={{ height: 22 }} />
      <Panel title="Branch profile">
        <div className="form-grid">
          <label className="field">
            Branch name
            <input defaultValue={branch.name} />
          </label>
          <label className="field">
            Recorded currency
            <input defaultValue={branch.currency} readOnly />
          </label>
          <label className="field">
            Phone
            <input defaultValue={branch.phone} />
          </label>
          <label className="field">
            Manager
            <input defaultValue={branch.manager} readOnly />
          </label>
          <label className="field">
            Branch code
            <input defaultValue={branch.code} readOnly />
          </label>
          <label className="field full">
            Address
            <textarea defaultValue={branch.address} />
          </label>
        </div>
      </Panel>
    </AnimatedPage>
  );
}

function Simple({ branch, eyebrow, title, description, children, demo = true }: { branch: Branch; eyebrow: string; title: string; description: string; children: ReactNode; demo?: boolean }) {
  return (
    <AnimatedPage>
      <PageHeader eyebrow={`${eyebrow} · ${branch.name}`} title={title} description={description} actions={demo ? <DemoChip /> : undefined} />
      <ContextNotice branch={branch} />
      {children}
    </AnimatedPage>
  );
}

export function BranchWorkspacePage({ branchId, page }: { branchId: string; page: string }) {
  const { route } = useApp();
  const branch = getBranch(branchId);
  if (!branch || branch.status !== "Active")
    return (
      <AnimatedPage>
        <PageHeader eyebrow="Branch workspace" title="Branch unavailable" description="This branch is not operational yet, or it does not exist." />
        <Badge>No workspace</Badge>
      </AnimatedPage>
    );
  const scope = [branch.id];
  const f = route.query.get("filter");
  switch (page) {
    case "billing":
      return <BillingPage branch={branch} />;
    case "drafts":
      return (
        <Simple branch={branch} eyebrow="Branch operations" title="Drafts" description="Unfinished bills saved by branch staff.">
          <DraftsView branchId={branch.id} />
        </Simple>
      );
    case "records":
      return (
        <Simple branch={branch} eyebrow="Branch operations" title="Records" description="Patient records and diagnostic history for this branch.">
          <PatientsView scope={scope} />
        </Simple>
      );
    case "inventory":
      return (
        <Simple branch={branch} eyebrow="Branch operations" title="Inventory" description="The branch's billable service catalogue and prices." demo={false}>
          <InventoryView scope={scope} initialFilter={f ?? "all"} />
        </Simple>
      );
    case "pr":
      return (
        <Simple branch={branch} eyebrow="Branch operations" title="PR Management" description="PR agents (referring doctors), their assigned hospitals and referral activity." demo={false}>
          <PRView scope={scope} />
        </Simple>
      );
    case "analysis":
      return (
        <Simple branch={branch} eyebrow="Branch analysis" title="Analysis" description="Branch revenue, referral and service analysis for the reporting period.">
          <ReportsView ids={scope} basePath={`/branch/${branch.id}/analysis`} />
        </Simple>
      );
    case "expenses":
      return (
        <Simple branch={branch} eyebrow="Branch operations" title="Expenses" description="Record branch expenses and track approval status.">
          <ExpensesTable scope={scope} canApprove={false} />
        </Simple>
      );
    case "staff":
      return (
        <Simple branch={branch} eyebrow="Branch operations" title="Staff Management" description="Branch accounts, roles and activity." demo={false}>
          <StaffTable branchId={branch.id} />
        </Simple>
      );
    case "settings":
      return <SettingsPage branch={branch} />;
    case "audit":
      return (
        <Simple branch={branch} eyebrow="Read-only record" title="Audit" description="Every change made in this branch.">
          <AuditView scope={scope} />
        </Simple>
      );
    case "trash":
      return (
        <Simple branch={branch} eyebrow="Recoverable items" title="Trash" description="Deleted branch records stay recoverable for 30 days." demo={false}>
          <TrashView scope={scope} />
        </Simple>
      );
    default:
      return <BranchDashboard branch={branch} />;
  }
}
