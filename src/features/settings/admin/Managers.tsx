/**
 * Settings → Branch Managers: who runs each branch. Assign a manager to a
 * branch without one (promote someone at the branch or create a new account),
 * replace or remove a manager, suspend / reactivate their account. One manager
 * per branch; managers only reach their own branch (Roles & Permissions).
 * Sign-in isn't connected yet, so accounts are created directly — no invitations.
 */
import { useState } from "react";
import { KeyRound, UserPlus } from "lucide-react";
import { useApp } from "@/app/AppState";
import type { Branch } from "@/data/types";
import { FRONT_DESK_ROLE, MANAGER_ROLE, type StaffRecord } from "@/data/userRecords";
import { useAuditLog } from "@/services/audit";
import { formatCount } from "@/shared/format";
import { Badge, Button, SelectMenu } from "@/shared/ui/controls";
import { Modal } from "@/shared/ui/Modal";
import { AddStaffDialog } from "@/features/shared/createForms";
import { useOrgFacts } from "./orgData";
import { ConfirmDialog, NotConnected, Panel, StatusChip, dateTime, shortDate } from "./ui";

export function ManagersSection() {
  const { editStaff, showToast } = useApp();
  const f = useOrgFacts();
  const audit = useAuditLog();
  const [assign, setAssign] = useState<{ branch: Branch; replacing?: StaffRecord } | null>(null);
  const [remove, setRemove] = useState<StaffRecord | null>(null);
  const [suspend, setSuspend] = useState<StaffRecord | null>(null);
  const lastSeen = (name: string) => audit.find((e) => e.user === name);
  const without = f.perBranch.filter((b) => !b.manager && b.branch.status !== "Inactive");

  return (
    <div className="sc-stack">
      {without.length > 0 && (
        <div className="sc-gaps">
          <b>Without a manager:</b> {without.map((b) => `${b.branch.name} branch`).join(", ")}
        </div>
      )}
      <Panel title="Managers by branch" note="Each branch has one manager — the head of every staff member there.">
        <div className="table-wrap thin-scroll">
          <table className="bp-table rf-table sc-table" aria-label="Branch managers">
            <thead>
              <tr>
                <th>Branch</th>
                <th>Manager</th>
                <th>Contact</th>
                <th>Account</th>
                <th>Appointed</th>
                <th>Last activity</th>
                <th className="right">Staff led</th>
                <th className="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {f.perBranch.map((b) => {
                const m = b.manager;
                const seen = m ? lastSeen(m.name) : undefined;
                return (
                  <tr key={b.branch.id}>
                    <td>
                      <strong>{b.branch.name}</strong>
                      <small className="ep-sub">{b.branch.status}</small>
                    </td>
                    <td>{m ? <strong>{m.name}</strong> : <span className="sc-missing">Not assigned</span>}</td>
                    <td>
                      {m ? (
                        <>
                          {m.phone || <span className="lg-muted">No phone</span>}
                          <small className="ep-sub">{m.email || "No email"}</small>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{m ? <Badge tone={m.status === "Active" ? "ok" : m.status === "Suspended" ? "danger" : "warn"} dot>{m.status}</Badge> : "—"}</td>
                    <td className="ep-nowrap">{m ? shortDate(m.startDate) : "—"}</td>
                    <td>{seen ? dateTime(seen.at) : <span className="lg-muted">{m ? "No activity yet" : "—"}</span>}</td>
                    <td className="right num">{m ? formatCount(b.staff.filter((s) => s.id !== m.id).length) : "—"}</td>
                    <td className="right">
                      <div className="al-actions">
                        {m ? (
                          <>
                            <Button size="sm" variant="secondary" onClick={() => setAssign({ branch: b.branch, replacing: m })}>
                              Replace
                            </Button>
                            <Button size="sm" variant="secondary" onClick={() => setSuspend(m)}>
                              {m.status === "Suspended" ? "Reactivate" : "Suspend"}
                            </Button>
                            <Button size="sm" variant="secondary" className="st-trash" onClick={() => setRemove(m)}>
                              Remove
                            </Button>
                          </>
                        ) : (
                          <Button size="sm" onClick={() => setAssign({ branch: b.branch })}>
                            <KeyRound size={14} /> Assign manager
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="What managers can do" note="Branch Managers are limited to their own branch. They can't create branches, change company settings, roles or security, or give themselves Company Admin rights. Adjust their permissions in Roles & Permissions.">
        <StatusChip status="ok">Branch-scoped</StatusChip>
      </Panel>
      <NotConnected>Invitations and sign-in aren't connected yet: manager accounts are created directly and take effect immediately. Email invitations arrive with sign-in.</NotConnected>

      {assign && <AssignDialog key={assign.branch.id} branch={assign.branch} replacing={assign.replacing} onClose={() => setAssign(null)} />}
      <ConfirmDialog
        open={!!remove}
        title={remove ? `Remove ${remove.name} as manager?` : ""}
        description="The branch will have no manager until you assign one."
        consequences={["They stay on the staff list as Front Desk", "Their bills, approvals and audit history are kept", "Assign a new manager straight after"]}
        confirmLabel="Remove as manager"
        danger
        reason
        onClose={() => setRemove(null)}
        onConfirm={(reason) => {
          if (remove) {
            editStaff(remove.id, { role: FRONT_DESK_ROLE }, reason);
            showToast(`${remove.name} is no longer the branch manager`);
          }
          setRemove(null);
        }}
      />
      <ConfirmDialog
        open={!!suspend}
        title={suspend ? (suspend.status === "Suspended" ? `Reactivate ${suspend.name}?` : `Suspend ${suspend.name}?`) : ""}
        description={suspend?.status === "Suspended" ? "Their account works again." : "Their account stops working until it is reactivated. They remain the branch's manager on record."}
        confirmLabel={suspend?.status === "Suspended" ? "Reactivate" : "Suspend account"}
        danger={suspend?.status !== "Suspended"}
        reason
        onClose={() => setSuspend(null)}
        onConfirm={(reason) => {
          if (suspend) {
            editStaff(suspend.id, { status: suspend.status === "Suspended" ? "Active" : "Suspended" }, reason);
            showToast(`${suspend.name}: ${suspend.status === "Suspended" ? "reactivated" : "suspended"}`);
          }
          setSuspend(null);
        }}
      />
    </div>
  );
}

function AssignDialog({ branch, replacing, onClose }: { branch: Branch; replacing?: StaffRecord; onClose: () => void }) {
  const { staff, editStaff, showToast } = useApp();
  const candidates = staff.filter((s) => s.branchId === branch.id && s.id !== replacing?.id && s.status !== "Left" && s.role !== MANAGER_ROLE);
  const [pick, setPick] = useState(candidates[0]?.id ?? "");
  const [oldRole, setOldRole] = useState<"Front Desk" | "Left">("Front Desk");
  const [creating, setCreating] = useState(false);
  const demoteOld = () => {
    if (replacing) editStaff(replacing.id, oldRole === "Left" ? { status: "Left" } : { role: FRONT_DESK_ROLE });
  };
  return (
    <>
      <Modal
        open={!creating}
        onClose={onClose}
        icon={KeyRound}
        title={replacing ? `Replace ${replacing.name} at ${branch.name}` : `Assign a manager to ${branch.name}`}
        description="Promote someone already at the branch, or create a new manager account."
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="secondary" onClick={() => setCreating(true)} title={replacing ? "Create the account — it is appointed manager when saved" : undefined}>
              <UserPlus size={15} /> New manager account
            </Button>
            <Button
              disabled={!pick}
              onClick={() => {
                const p = staff.find((s) => s.id === pick);
                if (!p) return;
                demoteOld();
                editStaff(p.id, { role: MANAGER_ROLE, status: "Active" });
                showToast(`${p.name} is now the ${branch.name} branch manager`);
                onClose();
              }}
            >
              Appoint selected
            </Button>
          </>
        }
      >
        {candidates.length ? (
          <label className="field">
            Promote from {branch.name} staff
            <SelectMenu value={pick} ariaLabel="Staff member" className="select-btn" options={candidates.map((s) => ({ value: s.id, label: s.name, description: `${s.role} · ${s.status}` }))} onChange={(v: string) => setPick(v)} />
          </label>
        ) : (
          <p className="hint">No one else works at this branch yet — create a new manager account.</p>
        )}
        {replacing && (
          <label className="field" style={{ marginTop: 14 }}>
            {replacing.name} will
            <SelectMenu
              value={oldRole}
              ariaLabel="Former manager"
              className="select-btn"
              options={[
                { value: "Front Desk", label: "Stay as Front Desk", description: "Keeps working at the branch" },
                { value: "Left", label: "Leave the branch", description: "Marked as Left — records kept" },
              ]}
              onChange={(v: "Front Desk" | "Left") => setOldRole(v)}
            />
          </label>
        )}
      </Modal>
      {creating && (
        // Replacing: the account is created first (the branch still has its manager), then the swap happens —
        // so cancelling the form changes nothing.
        <AddStaffDialog
          open
          branchId={branch.id}
          presetRole={replacing ? FRONT_DESK_ROLE : MANAGER_ROLE}
          onClose={() => {
            setCreating(false);
            onClose();
          }}
          onCreated={(id) => {
            if (!replacing) return;
            demoteOld();
            editStaff(id, { role: MANAGER_ROLE, status: "Active" });
            showToast(`New account appointed as the ${branch.name} branch manager`);
          }}
        />
      )}
    </>
  );
}
