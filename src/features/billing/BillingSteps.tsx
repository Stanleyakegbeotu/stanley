/**
 * Billing steps 1–4. Pure presentation + input: every calculation, ID and rule
 * comes from services/billing.ts so all steps show the same numbers.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRightLeft,
  Banknote,
  Check,
  ChevronRight,
  CircleCheck,
  CircleDashed,
  CircleX,
  CreditCard,
  FlaskConical,
  Handshake,
  Hospital,
  Info,
  Percent,
  Plus,
  RotateCcw,
  Search,
  SplitSquareHorizontal,
  Trash2,
  UserCheck,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { useApp } from "@/app/AppState";
import { useConfig } from "@/services/config";
import { enabledMethods, useBranches } from "@/services/org";
import type { Branch, PaymentMethod } from "@/data/types";
import { PAYMENT_METHODS } from "@/data/types";
import { buildHospitalDirectory, hasPhone, hospitalKey } from "@/data/legacy";
import { formatMoney, initials } from "@/shared/format";
import { SearchSelect } from "@/shared/ui/SearchSelect";
import { NAME_INPUT_PROPS, nameChange } from "@/shared/nameCase";
import { FieldError, fieldErrorProps } from "@/shared/ui/FieldError";
import { buildItems, categoryMeta, groupCategories, type CatalogueItem } from "@/features/inventory/InventoryCatalog";
import { QuickServices, useQuickServices } from "./QuickServices";
import {
  appliedPrice,
  balanceApprovers,
  discountApprovers,
  canAdjustPrices,
  canGiveDiscount,
  maxDiscount,
  computeBill,
  findPatients,
  patientSourceType,
  resolveHospital,
  similarPatients,
  type BillingSession,
  type PatientRecord,
  type PayChoice,
  type PayStatusChoice,
} from "@/services/billing";

export type SetSession = (fn: (s: BillingSession) => BillingSession) => void;
interface StepProps {
  s: BillingSession;
  set: SetSession;
  branch: Branch;
  /** Field errors from the last blocked Continue — shown on each field. */
  errors?: Record<string, string>;
}

/** Wrapper class + data attribute for a field that may show an error. */
const fe = (base: string, msg?: string) => {
  const p = fieldErrorProps(msg);
  return { className: `${base} ${p.className}`.trim(), "data-field-error": p["data-field-error"], "aria-invalid": p["aria-invalid"] };
};

const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const METHOD_LABEL: Record<PaymentMethod, string> = { Cash: "Cash", POS: "POS", Transfer: "Bank transfer" };
const METHOD_ICON: Record<PaymentMethod, LucideIcon> = { Cash: Banknote, POS: CreditCard, Transfer: ArrowRightLeft };
/** "cash", "bank transfer" — but "POS" stays in capitals. */
const methodWord = (m: PaymentMethod) => (m === "POS" ? "POS" : METHOD_LABEL[m].toLowerCase());
export const methodLabel = (m: PayChoice | null) => (m === null ? "Not paid" : m === "Split" ? "Split payment" : METHOD_LABEL[m]);

