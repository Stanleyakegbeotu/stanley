import { useMemo } from "react";
import { useApp } from "@/app/AppState";
import { getBranch } from "@/data/demo/catalog";
import { AnimatedPage, Reveal } from "@/shared/motion";
import { greeting } from "@/shared/format";
import { SectionHeader } from "@/shared/ui/controls";
import { resolveBranchIds } from "@/services/analytics";
import { WelcomeBanner } from "@/features/dashboard/WelcomeBanner";
import { KpiGrid } from "@/features/dashboard/KpiGrid";
import { FinancialAnalytics } from "@/features/dashboard/FinancialAnalytics";
import { ActivityAttentionSection, BranchPerformanceSection, StaffOverviewCard, TopPerformanceSection } from "@/features/dashboard/Sections";
import { useDashboardData } from "@/features/dashboard/useDashboardData";
import { IntelligenceBriefing } from "@/features/intelligence/Intelligence";

/**
 * Company Admin Dashboard. Reveal order:
 * banner → reporting controls → live strip → financial intelligence → KPIs →
 * analytics → branch performance → top 5 (doctors, hospitals, services) →
 * activity → attention → staff overview → intelligence briefing.
 */
export function CompanyDashboard() {
  const { context, period, user } = useApp();
  const branchIds = useMemo(() => resolveBranchIds(context), [context]);
  const { range, summary, prior } = useDashboardData(branchIds, period);
  const focus = context === "all" ? null : getBranch(context);
  const scopeName = focus ? focus.name : "All branches";

  return (
    <AnimatedPage>
      <WelcomeBanner
        eyebrow={`Company administration · ${scopeName}`}
        title={`${greeting()}, ${user.name}.`}
        subtitle={focus ? `Here is the financial and operational picture for the ${focus.name} branch.` : "Here is the consolidated financial and operational picture across your branches."}
        summary={summary}
        range={range}
      />

      <SectionHeader
        eyebrow="Financial intelligence"
        title="Business Performance Overview"
        description="Amounts stay grouped by their recorded currency; the dashboard does not combine currencies."
        demo
      />
      <KpiGrid summary={summary} prior={prior} />

      <FinancialAnalytics branchIds={branchIds} range={range} />

      <BranchPerformanceSection range={range} focusId={focus?.id ?? null} />

      <TopPerformanceSection branchIds={branchIds} range={range} />

      <ActivityAttentionSection branchIds={branchIds} range={range} includeCompany={!focus} />

      <SectionHeader eyebrow="People & insight" title="Staff overview & STANLEY Intelligence" />
      <Reveal mode="stagger" className="split-grid">
        <StaffOverviewCard branchIds={branchIds} />
        <IntelligenceBriefing branchIds={branchIds} range={range} summary={summary} prior={prior} scope={focus ? `${focus.name} branch` : "Company"} />
      </Reveal>
    </AnimatedPage>
  );
}
