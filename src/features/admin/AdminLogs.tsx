/**
 * Audit Log and Trash — plain, table-first admin pages.
 *
 *  • Audit Log: every change made in STANLEY (read-only). Search, filter by
 *    area / person / date, paginate, and open an entry for its full details.
 *  • Trash: deleted records kept 30 days. Restore, or delete permanently
 *    (with confirmation). Only records created in STANLEY can be deleted — the
 *    legacy baseline never can.
 */
import { useMemo, useState } from "react";
import { CalendarDays, ClipboardList, History, Info, RotateCcw, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { useApp, TRASH_RETENTION_DAYS, type TrashItem } from "@/app/AppState";
import { getBranch } from "@/data/company";
import { DATA_START, TODAY, isoDate } from "@/data/demo/generator";
import { AUDIT_CATEGORIES, useAuditLog, type AuditEntry } from "@/services/audit";
import { formatCount } from "@/shared/format";
import { Badge, Button, EmptyState, SearchInput, Segmented, SelectMenu } from "@/shared/ui/controls";
import { Modal } from "@/shared/ui/Modal";
import { Pagination } from "@/shared/ui/Pagination";
import { SummaryChips } from "@/features/dashboard/ExpensesPatients";

const when = (d: Date) => `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
const branchName = (id: string | null) => (id ? `${getBranch(id)?.name ?? id}` : "Company-wide");
const DAY = 86_400_000;

function usePaging<T>(rows: T[], initial = 25) {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(initial);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const safe = Math.min(page, pages);
  return {
    visible: rows.slice((safe - 1) * size, safe * size),
    pager: (noun: string) => (
      <Pagination
        page={safe}
        pageSize={size}
        sizes={[10, 25, 50, 100]}
        total={rows.length}
        noun={noun}
        onPage={(p) => setPage(Math.min(Math.max(1, p), pages))}
        onPageSize={(s) => {
          setSize(s);
          setPage(1);
        }}
      />
    ),
    reset: () => setPage(1),
  };
}

/* ─────────────── Audit Log ─────────────── */

/**
 * `branchMode` (branch workspace Audit): the branch's own entries, plus — unless
 * switched off — company-wide changes that apply to it (catalogue prices,
 * branding…), tagged "Company-wide".
 */
export function AuditLogView({ scope, branchMode = false }: { scope: string[] | null; branchMode?: boolean }) {
  const log = useAuditLog();
  const [companyWide, setCompanyWide] = useState(true);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [user, setUser] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [open, setOpen] = useState<AuditEntry | null>(null);

  const inScope = log.filter((e) => !scope || (!e.branchId ? !branchMode || companyWide : scope.includes(e.branchId)));
  const users = [...new Set(inScope.map((e) => e.user))];
  const term = q.trim().toLowerCase();
  const rows = inScope.filter((e) => {
    if (category !== "all" && e.category !== category) return false;
    if (user !== "all" && e.user !== user) return false;
    const day = isoDate(e.at);
    if (from && day < from) return false;
    if (to && day > to) return false;
    return !term || `${e.id} ${e.user} ${e.role} ${e.action} ${e.record} ${e.details} ${e.category}`.toLowerCase().includes(term);
  });
  const paging = usePaging(rows);
  const today = isoDate(new Date());
  const filtered = category !== "all" || user !== "all" || !!from || !!to || !!term;

  return (
    <div className="inv">
      <SummaryChips
        items={[
          { label: "Entries", icon: ClipboardList, value: formatCount(inScope.length), caption: "Every recorded change" },
          { label: "Today", icon: CalendarDays, value: formatCount(inScope.filter((e) => isoDate(e.at) === today).length), caption: "Changes made today" },
          { label: "People", icon: UserRound, value: formatCount(users.filter((u) => u !== "System").length), caption: "Who made changes" },
          { label: "Read-only", icon: ShieldCheck, value: "Protected", caption: "Entries cannot be edited or deleted" },
        ]}
      />

      <div className="inv-toolbar al-toolbar">
        <SearchInput
          placeholder="Search action, record, person or details"
          value={q}
          onChange={(v) => {
            setQ(v);
            paging.reset();
          }}
        />
        <SelectMenu
          value={category}
          ariaLabel="Area"
          className="select-btn inv-sort"
          options={[{ value: "all", label: "All areas" }, ...AUDIT_CATEGORIES.map((c) => ({ value: c, label: c }))]}
          onChange={(v: string) => {
            setCategory(v);
            paging.reset();
          }}
        />
        <SelectMenu
          value={user}
          ariaLabel="Person"
          className="select-btn inv-sort"
          options={[{ value: "all", label: "Everyone" }, ...users.map((u) => ({ value: u, label: u }))]}
          onChange={(v: string) => {
            setUser(v);
            paging.reset();
          }}
        />
        <label className="al-date">
          <span>From</span>
          <input type="date" value={from} max={to || isoDate(TODAY)} onChange={(e) => (setFrom(e.target.value), paging.reset())} />
        </label>
        <label className="al-date">
          <span>To</span>
          <input type="date" value={to} min={from || isoDate(DATA_START)} onChange={(e) => (setTo(e.target.value), paging.reset())} />
        </label>
        {branchMode && (
          <Segmented
            value={companyWide ? "all" : "branch"}
            label="Which changes"
            options={[
              { value: "all", label: "Branch + company-wide" },
              { value: "branch", label: "This branch only" },
            ]}
            onChange={(v: string) => {
              setCompanyWide(v === "all");
              paging.reset();
            }}
          />
        )}
        {filtered && (
          <button
            type="button"
            className="text-link"
            onClick={() => {
              setQ("");
              setCategory("all");
              setUser("all");
              setFrom("");
              setTo("");
              paging.reset();
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="card bp-card rf-table-card">
        <div className="inv-table-tools">
          <span className="inv-count">
            {formatCount(rows.length)} of {formatCount(inScope.length)} entries · newest first
          </span>
        </div>
        <div className="table-wrap thin-scroll">
          <table className="bp-table rf-table al-table" aria-label="Audit log">
            <thead>
              <tr>
                <th>Date & time</th>
                <th>Person</th>
                <th>Area</th>
                <th>Action</th>
                <th>Record</th>
                <th>Details</th>
                {(!scope || scope.length > 1) && <th>Branch</th>}
              </tr>
            </thead>
            <tbody>
              {paging.visible.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState title={filtered ? "No entries match these filters" : "No activity yet"} />
                  </td>
                </tr>
              ) : (
                paging.visible.map((e) => (
                  <tr key={e.id} className="pr-row" tabIndex={0} onClick={() => setOpen(e)} onKeyDown={(k) => (k.key === "Enter" || k.key === " ") && (k.preventDefault(), setOpen(e))} aria-label={`${e.action} — open details`}>
                    <td className="num ep-nowrap">
                      {when(e.at)}
                      <small className="ep-sub mono">{e.id}</small>
                    </td>
                    <td>
                      <strong>{e.user}</strong>
                      <small className="ep-sub">{e.role}</small>
                    </td>
                    <td>
                      <Badge tone={e.category === "Trash" ? "warn" : e.category === "System" ? "neutral" : "brand"}>{e.category}</Badge>
                      {branchMode && !e.branchId && <small className="ep-sub">Company-wide</small>}
                    </td>
                    <td className="al-action">{e.action}</td>
                    <td className="al-record">{e.record}</td>
                    <td className="al-details">{e.details}</td>
                    {(!scope || scope.length > 1) && <td>{branchName(e.branchId)}</td>}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {paging.pager("entries")}
      </div>
      <p className="lg-muted al-note">
        <Info size={14} /> Changes are recorded as they happen and cannot be edited or removed. Kept for this session until the database is connected.
      </p>

      <Modal
        open={!!open}
        onClose={() => setOpen(null)}
        icon={History}
        title={open?.action ?? ""}
        description={open ? `${open.id} · ${when(open.at)}` : ""}
        footer={<Button onClick={() => setOpen(null)}>Done</Button>}
      >
        {open && (
          <dl className="fin-detail">
            <div>
              <dt>Person</dt>
              <dd>
                {open.user}
                <small>{open.role}</small>
              </dd>
            </div>
            <div>
              <dt>Area</dt>
              <dd>{open.category}</dd>
            </div>
            <div>
              <dt>Record</dt>
              <dd>{open.record}</dd>
            </div>
            <div>
              <dt>Branch</dt>
              <dd>{branchName(open.branchId)}</dd>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <dt>Details</dt>
              <dd>{open.details}</dd>
            </div>
          </dl>
        )}
      </Modal>
    </div>
  );
}

/* ─────────────── Trash ─────────────── */

export const daysLeft = (t: TrashItem) => Math.max(0, TRASH_RETENTION_DAYS - Math.floor((Date.now() - new Date(t.deletedAt).getTime()) / DAY));

/** `readOnly`: branch staff can see what was deleted, but only managers and admins restore or delete. */
export function TrashLogView({ scope, readOnly = false }: { scope: string[] | null; readOnly?: boolean }) {
  const { trash, restoreFromTrash, purgeFromTrash, showToast } = useApp();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | TrashItem["kind"]>("all");
  const [purge, setPurge] = useState<TrashItem | null>(null);
  const inScope = useMemo(() => trash.filter((t) => !scope || scope.includes(t.branchId)), [trash, scope]);
  const term = q.trim().toLowerCase();
  const rows = inScope.filter((t) => (kind === "all" || t.kind === kind) && (!term || `${t.name} ${t.type} ${t.reason ?? ""} ${t.deletedBy}`.toLowerCase().includes(term)));
  const paging = usePaging(rows);

  return (
    <div className="inv">
      <SummaryChips
        items={[
          { label: "In trash", icon: Trash2, value: formatCount(inScope.length), caption: `Kept ${TRASH_RETENTION_DAYS} days, then removed for good` },
          { label: "Staff", icon: UserRound, value: formatCount(inScope.filter((t) => t.kind === "staff").length), caption: "Deleted staff records" },
          { label: "PR agents", icon: ClipboardList, value: formatCount(inScope.filter((t) => t.kind === "agent").length), caption: "Agents added in the app" },
          { label: "Expiring soon", icon: CalendarDays, value: formatCount(inScope.filter((t) => daysLeft(t) <= 7).length), caption: "7 days or less left" },
        ]}
      />

      <div className="inv-toolbar al-toolbar">
        <SearchInput
          placeholder="Search name, type, reason or who deleted it"
          value={q}
          onChange={(v) => {
            setQ(v);
            paging.reset();
          }}
        />
        <SelectMenu
          value={kind}
          ariaLabel="Type"
          className="select-btn inv-sort"
          options={[
            { value: "all", label: "All types" },
            { value: "staff", label: "Staff" },
            { value: "agent", label: "PR agents" },
          ]}
          onChange={(v: "all" | TrashItem["kind"]) => {
            setKind(v);
            paging.reset();
          }}
        />
      </div>

      <div className="card bp-card rf-table-card">
        <div className="inv-table-tools">
          <span className="inv-count">
            {formatCount(rows.length)} of {formatCount(inScope.length)} deleted records · newest first
          </span>
        </div>
        <div className="table-wrap thin-scroll">
          <table className="bp-table rf-table al-table" aria-label="Trash">
            <thead>
              <tr>
                <th>Record</th>
                <th>Type</th>
                <th>Branch</th>
                <th>Deleted by</th>
                <th>Deleted on</th>
                <th>Reason</th>
                <th>Expires in</th>
                {!readOnly && <th className="right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {paging.visible.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <EmptyState title={inScope.length ? "No deleted records match these filters" : "Trash is empty"}>
                      {inScope.length ? undefined : "Deleted staff and app-added PR agents appear here for 30 days so they can be restored. Records from the legacy baseline can never be deleted."}
                    </EmptyState>
                  </td>
                </tr>
              ) : (
                paging.visible.map((t) => {
                  const left = daysLeft(t);
                  return (
                    <tr key={t.id}>
                      <td>
                        <strong>{t.name}</strong>
                        <small className="ep-sub mono">{t.staff?.id ?? (t.agent ? `#${t.agent.id}` : t.id)}</small>
                      </td>
                      <td>{t.type}</td>
                      <td>{branchName(t.branchId)}</td>
                      <td>{t.deletedBy}</td>
                      <td className="num ep-nowrap">{when(new Date(t.deletedAt))}</td>
                      <td className="al-details">{t.reason ?? <span className="lg-muted">No reason given</span>}</td>
                      <td>
                        <Badge tone={left <= 7 ? "danger" : left <= 20 ? "warn" : "neutral"} dot>
                          {left} day{left === 1 ? "" : "s"}
                        </Badge>
                      </td>
                      {!readOnly && (
                      <td className="right">
                        <div className="al-actions">
                          <Button
                            size="sm"
                            onClick={() => {
                              restoreFromTrash(t.id);
                              showToast(`${t.name} restored`);
                            }}
                          >
                            <RotateCcw size={14} /> Restore
                          </Button>
                          <Button size="sm" variant="secondary" className="st-trash" onClick={() => setPurge(t)} aria-label={`Delete ${t.name} permanently`} title="Delete permanently">
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {paging.pager("records")}
      </div>
      <p className="lg-muted al-note">
        <Info size={14} /> {readOnly ? "Only the Branch Manager or Company Admin can restore or permanently delete records. " : ""}Restoring puts the record back exactly as it was. Deleting permanently cannot be undone. Every action here is recorded in the Audit Log.
      </p>

      <Modal
        open={!!purge}
        onClose={() => setPurge(null)}
        icon={Trash2}
        title="Delete permanently?"
        description={purge ? `${purge.name} (${purge.type}) will be removed for good. This cannot be undone.` : ""}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPurge(null)}>
              Keep in trash
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (purge) {
                  purgeFromTrash(purge.id);
                  showToast(`${purge.name} deleted permanently`);
                }
                setPurge(null);
              }}
            >
              <Trash2 size={15} /> Delete permanently
            </Button>
          </>
        }
      >
        <p className="fd-note">If you might need this record again, restore it instead — it stays in the trash for {purge ? daysLeft(purge) : TRASH_RETENTION_DAYS} more days.</p>
      </Modal>
    </div>
  );
}

/* ─────────────── "Move to trash" confirmation (used by profiles) ─────────────── */

export function MoveToTrashDialog({ open, name, what, onClose, onConfirm }: { open: boolean; name: string; what: string; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={Trash2}
      title={`Move ${name} to trash?`}
      description={`The ${what} is kept in Trash for ${TRASH_RETENTION_DAYS} days and can be restored until then.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              onConfirm(reason);
              setReason("");
            }}
          >
            <Trash2 size={15} /> Move to trash
          </Button>
        </>
      }
    >
      <label className="rcm-field">
        <span>Reason (optional)</span>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Added by mistake" />
      </label>
    </Modal>
  );
}
