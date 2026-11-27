import { useRef, useState, type CSSProperties, type FocusEvent, type MouseEvent } from "react";
import { createPortal, flushSync } from "react-dom";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Building2, ChevronRight, LogOut, PanelLeftClose, PanelLeftOpen, Store } from "lucide-react";
import { useApp } from "@/app/AppState";
import { useConversations } from "@/features/inbox/InboxPage";
import { branchRoute } from "@/app/router";
import { THEMES, type ThemeId } from "@/app/themes";
import { ACTIVE_BRANCHES, BRANCHES, getBranch } from "@/data/company";
import { initials } from "@/shared/format";
import { Popover } from "@/shared/ui/Popover";
import { Badge } from "@/shared/ui/controls";
import { BrandLogo, UserAvatar, useCompanyName } from "./BrandLogo";
import { COMPANY_NAV, branchNav } from "./navigation";
import { usePermissions } from "@/services/permissions";
import { StanleyOrb } from "@/features/assistant/StanleyOrb";
import { useBranches } from "@/services/org";
import { useNavCounts } from "./navCounts";

type Tip = { label: string; top: number; left: number } | null;

/**
 * Persistent sidebar frame. It stays mounted for the whole session; only the
 * navigation list swaps between the Company and Branch workspaces.
 */
export function Sidebar() {
  const { collapsed, setCollapsed, route, navigate, context, user } = useApp();
  const { unread } = useConversations();
  const counts = useNavCounts(branchRoute(route)?.branchId ?? null);
  // Re-render when the Company Admin changes permissions or branches.
  usePermissions();
  useBranches();
  const br = branchRoute(route);
  const branch = br ? getBranch(br.branchId) : undefined;
  const contextBranch = context === "all" ? undefined : getBranch(context);
  // Inside a branch, each role sees only the pages it can use (front desk: day-to-day work).
  const items = br ? branchNav(br.branchId, user.role) : COMPANY_NAV;
  const activeId = br ? br.page : (COMPANY_NAV.find((i) => route.path.startsWith(i.path))?.id ?? "dashboard");
  const [tip, setTip] = useState<Tip>(null);
  const companyName = useCompanyName();

  const showTip = (el: HTMLElement, label: string) => {
    if (!collapsed) return;
    const r = el.getBoundingClientRect();
    setTip({ label, top: r.top + r.height / 2, left: r.right + 12 });
  };
  // The STANLEY AI item's orb wakes up when hovered.
  const [orbAwake, setOrbAwake] = useState(false);
  const tipHandlers = (label: string) => ({
    onMouseEnter: (e: MouseEvent<HTMLElement>) => showTip(e.currentTarget, label),
    onFocus: (e: FocusEvent<HTMLElement>) => showTip(e.currentTarget, label),
    onMouseLeave: () => setTip(null),
    onBlur: () => setTip(null),
  });

  return (
    <motion.aside
      className="sidebar"
      aria-label={br ? "Branch operations navigation" : "Company administration navigation"}
      initial={{ opacity: 0, x: -24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="sb-brand">
        <div className="sb-logo">
          <BrandLogo />
        </div>
        <div className="sb-brand-text sb-fade">
          <strong>{companyName}</strong>
          <span>{branch ? `${branch.name} Branch` : contextBranch ? contextBranch.name : "All branches"}</span>
        </div>
        <button
          className="sb-toggle"
          onClick={() => {
            setTip(null);
            setCollapsed(!collapsed);
          }}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          {...tipHandlers("Expand sidebar")}
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      <nav className="sb-nav">
        <div className="sb-section-label sb-fade">{br ? (user.kind === "staff" ? `${user.role} · daily work` : "Branch operations") : "Navigation"}</div>
        <LayoutGroup id="sidebar-nav">
          <AnimatePresence mode="wait" initial={false}>
            <motion.ul
              key={br ? `branch-${br.branchId}` : "company"}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0, transition: { duration: 0.25 } }}
              exit={{ opacity: 0, x: -10, transition: { duration: 0.15 } }}
            >
              {items.map((item) => {
                const Icon = item.icon;
                const active = item.id === activeId;
                const isOrb = item.id === "assistant";
                const tips = tipHandlers(item.label);
                return (
                  <li key={item.id}>
                    <button
                      className={`sb-item ${active ? "is-active" : ""}`}
                      aria-current={active ? "page" : undefined}
                      aria-label={collapsed ? item.label : undefined}
                      onClick={() => navigate(item.path)}
                      {...tips}
                      {...(isOrb
                        ? {
                            onMouseEnter: (e: MouseEvent<HTMLElement>) => (tips.onMouseEnter(e), setOrbAwake(true)),
                            onMouseLeave: () => (tips.onMouseLeave(), setOrbAwake(false)),
                          }
                        : {})}
                    >
                      <span className="sb-item-hover" />
                      {active && (
                        <motion.span
                          layoutId="sb-active"
                          className="sb-item-bg"
                          transition={{ type: "spring", stiffness: 420, damping: 36 }}
                        />
                      )}
                      {isOrb ? (
                        <span className="sb-orb" aria-hidden="true">
                          <StanleyOrb size={24} mood={active || orbAwake ? "awake" : "idle"} />
                        </span>
                      ) : (
                        <Icon size={20} strokeWidth={1.8} />
                      )}
                      <span className="sb-label sb-fade">{item.label}</span>
                      {item.id === "messages" && unread > 0 && <span className="sb-count">{unread > 99 ? "99+" : unread}</span>}
                      {(counts[item.id]?.n ?? 0) > 0 && (
                        <span className={`sb-count is-${item.id}`} title={counts[item.id]!.label} aria-label={counts[item.id]!.label}>
                          {counts[item.id]!.n > 99 ? "99+" : counts[item.id]!.n}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </motion.ul>
          </AnimatePresence>
        </LayoutGroup>
      </nav>

      <SidebarBottom tipHandlers={tipHandlers} />

      {createPortal(
        <AnimatePresence>
          {tip && collapsed && (
            <motion.div
              className="sb-tip"
              style={{ top: tip.top, left: tip.left, translateY: "-50%" }}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.14 }}
            >
              {tip.label}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </motion.aside>
  );
}

type TipHandlers = (label: string) => Record<string, unknown>;

function SidebarBottom({ tipHandlers }: { tipHandlers: TipHandlers }) {
  const { user, collapsed, route, setSignOutOpen } = useApp();
  const br = branchRoute(route);
  const avatarRef = useRef<HTMLButtonElement>(null);
  const [accountOpen, setAccountOpen] = useState(false);

  return (
    <div className="sb-bottom">
      {/* Switching to company admin / other branches is not for branch staff accounts. */}
      {user.kind !== "staff" && <BranchSwitcher tipHandlers={tipHandlers} inBranch={Boolean(br)} currentBranchId={br?.branchId} />}

      <div className="sb-account">
        <div className="sb-account-row">
          <button
            ref={avatarRef}
            className="sb-avatar"
            aria-label={collapsed ? "Account and theme" : `${user.name}, ${user.role}`}
            tabIndex={collapsed ? 0 : -1}
            onClick={() => collapsed && setAccountOpen((o) => !o)}
            {...(collapsed ? tipHandlers("Account & theme") : {})}
          >
            {user.photo ? <img src={user.photo} alt="" className="sb-avatar-img" /> : initials(user.name)}
          </button>
          <span className="sb-account-text">
            <strong>{user.name}</strong>
            <small>{user.role}</small>
          </span>
          <button className="sb-signout" aria-label="Sign out" title="Sign out" onClick={() => setSignOutOpen(true)}>
            <LogOut size={17} />
          </button>
        </div>
        <div className="sb-themes">
          <span>Theme</span>
          <ThemeSwatches />
        </div>
      </div>

      <div className="sb-powered">
        Powered by <b>STANLEY</b>
      </div>

      <Popover anchor={avatarRef} open={accountOpen && collapsed} onClose={() => setAccountOpen(false)} placement="right-end" offset={14} width={260} label="Account">
        <div className="menu-label">Signed in as</div>
        <div className="menu-item" style={{ cursor: "default" }}>
          <UserAvatar name={user.name} photo={user.photo} />
          <span className="mi-text">
            {user.name}
            <small>{user.role}</small>
          </span>
        </div>
        <div className="menu-sep" />
        <div className="menu-label">Colour theme</div>
        <div style={{ padding: "4px 10px 10px" }}>
          <ThemeSwatches light />
        </div>
        <div className="menu-sep" />
        <button
          className="menu-item"
          onClick={() => {
            setAccountOpen(false);
            setSignOutOpen(true);
          }}
        >
          <span className="mi-icon">
            <LogOut size={16} />
          </span>
          <span className="mi-text">Sign out</span>
        </button>
      </Popover>
    </div>
  );
}

/** Six theme selectors. Applying a theme cross-fades the whole app where supported. */
export function ThemeSwatches({ light = false }: { light?: boolean }) {
  const { theme, setTheme } = useApp();
  const reduced = useReducedMotion();
  const apply = (id: ThemeId) => {
    if (id === theme) return;
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    if (doc.startViewTransition && !reduced) doc.startViewTransition(() => flushSync(() => setTheme(id)));
    else setTheme(id);
  };
  return (
    <div className="swatches" role="radiogroup" aria-label="Colour theme">
      {THEMES.map((t) => (
        <button
          key={t.id}
          role="radio"
          aria-checked={theme === t.id}
          aria-label={`${t.name} theme`}
          title={t.name}
          className={`swatch ${theme === t.id ? "is-active" : ""} ${light ? "on-light" : ""}`}
          style={{ "--sw-a": t.sidebar, "--sw-b": t.accent } as CSSProperties}
          onClick={() => apply(t.id)}
        />
      ))}
    </div>
  );
}

function BranchSwitcher({
  tipHandlers,
  inBranch,
  currentBranchId,
}: {
  tipHandlers: TipHandlers;
  inBranch: boolean;
  currentBranchId?: string;
}) {
  const { navigate } = useApp();
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const title = inBranch ? "Company Dashboard" : "Branch Dashboard";
  const sub = inBranch ? "Back to company admin" : "Open branch operations";

  return (
    <>
      <button
        ref={ref}
        className="sb-switcher"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${title} — ${sub}`}
        onClick={() => setOpen((o) => !o)}
        {...tipHandlers(title)}
      >
        <span className="sb-switcher-icon">{inBranch ? <Building2 size={19} /> : <Store size={19} />}</span>
        <span className="sb-switcher-text sb-fade">
          <strong>{title}</strong>
          <small>{sub}</small>
        </span>
        <ChevronRight size={17} className="sb-switcher-chev sb-fade" />
      </button>

      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} placement="right-end" offset={14} width={320} role="menu" label="Branch workspaces">
        {inBranch && (
          <>
            <button
              className="menu-item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                navigate("/dashboard");
              }}
            >
              <span className="mi-icon">
                <ArrowLeft size={16} />
              </span>
              <span className="mi-text">
                Company Dashboard
                <small>Back to company-wide administration</small>
              </span>
            </button>
            <div className="menu-sep" />
          </>
        )}
        <div className="menu-label">{inBranch ? "Switch branch workspace" : "Enter a branch workspace"}</div>
        {BRANCHES.map((b) => {
          const disabled = b.status !== "Active";
          const current = b.id === currentBranchId;
          return (
            <button
              key={b.id}
              role="menuitem"
              disabled={disabled}
              className={`menu-item ${current ? "is-selected" : ""}`}
              onClick={() => {
                setOpen(false);
                navigate(`/branch/${b.id}/dashboard`);
              }}
            >
              <span className="mi-icon">
                <Building2 size={16} />
              </span>
              <span className="mi-text">
                {b.name}
                <small>
                  {b.city}, {b.country} · {b.currency}
                </small>
              </span>
              {disabled ? <Badge>Setup</Badge> : current ? <Badge tone="brand">Current</Badge> : <ChevronRight size={16} className="mi-check" />}
            </button>
          );
        })}
        <div className="menu-sep" />
        <div className="hint" style={{ padding: "4px 10px 6px" }}>
          {ACTIVE_BRANCHES.length} active branches · entering a branch opens its own operations workspace.
        </div>
      </Popover>
    </>
  );
}
