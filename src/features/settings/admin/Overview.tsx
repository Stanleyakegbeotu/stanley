/**
 * Settings → Overview (Admin Control Center): the organisation at a glance,
 * what needs attention, quick actions and how complete the configuration is.
 * Every figure and alert is computed from live data.
 */
import { AlertTriangle, ArrowRight, Building2, ClipboardCheck, CreditCard, FileClock, Handshake, KeyRound, Package, Plus, ScrollText, ShieldCheck, Store, UserPlus, Users, type LucideIcon } from "lucide-react";
import { useApp } from "@/app/AppState";
import { useConfig } from "@/services/config";
import { useCommission, pct } from "@/services/commission";
import { useCompanyProfile } from "@/services/settingsStore";
import { formatCount } from "@/shared/format";
import { BrandLogo, useCompanyName } from "@/shell/BrandLogo";
import { useOrgFacts } from "./orgData";
import { Panel, StatusChip, shortDate, type Health } from "./ui";

export function Overview({ go }: { go: (section: string, action?: string) => void }) {
  const f = useOrgFacts();
  const name = useCompanyName();
  const company = useCompanyProfile();
  const cfg = useConfig();
  const { rate } = useCommission();
  const { trash } = useApp();

  const noManager = f.perBranch.filter((b) => !b.manager && b.branch.status !== "Inactive");
  const branchGaps = f.perBranch.filter((b) => b.gaps.length && b.manager && b.branch.status === "Active");
  const alerts: { tone: "attention" | "info" | "incomplete"; text: string; action: string; section: string; sub?: string }[] = [
    ...f.perBranch.filter((b) => b.branch.status === "Pending setup").map((b) => ({ tone: "incomplete" as const, text: `${b.branch.name} branch is awaiting activation`, sub: b.gaps.length ? `Still missing: ${b.gaps.join(", ")}` : "Ready to activate", action: "Open branch", section: "branches" })),
    ...noManager.map((b) => ({ tone: "attention" as const, text: `${b.branch.name} branch has no branch manager`, action: "Assign manager", section: "managers" })),
    ...(f.pendingApprovals ? [{ tone: "attention" as const, text: `${f.pendingApprovals} expense${f.pendingApprovals === 1 ? "" : "s"} waiting for approval`, action: "Review", section: "approvals" }] : []),
    ...branchGaps.map((b) => ({ tone: "attention" as const, text: `${b.branch.name} branch information is incomplete`, sub: b.gaps.join(", "), action: "Complete", section: "branches" })),
    ...(f.companyGaps.length ? [{ tone: "incomplete" as const, text: "Company profile is incomplete", sub: `Missing: ${f.companyGaps.join(", ")}`, action: "Complete", section: "company" }] : []),
    ...(f.paymentsOff.length ? [{ tone: "attention" as const, text: `No payment method enabled at ${f.paymentsOff.join(", ")}`, action: "Configure", section: "billing" }] : []),
    ...(f.backupOverdue ? [{ tone: "attention" as const, text: f.lastBackup ? `Backup overdue — last backup ${shortDate(f.lastBackup)}` : "No backup has been made on this device yet", action: "Back up now", section: "data" }] : []),
    ...(f.queued ? [{ tone: "info" as const, text: `${f.queued} record${f.queued === 1 ? "" : "s"} waiting to sync`, sub: "Saved safely on this device — the cloud database isn't connected yet", action: "Details", section: "integrations" }] : []),
    { tone: "info", text: "Sign-in and invitations are not connected yet", sub: "Accounts are created directly; passwords, invitations and login security arrive with sign-in", action: "Security", section: "security" },
  ];

  const tiles: { label: string; value: string; caption: string; icon: LucideIcon; section: string }[] = [
    { label: "Active branches", value: formatCount(f.active), caption: `${formatCount(f.pendingSetup)} pending setup · ${formatCount(f.inactive)} inactive or suspended`, icon: Store, section: "branches" },
    { label: "Branch managers", value: formatCount(f.managers.length), caption: noManager.length ? `${noManager.length} branch${noManager.length === 1 ? "" : "es"} without one` : "Every branch has a manager", icon: KeyRound, section: "managers" },
    { label: "Active staff", value: formatCount(f.activeStaff), caption: "Branch managers and front desk", icon: Users, section: "staff" },
    { label: "Pending approvals", value: formatCount(f.pendingApprovals), caption: "Expenses waiting for a decision", icon: ClipboardCheck, section: "approvals" },
    { label: "Invitations", value: "—", caption: "Sign-in not connected — no invitations to send", icon: UserPlus, section: "security" },
    { label: "In trash", value: formatCount(trash.length), caption: "Recoverable for 30 days", icon: FileClock, section: "data" },
  ];

  const config: { label: string; status: Health; note: string; section: string }[] = [
    { label: "Company profile", status: f.companyGaps.length ? (f.companyGaps.length > 3 ? "incomplete" : "attention") : "ok", note: f.companyGaps.length ? `Missing ${f.companyGaps.length}: ${f.companyGaps.join(", ")}` : "Complete", section: "company" },
    { label: "Branches", status: f.perBranch.some((b) => b.gaps.length && b.branch.status === "Active") ? "attention" : f.active ? "ok" : "incomplete", note: `${f.active} active · ${f.pendingSetup} pending setup`, section: "branches" },
    { label: "Branch managers", status: noManager.length ? "attention" : "ok", note: noManager.length ? `${noManager.map((b) => b.branch.name).join(", ")} without a manager` : "All branches covered", section: "managers" },
    { label: "Staff", status: f.activeStaff ? "ok" : "incomplete", note: `${f.activeStaff} active accounts`, section: "staff" },
    { label: "Roles & permissions", status: "ok", note: "Company Admin, Branch Manager, Front Desk", section: "roles" },
    { label: "Payment methods", status: f.paymentsOff.length ? "attention" : "ok", note: `Company: ${Object.entries(cfg.payments.enabled).filter(([, v]) => v).map(([k]) => k).join(", ") || "none"}${cfg.payments.split ? " · split allowed" : ""}`, section: "billing" },
    { label: "Billing rules", status: "ok", note: cfg.discounts.enabled ? `Discounts up to ${cfg.discounts.maxPercent}%` : "Discounts off", section: "billing" },
    { label: "Referral & commission", status: "ok", note: `Company commission ${pct(rate)}`, section: "referral" },
    { label: "Services", status: "ok", note: "Company-wide catalogue", section: "services" },
    { label: "Security", status: "info", note: "Sign-in not connected yet", section: "security" },
    { label: "Backups", status: f.backupOverdue ? "attention" : "ok", note: f.lastBackup ? `Last backup ${shortDate(f.lastBackup)} · every ${cfg.backup.everyDays} days` : "No backup yet", section: "data" },
  ];

  const actions: { label: string; icon: LucideIcon; section: string; action?: string }[] = [
    { label: "Add new branch", icon: Plus, section: "branches", action: "add" },
    { label: "Assign branch manager", icon: KeyRound, section: "managers" },
    { label: "Add staff member", icon: UserPlus, section: "staff", action: "add" },
    { label: "Review permissions", icon: ShieldCheck, section: "roles" },
    { label: "Review approvals", icon: ClipboardCheck, section: "approvals" },
    { label: "Payment methods", icon: CreditCard, section: "billing" },
    { label: "Manage services", icon: Package, section: "services" },
    { label: "Referral & commission", icon: Handshake, section: "referral" },
    { label: "View audit log", icon: ScrollText, section: "audit" },
    { label: "Company information", icon: Building2, section: "company" },
  ];

  return (
    <div className="sc-stack">
      <div className="sc-org">
        <span className="sc-org-logo">
          <BrandLogo />
        </span>
        <div className="sc-org-text">
          <span>Organisation</span>
          <b>{name}</b>
          <small>
            {company.registeredName ? `${company.registeredName} · ` : ""}
            {company.rcNumber ? `${company.rcNumber} · ` : ""}
            {f.branches.length} branch{f.branches.length === 1 ? "" : "es"} · offline-first, saved on this device
          </small>
        </div>
        <StatusChip status="ok">System running</StatusChip>
      </div>

      <div className="sc-tiles">
        {tiles.map((t) => (
          <button key={t.label} type="button" className="sc-tile" onClick={() => go(t.section)}>
            <span className="sc-tile-head">
              <span className="sc-tile-icon" aria-hidden="true">
                <t.icon size={16} />
              </span>
              {t.label}
            </span>
            <b className="num">{t.value}</b>
            <small>{t.caption}</small>
          </button>
        ))}
      </div>

      <Panel title="Needs attention" note={`${alerts.filter((a) => a.tone !== "info").length} item${alerts.filter((a) => a.tone !== "info").length === 1 ? "" : "s"} to act on · plus information notices`}>
        <ul className="sc-alerts">
          {alerts.map((a, i) => (
            <li key={i} className={`is-${a.tone}`}>
              <AlertTriangle size={16} aria-hidden="true" />
              <span>
                <b>{a.text}</b>
                {a.sub && <small>{a.sub}</small>}
              </span>
              <button type="button" className="sc-link" onClick={() => go(a.section)}>
                {a.action} <ArrowRight size={14} />
              </button>
            </li>
          ))}
        </ul>
      </Panel>

      <div className="sc-two">
        <Panel title="Quick actions">
          <div className="sc-quick">
            {actions.map((a) => (
              <button key={a.label} type="button" onClick={() => go(a.section, a.action)}>
                <a.icon size={16} /> {a.label}
              </button>
            ))}
          </div>
        </Panel>
        <Panel title="Configuration status" note="Each area, checked against what is actually set up">
          <ul className="sc-config">
            {config.map((c) => (
              <li key={c.label}>
                <button type="button" onClick={() => go(c.section)}>
                  <span>
                    <b>{c.label}</b>
                    <small>{c.note}</small>
                  </span>
                  <StatusChip status={c.status}>{c.status === "ok" ? "Configured" : c.status === "attention" ? "Needs attention" : c.status === "incomplete" ? "Incomplete" : c.status === "disabled" ? "Disabled" : "Not connected"}</StatusChip>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
