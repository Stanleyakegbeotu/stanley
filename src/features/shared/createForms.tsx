/**
 * Create flows (branch, PR agent, staff, expense, patient, inventory service).
 * All use the shared FormDialog so they look and behave the same.
 *
 * PR agents and inventory services are actually stored (session-only, separate
 * from the legacy baseline). The others need the database, so saving shows a
 * clear "demo — not saved" confirmation instead of pretending to persist.
 */
import { useMemo, useState } from "react";
import { CalendarDays, ChevronDown, Lock, Plus, X } from "lucide-react";
import { useApp } from "@/app/AppState";
import { ACTIVE_BRANCHES, COMPANY, getBranch } from "@/data/company";
import { CURRENCY_NAMES } from "@/data/regions";
import { GEO_COUNTRIES } from "@/data/geo/countries";
import { EXPENSE_CATEGORIES } from "@/data/types";
import { isoDate } from "@/data/demo/generator";
import { LEGACY_BRANCH_ID, hospitalKey } from "@/data/legacy";
import { CATALOGUE_CATEGORIES } from "@/data/catalogueRules";
import { nextServiceId, nextUserId } from "@/data/userRecords";
import { formatMoney } from "@/shared/format";
import { Button, SelectMenu } from "@/shared/ui/controls";
import { FormDialog, FormField, FormSection, PreviewCard } from "@/shared/ui/FormDialog";
import { SearchSelect, type SearchOption } from "@/shared/ui/SearchSelect";

const TODAY_ISO = isoDate(new Date());
const filled = (s: string) => s.trim().length > 0;
const branchOptions = () => ACTIVE_BRANCHES.map((b) => ({ value: b.id, label: b.name, description: `${b.code} · ${b.city} · ${b.currency}` }));

function Footer({ onCancel, submitLabel, canSubmit, onSubmit, cancelLabel = "Cancel" }: { onCancel: () => void; submitLabel: string; canSubmit: boolean; onSubmit: () => void; cancelLabel?: string }) {
  return (
    <>
      <span className="left">
        Fields marked <b style={{ color: "var(--danger)" }}>*</b> are required
      </span>
      <Button variant="secondary" onClick={onCancel}>
        {cancelLabel}
      </Button>
      <Button disabled={!canSubmit} onClick={onSubmit}>
        {submitLabel}
      </Button>
    </>
  );
}

/** Select trigger used inside FormDialog fields. */
function Trigger({ code, text, placeholder }: { code?: string; text?: string; placeholder?: string }) {
  return (
    <>
      <span className="fd-select-value">
        {code && <b>{code}</b>}
        <span style={{ color: text ? "var(--ink)" : "var(--faint)" }}>{text || placeholder}</span>
      </span>
      <ChevronDown size={18} />
    </>
  );
}

/* ─────────────── Branch ─────────────── */

/** Well-known location codes; anything else is derived by the rule in `branchPrefix`. */
const KNOWN_PREFIXES: Record<string, string> = {
  ABUJA: "ABJ", LAGOS: "LAG", "PORT HARCOURT": "PHC", IBADAN: "IBD", KANO: "KAN", KADUNA: "KAD", ENUGU: "ENU",
  BENIN: "BEN", "BENIN CITY": "BEN", IKEJA: "IKJ", LEKKI: "LEK", "VICTORIA ISLAND": "VIL", OWERRI: "OWR", JOS: "JOS",
  ILORIN: "ILR", ABEOKUTA: "ABK", CALABAR: "CAL", UYO: "UYO", WARRI: "WAR", ASABA: "ASB", AKURE: "AKR", ONITSHA: "ONT",
  MAIDUGURI: "MDG", SOKOTO: "SOK", ZARIA: "ZAR", YOLA: "YOL", MINNA: "MIN", LOKOJA: "LOK", MAKURDI: "MKD", BAUCHI: "BAU",
  ACCRA: "ACC", KUMASI: "KUM", TAKORADI: "TKD", NAIROBI: "NBO", LONDON: "LDN",
};
const GENERIC_WORDS = new Set(["BRANCH", "OFFICE", "CENTRE", "CENTER", "CLINIC", "DIAGNOSTICS", "DIAGNOSTIC", "LAB", "LABORATORY", "THE", "AND", "OF"]);
const VOWELS = new Set(["A", "E", "I", "O", "U"]);

