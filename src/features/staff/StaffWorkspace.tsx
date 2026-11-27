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
 *
 * Staff records (owner, 2026-11-26): everyone who works at the branch is on
 * record, not only the people who use STANLEY (Branch Manager, Front Desk).
 * Radiographers, lab scientists, security, cleaners … are "records only":
 * they never sign in. The Company Admin and the Branch Manager keep each
 * person's job, salary (allowances and deductions) and bank details, see them
 * on the profile's Pay & bank tab, download the list, and make the salary
 * report in Analysis.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { BadgeCheck, Briefcase, CalendarDays, Crown, Download, FileWarning, KeyRound, Landmark, Mail, MapPin, Pencil, Phone, Plus, ShieldCheck, Trash2, UserRound, UserRoundCog, Users, Wallet, X } from "lucide-react";
import { useApp } from "@/app/AppState";
import { getBranch } from "@/data/company";
import { DEPARTMENTS, EMPLOYMENT_TYPES, MANAGER_ROLE, RECORD_ROLES, STAFF_ROLES, STAFF_STATUSES, isManager, managerOf, netPay, usesApp, type StaffRecord, type StaffStatus } from "@/data/userRecords";
import { formatMoney } from "@/shared/format";
import { Reveal, useMotionPreset } from "@/shared/motion";
import { formatCount } from "@/shared/format";
import { Badge, Button, EmptyState, SearchInput, Segmented, SelectMenu } from "@/shared/ui/controls";
import { SummaryChips } from "@/features/dashboard/ExpensesPatients";
import { FieldError, focusFirstError } from "@/shared/ui/FieldError";
import { NAME_INPUT_PROPS, nameChange } from "@/shared/nameCase";
import { MoveToTrashDialog } from "@/features/admin/AdminLogs";
import { resolvePhoto, useSettings } from "@/services/settingsStore";
import { staffKey, useAccountAccess } from "@/services/accountAccess";
import { queriesOf, useStaffQueries } from "@/services/staffQueries";
import { AccountAccessPanel, QueriesPanel } from "./StaffQueries";
import { ReportBuilder } from "@/features/reports/ReportBuilder";
import { reportById } from "@/features/reports/specs";

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

/** The person's photo (their upload, else their default photo) or their initials. */
function StaffFace({ s }: { s: StaffRecord }) {
  const { profiles } = useSettings();
  const photo = resolvePhoto(profiles, s.id, s.photo);
  return photo ? <img className="st-face" src={photo} alt="" /> : <>{staffInitials(s.name)}</>;
}

/* ─────────────── Branch view ─────────────── */

/** Can this person see salaries and bank details? (Company Admin and Branch Manager.) */
export const useSeesPay = () => {
  const { user } = useApp();
  return user.kind === "admin" || user.kind === "manager";
};
const money = (n: number) => formatMoney(n, "NGN");

