/**
 * Company Admin settings — the overall settings that control the whole app:
 * the admin's own profile, the company profile, logo & branding (logo, display
 * names, colour theme), receipts & documents, every branch's details, and who
 * can do what. Branch Managers and staff never see this page; they get their
 * own settings inside the branch workspace.
 */
import { useState } from "react";
import { Building2, FileText, Palette, ShieldCheck, Store, UserRound } from "lucide-react";
import { useApp } from "@/app/AppState";
import { BRANCHES, COMPANY, SERVICES, servicePrice } from "@/data/company";
import { MANAGER_ROLE, STAFF_ROLES } from "@/data/userRecords";
import { logAudit } from "@/services/audit";
import { updateReceiptProfile, useReceiptProfile } from "@/services/receiptProfile";
import { DEFAULT_COMPANY, updateCompany, useCompanyProfile, type CompanyProfile } from "@/services/settingsStore";
import { AnimatedPage } from "@/shared/motion";
import { formatMoney } from "@/shared/format";
import { Button, Row, Table } from "@/shared/ui/controls";
import { FieldError, fieldErrorProps, focusFirstError } from "@/shared/ui/FieldError";
import { Modal } from "@/shared/ui/Modal";
import { BrandLogo, useCompanyName } from "@/shell/BrandLogo";
import { PageHero } from "@/features/shared/PageHero";
import { BranchProfileForm } from "./BranchForms";
import { EMAIL_RE, ImagePicker, PHONE_RE, ProfileCard, dataErr } from "./ProfileCard";
import { SettingsBlock, SettingsFrame, ThemeCards, useSection, type SettingsSection } from "./SettingsFrame";

const SECTIONS: SettingsSection[] = [
  { id: "profile", label: "My profile", icon: UserRound, hint: "Your own account — photo and contact details." },
  { id: "company", label: "Company profile", icon: Building2, hint: "Who the company is. Shown across the app, receipts, quotes and reports." },
  { id: "branding", label: "Logo & branding", icon: Palette, hint: "Logo, display names and the colour theme used everywhere." },
  { id: "documents", label: "Receipts & documents", icon: FileText, hint: "What every patient receipt and price quote prints." },
  { id: "branches", label: "Branches", icon: Store, hint: "Each branch's contact details. Branch Managers can also edit their own." },
  { id: "permissions", label: "Users & permissions", icon: ShieldCheck, hint: "Who can do what, and who controls which settings." },
];

export function SettingsPage() {
  const { user } = useApp();
  const current = useSection(SECTIONS, { appearance: "branding" });
  const [receipt, setReceipt] = useState(false);
  return (
    <AnimatedPage>
      <PageHero eyebrow="Company configuration · whole application" title="Settings" period={false} stats="settings" />
      <SettingsFrame
        sections={SECTIONS}
        current={current}
        basePath="/settings"
        actions={
          (current.id === "branding" || current.id === "documents") && (
            <Button size="sm" variant="secondary" onClick={() => setReceipt(true)}>
              Preview receipt
            </Button>
          )
        }
      >
        {current.id === "profile" && <ProfileCard user={user} managedBy="the company (owner account)" />}
        {current.id === "company" && <CompanyForm />}
        {current.id === "branding" && <Branding />}
        {current.id === "documents" && <Documents />}
        {current.id === "branches" && (
          <div className="st-branches">
            {BRANCHES.map((b) => (
              <SettingsBlock key={b.id} title={`${b.name} branch`} note={`${b.code} · ${b.city}, ${b.country}`}>
                <BranchProfileForm branch={b} compact />
              </SettingsBlock>
            ))}
          </div>
        )}
        {current.id === "permissions" && <Permissions />}
      </SettingsFrame>
      <ReceiptPreview open={receipt} onClose={() => setReceipt(false)} />
    </AnimatedPage>
  );
}

/* ─────────────── Company profile ─────────────── */

