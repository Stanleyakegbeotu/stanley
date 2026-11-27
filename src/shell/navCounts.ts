/**
 * Counts on sidebar items, like the Inbox's unread count (owner, 2026-11-26):
 * Billing shows referrals waiting to be billed, Drafts the saved drafts,
 * Reports the reports this person hasn't opened yet, and Marketing what the
 * manager still has to do (setup not finished, transfers to approve, dormant
 * hospitals needing action; owner, 2026-11-27).
 */
import { useMemo } from "react";
import { useApp } from "@/app/AppState";
import { LEGACY_BRANCH_ID } from "@/data/legacy";
import { useIncomingMany } from "@/features/referrals/IncomingReferrals";
import { useBilling } from "@/services/billing";
import { isNewFor, readerId, useIssueReports, visibleReports } from "@/services/issueReports";
import { staffKey, useAccountAccess } from "@/services/accountAccess";
import { hospitalStatuses, hospitalsOf, marketersOf, needsAction, setupStatus, useMarketing } from "@/services/marketing";
import { can } from "@/services/permissions";

export type NavCounts = Partial<Record<string, { n: number; label: string }>>;

export function useNavCounts(branchId: string | null): NavCounts {
  const { user, context, staff, agents } = useApp();
  const billing = useBilling();
  const reports = useIssueReports();
  const incoming = useIncomingMany(useMemo(() => (branchId ? [branchId] : []), [branchId]));
  const mk = useMarketing();
  const access = useAccountAccess();
  const mkBranch = branchId ?? (context === "all" ? LEGACY_BRANCH_ID : context);
  const marketing = useMemo(() => {
    if (!can(user.role, "referral.manage")) return 0;
    const ms = marketersOf(staff, mkBranch, (id) => !!access[staffKey(id)]?.off);
    if (!ms.length) return 0;
    const hs = hospitalsOf(mk, mkBranch, mkBranch === LEGACY_BRANCH_ID ? agents : [], new Set(ms.map((m) => m.id)));
    const setup = setupStatus(mk, mkBranch, hs.filter((h) => !h.owner).length).filter((x) => !x.done).length;
    const approvals = mk.transfers.filter((t) => t.branchId === mkBranch && t.stage === "manager").length;
    const dormant = [...hospitalStatuses(mk, mkBranch, hs, agents).values()].filter(needsAction).length;
    return setup + approvals + dormant;
  }, [user.role, staff, mkBranch, access, mk, agents]);
  return useMemo(() => {
    const me = readerId(user);
    const kind: "admin" | "manager" | "staff" = !branchId ? "admin" : user.kind === "staff" ? "staff" : "manager";
    const scope = branchId ? [branchId] : context === "all" ? null : [context];
    const fresh = visibleReports(reports, { kind, branchId }, scope).filter((r) => isNewFor(r, me)).length;
    const out: NavCounts = { reports: { n: fresh, label: `${fresh} new report${fresh === 1 ? "" : "s"}` }, marketing: { n: marketing, label: `${marketing} marketing item${marketing === 1 ? "" : "s"} need you` } };
    if (branchId) {
      const waiting = incoming.filter((r) => r.status === "waiting" && !r.closed).length;
      const drafts = billing.drafts.filter((d) => d.branchId === branchId).length;
      out.billing = { n: waiting, label: `${waiting} referral${waiting === 1 ? "" : "s"} waiting to be billed` };
      out.drafts = { n: drafts, label: `${drafts} saved draft${drafts === 1 ? "" : "s"}` };
    }
    return out;
  }, [user, context, branchId, reports, incoming, billing.drafts, marketing]);
}
