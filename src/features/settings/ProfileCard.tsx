/**
 * Profile card — every account has one (Company Admin, Branch Manager and every
 * branch staff member). Shows the person's photo (or initials), role, branch
 * and contact details; they can upload / replace / remove their photo and edit
 * their own details. Role and branch are set by whoever manages the account
 * (Company Admin or the Branch Manager), never by the person themselves.
 *
 * Staff details are saved on their staff record (the same one Staff Management
 * shows); accounts that are not staff records (the Company Admin, the
 * placeholder manager) keep their details in settingsStore. Photos are kept in
 * settingsStore for everyone.
 */
import { useRef, useState } from "react";
import { Building2, Camera, IdCard, Mail, MapPin, Pencil, Phone, ShieldCheck, Trash2, Upload, UserRound } from "lucide-react";
import { useApp } from "@/app/AppState";
import { NOT_ON_RECORD, getBranch, type AppUser } from "@/data/company";
import { logAudit } from "@/services/audit";
import { IMAGE_TYPES, MAX_IMAGE_MB, readImage, updateProfile } from "@/services/settingsStore";
import { NAME_INPUT_PROPS, nameChange } from "@/shared/nameCase";
import { Badge, Button } from "@/shared/ui/controls";
import { FieldError, fieldErrorProps, focusFirstError } from "@/shared/ui/FieldError";
import { Modal } from "@/shared/ui/Modal";
import { UserAvatar } from "@/shell/BrandLogo";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const PHONE_RE = /^\+?[\d\s()-]{7,20}$/;
const shown = (v?: string) => (v && v.trim() && v !== NOT_ON_RECORD ? v : "");

/* ─────────────── Image picker (photo or logo) ─────────────── */