function CompanyForm() {
  const { showToast } = useApp();
  const company = useCompanyProfile();
  const receipt = useReceiptProfile();
  const saved = { name: company.name, shortName: company.shortName, owner: company.owner, rcNumber: company.rcNumber, phone: company.phone, website: company.website, address: company.address, motto: receipt.motto, email: receipt.email };
  const [form, setForm] = useState(saved);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const dirty = (Object.keys(form) as (keyof typeof form)[]).some((k) => form[k].trim() !== saved[k]);

  const save = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Enter the company's registered name.";
    if (!form.shortName.trim()) e.shortName = "Enter a short name (used where space is tight).";
    if (form.email.trim() && !EMAIL_RE.test(form.email.trim())) e.email = "Enter a valid email address, e.g. info@example.com.";
    if (form.phone.trim() && !PHONE_RE.test(form.phone.trim())) e.phone = "Enter a valid phone number, e.g. 0803 123 4567.";
    if (form.website.trim() && !/^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(form.website.trim())) e.website = "Enter a web address, e.g. www.example.com.";
    setErrors(e);
    if (Object.keys(e).length) return focusFirstError();
    const clean = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()])) as typeof form;
    const { motto, email, ...companyPatch } = clean;
    updateCompany(companyPatch as Partial<CompanyProfile>);
    updateReceiptProfile({ motto, email });
    const labels: Record<string, string> = { name: "Company name", shortName: "Short name", owner: "Owner", rcNumber: "RC number", phone: "Phone", website: "Website", address: "Address", motto: "Motto", email: "Email" };
    const changed = (Object.keys(clean) as (keyof typeof clean)[]).filter((k) => clean[k] !== saved[k]);
    logAudit({ category: "Settings", action: "Company profile updated", record: clean.name, details: changed.map((k) => (k === "name" ? `Company name: ${saved.name} → ${clean.name}` : labels[k])).join(" · "), branchId: null });
    setForm(clean);
    showToast("Company profile saved");
  };

  const field = (k: keyof typeof form, label: string, props: Record<string, unknown> = {}, full = false) => (
    <label className={`field ${full ? "full" : ""} ${fieldErrorProps(errors[k]).className}`} {...dataErr(errors[k])}>
      {label}
      <input value={form[k]} onChange={set(k)} {...props} />
      <FieldError msg={errors[k]} />
    </label>
  );

  return (
    <div className="st-stack">
      <SettingsBlock title="Identity" note="The registered name prints on every receipt, quote and report.">
        <div className="form-grid">
          {field("name", "Registered company name", { placeholder: COMPANY.name })}
          {field("shortName", "Short name", { placeholder: COMPANY.shortName })}
          {field("motto", "Motto / tagline", { placeholder: "e.g. Accurate results, caring hands" }, true)}
          {field("owner", "Owner / director", { placeholder: "Not on record" })}
          {field("rcNumber", "CAC registration (RC) number", { placeholder: "e.g. RC 1234567", className: "mono" })}
        </div>
      </SettingsBlock>
      <SettingsBlock title="Head-office contact" note="Company email prints on receipts. Each branch has its own phone and address under Branches.">
        <div className="form-grid">
          {field("email", "Company email", { type: "email", placeholder: "info@example.com" })}
          {field("phone", "Head-office phone", { type: "tel", inputMode: "tel", placeholder: "0803 123 4567" })}
          {field("website", "Website", { placeholder: "www.example.com" })}
          <label className="field">
            Operating currency
            <input value="NGN — Nigerian naira" readOnly />
          </label>
          <label className="field full">
            Registered address
            <textarea value={form.address} onChange={set("address")} placeholder="Not on record — not included in the legacy export" />
          </label>
        </div>
      </SettingsBlock>
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
          Save company profile
        </Button>
      </div>
    </div>
  );
}

/* ─────────────── Logo & branding ─────────────── */

