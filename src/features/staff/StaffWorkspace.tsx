/**
 * Staff of one branch (Company Admin).
 *
 *  • The branch manager heads every staff member in the branch (one manager
 *    per branch), shown first.
 *  • Staff cards below — everyone reports to the manager. Selecting a card (or
 *    the manager) opens the profile pop-up: a theme side panel with contact and
 *    employment details, and Overview / Access & permissions / Edit tabs.
 *
 * No staff records were in the legacy export, so people are added here (they
 * last for the session until the database is connected). Nothing is invented.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { BadgeCheck, Briefcase, CalendarDays, Crown, KeyRound, Mail, MapPin, Pencil, Phone, Plus, ShieldCheck, Trash2, UserRound, UserRoundCog, Users, X } from "lucide-react";
import { useApp } from "@/app/AppState";
import { getBranch } from "@/data/company";
import { EMPLOYMENT_TYPES, MANAGER_ROLE, STAFF_ROLES, STAFF_STATUSES, isManager, managerOf, type StaffRecord, type StaffStatus } from "@/data/userRecords";
import { Reveal, useMotionPreset } from "@/shared/motion";
import { formatCount } from "@/shared/format";
import { Badge, Button, EmptyState, SearchInput, Segmented, SelectMenu } from "@/shared/ui/controls";
import { SummaryChips } from "@/features/dashboard/ExpensesPatients";
import { FieldError, focusFirstError } from "@/shared/ui/FieldError";
import { NAME_INPUT_PROPS, nameChange } from "@/shared/nameCase";
import { MoveToTrashDialog } from "@/features/admin/AdminLogs";

export const staffInitials = (name: string) =>
  name
    .replace(/[^A-Za-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "?";

const STATUS_TONE: Record<StaffStatus, "ok" | "warn" | "danger" | "neutral"> = { Active: "ok", "On leave": "warn", Suspended: "danger", Left: "neutral" };
const longDate = (iso: string) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "—");
function tenure(iso: string): string {
  if (!iso) return "—";
  const start = new Date(`${iso}T00:00:00`);
  const now = new Date();
  if (start > now) return `Starts ${longDate(iso)}`;
  const months = (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth() - (now.getDate() < start.getDate() ? 1 : 0);
  if (months < 1) return "Less than a month";
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y ? `${y} year${y === 1 ? "" : "s"}` : "", m ? `${m} month${m === 1 ? "" : "s"}` : ""].filter(Boolean).join(" ");
}

/* ─────────────── Branch view ─────────────── */

