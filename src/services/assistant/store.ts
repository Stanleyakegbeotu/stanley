/**
 * STANLEY AI conversations (owner, 2026-11-22). One chat interface, two
 * "models": STANLEY Intelligence (questions about the records) and Report an
 * issue (the support desk). The small pop-up and the full workspace page show
 * the SAME conversation, so expanding or minimising never loses anything.
 *
 * Kept on this device, capped (20 conversations × 80 messages) so it never
 * grows without limit. Messages are plain JSON "blocks" (text, scan result,
 * guide, page location…) so a future AI model can produce the same blocks.
 */
import { useSyncExternalStore } from "react";
import type { ScanReport } from "@/services/recovery/scan";

export type Mode = "intelligence" | "issues";

export type Block =
  | { type: "text"; text: string; meta?: string }
  | { type: "scan"; report: ScanReport; pageLabel?: string }
  | { type: "guide"; entryId: string; compact?: boolean }
  | { type: "locate"; pageId: string }
  | { type: "suggest"; title: string; entryIds: string[] }
  /** Offer to move a message to the other mode ("this sounds like a problem"). */
  | { type: "switch"; mode: Mode; text: string; prompt: string };

export interface Message {
  id: string;
  role: "user" | "assistant";
  at: string;
  blocks: Block[];
  /** Work in progress, shown live ("Checking saved data…"). */
  pending?: string;
  /** Report an issue: the logged report this answers. */
  issueId?: string;
  feedback?: "yes" | "no";
}

export interface Conversation {
  id: string;
  mode: Mode;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
}

interface State {
  conversations: Conversation[];
  active: Record<Mode, string | null>;
  /** The small pop-up: closed, choosing a mode (mode null), or open in a mode. */
  dock: { open: boolean; mode: Mode | null };
}

const KEY = "stanley.assistant.v1";
const MAX_CONV = 20;
const MAX_MSG = 80;

function load(): State {
  const empty: State = { conversations: [], active: { intelligence: null, issues: null }, dock: { open: false, mode: null } };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return empty;
    const s = JSON.parse(raw) as Partial<State>;
    // Unfinished work from a closed session can't resume — drop the "in progress" flag.
    const conversations = (Array.isArray(s.conversations) ? s.conversations : []).map((c) => ({ ...c, messages: c.messages.map((m) => (m.pending ? { ...m, pending: undefined, blocks: m.blocks.length ? m.blocks : [{ type: "text" as const, text: "This check was interrupted (STANLEY was closed). Ask again to run it." }] } : m)) }));
    return { ...empty, conversations, active: { ...empty.active, ...(s.active ?? {}) } };
  } catch {
    return empty;
  }
}

let state: State = load();
const listeners = new Set<() => void>();
function commit(next: State, persist = true) {
  state = next;
  if (persist) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ conversations: state.conversations, active: state.active }));
    } catch {
      /* kept for this session */
    }
  }
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
export const assistantState = () => state;
export function useAssistant(): State {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

const uid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export function activeConversation(mode: Mode, s: State = state): Conversation | null {
  const id = s.active[mode];
  return (id && s.conversations.find((c) => c.id === id)) || null;
}

/** The open conversation for a mode, creating one if needed. */
export function ensureConversation(mode: Mode): Conversation {
  const cur = activeConversation(mode);
  if (cur) return cur;
  return newConversation(mode);
}

export function newConversation(mode: Mode): Conversation {
  // Reuse an empty one instead of piling up blank chats.
  const blank = state.conversations.find((c) => c.mode === mode && c.messages.length === 0);
  if (blank) {
    commit({ ...state, active: { ...state.active, [mode]: blank.id } });
    return blank;
  }
  const now = new Date().toISOString();
  const c: Conversation = { id: uid("chat"), mode, title: mode === "issues" ? "New issue" : "New conversation", createdAt: now, updatedAt: now, messages: [] };
  commit({ ...state, conversations: [c, ...state.conversations].slice(0, MAX_CONV), active: { ...state.active, [mode]: c.id } });
  return c;
}

export function selectConversation(mode: Mode, id: string) {
  commit({ ...state, active: { ...state.active, [mode]: id } });
}

export function deleteConversation(id: string) {
  const c = state.conversations.find((x) => x.id === id);
  if (!c) return;
  commit({ ...state, conversations: state.conversations.filter((x) => x.id !== id), active: { ...state.active, [c.mode]: state.active[c.mode] === id ? null : state.active[c.mode] } });
}

function patchConv(id: string, f: (c: Conversation) => Conversation) {
  commit({ ...state, conversations: state.conversations.map((c) => (c.id === id ? f(c) : c)) });
}

export function addMessage(convId: string, m: Omit<Message, "id" | "at">): Message {
  const msg: Message = { ...m, id: uid("msg"), at: new Date().toISOString() };
  patchConv(convId, (c) => ({
    ...c,
    // The first thing the person says names the conversation.
    title: c.messages.length === 0 && m.role === "user" ? titleFrom(m.blocks) : c.title,
    updatedAt: msg.at,
    messages: [...c.messages, msg].slice(-MAX_MSG),
  }));
  return msg;
}

export function patchMessage(convId: string, msgId: string, patch: Partial<Message>) {
  patchConv(convId, (c) => ({ ...c, updatedAt: new Date().toISOString(), messages: c.messages.map((m) => (m.id === msgId ? { ...m, ...patch } : m)) }));
}

function titleFrom(blocks: Block[]): string {
  const t = blocks.find((b) => b.type === "text") as { text: string } | undefined;
  const s = (t?.text ?? "Conversation").replace(/\s+/g, " ").trim();
  return s.length > 48 ? `${s.slice(0, 46)}…` : s;
}

/* ─────────────── The small pop-up ─────────────── */

export const openDock = (mode: Mode | null = null) => commit({ ...state, dock: { open: true, mode } }, false);
export const closeDock = () => commit({ ...state, dock: { ...state.dock, open: false } }, false);
export const setDockMode = (mode: Mode | null) => commit({ ...state, dock: { open: true, mode } }, false);

/* ─────────────── Where to go back to ─────────────── */

/** The last page outside STANLEY AI — minimise / close return there. */
let returnPath = "/dashboard";
export const setReturnPath = (p: string) => {
  returnPath = p;
};
export const getReturnPath = () => returnPath;
