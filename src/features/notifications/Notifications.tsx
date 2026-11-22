/**
 * The bell: notifications for the Company Admin.
 *
 *  • Badge = unread only. Opening a notification (or Mark all read) lowers it;
 *    it disappears when nothing is unread.
 *  • Drop-down = today's notifications (refreshes daily), newest first, a few at
 *    a time — plus an Unread view and "View all notifications".
 *  • Selecting one opens its details pop-up first; from there "Go to …" opens
 *    the exact page and record it points to — also for past days.
 *  • Notification centre = every notification, filtered by date (today,
 *    yesterday, 7 days, this month, any day or range), branch, type and read
 *    status, grouped by day and paginated (no endless scrolling).
 */
import { useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Bell,
  CheckCheck,
  ClipboardList,
  Clock3,
  Database,
  HandCoins,
  Inbox,
  Info,
  MailOpen,
  MapPin,
  ReceiptText,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useApp } from "@/app/AppState";
import { ACTIVE_BRANCHES } from "@/data/company";
import { DATA_START, addDays, isoDate } from "@/data/demo/generator";
import { NOTE_KINDS, branchLabel, isRead, markAllRead, markRead, markUnread, startOfToday, useNotifications, type Note, type NoteKind } from "@/services/notifications";
import { formatCount, formatRelative } from "@/shared/format";
import { Badge, Button, EmptyState, SearchInput, Segmented, SelectMenu } from "@/shared/ui/controls";
import { Modal } from "@/shared/ui/Modal";
import { Pagination } from "@/shared/ui/Pagination";
import { Popover } from "@/shared/ui/Popover";

export const NOTE_ICON: Record<NoteKind, LucideIcon> = {
  summary: ClipboardList,
  bill: ReceiptText,
  unpaid: Wallet,
  overdue: Clock3,
  payout: HandCoins,
  data: Database,
};
const KIND_LABEL: Record<NoteKind, string> = { summary: "Daily summary", bill: "High-value bill", unpaid: "Unpaid bill", overdue: "Overdue balances", payout: "Commission payout", data: "Data notice" };
const GO_LABEL: Record<NoteKind, string> = {
  summary: "Open that day in Finance",
  bill: "Open visit record",
  unpaid: "Open visit record",
  overdue: "View outstanding balances",
  payout: "Open payout report",
  data: "Go to page",
};

