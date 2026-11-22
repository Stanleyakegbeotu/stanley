/**
 * Branch settings blocks, shared by the Company Admin (Settings → Branches)
 * and the Branch Manager (branch Settings):
 *
 *  • BranchProfileForm — the branch's contact details (printed on receipts and
 *    quotes) plus opening hours and a note for staff. Branch name, code and
 *    currency come from the company record and are read-only here.
 *  • BranchStaffControl — the manager's control of staff accounts in the
 *    branch: status (active / on leave / suspended / left), add staff, and the
 *    way into each full staff profile.
 */
import { useState } from "react";
import { ArrowRight, Crown, Plus, Users } from "lucide-react";
import { useApp } from "@/app/AppState";
import type { Branch } from "@/data/types";
import { STAFF_STATUSES, isManager, type StaffStatus } from "@/data/userRecords";
import { logAudit } from "@/services/audit";
import { updateBranchContact, useReceiptProfile } from "@/services/receiptProfile";
import { updateBranchProfile, useBranchProfile } from "@/services/settingsStore";
import { Badge, Button, EmptyState, SelectMenu } from "@/shared/ui/controls";
import { FieldError, fieldErrorProps, focusFirstError } from "@/shared/ui/FieldError";
import { UserAvatar } from "@/shell/BrandLogo";
import { useSettings } from "@/services/settingsStore";
import { AddStaffDialog } from "@/features/shared/createForms";
import { EMAIL_RE, PHONE_RE, dataErr } from "./ProfileCard";

const STATUS_TONE: Record<StaffStatus, "ok" | "warn" | "danger" | "neutral"> = { Active: "ok", "On leave": "warn", Suspended: "danger", Left: "neutral" };

export function BranchProfileForm({ branch, compact = false }: { branch: Branch; compact?: boolean }) {
  const { showToast } = useApp();
  const contact = useReceiptProfile().branches[branch.id] ?? { address: "", phone: "" };
  const extra = useBranchProfile(branch.id);
  const saved = { phone: contact.phone, address: contact.address, email: extra.email, hours: extra.hours, notes: extra.notes };
  const [form, setForm] = useState(saved);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const dirty = (Object.keys(form) as (keyof typeof form)[]).some((k) => form[k].trim() !== saved[k]);

  const save = () => {
    const e: Record<string, string> = {};
    if (form.phone.trim() && !PHONE_RE.test(form.phone.trim())) e.phone = "Enter a valid phone number, e.g. 0803 123 4567.";
    if (form.email.trim() && !EMAIL_RE.test(form.email.trim())) e.email = "Enter a valid email address, e.g. abuja@example.com.";
    setErrors(e);
    if (Object.keys(e).length) return focusFirstError();
    const clean = { phone: form.phone.trim(), address: form.address.trim(), email: form.email.trim(), hours: form.hours.trim(), notes: form.notes.trim() };
    updateBranchContact(branch.id, { phone: clean.phone, address: clean.address });
    updateBranchProfile(branch.id, { email: clean.email, hours: clean.hours, notes: clean.notes });
    const labels: Record<string, string> = { phone: "Phone", address: "Address", email: "Email", hours: "Opening hours", notes: "Note for staff" };
    const changed = (Object.keys(clean) as (keyof typeof clean)[]).filter((k) => clean[k] !== saved[k]).map((k) => labels[k]);
    logAudit({ category: "Settings", action: "Branch details updated", record: `${branch.name} branch (${branch.code})`, details: `Changed: ${changed.join(", ")}`, branchId: branch.id });
    setForm(clean);
    showToast(`${branch.name} branch details saved`);
  };

  return (
    <div className={`st-branch-form ${compact ? "is-compact" : ""}`}>
      <div className="st-readonly">
        <div>
          <span>Branch</span>
          <b>{branch.name}</b>
        </div>
        <div>
          <span>Code</span>
          <b className="mono">{branch.code}</b>
        </div>
        <div>
          <span>Location</span>
          <b>
            {branch.city}, {branch.country}
          </b>
        </div>
        <div>
          <span>Currency</span>
          <b>{branch.currency}</b>
        </div>
        <div>
          <span>Status</span>
          <b>
            <Badge tone={branch.status === "Active" ? "ok" : "neutral"} dot>
              {branch.status}
            </Badge>
          </b>
        </div>
      </div>
      <p className="hint st-readonly-note">Name, code and currency are set on the company record by the Company Admin.</p>
      <div className="form-grid">
        <label className={`field ${fieldErrorProps(errors.phone).className}`} {...dataErr(errors.phone)}>
          Branch phone
          <input type="tel" inputMode="tel" value={form.phone} onChange={set("phone")} placeholder="0803 123 4567" />
          <FieldError msg={errors.phone} />
        </label>
        <label className={`field ${fieldErrorProps(errors.email).className}`} {...dataErr(errors.email)}>
          Branch email
          <input type="email" value={form.email} onChange={set("email")} placeholder="abuja@example.com" />
          <FieldError msg={errors.email} />
        </label>
        <label className="field full">
          <span>
            Branch address <small className="lg-muted st-optional">· printed on receipts and quotes</small>
          </span>
          <textarea value={form.address} onChange={set("address")} placeholder="Street, area, city" />
        </label>
        <label className="field">
          Opening hours
          <input value={form.hours} onChange={set("hours")} placeholder="e.g. Mon–Sat 7:30am – 8:00pm" />
        </label>
        <label className="field">
          <span>
            Note for staff <small className="lg-muted st-optional">· optional</small>
          </span>
          <input value={form.notes} onChange={set("notes")} placeholder="e.g. Close the till by 8:15pm" />
        </label>
      </div>
      <div className="st-form-actions">
        {dirty && (
          <Button
            variant="secondary"
            onClick={() => {
              setForm(saved);
              setErrors({});
            }}
          >
            Discard changes
          </Button>
        )}
        <Button disabled={!dirty} onClick={save}>
          Save branch details
        </Button>
      </div>
    </div>
  );
}

