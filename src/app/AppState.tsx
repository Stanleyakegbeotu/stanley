import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_THEME, isThemeId, type ThemeId } from "./themes";
import { useHashRoute, type Route } from "./router";
import { BRANCH_MANAGER_PLACEHOLDER, CURRENT_USER, getBranch, type AppUser } from "@/data/company";
import { LEGACY_BRANCH_ID, hospitalKey } from "@/data/legacy";
import { logAudit, setAuditActor } from "@/services/audit";
import { BASELINE_AGENTS, EMPTY_INVENTORY_CHANGES, applyAgentEdits, mergeAgents, nextServiceId, nextUserId, type AddedService, type AgentEdit, type AgentRecord, type BankDetails, type InventoryChanges, isManager, managerOf, nextStaffId, type StaffRecord } from "@/data/userRecords";
import { useSettings } from "@/services/settingsStore";
import type { PeriodSelection } from "@/data/types";

/* localStorage is a per-viewer convenience only; every read/write is guarded. */
function readStore(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStore(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable — keep working in memory */
  }
}

interface AppStateValue {
  user: AppUser;
  /** Demo account switch inside a branch (until sign-in exists): staff id, or null for the manager. */
  switchAccount: (branchId: string, staffId: string | null) => void;
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  /** "all" or a branch id — the company-dashboard context selector. */
  context: string;
  setContext: (v: string) => void;
  period: PeriodSelection;
  setPeriod: (p: PeriodSelection) => void;
  route: Route;
  navigate: (to: string) => void;
  toast: string | null;
  showToast: (msg: string) => void;
  assistantOpen: boolean;
  setAssistantOpen: (v: boolean) => void;
  assistantQuestion: string | null;
  askAssistant: (q: string) => void;
  clearAssistantQuestion: () => void;
  signOutOpen: boolean;
  setSignOutOpen: (v: boolean) => void;
  /** Legacy baseline agents + agents created in the app (baseline is never modified). */
  agents: AgentRecord[];
  userAgents: AgentRecord[];
  addAgent: (a: { name: string; phone: string; hospital: string }) => AgentRecord;
  /** Session-only profile changes to legacy agents (name, phone, hospital transfer). */
  agentEdits: Record<number, AgentEdit>;
  editAgent: (id: number, edit: { name: string; phone: string; hospital: string }) => void;
  revertAgent: (id: number) => void;
  /** Agent payment accounts (session until the database is connected). */
  agentBanks: Record<number, BankDetails>;
  setAgentBank: (id: number, bank: Omit<BankDetails, "at"> | null) => void;
  /** Staff created in STANLEY (session until the database is connected). */
  staff: StaffRecord[];
  addStaff: (s: Omit<StaffRecord, "id" | "createdAt">) => StaffRecord;
  editStaff: (id: string, patch: Partial<Omit<StaffRecord, "id" | "createdAt">>) => void;
  /** Deleted records kept 30 days (only records created in STANLEY can be deleted). */
  trash: TrashItem[];
  moveStaffToTrash: (id: string, reason?: string) => void;
  moveAgentToTrash: (id: number, reason?: string) => void;
  restoreFromTrash: (trashId: string) => void;
  purgeFromTrash: (trashId: string) => void;
  /** Session-only inventory changes layered over the read-only legacy catalogue. */
  inventory: InventoryChanges;
  renameCategory: (key: string, name: string) => void;
  editService: (id: number, edit: { name?: string; price?: number | null }) => void;
  revertService: (id: number) => void;
  addService: (s: Omit<AddedService, "id" | "createdAt">) => AddedService;
}

/** A deleted record and everything needed to restore it. */
export interface TrashItem {
  id: string;
  kind: "staff" | "agent";
  name: string;
  type: string;
  branchId: string;
  deletedBy: string;
  /** ISO date. Permanently removed 30 days later. */
  deletedAt: string;
  reason?: string;
  staff?: StaffRecord;
  agent?: AgentRecord;
}

export const TRASH_RETENTION_DAYS = 30;

const STAFF_FIELD_LABEL: Partial<Record<keyof StaffRecord, string>> = { name: "Name", phone: "Phone", email: "Email", address: "Address", role: "Role", employment: "Employment", startDate: "Start date", status: "Status", notes: "Notes" };

const Ctx = createContext<AppStateValue | null>(null);

const COLLAPSE_BREAKPOINT = 1180;

