import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Building2,
  CalendarDays,
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
} from "lucide-react";
import { useApp } from "@/app/AppState";
import { branchRoute } from "@/app/router";
import { BRANCHES, BRANCH_MANAGER_PLACEHOLDER, NOT_ON_RECORD, getBranch } from "@/data/company";
import { isManager } from "@/data/userRecords";
import { Badge } from "@/shared/ui/controls";
import { UserAvatar } from "./BrandLogo";
import { DRAFTS, PATIENTS, STAFF, TRANSACTIONS } from "@/data/demo/records";
import { formatMoney, formatTime, initials } from "@/shared/format";
import { CATALOGUE_INVENTORY } from "@/data/catalogueRules";
import { LEGACY_BRANCH_ID, LEGACY_HOSPITAL_DIRECTORY, hasPhone, hospitalKey, phoneDigits, searchText } from "@/data/legacy";
import { Popover } from "@/shared/ui/Popover";
import { NotificationsButton } from "@/features/notifications/Notifications";
import { PriceCalculatorButton } from "@/features/quote/PriceCalculator";
import { PatientSearch } from "./PatientSearch";
import { InboxButton } from "@/features/inbox/InboxPage";
import { useNetworkStatus } from "@/shared/useNetworkStatus";
import { syncQueue, useBilling } from "@/services/billing";
import { expenseSyncQueue, useExpenses } from "@/services/expenses";
import { staffKey, useAccountAccess } from "@/services/accountAccess";

export function Header() {
  const { route } = useApp();
  const br = branchRoute(route);
  return (
    <header className="topbar">
      {/* Owner, 2026-11-26: date, time and the price calculator on the left; the search icon sits with the other header icons. */}
      <DateTime compact />
      {br && <PriceCalculatorButton branchId={br.branchId} />}
      <span className="hdr-spacer" aria-hidden="true" />
      <SearchSlot>{br ? <PatientSearch branchId={br.branchId} /> : <GlobalSearch />}</SearchSlot>
      <NetworkButton />
      <InboxButton />
      <NotificationsButton />
      <span className="hdr-divider" aria-hidden="true" />
      <ProfileMenu />
    </header>
  );
}

/* ─────────────── Search: an icon until it is used ─────────────── */

/**
 * Owner, 2026-11-26: the header shows only the search icon; clicking it (or
 * Ctrl K) opens the search box for typing, and it folds back to the icon when
 * it is left empty. The search stays mounted, so a record it opened stays open.
 */
function SearchSlot({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const input = () => ref.current?.querySelector("input") ?? null;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const maybeClose = () =>
    window.setTimeout(() => {
      const el = ref.current;
      if (!el || el.contains(document.activeElement) || input()?.value.trim()) return;
      setOpen(false);
    }, 180);
  return (
    <div
      ref={ref}
      className={`hdr-search-slot ${open ? "is-open" : ""}`}
      onFocus={() => setOpen(true)}
      onBlur={maybeClose}
      onMouseDown={(e) => {
        if (open) return;
        e.preventDefault();
        setOpen(true);
        window.requestAnimationFrame(() => input()?.focus());
      }}
      title={open ? undefined : "Search (Ctrl K)"}
    >
      {children}
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
/** `compact` (every dashboard since 2026-11-26): short "THU, 26 NOV" to leave room in the header. */
function DateTime({ compact = false }: { compact?: boolean }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(t);
  }, []);
  if (compact) {
    const part = (o: Intl.DateTimeFormatOptions) => now.toLocaleDateString("en-GB", o).toUpperCase();
    return (
      <div className="hdr-control hdr-datetime is-compact" role="group" aria-label={`${now.toLocaleDateString("en-GB", { dateStyle: "full" })}, ${formatTime(now)}`}>
        <span className="dt-date" aria-hidden="true">
          <CalendarDays size={18} />
          <span>
            {part({ weekday: "short" })}, {now.getDate()} {part({ month: "short" }).slice(0, 3)}
          </span>
        </span>
        <time className="hdr-time" dateTime={now.toISOString()} aria-hidden="true">
          {formatTime(now)}
        </time>
      </div>
    );
  }
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
  // Bills saved on this device, waiting (in order) to sync to the cloud.
  const bills = syncQueue(useBilling()).length;
  const expenses = expenseSyncQueue(useExpenses()).length;
  const queued = bills + expenses;
  const queuedText = [bills ? `${bills} bill${bills === 1 ? "" : "s"}` : "", expenses ? `${expenses} expense${expenses === 1 ? "" : "s"}` : ""].filter(Boolean).join(" and ");
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
        {queued > 0 && (
          <span className="net-queue" title={`${queued} waiting to sync`}>
            {queued > 99 ? "99+" : queued}
          </span>
        )}
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
          <div className={`net-sync ${queued ? "has-queue" : ""}`}>
            <b>{queued ? `${queuedText} waiting to sync` : "Nothing waiting to sync"}</b>
            <small>{queued ? "Saved safely on this device and queued in order. They upload to the cloud database automatically once it is connected and you are online." : "Bills are saved on this device first, then queued for the cloud — so billing never stops when the internet drops."}</small>
          </div>
          <p className="net-note">The cloud database is not connected in this version, so queued bills stay on this device (for this session) until it is set up.</p>
        </div>
      </Popover>
    </>
  );
}


