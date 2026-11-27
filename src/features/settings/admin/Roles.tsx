/**
 * Settings → Roles & Permissions: what each role can see and do. The app reads
 * these permissions directly (services/permissions.ts) — switching one off
 * removes the page, button or report straight away. Company Admin always has
 * everything; company-level permissions can't be given to branch roles.
 * Roles are fixed to Company Admin, Branch Manager and Front Desk (owner decision).
 */
import { useState } from "react";
import { Check, Lock, RotateCcw, ShieldAlert } from "lucide-react";
import { useApp } from "@/app/AppState";
import { BRANCH_ROLES, PERMISSION_GROUPS, can, isDefault, resetRole, setPermission, usePermissions, type PermissionDef, type RoleName } from "@/services/permissions";
import { formatCount } from "@/shared/format";
import { ConfirmDialog, Panel } from "./ui";

export function RolesSection() {
  const { user, staff, showToast } = useApp();
  usePermissions();
  const [grant, setGrant] = useState<{ role: Exclude<RoleName, "Company Admin">; perm: PermissionDef } | null>(null);
  const [reset, setReset] = useState<Exclude<RoleName, "Company Admin"> | null>(null);
  const holders = (role: RoleName) => (role === "Company Admin" ? 1 : staff.filter((s) => s.role === role && s.status !== "Left").length);
  const toggle = (role: Exclude<RoleName, "Company Admin">, perm: PermissionDef) => {
    const on = !can(role, perm.id);
    if (on && perm.sensitive) return setGrant({ role, perm });
    setPermission(role, perm.id, on, user.name);
    showToast(`${role}: ${perm.label} ${on ? "allowed" : "removed"}`);
  };

  return (
    <div className="sc-stack">
      <div className="sc-roles">
        {(["Company Admin", ...BRANCH_ROLES] as RoleName[]).map((r) => (
          <div key={r} className="sc-role-card">
            <b>{r}</b>
            <small>{r === "Company Admin" ? "Whole company · every permission · can't be restricted" : r === "Branch Manager" ? "Runs one branch and its front desk" : r === "Assistant Manager" ? "Inherits Branch Manager access, except three fixed marketing decisions" : "Front-desk attendants: patients, billing, payments"}</small>
            <span>
              {formatCount(holders(r))} {r === "Company Admin" ? "account" : `account${holders(r) === 1 ? "" : "s"}`}
            </span>
            {r !== "Company Admin" && r !== "Assistant Manager" && (
              <button type="button" className="sc-link" onClick={() => setReset(r as Exclude<RoleName, "Company Admin">)}>
                <RotateCcw size={13} /> Reset to defaults
              </button>
            )}
          </div>
        ))}
      </div>

      {PERMISSION_GROUPS.map((g) => (
        <Panel key={g.id} title={g.label}>
          <div className="table-wrap">
            <table className="bp-table sc-matrix" aria-label={`${g.label} permissions`}>
              <thead>
                <tr>
                  <th>Permission</th>
                  <th className="center">Company Admin</th>
                  {BRANCH_ROLES.map((r) => (
                    <th key={r} className="center">
                      {r}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {g.perms.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>
                        {p.label} {p.sensitive && <span className="sc-sensitive"><ShieldAlert size={12} /> Sensitive</span>}
                        {p.adminOnly && <span className="sc-sensitive is-admin"><Lock size={11} /> Company only</span>}
                      </strong>
                      <small className="ep-sub">{p.description}</small>
                    </td>
                    <td className="center">
                      <span className="sc-perm is-on is-locked" title="The Company Admin always has every permission">
                        <Check size={14} />
                      </span>
                    </td>
                    {BRANCH_ROLES.map((r) => {
                      const on = can(r, p.id);
                      return (
                        <td key={r} className="center">
                          {r === "Assistant Manager" ? (
                            <span className={"sc-perm " + (on ? "is-on" : "is-locked")} title={p.branchManagerOnly ? "Branch Manager only" : "Inherits the Branch Manager permission"}>
                              {on ? <Check size={14} /> : <Lock size={13} />}
                            </span>
                          ) : p.adminOnly || (p.managersOnly && r === "Front Desk") ? (
                            <span className="sc-perm is-locked" title={p.adminOnly ? "Company Admin only — can't be given to branch roles" : "Branch Manager and Company Admin only — the front desk are staff themselves"}>
                              <Lock size={13} />
                            </span>
                          ) : (
                            <button
                              type="button"
                              role="switch"
                              aria-checked={on}
                              aria-label={`${r}: ${p.label}`}
                              className={`sc-switch is-sm ${on ? "is-on" : ""} ${on !== isDefault(r, p.id) ? "is-changed" : ""}`}
                              onClick={() => toggle(r, p)}
                              title={on !== isDefault(r, p.id) ? "Changed from the default" : undefined}
                            >
                              <i />
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ))}
      <p className="lg-muted al-note">STANLEY's roles are Company Admin, Branch Manager and Front Desk — other branch staff are managed outside the app, so custom roles aren't offered. Every permission change is recorded in the audit log and takes effect immediately.</p>

      <ConfirmDialog
        open={!!grant}
        title={grant ? `Give ${grant.role} "${grant.perm.label}"?` : ""}
        description={grant ? `${grant.perm.description} This is a sensitive permission.` : ""}
        consequences={grant ? [`Every ${grant.role} account gets it immediately`, "The change is recorded in the audit log"] : []}
        confirmLabel="Grant permission"
        onClose={() => setGrant(null)}
        onConfirm={() => {
          if (grant) {
            setPermission(grant.role, grant.perm.id, true, user.name);
            showToast(`${grant.role}: ${grant.perm.label} allowed`);
          }
          setGrant(null);
        }}
      />
      <ConfirmDialog
        open={!!reset}
        title={reset ? `Reset ${reset} to the standard permissions?` : ""}
        description="Every change made to this role is undone."
        confirmLabel="Reset role"
        onClose={() => setReset(null)}
        onConfirm={() => {
          if (reset) {
            resetRole(reset, user.name);
            showToast(`${reset} reset to defaults`);
          }
          setReset(null);
        }}
      />
    </div>
  );
}