/**
 * Three-letter referral ID prefix generated from the branch name — never typed.
 * Known places use their usual code (Abuja → ABJ, Lagos → LAG); otherwise:
 * one word → first letter + next two consonants; two words → both initials +
 * the next letter of the second word; three or more → the first three initials.
 */
export function branchPrefix(name: string): string {
  const words = name
    .toUpperCase()
    .replace(/[^A-Z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !GENERIC_WORDS.has(w));
  if (!words.length) return "";
  const joined = words.join(" ");
  const known = KNOWN_PREFIXES[joined] ?? KNOWN_PREFIXES[words[0]];
  if (known) return known;
  let code: string;
  if (words.length >= 3) code = words.slice(0, 3).map((w) => w[0]).join("");
  else if (words.length === 2) code = words[0][0] + words[1][0] + (words[1][1] ?? words[0][1] ?? "");
  else {
    const w = words[0];
    const consonants = [...w.slice(1)].filter((ch) => !VOWELS.has(ch));
    code = w[0] + consonants.slice(0, 2).join("");
    if (code.length < 3) code = (code + w.slice(1).replace(new RegExp(`[${code}]`, "g"), "")).slice(0, 3);
  }
  return code.padEnd(3, "X").slice(0, 3);
}

// Search matches the country name and its code only (not the currency name, which would match every USD country for "united").
const COUNTRY_OPTIONS: SearchOption[] = GEO_COUNTRIES.map((c) => ({ value: c.code, label: c.name, description: c.code }));
const CURRENCY_OPTIONS: SearchOption[] = (() => {
  const seen = new Map<string, { name: string; symbol: string; countries: string[] }>();
  for (const c of GEO_COUNTRIES) {
    if (!c.currency) continue;
    const e = seen.get(c.currency) ?? { name: c.currencyName, symbol: c.symbol, countries: [] };
    e.countries.push(c.name);
    seen.set(c.currency, e);
  }
  return [...seen.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([code, e]) => ({ value: code, label: `${code} — ${e.name}`, description: `${e.symbol ? `${e.symbol} · ` : ""}${e.countries.length === 1 ? e.countries[0] : `${e.countries.length} countries`}`, keywords: e.countries.join(" ") }));
})();

export function AddBranchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { showToast } = useApp();
  const [name, setName] = useState("");
  const [country, setCountry] = useState("NG");
  const [region, setRegion] = useState("");
  const [address, setAddress] = useState("");
  const [phones, setPhones] = useState<string[]>([""]);
  const [currency, setCurrency] = useState("NGN");
  const [manager, setManager] = useState("");
  const c = GEO_COUNTRIES.find((x) => x.code === country) ?? GEO_COUNTRIES[0];
  const prefix = branchPrefix(name);
  // The opening date is the day the branch profile is created — recorded automatically.
  const openedOn = new Date();

  const reset = () => {
    setName("");
    setCountry("NG");
    setRegion("");
    setAddress("");
    setPhones([""]);
    setCurrency("NGN");
    setManager("");
  };
  const close = () => {
    reset();
    onClose();
  };

  const validPhones = phones.map((p) => p.trim()).filter(Boolean);
  const steps = [
    { id: "identity", label: "Branch identity", done: filled(name) && prefix.length === 3 },
    { id: "location", label: "Location", done: filled(country) && filled(region) && filled(address) },
    { id: "contact", label: "Contact & currency", done: validPhones.length > 0 && filled(currency) },
    { id: "management", label: "Management", done: filled(manager), optional: true },
  ];
  const ready = steps.every((s) => s.done || s.optional);
  const p = prefix || "AAA";

  return (
    <FormDialog
      open={open}
      onClose={close}
      eyebrow="New branch"
      title={name.trim() ? `Create ${name.trim()}` : "Create a new branch"}
      description="Add the location where patients are registered and billed. The branch inherits the company branding and settings."
      contextLabel="Adding a branch"
      steps={steps}
      aside={
        <PreviewCard
          title="ID preview"
          rows={[
            { label: "Prefix", value: prefix || "—" },
            { label: "Patient ID", value: `${p}-P0000001` },
            { label: "Referral ID", value: `${p}-R0000001` },
          ]}
          note="The prefix is generated from the branch name and starts every patient and referral ID at this branch. It cannot be changed later."
        />
      }
      footer={
        <Footer
          onCancel={close}
          submitLabel="Create branch"
          canSubmit={ready}
          onSubmit={() => {
            showToast(`${name.trim()} branch prepared with prefix ${prefix} and ${currency} (demo — branches are saved once the database is connected)`);
            close();
          }}
        />
      }
    >
      <FormSection id="identity" title="Branch identity">
        <FormField label="Branch name" required>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ikeja Branch" />
        </FormField>
        <FormField label="Referral ID prefix" required as="div" hint="Generated automatically from the branch name — e.g. Abuja → ABJ, Lagos → LAG.">
          <div className="fd-static fd-prefix" aria-live="polite">
            <Lock size={16} />
            {prefix ? <code>{prefix}</code> : <span>Type a branch name</span>}
          </div>
        </FormField>
      </FormSection>

      <FormSection id="location" title="Location">
        <FormField label="Country" required as="div">
          <SearchSelect
            value={country}
            options={COUNTRY_OPTIONS}
            ariaLabel="Country"
            placeholder="Select a country"
            searchPlaceholder={`Search ${GEO_COUNTRIES.length} countries`}
            width={380}
            leading={<b className="fd-lead">{c.code}</b>}
            onChange={(v) => {
              const next = GEO_COUNTRIES.find((x) => x.code === v);
              setCountry(v);
              setRegion("");
              if (next?.currency) setCurrency(next.currency);
            }}
          />
        </FormField>
        <FormField label="State / Region / Province" required as={c.regions.length ? "div" : "label"} hint={c.regions.length ? `${c.regions.length} listed for ${c.name}` : `No regions are listed for ${c.name} — type it in.`}>
          {c.regions.length ? (
            <SearchSelect
              key={c.code}
              value={region}
              options={c.regions.map((r) => ({ value: r, label: r }))}
              ariaLabel="State, region or province"
              placeholder="Search this country's regions"
              searchPlaceholder={`Search ${c.name}'s ${c.regions.length} regions`}
              width={380}
              onChange={setRegion}
            />
          ) : (
            <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="State, region or province" />
          )}
        </FormField>
        <FormField label="Complete physical branch address" required full>
          <textarea value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, building, area and other relevant location details" />
        </FormField>
      </FormSection>

      <FormSection id="contact" title="Contact and currency" note="A branch records every amount in one currency. Company totals keep each currency separate and never add them together.">
        <FormField label="Branch phone numbers" required as="div" hint="At least one number. Add more for the front desk, lab or after-hours line.">
          <div className="fd-phones">
            {phones.map((ph, i) => (
              <div key={i} className="fd-phone">
                <span className="fd-dial">{c.dial || "+"}</span>
                <input
                  value={ph}
                  onChange={(e) => setPhones((list) => list.map((x, j) => (j === i ? e.target.value : x)))}
                  placeholder={i === 0 ? "Main line" : `Additional number ${i}`}
                  inputMode="tel"
                  aria-label={`Phone number ${i + 1}`}
                />
                {phones.length > 1 && (
                  <button type="button" className="fd-icon-btn" aria-label={`Remove phone number ${i + 1}`} onClick={() => setPhones((list) => list.filter((_, j) => j !== i))}>
                    <X size={16} />
                  </button>
                )}
              </div>
            ))}
            {phones.length < 5 && (
              <button type="button" className="fd-add-line" onClick={() => setPhones((list) => [...list, ""])}>
                <Plus size={16} /> Add another phone number
              </button>
            )}
          </div>
        </FormField>
        <FormField label="Branch currency" required as="div" hint={`Defaults to ${c.name}'s currency. ${CURRENCY_OPTIONS.length} currencies available.`}>
          <SearchSelect
            value={currency}
            options={CURRENCY_OPTIONS}
            ariaLabel="Branch currency"
            placeholder="Select a currency"
            searchPlaceholder="Search by code, name or country"
            width={380}
            leading={<b className="fd-lead">{currency || "—"}</b>}
            onChange={setCurrency}
          />
        </FormField>
      </FormSection>

      <FormSection id="management" title="Management">
        <FormField label="Branch manager" hint="You can assign or change the manager later from Staff Management.">
          <input value={manager} onChange={(e) => setManager(e.target.value)} placeholder="Full name" />
        </FormField>
        <FormField label="Opening date" required as="div" hint="Recorded automatically as the date this branch profile is created.">
          <div className="fd-static">
            <CalendarDays size={17} />
            {openedOn.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric" })}
          </div>
        </FormField>
      </FormSection>
    </FormDialog>
  );
}

/* ─────────────── PR agent (saved, session-only) ─────────────── */

/** `initialHospital` preselects a hospital (e.g. when adding from inside a hospital's agent list). */
export function AddAgentDialog({ open, onClose, hospitals, initialHospital = "" }: { open: boolean; onClose: () => void; hospitals: { key: string; count: number; raw: string[] }[]; initialHospital?: string }) {
  const { addAgent, showToast, userAgents } = useApp();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [hospital, setHospital] = useState(initialHospital);
  const [hospitalChosen, setHospitalChosen] = useState(!!initialHospital);
  const close = () => {
    setName("");
    setPhone("");
    setHospital(initialHospital);
    setHospitalChosen(!!initialHospital);
    onClose();
  };
  const options: SearchOption[] = [
    { value: "", label: "No hospital assigned", keywords: "none unassigned" },
    ...hospitals.map((h) => ({ value: h.key, label: h.key, description: `${h.count} agent${h.count === 1 ? "" : "s"}`, keywords: h.raw.join(" ") })),
  ];
  const steps = [
    { id: "details", label: "Agent details", done: filled(name) },
    { id: "assignment", label: "Hospital assignment", done: hospitalChosen, optional: true },
  ];
  const legacyBranch = getBranch(LEGACY_BRANCH_ID);

  return (
    <FormDialog
      open={open}
      onClose={close}
      eyebrow="New PR agent"
      title={name.trim() ? `Add ${name.trim()}` : "Add a PR agent"}
      description="PR agents are the doctors and representatives who refer patients. New agents are stored separately from the legacy baseline, which is never modified."
      contextLabel="Adding a PR agent"
      steps={steps}
      aside={
        <PreviewCard
          title="Agent record"
          rows={[
            { label: "Agent ID", value: `#${nextUserId(userAgents)}` },
            { label: "Hospital", value: hospital ? hospitalKey(hospital) : "Unassigned" },
            { label: "Phone", value: filled(phone) ? phone.trim() : "N/A" },
          ]}
          note="A blank phone is saved as “N/A”, matching the legacy convention."
        />
      }
      footer={
        <Footer
          onCancel={close}
          submitLabel="Add PR agent"
          canSubmit={filled(name)}
          onSubmit={() => {
            const rec = addAgent({ name, phone, hospital: hospital ? hospitalKey(hospital) : "" });
            showToast(`${rec.name} added${rec.hospital ? ` to ${rec.hospital}` : ""}`);
            close();
          }}
        />
      }
    >
      <FormSection id="details" title="Agent details">
        <FormField label="Full name" required full>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Dr Amaka Obi" />
        </FormField>
        <FormField label="Phone number" hint="Leave blank if unknown.">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+234 …" inputMode="tel" />
        </FormField>
        <FormField label="Branch" required as="div">
          <div className="fd-static">
            {legacyBranch?.name} · {legacyBranch?.code}
          </div>
        </FormField>
      </FormSection>
      <FormSection id="assignment" title="Hospital assignment" note="Hospitals are listed from existing agent assignments. Typing a code that isn't listed creates a new hospital code.">
        <FormField label="Assigned hospital" full as="div">
          <SearchSelect
            value={hospital}
            options={options}
            ariaLabel="Assigned hospital"
            placeholder="No hospital assigned"
            searchPlaceholder="Search or type a new hospital code"
            allowCreate
            createLabel={(t) => `Use new hospital code “${t.toUpperCase()}”`}
            onChange={(v) => {
              setHospital(v);
              setHospitalChosen(true);
            }}
          />
        </FormField>
      </FormSection>
    </FormDialog>
  );
}

/* ─────────────── Staff ─────────────── */

const ROLES = [
  { value: "Branch Manager", access: "Branch billing, staff, expenses and settings" },
  { value: "Front Desk", access: "Patient registration and billing" },
  { value: "Laboratory Scientist", access: "Lab orders and results" },
  { value: "Radiographer", access: "Imaging orders and reports" },
  { value: "Sonographer", access: "Ultrasound orders and reports" },
  { value: "Accountant", access: "Payments, expenses and reports" },
];

export function AddStaffDialog({ open, onClose, branchId }: { open: boolean; onClose: () => void; branchId?: string | null }) {
  const { showToast } = useApp();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [branch, setBranch] = useState(branchId ?? ACTIVE_BRANCHES[0]?.id ?? "");
  const [role, setRole] = useState("");
  const [employment, setEmployment] = useState("Full-time");
  const [start, setStart] = useState("");
  const close = () => {
    setName("");
    setEmail("");
    setPhone("");
    setRole("");
    setEmployment("Full-time");
    setStart("");
    onClose();
  };
  const steps = [
    { id: "personal", label: "Personal details", done: filled(name) && (filled(email) || filled(phone)) },
    { id: "role", label: "Role & branch", done: filled(role) && filled(branch) },
    { id: "employment", label: "Employment", done: filled(start) },
  ];
  const r = ROLES.find((x) => x.value === role);
  const b = getBranch(branch);

  return (
    <FormDialog
      open={open}
      onClose={close}
      eyebrow="New staff member"
      title={name.trim() ? `Add ${name.trim()}` : "Add a staff member"}
      description="Staff are assigned to one branch. Their role decides which branch workspaces they can open."
      contextLabel="Adding staff"
      steps={steps}
      aside={
        <PreviewCard
          title="Access preview"
          rows={[
            { label: "Role", value: role || "Not chosen" },
            { label: "Branch", value: b ? `${b.name} · ${b.code}` : "—" },
          ]}
          note={r ? r.access : "Choose a role to see what this person can access."}
        />
      }
      footer={
        <Footer
          onCancel={close}
          submitLabel="Add staff member"
          canSubmit={steps.every((s) => s.done)}
          onSubmit={() => {
            showToast(`${name.trim()} prepared as ${role} at ${b?.name} (demo — staff accounts need the database and sign-in)`);
            close();
          }}
        />
      }
    >
      <FormSection id="personal" title="Personal details" note="Provide at least an email address or a phone number.">
        <FormField label="Full name" required full>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Chiamaka Eze" />
        </FormField>
        <FormField label="Email address">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
        </FormField>
        <FormField label="Phone number">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+234 …" inputMode="tel" />
        </FormField>
      </FormSection>
      <FormSection id="role" title="Role and branch">
        <FormField label="Branch" required as="div">
          <SelectMenu value={branch} ariaLabel="Branch" options={branchOptions()} onChange={(v: string) => setBranch(v)}>
            <Trigger code={b?.code} text={b?.name} placeholder="Select a branch" />
          </SelectMenu>
        </FormField>
        <FormField label="Role" required full as="div">
          <div className="fd-tiles" role="group" aria-label="Role">
            {ROLES.map((x) => (
              <button key={x.value} type="button" className="fd-tile" aria-pressed={role === x.value} onClick={() => setRole(x.value)}>
                <strong>{x.value}</strong>
                <small>{x.access}</small>
              </button>
            ))}
          </div>
        </FormField>
      </FormSection>
      <FormSection id="employment" title="Employment">
        <FormField label="Start date" required>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </FormField>
        <FormField label="Employment type" required as="div">
          <SelectMenu
            value={employment}
            ariaLabel="Employment type"
            options={["Full-time", "Part-time", "Contract", "Locum"].map((v) => ({ value: v, label: v }))}
            onChange={(v: string) => setEmployment(v)}
          >
            <Trigger text={employment} />
          </SelectMenu>
        </FormField>
      </FormSection>
    </FormDialog>
  );
}

/* ─────────────── Expense ─────────────── */

export function RecordExpenseDialog({ open, onClose, branchId }: { open: boolean; onClose: () => void; branchId?: string | null }) {
  const { showToast, user } = useApp();
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(TODAY_ISO);
  const [branch, setBranch] = useState(branchId ?? ACTIVE_BRANCHES[0]?.id ?? "");
  const [supplier, setSupplier] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const b = getBranch(branch);
  const currency = b?.currency ?? "NGN";
  const value = Number(amount.replace(/,/g, ""));
  const validAmount = Number.isFinite(value) && value > 0;
  const close = () => {
    setDescription("");
    setCategory("");
    setAmount("");
    setDate(TODAY_ISO);
    setSupplier("");
    setReference("");
    setNotes("");
    onClose();
  };
  const steps = [
    { id: "details", label: "Expense details", done: filled(description) && filled(category) && validAmount },
    { id: "when", label: "Date & branch", done: filled(date) && filled(branch) },
    { id: "supporting", label: "Supplier & notes", done: filled(supplier) || filled(reference) || filled(notes), optional: true },
  ];

  return (
    <FormDialog
      open={open}
      onClose={close}
      eyebrow="New expense"
      title="Record an expense"
      description="New expenses are submitted for approval. Only approved expenses count towards reported totals."
      contextLabel="Recording an expense"
      steps={steps}
      aside={
        <PreviewCard
          title="Approval route"
          rows={[
            { label: "Amount", value: validAmount ? formatMoney(value, currency) : "—" },
            { label: "Submitted by", value: user.name },
            { label: "Status", value: "Pending approval" },
          ]}
          note="Counts towards expense totals once a branch manager or company admin approves it."
        />
      }
      footer={
        <Footer
          onCancel={close}
          submitLabel="Submit for approval"
          canSubmit={steps.every((s) => s.done || s.optional)}
          onSubmit={() => {
            showToast(`${description.trim()} · ${formatMoney(value, currency)} submitted for approval (demo — not saved)`);
            close();
          }}
        />
      }
    >
      <FormSection id="details" title="Expense details">
        <FormField label="Description" required full>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Reagent restock" />
        </FormField>
        <FormField label="Category" required as="div">
          <SelectMenu value={category} ariaLabel="Expense category" options={EXPENSE_CATEGORIES.map((c) => ({ value: c as string, label: c }))} onChange={(v: string) => setCategory(v)}>
            <Trigger text={category} placeholder="Select a category" />
          </SelectMenu>
        </FormField>
        <FormField label={`Amount (${currency})`} required hint={`Recorded in the branch currency, ${CURRENCY_NAMES[currency]}.`}>
          <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))} placeholder="0.00" inputMode="decimal" />
        </FormField>
      </FormSection>
      <FormSection id="when" title="Date and branch">
        <FormField label="Expense date" required>
          <input type="date" value={date} max={TODAY_ISO} onChange={(e) => setDate(e.target.value)} />
        </FormField>
        <FormField label="Branch" required as="div">
          <SelectMenu value={branch} ariaLabel="Branch" options={branchOptions()} onChange={(v: string) => setBranch(v)}>
            <Trigger code={b?.code} text={b?.name} placeholder="Select a branch" />
          </SelectMenu>
        </FormField>
      </FormSection>
      <FormSection id="supporting" title="Supplier and notes">
        <FormField label="Supplier">
          <input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Who was paid" />
        </FormField>
        <FormField label="Receipt or invoice number">
          <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. INV-2041" />
        </FormField>
        <FormField label="Notes for the approver" full>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the approver should know" />
        </FormField>
      </FormSection>
    </FormDialog>
  );
}

