/**
 * Settings → Branch Management: every branch, add new branches, edit details,
 * activate / deactivate / suspend (with a reason; nothing is deleted), branch
 * payment methods (company default or the branch's own), staff and activity.
 */
import { useEffect, useMemo, useState } from "react";
import { Activity, Building2, CreditCard, ExternalLink, Plus, Power, Users } from "lucide-react";
import { useApp } from "@/app/AppState";
import type { Branch, BranchStatus, PaymentMethod } from "@/data/types";
import { PAYMENT_METHODS } from "@/data/types";
import { LEGACY_BRANCH_ID } from "@/data/legacy";
import { useAuditLog } from "@/services/audit";
import { billingState } from "@/services/billing";
import { useConfig } from "@/services/config";
import { addBranch, branchPaymentMode, enabledMethods, idCodeProblem, normCode, setBranchPayments, setBranchStatus, statusHistory, updateBranch, type BranchInput } from "@/services/org";
import { updateBranchContact, useReceiptProfile } from "@/services/receiptProfile";
import { updateBranchProfile, useBranchProfile } from "@/services/settingsStore";
import { formatCount } from "@/shared/format";
import { Badge, Button, EmptyState, SearchInput, SelectMenu } from "@/shared/ui/controls";
import { FormDialog, FormField, FormSection, PreviewCard } from "@/shared/ui/FormDialog";
import { Modal } from "@/shared/ui/Modal";
import { Footer, useFieldErrors } from "@/features/shared/createForms";
import { NAME_INPUT_PROPS, nameChange } from "@/shared/nameCase";
import { BranchProfileForm } from "../BranchForms";
import { EMAIL_RE, PHONE_RE } from "../ProfileCard";
import { useOrgFacts, type BranchFacts } from "./orgData";
import { ConfirmDialog, Panel, StatusChip, Toggle, dateTime, shortDate } from "./ui";

export const STATUS_TONE: Record<BranchStatus, "ok" | "warn" | "danger" | "neutral"> = { Active: "ok", "Pending setup": "warn", Suspended: "danger", Inactive: "neutral" };