export function StaffBranchView({ branchId, onAdd }: { branchId: string; onAdd: (role?: string) => void }) {
  const { staff } = useApp();
  const m = useMotionPreset();
  const branch = getBranch(branchId);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState<"all" | StaffStatus>("all");
  const [viewing, setViewing] = useState<string | null>(null);

  const people = staff.filter((s) => s.branchId === branchId);
  const manager = managerOf(staff, branchId);
  const team = people.filter((s) => s.id !== manager?.id);
  const current = people.filter((s) => s.status !== "Left");
  const term = q.trim().toLowerCase();
  const shown = team.filter((s) => (role === "all" || s.role === role) && (status === "all" || s.status === status) && (!term || `${s.name} ${s.role} ${s.phone} ${s.email} ${s.id}`.toLowerCase().includes(term)));
  const open = viewing ? staff.find((s) => s.id === viewing) : undefined;

  return (
    <div className="inv staff">
      <SummaryChips
        items={[
          { label: "Branch manager", icon: Crown, value: manager ? manager.name : "Not assigned", caption: manager ? `${manager.status} · since ${longDate(manager.startDate)}` : "Add the head of this branch" },
          { label: "Staff", icon: Users, value: formatCount(current.length), caption: `${formatCount(current.filter((s) => !isManager(s)).length)} report to the manager` },
          { label: "Active", icon: BadgeCheck, value: formatCount(people.filter((s) => s.status === "Active").length), caption: "Working now" },
          { label: "Away", icon: CalendarDays, value: formatCount(people.filter((s) => s.status === "On leave" || s.status === "Suspended").length), caption: `${formatCount(people.filter((s) => s.status === "On leave").length)} on leave · ${formatCount(people.filter((s) => s.status === "Suspended").length)} suspended` },
        ]}
      />

      {/* Manager */}
      <section className="inv-section">
        <header className="inv-section-head">
          <h3>Branch manager</h3>
          <span>Head of every staff member at {branch?.name}</span>
        </header>
        {manager ? (
          <motion.button type="button" className="card st-mgr" onClick={() => setViewing(manager.id)} whileHover={m.cardHover} aria-label={`${manager.name}, branch manager — open profile`}>
            <span className="st-mgr-avatar" aria-hidden="true">
              {staffInitials(manager.name)}
              <i>
                <Crown size={13} />
              </i>
            </span>
            <span className="st-mgr-main">
              <span className="st-mgr-role">Branch manager · {manager.id}</span>
              <strong>{manager.name}</strong>
              <span className="st-mgr-meta">
                <Badge tone={STATUS_TONE[manager.status]} dot>
                  {manager.status}
                </Badge>
                <span>
                  <Users size={14} /> Leads {formatCount(team.filter((s) => s.status !== "Left").length)} staff
                </span>
                <span>
                  <CalendarDays size={14} /> {tenure(manager.startDate)}
                </span>
              </span>
            </span>
            <span className="st-mgr-contact">
              <span>
                <Phone size={14} /> {manager.phone || "No phone"}
              </span>
              <span>
                <Mail size={14} /> {manager.email || "No email"}
              </span>
              <em>View profile →</em>
            </span>
          </motion.button>
        ) : (
          <div className="card st-mgr is-empty">
            <span className="st-mgr-avatar" aria-hidden="true">
              <UserRoundCog size={26} />
            </span>
            <span className="st-mgr-main">
              <strong>No branch manager yet</strong>
              <span className="st-mgr-hint">Every branch has one manager who heads all its staff. Add them first, then the rest of the team.</span>
            </span>
            <Button onClick={() => onAdd(MANAGER_ROLE)}>
              <Plus size={16} /> Add branch manager
            </Button>
          </div>
        )}
      </section>

      {/* Staff */}
      <section className="inv-section">
        <header className="inv-section-head">
          <h3>Staff</h3>
          <span>
            {formatCount(team.length)} staff member{team.length === 1 ? "" : "s"}
            {manager ? ` · all report to ${manager.name}` : ""}
          </span>
        </header>
        {team.length > 0 && (
          <div className="inv-toolbar">
            <SearchInput placeholder="Search name, role, phone or email" value={q} onChange={setQ} />
            <SelectMenu value={role} ariaLabel="Role" className="select-btn inv-sort" options={[{ value: "all", label: "All roles" }, ...STAFF_ROLES.filter((r) => r.value !== MANAGER_ROLE).map((r) => ({ value: r.value, label: r.value }))]} onChange={(v: string) => setRole(v)} />
            <Segmented label="Status" value={status} onChange={(v) => setStatus(v)} options={[{ value: "all", label: "All" }, ...STAFF_STATUSES.map((s) => ({ value: s, label: s }))]} />
          </div>
        )}
        {team.length === 0 ? (
          <div className="card st-empty">
            <EmptyState title="No staff added yet">Staff records were not part of the legacy export. Add each person once — front desk, laboratory, imaging and accounts.</EmptyState>
            <Button onClick={() => onAdd()}>
              <Plus size={16} /> Add staff member
            </Button>
          </div>
        ) : shown.length === 0 ? (
          <div className="card st-empty">
            <EmptyState title="No staff match these filters" />
          </div>
        ) : (
          <Reveal mode="stagger" className="st-grid">
            {shown.map((s) => (
              <motion.button key={s.id} type="button" className={`card st-card ${s.status === "Left" ? "is-left" : ""}`} variants={m.revealItem} whileHover={m.cardHover} onClick={() => setViewing(s.id)} aria-label={`${s.name}, ${s.role} — open profile`}>
                <span className="st-card-top">
                  <span className="st-avatar" aria-hidden="true">
                    {staffInitials(s.name)}
                  </span>
                  <span className="st-card-name">
                    <strong>{s.name}</strong>
                    <small>{s.role}</small>
                  </span>
                  <Badge tone={STATUS_TONE[s.status]} dot>
                    {s.status}
                  </Badge>
                </span>
                <span className="st-card-rows">
                  <span>
                    <Phone size={14} /> {s.phone || "No phone"}
                  </span>
                  <span>
                    <Mail size={14} /> {s.email || "No email"}
                  </span>
                  <span>
                    <Briefcase size={14} /> {s.employment} · {tenure(s.startDate)}
                  </span>
                </span>
                <span className="st-card-foot">
                  <span>Reports to {manager ? manager.name : "the branch manager (not assigned)"}</span>
                  <em>Profile →</em>
                </span>
              </motion.button>
            ))}
          </Reveal>
        )}
      </section>

      {open && <StaffProfile key={open.id} member={open} onClose={() => setViewing(null)} />}
    </div>
  );
}

/* ─────────────── Profile pop-up ─────────────── */

type Tab = "overview" | "access" | "edit";

