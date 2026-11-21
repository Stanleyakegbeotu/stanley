import { useMemo, useState, type ReactNode } from "react";
import { Building2, Plus, ReceiptText } from "lucide-react";
import { useApp } from "@/app/AppState";
import { SERVICES, getBranch } from "@/data/demo/catalog";
import type { Branch } from "@/data/types";
import { AnimatedPage, Reveal } from "@/shared/motion";
import { formatMoney, greeting } from "@/shared/format";
import { Badge, Button, DemoChip, PageHeader, Row, SectionHeader, Table } from "@/shared/ui/controls";
import { Modal } from "@/shared/ui/Modal";
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
          <label className="field">
            Referring doctor (optional)
            <input placeholder="Search referrer" />
          </label>
          <label className="field full">
            Diagnostic service
            <select>
              {SERVICES.map((s) => (
                <option key={s.name}>
                  {s.name} — {formatMoney(s.price[branch.currency], branch.currency)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Modal>
    </AnimatedPage>
  );
}

function SettingsPage({ branch }: { branch: Branch }) {
  const { showToast } = useApp();
  const [editing, setEditing] = useState<string | null>(null);
  const svc = SERVICES.find((s) => s.name === editing);
  return (
    <AnimatedPage>
      <PageHeader eyebrow={`Branch configuration · ${branch.name}`} title="Settings" description="Branch profile and branch-specific service prices." actions={<DemoChip />} />
      <ContextNotice branch={branch} />
      <Panel title="Diagnostic services & branch pricing" description={`Prices apply only to ${branch.name} and are recorded in ${branch.currency}. Every change is audited and notified to the Company Admin.`}>
        <Table headers={["Service", "Category", { label: "Current price", align: "right" }, ""]} label="Service prices">
          {SERVICES.map((s) => (
            <Row key={s.name}>
              <td>
                <strong>{s.name}</strong>
              </td>
              <td>{s.category}</td>
              <td className="right num">
                <strong>{formatMoney(s.price[branch.currency], branch.currency)}</strong>
              </td>
              <td className="right">
                <button className="text-link" onClick={() => setEditing(s.name)}>
                  Edit price
                </button>
              </td>
            </Row>
          ))}
        </Table>
      </Panel>
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
          <label className="field full">
            Address
            <textarea defaultValue={branch.address} />
          </label>
        </div>
      </Panel>
      <Modal
        open={!!svc}
        onClose={() => setEditing(null)}
        title={`Edit ${editing ?? ""} price`}
        description={`This change affects only the ${branch.name} branch.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                showToast("Price change submitted (demo — not saved)");
              }}
            >
              Save branch price
            </Button>
          </>
        }
      >
        <label className="field">
          Current price
          <input value={svc ? formatMoney(svc.price[branch.currency], branch.currency) : ""} readOnly />
        </label>
        <label className="field">
          New price ({branch.currency})
          <input inputMode="decimal" placeholder="Enter new price" />
        </label>
        <label className="field">
          Reason for change
          <textarea placeholder="Recorded in the audit log" />
        </label>
      </Modal>
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
        <Simple branch={branch} eyebrow="Branch operations" title="Inventory" description="Branch stock, reorder levels and expiry.">
          <InventoryView scope={scope} initialFilter={f === "low" ? "low" : "all"} />
        </Simple>
      );
    case "pr":
      return (
        <Simple branch={branch} eyebrow="Branch operations" title="PR Management" description="Branch PR officers, referral partners and commission accrued.">
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
