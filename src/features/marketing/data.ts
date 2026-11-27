/**
 * Marketing page data (owner, 2026-11-27): the branch's marketers, their
 * hospitals with each hospital's state (locked, dormant, needs growth,
 * handover), their month, transfers and what the manager still has to set up.
 * Used by the Marketing page and by PR Management (moving a hospital).
 */
import { useEffect, useMemo } from "react";
import { useApp } from "@/app/AppState";
import { LEGACY_BRANCH_ID } from "@/data/legacy";
import { getBranch } from "@/data/company";
import { useCheckUps } from "@/services/agentMonitor";
import { staffKey, useAccountAccess } from "@/services/accountAccess";
import { carryOverIfLate, hospitalFigures, hospitalStatuses, hospitalsOf, marketersOf, monthKey, monthRange, needsAction, progressFor, seedOwners, setupStatus, useMarketing } from "@/services/marketing";
import { formatMoney } from "@/shared/format";
import type { StaffRecord } from "@/data/userRecords";

export function useMarketingData(branchId: string) {
  const { staff, agents } = useApp();
  const st = useMarketing();
  const access = useAccountAccess();
  const checkUps = useCheckUps();
  const marketers = useMemo(() => marketersOf(staff, branchId, (id) => !!access[staffKey(id)]?.off), [staff, branchId, access]);
  const ids = useMemo(() => new Set(marketers.map((m) => m.id)), [marketers]);
  const branchAgents = useMemo(() => (branchId === LEGACY_BRANCH_ID ? agents : []), [branchId, agents]);
  const hospitals = useMemo(() => hospitalsOf(st, branchId, branchAgents, ids), [st, branchId, branchAgents, ids]);
  useEffect(() => seedOwners(branchId, hospitals, marketers.filter((m) => m.status === "Active").map((m) => m.id)), [branchId, hospitals, marketers]);
  useEffect(() => carryOverIfLate(branchId), [branchId]);
  const ym = monthKey();
  const statuses = useMemo(() => hospitalStatuses(st, branchId, hospitals, agents), [st, branchId, hospitals, agents]);
  const progress = useMemo(() => marketers.map((m) => progressFor(st, branchId, m.id, hospitals, agents, checkUps, ym, m.name)), [marketers, st, branchId, hospitals, agents, checkUps, ym]);
  const figs = useMemo(() => hospitalFigures(branchId, monthRange(ym), agents), [branchId, ym, agents]);
  const unowned = hospitals.filter((h) => !h.owner);
  const setup = setupStatus(st, branchId, unowned.length);
  const approvals = st.transfers.filter((t) => t.branchId === branchId && t.stage === "manager");
  const openTransfers = st.transfers.filter((t) => t.branchId === branchId && (t.stage === "owner" || t.stage === "receiver"));
  const dormant = [...statuses.values()].filter((s) => s.owner && s.dormant !== "active" && s.dormant !== "grace");
  const attention = setup.filter((x) => !x.done).length + approvals.length + [...statuses.values()].filter(needsAction).length;
  const nameOf = (id: string | null | undefined) => (id ? (staff.find((s) => s.id === id)?.name ?? "A former marketer") : "No marketer");
  const isActive = (id: string) => ids.has(id) && !access[staffKey(id)]?.off;
  const currency = getBranch(branchId)?.currency ?? "NGN";
  const money = (n: number) => formatMoney(n, currency, true);
  return { st, staff, agents, checkUps, marketers, hospitals, statuses, progress, figs, unowned, setup, approvals, openTransfers, dormant, attention, nameOf, isActive, money, ym, branchId };
}
export type MarketingData = ReturnType<typeof useMarketingData>;
export type Marketer = StaffRecord;
