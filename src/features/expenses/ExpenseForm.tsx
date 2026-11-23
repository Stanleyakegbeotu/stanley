/**
 * Record (or edit) a branch expense — what was spent, how much, how it was
 * paid, and who approved it. Approval is never optional: either name the
 * person who already approved it (usually the Branch Manager) or send it to
 * them for approval.
 */
import { useMemo, useState } from "react";
import { BadgeCheck, Check, Hourglass } from "lucide-react";
import { categoryIcon } from "./categoryIcons";
import { useApp } from "@/app/AppState";
import { BRANCH_MANAGER_PLACEHOLDER, CURRENT_USER, getBranch } from "@/data/company";
import { PAYMENT_METHODS, type PaymentMethod } from "@/data/types";
import { isoDate } from "@/data/demo/generator";
import { CATEGORY_HINT, CATEGORY_ITEMS, LARGE_EXPENSE, OUTSOURCED, RECORD_CATEGORIES, expenseApprovers, recordExpense, savedOnDevice, updateExpense, type ExpenseRecord, type Person } from "@/services/expenses";
import { formatMoney } from "@/shared/format";
import { SelectMenu } from "@/shared/ui/controls";
import { FormDialog, FormField, FormSection, PreviewCard } from "@/shared/ui/FormDialog";
import { Footer, Trigger, useFieldErrors } from "@/features/shared/createForms";
import { ImagePicker } from "@/features/settings/ProfileCard";

const METHOD_HINT: Record<PaymentMethod, string> = { Cash: "Paid from the till / petty cash", POS: "Card payment", Transfer: "Bank transfer" };
const filled = (s: string) => s.trim().length > 0;
const digits = (s: string) => s.replace(/[^\d]/g, "");
const withCommas = (s: string) => (s ? Number(s).toLocaleString("en-NG") : "");