export function BranchStaffControl({ branch }: { branch: Branch }) {
  const { staff, editStaff, user, navigate, showToast } = useApp();
  const { profiles } = useSettings();
  const [adding, setAdding] = useState(0);
  const people = staff.filter((s) => s.branchId === branch.id).sort((a, b) => Number(isManager(b)) - Number(isManager(a)) || a.name.localeCompare(b.name));
  const counts = STAFF_STATUSES.map((st) => ({ st, n: people.filter((p) => p.status === st).length })).filter((c) => c.n);

  return (
    <>
      <div className="st-staff-head">
        <div className="st-staff-counts">
          <span>
            <Users size={15} /> {people.length} staff account{people.length === 1 ? "" : "s"}
          </span>
          {counts.map((c) => (
            <Badge key={c.st} tone={STATUS_TONE[c.st]} dot>
              {c.n} {c.st.toLowerCase()}
            </Badge>
          ))}
        </div>
        <div className="st-staff-actions">
          <Button size="sm" variant="secondary" onClick={() => navigate(`/branch/${branch.id}/staff`)}>
            Staff Management <ArrowRight size={15} />
          </Button>
          <Button size="sm" onClick={() => setAdding((n) => n + 1)}>
            <Plus size={15} /> Add staff
          </Button>
        </div>
      </div>

      {people.length === 0 ? (
        <EmptyState title="No staff accounts yet">Add the branch's staff here or in Staff Management. Every account gets its own profile and settings.</EmptyState>
      ) : (
        <div className="card bp-card rf-table-card st-staff-table">
          <div className="table-wrap thin-scroll">
            <table className="bp-table rf-table" aria-label={`${branch.name} staff accounts`}>
              <thead>
                <tr>
                  <th>Staff member</th>
                  <th>Role</th>
                  <th>Contact</th>
                  <th>Account status</th>
                </tr>
              </thead>
              <tbody>
                {people.map((s) => {
                  const self = s.id === user.staffId;
                  return (
                    <tr key={s.id}>
                      <td>
                        <div className="st-person">
                          <UserAvatar name={s.name} photo={profiles[s.id]?.photo} />
                          <span>
                            <strong>
                              {s.name} {self && <Badge tone="brand">You</Badge>}
                            </strong>
                            <small className="ep-sub mono">{s.id}</small>
                          </span>
                        </div>
                      </td>
                      <td>
                        {isManager(s) && <Crown size={14} className="st-crown" aria-label="Branch head" />} {s.role}
                      </td>
                      <td>
                        {s.phone || <span className="lg-muted">No phone</span>}
                        <small className="ep-sub">{s.email || "No email"}</small>
                      </td>
                      <td>
                        {self || isManager(s) ? (
                          <span title="The branch manager's account is managed by the Company Admin">
                            <Badge tone={STATUS_TONE[s.status]} dot>
                              {s.status}
                            </Badge>
                          </span>
                        ) : (
                          <SelectMenu
                            value={s.status}
                            ariaLabel={`Account status for ${s.name}`}
                            className="select-btn st-status"
                            options={STAFF_STATUSES.map((st) => ({ value: st, label: st }))}
                            onChange={(v: StaffStatus) => {
                              if (v === s.status) return;
                              editStaff(s.id, { status: v });
                              showToast(`${s.name}: ${v}`);
                            }}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="hint st-foot">Suspended or left staff can't be chosen as the signed-in account. Roles, employment details and removal are in each person's profile in Staff Management.</p>
      {adding > 0 && <AddStaffDialog key={adding} open onClose={() => setAdding(0)} branchId={branch.id} />}
    </>
  );
}