/* ─────────────── Patient ─────────────── */

export function RegisterPatientDialog({ open, onClose, branchId }: { open: boolean; onClose: () => void; branchId?: string | null }) {
  const { showToast, agents } = useApp();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [sex, setSex] = useState("");
  const [dob, setDob] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [kinName, setKinName] = useState("");
  const [kinPhone, setKinPhone] = useState("");
  const [branch, setBranch] = useState(branchId ?? ACTIVE_BRANCHES[0]?.id ?? "");
  const [referrer, setReferrer] = useState("");
  const b = getBranch(branch);
  const agentOptions = useMemo<SearchOption[]>(
    () => [{ value: "", label: "Walk-in (no referrer)" }, ...agents.map((a) => ({ value: String(a.id), label: a.name, description: a.hospital ? a.hospital.toUpperCase() : "No hospital assigned", keywords: `${a.phone} ${a.id}` }))],
    [agents],
  );
  const close = () => {
    setFirst("");
    setLast("");
    setSex("");
    setDob("");
    setPhone("");
    setEmail("");
    setAddress("");
    setKinName("");
    setKinPhone("");
    setReferrer("");
    onClose();
  };
  const steps = [
    { id: "personal", label: "Personal details", done: filled(first) && filled(last) && filled(sex) && filled(dob) },
    { id: "contact", label: "Contact", done: filled(phone) },
    { id: "registration", label: "Registration & referral", done: filled(branch) },
    { id: "kin", label: "Next of kin", done: filled(kinName) || filled(kinPhone), optional: true },
  ];
  const ref = agents.find((a) => String(a.id) === referrer);

  return (
    <FormDialog
      open={open}
      onClose={close}
      eyebrow="New patient"
      title={filled(first) || filled(last) ? `Register ${`${first} ${last}`.trim()}` : "Register a patient"}
      description="Patients are registered at one branch and can be found from every branch afterwards."
      contextLabel="Registering a patient"
      steps={steps}
      aside={
        <PreviewCard
          title="Patient record"
          rows={[
            { label: "Patient ID", value: "Assigned on save" },
            { label: "Branch", value: b ? `${b.name} · ${b.code}` : "—" },
            { label: "Referred by", value: ref ? ref.name : "Walk-in" },
          ]}
          note="Patient records were not part of the legacy export. Registration is a demo until the database is connected."
        />
      }
      footer={
        <Footer
          onCancel={close}
          submitLabel="Register patient"
          canSubmit={steps.every((s) => s.done || s.optional)}
          onSubmit={() => {
            showToast(`${first.trim()} ${last.trim()} registered at ${b?.name} (demo — not saved)`);
            close();
          }}
        />
      }
    >
      <FormSection id="personal" title="Personal details">
        <FormField label="First name" required>
          <input value={first} onChange={(e) => setFirst(e.target.value)} placeholder="e.g. Ngozi" />
        </FormField>
        <FormField label="Last name" required>
          <input value={last} onChange={(e) => setLast(e.target.value)} placeholder="e.g. Okafor" />
        </FormField>
        <FormField label="Sex" required as="div">
          <div className="fd-tiles" role="group" aria-label="Sex" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
            {["Female", "Male"].map((s) => (
              <button key={s} type="button" className="fd-tile" aria-pressed={sex === s} onClick={() => setSex(s)}>
                <strong>{s}</strong>
              </button>
            ))}
          </div>
        </FormField>
        <FormField label="Date of birth" required>
          <input type="date" value={dob} max={TODAY_ISO} onChange={(e) => setDob(e.target.value)} />
        </FormField>
      </FormSection>
      <FormSection id="contact" title="Contact">
        <FormField label="Phone number" required>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+234 …" inputMode="tel" />
        </FormField>
        <FormField label="Email address">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
        </FormField>
        <FormField label="Home address" full>
          <textarea value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, area, city" />
        </FormField>
      </FormSection>
      <FormSection id="registration" title="Registration and referral">
        <FormField label="Registration branch" required as="div">
          <SelectMenu value={branch} ariaLabel="Registration branch" options={branchOptions()} onChange={(v: string) => setBranch(v)}>
            <Trigger code={b?.code} text={b?.name} placeholder="Select a branch" />
          </SelectMenu>
        </FormField>
        <FormField label="Referring PR agent" as="div">
          <SearchSelect
            value={referrer}
            options={agentOptions}
            ariaLabel="Referring PR agent"
            placeholder="Walk-in (no referrer)"
            searchPlaceholder={`Search ${agents.length} PR agents by name, hospital or phone`}
            onChange={setReferrer}
          />
        </FormField>
      </FormSection>
      <FormSection id="kin" title="Next of kin">
        <FormField label="Full name">
          <input value={kinName} onChange={(e) => setKinName(e.target.value)} placeholder="Contact in an emergency" />
        </FormField>
        <FormField label="Phone number">
          <input value={kinPhone} onChange={(e) => setKinPhone(e.target.value)} placeholder="+234 …" inputMode="tel" />
        </FormField>
      </FormSection>
    </FormDialog>
  );
}

