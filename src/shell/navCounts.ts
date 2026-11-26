/**
 * Counts on sidebar items, like the Inbox's unread count (owner, 2026-11-26):
 * Billing shows referrals waiting to be billed, Drafts the saved drafts, and
 * Reports the reports this person hasn't opened yet.
 */
import { useMemo } from "react";
import { useApp } from "@/app/AppState";
import { useIncomingMany } from "@/features/referrals/IncomingReferrals";
import { useBilling } from "@/services/billing";
import { isNewFor, readerId, useIssueReports, visibleReports } from "@/services/issueReports";

export type NavCounts = Partial<Record<string, { n: number; label: string }>>;

export function useNavCounts(branchId: string | null): NavCounts {
  const { user, context } = useApp();
  const billing = useBilling();
  const reports = useIssueReports();
  const incoming = useIncomingMany(useMemo(() => (branchId ? [branchId] : []), [branchId]));
  return useMemo(() => {
    const me = readerId(user);
    const kind: "admin" | "manager" | "staff" = !branchId ? "admin" : user.kind === "staff" ? "staff" : "manager";
    const scope = branchId ? [branchId] : context === "all" ? null : [context];
    const fresh = visibleReports(reports, { kind, branchId }, scope).filter((r) => isNewFor(r, me)).length;
    const out: NavCounts = { reports: { n: fresh, label: `${fresh} new report${fresh === 1 ? "" : "s"}` } };
    if (branchId) {
      const waiting = incoming.filter((r) => r.status === "waiting" && !r.closed).length;
      const drafts = billing.drafts.filter((d) => d.branchId === branchId).length;
      out.billing = { n: waiting, label: `${waiting} referral${waiting === 1 ? "" : "s"} waiting to be billed` };
      out.drafts = { n: drafts, label: `${drafts} saved draft${drafts === 1 ? "" : "s"}` };
    }
    return out;
  }, [user, context, branchId, reports, incoming, billing.drafts]);
}