const DROPDOWN_CAP = 6;
const time = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const longDate = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
function dayHeading(d: Date) {
  const t = startOfToday();
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (day.getTime() === t.getTime()) return "Today";
  if (day.getTime() === addDays(t, -1).getTime()) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

/** Notifications for the dashboard's current scope (one branch, or every branch). */
function useScopedNotes() {
  const { context } = useApp();
  const { notes, version } = useNotifications();
  const scoped = useMemo(() => (context === "all" ? notes : notes.filter((n) => !n.branchId || n.branchId === context)), [notes, context]);
  // `version` changes when read state does; recount then.
  const unread = useMemo(() => scoped.filter((n) => !isRead(n)), [scoped, version]); // eslint-disable-line react-hooks/exhaustive-deps
  return { notes: scoped, unread, version };
}

/* ─────────────── Bell + drop-down ─────────────── */

export function NotificationsButton() {
  const { navigate } = useApp();
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"today" | "unread">("today");
  const [detail, setDetail] = useState<Note | null>(null);
  const [centre, setCentre] = useState(false);
  const { notes, unread } = useScopedNotes();

  const today = startOfToday();
  const todays = notes.filter((n) => n.at >= today);
  const list = view === "today" ? todays : unread;
  const shown = list.slice(0, DROPDOWN_CAP);
  const more = list.length - shown.length;

  const openNote = (n: Note) => {
    markRead(n.id);
    setOpen(false);
    setDetail(n);
  };
  const go = (n: Note) => {
    setDetail(null);
    setCentre(false);
    navigate(n.route);
  };

  return (
    <>
      <button
        ref={ref}
        className="hdr-control hdr-icon-btn"
        aria-label={unread.length ? `Notifications, ${unread.length} unread` : "Notifications, none unread"}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Bell size={21} />
        {unread.length > 0 && <span className="hdr-badge">{unread.length > 99 ? "99+" : unread.length}</span>}
      </button>

      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} placement="bottom-end" width={430} label="Notifications" className="nt-pop">
        <div className="nt-head">
          <div>
            <strong>Notifications</strong>
            <small>{unread.length ? `${formatCount(unread.length)} unread` : "You're all caught up"}</small>
          </div>
          <button type="button" className="text-link" onClick={() => markAllRead(unread.map((n) => n.id))} disabled={!unread.length}>
            <CheckCheck size={16} /> Mark all read
          </button>
        </div>
        <div className="nt-tabs">
          <Segmented
            label="Show"
            value={view}
            onChange={setView}
            options={[
              { value: "today", label: `Today (${todays.length})` },
              { value: "unread", label: `Unread (${unread.length})` },
            ]}
          />
        </div>
        <div className="nt-list">
          {shown.length === 0 ? (
            <div className="nt-empty">
              <Inbox size={22} />
              <strong>{view === "today" ? "Nothing new today yet" : "No unread notifications"}</strong>
              <small>Earlier notifications are kept in the notification centre.</small>
            </div>
          ) : (
            shown.map((n) => <NoteRow key={n.id} n={n} onOpen={openNote} compact />)
          )}
        </div>
        {more > 0 && <p className="nt-more">+{formatCount(more)} more {view === "today" ? "today" : "unread"} — see them all in the notification centre</p>}
        <div className="nt-foot">
          <button
            type="button"
            className="nt-all"
            onClick={() => {
              setOpen(false);
              setCentre(true);
            }}
          >
            View all notifications <ArrowRight size={16} />
          </button>
        </div>
      </Popover>

      {centre && <NotificationCentre onClose={() => setCentre(false)} onOpen={(n) => (markRead(n.id), setDetail(n))} />}
      <NoteDetail note={detail} onClose={() => setDetail(null)} onGo={go} />
    </>
  );
}

function NoteRow({ n, onOpen, compact }: { n: Note; onOpen: (n: Note) => void; compact?: boolean }) {
  const Icon = NOTE_ICON[n.kind];
  const read = isRead(n);
  return (
    <button type="button" className={`nt-row ${read ? "" : "is-unread"} ${n.priority === "high" ? "is-high" : ""}`} onClick={() => onOpen(n)} aria-label={`${read ? "" : "Unread: "}${n.title} — open details`}>
      <span className="nt-icon">
        <Icon size={17} strokeWidth={1.9} />
      </span>
      <span className="nt-text">
        <span className="nt-title">
          <b>{n.title}</b>
          <time>{compact ? formatRelative(n.at) : time(n.at)}</time>
        </span>
        <small>{n.summary}</small>
        {!compact && (
          <span className="nt-meta">
            {KIND_LABEL[n.kind]} · {branchLabel(n.branchId)}
            {n.priority === "high" && <em>Needs attention</em>}
          </span>
        )}
      </span>
      {!read && <span className="nt-dot" aria-hidden="true" />}
    </button>
  );
}

/* ─────────────── Details pop-up ─────────────── */

