/**
 * Thin page wrappers over the catalogue views built on the REAL legacy
 * baseline (src/data/legacy):
 *  • InventoryView → features/inventory/InventoryCatalog (category cards → services)
 *  • PRView        → features/pr/PRCatalog (hospital cards → agents → profile)
 * Both work out the reporting-period activity they display.
 */
import { useMemo } from "react";
import { useApp } from "@/app/AppState";
import { LEGACY_BRANCH_ID } from "@/data/legacy";
import { agentRanking, periodLabel, resolveRange, serviceRanking } from "@/services/analytics";
import { useCommission } from "@/services/commission";
import { InventoryCatalog, type ServiceActivity } from "@/features/inventory/InventoryCatalog";
import { PRCatalog, type AgentActivity } from "@/features/pr/PRCatalog";
import type { Scope } from "./views";

export function InventoryView({ scope, initialFilter = "all" }: { scope: Scope; initialFilter?: string }) {
  const { period } = useApp();
  const range = resolveRange(period);
  const activity = useMemo(() => {
    const map: ServiceActivity = new Map();
    for (const s of serviceRanking(scope ?? [LEGACY_BRANCH_ID], range)) if (s.count) map.set(s.id, { count: s.count, revenue: s.revenue.NGN ?? 0 });
    return map;
  }, [scope, range]);
  return <InventoryCatalog scope={scope} initialFilter={initialFilter} activity={activity} periodText={periodLabel(period)} />;
}

/** Referral activity per PR agent for the reporting period (NGN — the network belongs to BR001). */
export function useAgentActivity(scope: Scope): AgentActivity {
  const { period } = useApp();
  const { version } = useCommission();
  const range = resolveRange(period);
  return useMemo(() => {
    const map: AgentActivity = new Map();
    for (const a of agentRanking(scope ?? [LEGACY_BRANCH_ID], range)) map.set(a.id, { referrals: a.referrals, revenue: a.revenue.NGN ?? 0, commission: a.commission.NGN ?? 0 });
    return map;
  }, [scope, range, version]);
}

/**
 * Deep links: `?tab=agents` opens "All PR agents", `?hospital=CODE` opens that
 * hospital's agents, `?agent=ID` opens the agent's profile (used by global search).
 */
export function PRView({ scope }: { scope: Scope }) {
  const { period, route } = useApp();
  const activity = useAgentActivity(scope);
  const tab = route.query.get("tab");
  const hospital = route.query.get("hospital");
  const agent = Number(route.query.get("agent")) || null;
  return (
    <PRCatalog
      key={`${tab}|${hospital}|${agent}`}
      scope={scope}
      activity={activity}
      periodText={periodLabel(period)}
      initialAgents={tab === "agents"}
      initialHospital={hospital}
      initialAgent={agent}
    />
  );
}