export function AppStateProvider({ children }: { children: ReactNode }) {
  const { route, navigate } = useHashRoute();

  const [theme, setThemeState] = useState<ThemeId>(() => {
    const stored = readStore("stanley.theme");
    return isThemeId(stored) ? stored : DEFAULT_THEME;
  });

  // Sidebar state = the user's saved preference, overridden (temporarily) by
  // narrow windows. Keeping them separate means a transient small window size
  // at start-up can never permanently collapse the sidebar.
  const [sidebarPref, setSidebarPref] = useState<"expanded" | "collapsed">(() =>
    readStore("stanley.sidebar") === "collapsed" ? "collapsed" : "expanded",
  );
  const [narrow, setNarrow] = useState(() => window.innerWidth < COLLAPSE_BREAKPOINT);
  const [narrowExpanded, setNarrowExpanded] = useState(false);
  const collapsed = narrow ? !narrowExpanded : sidebarPref === "collapsed";

  const [context, setContext] = useState("all");
  const [period, setPeriod] = useState<PeriodSelection>({ key: "today" });
  const [toast, setToast] = useState<string | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantQuestion, setAssistantQuestion] = useState<string | null>(null);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [userAgents, setUserAgents] = useState<AgentRecord[]>([]);
  const [agentEdits, setAgentEdits] = useState<Record<number, AgentEdit>>({});
  // Everyone reading `agents` sees edits (e.g. transfers); the legacy export itself is never changed.
  const [agentBanks, setAgentBanks] = useState<Record<number, BankDetails>>({});
  const agents = useMemo(() => {
    const list = applyAgentEdits(mergeAgents(userAgents), agentEdits);
    return Object.keys(agentBanks).length ? list.map((a) => (agentBanks[a.id] ? { ...a, bank: agentBanks[a.id] } : a)) : list;
  }, [userAgents, agentEdits, agentBanks]);
  const [staff, setStaff] = useState<StaffRecord[]>([]);
  // Live copy so a new record (and its id) is known immediately, not after the next render.
  const staffRef = useRef<StaffRecord[]>([]);
  /** Signed-in person (see `user` below) — read by actions such as Move to trash. */
  const userRef = useRef<AppUser>(CURRENT_USER);
  const branchLabel = (id: string | null | undefined) => (id ? `${getBranch(id)?.name ?? id} branch` : "");
  const addStaff = useCallback((s: Omit<StaffRecord, "id" | "createdAt">) => {
    const created: StaffRecord = { ...s, name: s.name.trim(), email: s.email.trim(), phone: s.phone.trim(), id: nextStaffId(staffRef.current), createdAt: new Date().toISOString() };
    staffRef.current = [...staffRef.current, created];
    setStaff(staffRef.current);
    logAudit({ category: "Staff", action: "Staff added", record: `${created.name} (${created.id})`, details: `${created.role} at ${branchLabel(created.branchId)} · ${created.employment}, starting ${created.startDate}`, branchId: created.branchId });
    return created;
  }, []);
  const editStaff = useCallback((id: string, patch: Partial<Omit<StaffRecord, "id" | "createdAt">>) => {
    const before = staffRef.current.find((x) => x.id === id);
    staffRef.current = staffRef.current.map((x) => (x.id === id ? { ...x, ...patch, updatedAt: new Date().toISOString() } : x));
    setStaff(staffRef.current);
    if (!before) return;
    const changes = (Object.keys(patch) as (keyof typeof patch)[])
      .filter((k) => (patch[k] ?? "") !== (before[k] ?? ""))
      .map((k) => `${STAFF_FIELD_LABEL[k] ?? k}: ${before[k] || "—"} → ${patch[k] || "—"}`);
    if (changes.length)
      logAudit({ category: "Staff", action: patch.status && patch.status !== before.status ? `Status changed to ${patch.status}` : patch.role && patch.role !== before.role ? "Role changed" : "Staff details updated", record: `${before.name} (${id})`, details: changes.join(" · "), branchId: before.branchId });
  }, []);
  const setAgentBank = useCallback(
    (id: number, bank: Omit<BankDetails, "at"> | null) => {
      const a = agents.find((x) => x.id === id);
      setAgentBanks((b) => {
        const next = { ...b };
        if (bank) next[id] = { bankName: bank.bankName.trim(), accountNumber: bank.accountNumber.trim(), accountName: bank.accountName.trim(), at: new Date().toISOString() };
        else delete next[id];
        return next;
      });
      logAudit({
        category: "PR agents",
        action: bank ? (a?.bank ? "Bank details changed" : "Bank details added") : "Bank details removed",
        record: `${a?.name ?? "PR agent"} (#${id})`,
        details: bank ? `${bank.bankName.trim()} · account ending ${bank.accountNumber.trim().slice(-4)} · ${bank.accountName.trim()}` : `Removed ${a?.bank?.bankName ?? "bank"} details`,
        branchId: LEGACY_BRANCH_ID,
      });
    },
    [agents],
  );
  const editAgent = useCallback(
    (id: number, edit: { name: string; phone: string; hospital: string }) => {
      const clean = { name: edit.name.trim(), phone: edit.phone.trim() || "N/A", hospital: edit.hospital };
      const before = agents.find((x) => x.id === id);
      if (before) {
        const changes = [
          before.name !== clean.name ? `Name: ${before.name} → ${clean.name}` : "",
          before.phone !== clean.phone ? `Phone: ${before.phone} → ${clean.phone}` : "",
          hospitalKey(before.hospital) !== clean.hospital ? `Hospital: ${hospitalKey(before.hospital) || "none"} → ${clean.hospital || "none"}` : "",
        ].filter(Boolean);
        if (changes.length) logAudit({ category: "PR agents", action: hospitalKey(before.hospital) !== clean.hospital ? "Agent transferred" : "Agent details updated", record: `${before.name} (#${id})`, details: changes.join(" · "), branchId: LEGACY_BRANCH_ID });
      }
      if (userAgents.some((a) => a.id === id)) {
        setUserAgents((list) => list.map((a) => (a.id === id ? { ...a, ...clean } : a)));
        return;
      }
      setAgentEdits((e) => ({ ...e, [id]: { ...clean, at: new Date().toISOString() } }));
    },
    [userAgents, agents],
  );
  const revertAgent = useCallback(
    (id: number) => {
      const recorded = BASELINE_AGENTS.find((a) => a.id === id);
      setAgentEdits((e) => {
        const next = { ...e };
        delete next[id];
        return next;
      });
      logAudit({ category: "PR agents", action: "Restored to recorded details", record: `${recorded?.name ?? "PR agent"} (#${id})`, details: "Session changes removed; the legacy record applies again", branchId: LEGACY_BRANCH_ID });
    },
    [],
  );

  /* ── Trash: only records created in STANLEY can be deleted (the legacy baseline never is) ── */
  const [trash, setTrash] = useState<TrashItem[]>([]);
  const trashRef = useRef<TrashItem[]>([]);
  const commitTrash = (list: TrashItem[]) => {
    trashRef.current = list;
    setTrash(list);
  };
  const moveStaffToTrash = useCallback((id: string, reason?: string) => {
    const s = staffRef.current.find((x) => x.id === id);
    if (!s) return;
    staffRef.current = staffRef.current.filter((x) => x.id !== id);
    setStaff(staffRef.current);
    commitTrash([{ id: `TR-${Date.now()}`, kind: "staff", name: s.name, type: `Staff · ${s.role}`, branchId: s.branchId, deletedBy: userRef.current.name, deletedAt: new Date().toISOString(), reason: reason?.trim() || undefined, staff: s }, ...trashRef.current]);
    logAudit({ category: "Trash", action: "Moved to trash", record: `${s.name} (${s.id})`, details: `Staff · ${s.role}${reason?.trim() ? ` · Reason: ${reason.trim()}` : ""} · kept 30 days`, branchId: s.branchId });
  }, []);
  const moveAgentToTrash = useCallback(
    (id: number, reason?: string) => {
      const a = userAgents.find((x) => x.id === id);
      if (!a) return;
      setUserAgents((list) => list.filter((x) => x.id !== id));
      commitTrash([{ id: `TR-${Date.now()}`, kind: "agent", name: a.name, type: "PR agent (added in app)", branchId: LEGACY_BRANCH_ID, deletedBy: userRef.current.name, deletedAt: new Date().toISOString(), reason: reason?.trim() || undefined, agent: a }, ...trashRef.current]);
      logAudit({ category: "Trash", action: "Moved to trash", record: `${a.name} (#${a.id})`, details: `PR agent${reason?.trim() ? ` · Reason: ${reason.trim()}` : ""} · kept 30 days`, branchId: LEGACY_BRANCH_ID });
    },
    [userAgents],
  );
  const restoreFromTrash = useCallback((trashId: string) => {
    const t = trashRef.current.find((x) => x.id === trashId);
    if (!t) return;
    if (t.staff) {
      staffRef.current = [...staffRef.current, t.staff];
      setStaff(staffRef.current);
    }
    if (t.agent) setUserAgents((list) => [...list, t.agent!]);
    commitTrash(trashRef.current.filter((x) => x.id !== trashId));
    logAudit({ category: "Trash", action: "Restored from trash", record: t.name, details: t.type, branchId: t.branchId });
  }, []);
  const purgeFromTrash = useCallback((trashId: string) => {
    const t = trashRef.current.find((x) => x.id === trashId);
    if (!t) return;
    commitTrash(trashRef.current.filter((x) => x.id !== trashId));
    logAudit({ category: "Trash", action: "Deleted permanently", record: t.name, details: `${t.type} · cannot be restored`, branchId: t.branchId });
  }, []);
  const [inventory, setInventory] = useState<InventoryChanges>(EMPTY_INVENTORY_CHANGES);
  const renameCategory = useCallback((key: string, name: string) => {
    setInventory((inv) => {
      const categoryNames = { ...inv.categoryNames };
      if (name.trim() && name.trim() !== key) categoryNames[key] = name.trim();
      else delete categoryNames[key];
      return { ...inv, categoryNames };
    });
    logAudit({ category: "Catalogue", action: name.trim() && name.trim() !== key ? "Category renamed" : "Category name restored", record: key, details: name.trim() && name.trim() !== key ? `Shown as “${name.trim()}”` : "Back to the recorded name", branchId: null });
  }, []);
  const editService = useCallback((id: number, edit: { name?: string; price?: number | null }) => {
    setInventory((inv) => {
      const added = inv.added.find((s) => s.id === id);
      if (added) return { ...inv, added: inv.added.map((s) => (s.id === id ? { ...s, name: edit.name ?? s.name, price: edit.price ?? s.price } : s)) };
      return { ...inv, edits: { ...inv.edits, [id]: { ...edit, at: new Date().toISOString() } } };
    });
    logAudit({
      category: "Catalogue",
      action: "Service updated",
      record: `${edit.name ?? "Service"} (#${id})`,
      details: [edit.name !== undefined ? `Name: ${edit.name}` : "", edit.price !== undefined ? `Price: ${edit.price === null ? "no price" : `₦${edit.price.toLocaleString("en-NG")}`}` : ""].filter(Boolean).join(" · "),
      branchId: null,
    });
  }, []);
  const revertService = useCallback((id: number) => {
    setInventory((inv) => {
      const edits = { ...inv.edits };
      delete edits[id];
      return { ...inv, edits };
    });
    logAudit({ category: "Catalogue", action: "Service restored", record: `Service #${id}`, details: "Back to the recorded name and price", branchId: null });
  }, []);
  const addService = useCallback(
    (s: Omit<AddedService, "id" | "createdAt">) => {
      const record: AddedService = { ...s, id: nextServiceId(inventory.added), createdAt: new Date().toISOString() };
      setInventory((inv) => ({ ...inv, added: [...inv.added, record] }));
      logAudit({ category: "Catalogue", action: "Service added", record: `${record.name} (#${record.id})`, details: `${record.category} · ₦${record.price.toLocaleString("en-NG")}`, branchId: null });
      return record;
    },
    [inventory.added],
  );
  const addAgent = useCallback(
    (a: { name: string; phone: string; hospital: string }) => {
      const record: AgentRecord = {
        id: nextUserId(userAgents),
        name: a.name.trim(),
        phone: a.phone.trim() || "N/A",
        hospital: a.hospital,
        order: BASELINE_AGENTS.length + userAgents.length,
        source: "user",
        createdAt: new Date().toISOString(),
      };
      setUserAgents((list) => [...list, record]);
      logAudit({ category: "PR agents", action: "PR agent added", record: `${record.name} (#${record.id})`, details: `${record.hospital || "No hospital"} · ${record.phone}`, branchId: LEGACY_BRANCH_ID });
      return record;
    },
    [userAgents],
  );

  // Theme tokens live on <html> so portals (popovers, modals) inherit them.
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const setTheme = useCallback((t: ThemeId) => {
    setThemeState(t);
    writeStore("stanley.theme", t);
  }, []);

  const setCollapsed = useCallback(
    (v: boolean) => {
      if (narrow) {
        // In a narrow window, expanding is temporary and not saved.
        setNarrowExpanded(!v);
        return;
      }
      const pref = v ? "collapsed" : "expanded";
      setSidebarPref(pref);
      writeStore("stanley.sidebar", pref);
    },
    [narrow],
  );

  // Narrow desktop windows collapse the sidebar; widening restores the preference.
  useEffect(() => {
    const check = () => {
      const isNarrow = window.innerWidth < COLLAPSE_BREAKPOINT;
      setNarrow(isNarrow);
      if (!isNarrow) setNarrowExpanded(false);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const showToast = useCallback((msg: string) => setToast(msg), []);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(t);
  }, [toast]);

  const askAssistant = useCallback((q: string) => {
    setAssistantQuestion(q);
    setAssistantOpen(true);
  }, []);

  // Signed-in person: the Company Admin, or — inside a branch workspace — that
  // branch's manager, unless a branch staff account was picked with "Switch
  // account" (demo stand-in until real sign-in exists).
  const branchId = route.segments[0] === "branch" ? route.segments[1] : null;
  const [actingAs, setActingAs] = useState<Record<string, string>>({});
  const { profiles } = useSettings();
  const user = useMemo<AppUser>(() => {
    const first = (n: string) => n.split(/\s+/)[0] || n;
    const withProfile = (base: AppUser): AppUser => {
      const p = profiles[base.key] ?? {};
      const name = p.name?.trim() || base.name;
      return { ...base, name, firstName: first(name), email: p.email?.trim() || base.email, phone: p.phone ?? base.phone, address: p.address ?? base.address, photo: p.photo };
    };
    if (!branchId) return withProfile(CURRENT_USER);
    const fromStaff = (s: StaffRecord, kind: AppUser["kind"]): AppUser => ({
      name: s.name,
      firstName: first(s.name),
      role: s.role,
      email: s.email || BRANCH_MANAGER_PLACEHOLDER.email,
      phone: s.phone,
      address: s.address,
      kind,
      key: s.id,
      staffId: s.id,
      branchId,
      photo: profiles[s.id]?.photo,
    });
    const picked = staff.find((s) => s.id === actingAs[branchId] && s.branchId === branchId && s.status !== "Left" && s.status !== "Suspended");
    if (picked) return fromStaff(picked, isManager(picked) ? "manager" : "staff");
    const m = managerOf(staff, branchId);
    return m ? fromStaff(m, "manager") : withProfile({ ...BRANCH_MANAGER_PLACEHOLDER, key: `placeholder-manager:${branchId}`, branchId });
  }, [branchId, staff, actingAs, profiles]);
  userRef.current = user;
  setAuditActor(user.name, user.role);

  const switchAccount = useCallback((branch: string, staffId: string | null) => {
    setActingAs((a) => {
      const next = { ...a };
      if (staffId) next[branch] = staffId;
      else delete next[branch];
      return next;
    });
    const s = staffId ? staffRef.current.find((x) => x.id === staffId) : null;
    logAudit({ category: "System", action: "Account switched (demo)", record: s ? `${s.name} (${s.id})` : "Branch manager", details: s ? `Now working as ${s.role}` : "Back to the branch manager account", branchId: branch });
  }, []);

  const value = useMemo<AppStateValue>(
    () => ({
      user,
      switchAccount,
      theme,
      setTheme,
      collapsed,
      setCollapsed,
      context,
      setContext,
      period,
      setPeriod,
      route,
      navigate,
      toast,
      showToast,
      assistantOpen,
      setAssistantOpen,
      assistantQuestion,
      askAssistant,
      clearAssistantQuestion: () => setAssistantQuestion(null),
      signOutOpen,
      setSignOutOpen,
      agents,
      userAgents,
      addAgent,
      agentEdits,
      editAgent,
      revertAgent,
      agentBanks,
      setAgentBank,
      staff,
      addStaff,
      editStaff,
      trash,
      moveStaffToTrash,
      moveAgentToTrash,
      restoreFromTrash,
      purgeFromTrash,
      inventory,
      renameCategory,
      editService,
      revertService,
      addService,
    }),
    [user, switchAccount, theme, setTheme, collapsed, setCollapsed, context, period, route, navigate, toast, showToast, assistantOpen, assistantQuestion, askAssistant, signOutOpen, agents, userAgents, addAgent, agentEdits, editAgent, revertAgent, agentBanks, setAgentBank, staff, addStaff, editStaff, trash, moveStaffToTrash, moveAgentToTrash, restoreFromTrash, purgeFromTrash, inventory, renameCategory, editService, revertService, addService],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppStateValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used inside <AppStateProvider>");
  return v;
}