/* ─────────────── Profile ─────────────── */
/**
 * Every link here stays in the current workspace: inside a branch it opens the
 * branch's settings (manager: branch + own account; staff: own account only),
 * on admin pages the company settings.
 */
function ProfileMenu() {
  const { user, navigate, setSignOutOpen, route, staff, switchAccount, showToast } = useApp();
  const br = branchRoute(route);
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const base = br ? `/branch/${br.branchId}/settings` : "/settings";
  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };
  const settingsLabel = user.kind === "admin" ? "Company settings" : user.kind === "manager" ? "Branch settings" : "Account settings";
  // Demo stand-in for sign-in: the branch's people (manager first).
  const access = useAccountAccess();
  // Deactivated accounts can't sign in (Staff Management → Access & account).
  const accounts = br ? staff.filter((s) => s.branchId === br.branchId && s.status !== "Left" && s.status !== "Suspended" && !access[staffKey(s.id)]?.off && s.role !== "Marketer").sort((a, b) => Number(isManager(b)) - Number(isManager(a)) || a.name.localeCompare(b.name)) : [];
  const hasManager = accounts.some(isManager);
  return (
    <>
      <button ref={ref} className={`hdr-avatar ${user.photo ? "has-photo" : ""}`} aria-label={`Profile menu for ${user.name}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {user.photo ? <img src={user.photo} alt="" /> : initials(user.name)}
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} placement="bottom-end" width={300} role="menu" label="Profile">
        <div className="menu-item" style={{ cursor: "default" }}>
          <UserAvatar name={user.name} photo={user.photo} className="avatar lg" />
          <span className="mi-text">
            <strong>{user.name}</strong>
            <small>
              {user.role}
              {user.email && user.email !== NOT_ON_RECORD ? ` · ${user.email}` : ""}
            </small>
          </span>
        </div>
        <div className="menu-sep" />
        <button className="menu-item" role="menuitem" onClick={() => go(`${base}?section=profile`)}>
          <span className="mi-icon">
            <CircleUserRound size={16} />
          </span>
          <span className="mi-text">My profile</span>
        </button>
        <button className="menu-item" role="menuitem" onClick={() => go(user.kind === "staff" ? `${base}?section=profile` : base)}>
          <span className="mi-icon">
            <Settings size={16} />
          </span>
          <span className="mi-text">{settingsLabel}</span>
        </button>
        <button className="menu-item" role="menuitem" onClick={() => go(`${base}?section=appearance`)}>
          <span className="mi-icon">
            <Palette size={16} />
          </span>
          <span className="mi-text">Appearance & theme</span>
        </button>
        {br && (
          <>
            <div className="menu-sep" />
            <div className="menu-label">Switch account · demo until sign-in is connected</div>
            {!hasManager && (
              <AccountItem
                name={BRANCH_MANAGER_PLACEHOLDER.name}
                role="Branch Manager (placeholder)"
                current={user.kind === "manager" && !user.staffId}
                onPick={() => {
                  switchAccount(br.branchId, null);
                  setOpen(false);
                  showToast(`Working as ${BRANCH_MANAGER_PLACEHOLDER.name}`);
                }}
              />
            )}
            {accounts.map((s) => (
              <AccountItem
                key={s.id}
                name={s.name}
                role={s.role}
                current={user.staffId === s.id}
                onPick={() => {
                  switchAccount(br.branchId, isManager(s) ? null : s.id);
                  setOpen(false);
                  showToast(`Working as ${s.name} · ${s.role}`);
                }}
              />
            ))}
            {accounts.filter((s) => !isManager(s)).length === 0 && <div className="hint" style={{ padding: "2px 12px 8px" }}>Add staff in Staff Management to try their accounts.</div>}
          </>
        )}
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

function AccountItem({ name, role, current, onPick }: { name: string; role: string; current: boolean; onPick: () => void }) {
  return (
    <button className={`menu-item ${current ? "is-selected" : ""}`} role="menuitemradio" aria-checked={current} disabled={current} onClick={onPick}>
      <span className="mi-icon">
        <UserRound size={16} />
      </span>
      <span className="mi-text">
        {name}
        <small>{role}</small>
      </span>
      {current && <Badge tone="brand">Current</Badge>}
    </button>
  );
}
