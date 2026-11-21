import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bell,
  Building2,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  CircleUserRound,
  FileText,
  Handshake,
  Hospital,
  LogOut,
  Package,
  Palette,
  ReceiptText,
  Search,
  Settings,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import { useApp } from "@/app/AppState";
import { branchRoute } from "@/app/router";
import { ACTIVE_BRANCHES, BRANCHES, getBranch } from "@/data/company";
import { DRAFTS, PATIENTS, STAFF, TRANSACTIONS, type NotificationItem } from "@/data/demo/records";
import { formatMoney, formatRelative, formatTime, initials } from "@/shared/format";
import { CATALOGUE_INVENTORY } from "@/data/catalogueRules";
import { LEGACY_BRANCH_ID, LEGACY_HOSPITAL_DIRECTORY, hasPhone, hospitalKey, phoneDigits, searchText } from "@/data/legacy";
import { Popover } from "@/shared/ui/Popover";
import { Segmented } from "@/shared/ui/controls";
import { useNetworkStatus } from "@/shared/useNetworkStatus";

export function Header() {
  const { route } = useApp();
  const br = branchRoute(route);
  return (
    <header className="topbar">
      {br && <BranchContextControl branchId={br.branchId} />}
      <GlobalSearch scopeBranchId={br?.branchId} />
      <DateTime />
      <NetworkButton />
      <NotificationsButton />
      <span className="hdr-divider" aria-hidden="true" />
      <ProfileMenu />
    </header>
  );
}

/* ─────────────── Branch workspace context ─────────────── */
function BranchContextControl({ branchId }: { branchId: string }) {
  const { navigate, route } = useApp();
  const branch = getBranch(branchId);
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const page = branchRoute(route)?.page ?? "dashboard";
  return (
    <div className="hdr-control hdr-branch-pill">
      <button className="back" onClick={() => navigate("/dashboard")} aria-label="Back to Company Dashboard" title="Back to Company Dashboard">
        <ArrowLeft size={17} />
      </button>
      <button ref={ref} className="ctx-select" style={{ border: 0, boxShadow: "none", padding: 0, minWidth: 0 }} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="ctx-select-text">
          <small>Branch workspace</small>
          <strong>{branch ? `${branch.name} Branch` : "Unknown branch"}</strong>
        </span>
        <ChevronDown size={17} style={{ color: "var(--brand-700)" }} />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={300} role="listbox" label="Switch branch">
        <div className="menu-label">Switch branch</div>
        {ACTIVE_BRANCHES.map((b) => (
          <button
            key={b.id}
            className={`menu-item ${b.id === branchId ? "is-selected" : ""}`}
            role="option"
            aria-selected={b.id === branchId}
            onClick={() => {
              setOpen(false);
              navigate(`/branch/${b.id}/${page}`);
            }}
          >
            <span className="mi-text">
              {b.name}
              <small>
                {b.city} · {b.currency}
              </small>
            </span>
            {b.id === branchId && <Check size={16} className="mi-check" />}
          </button>
        ))}
      </Popover>
    </div>
  );
}

/* ─────────────── Global search ─────────────── */
interface SearchResult {
  group: string;
  title: string;
  subtitle: string;
  icon: typeof Search;
  to: string;
}

