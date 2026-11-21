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
import { CURRENT_USER } from "@/data/demo/catalog";
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
    }),
    [theme, setTheme, collapsed, setCollapsed, context, period, route, navigate, notifications, markRead, markAllRead, toast, showToast, assistantOpen, assistantQuestion, askAssistant, signOutOpen],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppStateValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used inside <AppStateProvider>");
  return v;
}
