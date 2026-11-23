/**
 * Settings → Staff Management: every staff account across all branches.
 * Filter by branch, role, status; change role, transfer between branches,
 * suspend / reactivate / mark as left, move to trash, and see each person's
 * assignment history. Transfers keep all their bills, approvals and audit
 * history. Roles: Branch Manager and Front Desk only (owner decision).
 */
import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, History, Plus, UserCog } from "lucide-react";
import { useApp } from "@/app/AppState";
import { getBranch } from "@/data/company";
import { FRONT_DESK_ROLE, MANAGER_ROLE, STAFF_STATUSES, managerOf, type StaffRecord, type StaffStatus } from "@/data/userRecords";
import { useAuditLog } from "@/services/audit";
import { useBranches } from "@/services/org";
import { resolvePhoto, useSettings } from "@/services/settingsStore";
import { formatCount } from "@/shared/format";
import { Badge, Button, EmptyState, SearchInput, SelectMenu } from "@/shared/ui/controls";
import { Modal } from "@/shared/ui/Modal";
import { UserAvatar } from "@/shell/BrandLogo";
import { AddStaffDialog } from "@/features/shared/createForms";
import { MoveToTrashDialog } from "@/features/admin/AdminLogs";
import { StaffProfile } from "@/features/staff/StaffWorkspace";
import { ConfirmDialog, NotConnected, Panel, dateTime, shortDate } from "./ui";

const STATUS_TONE: Record<StaffStatus, "ok" | "warn" | "danger" | "neutral"> = { Active: "ok", "On leave": "warn", Suspended: "danger", Left: "neutral" };