export function BranchesSection({ action, onActionDone }: { action?: string | null; onActionDone: () => void }) {
  const f = useOrgFacts();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | BranchStatus>("all");
  const [sort, setSort] = useState<"name" | "status" | "created">("name");
  const [adding, setAdding] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    if (action === "add") {
      setAdding((n) => n + 1);
      onActionDone();
    }
  }, [action, onActionDone]);

  const term = q.trim().toLowerCase();
  const rows = f.perBranch
    .filter((b) => (status === "all" || b.branch.status === status) && (!term || `${b.branch.name} ${b.branch.code} ${b.branch.idCode ?? ""} ${b.branch.city} ${b.branch.state ?? ""} ${b.manager?.name ?? ""}`.toLowerCase().includes(term)))
    .sort((a, b) => (sort === "name" ? a.branch.name.localeCompare(b.branch.name) : sort === "status" ? a.branch.status.localeCompare(b.branch.status) : (b.branch.createdAt ?? "").localeCompare(a.branch.createdAt ?? "")));
  const openFacts = f.perBranch.find((b) => b.branch.id === open);

  return (
    <div className="sc-stack">
      <div className="sc-toolbar">
        <SearchInput placeholder="Search branch, code, city or manager" value={q} onChange={setQ} />
        <SelectMenu value={status} ariaLabel="Status" className="select-btn" options={[{ value: "all", label: "All statuses" }, ...(["Active", "Pending setup", "Suspended", "Inactive"] as BranchStatus[]).map((s) => ({ value: s, label: s }))]} onChange={(v: "all" | BranchStatus) => setStatus(v)} />
        <SelectMenu value={sort} ariaLabel="Sort" className="select-btn" options={[{ value: "name", label: "Sort: name" }, { value: "status", label: "Sort: status" }, { value: "created", label: "Sort: newest" }]} onChange={(v: "name" | "status" | "created") => setSort(v)} />
        <Button onClick={() => setAdding((n) => n + 1)}>
          <Plus size={16} /> Add new branch
        </Button>
      </div>

      <div className="card bp-card rf-table-card">
        <div className="inv-table-tools">
          <span className="inv-count">
            {formatCount(rows.length)} of {formatCount(f.branches.length)} branches · {f.active} active
          </span>
        </div>
        <div className="table-wrap thin-scroll">
          <table className="bp-table rf-table sc-table" aria-label="Branches">
            <thead>
              <tr>
                <th>Branch</th>
                <th>Location</th>
                <th>Status</th>
                <th>Manager</th>
                <th className="right">Staff</th>
                <th>Contact</th>
                <th>Created</th>
                <th>Last activity</th>
                <th>Setup</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <EmptyState title="No branches match these filters" />
                  </td>
                </tr>
              ) : (
                rows.map((b) => (
                  <tr key={b.branch.id} className="pr-row" tabIndex={0} onClick={() => setOpen(b.branch.id)} onKeyDown={(k) => (k.key === "Enter" || k.key === " ") && (k.preventDefault(), setOpen(b.branch.id))}>
                    <td>
                      <strong>{b.branch.name}</strong>
                      <small className="ep-sub mono">
                        {b.branch.code} · {b.branch.idCode ?? "no ID code"}
                      </small>
                    </td>
                    <td>
                      {b.branch.city}
                      <small className="ep-sub">{[b.branch.state, b.branch.country].filter(Boolean).join(", ")}</small>
                    </td>
                    <td>
                      <Badge tone={STATUS_TONE[b.branch.status]} dot>
                        {b.branch.status}
                      </Badge>
                    </td>
                    <td>{b.manager ? b.manager.name : <span className="sc-missing">Not assigned</span>}</td>
                    <td className="right num">{formatCount(b.staff.length)}</td>
                    <td>
                      <BranchContact branch={b.branch} />
                    </td>
                    <td className="ep-nowrap">{b.branch.createdAt ? shortDate(b.branch.createdAt) : "Legacy (BR001)"}</td>
                    <td>{b.lastActivity ? <span title={b.lastActivity.action}>{dateTime(b.lastActivity.at)}</span> : <span className="lg-muted">No activity yet</span>}</td>
                    <td>{b.gaps.length ? <StatusChip status={b.branch.status === "Pending setup" ? "incomplete" : "attention"}>{b.gaps.length} to fix</StatusChip> : <StatusChip status="ok">Configured</StatusChip>}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <p className="lg-muted al-note">Deactivating or suspending a branch closes it for business — every patient, bill, staff and audit record is kept and it can be reactivated.</p>

      {adding > 0 && <NewBranchDialog key={adding} open onClose={() => setAdding(0)} onCreated={(id) => setOpen(id)} />}
      {openFacts && <BranchPanel facts={openFacts} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** Branch phone / email — the same details printed on its receipts. */
function BranchContact({ branch }: { branch: Branch }) {
  const contact = useReceiptProfile().branches[branch.id];
  const extra = useBranchProfile(branch.id);
  const phone = contact?.phone || (branch.phone && branch.phone !== "Not on record" ? branch.phone : "");
  const email = extra.email || branch.email || "";
  return (
    <>
      {phone || <span className="lg-muted">No phone</span>}
      <small className="ep-sub">{email || "No email"}</small>
    </>
  );
}

/* ─────────────── Add a branch ─────────────── */

const blank: BranchInput = { name: "", idCode: "", city: "", state: "", country: "Nigeria", address: "", phone: "", email: "", contactPerson: "", openedOn: "", timezone: "Africa/Lagos" };

export function NewBranchDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated?: (id: string) => void }) {
  const v = useFieldErrors(open);
  const { user, showToast } = useApp();
  const cfg = useConfig();
  const [form, setForm] = useState<BranchInput>(blank);
  const [hours, setHours] = useState("");
  const [payMode, setPayMode] = useState<"inherit" | "custom">("inherit");
  const [methods, setMethods] = useState<Record<PaymentMethod, boolean>>({ ...cfg.payments.enabled });
  const set = (k: keyof BranchInput) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const codeErr = form.idCode ? idCodeProblem(form.idCode) : "Enter a three-letter code, e.g. LAG.";
  const code = normCode(form.idCode);
  const filled = (s: string) => s.trim().length > 0;
  const phoneBad = filled(form.phone) && !PHONE_RE.test(form.phone.trim());
  const emailBad = filled(form.email) && !EMAIL_RE.test(form.email.trim());
  const steps = [
    { id: "info", label: "Branch information", done: filled(form.name) && filled(form.city) && filled(form.address) },
    { id: "code", label: "Branch code", done: !codeErr },
    { id: "contact", label: "Contact", done: !phoneBad && !emailBad && (filled(form.phone) || filled(form.email)) },
    { id: "config", label: "Configuration", done: payMode === "inherit" || Object.values(methods).some(Boolean) },
  ];

  const save = () => {
    const b = addBranch(form, user.name);
    updateBranchContact(b.id, { address: form.address.trim(), phone: form.phone.trim() });
    updateBranchProfile(b.id, { email: form.email.trim(), hours: hours.trim() });
    if (payMode === "custom") setBranchPayments(b.id, methods, user.name);
    showToast(`${b.name} branch created — Pending setup until you activate it`);
    onCreated?.(b.id);
    onClose();
  };

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      eyebrow="New branch"
      title="Add a branch"
      description="The branch is saved as Pending setup. Activate it when its manager and details are ready."
      contextLabel="Adding a branch"
      steps={steps}
      aside={
        <PreviewCard
          title="New branch"
          rows={[
            { label: "Name", value: form.name.trim() ? `${form.name.trim()} branch` : "—" },
            { label: "Branch code", value: code || "—" },
            { label: "Patient IDs", value: code.length === 3 ? `${code}-R000001 · ${code}-W000001` : "—" },
            { label: "Currency", value: "NGN" },
            { label: "Payments", value: payMode === "inherit" ? "Company default" : PAYMENT_METHODS.filter((m) => methods[m]).join(", ") || "None" },
            { label: "Status", value: "Pending setup" },
          ]}
          note="Nothing is invented for a new branch — its figures start at zero."
        />
      }
      footer={<Footer onCancel={onClose} submitLabel="Save branch" onInvalid={v.mark} canSubmit={steps.every((s) => s.done)} onSubmit={save} />}
    >
      <FormSection id="info" title="Branch information">
        <FormField label="Branch name" required error={v.show(!filled(form.name), "Enter the branch name, e.g. Lagos.")}>
          <input value={form.name} onChange={set("name")} placeholder="e.g. Lagos" maxLength={40} />
        </FormField>
        <FormField label="Opening date">
          <input type="date" value={form.openedOn} onChange={set("openedOn")} />
        </FormField>
        <FormField label="Full address" required error={v.show(!filled(form.address), "Enter the branch address — it prints on receipts.")} full>
          <textarea value={form.address} onChange={set("address")} placeholder="Street, area" />
        </FormField>
        <FormField label="City" required error={v.show(!filled(form.city), "Enter the city.")}>
          <input value={form.city} onChange={set("city")} placeholder="e.g. Ikeja" />
        </FormField>
        <FormField label="State">
          <input value={form.state} onChange={set("state")} placeholder="e.g. Lagos" />
        </FormField>
        <FormField label="Country">
          <input value={form.country} onChange={set("country")} />
        </FormField>
        <FormField label="Opening hours">
          <input value={hours} onChange={(e) => setHours(e.target.value)} placeholder="e.g. Mon–Sat 7:30am – 8:00pm" />
        </FormField>
      </FormSection>
      <FormSection id="code" title="Branch code" note="Used in every Patient ID at this branch. It must be unique and can't change once patients have IDs.">
        <FormField label="Branch code (3 letters)" required error={v.show(!!codeErr, codeErr ?? "")} hint={code.length === 3 && !codeErr ? `Patient IDs: ${code}-R000001 (referred) · ${code}-W000001 (walk-in)` : "e.g. Abuja = ABJ, Lagos = LAG"}>
          <input value={form.idCode} onChange={(e) => setForm((f) => ({ ...f, idCode: normCode(e.target.value).slice(0, 3) }))} placeholder="LAG" className="mono" maxLength={3} />
        </FormField>
      </FormSection>
      <FormSection id="contact" title="Contact">
        <FormField label="Phone number" error={v.show(phoneBad, "Enter a valid phone number, e.g. 0803 123 4567.") ?? v.show(!filled(form.phone) && !filled(form.email), "Enter a phone number or an email.")}>
          <input type="tel" value={form.phone} onChange={set("phone")} placeholder="0803 123 4567" />
        </FormField>
        <FormField label="Email address" error={v.show(emailBad, "Enter a valid email address.")}>
          <input type="email" value={form.email} onChange={set("email")} placeholder="lagos@example.com" />
        </FormField>
        <FormField label="Branch contact person" full>
          <input value={form.contactPerson} onChange={nameChange((x) => setForm((f) => ({ ...f, contactPerson: x })))} {...NAME_INPUT_PROPS} placeholder="Until a manager is appointed" />
        </FormField>
      </FormSection>
      <FormSection id="config" title="Configuration" note="Currency NGN, timezone West Africa Time. The service catalogue and prices are company-wide.">
        <FormField label="Payment methods" full as="div">
          <div className="fd-tiles" role="group" aria-label="Payment methods" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
            <button type="button" className="fd-tile" aria-pressed={payMode === "inherit"} onClick={() => setPayMode("inherit")}>
              <strong>Use company settings</strong>
              <small>{PAYMENT_METHODS.filter((m) => cfg.payments.enabled[m]).join(", ")} — follows company changes</small>
            </button>
            <button type="button" className="fd-tile" aria-pressed={payMode === "custom"} onClick={() => setPayMode("custom")}>
              <strong>Customise for this branch</strong>
              <small>Choose this branch's own methods</small>
            </button>
          </div>
        </FormField>
        {payMode === "custom" && (
          <div className="sc-checks">
            {PAYMENT_METHODS.map((m) => (
              <Toggle key={m} label={m === "Transfer" ? "Bank transfer" : m} checked={methods[m]} onChange={(on) => setMethods((x) => ({ ...x, [m]: on }))} />
            ))}
          </div>
        )}
      </FormSection>
    </FormDialog>
  );
}

/* ─────────────── Branch panel ─────────────── */

type Tab = "details" | "status" | "payments" | "staff" | "activity";

function BranchPanel({ facts, onClose }: { facts: BranchFacts; onClose: () => void }) {
  const { navigate } = useApp();
  const [tab, setTab] = useState<Tab>("details");
  const b = facts.branch;
  const tabs: { id: Tab; label: string; icon: typeof Building2 }[] = [
    { id: "details", label: "Details", icon: Building2 },
    { id: "status", label: "Status", icon: Power },
    { id: "payments", label: "Payment methods", icon: CreditCard },
    { id: "staff", label: `Staff (${facts.staff.length})`, icon: Users },
    { id: "activity", label: "Activity", icon: Activity },
  ];
  return (
    <Modal
      open
      onClose={onClose}
      xl
      icon={Building2}
      title={`${b.name} branch`}
      description={`${b.code} · Patient ID code ${b.idCode ?? "not set"} · ${b.city}${b.state ? `, ${b.state}` : ""}`}
      footer={
        <>
          <span className="left">
            <Badge tone={STATUS_TONE[b.status]} dot>
              {b.status}
            </Badge>{" "}
            {facts.health.label}
          </span>
          {b.status === "Active" && (
            <Button variant="secondary" onClick={() => navigate(`/branch/${b.id}/dashboard`)}>
              <ExternalLink size={15} /> Open branch workspace
            </Button>
          )}
          <Button onClick={onClose}>Done</Button>
        </>
      }
    >
      <div className="sc-tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? "is-on" : ""} onClick={() => setTab(t.id)}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>
      {tab === "details" && <DetailsTab branch={b} gaps={facts.gaps} />}
      {tab === "status" && <StatusTab facts={facts} />}
      {tab === "payments" && <PaymentsTab branch={b} />}
      {tab === "staff" && <StaffTab facts={facts} />}
      {tab === "activity" && <ActivityTab branch={b} />}
    </Modal>
  );
}

function DetailsTab({ branch, gaps }: { branch: Branch; gaps: string[] }) {
  const { user, showToast } = useApp();
  const legacy = branch.id === LEGACY_BRANCH_ID;
  // The code is locked once Patient IDs exist for it (IDs already printed on receipts never change).
  const issued = branch.idCode ? Object.keys(billingState().sequences).some((k) => k.startsWith(`${branch.idCode}-`)) : false;
  const saved = { name: branch.name, idCode: branch.idCode ?? "", city: branch.city, state: branch.state ?? "", country: branch.country, contactPerson: branch.contactPerson ?? "", openedOn: branch.openedOn === "Not on record" ? "" : branch.openedOn };
  const [form, setForm] = useState(saved);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const dirty = (Object.keys(form) as (keyof typeof form)[]).some((k) => form[k].trim() !== saved[k]);
  const save = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Enter the branch name.";
    if (!form.city.trim()) e.city = "Enter the city.";
    const cp = idCodeProblem(form.idCode, branch.id);
    if (cp) e.idCode = cp;
    setErrors(e);
    if (Object.keys(e).length) return;
    updateBranch(branch.id, form, user.name);
    showToast(`${form.name.trim()} branch updated`);
  };
  return (
    <div className="sc-stack">
      {gaps.length > 0 && (
        <div className="sc-gaps">
          <b>To finish setting up:</b> {gaps.join(" · ")}
        </div>
      )}
      <Panel title="Branch identity" scope="branch" note={legacy ? "The Abuja branch's name and codes come from the legacy records and can't be changed." : undefined}>
        <div className="form-grid">
          <label className={`field ${errors.name ? "is-error" : ""}`}>
            Branch name
            <input value={form.name} onChange={set("name")} readOnly={legacy} />
            {errors.name && <small className="field-error">{errors.name}</small>}
          </label>
          <label className={`field ${errors.idCode ? "is-error" : ""}`}>
            Branch code (Patient IDs)
            <input className="mono" value={form.idCode} maxLength={3} readOnly={legacy || issued} onChange={(e) => setForm((f) => ({ ...f, idCode: normCode(e.target.value).slice(0, 3) }))} />
            {errors.idCode ? <small className="field-error">{errors.idCode}</small> : <small className="lg-muted">{legacy || issued ? "Locked — Patient IDs have been issued with this code" : `IDs: ${normCode(form.idCode) || "___"}-R000001 / -W000001`}</small>}
          </label>
          <label className={`field ${errors.city ? "is-error" : ""}`}>
            City
            <input value={form.city} onChange={set("city")} readOnly={legacy} />
          </label>
          <label className="field">
            State
            <input value={form.state} onChange={set("state")} />
          </label>
          <label className="field">
            Country
            <input value={form.country} onChange={set("country")} />
          </label>
          <label className="field">
            Opening date
            <input type="date" value={form.openedOn} onChange={set("openedOn")} />
          </label>
          <label className="field">
            Contact person
            <input value={form.contactPerson} onChange={nameChange((x) => setForm((f) => ({ ...f, contactPerson: x })))} {...NAME_INPUT_PROPS} />
          </label>
          <label className="field">
            System code · currency · timezone
            <input value={`${branch.code} · NGN · West Africa Time`} readOnly />
          </label>
        </div>
        <div className="st-form-actions">
          {dirty && (
            <Button variant="secondary" onClick={() => setForm(saved)}>
              Cancel
            </Button>
          )}
          <Button disabled={!dirty} onClick={save}>
            Save identity
          </Button>
        </div>
      </Panel>
      <Panel title="Contact & hours" scope="branch" note="Printed on this branch's receipts and quotes.">
        <BranchProfileForm branch={branch} compact />
      </Panel>
    </div>
  );
}

