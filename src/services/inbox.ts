/**
 * Inbox (owner, 2026-11-26): the desktop's messages, the same conversations
 * and the same chat rules as the mobile app's inbox.
 *
 *  • Company Admin: each branch's front desk (one shared inbox per branch,
 *    answered by whoever is on duty), each Branch Manager, and the PR agents.
 *  • Branch Manager: the Company Admin, the branch's front desk and the
 *    branch's PR agents. Front Desk: the Company Admin, the Branch Manager and
 *    the PR agents.
 *
 * A conversation belongs to its two sides (parties), so both see the same
 * thread: "admin", "mgr:<branch>", "fd:<branch>", "pr:<agent id>".
 * Messages can be text, photos, videos, documents and voice notes, can reply
 * to another message, and can be deleted. Text and details are saved on this
 * computer (localStorage); files and voice notes in its file store
 * (IndexedDB, which can hold them). Everything is queued for the cloud, which
 * carries it to the other person's app once it is connected; until then each
 * conversation starts with a short sample. Chats with PR agents are about
 * referrals and logistics only (the Referrer Portal never carries money).
 */
import { useEffect, useState, useSyncExternalStore } from "react";

export type Party = string;
export type ChatKind = "admin" | "manager" | "frontdesk" | "agent";
export type MsgKind = "text" | "image" | "video" | "file" | "audio";

export interface ReplyRef {
  id: string;
  by: Party;
  name: string;
  preview: string;
  kind: MsgKind;
}
export interface ChatMessage {
  id: string;
  by: Party;
  name: string;
  /** Text, or the caption of a photo / video / file. */
  text: string;
  at: string;
  kind?: MsgKind;
  fileName?: string;
  mime?: string;
  size?: number;
  /** Seconds (voice notes). */
  duration?: number;
  replyTo?: ReplyRef;
  /** Deleted messages stay as "This message was deleted". */
  deleted?: boolean;
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

/* ─────────────── files and voice notes (IndexedDB) ─────────────── */

const DB = "stanley-inbox-files";
let dbp: Promise<IDBDatabase> | null = null;
function db() {
  if (!dbp)
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore("files");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  return dbp;
}
async function putFile(id: string, blob: Blob) {
  const d = await db();
  await new Promise<void>((res, rej) => {
    const t = d.transaction("files", "readwrite");
    t.objectStore("files").put(blob, id);
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
}
export async function getFile(id: string): Promise<Blob | null> {
  try {
    const d = await db();
    return await new Promise((res) => {
      const r = d.transaction("files").objectStore("files").get(id);
      r.onsuccess = () => res((r.result as Blob | undefined) ?? null);
      r.onerror = () => res(null);
    });
  } catch {
    return null;
  }
}
async function dropFile(id: string) {
  try {
    const d = await db();
    d.transaction("files", "readwrite").objectStore("files").delete(id);
  } catch {
    /* nothing to remove */
  }
}
/** A temporary address for a message's file (photo, video, document, voice note). */
export function useFileUrl(id: string, has: boolean) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!has) return;
    let u: string | null = null;
    let live = true;
    void getFile(id).then((b) => {
      if (!b || !live) return;
      u = URL.createObjectURL(b);
      setUrl(u);
    });
    return () => {
      live = false;
      if (u) URL.revokeObjectURL(u);
    };
  }, [id, has]);
  return url;
}

/* ─────────────── threads ─────────────── */

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

export interface Outgoing {
  kind: MsgKind;
  text: string;
  blob?: Blob;
  fileName?: string;
  mime?: string;
  size?: number;
  duration?: number;
  replyTo?: ReplyRef;
}

/** Send a message (and save its file first, so it is never lost). */
export async function sendMessage(t: ChatThread, me: Party, name: string, out: Outgoing) {
  const id = `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  if (out.blob) await putFile(id, out.blob);
  const msg: ChatMessage = { id, by: me, name, text: out.text, at: new Date().toISOString(), kind: out.kind, fileName: out.fileName, mime: out.mime, size: out.size, duration: out.duration, replyTo: out.replyTo };
  const cur = state[t.id] ?? t;
  commit({ ...state, [t.id]: { ...cur, messages: [...cur.messages, msg], readBy: { ...cur.readBy, [me]: msg.at } } });
}
export function deleteMessage(t: ChatThread, id: string) {
  const cur = state[t.id] ?? t;
  void dropFile(id);
  commit({ ...state, [t.id]: { ...cur, messages: cur.messages.map((m) => (m.id === id ? { ...m, deleted: true, text: "", fileName: undefined } : m)) } });
}
export function markRead(t: ChatThread, me: Party) {
  const last = t.messages[t.messages.length - 1];
  const seen = t.readBy[me];
  if (!last || (seen && seen >= last.at)) return;
  const cur = state[t.id] ?? t;
  commit({ ...state, [t.id]: { ...cur, readBy: { ...cur.readBy, [me]: new Date().toISOString() } } });
}
export const unreadIn = (t: ChatThread, me: Party) => t.messages.filter((m) => m.by !== me && (!t.readBy[me] || m.at > t.readBy[me]!)).length;

/** One line for a message (list preview, reply quote). */
export function previewOf(m: Pick<ChatMessage, "kind" | "text" | "fileName" | "deleted" | "duration">): string {
  if (m.deleted) return "This message was deleted";
  const k = m.kind ?? "text";
  if (k === "image") return `📷 Photo${m.text ? `: ${m.text}` : ""}`;
  if (k === "video") return `🎬 Video${m.text ? `: ${m.text}` : ""}`;
  if (k === "file") return `📄 ${m.fileName ?? "Document"}`;
  if (k === "audio") return `🎤 Voice note${m.duration ? ` (${Math.floor(m.duration / 60)}:${String(m.duration % 60).padStart(2, "0")})` : ""}`;
  return m.text;
}