export function StaffSection({ action, onActionDone }: { action?: string | null; onActionDone: () => void }) {
  const { staff } = useApp();
  const branches = useBranches();
  const { profiles } = useSettings();
  const audit = useAuditLog();
  const [q, setQ] = useState("");
  const [branch, setBranch] = useState("all");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState<"all" | StaffStatus>("all");
  const [adding, setAdding] = useState(0);
  const [managing, setManaging] = useState<string | null>(null);
  useEffect(() => {
    if (action === "add") {
      setAdding((n) => n + 1);
      onActionDone();
    }
  }, [action, onActionDone]);

  const term = q.trim().toLowerCase();
  const rows = staff
    .filter((s) => (branch === "all" || s.branchId === branch) && (role === "all" || s.role === role) && (status === "all" || s.status === status) && (!term || `${s.name} ${s.id} ${s.email} ${s.phone} ${s.role}`.toLowerCase().includes(term)))
    .sort((a, b) => a.branchId.localeCompare(b.branchId) || Number(b.role === MANAGER_ROLE) - Number(a.role === MANAGER_ROLE) || a.name.localeCompare(b.name));
  const lastSeen = useMemo(() => new Map(staff.map((s) => [s.id, audit.find((e) => e.user === s.name)])), [staff, audit]);
  const open = managing ? staff.find((s) => s.id === managing) : undefined;

  return (
    <div className="sc-stack">
      <div className="sc-toolbar">
        <SearchInput placeholder="Search name, ID, email or phone" value={q} onChange={setQ} />
        <SelectMenu value={branch} ariaLabel="Branch" className="select-btn" options={[{ value: "all", label: "All branches" }, ...branches.map((b) => ({ value: b.id, label: `${b.name} branch`, description: b.status }))]} onChange={(v: string) => setBranch(v)} />
        <SelectMenu value={role} ariaLabel="Role" className="select-btn" options={[{ value: "all", label: "All roles" }, { value: MANAGER_ROLE, label: MANAGER_ROLE }, { value: FRONT_DESK_ROLE, label: FRONT_DESK_ROLE }]} onChange={(v: string) => setRole(v)} />
        <SelectMenu value={status} ariaLabel="Account status" className="select-btn" options={[{ value: "all", label: "Any status" }, ...STAFF_STATUSES.map((s) => ({ value: s, label: s }))]} onChange={(v: "all" | StaffStatus) => setStatus(v)} />
        <Button onClick={() => setAdding((n) => n + 1)}>
          <Plus size={16} /> Add staff
        </Button>
      </div>

      <div className="card bp-card rf-table-card">
        <div className="inv-table-tools">
          <span className="inv-count">
            {formatCount(rows.length)} of {formatCount(staff.length)} staff accounts · {formatCount(staff.filter((s) => s.status === "Active").length)} active
          </span>
        </div>
        <div className="table-wrap thin-scroll">
          <table className="bp-table rf-table sc-table" aria-label="Staff directory">
            <thead>
              <tr>
                <th>Staff member</th>
                <th>Contact</th>
                <th>Branch</th>
                <th>Role</th>
                <th>Account</th>
                <th>Employment</th>
                <th>Added</th>
                <th>Last activity</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <EmptyState title="No staff match these filters" />
                  </td>
                </tr>
              ) : (
                rows.map((s) => (
                  <tr key={s.id} className="pr-row" tabIndex={0} onClick={() => setManaging(s.id)} onKeyDown={(k) => (k.key === "Enter" || k.key === " ") && (k.preventDefault(), setManaging(s.id))}>
                    <td>
                      <div className="st-person">
                        <UserAvatar name={s.name} photo={resolvePhoto(profiles, s.id, s.photo)} />
                        <span>
                          <strong>{s.name}</strong>
                          <small className="ep-sub mono">{s.id}</small>
                        </span>
                      </div>
                    </td>
                    <td>
                      {s.phone || <span className="lg-muted">No phone</span>}
                      <small className="ep-sub">{s.email || "No email"}</small>
                    </td>
                    <td>{getBranch(s.branchId)?.name ?? s.branchId}</td>
                    <td>{s.role}</td>
                    <td>
                      <Badge tone={STATUS_TONE[s.status]} dot>
                        {s.status}
                      </Badge>
                    </td>
                    <td>
                      {s.employment}
                      <small className="ep-sub">Since {shortDate(s.startDate)}</small>
                    </td>
                    <td className="ep-nowrap">{shortDate(s.createdAt)}</td>
                    <td>{lastSeen.get(s.id) ? dateTime(lastSeen.get(s.id)!.at) : <span className="lg-muted">No activity yet</span>}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <NotConnected>Sign-in isn't connected yet, so there are no invitations or password resets: accounts are created directly and take effect immediately.</NotConnected>

      {adding > 0 && <AddStaffDialog key={adding} open onClose={() => setAdding(0)} branchId={branch === "all" ? null : branch} />}
      {open && <ManageStaff key={open.id} member={open} onClose={() => setManaging(null)} />}
    </div>
  );
}

function ManageStaff({ member, onClose }: { member: StaffRecord; onClose: () => void }) {
  const { staff, editStaff, moveStaffToTrash, showToast } = useApp();
  const branches = useBranches();
  const [profile, setProfile] = useState(false);
  const [trash, setTrash] = useState(false);
  const [pending, setPending] = useState<{ kind: "role" | "branch" | "status"; value: string } | null>(null);
  const currentManager = (branchId: string) => managerOf(staff, branchId);

  const confirmText = (() => {
    if (!pending) return null;
    if (pending.kind === "role") {
      const blocked = pending.value === MANAGER_ROLE && currentManager(member.branchId) && currentManager(member.branchId)!.id !== member.id;
      return {
        title: `Change ${member.name}'s role to ${pending.value}?`,
        description: blocked ? `${getBranch(member.branchId)?.name} already has a manager (${currentManager(member.branchId)!.name}). Use Branch Managers → Replace instead.` : "Their access changes to what this role allows (Roles & Permissions).",
        blocked,
      };
    }
    if (pending.kind === "branch") {
      const to = getBranch(pending.value);
      const blocked = member.role === MANAGER_ROLE && !!currentManager(pending.value);
      return {
        title: `Transfer ${member.name} to ${to?.name} branch?`,
        description: blocked ? `${to?.name} already has a manager. Make ${member.name} Front Desk first, or replace that manager.` : "Their bills, approvals and audit history stay exactly as they are — only future work happens at the new branch.",
        blocked,
      };
    }
    return { title: `Set ${member.name}'s account to ${pending.value}?`, description: pending.value === "Active" ? "Their account works again." : pending.value === "Left" ? "They no longer work for the company. The record and its history are kept." : "Their account stops working until reactivated.", blocked: false };
  })();

  return (
    <>
      <Modal
        open={!profile && !trash && !pending}
        onClose={onClose}
        icon={UserCog}
        wide
        title={member.name}
        description={`${member.role} · ${getBranch(member.branchId)?.name} branch · ${member.id}`}
        footer={
          <>
            <Button variant="secondary" className="st-trash" onClick={() => setTrash(true)}>
              Move to trash
            </Button>
            <span className="left" />
            <Button variant="secondary" onClick={() => setProfile(true)}>
              Open full profile
            </Button>
            <Button onClick={onClose}>Done</Button>
          </>
        }
      >
        <div className="sc-manage">
          <label className="field">
            Role
            <SelectMenu value={member.role} ariaLabel="Role" className="select-btn" options={[MANAGER_ROLE, FRONT_DESK_ROLE].map((r) => ({ value: r, label: r }))} onChange={(v: string) => v !== member.role && setPending({ kind: "role", value: v })} />
          </label>
          <label className="field">
            Branch
            <SelectMenu value={member.branchId} ariaLabel="Branch" className="select-btn" options={branches.map((b) => ({ value: b.id, label: `${b.name} branch`, description: b.status }))} onChange={(v: string) => v !== member.branchId && setPending({ kind: "branch", value: v })} />
          </label>
          <label className="field">
            Account status
            <SelectMenu value={member.status} ariaLabel="Account status" className="select-btn" options={STAFF_STATUSES.map((s) => ({ value: s, label: s }))} onChange={(v: string) => v !== member.status && setPending({ kind: "status", value: v })} />
          </label>
        </div>
        <Panel title="Assignment history" note="Transfers, role and status changes made in STANLEY.">
          {member.history?.length ? (
            <ol className="ex-history">
              {member.history.map((h, i) => (
                <li key={i}>
                  <b>
                    {h.action.startsWith("Transferred") ? <ArrowRightLeft size={13} /> : <History size={13} />} {h.action}
                  </b>
                  <small>
                    {h.by} · {dateTime(h.at)}
                  </small>
                </li>
              ))}
            </ol>
          ) : (
            <p className="an-none">No changes since the account was created ({shortDate(member.createdAt)}).</p>
          )}
        </Panel>
      </Modal>

      {profile && <StaffProfile member={member} onClose={() => setProfile(false)} />}
      <MoveToTrashDialog
        open={trash}
        name={member.name}
        what="staff record"
        onClose={() => setTrash(false)}
        onConfirm={(reason) => {
          moveStaffToTrash(member.id, reason);
          showToast(`${member.name} moved to trash`);
          setTrash(false);
          onClose();
        }}
      />
      {pending && confirmText && (
        <ConfirmDialog
          open
          title={confirmText.title}
          description={confirmText.description}
          confirmLabel={confirmText.blocked ? "Close" : "Confirm"}
          danger={!confirmText.blocked && (pending.value === "Suspended" || pending.value === "Left")}
          reason={!confirmText.blocked}
          onClose={() => setPending(null)}
          onConfirm={(reason) => {
            if (!confirmText.blocked) {
              if (pending.kind === "role") editStaff(member.id, { role: pending.value }, reason);
              if (pending.kind === "branch") editStaff(member.id, { branchId: pending.value }, reason);
              if (pending.kind === "status") editStaff(member.id, { status: pending.value as StaffStatus }, reason);
              showToast(`${member.name} updated`);
            }
            setPending(null);
          }}
        />
      )}
    </>
  );
}
