/**
 * System health record (owner, 2026-11-22): the recovery system's memory.
 *
 *  • Problems ("incidents") in plain words — crashes, unreadable data, failed
 *    saves, unexpected shutdowns — with what was fixed. Capped at 40 entries so
 *    it never grows.
 *  • Live signals: whether the last save to the device failed (storage full),
 *    slow moments (long tasks), when this session started.
 *  • Open-session tracking, so a power cut or forced close is noticed the next
 *    time STANLEY opens (see detectUncleanShutdown).
 *  • The support contact the Company Admin sets ("who to call").
 *
 * No React here except the small hooks at the bottom; safe to import first.
 */
import { useSyncExternalStore } from "react";

export type IncidentKind = "crash" | "data" | "storage" | "shutdown" | "slow" | "clock" | "backup" | "background";

export interface Incident {
  id: string;
  at: string;
  kind: IncidentKind;
  /** One line, plain words. */
  title: string;
  /** What happened and what it means, plain words. */
  detail: string;
  /** Which part of the app it touched. */
  area: string;
  /** True when STANLEY fixed it by itself. */
  fixed: boolean;
  /** For the developer only (never shown unless asked). */
  technical?: string;
}

export interface SupportContact {
  name: string;
  phone: string;
  email: string;
  note: string;
}

interface HealthState {
  incidents: Incident[];
  support: SupportContact;
}

const KEY = "stanley.health.v1";
const SUPPORT_KEY = "stanley.support.v1";
const MAX_INCIDENTS = 40;

/* Raw setItem, captured before the write-failure tracker wraps it (so our own saves never recurse). */
const rawSet = typeof Storage !== "undefined" ? Storage.prototype.setItem : undefined;
function write(key: string, value: string) {
  try {
    rawSet?.call(window.localStorage, key, value);
  } catch {
    /* storage full — the record stays in memory for this session */
  }
}

function load(): HealthState {
  const empty: HealthState = { incidents: [], support: { name: "", phone: "", email: "", note: "" } };
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<HealthState>) : {};
    const sup = window.localStorage.getItem(SUPPORT_KEY);
    return {
      incidents: Array.isArray(parsed.incidents) ? parsed.incidents.slice(0, MAX_INCIDENTS) : [],
      support: { ...empty.support, ...(sup ? (JSON.parse(sup) as Partial<SupportContact>) : {}) },
    };
  } catch {
    return empty;
  }
}

let state: HealthState = load();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const healthState = () => state;
export function useHealth(): HealthState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

let seq = 0;
/** Record a problem. The same title within two minutes is counted once (no floods). */
export function recordIncident(i: Omit<Incident, "id" | "at">): Incident {
  const now = new Date();
  const recent = state.incidents.find((x) => x.title === i.title && x.area === i.area && now.getTime() - new Date(x.at).getTime() < 120_000);
  if (recent) return recent;
  const inc: Incident = { ...i, id: `INC-${now.getTime().toString(36)}-${++seq}`, at: now.toISOString() };
  state = { ...state, incidents: [inc, ...state.incidents].slice(0, MAX_INCIDENTS) };
  write(KEY, JSON.stringify({ incidents: state.incidents }));
  emit();
  return inc;
}

export function markIncidentsFixed(ids: string[]) {
  if (!ids.length) return;
  state = { ...state, incidents: state.incidents.map((x) => (ids.includes(x.id) ? { ...x, fixed: true } : x)) };
  write(KEY, JSON.stringify({ incidents: state.incidents }));
  emit();
}

export function setSupportContact(s: SupportContact) {
  state = { ...state, support: s };
  write(SUPPORT_KEY, JSON.stringify(s));
  emit();
}

/* ─────────────── Live signals ─────────────── */

export interface LiveSignals {
  /** The last attempt to save something on this device failed. */
  saveFailed: { at: string; key: string; reason: "full" | "blocked" } | null;
  /** Slow moments (tasks longer than 50 ms) this session, and the worst one. */
  longTasks: number;
  worstTaskMs: number;
  /** Background errors caught this session (outside any page). */
  backgroundErrors: number;
  sessionStart: number;
}

