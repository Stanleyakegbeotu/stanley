/**
 * Settings → business configuration (Priority 2):
 *  • Approvals & Workflows — how each approval works today, and the live queue
 *  • Patient & Registration — Patient ID format per branch, registration rules
 *  • Billing & Payments — payment methods (company + branch), split, discounts
 *  • Referral & Commission — company commission rate, rules
 *  • Services & Inventory — the catalogue, who can change prices
 * Every control writes to the store the app reads (config, permissions,
 * commission, org) — none is display-only. Workflows that don't exist yet are
 * labelled "Not built yet".
 */
import { useMemo, useState } from "react";
import { Check, ExternalLink, X } from "lucide-react";
import { useApp } from "@/app/AppState";
import { getBranch } from "@/data/company";
import { PAYMENT_METHODS, type PaymentMethod } from "@/data/types";
import { CATALOGUE_CATEGORIES, CATALOGUE_INVENTORY } from "@/data/catalogueRules";
import { buildHospitalDirectory } from "@/data/legacy";
import { useAuditLog } from "@/services/audit";
import { billingState, branchPrefix, useBilling } from "@/services/billing";
import { COMMON_RATES, hasAgentRates, pct, setCompanyRate, useCommission } from "@/services/commission";
import { updateConfig, useConfig } from "@/services/config";
import { approveExpense, rejectExpense, useExpenses } from "@/services/expenses";
import { branchPaymentMode, enabledMethods, useBranches } from "@/services/org";
import { BRANCH_ROLES, can, usePermissions } from "@/services/permissions";
import { formatCount, formatMoney } from "@/shared/format";
import { Button } from "@/shared/ui/controls";
import { ConfirmDialog, NotConnected, Panel, ScopeTag, StatusChip, Toggle, dateTime } from "./ui";

const who = (perm: string) => ["Company Admin", ...BRANCH_ROLES.filter((r) => can(r, perm))].join(", ");

/* ─────────────── Approvals & Workflows ─────────────── */

