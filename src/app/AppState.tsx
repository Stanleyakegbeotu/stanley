import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_THEME, isThemeId, type ThemeId } from "./themes";
import { useHashRoute, type Route } from "./router";
import { NOTIFICATIONS, type NotificationItem } from "@/data/demo/records";
import { CURRENT_USER } from "@/data/company";
import { BASELINE_AGENTS, EMPTY_INVENTORY_CHANGES, applyAgentEdits, mergeAgents, nextServiceId, nextUserId, type AddedService, type AgentEdit, type AgentRecord, type InventoryChanges } from "@/data/userRecords";
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
  user: typeof CURRENT_USER;
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
  notifications: NotificationItem[];
  markRead: (id: string) => void;
  markAllRead: () => void;
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
  /** Session-only inventory changes layered over the read-only legacy catalogue. */
  inventory: InventoryChanges;
  renameCategory: (key: string, name: string) => void;
  editService: (id: number, edit: { name?: string; price?: number | null }) => void;
  revertService: (id: number) => void;
  addService: (s: Omit<AddedService, "id" | "createdAt">) => AddedService;
}

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
  const [notifications, setNotifications] = useState(NOTIFICATIONS);
  const [toast, setToast] = useState<string | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantQuestion, setAssistantQuestion] = useState<string | null>(null);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [userAgents, setUserAgents] = useState<AgentRecord[]>([]);
  const [agentEdits, setAgentEdits] = useState<Record<number, AgentEdit>>({});
  // Everyone reading `agents` sees edits (e.g. transfers); the legacy export itself is never changed.
  const agents = useMemo(() => applyAgentEdits(mergeAgents(userAgents), agentEdits), [userAgents, agentEdits]);
  const editAgent = useCallback(
    (id: number, edit: { name: string; phone: string; hospital: string }) => {
      const clean = { name: edit.name.trim(), phone: edit.phone.trim() || "N/A", hospital: edit.hospital };
      if (userAgents.some((a) => a.id === id)) {
        setUserAgents((list) => list.map((a) => (a.id === id ? { ...a, ...clean } : a)));
        return;
      }
      setAgentEdits((e) => ({ ...e, [id]: { ...clean, at: new Date().toISOString() } }));
    },
    [userAgents],
  );
  const revertAgent = useCallback(
    (id: number) =>
      setAgentEdits((e) => {
        const next = { ...e };
        delete next[id];
        return next;
      }),
    [],
  );
  const [inventory, setInventory] = useState<InventoryChanges>(EMPTY_INVENTORY_CHANGES);
  const renameCategory = useCallback(
    (key: string, name: string) =>
      setInventory((inv) => {
        const categoryNames = { ...inv.categoryNames };
        if (name.trim() && name.trim() !== key) categoryNames[key] = name.trim();
        else delete categoryNames[key];
        return { ...inv, categoryNames };
      }),
    [],
  );
  const editService = useCallback(
    (id: number, edit: { name?: string; price?: number | null }) =>
      setInventory((inv) => {
        const added = inv.added.find((s) => s.id === id);
        if (added) return { ...inv, added: inv.added.map((s) => (s.id === id ? { ...s, name: edit.name ?? s.name, price: edit.price ?? s.price } : s)) };
        return { ...inv, edits: { ...inv.edits, [id]: { ...edit, at: new Date().toISOString() } } };
      }),
    [],
  );
  const revertService = useCallback(
    (id: number) =>
      setInventory((inv) => {
        const edits = { ...inv.edits };
        delete edits[id];
        return { ...inv, edits };
      }),
    [],
  );
  const addService = useCallback(
    (s: Omit<AddedService, "id" | "createdAt">) => {
      const record: AddedService = { ...s, id: nextServiceId(inventory.added), createdAt: new Date().toISOString() };
      setInventory((inv) => ({ ...inv, added: [...inv.added, record] }));
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

  const markRead = useCallback(
    (id: string) => setNotifications((list) => list.map((n) => (n.id === id ? { ...n, read: true } : n))),
    [],
  );
  const markAllRead = useCallback(() => setNotifications((list) => list.map((n) => ({ ...n, read: true }))), []);

  const askAssistant = useCallback((q: string) => {
    setAssistantQuestion(q);
    setAssistantOpen(true);
  }, []);

  const value = useMemo<AppStateValue>(
    () => ({
      user: CURRENT_USER,
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
      notifications,
      markRead,
      markAllRead,
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
      inventory,
      renameCategory,
      editService,
      revertService,
      addService,
    }),
    [theme, setTheme, collapsed, setCollapsed, context, period, route, navigate, notifications, markRead, markAllRead, toast, showToast, assistantOpen, assistantQuestion, askAssistant, signOutOpen, agents, userAgents, addAgent, agentEdits, editAgent, revertAgent, inventory, renameCategory, editService, revertService, addService],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppStateValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used inside <AppStateProvider>");
  return v;
}
