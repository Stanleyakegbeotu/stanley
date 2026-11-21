import { useMemo, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Building2, Check, MoreHorizontal, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { useApp } from "@/app/AppState";
import { BRANCHES, getBranch } from "@/data/demo/catalog";
import { AUDIT, DRAFTS, EXPENSE_RECORDS, HEADCOUNT, INVENTORY, PATIENTS, PR_OFFICERS, STAFF, TRANSACTIONS, TRASH } from "@/data/demo/records";
import type { Currency, Money } from "@/data/types";
import { CountUp, Reveal, useMotionPreset } from "@/shared/motion";
import { formatCount, formatMoney, formatRelative, initials, moneyEntries } from "@/shared/format";
import { Badge, Button, DemoChip, EmptyState, Row, SearchInput, Segmented, Table, type Tone } from "@/shared/ui/controls";
import { Modal } from "@/shared/ui/Modal";
import { resolveRange, summarize } from "@/services/analytics";

/** null = every branch (company-wide), otherwise the branches in scope. */
export type Scope = string[] | null;
const inScope = (scope: Scope, branchId: string) => !scope || scope.includes(branchId);
const branchName = (id: string) => getBranch(id)?.name ?? id;
const cur = (branchId: string): Currency => getBranch(branchId)?.currency ?? "NGN";

/* ─────────────── Stat tiles ─────────────── */
export function StatTiles({ items }: { items: { label: string; value: ReactNode; hint?: string }[] }) {
  const m = useMotionPreset();
  return (
    <Reveal mode="stagger" className="stat-grid">
      {items.map((it) => (
        <motion.div key={it.label} className="stat-tile" variants={m.revealItem} whileHover={m.cardHover}>
          <span>{it.label}</span>
          <strong>{it.value}</strong>
          {it.hint && <small>{it.hint}</small>}
        </motion.div>
      ))}
    </Reveal>
  );
}

export function MoneyStack({ money }: { money: Money }) {
  const e = moneyEntries(money);
  if (!e.length) return <>—</>;
  return (
    <span className="money-stack">
      {e.map(([c, v]) => (
        <span key={c}>
          <CountUp value={v} format={(n) => formatMoney(n, c, true)} />
        </span>
      ))}
    </span>
  );
}

export function Panel({ title, description, actions, children }: { title: string; description?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <Reveal className="card card-pad">
      <div className="card-head">
        <div>
          <h3>{title}</h3>
          {description && <p>{description}</p>}
        </div>
        {actions && <div className="card-head-actions">{actions}</div>}
      </div>
      {children}
    </Reveal>
  );
}

/* ─────────────── Inventory ─────────────── */
export function InventoryView({ scope, initialFilter = "all" }: { scope: Scope; initialFilter?: "all" | "low" | "expiring" }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "low" | "expiring">(initialFilter);
  const items = INVENTORY.filter((i) => inScope(scope, i.branchId));
  const low = items.filter((i) => i.stock < i.reorderLevel);
  const expiring = items.filter((i) => i.expiresInDays !== null && i.expiresInDays <= 30);
  const value: Money = {};
  items.forEach((i) => (value[cur(i.branchId)] = (value[cur(i.branchId)] ?? 0) + i.stock * i.unitCost));
  const rows = (filter === "low" ? low : filter === "expiring" ? expiring : items).filter((i) => `${i.name} ${i.category} ${branchName(i.branchId)}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <StatTiles
        items={[
          { label: "Items tracked", value: <CountUp value={items.length} format={formatCount} /> },
          { label: "Below reorder level", value: <CountUp value={low.length} format={formatCount} />, hint: "Needs restocking" },
          { label: "Expiring within 30 days", value: <CountUp value={expiring.length} format={formatCount} /> },
          { label: "Stock value", value: <MoneyStack money={value} />, hint: "Kept per currency" },
        ]}
      />
      <Panel
        title="Stock register"
        description="Quantities on hand against reorder levels"
        actions={
          <div className="toolbar">
            <SearchInput placeholder="Search items" value={q} onChange={setQ} />
            <Segmented label="Stock filter" value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "low", label: `Low (${low.length})` }, { value: "expiring", label: "Expiring" }]} />
          </div>
        }
      >
        {rows.length === 0 ? (
          <EmptyState title="No items match" />
        ) : (
          <Table headers={["Item", "Category", ...(scope?.length === 1 ? [] : ["Branch"]), "On hand", "Reorder level", "Expiry", { label: "Value", align: "right" }, "Status"]} label="Inventory">
            {rows.map((i) => {
              const status: [string, Tone] = i.stock <= i.reorderLevel * 0.5 ? ["Critical", "danger"] : i.stock < i.reorderLevel ? ["Low", "warn"] : ["In stock", "ok"];
              return (
                <Row key={i.id}>
                  <td>
                    <strong>{i.name}</strong>
                    <div className="hint mono">{i.id}</div>
                  </td>
                  <td>{i.category}</td>
                  {scope?.length === 1 ? null : <td>{branchName(i.branchId)}</td>}
                  <td style={{ minWidth: 150 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span className="num" style={{ width: 54 }}>
                        {i.stock} {i.unit}s
                      </span>
                      <div className="progress" style={{ flex: 1 }}>
                        <div style={{ width: `${Math.min(100, (i.stock / (i.reorderLevel * 2)) * 100)}%`, background: status[1] === "ok" ? "var(--brand-500)" : `var(--${status[1]})` }} />
                      </div>
                    </div>
                  </td>
                  <td className="num">{i.reorderLevel}</td>
                  <td>{i.expiresInDays === null ? "—" : `${i.expiresInDays} days`}</td>
                  <td className="right num">{formatMoney(i.stock * i.unitCost, cur(i.branchId))}</td>
                  <td>
                    <Badge tone={status[1]} dot>
                      {status[0]}
                    </Badge>
                  </td>
                </Row>
              );
            })}
          </Table>
        )}
      </Panel>
    </>
  );
}

/* ─────────────── Staff ─────────────── */
export function StaffTable({ branchId }: { branchId: string }) {
  const [q, setQ] = useState("");
  const rows = STAFF.filter((s) => s.branchId === branchId && `${s.name} ${s.role}`.toLowerCase().includes(q.toLowerCase()));
  const manager = STAFF.find((s) => s.branchId === branchId && s.role === "Branch Manager");
  const hc = HEADCOUNT[branchId];
  return (
    <>
      {manager && (
        <Reveal className="card card-pad manager-card">
          <span className="avatar lg">{initials(manager.name)}</span>
          <div style={{ flex: 1 }}>
            <span className="eyebrow">Branch manager</span>
            <h3 style={{ margin: "4px 0 2px", fontSize: 18 }}>{manager.name}</h3>
            <p className="hint" style={{ margin: 0 }}>
              {manager.email} · Added {manager.added}
            </p>
          </div>
          <Badge tone="ok" dot>
            Active
          </Badge>
        </Reveal>
      )}
      <Panel
        title="Branch staff"
        description={`${rows.length} accounts shown · ${hc?.total ?? rows.length} on the full roster`}
        actions={<SearchInput placeholder="Search staff" value={q} onChange={setQ} />}
      >
        <Table headers={["Staff member", "Role", "Status", "Date added", "Last activity", ""]} label="Staff">
          {rows.map((s) => (
            <Row key={s.id}>
              <td>
                <div className="person">
                  <span className="avatar">{initials(s.name)}</span>
                  <div>
                    <strong>{s.name}</strong>
                    <small>{s.email}</small>
                  </div>
                </div>
              </td>
              <td>{s.role}</td>
              <td>
                <Badge tone={s.status === "Active" ? "ok" : s.status === "On leave" ? "warn" : "neutral"} dot>
                  {s.status}
                </Badge>
              </td>
              <td>{s.added}</td>
              <td>{formatRelative(s.lastActive)}</td>
              <td>
                <button className="icon-btn" aria-label={`Actions for ${s.name}`}>
                  <MoreHorizontal size={18} />
                </button>
              </td>
            </Row>
          ))}
        </Table>
      </Panel>
    </>
  );
}

export function StaffBranchPicker({ scope, selected, onSelect }: { scope: Scope; selected: string | null; onSelect: (id: string | null) => void }) {
  const m = useMotionPreset();
  if (selected)
    return (
      <>
        <Reveal>
          <button className="text-link" style={{ marginBottom: 16 }} onClick={() => onSelect(null)}>
            <ArrowLeft size={15} /> Back to branch selection
          </button>
        </Reveal>
        <StaffTable branchId={selected} />
      </>
    );
  return (
    <Reveal mode="stagger" className="branch-grid">
      {BRANCHES.filter((b) => inScope(scope, b.id)).map((b) => {
        const hc = HEADCOUNT[b.id];
        return (
          <motion.button key={b.id} className="card branch-card select-card" variants={m.revealItem} whileHover={m.cardHover} onClick={() => onSelect(b.id)} disabled={b.status !== "Active"}>
            <div className="branch-card-head">
              <span className="branch-glyph">
                <Building2 size={20} />
              </span>
              <div>
                <h3>{b.name}</h3>
                <p>{b.city}</p>
              </div>
              <div className="badges">
                <Badge tone={b.status === "Active" ? "ok" : "neutral"} dot>
                  {b.status}
                </Badge>
              </div>
            </div>
            <div className="branch-stats" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
              <div>
                <span>Total staff</span>
                <strong>{hc.total}</strong>
              </div>
              <div>
                <span>Active</span>
                <strong>{hc.active}</strong>
              </div>
              <div>
                <span>On leave</span>
                <strong>{hc.onLeave}</strong>
              </div>
            </div>
            <span className="text-link">
              {b.status === "Active" ? "Manage branch staff" : "No staff assigned yet"} <ArrowRight size={14} />
            </span>
          </motion.button>
        );
      })}
    </Reveal>
  );
}

/* ─────────────── PR Management ─────────────── */
export function PRView({ scope }: { scope: Scope }) {
  const { period } = useApp();
  const range = resolveRange(period);
  const rows = PR_OFFICERS.filter((p) => inScope(scope, p.branchId)).map((p) => {
    const s = summarize([p.branchId], range);
    const c = cur(p.branchId);
    return { ...p, referrals: Math.round(s.referrals * p.share), commission: (s.prCommission[c] ?? 0) * p.share, currency: c };
  });
  const commissions: Money = {};
  rows.forEach((r) => (commissions[r.currency] = (commissions[r.currency] ?? 0) + r.commission));
  return (
    <>
      <StatTiles
        items={[
          { label: "PR officers", value: <CountUp value={rows.length} format={formatCount} /> },
          { label: "Referral partners", value: <CountUp value={rows.reduce((s, r) => s + r.partners, 0)} format={formatCount} /> },
          { label: "Attributed referrals", value: <CountUp value={rows.reduce((s, r) => s + r.referrals, 0)} format={formatCount} />, hint: "Selected reporting period" },
          { label: "Commissions earned", value: <MoneyStack money={commissions} />, hint: "Kept per currency" },
        ]}
      />
      <Panel title="PR officers" description="Referral attribution and commission accrued in the selected reporting period">
        <Table headers={["Officer", ...(scope?.length === 1 ? [] : ["Branch"]), "Partners", "Referrals", { label: "Commission earned", align: "right" }, "Status"]} label="PR officers">
          {rows.map((r) => (
            <Row key={r.id}>
              <td>
                <div className="person">
                  <span className="avatar">{initials(r.name)}</span>
                  <div>
                    <strong>{r.name}</strong>
                    <small className="mono">{r.id}</small>
                  </div>
                </div>
              </td>
              {scope?.length === 1 ? null : <td>{branchName(r.branchId)}</td>}
              <td className="num">{r.partners}</td>
              <td className="num">{formatCount(r.referrals)}</td>
              <td className="right num">
                <strong>{formatMoney(r.commission, r.currency)}</strong>
              </td>
              <td>
                <Badge tone={r.status === "Active" ? "ok" : "warn"} dot>
                  {r.status}
                </Badge>
              </td>
            </Row>
          ))}
        </Table>
      </Panel>
    </>
  );
}

/* ─────────────── Patients ─────────────── */
export function PatientsView({ scope, initialQuery = "" }: { scope: Scope; initialQuery?: string }) {
  const [q, setQ] = useState(initialQuery);
  const rows = PATIENTS.filter((p) => inScope(scope, p.branchId) && `${p.name} ${p.id} ${p.phone}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Panel title="Patient directory" description={scope ? "Patients registered at this branch" : "Patient discovery covers every branch, regardless of the branch in view"} actions={<SearchInput placeholder="Name, patient ID or phone" value={q} onChange={setQ} />}>
      {rows.length === 0 ? (
        <EmptyState title="No patients match your search" />
      ) : (
        <Table headers={["Patient", "Patient ID", ...(scope?.length === 1 ? [] : ["Registration branch"]), "Phone", "Last visit", "Diagnostic orders", ""]} label="Patients">
          {rows.map((p) => (
            <Row key={p.id}>
              <td>
                <div className="person">
                  <span className="avatar">{initials(p.name)}</span>
                  <div>
                    <strong>{p.name}</strong>
                    <small>{p.sex}</small>
                  </div>
                </div>
              </td>
              <td className="mono">{p.id}</td>
              {scope?.length === 1 ? null : (
                <td>
                  <Badge tone="brand">{branchName(p.branchId)}</Badge>
                </td>
              )}
              <td>{p.phone}</td>
              <td>{formatRelative(p.last)}</td>
              <td className="num">{p.orders}</td>
              <td>
                <button className="text-link">View history</button>
              </td>
            </Row>
          ))}
        </Table>
      )}
    </Panel>
  );
}

/* ─────────────── Transactions ─────────────── */
export function TransactionsTable({ scope, title = "Payment transactions" }: { scope: Scope; title?: string }) {
  const [q, setQ] = useState("");
  const rows = TRANSACTIONS.filter((t) => inScope(scope, t.branchId) && `${t.id} ${t.patient}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Panel title={title} description="Billed amount, payment received and balance are recorded separately" actions={<SearchInput placeholder="Search transactions" value={q} onChange={setQ} />}>
      <Table headers={["Transaction", "Patient", ...(scope?.length === 1 ? [] : ["Branch"]), { label: "Billed", align: "right" }, { label: "Paid", align: "right" }, { label: "Balance", align: "right" }, "Method", "Time"]} label="Transactions">
        {rows.map((t) => {
          const c = cur(t.branchId);
          const bal = t.billed - t.paid;
          return (
            <Row key={t.id}>
              <td className="mono">
                <strong>{t.id}</strong>
              </td>
              <td>{t.patient}</td>
              {scope?.length === 1 ? null : <td>{branchName(t.branchId)}</td>}
              <td className="right num">{formatMoney(t.billed, c)}</td>
              <td className="right num">
                <strong>{formatMoney(t.paid, c)}</strong>
              </td>
              <td className="right num" style={{ color: bal > 0 ? "var(--danger)" : undefined }}>
                {formatMoney(bal, c)}
              </td>
              <td>{t.method}</td>
              <td>{formatRelative(t.at)}</td>
            </Row>
          );
        })}
      </Table>
    </Panel>
  );
}

/* ─────────────── Expenses ─────────────── */
export function ExpensesTable({ scope, canApprove }: { scope: Scope; canApprove: boolean }) {
  const { showToast } = useApp();
  const [records, setRecords] = useState(EXPENSE_RECORDS);
  const [adding, setAdding] = useState(false);
  const rows = records.filter((e) => inScope(scope, e.branchId));
  const decide = (id: string, status: "Approved" | "Rejected") => {
    setRecords((rs) => rs.map((r) => (r.id === id ? { ...r, status } : r)));
    showToast(`${id} ${status.toLowerCase()} (demo — not saved)`);
  };
  return (
    <Panel
      title="Expense records"
      description="Only approved expenses count towards reported expense totals"
      actions={
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus size={15} /> Record expense
        </Button>
      }
    >
      <Table headers={["Expense", "Category", ...(scope?.length === 1 ? [] : ["Branch"]), { label: "Amount", align: "right" }, "Expense date", "Recorded by", "Status", ""]} label="Expenses">
        {rows.map((e) => (
          <Row key={e.id}>
            <td>
              <strong>{e.description}</strong>
              <div className="hint mono">{e.id}</div>
            </td>
            <td>{e.category}</td>
            {scope?.length === 1 ? null : <td>{branchName(e.branchId)}</td>}
            <td className="right num">
              <strong>{formatMoney(e.amount, cur(e.branchId))}</strong>
            </td>
            <td>{formatRelative(e.date)}</td>
            <td>{e.by}</td>
            <td>
              <Badge tone={e.status === "Approved" ? "ok" : e.status === "Pending" ? "warn" : "danger"} dot>
                {e.status}
              </Badge>
            </td>
            <td>
              {e.status === "Pending" && canApprove ? (
                <div className="toolbar" style={{ flexWrap: "nowrap" }}>
                  <Button size="sm" variant="secondary" onClick={() => decide(e.id, "Rejected")} aria-label={`Reject ${e.id}`}>
                    <X size={14} />
                  </Button>
                  <Button size="sm" onClick={() => decide(e.id, "Approved")}>
                    <Check size={14} /> Approve
                  </Button>
                </div>
              ) : null}
            </td>
          </Row>
        ))}
      </Table>
      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Record expense"
        description="New expenses are submitted for approval before they count towards totals."
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setAdding(false);
                showToast("Expense submitted for approval (demo — not saved)");
              }}
            >
              Submit for approval
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <label className="field full">
            Description
            <input placeholder="e.g. Reagent restock" />
          </label>
          <label className="field">
            Category
            <select>
              {["Reagents & consumables", "Utilities", "Equipment maintenance", "Logistics", "Administrative"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Amount (branch currency)
            <input inputMode="decimal" placeholder="0.00" />
          </label>
          <label className="field">
            Expense date
            <input type="date" />
          </label>
          <label className="field">
            Supplier
            <input placeholder="Optional" />
          </label>
        </div>
      </Modal>
    </Panel>
  );
}

/* ─────────────── Drafts ─────────────── */
export function DraftsView({ branchId }: { branchId: string }) {
  const { showToast } = useApp();
  const [drafts, setDrafts] = useState(DRAFTS.filter((d) => d.branchId === branchId));
  const c = cur(branchId);
  return (
    <Panel title="Saved draft bills" description="Drafts are not invoices and do not count towards revenue until finalised">
      {drafts.length === 0 ? (
        <EmptyState title="No drafts" />
      ) : (
        <Table headers={["Draft", "Patient", "Services", { label: "Draft amount", align: "right" }, "Saved", "By", ""]} label="Drafts">
          {drafts.map((d) => (
            <Row key={d.id}>
              <td className="mono">
                <strong>{d.id}</strong>
              </td>
              <td>{d.patient}</td>
              <td>{d.services}</td>
              <td className="right num">{formatMoney(d.amount, c)}</td>
              <td>{formatRelative(d.saved)}</td>
              <td>{d.by}</td>
              <td>
                <div className="toolbar" style={{ flexWrap: "nowrap" }}>
                  <Button size="sm" variant="secondary" onClick={() => setDrafts((ds) => ds.filter((x) => x.id !== d.id))} aria-label={`Discard ${d.id}`}>
                    <Trash2 size={14} />
                  </Button>
                  <Button size="sm" onClick={() => showToast(`Resuming ${d.id} (demo)`)}>
                    Resume
                  </Button>
                </div>
              </td>
            </Row>
          ))}
        </Table>
      )}
    </Panel>
  );
}

/* ─────────────── Audit ─────────────── */
export function AuditView({ scope }: { scope: Scope }) {
  const [q, setQ] = useState("");
  const rows = AUDIT.filter((a) => inScope(scope, a.branchId) && `${a.user} ${a.action} ${a.record}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Panel title="Activity records" description="Read-only history — entries cannot be edited or deleted" actions={<SearchInput placeholder="Search user, action or record" value={q} onChange={setQ} />}>
      <Table headers={["User", "Role", ...(scope?.length === 1 ? [] : ["Branch"]), "Action", "Affected record", "Change details", "Date & time"]} label="Audit log">
        {rows.map((a, i) => (
          <Row key={i}>
            <td>
              <strong>{a.user}</strong>
            </td>
            <td>{a.role}</td>
            {scope?.length === 1 ? null : <td>{branchName(a.branchId)}</td>}
            <td>
              <Badge>{a.action}</Badge>
            </td>
            <td>{a.record}</td>
            <td>{a.change}</td>
            <td>{a.at.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
          </Row>
        ))}
      </Table>
    </Panel>
  );
}

/* ─────────────── Trash ─────────────── */
export function TrashView({ scope }: { scope: Scope }) {
  const { showToast } = useApp();
  const [items, setItems] = useState(TRASH);
  const [purge, setPurge] = useState<(typeof TRASH)[number] | null>(null);
  const rows = useMemo(() => items.filter((t) => inScope(scope, t.branchId)), [items, scope]);
  return (
    <Panel title="Deleted records" description="Items are kept for 30 days and can be restored before permanent deletion" actions={<DemoChip />}>
      {rows.length === 0 ? (
        <EmptyState title="Trash is empty" />
      ) : (
        <Table headers={["Record", "Type", ...(scope?.length === 1 ? [] : ["Branch"]), "Deleted by", "Deleted", "Permanent deletion", ""]} label="Trash">
          {rows.map((t) => (
            <Row key={t.id}>
              <td>
                <strong>{t.name}</strong>
              </td>
              <td>{t.type}</td>
              {scope?.length === 1 ? null : <td>{branchName(t.branchId)}</td>}
              <td>{t.deletedBy}</td>
              <td>{formatRelative(t.deletedAt)}</td>
              <td>
                <Badge tone={t.purgeInDays < 20 ? "warn" : "neutral"}>in {t.purgeInDays} days</Badge>
              </td>
              <td>
                <div className="toolbar" style={{ flexWrap: "nowrap" }}>
                  <Button size="sm" variant="secondary" onClick={() => setPurge(t)} aria-label={`Delete ${t.name} permanently`}>
                    <Trash2 size={14} />
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setItems((xs) => xs.filter((x) => x.id !== t.id));
                      showToast(`${t.name} restored (demo — not saved)`);
                    }}
                  >
                    <RotateCcw size={14} /> Restore
                  </Button>
                </div>
              </td>
            </Row>
          ))}
        </Table>
      )}
      <Modal
        open={!!purge}
        onClose={() => setPurge(null)}
        title="Delete permanently?"
        description={purge ? `${purge.name} will be removed for good. This cannot be undone.` : ""}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPurge(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (purge) setItems((xs) => xs.filter((x) => x.id !== purge.id));
                setPurge(null);
                showToast("Record permanently deleted (demo — not saved)");
              }}
            >
              Delete permanently
            </Button>
          </>
        }
      >
        <div className="notice warn">
          <Trash2 size={17} />
          <span>Permanent deletion is recorded in the audit log.</span>
        </div>
      </Modal>
    </Panel>
  );
}