function StatusTab({ facts }: { facts: BranchFacts }) {
  const { user, showToast } = useApp();
  const b = facts.branch;
  const [confirm, setConfirm] = useState<BranchStatus | null>(null);
  const history = statusHistory(b.id);
  const options: { to: BranchStatus; label: string; danger?: boolean; text: string }[] =
    b.status === "Active"
      ? [
          { to: "Suspended", label: "Suspend branch", danger: true, text: "Temporarily stop work at the branch (e.g. an investigation). Staff can't bill there until it is reactivated." },
          { to: "Inactive", label: "Deactivate branch", danger: true, text: "Close the branch. Its records stay and it can be reactivated later." },
        ]
      : [{ to: "Active", label: b.status === "Pending setup" ? "Activate branch" : "Reactivate branch", text: b.status === "Pending setup" ? "Open the branch for business — it appears in the branch switcher and staff can bill there." : "Open the branch again." }];
  return (
    <div className="sc-stack">
      <Panel title="Branch status" note="Only the Company Admin can change a branch's status. Every change needs a reason and is recorded.">
        <div className="sc-status-now">
          <Badge tone={STATUS_TONE[b.status]} dot>
            {b.status}
          </Badge>
          <span>{facts.health.label}</span>
        </div>
        {b.status === "Pending setup" && facts.gaps.length > 0 && <div className="sc-gaps">Before activating, consider: {facts.gaps.join(" · ")}. You can still activate now.</div>}
        <div className="sc-status-actions">
          {options.map((o) => (
            <div key={o.to} className="sc-status-option">
              <span>
                <b>{o.label}</b>
                <small>{o.text}</small>
              </span>
              <Button variant={o.danger ? "danger" : "primary"} size="sm" onClick={() => setConfirm(o.to)}>
                {o.label}
              </Button>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Status history">
        {history.length === 0 ? (
          <p className="an-none">No status changes recorded yet.</p>
        ) : (
          <ol className="ex-history">
            {history.map((h, i) => (
              <li key={i}>
                <b>
                  {h.from === h.to ? h.to : `${h.from} → ${h.to}`}
                </b>
                <small>
                  {h.by} · {dateTime(h.at)}
                </small>
                <p>{h.reason}</p>
              </li>
            ))}
          </ol>
        )}
      </Panel>
      <ConfirmDialog
        open={!!confirm}
        title={confirm === "Active" ? `Activate ${b.name} branch?` : confirm === "Suspended" ? `Suspend ${b.name} branch?` : `Deactivate ${b.name} branch?`}
        description={confirm === "Active" ? "The branch opens for business." : "The branch closes for business until it is reactivated."}
        consequences={confirm === "Active" ? ["It appears in the branch switcher and reports", "Its staff can sign in to the workspace and bill"] : ["No new bills can be made at this branch", "Every patient, bill, staff, inventory and audit record is kept", "It can be reactivated at any time"]}
        confirmLabel={confirm === "Active" ? "Activate" : confirm === "Suspended" ? "Suspend branch" : "Deactivate branch"}
        danger={confirm !== "Active"}
        reason
        onClose={() => setConfirm(null)}
        onConfirm={(reason) => {
          if (confirm) {
            setBranchStatus(b.id, confirm, reason, user.name);
            showToast(`${b.name} branch is now ${confirm}`);
          }
          setConfirm(null);
        }}
      />
    </div>
  );
}

function PaymentsTab({ branch }: { branch: Branch }) {
  const { user, showToast } = useApp();
  const cfg = useConfig();
  const mode = branchPaymentMode(branch.id);
  const current = enabledMethods(branch.id);
  const [draft, setDraft] = useState<Record<PaymentMethod, boolean>>(() => Object.fromEntries(PAYMENT_METHODS.map((m) => [m, current.includes(m)])) as Record<PaymentMethod, boolean>);
  return (
    <Panel title="Payment methods at this branch" scope={mode === "inherit" ? "inherited" : "overridden"} note={mode === "inherit" ? "This branch follows the company's payment methods — changes there apply here." : "This branch has its own set, replacing the company default here only."}>
      <div className="fd-tiles" role="group" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        <button
          type="button"
          className="fd-tile"
          aria-pressed={mode === "inherit"}
          onClick={() => {
            if (mode === "inherit") return;
            setBranchPayments(branch.id, null, user.name);
            showToast(`${branch.name} uses the company's payment methods`);
          }}
        >
          <strong>Use company settings</strong>
          <small>{PAYMENT_METHODS.filter((m) => cfg.payments.enabled[m]).join(", ") || "None enabled"}</small>
        </button>
        <button
          type="button"
          className="fd-tile"
          aria-pressed={mode === "custom"}
          onClick={() => {
            if (mode === "custom") return;
            setBranchPayments(branch.id, draft, user.name);
            showToast(`${branch.name} now has its own payment methods`);
          }}
        >
          <strong>Customise for this branch</strong>
          <small>Choose below</small>
        </button>
      </div>
      {mode === "custom" && (
        <div className="sc-checks">
          {PAYMENT_METHODS.map((m) => (
            <Toggle
              key={m}
              label={m === "Transfer" ? "Bank transfer" : m}
              checked={draft[m]}
              onChange={(on) => {
                const next = { ...draft, [m]: on };
                setDraft(next);
                setBranchPayments(branch.id, next, user.name);
              }}
            />
          ))}
        </div>
      )}
      <p className="lg-muted">Billing at {branch.name} offers: {current.join(", ") || "no method — bills can't take payments"}.</p>
    </Panel>
  );
}

function StaffTab({ facts }: { facts: BranchFacts }) {
  return (
    <Panel title="Staff at this branch" note="Add, transfer and manage people in Settings → Staff Management and Branch Managers.">
      {facts.staff.length === 0 ? (
        <p className="an-none">No staff yet. Appoint a manager first (Branch Managers), then add the front desk.</p>
      ) : (
        <ul className="sc-people">
          {facts.staff.map((s) => (
            <li key={s.id}>
              <span>
                <b>{s.name}</b>
                <small>
                  {s.role} · {s.id}
                </small>
              </span>
              <Badge tone={s.status === "Active" ? "ok" : s.status === "Suspended" ? "danger" : "warn"} dot>
                {s.status}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function ActivityTab({ branch }: { branch: Branch }) {
  const audit = useAuditLog();
  const list = useMemo(() => audit.filter((e) => e.branchId === branch.id).slice(0, 25), [audit, branch.id]);
  return (
    <Panel title="Recent activity" note="The latest changes recorded for this branch (audit log).">
      {list.length === 0 ? (
        <p className="an-none">No activity recorded yet.</p>
      ) : (
        <ol className="ex-history">
          {list.map((e) => (
            <li key={e.id}>
              <b>
                {e.action} · {e.record}
              </b>
              <small>
                {e.user} · {dateTime(e.at)} · {e.category}
              </small>
              <p>{e.details}</p>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