let live: LiveSignals = { saveFailed: null, longTasks: 0, worstTaskMs: 0, backgroundErrors: 0, sessionStart: Date.now() };
const liveListeners = new Set<() => void>();
const emitLive = () => liveListeners.forEach((l) => l());
export const liveSignals = () => live;
export function useLiveSignals(): LiveSignals {
  return useSyncExternalStore(
    (l) => {
      liveListeners.add(l);
      return () => {
        liveListeners.delete(l);
      };
    },
    () => live,
    () => live,
  );
}
export function clearSaveFailure() {
  if (!live.saveFailed) return;
  live = { ...live, saveFailed: null };
  emitLive();
}

let installed = false;
/**
 * Watch the whole app without touching each store:
 *  • every save to device storage — a failure (storage full / blocked) is
 *    flagged at once so people are told, instead of losing work silently;
 *  • errors outside any page (background tasks);
 *  • slow moments (the browser's long-task signal, where supported).
 * The original behaviour of every save is unchanged (errors still reach the store's own catch).
 */
export function installWatchers() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  if (rawSet) {
    Storage.prototype.setItem = function (this: Storage, key: string, value: string) {
      try {
        rawSet.call(this, key, value);
        if (live.saveFailed && key === live.saveFailed.key) clearSaveFailure();
      } catch (e) {
        if (key.startsWith("stanley.")) {
          const full = e instanceof DOMException && (e.name === "QuotaExceededError" || e.code === 22 || e.name === "NS_ERROR_DOM_QUOTA_REACHED");
          live = { ...live, saveFailed: { at: new Date().toISOString(), key, reason: full ? "full" : "blocked" } };
          emitLive();
          recordIncident({
            kind: "storage",
            title: full ? "A change couldn't be saved — device storage for STANLEY is full" : "A change couldn't be saved — the browser blocked device storage",
            detail: full
              ? "The last change is still on screen and works for now, but it was not written to this device. Run “Scan for errors” to free space, or ask your developer."
              : "The browser refused to save (private window or storage switched off). Changes work until the app is closed, then they are lost.",
            area: key,
            fixed: false,
            technical: `${(e as Error)?.name ?? "Error"}: ${(e as Error)?.message ?? e} · key ${key} · value ${value.length} chars`,
          });
        }
        throw e;
      }
    };
  }

  window.addEventListener("error", (e) => {
    // Resource load errors (images) have no error object — ignore those.
    if (!e.error) return;
    live = { ...live, backgroundErrors: live.backgroundErrors + 1 };
    emitLive();
    recordIncident({ kind: "background", title: "A background task hit a problem", detail: "Something running behind the scenes stopped. Pages kept working. If it keeps happening, run “Scan for errors”.", area: "Background", fixed: false, technical: errorText(e.error) });
  });
  window.addEventListener("unhandledrejection", (e) => {
    live = { ...live, backgroundErrors: live.backgroundErrors + 1 };
    emitLive();
    recordIncident({ kind: "background", title: "A background task hit a problem", detail: "Something running behind the scenes stopped. Pages kept working. If it keeps happening, run “Scan for errors”.", area: "Background", fixed: false, technical: errorText(e.reason) });
  });

  try {
    const po = new PerformanceObserver((list) => {
      let worst = live.worstTaskMs;
      for (const entry of list.getEntries()) worst = Math.max(worst, entry.duration);
      live = { ...live, longTasks: live.longTasks + list.getEntries().length, worstTaskMs: Math.round(worst) };
      // No emit: nobody needs to re-render on every slow frame; the scan reads it.
    });
    po.observe({ type: "longtask", buffered: true });
  } catch {
    /* not supported in this browser */
  }
}

export function errorText(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}${e.stack ? `\n${e.stack.split("\n").slice(1, 6).join("\n")}` : ""}`;
  try {
    return typeof e === "string" ? e : JSON.stringify(e);
  } catch {
    return String(e);
  }
}

/* ─────────────── Open-session tracking (power cuts, forced closes) ─────────────── */

const SESSION_KEY = "stanley.session.v1";
const BEAT_MS = 10_000;
const STALE_MS = 30_000;

interface TabBeat {
  start: number;
  beat: number;
  route: string;
  user?: string;
}
interface SessionState {
  tabs: Record<string, TabBeat>;
  /** Latest time this device's clock showed while STANLEY was open (clock-going-backwards check). */
  lastSeen: number;
}

const tabId = `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
let sessionUser: string | undefined;
export const setSessionUser = (name: string) => {
  sessionUser = name;
};

