/**
 * Key figures for each page banner's live strip. Every figure comes from the
 * same sources the page itself shows, so the strip never disagrees with it.
 */
import { useMemo } from "react";
import { useApp, TRASH_RETENTION_DAYS } from "@/app/AppState";
import { THEMES } from "@/app/themes";
import { ACTIVE_BRANCHES, BRANCHES, COMPANY, getBranch } from "@/data/company";
import { CATALOGUE_CATEGORIES, CATALOGUE_INVENTORY } from "@/data/catalogueRules";
import { patientVisits, patientsOnRecord } from "@/data/demo/dailyLines";
import { buildHospitalDirectory, hospitalKey } from "@/data/legacy";
import { managerOf } from "@/data/userRecords";
import { periodLabel, resolveRange, serviceRanking, summarize } from "@/services/analytics";
import { useAuditLog } from "@/services/audit";
import { pct, useCommission } from "@/services/commission";
import { financeTotals } from "@/services/finance";
import { formatCount, formatMoney } from "@/shared/format";
import type { HeroStat } from "./PageHero";
import { REPORTS } from "@/features/reports/specs";

export type HeroPage = "branches" | "inventory" | "staff" | "pr" | "patients" | "finance" | "reports" | "settings" | "audit" | "trash";

const money = (n: number) => formatMoney(n, "NGN", true);
const DAY = 86_400_000;

