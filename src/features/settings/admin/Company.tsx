/**
 * Settings → Company: company information, branding (logos, display names,
 * theme), receipt text and which settings are company-wide vs branch-specific.
 */
import { useState } from "react";
import { useApp } from "@/app/AppState";
import { BRANCHES, COMPANY, SERVICES, servicePrice } from "@/data/company";
import { logAudit } from "@/services/audit";
import { updateReceiptProfile, useReceiptProfile } from "@/services/receiptProfile";
import { updateCompany, useCompanyProfile, type CompanyProfile } from "@/services/settingsStore";
import { formatMoney } from "@/shared/format";
import { Button, Row, Table } from "@/shared/ui/controls";
import { FieldError, fieldErrorProps, focusFirstError } from "@/shared/ui/FieldError";
import { Modal } from "@/shared/ui/Modal";
import { BrandLogo, useCompanyName } from "@/shell/BrandLogo";
import { EMAIL_RE, ImagePicker, PHONE_RE, dataErr } from "../ProfileCard";
import { ThemeCards } from "../SettingsFrame";
import { Panel, ScopeTag } from "./ui";

type Form = Record<"name" | "shortName" | "registeredName" | "owner" | "rcNumber" | "phone" | "website" | "address" | "city" | "state" | "country" | "postalCode" | "contactPerson" | "description" | "motto" | "email", string>;

export function CompanySection() {
  const { showToast } = useApp();
  const company = useCompanyProfile();
  const receipt = useReceiptProfile();
  const saved: Form = {
    name: company.name,
    shortName: company.shortName,
    registeredName: company.registeredName,
    owner: company.owner,
    rcNumber: company.rcNumber,
    phone: company.phone,
    website: company.website,
    address: company.address,
    city: company.city,
    state: company.state,
    country: company.country,
    postalCode: company.postalCode,
    contactPerson: company.contactPerson,
    description: company.description,
    motto: receipt.motto,
    email: receipt.email,
  };
  const [form, setForm] = useState(saved);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const dirty = (Object.keys(form) as (keyof Form)[]).some((k) => form[k].trim() !== (saved[k] ?? ""));
  // Organisation ID: assigned by STANLEY from the company short name — the key the cloud database will use.
  const orgId = `ORG-${(company.shortName || COMPANY.shortName).replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase()}-001`;

  const save = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Enter the company's name.";
    if (!form.shortName.trim()) e.shortName = "Enter a short name (used where space is tight).";
    if (form.email.trim() && !EMAIL_RE.test(form.email.trim())) e.email = "Enter a valid email address, e.g. info@example.com.";
    if (form.phone.trim() && !PHONE_RE.test(form.phone.trim())) e.phone = "Enter a valid phone number, e.g. 0803 123 4567.";
    if (form.website.trim() && !/^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(form.website.trim())) e.website = "Enter a web address, e.g. www.example.com.";
    if (form.postalCode.trim() && !/^[\w\s-]{3,10}$/.test(form.postalCode.trim())) e.postalCode = "Enter a valid postal code.";
    setErrors(e);
    if (Object.keys(e).length) return focusFirstError();
    const clean = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()])) as Form;
    const { motto, email, ...companyPatch } = clean;
    updateCompany(companyPatch as Partial<CompanyProfile>);
    updateReceiptProfile({ motto, email });
    const changed = (Object.keys(clean) as (keyof Form)[]).filter((k) => clean[k] !== (saved[k] ?? ""));
    logAudit({ category: "Settings", action: "Company profile updated", record: clean.name, details: changed.map((k) => (k === "name" ? `Name: ${saved.name} → ${clean.name}` : LABEL[k])).join(" · "), branchId: null });
    setForm(clean);
    showToast("Company information saved");
  };

  const field = (k: keyof Form, label: string, props: Record<string, unknown> = {}, full = false) => (
    <label className={`field ${full ? "full" : ""} ${fieldErrorProps(errors[k]).className}`} {...dataErr(errors[k])}>
      {label}
      <input value={form[k]} onChange={set(k)} {...props} />
      <FieldError msg={errors[k]} />
    </label>
  );

  return (
    <div className="sc-stack">
      <Panel title="Company information" scope="global" note="Printed on every receipt, quote and report, and shown across the app.">
        <div className="form-grid">
          {field("name", "Company display name", { placeholder: COMPANY.name })}
          {field("shortName", "Short name", { placeholder: COMPANY.shortName })}
          {field("registeredName", "Registered business name", { placeholder: "As registered with the CAC" })}
          {field("rcNumber", "Registration (RC) number", { placeholder: "e.g. RC 1234567", className: "mono" })}
          <label className="field">
            Organisation ID
            <input value={orgId} readOnly className="mono" />
            <small className="lg-muted">Assigned by STANLEY — the key the cloud database will use.</small>
          </label>
          {field("owner", "Owner / director", { placeholder: "Not on record" })}
          {field("contactPerson", "Primary contact person", { placeholder: "Who to contact about the account" })}
          {field("motto", "Motto / tagline (on receipts)", { placeholder: "e.g. Accurate results, caring hands" })}
          <label className="field full">
            Business description
            <textarea value={form.description} onChange={set("description")} maxLength={400} placeholder="What the company does — e.g. Diagnostic laboratory, imaging and cardiology services" />
          </label>
        </div>
      </Panel>

      <Panel title="Head-office contact & address" scope="global" note="Company email prints on receipts. Each branch has its own phone and address (Branch Management).">
        <div className="form-grid">
          {field("email", "Company email", { type: "email", placeholder: "info@example.com" })}
          {field("phone", "Company phone", { type: "tel", inputMode: "tel", placeholder: "0803 123 4567" })}
          {field("website", "Website", { placeholder: "www.example.com" })}
          <label className="field">
            Operating currency
            <input value="NGN — Nigerian naira" readOnly />
          </label>
          <label className="field full">
            Registered address
            <textarea value={form.address} onChange={set("address")} placeholder="Street and area — not included in the legacy export" />
          </label>
          {field("city", "City", { placeholder: "e.g. Abuja" })}
          {field("state", "State", { placeholder: "e.g. FCT" })}
          {field("country", "Country", { placeholder: "Nigeria" })}
          {field("postalCode", "Postal code", { placeholder: "e.g. 900001" })}
        </div>
      </Panel>

      <div className="st-form-actions sc-sticky-actions">
        {dirty && (
          <Button
            variant="secondary"
            onClick={() => {
              setForm(saved);
              setErrors({});
            }}
          >
            Cancel changes
          </Button>
        )}
        <Button disabled={!dirty} onClick={save}>
          Save company information
        </Button>
      </div>

      <BrandingPanel />
      <ReceiptPanel />
      <ScopePanel />
    </div>
  );
}