export function ApprovalsSection({ go }: { go: (s: string) => void }) {
  const { user, showToast } = useApp();
  usePermissions();
  const expenses = useExpenses();
  const audit = useAuditLog();
  const billing = useBilling();
  const cfg = useConfig();
  const [reject, setReject] = useState<string | null>(null);
  const pending = expenses.filter((e) => e.status === "Pending").sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  const decisions = audit.filter((e) => e.category === "Expenses" && /approved|rejected/i.test(e.action)).slice(0, 8);
  const balances = billing.orders.filter((o) => o.balance > 0 && o.balanceInfo.approvedBy).slice(0, 8);

  const flows: { name: string; requests: string; approves: string; rule: string; status: "active" | "notbuilt"; section?: string }[] = [
    { name: "Expenses", requests: "Anyone who records an expense", approves: who("expenses.approve"), rule: "Either name who already approved it, or send it for approval. Rejections need a reason.", status: "active", section: "roles" },
    { name: "Balances (part payment / unpaid)", requests: "Whoever bills the patient", approves: "The person billing or the branch manager — named on the bill", rule: "Reason, approver and optional promised date are required.", status: "active" },
    { name: "Discounts", requests: who("billing.discount"), approves: "Given directly by those roles", rule: cfg.discounts.enabled ? `Up to ${cfg.discounts.maxPercent}% of the bill; above that isn't allowed.` : "Discounts are turned off.", status: "active", section: "billing" },
    { name: "Price change on one bill", requests: who("billing.override"), approves: "Given directly by those roles", rule: "Never changes the catalogue price.", status: "active", section: "roles" },
    { name: "Catalogue price changes", requests: who("services.edit"), approves: "Applied directly by those roles (audited)", rule: "A request → approve step for price changes isn't built yet.", status: "notbuilt", section: "services" },
    { name: "Staff & permission changes", requests: `Company Admin${can("Branch Manager", "staff.manage") ? "; managers for their front desk" : ""}`, approves: "Applied directly (audited)", rule: "Roles & permissions: Company Admin only.", status: "active", section: "roles" },
    { name: "Branch configuration", requests: "Company Admin", approves: "Company Admin only", rule: "Create, activate, suspend — reason required.", status: "active", section: "branches" },
    { name: "Deletions", requests: "Anyone who can delete a record", approves: `Trash — permanent delete: ${who("trash.restore")}`, rule: "Nothing is deleted outright; Trash keeps it 30 days.", status: "active" },
    { name: "Commission changes", requests: who("referral.commission"), approves: "Applied directly (audited)", rule: "Company rate and agents' own rates.", status: "active", section: "referral" },
    { name: "Multi-stage approvals", requests: "—", approves: "—", rule: "Two-step approvals (e.g. manager then admin) aren't built yet.", status: "notbuilt" },
  ];

  return (
    <div className="sc-stack">
      <Panel title={`Approval queue · ${pending.length}`} note="Everything waiting for a decision, across all branches.">
        {pending.length === 0 ? (
          <p className="an-none">Nothing is waiting for approval.</p>
        ) : (
          <div className="table-wrap thin-scroll">
            <table className="bp-table rf-table sc-table is-wrap" aria-label="Approval queue">
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Requested by</th>
                  <th>Branch</th>
                  <th>Submitted</th>
                  <th className="right">Amount</th>
                  <th>Details</th>
                  <th className="right">Decision</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <strong>Expense</strong>
                      <small className="ep-sub mono">{e.id}</small>
                    </td>
                    <td>
                      {e.recordedBy.name}
                      <small className="ep-sub">{e.recordedBy.role}</small>
                    </td>
                    <td>{getBranch(e.branchId)?.name}</td>
                    <td className="ep-nowrap">{dateTime(e.recordedAt)}</td>
                    <td className="right num">{formatMoney(e.amount, "NGN")}</td>
                    <td>
                      {e.description}
                      <small className="ep-sub">
                        {e.category} · {e.method}
                        {e.paidTo ? ` · ${e.paidTo}` : ""}
                      </small>
                    </td>
                    <td className="right">
                      <div className="al-actions">
                        <Button size="sm" variant="secondary" onClick={() => setReject(e.id)}>
                          <X size={14} /> Reject
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            approveExpense(e.id, { name: user.name, role: user.role });
                            showToast(`${e.description} approved`);
                          }}
                        >
                          <Check size={14} /> Approve
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Approval rules" note="How each kind of change is approved today. Who may request or approve comes from Roles & Permissions.">
        <div className="table-wrap thin-scroll">
          <table className="bp-table rf-table sc-table is-wrap" aria-label="Approval rules">
            <thead>
              <tr>
                <th>Workflow</th>
                <th>Who can request</th>
                <th>Who approves</th>
                <th>Rule</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {flows.map((w) => (
                <tr key={w.name}>
                  <td>
                    <strong>{w.name}</strong>
                    {w.section && (
                      <button type="button" className="sc-link is-sm" onClick={() => go(w.section!)}>
                        Configure
                      </button>
                    )}
                  </td>
                  <td>{w.requests}</td>
                  <td>{w.approves}</td>
                  <td>{w.rule}</td>
                  <td>{w.status === "active" ? <StatusChip status="ok">Active</StatusChip> : <StatusChip status="disabled">Not built yet</StatusChip>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="sc-two">
        <Panel title="Recent expense decisions">
          {decisions.length === 0 ? (
            <p className="an-none">No decisions yet.</p>
          ) : (
            <ol className="ex-history">
              {decisions.map((d) => (
                <li key={d.id}>
                  <b>
                    {d.action} · {d.record}
                  </b>
                  <small>
                    {d.user} · {dateTime(d.at)}
                  </small>
                </li>
              ))}
            </ol>
          )}
        </Panel>
        <Panel title="Recent balance approvals" note="Bills saved with a balance and who approved it.">
          {balances.length === 0 ? (
            <p className="an-none">No bills with an approved balance yet.</p>
          ) : (
            <ol className="ex-history">
              {balances.map((o) => (
                <li key={o.uuid}>
                  <b>
                    {o.invoiceNo} · {o.patient.name} · owes {formatMoney(o.balance, "NGN")}
                  </b>
                  <small>
                    Approved by {o.balanceInfo.approvedBy?.name} · {o.balanceInfo.reason}
                  </small>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      <ConfirmDialog
        open={!!reject}
        title="Reject this expense?"
        description="The person who recorded it can edit and resubmit it."
        confirmLabel="Reject expense"
        danger
        reason
        onClose={() => setReject(null)}
        onConfirm={(reason) => {
          if (reject) {
            rejectExpense(reject, { name: user.name, role: user.role }, reason);
            showToast("Expense rejected");
          }
          setReject(null);
        }}
      />
    </div>
  );
}

/* ─────────────── Patient & Registration ─────────────── */

export function PatientsSection({ go }: { go: (s: string) => void }) {
  const cfg = useConfig();
  const branches = useBranches();
  const billing = useBilling();
  const issued = (prefix: string) => billing.sequences[prefix] ?? 0;
  const p = cfg.patient;
  return (
    <div className="sc-stack">
      <Panel title="Patient ID format" scope="branch" note="IDs are issued automatically, one sequence per branch and patient type. Staff can't type or change an ID.">
        <div className="table-wrap thin-scroll">
          <table className="bp-table rf-table sc-table" aria-label="Patient ID format">
            <thead>
              <tr>
                <th>Branch</th>
                <th>Branch code</th>
                <th>Referred (R)</th>
                <th>Walk-in (W)</th>
                <th className="right">Referred IDs issued</th>
                <th className="right">Walk-in IDs issued</th>
              </tr>
            </thead>
            <tbody>
              {branches.map((b) => {
                const code = branchPrefix(b.id);
                const r = issued(`${code}-R`);
                const w = issued(`${code}-W`);
                return (
                  <tr key={b.id}>
                    <td>
                      <strong>{b.name}</strong>
                      <small className="ep-sub">{b.status}</small>
                    </td>
                    <td className="mono">{code}</td>
                    <td className="mono">
                      {code}-R{String(r + 1).padStart(6, "0")}
                      <small className="ep-sub">next</small>
                    </td>
                    <td className="mono">
                      {code}-W{String(w + 1).padStart(6, "0")}
                      <small className="ep-sub">next</small>
                    </td>
                    <td className="right num">{formatCount(r)}</td>
                    <td className="right num">{formatCount(w)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="lg-muted">
          Change a branch's code in{" "}
          <button type="button" className="sc-link is-sm" onClick={() => go("branches")}>
            Branch Management
          </button>{" "}
          — it locks once IDs have been issued with it, so IDs on old receipts never change.
        </p>
      </Panel>

      <Panel title="Registration rules" scope="global">
        <div className="sc-checks">
          <Toggle label="Phone number is required" hint="Billing won't continue without a patient phone number." checked={p.phoneRequired} onChange={(on) => updateConfig("patient", { phoneRequired: on }, `Phone number ${on ? "required" : "optional"} at registration`)} />
        </div>
      </Panel>

      <Panel title="Duplicate patient warnings" scope="global" note="Possible duplicates are shown to the person billing. Records are never merged automatically.">
        <div className="sc-checks">
          <Toggle label="Same name" hint="Warn when a patient with the same name exists." checked={p.duplicateBy.name} onChange={(on) => updateConfig("patient", { duplicateBy: { ...p.duplicateBy, name: on } }, `Duplicate check by name ${on ? "on" : "off"}`)} />
          <Toggle label="Same phone number" hint="Warn when the phone number is already on record." checked={p.duplicateBy.phone} onChange={(on) => updateConfig("patient", { duplicateBy: { ...p.duplicateBy, phone: on } }, `Duplicate check by phone ${on ? "on" : "off"}`)} />
          <Toggle label="Existing Patient ID" hint="Always on — an existing patient is found by their ID." checked disabled onChange={() => {}} />
        </div>
      </Panel>

      <Panel title="Fixed rules" note="Built into STANLEY for safe records.">
        <ul className="st-checklist">
          <li>Walk-in patients never get a PR agent — referral details are only for referred patients.</li>
          <li>A Patient ID is reserved when billing starts and confirmed when the bill is saved; a cancelled bill releases it.</li>
          <li>Referral details stay attached to each bill for historical reports.</li>
        </ul>
      </Panel>
    </div>
  );
}

/* ─────────────── Billing & Payments ─────────────── */

export function BillingSection({ go }: { go: (s: string) => void }) {
  usePermissions();
  const cfg = useConfig();
  const branches = useBranches();
  const [maxPct, setMaxPct] = useState(String(cfg.discounts.maxPercent));
  const enabledCount = PAYMENT_METHODS.filter((m) => cfg.payments.enabled[m]).length;
  const setMethod = (m: PaymentMethod, on: boolean) => updateConfig("payments", { enabled: { ...cfg.payments.enabled, [m]: on } }, `${m === "Transfer" ? "Bank transfer" : m} ${on ? "enabled" : "disabled"} (company default)`);
  const year = new Date().getFullYear();
  const seq = billingState().sequences;
  const pctValue = Number(maxPct);
  const pctOk = Number.isFinite(pctValue) && pctValue >= 0 && pctValue <= 100;

  return (
    <div className="sc-stack">
      <Panel title="Payment methods" scope="global" note="The company default. Billing only offers enabled methods. A branch can have its own set.">
        <div className="sc-checks">
          {PAYMENT_METHODS.map((m) => (
            <Toggle key={m} label={m === "Transfer" ? "Bank transfer" : m} checked={cfg.payments.enabled[m]} onChange={(on) => setMethod(m, on)} hint={m === "Cash" ? "Cash at the front desk" : m === "POS" ? "Card on the POS terminal" : "Paid by bank transfer"} />
          ))}
          <Toggle label="Split payments" hint="Let one bill be paid with more than one method (needs at least two methods)." checked={cfg.payments.split} onChange={(on) => updateConfig("payments", { split: on }, `Split payments ${on ? "allowed" : "turned off"}`)} />
        </div>
        {enabledCount === 0 && <div className="sc-gaps">No payment method is enabled — branches using the company default can't take payments.</div>}
      </Panel>

      <Panel title="Branch payment methods" note="Inherited branches follow the company default; overridden branches use their own set.">
        <div className="table-wrap thin-scroll">
          <table className="bp-table rf-table sc-table" aria-label="Branch payment methods">
            <thead>
              <tr>
                <th>Branch</th>
                <th>Setting</th>
                <th>Billing offers</th>
                <th className="right" />
              </tr>
            </thead>
            <tbody>
              {branches.map((b) => (
                <tr key={b.id}>
                  <td>
                    <strong>{b.name}</strong>
                  </td>
                  <td>
                    <ScopeTag scope={branchPaymentMode(b.id) === "inherit" ? "inherited" : "overridden"} />
                  </td>
                  <td>{enabledMethods(b.id).join(", ") || <span className="sc-missing">None</span>}</td>
                  <td className="right">
                    <button type="button" className="sc-link is-sm" onClick={() => go("branches")}>
                      Change in Branch Management
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Discounts" scope="global" note={`Who can give discounts: ${who("billing.discount")} (Roles & Permissions). Every discount needs a reason and is recorded on the bill.`}>
        <div className="sc-checks">
          <Toggle label="Allow discounts" checked={cfg.discounts.enabled} onChange={(on) => updateConfig("discounts", { enabled: on }, `Discounts ${on ? "allowed" : "turned off"}`)} />
        </div>
        <div className="sc-inline">
          <label className={`field ${pctOk ? "" : "is-error"}`}>
            Largest discount (% of the bill)
            <input inputMode="numeric" value={maxPct} onChange={(e) => setMaxPct(e.target.value.replace(/[^\d]/g, "").slice(0, 3))} disabled={!cfg.discounts.enabled} />
            {!pctOk && <small className="field-error">Enter 0 to 100.</small>}
          </label>
          <Button disabled={!pctOk || pctValue === cfg.discounts.maxPercent || !cfg.discounts.enabled} onClick={() => updateConfig("discounts", { maxPercent: pctValue }, `Largest discount: ${cfg.discounts.maxPercent}% → ${pctValue}%`)}>
            Save limit
          </Button>
        </div>
      </Panel>

      <Panel title="Price changes on a bill" note={`Who can change a service's price for one bill (VIP / custom): ${who("billing.override")}. The catalogue price never changes — that's a separate, permitted catalogue edit.`}>
        <button type="button" className="sc-link" onClick={() => go("roles")}>
          Change who can do this in Roles & Permissions
        </button>
      </Panel>

      <Panel title="Numbering" note="Issued automatically and never reused.">
        <div className="table-wrap thin-scroll">
          <table className="bp-table rf-table sc-table" aria-label="Invoice numbering">
            <thead>
              <tr>
                <th>Branch</th>
                <th>Invoice / receipt format</th>
                <th>Next number</th>
                <th className="right">Issued in {year}</th>
              </tr>
            </thead>
            <tbody>
              {branches.map((b) => {
                const n = seq[`INV-${branchPrefix(b.id)}-${year}`] ?? 0;
                return (
                  <tr key={b.id}>
                    <td>
                      <strong>{b.name}</strong>
                    </td>
                    <td className="mono">INV-YYYY-000001</td>
                    <td className="mono">
                      INV-{year}-{String(n + 1).padStart(6, "0")}
                    </td>
                    <td className="right num">{formatCount(n)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Fixed billing rules">
        <ul className="st-checklist">
          <li>Part payments and unpaid bills are allowed with a reason and a named approver; a promised payment date is optional.</li>
          <li>Payment status: PAID when nothing is owed, otherwise PENDING with the balance shown.</li>
          <li>Bills save on this device first and queue for the cloud.</li>
        </ul>
      </Panel>
    </div>
  );
}

/* ─────────────── Referral & Commission ─────────────── */

export function ReferralSection() {
  const { agents, navigate, showToast } = useApp();
  const { rate } = useCommission();
  const [custom, setCustom] = useState("");
  const [pending, setPending] = useState<number | null>(null);
  const hospitals = useMemo(() => buildHospitalDirectory(agents), [agents]);
  const customNum = Number(custom);
  const customOk = custom !== "" && Number.isFinite(customNum) && customNum >= 0 && customNum <= 100;
  return (
    <div className="sc-stack">
      <Panel title="Company commission rate" scope="global" note="Commission = the full bill of each referred patient (all tests) × the agent's rate. Agents with their own rate keep it.">
        <div className="sc-rate">
          <b className="num">{pct(rate)}</b>
          <span>current company rate{hasAgentRates() ? " · some agents have their own rate" : ""}</span>
        </div>
        <div className="sc-inline">
          {COMMON_RATES.map((r) => (
            <Button key={r} variant={r === rate ? "primary" : "secondary"} size="sm" onClick={() => r !== rate && setPending(r)}>
              {pct(r)}
            </Button>
          ))}
          <label className={`field ${custom && !customOk ? "is-error" : ""}`} style={{ maxWidth: 160 }}>
            Other rate (%)
            <input inputMode="decimal" value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^\d.]/g, "").slice(0, 5))} placeholder="e.g. 12.5" />
          </label>
          <Button size="sm" disabled={!customOk || customNum / 100 === rate} onClick={() => setPending(customNum / 100)}>
            Set rate
          </Button>
        </div>
      </Panel>
      <Panel title="Referral network">
        <div className="sc-tiles is-compact">
          <div className="sc-tile">
            <span className="sc-tile-head">PR agents</span>
            <b className="num">{formatCount(agents.length)}</b>
            <small>{formatCount(agents.filter((a) => a.hospital).length)} with a hospital</small>
          </div>
          <div className="sc-tile">
            <span className="sc-tile-head">Hospitals</span>
            <b className="num">{formatCount(hospitals.length)}</b>
            <small>Referring hospitals on record</small>
          </div>
        </div>
        <Button variant="secondary" onClick={() => navigate("/pr")}>
          <ExternalLink size={15} /> Open PR Management
        </Button>
      </Panel>
      <Panel title="Rules">
        <ul className="st-checklist">
          <li>Walk-in patients never get a referral agent.</li>
          <li>Referral details stay attached to each bill for historical reports and payouts.</li>
          <li>One company commission rate; an agent can be given their own rate on their profile.</li>
        </ul>
        <NotConnected>Branch-specific commission rates aren't supported yet — the company rate applies at every branch.</NotConnected>
      </Panel>
      <ConfirmDialog
        open={pending !== null}
        title={pending !== null ? `Change the company commission to ${pct(pending)}?` : ""}
        description="Commission figures, payout reports and notifications are recalculated straight away."
        consequences={["Agents with their own rate keep it", "Recorded in the audit log"]}
        confirmLabel="Change rate"
        onClose={() => setPending(null)}
        onConfirm={() => {
          if (pending !== null) {
            setCompanyRate(pending);
            showToast(`Company commission is now ${pct(pending)}`);
            setCustom("");
          }
          setPending(null);
        }}
      />
    </div>
  );
}

/* ─────────────── Services & Inventory ─────────────── */

export function ServicesSection({ go }: { go: (s: string) => void }) {
  const { inventory, navigate } = useApp();
  usePermissions();
  const audit = useAuditLog();
  const changes = audit.filter((e) => e.category === "Catalogue").slice(0, 8);
  const noPrice = CATALOGUE_INVENTORY.filter((i) => {
    const e = inventory.edits[i.id];
    return (e && "price" in e && e.price !== undefined ? e.price : i.price) === null;
  }).length;
  return (
    <div className="sc-stack">
      <Panel title="Service catalogue" scope="global" note="One company-wide catalogue and price list for every branch.">
        <div className="sc-tiles is-compact">
          <div className="sc-tile">
            <span className="sc-tile-head">Services</span>
            <b className="num">{formatCount(CATALOGUE_INVENTORY.length + inventory.added.length)}</b>
            <small>{formatCount(inventory.added.length)} added in STANLEY</small>
          </div>
          <div className="sc-tile">
            <span className="sc-tile-head">Categories</span>
            <b className="num">{formatCount(CATALOGUE_CATEGORIES.length)}</b>
            <small>{formatCount(Object.keys(inventory.categoryNames).length)} renamed</small>
          </div>
          <div className="sc-tile">
            <span className="sc-tile-head">Prices changed</span>
            <b className="num">{formatCount(Object.keys(inventory.edits).length)}</b>
            <small>Recorded values kept</small>
          </div>
          <div className="sc-tile">
            <span className="sc-tile-head">Without a price</span>
            <b className="num">{formatCount(noPrice)}</b>
            <small>Can't be billed until priced</small>
          </div>
        </div>
        <div className="sc-inline">
          <Button variant="secondary" onClick={() => navigate("/inventory")}>
            <ExternalLink size={15} /> Open Inventory
          </Button>
        </div>
      </Panel>
      <Panel title="Who can change prices" note="From Roles & Permissions.">
        <ul className="st-checklist">
          <li>
            <b>Catalogue prices & new services:</b> {who("services.edit")} — applies company-wide, audited
          </li>
          <li>
            <b>One bill only (VIP / custom):</b> {who("billing.override")} — never changes the catalogue
          </li>
        </ul>
        <button type="button" className="sc-link" onClick={() => go("roles")}>
          Change in Roles & Permissions
        </button>
      </Panel>
      <Panel title="Recent catalogue changes">
        {changes.length === 0 ? (
          <p className="an-none">No catalogue changes yet.</p>
        ) : (
          <ol className="ex-history">
            {changes.map((c) => (
              <li key={c.id}>
                <b>
                  {c.action} · {c.record}
                </b>
                <small>
                  {c.user} · {dateTime(c.at)}
                </small>
                {c.details && <p>{c.details}</p>}
              </li>
            ))}
          </ol>
        )}
      </Panel>
      <NotConnected>Branch-specific prices, service deactivation and stock levels aren't built yet: every branch bills from the one company price list. Removing a service added in STANLEY sends it to Trash.</NotConnected>
    </div>
  );
}