export function useHeroStats(page: HeroPage, scope: string[] | null): HeroStat[] {
  const { period, agents, staff, trash: trashAll, theme } = useApp();
  const auditAll = useAuditLog();
  const audit = auditAll;
  const trash = trashAll;
  const { rate, version } = useCommission();
  const ids = useMemo(() => scope ?? ACTIVE_BRANCHES.map((b) => b.id), [scope]);

  return useMemo((): HeroStat[] => {
    const range = resolveRange(period);
    const pl = periodLabel(period);
    switch (page) {
      case "branches": {
        const s = summarize(ids, range);
        return [
          { label: "Active branches", value: formatCount(ACTIVE_BRANCHES.length) },
          { label: `Patient visits · ${pl}`, value: formatCount(s.patients) },
          { label: "Generated", value: money(s.revenue.NGN ?? 0) },
          { label: "Payments received", value: money(s.payments.NGN ?? 0) },
          { label: "Outstanding balances", value: money(s.outstanding.NGN ?? 0) },
          { label: "Staff on record", value: formatCount(staff.filter((x) => x.status !== "Left").length) },
        ];
      }
      case "inventory": {
        const used = serviceRanking(ids, range).filter((x) => x.count > 0);
        return [
          { label: "Services", value: formatCount(CATALOGUE_INVENTORY.length) },
          { label: "Categories", value: formatCount(CATALOGUE_CATEGORIES.length) },
          { label: `Tests performed · ${pl}`, value: formatCount(used.reduce((s, x) => s + x.count, 0)) },
          { label: "Revenue billed", value: money(used.reduce((s, x) => s + (x.revenue.NGN ?? 0), 0)) },
          { label: "Services without a price", value: formatCount(CATALOGUE_INVENTORY.filter((i) => i.price === null).length) },
        ];
      }
      case "staff": {
        const people = staff.filter((x) => ids.includes(x.branchId) && x.status !== "Left");
        const managed = ids.filter((id) => managerOf(staff, id)).length;
        return [
          { label: "Staff", value: formatCount(people.length) },
          { label: "Active", value: formatCount(people.filter((x) => x.status === "Active").length) },
          { label: "On leave", value: formatCount(people.filter((x) => x.status === "On leave").length) },
          { label: "Branches with a manager", value: `${managed} of ${ids.length}` },
          { label: "Deleted (in trash)", value: formatCount(trash.filter((t) => t.kind === "staff").length) },
        ];
      }
      case "pr": {
        const visits = patientVisits(ids, range).filter((v) => v.agentId !== null);
        const billed = visits.reduce((s, v) => s + v.billed, 0);
        return [
          { label: "PR agents", value: formatCount(agents.length) },
          { label: "Partner hospitals", value: formatCount(buildHospitalDirectory(agents).length) },
          { label: `Referrals · ${pl}`, value: formatCount(visits.length) },
          { label: "Referral revenue", value: money(billed) },
          { label: "Company commission rate", value: pct(rate) },
          { label: "With bank details", value: formatCount(agents.filter((a) => a.bank).length) },
          { label: "Without a hospital", value: formatCount(agents.filter((a) => !hospitalKey(a.hospital)).length) },
        ];
      }
      case "patients": {
        const today = patientVisits(ids, resolveRange({ key: "today" }));
        return [
          { label: "Patients today", value: formatCount(new Set(today.map((v) => v.patientRef)).size) },
          { label: "New today", value: formatCount(today.filter((v) => v.isNew).length) },
          { label: "Generated today", value: money(today.reduce((s, v) => s + v.billed, 0)) },
          { label: "Paid today", value: money(today.reduce((s, v) => s + v.paid, 0)) },
          { label: "Patients on record", value: formatCount(ids.reduce((s, id) => s + patientsOnRecord(id).total, 0)) },
        ];
      }
      case "finance": {
        const sum = (key: "today" | "month" | "year") => ids.map((id) => financeTotals(id, resolveRange({ key }))).reduce((a, t) => ({ income: a.income + t.income, net: a.net + t.net, outstanding: a.outstanding + t.outstanding, costs: a.costs + t.costs }), { income: 0, net: 0, outstanding: 0, costs: 0 });
        const d = sum("today");
        const mo = sum("month");
        const y = sum("year");
        return [
          { label: "Money in today", value: money(d.income) },
          { label: "Net profit today", value: money(d.net) },
          { label: "Money in this month", value: money(mo.income) },
          { label: "Net profit this month", value: money(mo.net) },
          { label: "Net profit this year", value: money(y.net) },
          { label: "Outstanding", value: money(d.outstanding) },
        ];
      }
      case "reports": {
        const madeToday = (cat: string) => audit.filter((e) => e.category === cat && Date.now() - e.at.getTime() < DAY).length;
        return [
          { label: "Report cards", value: formatCount(REPORTS.length) },
          { label: "Report types", value: formatCount(REPORTS.reduce((s, r) => s + r.variants.length, 0)) },
          { label: "Reports output today", value: formatCount(madeToday("Reports")) },
          { label: "Receipts output today", value: formatCount(madeToday("Receipts")) },
          { label: "Commission rate", value: pct(rate) },
          { label: "Paper", value: "A4 · A3 · Letter" },
        ];
      }
      case "settings":
        return [
          { label: "Company", value: COMPANY.name },
          { label: "Branches", value: `${ACTIVE_BRANCHES.length} active of ${BRANCHES.length}` },
          { label: "Currency", value: getBranch(ids[0])?.currency ?? "NGN" },
          { label: "Theme", value: THEMES.find((t) => t.id === theme)?.name ?? theme },
          { label: "Commission rate", value: pct(rate) },
        ];
      case "audit": {
        // Branch view: that branch's entries plus company-wide changes that apply to it.
        const audit = scope ? auditAll.filter((e) => !e.branchId || scope.includes(e.branchId)) : auditAll;
        const last = audit[0];
        return [
          { label: "Entries", value: formatCount(audit.length) },
          { label: "Today", value: formatCount(audit.filter((e) => new Date(e.at).toDateString() === new Date().toDateString()).length) },
          { label: "Last change", value: last ? `${last.action} · ${last.at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : "—" },
          { label: "Status", value: "Read-only · cannot be edited" },
        ];
      }
      case "trash": {
        const trash = scope ? trashAll.filter((t) => scope.includes(t.branchId)) : trashAll;
        const left = (iso: string) => TRASH_RETENTION_DAYS - Math.floor((Date.now() - new Date(iso).getTime()) / DAY);
        return [
          { label: "In trash", value: formatCount(trash.length) },
          { label: "Expiring within 7 days", value: formatCount(trash.filter((t) => left(t.deletedAt) <= 7).length) },
          { label: "Kept for", value: `${TRASH_RETENTION_DAYS} days` },
          { label: "Legacy records", value: "Protected — never deleted" },
        ];
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, ids, scope, period, agents, staff, trashAll, theme, auditAll, rate, version]);
}