function NoteDetail({ note, onClose, onGo }: { note: Note | null; onClose: () => void; onGo: (n: Note) => void }) {
  const n = note;
  const read = n ? isRead(n) : true;
  return (
    <Modal
      open={!!n}
      onClose={onClose}
      icon={n ? NOTE_ICON[n.kind] : Bell}
      title={n?.title ?? ""}
      description={n ? `${KIND_LABEL[n.kind]} · ${branchLabel(n.branchId)} · ${longDate(n.at)}, ${time(n.at)}` : ""}
      footer={
        n && (
          <div className="nt-detail-foot">
            <button
              type="button"
              className="text-link"
              onClick={() => {
                if (read) markUnread(n.id);
                else markRead(n.id);
                onClose();
              }}
            >
              <MailOpen size={16} /> {read ? "Mark as unread" : "Mark as read"}
            </button>
            <span>
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
              <Button onClick={() => onGo(n)}>
                {GO_LABEL[n.kind]} <ArrowRight size={16} />
              </Button>
            </span>
          </div>
        )
      }
    >
      {n && (
        <div className="nt-detail">
          <div className="nt-detail-tags">
            <Badge tone="brand">{KIND_LABEL[n.kind]}</Badge>
            {n.priority === "high" && <Badge tone="warn">Needs attention</Badge>}
            <Badge>{n.at < startOfToday() ? `${formatRelative(n.at)}` : "Today"}</Badge>
          </div>
          <p className="nt-detail-sum">{n.summary}</p>
          <dl className="fin-detail">
            {n.details.map((d) => (
              <div key={d.label}>
                <dt>{d.label}</dt>
                <dd>{d.value}</dd>
              </div>
            ))}
          </dl>
          {n.note && (
            <p className="nt-detail-note">
              <Info size={15} /> {n.note}
            </p>
          )}
          <div className="nt-target">
            <MapPin size={16} />
            <span>
              <small>Opens</small>
              <b>{n.target}</b>
            </span>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ─────────────── Notification centre ─────────────── */

type DatePreset = "today" | "yesterday" | "week" | "month" | "all" | "custom";
const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "week", label: "Last 7 days" },
  { value: "month", label: "This month" },
  { value: "all", label: "All dates" },
  { value: "custom", label: "Pick a day or range" },
];

function presetBounds(p: DatePreset, from: string, to: string): { from: Date | null; to: Date | null } {
  const t = startOfToday();
  switch (p) {
    case "today":
      return { from: t, to: null };
    case "yesterday":
      return { from: addDays(t, -1), to: t };
    case "week":
      return { from: addDays(t, -6), to: null };
    case "month":
      return { from: new Date(t.getFullYear(), t.getMonth(), 1), to: null };
    case "all":
      return { from: null, to: null };
    case "custom": {
      const [a, b] = from && to && from > to ? [to, from] : [from, to];
      return { from: a ? new Date(`${a}T00:00:00`) : null, to: b ? addDays(new Date(`${b}T00:00:00`), 1) : null };
    }
  }
}

function NotificationCentre({ onClose, onOpen }: { onClose: () => void; onOpen: (n: Note) => void }) {
  const { notes, unread, version } = useScopedNotes();
  const { context } = useApp();
  const [preset, setPreset] = useState<DatePreset>("week");
  const [from, setFrom] = useState(isoDate(startOfToday()));
  const [to, setTo] = useState(isoDate(startOfToday()));
  const [branch, setBranch] = useState("all");
  const [kind, setKind] = useState<"all" | NoteKind>("all");
  const [status, setStatus] = useState<"all" | "unread" | "read">("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const reset = () => setPage(1);

  const rows = useMemo(() => {
    const b = presetBounds(preset, from, to);
    const term = q.trim().toLowerCase();
    return notes.filter((n) => {
      if (b.from && n.at < b.from) return false;
      if (b.to && n.at >= b.to) return false;
      if (branch !== "all" && (branch === "company" ? n.branchId !== null : n.branchId !== branch)) return false;
      if (kind !== "all" && n.kind !== kind) return false;
      if (status !== "all" && (status === "read") !== isRead(n)) return false;
      return !term || `${n.title} ${n.summary} ${n.target} ${n.details.map((d) => d.value).join(" ")}`.toLowerCase().includes(term);
    });
  }, [notes, preset, from, to, branch, kind, status, q, version]); // eslint-disable-line react-hooks/exhaustive-deps

  const pages = Math.max(1, Math.ceil(rows.length / size));
  const safe = Math.min(page, pages);
  const visible = rows.slice((safe - 1) * size, safe * size);
  const groups: { day: string; items: Note[] }[] = [];
  for (const n of visible) {
    const day = dayHeading(n.at);
    if (groups.at(-1)?.day === day) groups.at(-1)!.items.push(n);
    else groups.push({ day, items: [n] });
  }
  const rowsUnread = rows.filter((n) => !isRead(n));
  const filtered = preset !== "week" || branch !== "all" || kind !== "all" || status !== "all" || !!q.trim();
  const showBranch = context === "all" && ACTIVE_BRANCHES.length > 1;

  return (
    <Modal open onClose={onClose} xl icon={Bell} title="Notification centre" description={`${formatCount(notes.length)} notifications · ${formatCount(unread.length)} unread · new ones arrive through the day`}>
      <div className="nt-centre">
        <div className="inv-toolbar nt-toolbar">
          <SearchInput placeholder="Search notifications" value={q} onChange={(v) => (setQ(v), reset())} />
          <SelectMenu value={preset} ariaLabel="Date" className="select-btn inv-sort" options={DATE_PRESETS} onChange={(v: DatePreset) => (setPreset(v), reset())} />
          {preset === "custom" && (
            <>
              <label className="al-date">
                <span>From</span>
                <input type="date" value={from} min={isoDate(DATA_START)} max={isoDate(startOfToday())} onChange={(e) => (setFrom(e.target.value), reset())} />
              </label>
              <label className="al-date">
                <span>To</span>
                <input type="date" value={to} min={isoDate(DATA_START)} max={isoDate(startOfToday())} onChange={(e) => (setTo(e.target.value), reset())} />
              </label>
            </>
          )}
          {showBranch && (
            <SelectMenu
              value={branch}
              ariaLabel="Branch"
              className="select-btn inv-sort"
              options={[{ value: "all", label: "All branches" }, { value: "company", label: "Company-wide" }, ...ACTIVE_BRANCHES.map((b) => ({ value: b.id, label: b.name }))]}
              onChange={(v: string) => (setBranch(v), reset())}
            />
          )}
          <SelectMenu
            value={kind}
            ariaLabel="Type"
            className="select-btn inv-sort"
            options={[{ value: "all" as const, label: "All types" }, ...NOTE_KINDS.map((k) => ({ value: k.id, label: k.label }))]}
            onChange={(v: "all" | NoteKind) => (setKind(v), reset())}
          />
          <Segmented
            label="Status"
            value={status}
            onChange={(v) => (setStatus(v), reset())}
            options={[
              { value: "all", label: "All" },
              { value: "unread", label: "Unread" },
              { value: "read", label: "Read" },
            ]}
          />
          {filtered && (
            <button
              type="button"
              className="text-link"
              onClick={() => {
                setPreset("week");
                setBranch("all");
                setKind("all");
                setStatus("all");
                setQ("");
                reset();
              }}
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="card bp-card nt-card">
          <div className="inv-table-tools nt-card-head">
            <span className="inv-count">
              {formatCount(rows.length)} notification{rows.length === 1 ? "" : "s"} · {DATE_PRESETS.find((p) => p.value === preset)?.label.toLowerCase()} · newest first
            </span>
            <button type="button" className="text-link" disabled={!rowsUnread.length} onClick={() => markAllRead(rowsUnread.map((n) => n.id))}>
              <CheckCheck size={16} /> Mark these read{rowsUnread.length ? ` (${formatCount(rowsUnread.length)})` : ""}
            </button>
          </div>
          {visible.length === 0 ? (
            <EmptyState title={filtered ? "No notifications match these filters" : "No notifications in the last 7 days"} />
          ) : (
            <div className="nt-groups">
              {groups.map((g) => (
                <section key={g.day} className="nt-group" aria-label={g.day}>
                  <h4>{g.day}</h4>
                  {g.items.map((n) => (
                    <NoteRow key={n.id} n={n} onOpen={onOpen} />
                  ))}
                </section>
              ))}
            </div>
          )}
          <Pagination page={safe} pageSize={size} sizes={[10, 20, 50]} total={rows.length} noun="notifications" onPage={(p) => setPage(Math.min(Math.max(1, p), pages))} onPageSize={(s) => (setSize(s), setPage(1))} />
        </div>
        <p className="lg-muted al-note">
          <Info size={14} /> Today's notifications start unread; earlier days are filed as read. Read status is kept for this session until the database is connected.
        </p>
      </div>
    </Modal>
  );
}