export function StaffProfile({ member, onClose }: { member: StaffRecord; onClose: () => void }) {
  const { staff, moveStaffToTrash, showToast } = useApp();
  const [trashOpen, setTrashOpen] = useState(false);
  const m = useMotionPreset();
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const branch = getBranch(member.branchId);
  const mgr = isManager(member);
  const manager = managerOf(staff, member.branchId);
  const team = staff.filter((s) => s.branchId === member.branchId && s.id !== member.id && s.status !== "Left");
  const roleDef = STAFF_ROLES.find((r) => r.value === member.role);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const layers = document.querySelectorAll(".modal-layer");
      if (e.key === "Escape" && layers[layers.length - 1] === box.current?.parentElement) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const nav: { id: Tab; label: string; icon: typeof UserRound; note: string }[] = [
    { id: "overview", label: "Overview", icon: UserRound, note: mgr ? `Heads ${formatCount(team.length)} staff` : "Details & team" },
    { id: "access", label: "Access & permissions", icon: KeyRound, note: "Decided by the role" },
    { id: "edit", label: "Edit profile", icon: Pencil, note: "Details, role & status" },
  ];

  return createPortal(
    <AnimatePresence>
      <motion.div key="staff-profile" className="modal-layer fd-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <motion.div ref={box} className="fd ap st-profile" role="dialog" aria-modal="true" aria-labelledby={titleId} initial={m.modal.initial} animate={m.modal.animate} exit={m.modal.exit}>
          <aside className="fd-side ap-side">
            <div className="ap-id">
              <span className="ap-avatar" aria-hidden="true">
                {staffInitials(member.name)}
              </span>
              <strong>{member.name}</strong>
              <small>
                {member.role} · {member.id}
              </small>
              <span className="ap-badges">
                {mgr && <em>Head of branch</em>}
                <em>{member.status}</em>
              </span>
            </div>

            <ol className="fd-steps ap-nav" aria-label="Profile sections">
              {nav.map((n) => (
                <li key={n.id} className={tab === n.id ? "is-current" : ""}>
                  <button type="button" onClick={() => setTab(n.id)} aria-current={tab === n.id ? "page" : undefined}>
                    <span className="fd-step-dot" aria-hidden="true">
                      <n.icon size={16} />
                    </span>
                    <span className="fd-step-label">
                      {n.label}
                      <small>{n.note}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ol>

            <div className="fd-aside">
              <div className="fd-preview">
                <span className="fd-preview-title">Contact</span>
                <div className="fd-preview-row">
                  <span>Phone</span>
                  <code>{member.phone || "Not on record"}</code>
                </div>
                <div className="fd-preview-row">
                  <span>Email</span>
                  <code>{member.email || "Not on record"}</code>
                </div>
                <div className="fd-preview-row">
                  <span>Address</span>
                  <code>{member.address || "Not on record"}</code>
                </div>
              </div>
              <div className="fd-preview">
                <span className="fd-preview-title">Employment</span>
                <div className="fd-preview-row">
                  <span>Branch</span>
                  <code>
                    {branch?.name} · {branch?.code}
                  </code>
                </div>
                <div className="fd-preview-row">
                  <span>Type</span>
                  <code>{member.employment}</code>
                </div>
                <div className="fd-preview-row">
                  <span>Started</span>
                  <code>{longDate(member.startDate)}</code>
                </div>
                <div className="fd-preview-row">
                  <span>{mgr ? "Leads" : "Reports to"}</span>
                  <code>{mgr ? `${formatCount(team.length)} staff` : (manager?.name ?? "No manager yet")}</code>
                </div>
              </div>
            </div>
          </aside>

          <section className="fd-main">
            <header className="fd-head">
              <div>
                <span className="fd-eyebrow">
                  Staff profile · {branch?.name} branch
                </span>
                <h2 id={titleId}>{tab === "edit" ? `Edit ${member.name}` : tab === "access" ? "Access & permissions" : member.name}</h2>
                <p>{tab === "edit" ? "Update details, role, employment or status. Changes last for this session until the database is connected." : tab === "access" ? `What a ${member.role} can do in STANLEY. Access follows the role.` : mgr ? "Head of this branch — every staff member reports to them." : `${member.role} at ${branch?.name} · reports to ${manager?.name ?? "the branch manager"}.`}</p>
              </div>
              <button type="button" className="fd-close" onClick={onClose} aria-label="Close profile" data-close>
                <X size={20} />
              </button>
            </header>

            <div className="fd-body thin-scroll">
              {tab === "overview" && (
                <>
                  <section className="fd-section">
                    <h3 className="fd-section-title">
                      <span>At a glance</span>
                    </h3>
                    <SummaryChips
                      items={[
                        { label: "Role", icon: Briefcase, value: member.role, caption: roleDef?.access ?? "" },
                        { label: "Status", icon: BadgeCheck, value: member.status, caption: member.updatedAt ? `Updated ${new Date(member.updatedAt).toLocaleDateString("en-GB")}` : `Added ${new Date(member.createdAt).toLocaleDateString("en-GB")}` },
                        { label: "With the company", icon: CalendarDays, value: tenure(member.startDate), caption: `Since ${longDate(member.startDate)}` },
                        { label: mgr ? "Team" : "Reports to", icon: Users, value: mgr ? `${formatCount(team.length)} staff` : (manager?.name ?? "Not assigned"), caption: mgr ? "Everyone at the branch" : "Branch manager" },
                      ]}
                    />
                  </section>
                  {mgr && (
                    <section className="fd-section">
                      <h3 className="fd-section-title">
                        <span>Team</span>
                      </h3>
                      {team.length ? (
                        <ul className="st-team">
                          {team.map((s) => (
                            <li key={s.id}>
                              <span className="st-avatar sm" aria-hidden="true">
                                {staffInitials(s.name)}
                              </span>
                              <span>
                                <b>{s.name}</b>
                                <small>{s.role}</small>
                              </span>
                              <Badge tone={STATUS_TONE[s.status]} dot>
                                {s.status}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="fd-note">No staff added yet. Staff you add to this branch report to {member.name}.</p>
                      )}
                    </section>
                  )}
                  <section className="fd-section">
                    <h3 className="fd-section-title">
                      <span>Activity</span>
                    </h3>
                    <p className="fd-note">Patients registered, bills and payments this person records will appear here once staff sign-in is connected. Until then, visits show the role that processed them.</p>
                    {member.notes && <p className="fd-note">Notes: {member.notes}</p>}
                  </section>
                </>
              )}

              {tab === "access" && (
                <section className="fd-section">
                  <h3 className="fd-section-title">
                    <span>{member.role}</span>
                  </h3>
                  <ul className="st-perms">
                    {(roleDef?.permissions ?? []).map((p) => (
                      <li key={p}>
                        <ShieldCheck size={16} /> {p}
                      </li>
                    ))}
                  </ul>
                  <p className="fd-note">To change what this person can do, change their role under Edit profile. {mgr ? "As branch manager they can also manage the staff of this branch." : ""}</p>
                  {member.status !== "Active" && <p className="fd-note ap-error">While {member.status.toLowerCase()}, this person cannot sign in.</p>}
                </section>
              )}

              {tab === "edit" && <StaffEditForm member={member} onSaved={() => setTab("overview")} />}
            </div>

            <footer className="fd-foot">
              <span className="left">
                <MapPin size={14} /> {branch?.name} branch · {member.id}
              </span>
              <Button variant="ghost" className="st-trash" onClick={() => setTrashOpen(true)}>
                <Trash2 size={15} /> Move to trash
              </Button>
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
              {tab !== "edit" && (
                <Button onClick={() => setTab("edit")}>
                  <Pencil size={16} /> Edit profile
                </Button>
              )}
            </footer>
          </section>
        </motion.div>
      </motion.div>
      <MoveToTrashDialog
        open={trashOpen}
        name={member.name}
        what={`staff record${mgr ? " (the branch will have no manager until you add one)" : ""}`}
        onClose={() => setTrashOpen(false)}
        onConfirm={(reason) => {
          moveStaffToTrash(member.id, reason);
          showToast(`${member.name} moved to trash — restore it from Trash within 30 days`);
          setTrashOpen(false);
          onClose();
        }}
      />
    </AnimatePresence>,
    document.body,
  );
}

/* ─────────────── Edit form ─────────────── */

function StaffEditForm({ member, onSaved }: { member: StaffRecord; onSaved: () => void }) {
  const { staff, editStaff, showToast } = useApp();
  const [name, setName] = useState(member.name);
  const [phone, setPhone] = useState(member.phone);
  const [email, setEmail] = useState(member.email);
  const [address, setAddress] = useState(member.address ?? "");
  const [role, setRole] = useState(member.role);
  const [employment, setEmployment] = useState(member.employment);
  const [startDate, setStartDate] = useState(member.startDate);
  const [status, setStatus] = useState<StaffStatus>(member.status);
  const [notes, setNotes] = useState(member.notes ?? "");
  const otherManager = useMemo(() => staff.find((s) => s.branchId === member.branchId && s.id !== member.id && isManager(s) && s.status !== "Left"), [staff, member]);

  const emailOk = !email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  // Field errors — shown on each field after a blocked Save (owner rule), then updated live.
  const fieldErr: Record<"name" | "contact" | "startDate" | "role", string | null> = {
    name: !name.trim() ? "Enter the full name." : null,
    contact: !phone.trim() && !email.trim() ? "Give at least a phone number or an email address." : !emailOk ? "Check the email address, e.g. name@company.com." : null,
    startDate: !startDate ? "Choose the start date." : null,
    role: role === MANAGER_ROLE && otherManager ? `${otherManager.name} is already the branch manager. Change their role first.` : null,
  };
  const error = Object.values(fieldErr).some(Boolean);
  const [tried, setTried] = useState(false);
  const show = (k: keyof typeof fieldErr) => (tried ? fieldErr[k] : null);
  const fieldCls = (base: string, k: keyof typeof fieldErr) => ({ className: `${base} ${show(k) ? "is-error" : ""}`, "data-field-error": show(k) ? true : undefined });
  const patch = { name: name.trim(), phone: phone.trim(), email: email.trim(), address: address.trim() || undefined, role, employment, startDate, status, notes: notes.trim() || undefined };
  const changed = (Object.keys(patch) as (keyof typeof patch)[]).some((k) => (patch[k] ?? "") !== (member[k] ?? ""));

  return (
    <>
      <section className="fd-section">
        <h3 className="fd-section-title">
          <span>Personal details</span>
        </h3>
        <div className="fd-grid">
          <label {...fieldCls("fd-field full", "name")}>
            <span className="fd-label">
              Full name <em aria-hidden="true">*</em>
            </span>
            <input value={name} {...NAME_INPUT_PROPS} onChange={nameChange(setName)} />
            <FieldError msg={show("name")} />
          </label>
          <label className="fd-field">
            <span className="fd-label">Phone number</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="+234 …" />
          </label>
          <label {...fieldCls("fd-field", "contact")}>
            <span className="fd-label">Email address</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
            <FieldError msg={show("contact")} />
          </label>
          <label className="fd-field full">
            <span className="fd-label">
              Home address <i>Optional</i>
            </span>
            <input value={address} onChange={(e) => setAddress(e.target.value)} />
          </label>
        </div>
      </section>

      <section className="fd-section">
        <h3 className="fd-section-title">
          <span>Role</span>
        </h3>
        <div className="fd-tiles" role="group" aria-label="Role">
          {STAFF_ROLES.map((r) => {
            const blocked = r.value === MANAGER_ROLE && !!otherManager;
            return (
              <button key={r.value} type="button" className="fd-tile" aria-pressed={role === r.value} disabled={blocked} onClick={() => setRole(r.value)}>
                <strong>{r.value}</strong>
                <small>{blocked ? `${otherManager?.name} is the manager` : r.access}</small>
              </button>
            );
          })}
        </div>
        {show("role") && (
          <div {...fieldCls("fd-field", "role")}>
            <FieldError msg={show("role")} />
          </div>
        )}
      </section>

      <section className="fd-section">
        <h3 className="fd-section-title">
          <span>Employment & status</span>
        </h3>
        <div className="fd-grid">
          <div className="fd-field">
            <span className="fd-label">Employment type</span>
            <SelectMenu value={employment} ariaLabel="Employment type" options={EMPLOYMENT_TYPES.map((v) => ({ value: v, label: v }))} onChange={(v: string) => setEmployment(v)} />
          </div>
          <label {...fieldCls("fd-field", "startDate")}>
            <span className="fd-label">
              Start date <em aria-hidden="true">*</em>
            </span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <FieldError msg={show("startDate")} />
          </label>
          <div className="fd-field full">
            <span className="fd-label">Status</span>
            <div className="rate-chips" role="radiogroup" aria-label="Status">
              {STAFF_STATUSES.map((s) => (
                <button key={s} type="button" role="radio" aria-checked={status === s} className={status === s ? "is-on" : ""} onClick={() => setStatus(s)}>
                  {s}
                </button>
              ))}
            </div>
            <small className="fd-hint">“Left” keeps the record for history but removes them from the active team.</small>
          </div>
          <label className="fd-field full">
            <span className="fd-label">
              Notes <i>Optional</i>
            </span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. covers weekends" />
          </label>
        </div>
      </section>

      <div className="ap-save">
        <Button
          disabled={!changed}
          onClick={() => {
            if (error) {
              setTried(true);
              focusFirstError();
              return;
            }
            editStaff(member.id, patch);
            showToast(`${patch.name} updated`);
            onSaved();
          }}
        >
          Save changes
        </Button>
      </div>
    </>
  );
}