const LABEL: Record<keyof Form, string> = { name: "Display name", shortName: "Short name", registeredName: "Registered name", owner: "Owner", rcNumber: "RC number", phone: "Phone", website: "Website", address: "Address", city: "City", state: "State", country: "Country", postalCode: "Postal code", contactPerson: "Contact person", description: "Description", motto: "Motto", email: "Email" };

function BrandingPanel() {
  const { showToast } = useApp();
  const company = useCompanyProfile();
  const name = useCompanyName();
  const setLogo = (key: "logo" | "receiptLogo", label: string) => (value: string) => {
    updateCompany({ [key]: value } as Partial<CompanyProfile>);
    logAudit({ category: "Settings", action: value ? `${label} uploaded` : `${label} removed`, record: name, details: key === "logo" ? "Sidebar, dialogs and documents" : "Receipts and price quotes", branchId: null });
    showToast(value ? `${label} saved` : `${label} removed`);
  };
  return (
    <Panel title="Logo & branding" scope="global" note="Logos appear across the app and on documents. A square logo with a transparent background works best.">
      <div className="sc-logos">
        <div className="sc-logo-card">
          <span className="st-logo-preview">
            <BrandLogo />
          </span>
          <div>
            <b>Main logo</b>
            <small>Sidebar, form headers, report headers</small>
            <ImagePicker value={company.logo} onChange={setLogo("logo", "Main logo")} label="logo" max={512} />
          </div>
        </div>
        <div className="sc-logo-card">
          <span className="st-logo-preview">
            <BrandLogo receipt />
          </span>
          <div>
            <b>Receipt logo</b>
            <small>{company.receiptLogo ? "Used on receipts and quotes" : "Not set — receipts use the main logo"}</small>
            <ImagePicker value={company.receiptLogo} onChange={setLogo("receiptLogo", "Receipt logo")} label="receipt logo" max={512} />
          </div>
        </div>
      </div>
      <div className="sc-sub">
        <b>Colour theme</b>
        <small>One theme colour runs through the whole app. Saved on this device.</small>
      </div>
      <ThemeCards />
    </Panel>
  );
}

function ReceiptPanel() {
  const { showToast } = useApp();
  const receipt = useReceiptProfile();
  const [thanks, setThanks] = useState(receipt.thankYou);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState("");
  return (
    <Panel title="Receipts & documents" scope="global" note="What every patient receipt prints. Branch address and phone come from each branch." actions={<Button size="sm" variant="secondary" onClick={() => setPreview(true)}>Preview receipt</Button>}>
      <label className={`field ${fieldErrorProps(error).className}`} {...dataErr(error)}>
        Thank-you message
        <textarea value={thanks} maxLength={240} onChange={(e) => setThanks(e.target.value)} />
        <FieldError msg={error} />
        <small className="lg-muted">{thanks.length}/240</small>
      </label>
      <div className="st-form-actions">
        <Button
          size="sm"
          disabled={thanks.trim() === receipt.thankYou}
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
      <ReceiptPreview open={preview} onClose={() => setPreview(false)} />
    </Panel>
  );
}

function ScopePanel() {
  const rows: [string, "global" | "branch" | "overridden" | "admin", string][] = [
    ["Company information, logos, receipt text", "global", "Set here; every branch uses it"],
    ["Payment methods", "overridden", "Company default; a branch can have its own set (Billing & Payments)"],
    ["Branch phone, address, email, hours", "branch", "Each branch's own details (Branch Management)"],
    ["Patient ID code (ABJ, LAG…)", "branch", "One unique code per branch"],
    ["Discount limit, split payments, registration rules", "global", "Same rules at every branch"],
    ["Commission rate", "global", "One company rate; an agent can have their own"],
    ["Service catalogue & prices", "global", "One company-wide price list"],
    ["Roles & permissions", "admin", "Only the Company Admin changes them"],
  ];
  return (
    <Panel title="Where each setting applies" note="Company-wide settings apply to every branch; branch-specific ones belong to one branch; a branch override replaces the company default for that branch only.">
      <Table headers={["Setting", "Scope", "How it works"]} label="Setting scopes">
        {rows.map(([s, scope, how]) => (
          <Row key={s}>
            <td>
              <strong>{s}</strong>
            </td>
            <td>
              <ScopeTag scope={scope === "overridden" ? "overridden" : scope} />
            </td>
            <td>{how}</td>
          </Row>
        ))}
      </Table>
    </Panel>
  );
}

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
            <BrandLogo receipt />
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