export function ImagePicker({ value, onChange, label, max = 320, children }: { value: string; onChange: (dataUrl: string) => void; label: string; max?: number; children?: React.ReactNode }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="st-picker">
      <div className="st-picker-actions">
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => input.current?.click()}>
          <Upload size={15} /> {value ? `Replace ${label}` : `Upload ${label}`}
        </Button>
        {value && (
          <Button
            size="sm"
            variant="ghost"
            className="st-remove"
            onClick={() => {
              setError("");
              onChange("");
            }}
          >
            <Trash2 size={15} /> Remove
          </Button>
        )}
        {children}
      </div>
      <small className="st-picker-hint">PNG, JPG, WebP or SVG · up to {MAX_IMAGE_MB} MB · saved on this device</small>
      {error && <FieldError msg={error} />}
      <input
        ref={input}
        type="file"
        accept={IMAGE_TYPES.join(",")}
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true);
          setError("");
          try {
            onChange(await readImage(file, max));
          } catch (err) {
            setError(err instanceof Error ? err.message : "That image could not be used.");
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

/* ─────────────── Profile card ─────────────── */

export function ProfileCard({ user, managedBy }: { user: AppUser; managedBy: string }) {
  const { showToast } = useApp();
  const [editing, setEditing] = useState(false);
  const branch = user.branchId ? getBranch(user.branchId) : undefined;
  const setPhoto = (photo: string) => {
    updateProfile(user.key, { photo: photo || undefined });
    logAudit({ category: "Settings", action: photo ? (user.photo ? "Profile photo replaced" : "Profile photo added") : "Profile photo removed", record: `${user.name}${user.staffId ? ` (${user.staffId})` : ""}`, details: `${user.role} · own profile`, branchId: user.branchId ?? null });
    showToast(photo ? "Profile photo saved" : "Profile photo removed");
  };
  const rows: { icon: typeof Mail; label: string; value: string }[] = [
    { icon: Mail, label: "Email", value: shown(user.email) },
    { icon: Phone, label: "Phone", value: shown(user.phone) },
    { icon: MapPin, label: "Address", value: shown(user.address) },
  ];

  return (
    <div className="st-profile">
      <div className="st-profile-head">
        <div className="st-profile-photo">
          <UserAvatar name={user.name} photo={user.photo} className="st-avatar" />
          <span className="st-photo-badge" aria-hidden="true">
            <Camera size={14} />
          </span>
        </div>
        <div className="st-profile-id">
          <h4>{user.name}</h4>
          <div className="st-profile-tags">
            <Badge tone="brand">{user.role}</Badge>
            {branch ? (
              <span>
                <Building2 size={14} /> {branch.name} branch · {branch.code}
              </span>
            ) : (
              <span>
                <Building2 size={14} /> All branches
              </span>
            )}
            {user.staffId && (
              <span className="mono">
                <IdCard size={14} /> {user.staffId}
              </span>
            )}
          </div>
          <ImagePicker value={user.photo ?? ""} onChange={setPhoto} label="photo" />
        </div>
        <Button size="sm" onClick={() => setEditing(true)}>
          <Pencil size={15} /> Edit details
        </Button>
      </div>

      <dl className="st-details">
        <div>
          <dt>
            <UserRound size={15} /> Full name
          </dt>
          <dd>{user.name}</dd>
        </div>
        {rows.map((r) => (
          <div key={r.label}>
            <dt>
              <r.icon size={15} /> {r.label}
            </dt>
            <dd>{r.value || <span className="lg-muted">Not added yet</span>}</dd>
          </div>
        ))}
        <div>
          <dt>
            <ShieldCheck size={15} /> Role & branch
          </dt>
          <dd>
            {user.role}
            {branch ? ` · ${branch.name}` : " · company-wide"}
            <small>Set by {managedBy}</small>
          </dd>
        </div>
      </dl>

      <EditProfileDialog key={String(editing)} open={editing} user={user} onClose={() => setEditing(false)} />
    </div>
  );
}

/* ─────────────── Edit details ─────────────── */

function EditProfileDialog({ open, user, onClose }: { open: boolean; user: AppUser; onClose: () => void }) {
  const { editStaff, showToast } = useApp();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(shown(user.email));
  const [phone, setPhone] = useState(shown(user.phone));
  const [address, setAddress] = useState(shown(user.address));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = name.trim() !== user.name || email.trim() !== shown(user.email) || phone.trim() !== shown(user.phone) || address.trim() !== shown(user.address);

  const save = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Enter your full name.";
    else if (name.trim().split(/\s+/).length < 2) e.name = "Enter your first and last name.";
    if (email.trim() && !EMAIL_RE.test(email.trim())) e.email = "Enter a valid email address, e.g. name@example.com.";
    if (phone.trim() && !PHONE_RE.test(phone.trim())) e.phone = "Enter a valid phone number, e.g. 0803 123 4567.";
    setErrors(e);
    if (Object.keys(e).length) return focusFirstError();
    const patch = { name: name.trim(), email: email.trim(), phone: phone.trim(), address: address.trim() };
    if (user.staffId) editStaff(user.staffId, patch); // logs its own audit entry
    else {
      updateProfile(user.key, patch);
      const changes = [
        patch.name !== user.name && `Name: ${user.name} → ${patch.name}`,
        patch.email !== shown(user.email) && `Email: ${shown(user.email) || "—"} → ${patch.email || "—"}`,
        patch.phone !== shown(user.phone) && `Phone: ${shown(user.phone) || "—"} → ${patch.phone || "—"}`,
        patch.address !== shown(user.address) && "Address updated",
      ].filter(Boolean);
      logAudit({ category: "Settings", action: "Profile updated", record: patch.name, details: `${user.role} · ${changes.join(" · ")}`, branchId: user.branchId ?? null });
    }
    showToast("Profile updated");
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={UserRound}
      title="Edit my details"
      description="Your role and branch can only be changed by whoever manages your account."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!dirty} onClick={save}>
            Save details
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <label className={`field full ${fieldErrorProps(errors.name).className}`} {...dataErr(errors.name)}>
          Full name
          <input value={name} onChange={nameChange(setName)} {...NAME_INPUT_PROPS} placeholder="e.g. Amina Bello" />
          <FieldError msg={errors.name} />
        </label>
        <label className={`field ${fieldErrorProps(errors.email).className}`} {...dataErr(errors.email)}>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" autoComplete="email" />
          <FieldError msg={errors.email} />
        </label>
        <label className={`field ${fieldErrorProps(errors.phone).className}`} {...dataErr(errors.phone)}>
          Phone
          <input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0803 123 4567" autoComplete="tel" />
          <FieldError msg={errors.phone} />
        </label>
        <label className="field full">
          <span>
            Home address <small className="lg-muted st-optional">· optional</small>
          </span>
          <textarea value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, area, city" />
        </label>
      </div>
    </Modal>
  );
}

/** data-field-error / aria-invalid without the className (callers merge it). */
export function dataErr(msg?: string) {
  const { className: _c, ...rest } = fieldErrorProps(msg);
  void _c;
  return rest;
}
