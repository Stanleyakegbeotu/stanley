/**
 * Inbox (owner, 2026-11-26): the desktop's messages, the same conversations
 * as the mobile app's inbox.
 *
 *  • Company Admin: each branch's front desk (one shared inbox per branch,
 *    answered by whoever is on duty), each Branch Manager, and the PR agents.
 *  • Branch Manager: the Company Admin, the branch's front desk and the
 *    branch's PR agents. Front Desk: the Company Admin, the Branch Manager and
 *    the PR agents.
 *
 * A conversation belongs to its two sides (parties), so both see the same
 * thread: "admin", "mgr:<branch>", "fd:<branch>", "pr:<agent id>". Chats with
 * PR agents are about referrals and logistics only (the Referrer Portal never
 * carries money). Messages are saved on this computer and queued for the
 * cloud, which carries them to the other person's app once it is connected;
 * until then each conversation starts with a short sample.
 */
import { useSyncExternalStore } from "react";

export type Party = string;
export type ChatKind = "admin" | "manager" | "frontdesk" | "agent";
export interface ChatMessage {
  id: string;
  by: Party;
  name: string;
  text: string;
  at: string;
}
export interface ChatThread {
  id: string;
  messages: ChatMessage[];
  /** When each side last read the conversation. */
  readBy: Record<Party, string>;
}

const KEY = "stanley.inbox.v2";
const listeners = new Set<() => void>();
let state: Record<string, ChatThread> = load();
function load(): Record<string, ChatThread> {
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Record<string, ChatThread>;
  } catch {
    return {};
  }
}
function commit(next: Record<string, ChatThread>) {
  state = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage full: this session only */
  }
  listeners.forEach((l) => l());
}
if (typeof window !== "undefined")
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) {
      state = load();
      listeners.forEach((l) => l());
    }
  });

export function useInboxStore(): Record<string, ChatThread> {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

/** One id per pair of sides, whichever side opens it. */
export const threadId = (a: Party, b: Party) => [a, b].sort().join("~");

const ago = (n: number) => new Date(Date.now() - n * 60_000).toISOString();
/** A short sample so a conversation is not empty (the real history comes with the cloud connection). */
function sample(me: Party, them: Party, meName: string, themName: string, kind: ChatKind): ChatMessage[] {
  const m = (who: "me" | "them", text: string, minutes: number): ChatMessage => ({ id: `s-${minutes}-${who}`, by: who === "me" ? me : them, name: who === "me" ? meName : themName, text, at: ago(minutes) });
  if (kind === "agent")
    return [m("them", "Good morning. I just sent a referral for a patient coming in this afternoon for a scan. Please look out for her.", 190), m("me", "Good morning. Noted, we will attend to her as soon as she arrives.", 175), m("them", "Thank you. She may come with her daughter.", 160)];
  if (kind === "frontdesk") return [m("them", "Good morning. The POS terminal is working again after the restart.", 240), m("me", "Thanks for the update.", 232)];
  if (kind === "manager") return [m("them", "The weekly expenses are ready for your approval.", 300), m("me", "I will look at them this afternoon.", 285)];
  return [m("them", "Please remind the team that the monthly report is due on Friday.", 420), m("me", "Noted. It will be ready.", 400)];
}

/** The thread between two sides (a sample until something is sent). The sample counts as read. */
export function threadOf(store: Record<string, ChatThread>, me: Party, them: Party, meName: string, themName: string, kind: ChatKind): ChatThread {
  const id = threadId(me, them);
  const now = new Date().toISOString();
  return store[id] ?? { id, messages: sample(me, them, meName, themName, kind), readBy: kind === "agent" ? {} : { [me]: now, [them]: now } };
}

export function sendMessage(t: ChatThread, me: Party, name: string, text: string) {
  const msg: ChatMessage = { id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, by: me, name, text, at: new Date().toISOString() };
  commit({ ...state, [t.id]: { ...t, messages: [...t.messages, msg], readBy: { ...t.readBy, [me]: msg.at } } });
}
export function markRead(t: ChatThread, me: Party) {
  const last = t.messages[t.messages.length - 1];
  const seen = t.readBy[me];
  if (!last || (seen && seen >= last.at)) return;
  commit({ ...state, [t.id]: { ...t, readBy: { ...t.readBy, [me]: new Date().toISOString() } } });
}
export const unreadIn = (t: ChatThread, me: Party) => t.messages.filter((m) => m.by !== me && (!t.readBy[me] || m.at > t.readBy[me]!)).length;
