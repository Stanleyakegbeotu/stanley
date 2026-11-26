/**
 * Branch Settings → "My role & permissions" and "Security & access"
 * (owner, 2026-11-22). Read-only views for the Branch Manager and Front Desk:
 * they show what the signed-in person's role is, exactly which permissions it
 * has (straight from Roles & Permissions — the same rules the app enforces),
 * the pages and reports it opens, and how STANLEY protects data. Nothing here
 * can be changed — only the Company Admin changes roles and security.
 */
import { useMemo } from "react";
import { Check, Info, Lock, Minus, ShieldAlert, ShieldCheck } from "lucide-react";
import { useApp } from "@/app/AppState";
import type { AppUser } from "@/data/company";
import type { Branch } from "@/data/types";
import { MANAGER_ROLE, STAFF_ROLES } from "@/data/userRecords";
import { useAuditLog } from "@/services/audit";
import { PERMISSION_GROUPS, can, grantable, usePermissions } from "@/services/permissions";
import { Badge } from "@/shared/ui/controls";
import { BRANCH_NAV_ITEMS, canOpenBranchPage } from "@/shell/navigation";
import { maxDaysFor, reportsFor } from "@/features/reports/access";
import { SettingsBlock } from "./SettingsFrame";

const READ_ONLY = (
  <p className="ma-readonly">
    <Lock size={13} /> Read-only — only the Company Admin changes roles, permissions and security. Ask your {MANAGER_ROLE} or the Company Admin if you need different access.
  </p>
);

/* ─────────────── My role & permissions ─────────────── */