function GlobalSearch({ scopeBranchId }: { scopeBranchId?: string }) {
  const { navigate, agents } = useApp();
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo<SearchResult[]>(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    const inScope = (id: string) => !scopeBranchId || id === scopeBranchId;
    const branchName = (id: string) => getBranch(id)?.name ?? "";
    const out: SearchResult[] = [];
    PATIENTS.filter((p) => inScope(p.branchId) && (p.name.toLowerCase().includes(term) || p.id.toLowerCase().includes(term) || p.phone.replace(/\s/g, "").includes(term.replace(/\s/g, ""))))
      .slice(0, 4)
      .forEach((p) => out.push({ group: "Patients", title: p.name, subtitle: `${p.id} · ${branchName(p.branchId)}`, icon: UserRound, to: scopeBranchId ? `/branch/${scopeBranchId}/records` : `/patients?q=${encodeURIComponent(p.name)}` }));
    if (!scopeBranchId)
      BRANCHES.filter((b) => b.name.toLowerCase().includes(term) || b.city.toLowerCase().includes(term))
        .slice(0, 3)
        .forEach((b) => out.push({ group: "Branches", title: `${b.name} Branch`, subtitle: `${b.city}, ${b.country}`, icon: Building2, to: b.status === "Active" ? `/branch/${b.id}/dashboard` : "/branches" }));
    // Real baseline records: PR agents (name / phone), hospitals and catalogue services.
    if (inScope(LEGACY_BRANCH_ID)) {
      const t = searchText(q);
      const digits = phoneDigits(q);
      const prBase = scopeBranchId ? `/branch/${scopeBranchId}/pr` : "/pr";
      agents
        .filter((a) => searchText(a.name, a.hospital).includes(t) || (digits.length >= 4 && phoneDigits(a.phone).includes(digits)))
        .slice(0, 4)
        .forEach((a) => out.push({ group: "PR agents", title: a.name, subtitle: `${hospitalKey(a.hospital) || "No hospital assigned"}${hasPhone(a.phone) ? ` · ${a.phone}` : ""}`, icon: Handshake, to: `${prBase}?agent=${a.id}` }));
      LEGACY_HOSPITAL_DIRECTORY.filter((h) => searchText(h.key, ...h.rawVariants).includes(t))
        .slice(0, 3)
        .forEach((h) => out.push({ group: "Hospitals", title: h.key, subtitle: `${h.agentCount} PR agent${h.agentCount === 1 ? "" : "s"}`, icon: Hospital, to: `${prBase}?hospital=${encodeURIComponent(h.key)}` }));
      CATALOGUE_INVENTORY.filter((i) => searchText(i.name, i.catalogueCategory, i.recordedName ?? "").includes(t))
        .slice(0, 4)
        .forEach((i) => out.push({ group: "Services", title: i.name, subtitle: `${i.catalogueCategory} · ${i.price === null ? "No price on file" : formatMoney(i.price, "NGN")}`, icon: Package, to: scopeBranchId ? `/branch/${scopeBranchId}/inventory` : "/inventory" }));
    }
    TRANSACTIONS.filter((t) => inScope(t.branchId) && (t.id.toLowerCase().includes(term) || t.patient.toLowerCase().includes(term)))
      .slice(0, 3)
      .forEach((t) => out.push({ group: "Orders & bills", title: t.id, subtitle: `${t.patient} · ${branchName(t.branchId)}`, icon: ReceiptText, to: scopeBranchId ? `/branch/${scopeBranchId}/billing` : "/finance?tab=payments" }));
    DRAFTS.filter((d) => inScope(d.branchId) && (d.id.toLowerCase().includes(term) || d.patient.toLowerCase().includes(term)))
      .slice(0, 2)
      .forEach((d) => out.push({ group: "Orders & bills", title: `${d.id} (draft)`, subtitle: `${d.patient} · ${d.services}`, icon: FileText, to: `/branch/${d.branchId}/drafts` }));
    STAFF.filter((s) => inScope(s.branchId) && (s.name.toLowerCase().includes(term) || s.role.toLowerCase().includes(term)))
      .slice(0, 3)
      .forEach((s) => out.push({ group: "Staff", title: s.name, subtitle: `${s.role} · ${branchName(s.branchId)}`, icon: Users, to: scopeBranchId ? `/branch/${scopeBranchId}/staff` : `/staff?branch=${s.branchId}` }));
    return out;
  }, [q, scopeBranchId, agents]);

  const go = (r: SearchResult) => {
    navigate(r.to);
    setOpen(false);
    setQ("");
    input.current?.blur();
  };

  return (
    <div ref={wrap} className="hdr-control hdr-search" role="combobox" aria-expanded={open && q.length > 0} aria-haspopup="listbox">
      <Search size={19} />
      <input
        ref={input}
        value={q}
        placeholder={scopeBranchId ? "Search patients, bills or staff" : "Search patients, branches or orders"}
        aria-label="Global search"
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => q && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(results.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter" && results[active]) go(results[active]);
          else if (e.key === "Escape") setOpen(false);
        }}
      />
      <span className="kbd">Ctrl K</span>
      <Popover anchor={wrap} open={open && q.trim().length > 0} onClose={() => setOpen(false)} matchWidth noAutoFocus role="listbox" label="Search results">
        {results.length === 0 ? (
          <div className="empty" style={{ padding: 24 }}>
            <Search size={22} />
            No authorised records match “{q}”.
          </div>
        ) : (
          results.map((r, i) => {
            const Icon = r.icon;
            const showGroup = i === 0 || results[i - 1].group !== r.group;
            return (
              <div key={`${r.group}-${r.title}-${i}`}>
                {showGroup && <div className="menu-label">{r.group}</div>}
                <button className={`menu-item ${i === active ? "is-selected" : ""}`} role="option" aria-selected={i === active} onMouseEnter={() => setActive(i)} onClick={() => go(r)}>
                  <span className="mi-icon">
                    <Icon size={16} />
                  </span>
                  <span className="mi-text">
                    {r.title}
                    <small>{r.subtitle}</small>
                  </span>
                </button>
              </div>
            );
          })
        )}
      </Popover>
    </div>
  );
}