function Branding() {
  const { showToast } = useApp();
  const company = useCompanyProfile();
  const name = useCompanyName();
  const setLogo = (logo: string) => {
    updateCompany({ logo });
    logAudit({ category: "Settings", action: logo ? (company.logo ? "Company logo replaced" : "Company logo uploaded") : "Company logo removed", record: name, details: logo ? "Now shown on the sidebar, receipts, quotes and dialogs" : "Back to the built-in mark", branchId: null });
    showToast(logo ? "Logo saved — it now appears across the app" : "Logo removed");
  };
  return (
    <div className="st-stack">
      <SettingsBlock title="Company logo" note="Used on the sidebar, every receipt and quote, and form headers. A square logo with a transparent background works best.">
        <div className="st-logo-row">
          <span className="st-logo-preview">
            <BrandLogo />
          </span>
          <div className="st-logo-copy">
            <strong>{company.logo ? "Uploaded logo" : "Built-in mark (no logo uploaded yet)"}</strong>
            <ImagePicker value={company.logo} onChange={setLogo} label="logo" max={512} />
          </div>
          <div className="st-brand-sample" aria-label="Sidebar preview">
            <span className="sb-logo">
              <BrandLogo />
            </span>
            <span>
              <b>{name}</b>
              <small>Sidebar preview</small>
            </span>
          </div>
        </div>
      </SettingsBlock>
      <SettingsBlock title="Colour theme" note="One theme colour runs through the whole app — sidebar, header, banners, tables and pop-ups. Saved on this device.">
        <ThemeCards />
      </SettingsBlock>
      {(company.name !== DEFAULT_COMPANY.name || company.shortName !== DEFAULT_COMPANY.shortName) && (
        <p className="hint" style={{ margin: 0 }}>
          Showing “{name}” (changed in Company profile). The legacy records still refer to {COMPANY.name}.
        </p>
      )}
    </div>
  );
}

/* ─────────────── Receipts & documents ─────────────── */

