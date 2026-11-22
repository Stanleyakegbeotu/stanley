import { type ReactNode } from "react";
import { Building2 } from "lucide-react";
import { useApp } from "@/app/AppState";
import { getBranch } from "@/data/company";
import type { Branch } from "@/data/types";
import { AnimatedPage, Reveal } from "@/shared/motion";
import { Badge, DemoChip, PageHeader } from "@/shared/ui/controls";
import { ExpensesTable, InventoryView, PRView, StaffTable } from "@/features/shared/views";
import { BranchAuditPage, BranchSettingsPage, BranchTrashPage } from "@/features/settings/BranchSettings";
import { ReportsView } from "@/features/company/pages";
import { BranchHome } from "./BranchHome";
import { PatientDirectory } from "@/features/patients/PatientDirectory";
import { BillingDrafts, BillingWorkspace } from "@/features/billing/BillingWorkspace";

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
      return <BillingWorkspace key={branch.id} branch={branch} />;
    case "drafts":
      return (
        <Simple branch={branch} eyebrow="Branch operations" title="Drafts" description="Unfinished bills saved by branch staff.">
          <BillingDrafts branch={branch} />
        </Simple>
      );
    case "records":
      return (
        <Simple branch={branch} eyebrow="Branch operations" title="Records" description="Patient records and diagnostic history for this branch.">
          <PatientDirectory key={branch.id} branchId={branch.id} initialVisitId={route.query.get("visit")} />
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
      return <BranchSettingsPage branch={branch} />;
    case "audit":
      return <BranchAuditPage branch={branch} />;
    case "trash":
      return <BranchTrashPage branch={branch} />;
    default:
      return <BranchHome branch={branch} />;
  }
}