export function Card({ icon: Icon, title, hint, badge, children, className = "" }: { icon: LucideIcon; title: string; hint?: string; badge?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`bl-card ${className}`}>
      <header className="bl-card-head">
        <span className="bl-card-icon" aria-hidden="true">
          <Icon size={20} />
        </span>
        <div>
          <h3>
            {title} {badge}
          </h3>
          {hint && <p>{hint}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

/* ─────────────── Step 1 — Patient ─────────────── */

export function PatientStep({ s, set, branch, errors = {} }: StepProps) {
  const { agents, user } = useApp();
  const [find, setFind] = useState("");
  const results = find.trim() ? findPatients(branch.id, find) : [];
  const existing = !!s.patient.uuid;
  const similar = existing ? [] : similarPatients(branch.id, s.patient.name, s.patient.phone);
  const agent = s.agentId !== null ? agents.find((a) => a.id === s.agentId) : undefined;
  const hospitals = useMemo(() => buildHospitalDirectory(agents).map((h) => h.key), [agents]);
  const agentOptions = useMemo(
    () => agents.map((a) => ({ value: String(a.id), label: a.name, description: `${hospitalKey(a.hospital) || "No hospital assigned"}${hasPhone(a.phone) ? ` · ${a.phone}` : ""}`, keywords: `${a.phone} ${a.id} ${a.hospital}` })),
    [agents],
  );
  const usePatient = (p: PatientRecord) => {
    set((x) => ({ ...x, patient: { uuid: p.uuid, existingId: p.patientId, existingType: p.type, name: p.name, phone: p.phone }, differentPatientConfirmed: false }));
    setFind("");
  };
  const clearPatient = () => set((x) => ({ ...x, patient: { uuid: null, existingId: null, existingType: null, name: "", phone: "" } }));

  return (
    <div className="bl-grid-2">
      <Card icon={UserRound} title="Patient information" hint="Existing patients keep their Patient ID; new patients get one reserved for this bill.">
        {!existing && (
          <div className="bl-find">
            <label className="bl-label">Existing patient? Find them first</label>
            <span className="bl-input">
              <Search size={16} />
              <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Search Patient ID, name or phone" aria-label="Find an existing patient" />
            </span>
            {find.trim() && (
              <ul className="bl-results">
                {results.length === 0 ? (
                  <li className="bl-results-empty">No registered patient matches “{find.trim()}” — enter their details below as a new patient.</li>
                ) : (
                  results.map((p) => (
                    <li key={p.uuid}>
                      <button type="button" onClick={() => usePatient(p)}>
                        <span className="bl-avatar">{initials(p.name)}</span>
                        <span>
                          <b>{p.name}</b>
                          <small>
                            {p.patientId} · {p.type === "REFERRED" ? "Referred" : "Walk-in"}
                            {p.phone ? ` · ${p.phone}` : ""}
                          </small>
                        </span>
                        <em>Use</em>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
        )}

        {existing && (
          <div className="bl-existing">
            <UserCheck size={18} />
            <span>
              <b>Existing patient · {s.patient.existingId}</b>
              <small>Keeps this Patient ID — no new record is created.</small>
            </span>
            <button type="button" className="text-link" onClick={clearPatient}>
              Not this patient
            </button>
          </div>
        )}

        <div className="bl-fields">
          <label {...fe("bl-field", errors.name)}>
            <span className="bl-label">
              Patient full name <i>*</i>
            </span>
            <input value={s.patient.name} readOnly={existing} {...NAME_INPUT_PROPS} onChange={nameChange((name) => set((x) => ({ ...x, patient: { ...x.patient, name }, differentPatientConfirmed: false })))} placeholder="Enter the patient's full name" />
            <FieldError msg={errors.name} />
          </label>
          <label {...fe("bl-field", errors.phone)}>
            <span className="bl-label">
              Phone number <small>Optional</small>
            </span>
            <input value={s.patient.phone} inputMode="tel" onChange={(e) => set((x) => ({ ...x, patient: { ...x.patient, phone: e.target.value } }))} placeholder="e.g. 0803 123 4567" />
            {errors.phone ? <FieldError msg={errors.phone} /> : <small className="bl-help">Local and international formats are accepted.</small>}
          </label>
        </div>

        {similar.length > 0 && (
          <div className="bl-warn">
            <Info size={16} />
            <span>
              <b>
                {similar.length} registered patient{similar.length === 1 ? "" : "s"} with this {similar.some((p) => p.phone && p.phone.replace(/\D/g, "") === s.patient.phone.replace(/\D/g, "")) ? "name or phone" : "name"}
              </b>
              <small>Use the existing record to avoid a duplicate patient, or continue if this is someone else.</small>
              <span className="bl-warn-list">
                {similar.slice(0, 3).map((p) => (
                  <button key={p.uuid} type="button" onClick={() => usePatient(p)}>
                    {p.patientId} · {p.name} <em>Use</em>
                  </button>
                ))}
              </span>
            </span>
          </div>
        )}

        {!existing && s.patient.name.trim() && similar.length === 0 && (
          <div className="bl-ok">
            <span className="bl-pill">New patient</span>
            <span>A {s.walkIn ? "walk-in" : "referred"} Patient ID ({s.walkIn ? "W" : "R"}) is reserved when you continue.</span>
          </div>
        )}
      </Card>

      <Card icon={Handshake} title="Patient source" hint="Walk-in, or the PR agent who referred the patient." badge={<span className="bl-tag">Required</span>}>
        <button type="button" className={`bl-switch ${s.walkIn ? "is-on" : ""}`} aria-pressed={s.walkIn} onClick={() => set((x) => ({ ...x, walkIn: !x.walkIn, ...(x.walkIn ? {} : { agentId: null, hospital: null, referralId: null }) }))}>
          <i aria-hidden="true" />
          <span>
            <b>Walk-in patient</b>
            <small>{s.walkIn ? "Came in by themselves — no PR agent or commission." : "Turn on if no PR agent referred this patient."}</small>
          </span>
          {s.walkIn && <span className="bl-pill">Selected</span>}
        </button>

        {!s.walkIn && (
          <div className="bl-fields">
            <div {...fe("bl-field", errors.agent)}>
              <span className="bl-label">
                PR agent who referred the patient <i>*</i>
              </span>
              <SearchSelect
                value={s.agentId === null ? "" : String(s.agentId)}
                ariaLabel="PR agent"
                placeholder="Search and select a PR agent"
                searchPlaceholder={`Type a name, hospital or phone — ${agents.length} agents`}
                options={agentOptions}
                onChange={(v) => set((x) => ({ ...x, agentId: v ? Number(v) : null }))}
                className="select-btn bl-select"
                width={420}
              />
              <FieldError msg={errors.agent} />
              {agent && (
                <span className="bl-agent">
                  <span className="bl-avatar">{initials(agent.name.replace(/[^a-z\s]/gi, " "))}</span>
                  <span>
                    <b>{agent.name}</b>
                    <small>
                      PR agent #{agent.id}
                      {hasPhone(agent.phone) ? ` · ${agent.phone}` : ""}
                    </small>
                  </span>
                  <button type="button" aria-label="Clear PR agent" onClick={() => set((x) => ({ ...x, agentId: null }))}>
                    <X size={14} />
                  </button>
                </span>
              )}
            </div>
            <div className="bl-field">
              <span className="bl-label">
                Referring hospital <small>{s.hospital ? "Selected" : agent ? "From the PR agent" : "Optional"}</small>
              </span>
              <SearchSelect
                value={s.hospital ?? ""}
                ariaLabel="Referring hospital"
                placeholder={agent ? `${resolveHospital(null, agent)} (agent's hospital)` : "Select a hospital"}
                searchPlaceholder="Search hospitals"
                options={[{ value: "", label: agent ? `Use the agent's hospital (${resolveHospital(null, agent)})` : "Not specified" }, ...hospitals.map((h) => ({ value: h, label: h }))]}
                onChange={(v) => set((x) => ({ ...x, hospital: v || null }))}
                className="select-btn bl-select"
                width={360}
              />
            </div>
            {existing && s.patient.existingType === "WALK_IN" && (
              <p className="bl-note">
                <Info size={14} /> This patient was registered as a walk-in, so their ID stays {s.patient.existingId}. The referral is recorded on this bill.
              </p>
            )}
          </div>
        )}

        <div className="bl-processed">
          <span className="bl-avatar is-solid">{initials(user.name)}</span>
          <span>
            <small>Processed by</small>
            <b>
              {user.name} · {user.role}
            </b>
          </span>
          <span className="bl-tag">Automatic</span>
        </div>
      </Card>
    </div>
  );
}

/* ─────────────── Step 2 — Services ─────────────── */

export function ServicesStep({ s, set, branch, errors = {} }: StepProps) {
  const { inventory, user } = useApp();
  const items = useMemo(() => buildItems(inventory), [inventory]);
  const groups = useMemo(() => groupCategories(items, inventory.categoryNames), [items, inventory.categoryNames]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const canAdjust = canAdjustPrices(user.role);
  const group = groups.find((g) => g.key === cat) ?? null;
  const term = norm(q);
  const hits = useMemo(() => (term ? items.filter((i) => term.split(" ").every((w) => norm(`${i.name} ${i.category} ${i.id}`).includes(w))).slice(0, 80) : []), [items, term]);
  const added = new Set(s.services.map((x) => x.id));
  const labelOf = (key: string) => groups.find((g) => g.key === key)?.label ?? key;
  const t = computeBill(s);
  const money = (n: number) => formatMoney(n, branch.currency);
  // Most done services at this branch (shared with the Price calculator).
  const quick = useQuickServices(branch.id, items);

  const toggle = (i: CatalogueItem) => {
    if (i.price === null) return;
    set((x) => (x.services.some((y) => y.id === i.id) ? { ...x, services: x.services.filter((y) => y.id !== i.id) } : { ...x, services: [...x.services, { id: i.id, name: i.name, category: labelOf(i.category), price: i.price!, overridePrice: null }] }));
  };
  const setOverride = (id: number, raw: string) => {
    const clean = raw.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");
    setDrafts((d) => ({ ...d, [id]: clean }));
    if (clean !== "") set((x) => ({ ...x, services: x.services.map((y) => (y.id === id ? { ...y, overridePrice: Number(clean) === y.price ? null : Number(clean) } : y)) }));
  };
  const row = (i: CatalogueItem, showCat: boolean) => {
    const on = added.has(i.id);
    return (
      <li key={i.id} className={`pc-svc ${on ? "is-added" : ""}`}>
        <div className="pc-svc-text">
          <b>{i.name}</b>
          <small>
            {showCat ? `${labelOf(i.category)} · ` : ""}#{i.id}
          </small>
        </div>
        <div className="pc-svc-end">
          <span className={`pc-svc-price ${i.price === null ? "is-none" : ""}`}>{i.price === null ? "No price on file" : money(i.price)}</span>
          {i.price === null ? (
            <span className="pc-add is-disabled" title="Set a price in Inventory before this test can be billed">
              Unavailable
            </span>
          ) : (
            <button type="button" className={`pc-add ${on ? "is-on" : ""}`} onClick={() => toggle(i)} aria-pressed={on}>
              {on ? <Check size={15} /> : <Plus size={15} />}
              {on ? "Added" : "Add"}
            </button>
          )}
        </div>
      </li>
    );
  };

  return (
    <Card icon={FlaskConical} title="Select diagnostic services" hint={`Add each test once. Branch catalogue prices apply${canAdjust ? "; you can change a price for this bill only" : ""}.`} badge={<span className="bl-pill is-solid">{s.services.length} selected</span>}>
      <QuickServices list={quick} isAdded={(id) => added.has(id)} onToggle={toggle} labelOf={labelOf} money={money} />

      <label className="bl-input bl-search">
        <Search size={17} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={group ? `Search ${group.label} or any test` : "Search by service or category"} aria-label="Search services" />
        {q && (
          <button type="button" onClick={() => setQ("")} aria-label="Clear search">
            <X size={15} />
          </button>
        )}
      </label>
      <div className="bl-svc-layout">
        <div className="bl-catalogue">
          {term ? (
            <>
              <div className="bl-pin">
                <button type="button" className="bl-back" onClick={() => setQ("")}>
                  <ArrowLeft size={15} /> {group ? group.label : "All categories"}
                </button>
                <span>
                  <b>{hits.length >= 80 ? "80+" : hits.length} results</b> for “{q.trim()}”
                </span>
              </div>
              {hits.length ? <ul className="pc-svcs bl-svcs">{hits.map((i) => row(i, true))}</ul> : <p className="bl-empty">No test matches “{q.trim()}”.</p>}
            </>
          ) : group ? (
            <>
              <div className="bl-pin">
                <button type="button" className="bl-back" onClick={() => setCat(null)}>
                  <ArrowLeft size={15} /> All categories
                </button>
                <span>
                  <b>{group.label}</b> · {group.items.length} services · {group.items.filter((i) => added.has(i.id)).length} added
                </span>
              </div>
              <ul className="pc-svcs bl-svcs">{[...group.items].sort((a, b) => a.name.localeCompare(b.name)).map((i) => row(i, false))}</ul>
            </>
          ) : (
            <>
              <div className="bl-cat-head">
                <span>Service catalogue</span>
                <b>Choose a category</b>
                <small>
                  {groups.length} categories · {items.length} services
                </small>
              </div>
              <div className="pc-cats bl-cats">
                {groups.map((g) => {
                  const Icon = categoryMeta(g.key).icon;
                  const n = g.items.filter((i) => added.has(i.id)).length;
                  return (
                    <button key={g.key} type="button" className={`pc-cat ${n ? "has-added" : ""}`} onClick={() => setCat(g.key)}>
                      <Icon className="pc-cat-mark" size={70} strokeWidth={1.4} aria-hidden="true" />
                      <span className="pc-cat-top">
                        <span className="pc-cat-icon" aria-hidden="true">
                          <Icon size={18} />
                        </span>
                        <ChevronRight size={16} className="pc-cat-go" />
                      </span>
                      <b>{g.label}</b>
                      <small>
                        {g.items.length} service{g.items.length === 1 ? "" : "s"}
                      </small>
                      {n > 0 && (
                        <em>
                          <Check size={12} /> {n} added
                        </em>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <aside {...fe("bl-selected", errors.services)}>
          <div className="bl-selected-head">
            <b>Selected services</b>
            <span className="bl-pill">
              {s.services.length} service{s.services.length === 1 ? "" : "s"}
            </span>
          </div>
          {s.services.length === 0 ? (
            <>
              <p className="bl-selected-empty">No services selected yet.</p>
              <FieldError msg={errors.services} />
            </>
          ) : (
            <ul className="bl-lines">
              {s.services.map((x) => {
                const changed = x.overridePrice !== null;
                return (
                  <li key={x.id} {...fe(changed ? "is-changed" : "", errors[`price-${x.id}`])}>
                    <div className="bl-line-top">
                      <span>
                        <b>{x.name}</b>
                        <small>{x.category}</small>
                      </span>
                      <button type="button" className="bl-icon-btn" onClick={() => set((y) => ({ ...y, services: y.services.filter((z) => z.id !== x.id) }))} aria-label={`Remove ${x.name}`}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="bl-line-price">
                      {canAdjust ? (
                        <span className="bl-input is-price">
                          <span>₦</span>
                          <input inputMode="numeric" value={drafts[x.id] ?? appliedPrice(x).toLocaleString("en-NG")} onChange={(e) => setOverride(x.id, e.target.value)} onBlur={() => setDrafts(({ [x.id]: _, ...r }) => r)} aria-label={`Price for ${x.name}`} />
                        </span>
                      ) : (
                        <b className="num">{money(appliedPrice(x))}</b>
                      )}
                      {changed ? (
                        <span className="bl-orig">
                          <span>
                            VIP price · catalogue <s>{money(x.price)}</s>
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              set((y) => ({ ...y, services: y.services.map((z) => (z.id === x.id ? { ...z, overridePrice: null } : z)) }));
                              setDrafts(({ [x.id]: _, ...r }) => r);
                            }}
                          >
                            <RotateCcw size={11} /> Reset
                          </button>
                        </span>
                      ) : (
                        <small className="bl-muted">Catalogue price</small>
                      )}
                    </div>
                    <FieldError msg={errors[`price-${x.id}`]} />
                  </li>
                );
              })}
            </ul>
          )}
          <div className="bl-subtotal">
            <span>
              Subtotal
              {s.services.some((x) => x.overridePrice !== null) && <small>Includes changed prices for this bill</small>}
            </span>
            <b>{money(t.subtotal)}</b>
          </div>
          {!canAdjust && <p className="bl-note">Only the branch manager can change a price.</p>}
        </aside>
      </div>
    </Card>
  );
}

/* ─────────────── Step 3 — Payment ─────────────── */

export function PaymentStep({ s, set, branch, errors = {} }: StepProps) {
  const { user, staff } = useApp();
  // Discounts (owner, 2026-11-25): anyone billing can add one when the company allows discounts; the branch manager must approve it.
  const canAdjust = useConfig().discounts.enabled;
  const discountBy = useMemo(() => discountApprovers(staff, branch.id, user), [staff, branch.id, user]);
  const cfg = useConfig();
  useBranches();
  // Payment methods offered at this branch (company default or the branch's own set).
  const offered = enabledMethods(branch.id);
  const splitOk = cfg.payments.split && offered.length >= 2;
  const approvers = useMemo(() => balanceApprovers(staff, branch.id, user), [staff, branch.id, user]);
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const t = computeBill(s);
  const money = (n: number) => formatMoney(n, branch.currency);
  const [discountToggle, setDiscountOpen] = useState(s.discount.amount > 0);
  // A discount error always shows its section, so the message is visible on the field.
  const discountOpen = discountToggle || !!errors.discount || !!errors.discountReason || !!errors.discountApprovedBy;
  const p = s.payment;
  const setPay = (patch: Partial<typeof p>) => set((x) => ({ ...x, payment: { ...x.payment, ...patch } }));
  const num = (v: string) => Number(v.replace(/[^\d]/g, "")) || 0;
  const methods: { value: PayChoice; label: string; hint: string; icon: LucideIcon }[] = [
    ...offered.map((m) => ({ value: m as PayChoice, label: METHOD_LABEL[m], hint: m === "Cash" ? "Cash at the front desk" : m === "POS" ? "Card on the POS terminal" : "Paid by bank transfer", icon: METHOD_ICON[m] })),
    ...(splitOk ? [{ value: "Split" as PayChoice, label: "Split payment", hint: "More than one method", icon: SplitSquareHorizontal }] : []),
  ];
  // A method switched off in Settings can't stay selected — move to the first one offered.
  const methodOk = p.method === "Split" ? splitOk : offered.includes(p.method as PaymentMethod);
  useEffect(() => {
    if (!methodOk && offered.length) setPay({ method: offered[0] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [methodOk, offered.join("|")]);
  const statuses: { value: PayStatusChoice; label: string; hint: string; icon: LucideIcon }[] = [
    { value: "full", label: "Fully paid", hint: "Full amount received · no balance", icon: CircleCheck },
    { value: "part", label: "Part payment", hint: "Some paid · the rest stays outstanding", icon: CircleDashed },
    { value: "unpaid", label: "Unpaid", hint: "Nothing received · give a reason", icon: CircleX },
  ];

  return (
    <Card icon={CreditCard} title="Payment and discount" hint="Record how the patient paid and any approved discount.">
      <div {...fe("bl-sec", errors.method)}>
        <span className="bl-sec-no">01 · Payment method</span>
        <h4>How was payment received?</h4>
        <div className="bl-options is-4">
          {methods.map((m) => (
            <button key={m.value} type="button" role="radio" aria-checked={p.method === m.value} className={`bl-option ${p.method === m.value ? "is-on" : ""}`} onClick={() => setPay({ method: m.value })}>
              <span className="bl-option-icon">
                <m.icon size={19} />
              </span>
              <b>{m.label}</b>
              <small>{m.hint}</small>
              <i className="bl-radio" aria-hidden="true" />
            </button>
          ))}
        </div>
        <FieldError msg={errors.method} />
      </div>

      {p.method !== "Split" && (
        <div className="bl-sec">
          <span className="bl-sec-no">02 · Payment status</span>
          <h4>Was the bill paid in full?</h4>
          <div className="bl-options is-3">
            {statuses.map((st) => (
              <button key={st.value} type="button" role="radio" aria-checked={p.status === st.value} className={`bl-option is-row ${p.status === st.value ? "is-on" : ""}`} onClick={() => setPay({ status: st.value })}>
                <span className="bl-option-icon">
                  <st.icon size={18} />
                </span>
                <span>
                  <b>{st.label}</b>
                  <small>{st.hint}</small>
                </span>
                <i className="bl-radio" aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="bl-sec bl-detail">
        <span className="bl-sec-no">{p.method === "Split" ? "02" : "03"} · Payment details</span>
        <h4>Record collection</h4>
        {p.method === "Split" ? (
          <div {...fe("bl-split-wrap", errors.split)}>
            <div className="bl-split">
              {offered.map((m) => {
                const Icon = METHOD_ICON[m];
                return (
                  <label key={m} className="bl-field">
                    <span className="bl-label">
                      <Icon size={14} /> {METHOD_LABEL[m]}
                    </span>
                    <span className="bl-input is-price">
                      <span>₦</span>
                      <input inputMode="numeric" value={p.split[m] ? p.split[m].toLocaleString("en-NG") : ""} placeholder="0" onChange={(e) => setPay({ split: { ...p.split, [m]: num(e.target.value) } })} />
                    </span>
                  </label>
                );
              })}
            </div>
            <p className={`bl-callout ${t.amountPaid > t.total ? "is-bad" : ""}`}>
              {t.amountPaid > t.total
                ? `The amounts add up to ${money(t.amountPaid)} — more than the ${money(t.total)} bill.`
                : t.amountPaid === t.total && t.total > 0
                  ? `Fully paid: ${money(t.amountPaid)} across ${t.split.length} method${t.split.length === 1 ? "" : "s"}.`
                  : t.amountPaid > 0
                    ? `Part payment: ${money(t.amountPaid)} received, ${money(t.balance)} stays outstanding.`
                    : `Enter how much was paid by each method (total ${money(t.total)}).`}
            </p>
            <FieldError msg={errors.split} />
          </div>
        ) : p.status === "full" ? (
          <p className="bl-callout">
            The full amount of <b>{money(t.total)}</b> will be recorded as received by {methodWord(p.method as PaymentMethod)}.
          </p>
        ) : p.status === "part" ? (
          <div className="bl-fields is-2">
            <label {...fe("bl-field", errors.partAmount)}>
              <span className="bl-label">
                Amount received now <i>*</i>
              </span>
              <span className="bl-input is-price">
                <span>₦</span>
                <input inputMode="numeric" value={p.partAmount ? p.partAmount.toLocaleString("en-NG") : ""} placeholder="0" onChange={(e) => setPay({ partAmount: num(e.target.value) })} />
              </span>
              {errors.partAmount ? <FieldError msg={errors.partAmount} /> : <small className="bl-help">Must be more than ₦0 and less than {money(t.total)}.</small>}
            </label>
            <p className="bl-callout">The remaining {money(t.balance)} stays as an outstanding balance on the patient's record.</p>
          </div>
        ) : (
          <p className="bl-callout">Nothing is received now — the full {money(t.total)} stays as an outstanding balance on the patient's record.</p>
        )}
        {/* A balance is being left (part payment, unpaid, or a split that falls short): why, who approved it, and when the rest is promised. */}
        {t.total > 0 && t.amountPaid < t.total && (p.method === "Split" ? t.amountPaid > 0 : p.status !== "full") && (
          <div className="bl-balance">
            <span className="bl-balance-title">
              {t.amountPaid > 0 ? "Part payment approval" : "Unpaid bill approval"} · {money(t.balance)} outstanding
            </span>
            <div className="bl-fields is-balance">
              <label {...fe("bl-field is-wide", errors.balanceReason)}>
                <span className="bl-label">
                  {t.amountPaid > 0 ? "Reason for the part payment" : "Reason nothing was paid"} <i>*</i>
                </span>
                <input value={p.balanceReason} onChange={(e) => setPay({ balanceReason: e.target.value })} placeholder={t.amountPaid > 0 ? "e.g. Patient will pay the balance on result collection" : "e.g. Emergency case — family bringing payment"} />
                {errors.balanceReason ? <FieldError msg={errors.balanceReason} /> : <small className="bl-help">Admins see this reason when they review outstanding balances.</small>}
              </label>
              <div {...fe("bl-field", errors.approvedBy)}>
                <span className="bl-label">
                  Approved by <i>*</i>
                </span>
                <SearchSelect
                  value={p.approvedBy}
                  ariaLabel="Approved by"
                  placeholder="Select who approved it"
                  searchPlaceholder="Search approvers"
                  options={approvers}
                  onChange={(v) => setPay({ approvedBy: v })}
                  className="select-btn bl-select"
                  width={340}
                />
                {errors.approvedBy ? <FieldError msg={errors.approvedBy} /> : <small className="bl-help">The branch manager or accountant who agreed to the balance.</small>}
              </div>
              <label {...fe("bl-field", errors.promiseDate)}>
                <span className="bl-label">
                  Promised payment date <small>Optional</small>
                </span>
                <input type="date" value={p.promiseDate} min={todayIso} onChange={(e) => setPay({ promiseDate: e.target.value })} />
                {errors.promiseDate ? <FieldError msg={errors.promiseDate} /> : <small className="bl-help">When the patient said they will pay the rest.</small>}
              </label>
            </div>
          </div>
        )}
      </div>

      <div className={`bl-discount ${discountOpen ? "is-open" : ""}`}>
        <button type="button" className="bl-discount-head" onClick={() => setDiscountOpen((o) => !o)} disabled={!canAdjust} aria-expanded={discountOpen}>
          <span className="bl-option-icon">
            <Percent size={16} />
          </span>
          <span>
            <b>{s.discount.amount > 0 ? `Discount · ${money(t.discount)}` : "Add a discount"}</b>
            <small>{canAdjust ? "Optional. Reduces the bill total; the branch manager approves it" : "Discounts are turned off for the company"}</small>
          </span>
          <span className="bl-tag">Optional</span>
        </button>
        {discountOpen && canAdjust && (
          <div className="bl-fields is-2">
            <label {...fe("bl-field", errors.discount)}>
              <span className="bl-label">Discount amount</span>
              <span className="bl-input is-price">
                <span>₦</span>
                <input inputMode="numeric" value={s.discount.amount ? s.discount.amount.toLocaleString("en-NG") : ""} placeholder="0" onChange={(e) => set((x) => ({ ...x, discount: { ...x.discount, amount: Math.min(num(e.target.value), t.subtotal) } }))} />
              </span>
              {errors.discount ? <FieldError msg={errors.discount} /> : <small className="bl-help">Up to {money(maxDiscount(t.subtotal))}{cfg.discounts.maxPercent < 100 ? ` (${cfg.discounts.maxPercent}% of the bill — company limit)` : ""}.</small>}
            </label>
            <label {...fe("bl-field", errors.discountReason)}>
              <span className="bl-label">Reason {s.discount.amount > 0 && <i>*</i>}</span>
              <input value={s.discount.reason} onChange={(e) => set((x) => ({ ...x, discount: { ...x.discount, reason: e.target.value } }))} placeholder="e.g. Staff family, approved by manager" />
              <FieldError msg={errors.discountReason} />
            </label>
            {s.discount.amount > 0 && (
              <div {...fe("bl-field", errors.discountApprovedBy)}>
                <span className="bl-label">
                  Approved by <i>*</i>
                </span>
                <SearchSelect
                  value={s.discount.approvedBy ?? ""}
                  ariaLabel="Discount approved by"
                  placeholder="Select the branch manager"
                  searchPlaceholder="Search"
                  options={discountBy}
                  onChange={(v) => set((x) => ({ ...x, discount: { ...x.discount, approvedBy: v } }))}
                  className="select-btn bl-select"
                  width={340}
                />
                {errors.discountApprovedBy ? <FieldError msg={errors.discountApprovedBy} /> : <small className="bl-help">Every discount is approved by the branch manager.</small>}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bl-sums">
        <div className="bl-sum">
          <small>Total payable</small>
          <b>{money(t.total)}</b>
          <span>
            Subtotal {money(t.subtotal)}
            {t.discount ? ` − discount ${money(t.discount)}` : " · no discount"}
          </span>
        </div>
        <div className="bl-sum is-solid">
          <small>Amount collected now</small>
          <b>{money(t.amountPaid)}</b>
          <span>{p.method === "Split" ? t.split.map((x) => `${METHOD_LABEL[x.method]} ${money(x.amount)}`).join(" · ") || "Split payment" : t.amountPaid ? `By ${methodWord(p.method as PaymentMethod)}` : "Nothing received"}</span>
        </div>
        <div className={`bl-sum ${t.balance ? "is-due" : ""}`}>
          <small>Outstanding after payment</small>
          <b>{money(t.balance)}</b>
          <span>{t.balance ? "Stays on the patient's record" : "No balance due"}</span>
        </div>
      </div>
    </Card>
  );
}

/* ─────────────── Step 4 — Preview ─────────────── */

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="bl-row">
      <span>{label}</span>
      <b>{children}</b>
    </div>
  );
}

export function PreviewStep({ s, branch, onEdit }: StepProps & { /** Opens that step in a pop-up — the user stays on the preview. */ onEdit: (step: 1 | 2 | 3) => void }) {
  const { agents, user } = useApp();
  const t = computeBill(s);
  const agent = s.agentId !== null ? agents.find((a) => a.id === s.agentId) : undefined;
  const type = s.patient.existingType ?? patientSourceType(s);
  const id = s.patient.existingId ?? s.reservedId ?? "Assigned on completion";
  const money = (n: number) => formatMoney(n, branch.currency);
  const status = t.status === "PAID" ? "Fully paid" : t.amountPaid > 0 ? "Part payment" : "Unpaid";

  return (
    <Card icon={CircleCheck} title="Billing preview" hint="Check everything below, then complete the bill. Nothing is saved until you complete it.">
      <div className="bl-grid-2">
        <section className="bl-pv">
          <header>
            <span>01 · Patient</span>
            <b>Patient and referral</b>
            <button type="button" className="bl-edit" onClick={() => onEdit(1)}>
              Edit details
            </button>
          </header>
          <Row label="Patient">{s.patient.name.trim()}</Row>
          <Row label="Patient ID">
            <span className="mono">{id}</span> {s.patient.existingId ? <em className="bl-pill">Existing</em> : <em className="bl-pill">New · reserved</em>}
          </Row>
          <Row label="Patient type">{type === "REFERRED" ? "Referred" : "Walk-in"}</Row>
          <Row label="Phone">{s.patient.phone.trim() || "Not provided"}</Row>
          <Row label="Patient source">{s.walkIn ? "Walk-in patient" : "Referred"}</Row>
          {!s.walkIn && (
            <>
              <Row label="PR agent">{agent ? agent.name : "Not selected"}</Row>
              <Row label="Referring hospital">{resolveHospital(s.hospital, agent)}</Row>
              {s.referralId && <Row label="Referral ID">{s.referralId}</Row>}
            </>
          )}
          <Row label="Processed by">
            {user.name} · {user.role}
          </Row>
        </section>

        <section className="bl-pv">
          <header>
            <span>02 · Services</span>
            <b>Selected services</b>
            <button type="button" className="bl-edit" onClick={() => onEdit(2)}>
              Edit services
            </button>
          </header>
          {s.services.map((x) => (
            <div key={x.id} className="bl-pv-svc">
              <span>
                <b>{x.name}</b>
                <small>
                  {x.category}
                  {x.overridePrice !== null && (
                    <>
                      {" "}
                      · VIP price · catalogue <s>{money(x.price)}</s>
                    </>
                  )}
                </small>
              </span>
              <b className="num">{money(appliedPrice(x))}</b>
            </div>
          ))}
          <Row label="Subtotal">{money(t.subtotal)}</Row>
          <Row label="Discount">{t.discount ? `− ${money(t.discount)} (${s.discount.reason.trim()})` : "No discount"}</Row>
          {t.discount > 0 && <Row label="Discount approved by">{s.discount.approvedBy ? s.discount.approvedBy.replace("|", " · ") : "—"}</Row>}
          <div className="bl-total">
            <span>Total payable</span>
            <b>{money(t.total)}</b>
          </div>
        </section>

        <section className="bl-pv">
          <header>
            <span>03 · Payment</span>
            <b>Payment details</b>
            <button type="button" className="bl-edit" onClick={() => onEdit(3)}>
              Edit payment
            </button>
          </header>
          <Row label="Payment status">
            <em className={`bl-pill ${t.status === "PAID" ? "is-ok" : "is-due"}`}>{status}</em>
          </Row>
          <Row label="Method">{t.amountPaid > 0 ? methodLabel(s.payment.method) : "Not paid"}</Row>
          {t.split.map((x) => (
            <Row key={x.method} label={`· ${METHOD_LABEL[x.method]}`}>
              {money(x.amount)}
            </Row>
          ))}
          <Row label="Amount paid">{money(t.amountPaid)}</Row>
          <Row label="Outstanding">{t.balance ? money(t.balance) : "Fully paid"}</Row>
          {t.balance > 0 && (
            <>
              <Row label="Reason for balance">{s.payment.balanceReason.trim() || "—"}</Row>
              <Row label="Approved by">{s.payment.approvedBy ? s.payment.approvedBy.replace("|", " · ") : "—"}</Row>
              <Row label="Promised payment date">{s.payment.promiseDate ? new Date(`${s.payment.promiseDate}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "Not given"}</Row>
            </>
          )}
        </section>

        <section className="bl-pv">
          <header>
            <span>04 · Transaction</span>
            <b>Branch and processing</b>
          </header>
          <Row label="Branch">
            {branch.name} · {branch.code}
          </Row>
          <Row label="Currency">{branch.currency}</Row>
          <Row label="Processed by">{user.name}</Row>
          <Row label="Invoice number">Generated when billing is completed</Row>
          <Row label="Transaction time">Recorded when billing is completed</Row>
        </section>
      </div>
      <p className="bl-note is-box">
        <Info size={15} /> This preview is not saved yet. Edit any section above, then complete the bill — the receipt is only produced after the bill is saved.
      </p>
    </Card>
  );
}