export function StaffBranchView({ branchId, onAdd }: { branchId: string; onAdd: (role?: string) => void }) {
  const access = useAccountAccess();
  const queries = useStaffQueries();
  const { staff } = useApp();
  const seesPay = useSeesPay();
  const [who, setWho] = useState<"all" | "app" | "records">("all");
  const m = useMotionPreset();
  const branch = getBranch(branchId);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState<"all" | StaffStatus>("all");
  const [viewing, setViewing] = useState<string | null>(null);
  const [staffReportOpen, setStaffReportOpen] = useState(false);

  const people = staff.filter((s) => s.branchId === branchId);
  const manager = managerOf(staff, branchId);
  const team = people.filter((s) => s.id !== manager?.id);
  const current = people.filter((s) => s.status !== "Left");
  const term = q.trim().toLowerCase();
  const shown = team.filter((s) => (who === "all" || (who === "app") === usesApp(s)) && (role === "all" || s.role === role) && (status === "all" || s.status === status) && (!term || `${s.name} ${s.role} ${s.department ?? ""} ${s.phone} ${s.email} ${s.id}`.toLowerCase().includes(term)));
  const roles = [...new Set(team.map((s) => s.role))].sort();
  const payroll = current.reduce((n, s) => n + netPay(s.pay), 0);
  const open = viewing ? staff.find((s) => s.id === viewing) : undefined;

  return (
    <div className="inv staff">
      <SummaryChips
        items={[
          { label: "Branch manager", icon: Crown, value: manager ? manager.name : "Not assigned", caption: manager ? `${manager.status} · since ${longDate(manager.startDate)}` : "Add the head of this branch" },
          { label: "Staff", icon: Users, value: formatCount(current.length), caption: `${formatCount(current.filter(usesApp).length)} use STANLEY · ${formatCount(current.filter((s) => !usesApp(s)).length)} records only` },
          { label: "Active", icon: BadgeCheck, value: formatCount(people.filter((s) => s.status === "Active").length), caption: `${formatCount(people.filter((s) => s.status === "On leave").length)} on leave · ${formatCount(people.filter((s) => s.status === "Suspended").length)} suspended` },
          seesPay
            ? { label: "Monthly payroll", icon: Wallet, value: money(payroll), caption: `Net pay of ${formatCount(current.filter((s) => s.pay).length)} staff on record` }
            : { label: "Away", icon: CalendarDays, value: formatCount(people.filter((s) => s.status === "On leave" || s.status === "Suspended").length), caption: "On leave or suspended" },
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
              <StaffFace s={manager} />
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
        <header className="inv-section-head st-head">
          <span>
            <h3>Staff</h3>
            <span>
              {formatCount(team.length)} staff member{team.length === 1 ? "" : "s"}
              {manager ? ` · all report to ${manager.name}` : ""}
            </span>
          </span>
          <span className="st-head-actions">
            <Button variant="secondary" onClick={() => setStaffReportOpen(true)}>
              <Download size={15} /> Download staff list
            </Button>
            <Button onClick={() => onAdd()}>
              <Plus size={15} /> Add a user
            </Button>
          </span>
        </header>
        {team.length > 0 && (
          <div className="inv-toolbar">
            <SearchInput placeholder="Search name, role, department, phone or email" value={q} onChange={setQ} />
            <Segmented
              label="Who"
              value={who}
              onChange={(v) => setWho(v)}
              options={[
                { value: "all", label: "Everyone" },
                { value: "app", label: "Uses STANLEY" },
                { value: "records", label: "Records only" },
              ]}
            />
            <SelectMenu value={role} ariaLabel="Role" className="select-btn inv-sort" options={[{ value: "all", label: "All roles" }, ...roles.map((r) => ({ value: r, label: r }))]} onChange={(v: string) => setRole(v)} />
            <Segmented label="Status" value={status} onChange={(v) => setStatus(v)} options={[{ value: "all", label: "All" }, ...STAFF_STATUSES.map((s) => ({ value: s, label: s }))]} />
          </div>
        )}
        {team.length === 0 ? (
          <div className="card st-empty">
            <EmptyState title="No staff added yet">Add the front-desk attendants who use STANLEY, and a record for everyone else who works here (radiographers, lab scientists, security …), with their salary and bank details.</EmptyState>
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
                    <StaffFace s={s} />
                  </span>
                  <span className="st-card-name">
                    <strong>{s.name}</strong>
                    <small>
                      {s.role}
                      {s.department ? ` · ${s.department}` : ""}
                    </small>
                    <span className="st-card-status">
                      <Badge tone={STATUS_TONE[s.status]} dot>
                        {s.status}
                      </Badge>
                      {usesApp(s) ? access[staffKey(s.id)]?.off ? <Badge tone="danger">Account off</Badge> : <Badge tone="brand">Uses STANLEY</Badge> : <Badge>Record only</Badge>}
                      {queriesOf(queries, s.id).some((q) => !q.outcome) && <Badge tone="warn">Open query</Badge>}
                    </span>
                  </span>
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
                  {seesPay && s.pay && (
                    <span>
                      <Wallet size={14} /> {money(netPay(s.pay))} a month (net)
                    </span>
                  )}
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
      {staffReportOpen && reportById("staff") && (
        <ReportBuilder
          spec={reportById("staff")!}
          initialBranch={branchId}
          lockedBranch={branchId}
          initialVariant="directory"
          onClose={() => setStaffReportOpen(false)}
        />
      )}
    </div>
  );
}

/* ─────────────── Profile pop-up ─────────────── */

type Tab = "overview" | "queries" | "access" | "pay" | "edit";

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
  const seesPay = useSeesPay();
  const appUser = usesApp(member);
  const queries = queriesOf(useStaffQueries(), member.id);
  const openQ = queries.filter((q) => !q.outcome).length;
  const accountOff = !!useAccountAccess()[staffKey(member.id)]?.off;

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
    { id: "queries", label: "Queries", icon: FileWarning, note: queries.length ? `${formatCount(queries.length)} on record${openQ ? ` · ${openQ} open` : ""}` : "None on record" },
    { id: "access", label: "Access & account", icon: KeyRound, note: !appUser ? "Record only, no sign-in" : accountOff ? "Account deactivated" : "Decided by the role" },
    ...(seesPay ? [{ id: "pay" as Tab, label: "Pay & bank", icon: Wallet, note: member.pay ? `${money(netPay(member.pay))} a month` : "Not set yet" }] : []),
    { id: "edit", label: "Edit profile", icon: Pencil, note: seesPay ? "Details, job, pay & bank" : "Details, role & status" },
  ];

  return createPortal(
    <AnimatePresence>
      <motion.div key="staff-profile" className="modal-layer fd-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <motion.div ref={box} className="fd ap st-profile" role="dialog" aria-modal="true" aria-labelledby={titleId} initial={m.modal.initial} animate={m.modal.animate} exit={m.modal.exit}>
          <aside className="fd-side ap-side">
            <div className="ap-id">
              <span className="ap-avatar" aria-hidden="true">
                <StaffFace s={member} />
              </span>
              <strong>{member.name}</strong>
              <small>
                {member.role} · {member.id}
              </small>
              <span className="ap-badges">
                {mgr && <em>Head of branch</em>}
                <em>{member.status}</em>
                {accountOff && <em className="is-off">Account off</em>}
                {openQ > 0 && <em className="is-warn">Open query</em>}
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
                  <span>Department</span>
                  <code>{member.department || "Not on record"}</code>
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
                <h2 id={titleId}>{tab === "edit" ? `Edit ${member.name}` : tab === "access" ? "Access & account" : tab === "pay" ? "Pay & bank" : tab === "queries" ? "Queries" : member.name}</h2>
                <p>{tab === "queries" ? "Queries issued to this person: the date, the reason, their response and the outcome. Only the Branch Manager and the Company Admin see them." : tab === "edit" ? "Update details, role, employment or status. Changes last for this session until the database is connected." : tab === "access" ? `What a ${member.role} can do in STANLEY. Access follows the role.` : mgr ? "Head of this branch — every staff member reports to them." : `${member.role} at ${branch?.name} · reports to ${manager?.name ?? "the branch manager"}.`}</p>
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
                                <StaffFace s={s} />
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
                  {(member.jobDescription || member.qualification || member.nextOfKin || member.gender || member.dateOfBirth) && (
                    <section className="fd-section">
                      <h3 className="fd-section-title">
                        <span>Job and personal details</span>
                      </h3>
                      <dl className="st-dl">
                        {member.jobDescription && (
                          <div className="full">
                            <dt>What they do</dt>
                            <dd>{member.jobDescription}</dd>
                          </div>
                        )}
                        {member.qualification && (
                          <div>
                            <dt>Qualification</dt>
                            <dd>{member.qualification}</dd>
                          </div>
                        )}
                        {member.gender && (
                          <div>
                            <dt>Gender</dt>
                            <dd>{member.gender}</dd>
                          </div>
                        )}
                        {member.dateOfBirth && (
                          <div>
                            <dt>Date of birth</dt>
                            <dd>{longDate(member.dateOfBirth)}</dd>
                          </div>
                        )}
                        {member.nextOfKin && (
                          <div>
                            <dt>Next of kin</dt>
                            <dd>
                              {member.nextOfKin.name} ({member.nextOfKin.relationship}) · {member.nextOfKin.phone}
                            </dd>
                          </div>
                        )}
                      </dl>
                    </section>
                  )}
                </>
              )}

              {tab === "pay" && seesPay && (
                <>
                  <section className="fd-section">
                    <h3 className="fd-section-title">
                      <span>Monthly pay</span>
                    </h3>
                    {member.pay ? (
                      <SummaryChips
                        items={[
                          { label: "Basic salary", icon: Wallet, value: money(member.pay.salary), caption: "Every month" },
                          { label: "Allowances", icon: Plus, value: money(member.pay.allowances ?? 0), caption: "Transport, housing …" },
                          { label: "Deductions", icon: X, value: money(member.pay.deductions ?? 0), caption: "Tax, pension, loans …" },
                          { label: "Net pay", icon: BadgeCheck, value: money(netPay(member.pay)), caption: "Paid into the account below" },
                        ]}
                      />
                    ) : (
                      <p className="fd-note">No salary on record yet. Add it under Edit profile.</p>
                    )}
                  </section>
                  <section className="fd-section">
                    <h3 className="fd-section-title">
                      <span>Bank details</span>
                    </h3>
                    {member.bank ? (
                      <div className="st-bank">
                        <Landmark size={22} />
                        <span>
                          <b>{member.bank.bankName}</b>
                          <small>{member.bank.accountName}</small>
                        </span>
                        <code>{member.bank.accountNumber}</code>
                      </div>
                    ) : (
                      <p className="fd-note">No bank details yet. Add them under Edit profile.</p>
                    )}
                    <p className="fd-note">Only the Company Admin and the Branch Manager see pay and bank details. They are in the salary report in Analysis.</p>
                  </section>
                </>
              )}

              {tab === "access" && (
                <section className="fd-section">
                  <h3 className="fd-section-title">
                    <span>{member.role}</span>
                  </h3>
                  {!appUser && <p className="fd-note">{member.name} is on record only and does not sign in to STANLEY. Their profile, job, pay and bank details are kept by the Company Admin and the Branch Manager.</p>}
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
              {tab === "access" && appUser && !mgr && <AccountAccessPanel accountKey={staffKey(member.id)} name={member.name} what={member.role} branchId={member.branchId} />}

              {tab === "queries" && <QueriesPanel staffId={member.id} staffName={member.name} branchId={member.branchId} />}

              {tab === "edit" && <StaffEditForm member={member} branchId={member.branchId} onSaved={() => setTab("overview")} />}
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

/** Edit a profile, or (member null) add a staff record. Pay and bank only for the Company Admin and the Branch Manager. */
function StaffEditForm({ member, branchId, onSaved }: { member: StaffRecord | null; branchId: string; onSaved: (id: string) => void }) {
  const { staff, editStaff, addStaff, showToast, user } = useApp();
  const seesPay = useSeesPay();
  const [name, setName] = useState(member?.name ?? "");
  const [phone, setPhone] = useState(member?.phone ?? "");
  const [email, setEmail] = useState(member?.email ?? "");
  const [address, setAddress] = useState(member?.address ?? "");
  const [role, setRole] = useState(member?.role ?? RECORD_ROLES[0]!);
  const [otherRole, setOtherRole] = useState(member && !STAFF_ROLES.some((r) => r.value === member.role) && !RECORD_ROLES.includes(member.role) ? member.role : "");
  const [employment, setEmployment] = useState(member?.employment ?? "Full-time");
  const [startDate, setStartDate] = useState(member?.startDate ?? "");
  const [status, setStatus] = useState<StaffStatus>(member?.status ?? "Active");
  const [notes, setNotes] = useState(member?.notes ?? "");
  const [department, setDepartment] = useState(member?.department ?? "");
  const [jobDescription, setJobDescription] = useState(member?.jobDescription ?? "");
  const [qualification, setQualification] = useState(member?.qualification ?? "");
  const [gender, setGender] = useState<"" | "Female" | "Male">(member?.gender ?? "");
  const [dob, setDob] = useState(member?.dateOfBirth ?? "");
  const [kinName, setKinName] = useState(member?.nextOfKin?.name ?? "");
  const [kinPhone, setKinPhone] = useState(member?.nextOfKin?.phone ?? "");
  const [kinRel, setKinRel] = useState(member?.nextOfKin?.relationship ?? "");
  const [salary, setSalary] = useState(member?.pay ? String(member.pay.salary) : "");
  const [allowances, setAllowances] = useState(member?.pay?.allowances ? String(member.pay.allowances) : "");
  const [deductions, setDeductions] = useState(member?.pay?.deductions ? String(member.pay.deductions) : "");
  const [bankName, setBankName] = useState(member?.bank?.bankName ?? "");
  const [accountName, setAccountName] = useState(member?.bank?.accountName ?? "");
  const [accountNumber, setAccountNumber] = useState(member?.bank?.accountNumber ?? "");
  const otherManager = useMemo(() => staff.find((s) => s.branchId === branchId && s.id !== member?.id && isManager(s) && s.status !== "Left"), [staff, member, branchId]);
  const finalRole = role === "Other" ? otherRole.trim() : role;
  const n = (v: string) => Math.max(0, Math.round(Number(v.replace(/[^\d.]/g, "")) || 0));
  const bankAny = !!(bankName.trim() || accountName.trim() || accountNumber.trim());

  const emailOk = !email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  // Field errors — shown on each field after a blocked Save (owner rule), then updated live.
  const fieldErr: Record<"name" | "contact" | "startDate" | "role" | "bank", string | null> = {
    name: !name.trim() ? "Enter the full name." : null,
    // People who sign in need a way to be reached; records only may have neither.
    contact: STAFF_ROLES.some((r) => r.value === finalRole) && !phone.trim() && !email.trim() ? "Give at least a phone number or an email address." : !emailOk ? "Check the email address, e.g. name@company.com." : null,
    startDate: !startDate ? "Choose the start date." : null,
    role: !finalRole ? "Type the role." : finalRole === MANAGER_ROLE && otherManager ? `${otherManager.name} is already the branch manager. Change their role first.` : null,
    bank: seesPay && bankAny && (!bankName.trim() || !accountName.trim() || !/^\d{10}$/.test(accountNumber.trim())) ? "Give the bank, the account name and the 10-digit account number." : null,
  };
  const error = Object.values(fieldErr).some(Boolean);
  const [tried, setTried] = useState(false);
  const show = (k: keyof typeof fieldErr) => (tried ? fieldErr[k] : null);
  const fieldCls = (base: string, k: keyof typeof fieldErr) => ({ className: `${base} ${show(k) ? "is-error" : ""}`, "data-field-error": show(k) ? true : undefined });
  const patch = {
    name: name.trim(),
    phone: phone.trim(),
    email: email.trim(),
    address: address.trim() || undefined,
    role: finalRole,
    employment,
    startDate,
    status,
    notes: notes.trim() || undefined,
    department: department || undefined,
    jobDescription: jobDescription.trim() || undefined,
    qualification: qualification.trim() || undefined,
    gender: gender || undefined,
    dateOfBirth: dob || undefined,
    nextOfKin: kinName.trim() ? { name: kinName.trim(), phone: kinPhone.trim(), relationship: kinRel.trim() } : undefined,
    ...(seesPay
      ? {
          pay: salary.trim() ? { salary: n(salary), allowances: n(allowances) || undefined, deductions: n(deductions) || undefined } : undefined,
          bank: bankAny ? { bankName: bankName.trim(), accountName: accountName.trim(), accountNumber: accountNumber.trim() } : undefined,
        }
      : {}),
  };
  const changed = !member || JSON.stringify(patch) !== JSON.stringify(Object.fromEntries(Object.keys(patch).map((k) => [k, member[k as keyof StaffRecord]])));

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
          <div className="fd-field">
            <span className="fd-label">Gender</span>
            <SelectMenu value={gender} ariaLabel="Gender" options={[{ value: "", label: "Not given" }, { value: "Female", label: "Female" }, { value: "Male", label: "Male" }]} onChange={(v: string) => setGender(v as "" | "Female" | "Male")} />
          </div>
          <label className="fd-field">
            <span className="fd-label">
              Date of birth <i>Optional</i>
            </span>
            <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
          </label>
          <label className="fd-field">
            <span className="fd-label">
              Next of kin <i>Optional</i>
            </span>
            <input value={kinName} onChange={(e) => setKinName(e.target.value)} placeholder="Full name" />
          </label>
          <label className="fd-field">
            <span className="fd-label">Their phone and relationship</span>
            <span className="st-pair">
              <input value={kinPhone} inputMode="tel" onChange={(e) => setKinPhone(e.target.value)} placeholder="Phone" />
              <input value={kinRel} onChange={(e) => setKinRel(e.target.value)} placeholder="e.g. Sister" />
            </span>
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
                <small>{blocked ? `${otherManager?.name} is the manager` : `Signs in to STANLEY. ${r.access}`}</small>
              </button>
            );
          })}
        </div>
        <div className="fd-grid">
          <div className="fd-field">
            <span className="fd-label">Or another role (record only, no sign-in)</span>
            <SelectMenu value={STAFF_ROLES.some((r) => r.value === role) ? "" : role} ariaLabel="Other role" options={[{ value: "", label: "Choose a role" }, ...RECORD_ROLES.map((v) => ({ value: v, label: v })), { value: "Other", label: "Other (type it)" }]} onChange={(v: string) => v && setRole(v)} />
          </div>
          {role === "Other" && (
            <label {...fieldCls("fd-field", "role")}>
              <span className="fd-label">
                Role <em aria-hidden="true">*</em>
              </span>
              <input value={otherRole} onChange={(e) => setOtherRole(e.target.value)} placeholder="e.g. Porter" />
            </label>
          )}
          <div className="fd-field">
            <span className="fd-label">Department</span>
            <SelectMenu value={department} ariaLabel="Department" options={[{ value: "", label: "Choose" }, ...DEPARTMENTS.map((v) => ({ value: v, label: v }))]} onChange={(v: string) => setDepartment(v)} />
          </div>
          <label className="fd-field">
            <span className="fd-label">
              Qualification <i>Optional</i>
            </span>
            <input value={qualification} onChange={(e) => setQualification(e.target.value)} placeholder="e.g. BMLS, RRT" />
          </label>
          <label className="fd-field full">
            <span className="fd-label">
              What they do <i>Optional</i>
            </span>
            <textarea value={jobDescription} maxLength={600} onChange={(e) => setJobDescription(e.target.value)} placeholder={"Their duties, shifts and who they work with.\nPress Enter for a new line."} />
          </label>
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

      {seesPay && (
        <section className="fd-section">
          <h3 className="fd-section-title">
            <span>Pay and bank details</span>
          </h3>
          <div className="fd-grid">
            <label className="fd-field">
              <span className="fd-label">Monthly basic salary (₦)</span>
              <input inputMode="numeric" value={salary} onChange={(e) => setSalary(e.target.value.replace(/[^\d]/g, ""))} placeholder="e.g. 150000" />
            </label>
            <label className="fd-field">
              <span className="fd-label">Monthly allowances (₦)</span>
              <input inputMode="numeric" value={allowances} onChange={(e) => setAllowances(e.target.value.replace(/[^\d]/g, ""))} placeholder="Transport, housing …" />
            </label>
            <label className="fd-field">
              <span className="fd-label">Monthly deductions (₦)</span>
              <input inputMode="numeric" value={deductions} onChange={(e) => setDeductions(e.target.value.replace(/[^\d]/g, ""))} placeholder="Tax, pension, loans …" />
            </label>
            <div className="fd-field">
              <span className="fd-label">Net pay</span>
              <b className="st-net">{salary ? money(Math.max(0, n(salary) + n(allowances) - n(deductions))) : "—"}</b>
            </div>
            <label {...fieldCls("fd-field", "bank")}>
              <span className="fd-label">Bank</span>
              <input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. GTBank" />
            </label>
            <label className="fd-field">
              <span className="fd-label">Account name</span>
              <input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="As on the account" />
            </label>
            <label className="fd-field">
              <span className="fd-label">Account number</span>
              <input className="mono" inputMode="numeric" maxLength={10} value={accountNumber} onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="10 digits" />
            </label>
            <div {...fieldCls("fd-field full", "bank")}>
              <FieldError msg={show("bank")} />
              <small className="fd-hint">Only the Company Admin and the Branch Manager see pay and bank details. They go into the salary report in Analysis.</small>
            </div>
          </div>
        </section>
      )}

      <div className="ap-save">
        <Button
          disabled={!changed}
          onClick={() => {
            if (error) {
              setTried(true);
              focusFirstError();
              return;
            }
            if (member) {
              editStaff(member.id, patch);
              showToast(`${patch.name} updated`);
              onSaved(member.id);
            } else {
              const created = addStaff({ ...patch, branchId });
              showToast(`${patch.name} added${usesApp(created) ? "" : " (record only, no sign-in)"}`);
              onSaved(created.id);
            }
          }}
        >
          {member ? "Save changes" : "Add staff record"}
        </Button>
      </div>
    </>
  );
}