export function MyRoleView({ user, branch }: { user: AppUser; branch: Branch }) {
  usePermissions();
  const { staff } = useApp();
  const role = STAFF_ROLES.find((r) => r.value === user.role);
  const pages = BRANCH_NAV_ITEMS.filter((p) => canOpenBranchPage(user.role, p.id));
  const reports = reportsFor(user.role);
  const months = maxDaysFor(user.role) ? "up to one month at a time" : "up to the whole year";
  const all = PERMISSION_GROUPS.flatMap((g) => g.perms);
  const granted = all.filter((p) => can(user.role, p.id)).length;
  const me = user.staffId ? staff.find((s) => s.id === user.staffId) : undefined;

  return (
    <div className="st-stack">
      <div className="ma-role">
        <span className="ma-role-icon" aria-hidden="true">
          <ShieldCheck size={22} />
        </span>
        <div>
          <span>Your role</span>
          <b>{user.role}</b>
          <small>{role?.access ?? "Access set by the Company Admin."}</small>
        </div>
        <dl>
          <div>
            <dt>Branch</dt>
            <dd>
              {branch.name} · {branch.code}
            </dd>
          </div>
          <div>
            <dt>Account</dt>
            <dd>
              <Badge tone={me?.status === "Suspended" ? "danger" : me?.status === "On leave" ? "warn" : "ok"} dot>
                {me?.status ?? "Active"}
              </Badge>
            </dd>
          </div>
          <div>
            <dt>Permissions</dt>
            <dd>
              {granted} of {all.filter((p) => grantable(user.role, p.id)).length}
            </dd>
          </div>
        </dl>
      </div>

      <div className="ma-two">
        <SettingsBlock title="Pages you can open" note="In this branch's sidebar.">
          <ul className="ma-chips">
            {pages.map((p) => (
              <li key={p.id}>
                <p.icon size={14} /> {p.label}
              </li>
            ))}
          </ul>
        </SettingsBlock>
        <SettingsBlock title="Reports you can create" note={`Analysis page · ${months}.`}>
          {reports.length ? (
            <ul className="ma-list">
              {reports.map((r) => (
                <li key={r.id}>
                  <b>{r.title}</b>
                  <small>{r.variants.map((v) => v.label).join(" · ")}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">No reports for your role.</p>
          )}
        </SettingsBlock>
      </div>

      <SettingsBlock title="Your permissions" note="Exactly what the app allows your role — the same rules it enforces.">
        <div className="ma-groups">
          {PERMISSION_GROUPS.map((g) => (
            <section key={g.id} className="ma-group">
              <h5>{g.label}</h5>
              <ul>
                {g.perms.map((p) => {
                  const on = can(user.role, p.id);
                  const locked = !grantable(user.role, p.id);
                  return (
                    <li key={p.id} className={on ? "is-on" : locked ? "is-admin" : "is-off"}>
                      <span className="ma-mark" aria-hidden="true">
                        {on ? <Check size={13} /> : locked ? <Lock size={12} /> : <Minus size={13} />}
                      </span>
                      <span className="ma-perm">
                        <b>
                          {p.label}
                          {p.sensitive && on && <em className="ma-sensitive">Sensitive</em>}
                        </b>
                        <small>{p.description}</small>
                      </span>
                      <span className="ma-state">{on ? "Allowed" : p.adminOnly ? "Company Admin only" : locked ? "Managers only" : "Not allowed"}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </SettingsBlock>
      {READ_ONLY}
    </div>
  );
}

/* ─────────────── Security & access ─────────────── */

export function MySecurityView({ user, branch }: { user: AppUser; branch: Branch }) {
  const audit = useAuditLog();
  const history = useMemo(
    () => audit.filter((e) => (e.branchId === branch.id || e.branchId === null) && /permission|role|status changed|account switched|branch (activated|reactivated|suspended|deactivated)|restored|reset|moved to trash|deleted permanently/i.test(e.action)).slice(0, 12),
    [audit, branch.id],
  );
  const protections: [string, string][] = [
    ["Your access", `Set by your role (${user.role}). Pages, buttons and reports you aren't allowed simply don't appear.`],
    ["Your branch only", `You work inside the ${branch.name} branch workspace. Company-wide pages, settings and other branches' records belong to the Company Admin.`],
    ["Every change is recorded", "The audit log keeps who changed what and when. Entries can never be edited or deleted."],
    ["Nothing is deleted outright", "Deleted bills, drafts, expenses and staff go to Trash for 30 days and can be restored."],
    ["Sensitive actions are confirmed", "Suspending staff, rejecting expenses, moving records to trash and status changes ask for confirmation, and usually a reason."],
    ["Prices are protected", "Changing a price on a bill never changes the catalogue; discounts follow the company limit and need a reason."],
    ["Net profit is private", "Profit figures are shown to the Company Admin only."],
    ["Works offline", "Records are saved on this device first and queued for the cloud, so nothing is lost when the internet drops."],
  ];
  return (
    <div className="st-stack">
      <SettingsBlock title="How STANLEY protects the branch" note="Security controls that apply to you and everyone at the branch.">
        <ul className="ma-list is-protect">
          {protections.map(([t, d]) => (
            <li key={t}>
              <ShieldCheck size={15} aria-hidden="true" />
              <span>
                <b>{t}</b>
                <small>{d}</small>
              </span>
            </li>
          ))}
        </ul>
      </SettingsBlock>
      <SettingsBlock title="Sign-in & passwords" note="Not connected yet.">
        <p className="ma-note">
          <Info size={14} /> Personal sign-in, passwords, account lockout and session timeouts arrive when the cloud database is connected. Until then STANLEY runs on this device and the "Switch account" menu sets who is working — please use your own account.
        </p>
      </SettingsBlock>
      <SettingsBlock title="Recent security events" note={`Role, permission, account and branch changes affecting ${branch.name} (from the audit log).`}>
        {history.length === 0 ? (
          <p className="hint">No security events yet.</p>
        ) : (
          <ol className="ex-history">
            {history.map((e) => (
              <li key={e.id}>
                <b>
                  <ShieldAlert size={13} /> {e.action} · {e.record}
                </b>
                <small>
                  {e.user} · {e.at.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} {e.at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                </small>
              </li>
            ))}
          </ol>
        )}
      </SettingsBlock>
      {READ_ONLY}
    </div>
  );
}