/* ─────────────── Date & time ─────────────── */
function DateTime() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(t);
  }, []);
  const weekday = now.toLocaleDateString("en-GB", { weekday: "long" });
  const weekdayShort = now.toLocaleDateString("en-GB", { weekday: "short" });
  const day = now.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const dayShort = now.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return (
    <div className="hdr-control hdr-datetime" role="group" aria-label={`${now.toLocaleDateString("en-GB", { dateStyle: "full" })}, ${formatTime(now)}`}>
      <span className="dt-date" aria-hidden="true">
        <CalendarDays size={19} />
        <span className="dt-long">
          {weekday}, {day}
        </span>
        <span className="dt-short">
          {weekdayShort}, {dayShort}
        </span>
      </span>
      <time className="hdr-time" dateTime={now.toISOString()} aria-hidden="true">
        {formatTime(now)}
      </time>
    </div>
  );
}

/* ─────────────── Notifications ─────────────── */
const NOTE_ICON: Record<NotificationItem["kind"], typeof Bell> = {
  price: ReceiptText,
  approval: Wallet,
  staff: Users,
  inventory: Package,
  system: Settings,
};

/* ─────────────── Network status (offline-first) ─────────────── */

/** Mobile-style signal bars; all bars lit when online, dimmed with a slash when offline. */
function SignalBars({ online }: { online: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" className="net-bars">
      {[
        { x: 3, h: 5 },
        { x: 8, h: 9 },
        { x: 13, h: 13 },
        { x: 18, h: 17 },
      ].map((b) => (
        <rect key={b.x} x={b.x} y={21 - b.h} width="3.4" height={b.h} rx="1.2" />
      ))}
      {!online && <line x1="3" y1="3" x2="21" y2="21" className="net-slash" />}
    </svg>
  );
}