/* ─────────────── Inventory service ─────────────── */

/** Saved for the session (separate from the read-only legacy catalogue). `initialCategory` preselects a category. */
export function AddServiceDialog({ open, onClose, initialCategory = "" }: { open: boolean; onClose: () => void; initialCategory?: string }) {
  const { showToast, addService, inventory } = useApp();
  const [name, setName] = useState("");
  const [category, setCategory] = useState(initialCategory);
  const [price, setPrice] = useState("");
  const [turnaround, setTurnaround] = useState("");
  const [sample, setSample] = useState("");
  const [notes, setNotes] = useState("");
  const value = Number(price.replace(/,/g, ""));
  const validPrice = Number.isFinite(value) && value > 0;
  const close = () => {
    setName("");
    setCategory(initialCategory);
    setPrice("");
    setTurnaround("");
    setSample("");
    setNotes("");
    onClose();
  };
  const steps = [
    { id: "details", label: "Service details", done: filled(name) && filled(category) },
    { id: "pricing", label: "Pricing", done: validPrice },
    { id: "handling", label: "Handling", done: filled(turnaround) || filled(sample) || filled(notes), optional: true },
  ];
  const categoryOptions: SearchOption[] = [
    ...CATALOGUE_CATEGORIES.map((c) => ({ value: c.key, label: inventory.categoryNames[c.key] ?? c.key, description: `${c.itemCount} item${c.itemCount === 1 ? "" : "s"}${inventory.categoryNames[c.key] ? ` · ${c.key}` : ""}`, keywords: `${c.key} ${c.rawVariants.join(" ")}` })),
    ...[...new Set(inventory.added.map((s) => s.category))].filter((k) => !CATALOGUE_CATEGORIES.some((c) => c.key === k)).map((k) => ({ value: k, label: k, description: "Added in STANLEY" })),
  ];

  return (
    <FormDialog
      open={open}
      onClose={close}
      eyebrow="New service"
      title={name.trim() ? `Add ${name.trim()}` : "Add a diagnostic service"}
      description={`Add a billable service to the ${COMPANY.shortName} catalogue. The legacy catalogue is read-only; new services are stored separately.`}
      contextLabel="Adding to inventory"
      steps={steps}
      aside={
        <PreviewCard
          title="Catalogue entry"
          rows={[
            { label: "Category", value: category || "—" },
            { label: "Price", value: validPrice ? formatMoney(value, "NGN") : "—" },
            { label: "Service ID", value: `#${nextServiceId(inventory.added)}` },
          ]}
          note="Prices are in NGN, like the legacy catalogue. New services are kept for this session until the database is connected."
        />
      }
      footer={
        <Footer
          onCancel={close}
          submitLabel="Add service"
          canSubmit={steps.every((s) => s.done || s.optional)}
          onSubmit={() => {
            const rec = addService({ name: name.trim(), category: category.trim().toUpperCase(), price: value, turnaround: turnaround.trim() || undefined, sample: sample.trim() || undefined, notes: notes.trim() || undefined });
            showToast(`${rec.name} added to ${rec.category} at ${formatMoney(rec.price, "NGN")} (this session)`);
            close();
          }}
        />
      }
    >
      <FormSection id="details" title="Service details">
        <FormField label="Service name" required full>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Lipid profile" />
        </FormField>
        <FormField label="Category" required full as="div" hint="Choose an existing category or type a new one.">
          <SearchSelect
            value={category}
            options={categoryOptions}
            ariaLabel="Category"
            placeholder="Select a category"
            searchPlaceholder="Search or type a new category"
            allowCreate
            createLabel={(t) => `Use new category “${t.toUpperCase()}”`}
            onChange={(v) => setCategory(v.toUpperCase())}
          />
        </FormField>
      </FormSection>
      <FormSection id="pricing" title="Pricing">
        <FormField label="Price (NGN)" required>
          <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.,]/g, ""))} placeholder="0" inputMode="decimal" />
        </FormField>
        <FormField label="Available at" as="div">
          <div className="fd-static">All branches</div>
        </FormField>
      </FormSection>
      <FormSection id="handling" title="Handling">
        <FormField label="Turnaround time">
          <input value={turnaround} onChange={(e) => setTurnaround(e.target.value)} placeholder="e.g. Same day" />
        </FormField>
        <FormField label="Sample or preparation">
          <input value={sample} onChange={(e) => setSample(e.target.value)} placeholder="e.g. Fasting blood sample" />
        </FormField>
        <FormField label="Notes" full>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Instructions for staff" />
        </FormField>
      </FormSection>
    </FormDialog>
  );
}