function Documents() {
  const { showToast } = useApp();
  const receipt = useReceiptProfile();
  const [thanks, setThanks] = useState(receipt.thankYou);
  const [error, setError] = useState("");
  const dirty = thanks.trim() !== receipt.thankYou;
  return (
    <div className="st-stack">
      <SettingsBlock title="Thank-you message" note="Printed at the bottom of every patient receipt.">
        <label className={`field ${fieldErrorProps(error).className}`} {...dataErr(error)}>
          Message
          <textarea value={thanks} maxLength={240} onChange={(e) => setThanks(e.target.value)} />
          <FieldError msg={error} />
          <small className="lg-muted">{thanks.length}/240</small>
        </label>
        <div className="st-form-actions">
          <Button
            disabled={!dirty}
            onClick={() => {
              if (!thanks.trim()) {
                setError("Write a short message — it closes every receipt.");
                return focusFirstError();
              }
              setError("");
              updateReceiptProfile({ thankYou: thanks.trim() });
              logAudit({ category: "Settings", action: "Receipt message updated", record: "Patient receipts", details: thanks.trim(), branchId: null });
              showToast("Receipt message saved");
            }}
          >
            Save message
          </Button>
        </div>
      </SettingsBlock>
      <SettingsBlock title="What every receipt prints" note="Edit each part where it lives — receipts update automatically.">
        <ul className="st-checklist">
          <li>
            <b>Logo and company name</b> — Logo & branding · Company profile
          </li>
          <li>
            <b>Motto and company email</b> — Company profile {receipt.motto || receipt.email ? "" : "(not added yet)"}
          </li>
          <li>
            <b>Branch address and phone</b> — Branches (or the branch's own Settings)
          </li>
          <li>
            <b>Patient, tests, payment and balance</b> — from the bill itself
          </li>
          <li>
            <b>Paper</b> — 58 mm or 80 mm till roll, or A5, chosen when printing
          </li>
        </ul>
      </SettingsBlock>
    </div>
  );
}

/* ─────────────── Users & permissions ─────────────── */

function Permissions() {
  return (
    <div className="st-stack">
      <SettingsBlock title="Who controls which settings">
        <Table headers={["Account", "Settings they control"]} label="Settings ownership">
          <Row>
            <td>
              <strong>Company Admin</strong>
            </td>
            <td>Everything company-wide: company profile, logo & branding, receipts, every branch, roles — plus their own profile.</td>
          </Row>
          <Row>
            <td>
              <strong>{MANAGER_ROLE}</strong>
            </td>
            <td>Their own branch: branch details and the staff accounts in that branch — plus their own profile.</td>
          </Row>
          <Row>
            <td>
              <strong>Branch staff</strong>
            </td>
            <td>Only their own account: profile photo, contact details and appearance. Nothing branch- or company-wide.</td>
          </Row>
        </Table>
      </SettingsBlock>
      <SettingsBlock title="Roles" note="Roles are given when staff are added in Staff Management.">
        <Table headers={["Role", "Access", "Can"]} label="Roles">
          <Row>
            <td>
              <strong>Company Admin</strong>
            </td>
            <td>Company administration + every branch</td>
            <td>Full access, approvals and configuration. Never registers patients or creates bills.</td>
          </Row>
          {STAFF_ROLES.map((r) => (
            <Row key={r.value}>
              <td>
                <strong>{r.value}</strong>
              </td>
              <td>{r.access}</td>
              <td>{r.permissions.join(" · ")}</td>
            </Row>
          ))}
        </Table>
      </SettingsBlock>
    </div>
  );
}

/* ─────────────── Receipt preview ─────────────── */

/** Sample lines use real catalogue items and their actual prices (FULL BLOOD COUNT, PELVIC ULTRASOUND). */
const RECEIPT_SAMPLE = [1, 125].map((id) => SERVICES.find((s) => s.id === id)).filter((s): s is (typeof SERVICES)[number] => !!s);

export function ReceiptPreview({ open, onClose }: { open: boolean; onClose: () => void }) {
  const b = BRANCHES[0];
  const name = useCompanyName();
  const profile = useReceiptProfile();
  const contact = profile.branches[b.id];
  const total = RECEIPT_SAMPLE.reduce((sum, s) => sum + servicePrice(s, b.currency), 0);
  return (
    <Modal open={open} onClose={onClose} wide title="Receipt branding preview" description="Sample receipt — real catalogue items and prices, no patient data" footer={<Button onClick={onClose}>Done</Button>}>
      <div className="receipt">
        <div className="receipt-head">
          <span className="sb-logo" style={{ width: 52, height: 52 }}>
            <BrandLogo />
          </span>
          <div>
            <strong>{name}</strong>
            {profile.motto && <em className="st-motto">“{profile.motto}”</em>}
            <span>
              {b.name} Branch ({b.code}){contact?.address ? ` · ${contact.address}` : ""}
              {contact?.phone ? ` · Tel: ${contact.phone}` : ""}
              {profile.email ? ` · ${profile.email}` : ""}
            </span>
          </div>
        </div>
        <div className="receipt-title">
          <h2>Payment receipt</h2>
          <span className="mono">SAMPLE</span>
        </div>
        <Table headers={["Diagnostic service", "Qty", { label: "Amount", align: "right" }]}>
          {RECEIPT_SAMPLE.map((s) => (
            <Row key={s.id}>
              <td>{s.name}</td>
              <td>1</td>
              <td className="right">{formatMoney(servicePrice(s, b.currency), b.currency)}</td>
            </Row>
          ))}
        </Table>
        <div className="receipt-total">
          <span>Total paid</span>
          <strong>{formatMoney(total, b.currency)}</strong>
        </div>
        <p className="hint" style={{ textAlign: "center", margin: 0 }}>
          {profile.thankYou} Powered by STANLEY.
        </p>
      </div>
    </Modal>
  );
}
