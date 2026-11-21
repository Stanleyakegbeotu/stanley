import { useMemo } from "react";
import { useApp } from "@/app/AppState";
import { getBranch } from "@/data/company";
import { AnimatedPage } from "@/shared/motion";
import { greeting } from "@/shared/format";
import { SectionHeader } from "@/shared/ui/controls";
import { periodLabel, resolveBranchIds } from "@/services/analytics";
import { WelcomeBanner } from "@/features/dashboard/WelcomeBanner";
import { KpiGrid } from "@/features/dashboard/KpiGrid";
import { PaymentSummaryView, useFinancialAnalyticsData } from "@/features/dashboard/FinancialAnalytics";
import { ExpensesPatientsSection } from "@/features/dashboard/ExpensesPatients";
import { BranchPerformanceSection } from "@/features/dashboard/Sections";
import { DiagnosticServicesSection } from "@/features/dashboard/DiagnosticServices";
import { ReferralPerformanceSection } from "@/features/dashboard/ReferralPerformance";
import { useDashboardData } from "@/features/dashboard/useDashboardData";

/**
 * Company Admin Dashboard.
 *
 * Top-level controls (not numbered sections): header (branch scope, search,
 * notifications, profile) and the welcome banner with the reporting-period
 * filter and live strip.
 *
 * Section order (approved):
 *  1. Quick Stats                    — six KPI cards
 *  2. Quick Actions                  — not implemented yet (no existing component)
 *  3. Daily Payment Summary          — payment-method + collections-by-branch cards
 *  4. Branch Performance
 *  5. Referral performance           — top hospitals & top PR agents (+ "See all" modals)
 *  6. Expenses & patients            — patients attended + approved expenses (+ full-list modals)
 *  7. Daily Test Category Summary    — top 5 services + tests by category (+ all-services modal)
 *
 * Removed at the user's request: "Financial Overview & Analysis" (replaced by 6)
 * and "Hospital Performance / Referring hospitals & doctors" (covered by 5).
 */
export function CompanyDashboard() {
  const { context, period, user } = useApp();
  const branchIds = useMemo(() => resolveBranchIds(context), [context]);
  const { range, summary, prior } = useDashboardData(branchIds, period);
  // Each calculation runs once and is shared by the slots that display it.
  const finance = useFinancialAnalyticsData(branchIds, range);
  const focus = context === "all" ? null : getBranch(context);
  const scopeName = focus ? focus.name : "All branches";

  return (
    <AnimatedPage>
      {/* Top-level controls */}
      <WelcomeBanner
        eyebrow={`Company administration · ${scopeName}`}
        title={`${greeting()}, ${user.name}.`}
        subtitle={focus ? `Here is the financial and operational picture for the ${focus.name} branch.` : "Here is the consolidated financial and operational picture across your branches."}
        summary={summary}
        range={range}
      />

      {/* 1. Quick Stats */}
      <SectionHeader
        eyebrow="Financial intelligence"
        title="Business Performance Overview"
        description="Amounts stay grouped by their recorded currency; the dashboard does not combine currencies."
        demo
      />
      <KpiGrid summary={summary} prior={prior} />

      {/* 2. Quick Actions — no existing implementation; intentionally not created. */}

      {/* 3. Daily Payment Summary */}
      <PaymentSummaryView
        a={finance}
        eyebrow="Daily payment summary"
        title={period.key === "today" ? "Payments received today" : `Payments received · ${periodLabel(period)}`}
        description="Receipts actually collected, shown beside revenue performance. Payments received and revenue generated are kept separate."
      />

      {/* 4. Branch Performance */}
      <BranchPerformanceSection range={range} focusId={focus?.id ?? null} />

      {/* 5. Referral performance — top hospitals & top PR agents (replaced the activity / staff / intelligence section) */}
      <ReferralPerformanceSection branchIds={branchIds} range={range} />

      {/* 6. Expenses & patients — replaced "Financial Overview & Analysis" (revenue/collections/balances/expenses charts) */}
      <ExpensesPatientsSection branchIds={branchIds} range={range} />

      {/* 7. Daily Test Category Summary — top 5 services + tests by category (+ "all services" modal).
             The former "Referring hospitals & doctors" section was removed; referral rankings live in slot 5. */}
      <DiagnosticServicesSection branchIds={branchIds} range={range} />
    </AnimatedPage>
  );
}