export function ExpenseForm({ open, onClose, branchId, editing, onSaved }: { open: boolean; onClose: () => void; branchId: string; editing?: ExpenseRecord | null; onSaved?: (r: { id: string; status: string }) => void }) {
  const v = useFieldErrors(open);
  const { user, staff, showToast } = useApp();
  const branch = getBranch(branchId);
  const today = isoDate(new Date());
  const me: Person = { name: user.name, role: user.role };
  const approvers = useMemo(() => {
    const list = expenseApprovers(staff, branchId, { name: BRANCH_MANAGER_PLACEHOLDER.name, role: BRANCH_MANAGER_PLACEHOLDER.role }, { name: CURRENT_USER.name, role: CURRENT_USER.role });
    // A manager recording their own expense approves it themselves.
    if (user.kind === "manager" && !list.some((a) => a.value === `${me.name}|${me.role}`)) list.unshift({ value: `${me.name}|${me.role}`, label: me.name, description: `${me.role} · you`, person: me });
    return list.map((a) => (a.person.name === me.name ? { ...a, description: `${a.person.role} · you` } : a));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staff, branchId, user.kind, me.name, me.role]);

  const [category, setCategory] = useState(editing?.category ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [amount, setAmount] = useState(editing ? String(editing.amount) : "");
  const [date, setDate] = useState(editing?.date ?? today);
  const [method, setMethod] = useState<PaymentMethod | "">(editing?.method ?? "");
  const [paidTo, setPaidTo] = useState(editing?.paidTo ?? "");
  const [reference, setReference] = useState(editing?.reference ?? "");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [receipt, setReceipt] = useState(editing?.receipt ?? "");
  const [service, setService] = useState(editing?.outsourced?.service ?? "");
  const [patient, setPatient] = useState(editing?.outsourced?.patient ?? "");
  const [charged, setCharged] = useState(editing?.outsourced ? String(editing.outsourced.charged) : "");
  const defaultMode = editing ? (editing.status === "Approved" ? "approved" : "pending") : user.kind === "manager" ? "approved" : "";
  const [mode, setMode] = useState<"approved" | "pending" | "">(defaultMode as "approved" | "pending" | "");
  const [approver, setApprover] = useState(editing?.approvedBy ? `${editing.approvedBy.name}|${editing.approvedBy.role}` : user.kind === "manager" ? `${me.name}|${me.role}` : "");

  const outsourced = category === OUTSOURCED;
  const value = Number(amount || 0);
  const amountOk = value > 0;
  const chargedValue = Number(charged || 0);
  const kept = chargedValue - value;
  const partnerOk = !outsourced || (filled(service) && filled(paidTo) && chargedValue > 0);
  const descText = outsourced ? (filled(service) ? `${service.trim()} (partner)` : "") : description;
  const dateOk = filled(date) && date <= today;
  const approverPick = approvers.find((a) => a.value === approver);
  const approvalOk = mode === "pending" || (mode === "approved" && !!approverPick);
  const suggestions = category && !outsourced ? (CATEGORY_ITEMS[category] ?? []) : [];

  const steps = [
    { id: "what", label: "What was spent", done: filled(category) && filled(descText) && amountOk && (!outsourced || chargedValue > 0) },
    { id: "payment", label: "Payment", done: dateOk && !!method && partnerOk },
    { id: "approval", label: "Approval", done: approvalOk },
    { id: "proof", label: "Receipt & notes", done: !!receipt || filled(reference) || filled(notes), optional: true },
  ];

  const save = () => {
    const input = { branchId, date, category, description: descText, outsourced: outsourced ? { service: service.trim(), patient: patient.trim(), charged: chargedValue } : undefined, amount: value, method: method as PaymentMethod, paidTo, reference, notes, receipt: receipt || undefined, approvedBy: mode === "approved" && approverPick ? approverPick.person : null };
    let id = editing?.id ?? "";
    if (editing) updateExpense(editing.id, input, me);
    else id = recordExpense(input, me).id;
    const status = input.approvedBy ? "Approved" : "Pending";
    showToast(
      !savedOnDevice()
        ? "Saved for this session — the device storage is full, so it may not survive a refresh"
        : input.approvedBy
          ? `${descText.trim()} · ${formatMoney(value, "NGN")} saved — approved by ${input.approvedBy.name}`
          : `${descText.trim()} · ${formatMoney(value, "NGN")} sent for approval`,
    );
    onSaved?.({ id, status });
    onClose();
  };

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      eyebrow={editing ? `Edit expense · ${editing.id}` : "New expense"}
      title={editing ? "Edit expense" : "Record an expense"}
      description="Record what was spent and who approved it. Only approved expenses count as money spent."
      contextLabel={`${branch?.name ?? ""} branch · recording an expense`}
      steps={steps}
      aside={
        <PreviewCard
          title="Expense summary"
          rows={[
            { label: outsourced ? "Paid to partner" : "Amount", value: amountOk ? formatMoney(value, "NGN") : "—" },
            ...(outsourced ? [{ label: "Patient paid", value: chargedValue > 0 ? formatMoney(chargedValue, "NGN") : "—" }, { label: "Branch keeps", value: chargedValue > 0 && amountOk ? formatMoney(kept, "NGN") : "—" }] : []),
            { label: "Category", value: category || "—" },
            { label: "Paid by", value: method || "—" },
            { label: "Recorded by", value: `${me.name} · ${me.role}` },
            { label: "Approved by", value: mode === "approved" ? (approverPick ? approverPick.label : "Choose who approved it") : mode === "pending" ? "Waiting for approval" : "—" },
          ]}
          note={mode === "pending" ? "It counts as spent once a Branch Manager approves it." : "Saved on this device first and queued for cloud sync."}
        />
      }
      footer={<Footer onCancel={onClose} submitLabel={editing ? "Save changes" : mode === "pending" ? "Send for approval" : "Save expense"} onInvalid={v.mark} canSubmit={steps.every((s) => s.done || s.optional)} onSubmit={save} />}
    >
      <FormSection id="what" title="What was spent">
        <FormField label="Category" required error={v.show(!filled(category), "Choose what kind of expense this is.")} full as="div">
          <div className="ex-cats" role="group" aria-label="Category">
            {RECORD_CATEGORIES.map((c) => {
              const Icon = categoryIcon(c);
              const on = category === c;
              return (
                <button key={c} type="button" className={`ex-cat ${c === OUTSOURCED ? "is-wide" : ""} ${on ? "is-on" : ""}`} aria-pressed={on} onClick={() => setCategory(c)}>
                  <Icon className="cat-mark" size={c === OUTSOURCED ? 96 : 78} strokeWidth={1.3} aria-hidden="true" />
                  <span className="ex-cat-icon" aria-hidden="true">
                    <Icon size={19} />
                  </span>
                  <span className="ex-cat-text">
                    <strong>{c}</strong>
                    <small>{CATEGORY_HINT[c] ?? (CATEGORY_ITEMS[c] ?? []).slice(0, 2).join(", ")}</small>
                  </span>
                  <span className="ex-cat-check" aria-hidden="true">
                    <Check size={13} strokeWidth={3} />
                  </span>
                </button>
              );
            })}
          </div>
        </FormField>
        {outsourced ? (
          <>
            <p className="ex-explain">
              For a test this branch doesn't do: the patient pays us, we pay the partner who does the test, and the branch keeps the difference. The amount paid to the partner is the expense.
            </p>
            <FormField label="Service done at the partner" required error={v.show(!filled(service), "Say which test or service the partner did.")}>
              <input value={service} maxLength={70} onChange={(e) => setService(e.target.value)} placeholder="e.g. MRI brain" list="ex-outsourced-services" />
              <datalist id="ex-outsourced-services">
                {CATEGORY_ITEMS[OUTSOURCED].map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </FormField>
            <FormField label="Patient" hint="Name or Patient ID (optional)">
              <input value={patient} maxLength={60} onChange={(e) => setPatient(e.target.value)} placeholder="e.g. ABJ-W000123 or Amina Bello" />
            </FormField>
            <FormField label="Patient paid us (₦)" required error={v.show(!(chargedValue > 0), "Enter what the patient paid the branch for this service.")} hint="What we charged the patient, e.g. 60,000.">
              <span className="ex-amount">
                <b>₦</b>
                <input value={withCommas(charged)} onChange={(e) => setCharged(digits(e.target.value).slice(0, 10))} placeholder="0" inputMode="numeric" />
              </span>
            </FormField>
          </>
        ) : (
          <FormField label="Description" required error={v.show(!filled(description), "Say what the money was spent on.")} full>
            <input value={description} maxLength={80} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Diesel for generator" />
          </FormField>
        )}
        {suggestions.length > 0 && (
          <div className="ex-suggest" aria-label="Common descriptions">
            {suggestions.map((s) => (
              <button key={s} type="button" className={description === s ? "is-on" : ""} onClick={() => setDescription(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        <FormField
          label={outsourced ? "Paid to the partner (₦)" : "Amount spent (₦)"}
          required
          error={v.show(!amountOk, outsourced ? "Enter what the branch paid the partner." : "Enter the amount spent — more than ₦0.")}
          hint={value >= LARGE_EXPENSE ? `Large expense (${formatMoney(value, "NGN")}) — double-check the amount before saving.` : outsourced ? "The partner's price, e.g. 40,000 — this is the expense." : "Whole naira, e.g. 25,000."}
        >
          <span className="ex-amount">
            <b>₦</b>
            <input value={withCommas(amount)} onChange={(e) => setAmount(digits(e.target.value).slice(0, 10))} placeholder="0" inputMode="numeric" />
          </span>
        </FormField>
        {outsourced && chargedValue > 0 && amountOk && (
          <div className={`ex-margin ${kept < 0 ? "is-loss" : ""}`} role="status">
            <span>
              Patient paid <b>{formatMoney(chargedValue, "NGN")}</b> − partner <b>{formatMoney(value, "NGN")}</b>
            </span>
            <strong>
              {kept >= 0 ? `Branch keeps ${formatMoney(kept, "NGN")}` : `Branch loses ${formatMoney(-kept, "NGN")}`}
              <small> · {Math.round((kept / chargedValue) * 100)}% of what the patient paid</small>
            </strong>
          </div>
        )}
      </FormSection>

      <FormSection id="payment" title="Payment">
        <FormField label="Date spent" required error={v.show(!dateOk, !filled(date) ? "Choose the day the money was spent." : "The date can't be in the future.")}>
          <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </FormField>
        <FormField label={outsourced ? "Partner branch or facility" : "Paid to"} required={outsourced} error={v.show(outsourced && !filled(paidTo), "Name the partner who did the test.")} hint={outsourced ? "Who did the test for us" : "Supplier, shop or person (optional)"}>
          <input value={paidTo} maxLength={80} onChange={(e) => setPaidTo(e.target.value)} placeholder={outsourced ? "e.g. Garki Imaging Centre" : "e.g. Total filling station"} />
        </FormField>
        <FormField label="Paid by" required error={v.show(!method, "Choose how it was paid.")} full as="div">
          <div className="fd-tiles" role="group" aria-label="Paid by" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
            {PAYMENT_METHODS.map((m) => (
              <button key={m} type="button" className="fd-tile" aria-pressed={method === m} onClick={() => setMethod(m)}>
                <strong>{m}</strong>
                <small>{METHOD_HINT[m]}</small>
              </button>
            ))}
          </div>
        </FormField>
      </FormSection>

      <FormSection id="approval" title="Approval" note="Every expense must say who approved it — usually the Branch Manager.">
        <FormField label="Has it been approved?" required error={v.show(!mode, "Say whether it's already approved or needs approval.")} full as="div">
          <div className="fd-tiles" role="group" aria-label="Approval" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
            <button type="button" className="fd-tile" aria-pressed={mode === "approved"} onClick={() => setMode("approved")}>
              <strong>
                <BadgeCheck size={15} /> Yes — already approved
              </strong>
              <small>Name the person who approved it</small>
            </button>
            <button type="button" className="fd-tile" aria-pressed={mode === "pending"} onClick={() => setMode("pending")}>
              <strong>
                <Hourglass size={15} /> No — send for approval
              </strong>
              <small>The Branch Manager approves or rejects it here</small>
            </button>
          </div>
        </FormField>
        {mode === "approved" && (
          <FormField label="Approved by" required error={v.show(!approverPick, "Choose who approved this expense.")} full as="div">
            <SelectMenu value={approver} ariaLabel="Approved by" options={approvers.map(({ value: val, label, description: d }) => ({ value: val, label, description: d }))} onChange={(x: string) => setApprover(x)}>
              <Trigger text={approverPick ? `${approverPick.label} · ${approverPick.person.role}` : ""} placeholder="Select who approved it" />
            </SelectMenu>
          </FormField>
        )}
      </FormSection>

      <FormSection id="proof" title="Receipt and notes">
        <FormField label="Receipt or invoice number">
          <input value={reference} maxLength={40} onChange={(e) => setReference(e.target.value)} placeholder="e.g. INV-2041" />
        </FormField>
        <FormField label="Photo of the receipt" as="div">
          <div className="ex-receipt-pick">
            {receipt && <img src={receipt} alt="Receipt" />}
            <ImagePicker value={receipt} onChange={setReceipt} label="receipt" max={1000} />
          </div>
        </FormField>
        <FormField label="Notes" full>
          <textarea value={notes} maxLength={300} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the approver or accountant should know" />
        </FormField>
      </FormSection>
    </FormDialog>
  );
}