function NetworkButton() {
  const { showToast } = useApp();
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const announce = useCallback(
    (online: boolean) => showToast(online ? "Back online" : "You are offline — STANLEY keeps working on this device"),
    [showToast],
  );
  const net = useNetworkStatus(announce);
  const label = net.online ? "Online" : "Offline";
  const speed = [net.effectiveType ? net.effectiveType.toUpperCase() : null, net.downlink ? `~${net.downlink} Mbps` : null, net.rtt ? `${net.rtt} ms latency` : null].filter(Boolean).join(" · ");

  return (
    <>
      <button
        ref={ref}
        className={`hdr-control hdr-icon-btn hdr-net ${net.online ? "is-online" : "is-offline"}`}
        aria-label={`Network status: ${label}`}
        title={`Network: ${label}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <SignalBars online={net.online} />
        <span className="net-dot" aria-hidden="true" />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} placement="bottom-end" width={340} label="Network status">
        <div className={`net-panel ${net.online ? "is-online" : "is-offline"}`}>
          <div className="net-panel-head">
            <span className="net-panel-icon">
              <SignalBars online={net.online} />
            </span>
            <div>
              <strong>{net.online ? "You are online" : "You are offline"}</strong>
              <small>
                {label} since {formatTime(net.since)}
                {net.online && speed ? ` · ${speed}` : ""}
              </small>
            </div>
          </div>
          <p>
            {net.online
              ? "Connected to the internet. STANLEY is offline-first, so it keeps working the same way if the connection drops."
              : "No internet connection. STANLEY is offline-first — you can keep working on this device and nothing is blocked."}
          </p>
          <p className="net-note">Local storage and cloud sync are not connected yet — changes made now last for this session until the database is set up.</p>
        </div>
      </Popover>
    </>
  );
}

function NotificationsButton() {
  const { notifications, markRead, markAllRead, navigate } = useApp();
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const unread = notifications.filter((n) => !n.read).length;
  const list = filter === "unread" ? notifications.filter((n) => !n.read) : notifications;

  return (
    <>
      <button
        ref={ref}
        className="hdr-control hdr-icon-btn"
        aria-label={`Notifications, ${unread} unread`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Bell size={21} />
        {unread > 0 && <span className="hdr-badge">{unread}</span>}
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} placement="bottom-end" width={420} label="Notifications">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px 10px" }}>
          <div>
            <strong style={{ fontSize: 16 }}>Notifications</strong>
            <div className="hint">{unread ? `${unread} unread administrative updates` : "You're all caught up"}</div>
          </div>
          <button className="text-link" onClick={markAllRead} disabled={!unread}>
            <CheckCheck size={16} /> Mark all read
          </button>
        </div>
        <div style={{ padding: "0 10px 8px" }}>
          <Segmented label="Notification filter" value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "unread", label: `Unread (${unread})` }]} />
        </div>
        {list.length === 0 && <div className="empty">No unread notifications.</div>}
        {list.map((n) => {
          const Icon = NOTE_ICON[n.kind];
          return (
            <button
              key={n.id}
              className="menu-item"
              style={{ alignItems: "flex-start", background: n.read ? undefined : "color-mix(in srgb, var(--brand-50) 70%, transparent)" }}
              onClick={() => {
                markRead(n.id);
                setOpen(false);
                navigate(n.route);
              }}
            >
              <span className="mi-icon">
                <Icon size={16} />
              </span>
              <span className="mi-text">
                <span style={{ display: "flex", justifyContent: "space-between", gap: 8, fontWeight: n.read ? 500 : 650 }}>
                  {n.title}
                  <small style={{ whiteSpace: "nowrap" }}>{formatRelative(n.at)}</small>
                </span>
                <small>{n.body}</small>
              </span>
              {!n.read && <span aria-label="Unread" style={{ width: 8, height: 8, marginTop: 8, borderRadius: 8, background: "var(--brand-500)", flex: "none" }} />}
            </button>
          );
        })}
      </Popover>
    </>
  );
}

/* ─────────────── Profile ─────────────── */
function ProfileMenu() {
  const { user, navigate, setSignOutOpen } = useApp();
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };
  return (
    <>
      <button ref={ref} className="hdr-avatar" aria-label={`Profile menu for ${user.name}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {initials(user.name)}
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} placement="bottom-end" width={280} role="menu" label="Profile">
        <div className="menu-item" style={{ cursor: "default" }}>
          <span className="avatar lg">{initials(user.name)}</span>
          <span className="mi-text">
            <strong>{user.name}</strong>
            <small>
              {user.role} · {user.email}
            </small>
          </span>
        </div>
        <div className="menu-sep" />
        <button className="menu-item" role="menuitem" onClick={() => go("/settings?section=profile")}>
          <span className="mi-icon">
            <CircleUserRound size={16} />
          </span>
          <span className="mi-text">My profile</span>
        </button>
        <button className="menu-item" role="menuitem" onClick={() => go("/settings")}>
          <span className="mi-icon">
            <Settings size={16} />
          </span>
          <span className="mi-text">Account settings</span>
        </button>
        <button className="menu-item" role="menuitem" onClick={() => go("/settings?section=appearance")}>
          <span className="mi-icon">
            <Palette size={16} />
          </span>
          <span className="mi-text">Appearance & theme</span>
        </button>
        <div className="menu-sep" />
        <button
          className="menu-item"
          role="menuitem"
          onClick={() => {
            setOpen(false);
            setSignOutOpen(true);
          }}
        >
          <span className="mi-icon">
            <LogOut size={16} />
          </span>
          <span className="mi-text">Sign out</span>
        </button>
      </Popover>
    </>
  );
}
