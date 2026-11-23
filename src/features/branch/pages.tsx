import { useState } from "react";
import { Plus, Users } from "lucide-react";
import { useApp } from "@/app/AppState";
import { getBranch } from "@/data/company";
import type { Branch } from "@/data/types";
import { AnimatedPage } from "@/shared/motion";
import { Badge, Button, PageHeader } from "@/shared/ui/controls";
import { BRANCH_NAV_ITEMS, canOpenBranchPage } from "@/shell/navigation";
import { can, usePermissions } from "@/services/permissions";
import { useBranches } from "@/services/org";
import { BranchAnalysisPage, BranchDraftsPage, BranchInventoryPage, BranchPrPage, BranchRecordsPage } from "./BranchPages";
import { StaffBranchView } from "@/features/staff/StaffWorkspace";
import { AddStaffDialog } from "@/features/shared/createForms";
import { PageHero } from "@/features/shared/PageHero";
import { ExpensesPage } from "@/features/expenses/ExpensesPage";
import { BranchAuditPage, BranchSettingsPage, BranchTrashPage } from "@/features/settings/BranchSettings";
import { BranchHome } from "./BranchHome";
import { AssistantPage } from "@/features/assistant/AssistantPage";
import { BillingWorkspace } from "@/features/billing/BillingWorkspace";

/** Branch Staff Management — the same staff list and profiles as the Company Admin's page, for this branch only. */
function BranchStaffPage({ branch }: { branch: Branch }) {
  const { user } = useApp();
  const canManage = can(user.role, "staff.manage");
  const [adding, setAdding] = useState<{ role?: string; session: number } | null>(null);
  return (
    <AnimatedPage>
      <PageHero
        eyebrow={`Staff management · ${branch.name} branch`}
        title="Staff Management"
        period={false}
        icon={Users}
        stats="staff"
        scope={[branch.id]}
        actions={
          canManage && (
            <button type="button" className="ph-btn solid" onClick={() => setAdding((a) => ({ session: (a?.session ?? 0) + 1 }))}>
              <Plus size={18} /> Add staff
            </button>
          )
        }
      />
      <StaffBranchView branchId={branch.id} onAdd={(role) => canManage && setAdding((a) => ({ role, session: (a?.session ?? 0) + 1 }))} />
      {adding && <AddStaffDialog key={adding.session} open onClose={() => setAdding(null)} branchId={branch.id} presetRole={adding.role} />}
    </AnimatedPage>
  );
}

/** Shown when a role opens a branch page it doesn't use (e.g. Front Desk → Analysis). */
function NoAccess({ branch, role, page }: { branch: Branch; role: string; page: string }) {
  const { navigate } = useApp();
  const label = BRANCH_NAV_ITEMS.find((i) => i.id === page)?.label ?? "This page";
  return (
    <AnimatedPage>
      <PageHeader eyebrow={`${branch.name} branch`} title={`${label} isn't part of your work`} description={`Your account (${role}) covers the branch's day-to-day work. ${label} is for the Branch Manager — ask them if you need something from it.`} />
      <Button onClick={() => navigate(`/branch/${branch.id}/dashboard`)}>Back to my dashboard</Button>
    </AnimatedPage>
  );
}

export function BranchWorkspacePage({ branchId, page }: { branchId: string; page: string }) {
  const { route, user } = useApp();
  usePermissions();
  useBranches();
  const branch = getBranch(branchId);
  if (!branch || branch.status !== "Active")
    return (
      <AnimatedPage>
        <PageHeader eyebrow="Branch workspace" title="Branch unavailable" description="This branch is not operational yet, or it does not exist." />
        <Badge>No workspace</Badge>
      </AnimatedPage>
    );
  const f = route.query.get("filter");
  if (!canOpenBranchPage(user.role, page)) return <NoAccess branch={branch} role={user.role} page={page} />;
  switch (page) {
    case "billing":
      return <BillingWorkspace key={branch.id} branch={branch} />;
    case "drafts":
      return <BranchDraftsPage branch={branch} />;
    case "records":
      return <BranchRecordsPage branch={branch} />;
    case "inventory":
      return <BranchInventoryPage key={branch.id} branch={branch} initialFilter={f ?? "all"} />;
    case "pr":
      return <BranchPrPage key={branch.id} branch={branch} />;
    case "analysis":
      return <BranchAnalysisPage branch={branch} />;
    case "expenses":
      return <ExpensesPage key={branch.id} branch={branch} />;
    case "staff":
      return <BranchStaffPage key={branch.id} branch={branch} />;
    case "settings":
      return <BranchSettingsPage branch={branch} />;
    case "audit":
      return <BranchAuditPage branch={branch} />;
    case "trash":
      return <BranchTrashPage branch={branch} />;
    case "assistant":
      return <AssistantPage mode="intelligence" base={`/branch/${branch.id}`} />;
    case "support":
      return <AssistantPage mode="issues" base={`/branch/${branch.id}`} />;
    default:
      return <BranchHome branch={branch} />;
  }
}