function readSession(): SessionState {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    const s = raw ? (JSON.parse(raw) as Partial<SessionState>) : {};
    return { tabs: s.tabs && typeof s.tabs === "object" ? s.tabs : {}, lastSeen: typeof s.lastSeen === "number" ? s.lastSeen : 0 };
  } catch {
    return { tabs: {}, lastSeen: 0 };
  }
}

export interface ShutdownInfo {
  /** Last moment STANLEY was seen running before it stopped. */
  lastSeen: Date;
  /** Page that was open. */
  route: string;
  user?: string;
}

export interface ClockJump {
  /** The clock now reads earlier than a time STANLEY already saw. */
  behindBy: number;
  lastSeen: Date;
}

/**
 * Called once at start-up. A tab that stopped beating without saying goodbye
 * means STANLEY was shut down unexpectedly (power cut, computer switched off,
 * browser killed). Also returns a clock that went backwards.
 */
export function startSessionTracking(): { shutdown: ShutdownInfo | null; clock: ClockJump | null } {
  const s = readSession();
  const now = Date.now();
  let shutdown: ShutdownInfo | null = null;
  for (const [id, t] of Object.entries(s.tabs)) {
    if (now - t.beat > STALE_MS || t.beat > now + 60_000) {
      if (!shutdown || t.beat > shutdown.lastSeen.getTime()) shutdown = { lastSeen: new Date(t.beat), route: t.route, user: t.user };
      delete s.tabs[id];
    }
  }
  const clock = s.lastSeen && now < s.lastSeen - 10 * 60_000 ? { behindBy: s.lastSeen - now, lastSeen: new Date(s.lastSeen) } : null;

  const beat = () => {
    const cur = readSession();
    cur.tabs[tabId] = { start: cur.tabs[tabId]?.start ?? now, beat: Date.now(), route: window.location.hash.replace(/^#/, "") || "/dashboard", user: sessionUser };
    cur.lastSeen = Math.max(cur.lastSeen, Date.now());
    write(SESSION_KEY, JSON.stringify(cur));
  };
  // Keep the earlier lastSeen if the clock is behind, so the warning stays until the clock is fixed.
  write(SESSION_KEY, JSON.stringify(s));
  beat();
  window.setInterval(beat, BEAT_MS);
  // A normal close / refresh says goodbye, so it is never mistaken for a power cut.
  window.addEventListener("pagehide", () => {
    const cur = readSession();
    delete cur.tabs[tabId];
    write(SESSION_KEY, JSON.stringify(cur));
  });
  // Coming back from sleep: beat at once so the tab isn't seen as stale by another tab.
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && beat());

  if (shutdown) {
    recordIncident({
      kind: "shutdown",
      title: "STANLEY closed unexpectedly",
      detail: `It stopped at ${shutdown.lastSeen.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} without closing normally — usually a power cut, the computer switching off, or the browser being forced closed. Saved data was checked when it opened again.`,
      area: routeArea(shutdown.route),
      fixed: true,
    });
  }
  return { shutdown, clock };
}

export const lastSeenClock = () => readSession().lastSeen;

/** Other STANLEY windows/tabs open right now on this computer. */
export const otherOpenTabs = () => Object.entries(readSession().tabs).filter(([id, t]) => id !== tabId && Date.now() - t.beat < STALE_MS).length;

/** "/branch/br001-abuja/billing?x" → "Billing" */
export function routeArea(route: string): string {
  const path = route.split("?")[0];
  const seg = path.split("/").filter(Boolean);
  const page = seg[0] === "branch" ? (seg[2] ?? "dashboard") : (seg[0] ?? "dashboard");
  const names: Record<string, string> = {
    dashboard: "Dashboard",
    billing: "Billing",
    drafts: "Drafts",
    records: "Records",
    patients: "Patients",
    inventory: "Inventory",
    expenses: "Expenses",
    finance: "Finance",
    reports: "Reports",
    analysis: "Analysis",
    pr: "PR agents",
    staff: "Staff",
    branches: "Branches",
    settings: "Settings",
    audit: "Audit log",
    trash: "Trash",
    notifications: "Notifications",
    assistant: "STANLEY AI",
    support: "Report an issue",
  };
  return names[page] ?? page.charAt(0).toUpperCase() + page.slice(1);
}
