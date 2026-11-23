/**
 * Smart automatic backups (owner, 2026-11-22).
 *
 * Rules the owner asked for:
 *  • Daily and automatic — no one has to remember.
 *  • Never fills the device: at most ONE backup per day, only the last
 *    KEEP_DAYS days are kept (older ones are removed as new ones arrive), and
 *    a day with no changes makes no new copy at all (same content = skipped).
 *  • Reachable from the computer itself: an optional backup folder (picked
 *    once) gets one file per weekday — "STANLEY backup - Monday.json" … — each
 *    overwritten the next week, so the folder never holds more than 7 files.
 *    Any backup can also be downloaded from Settings.
 *  • Cloud copy: the cloud database is not connected yet. When it is, only the
 *    newest backup is sent — older copies are never queued, so nothing piles up.
 *
 * Backups live in the browser's IndexedDB (a separate, larger store than the
 * one the app's working data uses), so they don't eat into that space.
 * File format = the same as Settings → Data → "Create backup", so every
 * backup can be restored there too.
 */
import { collectData, HOUSEKEEPING, stanleyKeys, isReadable } from "./stores";
import { errorText, recordIncident } from "./health";

export const KEEP_DAYS = 7;
/** On a device short of space, keep fewer. */
const KEEP_DAYS_LOW_SPACE = 3;

export interface Snapshot {
  /** "2026-11-22" — one per day; "before-restore" is the single safety copy taken before a restore. */
  id: string;
  at: string;
  /** When this content was last confirmed unchanged (a skipped duplicate). */
  checkedAt: string;
  bytes: number;
  hash: string;
  keys: Record<string, string>;
  /** How it was made. */
  reason: "daily" | "manual" | "before-restore";
}
export type SnapshotInfo = Omit<Snapshot, "keys"> & { stores: number };

const DB = "stanley-recovery";
const SNAPS = "snapshots";
const META = "meta";

/* ─────────────── tiny IndexedDB helpers ─────────────── */

let dbPromise: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB is not available"));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(SNAPS)) d.createObjectStore(SNAPS, { keyPath: "id" });
      if (!d.objectStoreNames.contains(META)) d.createObjectStore(META);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("Backup storage is busy in another window"));
  });
  dbPromise.catch(() => (dbPromise = null));
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return db().then(
    (d) =>
      new Promise<T | undefined>((resolve, reject) => {
        const t = d.transaction(store, mode);
        const req = run(t.objectStore(store));
        t.oncomplete = () => resolve(req ? req.result : undefined);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error ?? new Error("Backup storage write was cancelled"));
      }),
  );
}

const allSnaps = () => tx<Snapshot[]>(SNAPS, "readonly", (s) => s.getAll()).then((r) => r ?? []);
const putSnap = (s: Snapshot) => tx(SNAPS, "readwrite", (st) => st.put(s));
const delSnap = (id: string) => tx(SNAPS, "readwrite", (st) => st.delete(id));
export const getMeta = <T>(k: string) => tx<T>(META, "readonly", (s) => s.get(k) as IDBRequest<T>);
export const setMeta = (k: string, v: unknown) => tx(META, "readwrite", (s) => s.put(v, k));

/* ─────────────── helpers ─────────────── */

const dayId = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

async function hashOf(text: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf).slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    // FNV-1a fallback (crypto.subtle needs a secure context).
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
    return `f${(h >>> 0).toString(16)}${text.length}`;
  }
}

/** Stable text for hashing: keys sorted. */
const canonical = (keys: Record<string, string>) => JSON.stringify(Object.keys(keys).sort().map((k) => [k, keys[k]]));

async function lowOnSpace(): Promise<boolean> {
  try {
    const e = await navigator.storage?.estimate?.();
    if (!e?.quota || e.usage == null) return false;
    return e.quota - e.usage < 200 * 1024 * 1024;
  } catch {
    return false;
  }
}

/** The file format shared with Settings → Data → Restore. */
export function backupFile(s: Pick<Snapshot, "at" | "keys">, company: string, by: string): string {
  return JSON.stringify({ app: "STANLEY", format: 1, createdAt: s.at, company, by, keys: s.keys }, null, 1);
}

/* ─────────────── public API ─────────────── */

export async function listBackups(): Promise<SnapshotInfo[]> {
  const list = await allSnaps();
  return list
    .map(({ keys, ...rest }) => ({ ...rest, stores: Object.keys(keys).length }))
    .sort((a, b) => (a.id === "before-restore" ? 1 : b.id === "before-restore" ? -1 : b.id.localeCompare(a.id)));
}

export async function getBackup(id: string): Promise<Snapshot | undefined> {
  return tx<Snapshot>(SNAPS, "readonly", (s) => s.get(id) as IDBRequest<Snapshot>);
}

export interface BackupResult {
  status: "created" | "replaced" | "unchanged" | "failed";
  snapshot?: SnapshotInfo;
  folder?: "written" | "needs-permission" | "none" | "failed" | "unsupported";
  removed: number;
  error?: string;
}

let running: Promise<BackupResult> | null = null;

/**
 * Make today's backup if needed. Safe to call often: unchanged data is never
 * copied again, and one day never holds more than one backup.
 */
export function runBackup(reason: "daily" | "manual" = "daily", meta: { company: string; by: string } = { company: "STANLEY", by: "Automatic backup" }): Promise<BackupResult> {
  if (running) return running;
  running = (async (): Promise<BackupResult> => {
    try {
      const keys = collectData();
      const text = canonical(keys);
      const hash = await hashOf(text);
      const now = new Date();
      const today = dayId(now);
      const snaps = (await allSnaps()).filter((s) => s.id !== "before-restore").sort((a, b) => b.id.localeCompare(a.id));
      const latest = snaps[0];
      let status: BackupResult["status"];
      let snap: Snapshot;
      if (latest && latest.hash === hash) {
        // Nothing changed since the last backup — just note that it was checked.
        snap = { ...latest, checkedAt: now.toISOString() };
        status = "unchanged";
      } else {
        snap = { id: today, at: now.toISOString(), checkedAt: now.toISOString(), bytes: text.length * 2, hash, keys, reason };
        status = latest?.id === today ? "replaced" : "created";
      }
      await putSnap(snap);
      // Rotate: keep only the newest days.
      const keep = (await lowOnSpace()) ? KEEP_DAYS_LOW_SPACE : KEEP_DAYS;
      const ids = Array.from(new Set([snap.id, ...snaps.map((s) => s.id)])).sort().reverse();
      const old = ids.slice(keep);
      for (const id of old) await delSnap(id);
      await setMeta("lastRun", now.toISOString());
      // Folder file: only when something changed, or the weekday file was never written.
      const folder = await writeToFolder(snap, meta, status !== "unchanged");
      const { keys: _k, ...info } = snap;
      return { status, snapshot: { ...info, stores: Object.keys(keys).length }, folder, removed: old.length };
    } catch (e) {
      recordIncident({ kind: "backup", title: "The automatic backup couldn't be made", detail: "STANLEY will try again later today. Your working data is not affected. If this keeps happening, run “Scan for errors”.", area: "Backups", fixed: false, technical: errorText(e) });
      return { status: "failed", removed: 0, error: e instanceof Error ? e.message : String(e) };
    } finally {
      running = null;
    }
  })();
  return running;
}

export const lastBackupRun = () => getMeta<string>("lastRun");

let scheduled = false;
/**
 * Start the daily schedule: first check shortly after opening (so start-up
 * stays fast), then every 30 minutes — a new day or new changes get a backup.
 */
export function scheduleDailyBackups(meta: () => { company: string; by: string }) {
  if (scheduled) return;
  scheduled = true;
  const tick = async () => {
    const last = await lastBackupRun().catch(() => undefined);
    const lastDay = last ? dayId(new Date(last)) : null;
    // New day → backup. Same day → refresh today's copy at most every 30 minutes if data changed.
    if (lastDay !== dayId() || Date.now() - new Date(last!).getTime() > 30 * 60_000) await runBackup("daily", meta());
  };
  window.setTimeout(() => void tick(), 15_000);
  window.setInterval(() => void tick(), 30 * 60_000);
}

/** Safety copy right before a restore (one slot, overwritten each time). */
export async function saveBeforeRestore() {
  const keys = collectData();
  const text = canonical(keys);
  const at = new Date().toISOString();
  await putSnap({ id: "before-restore", at, checkedAt: at, bytes: text.length * 2, hash: await hashOf(text), keys, reason: "before-restore" });
}

/**
 * Put a backup back on this device and reload. Housekeeping stores stay; the
 * audit log inside the backup gets a line saying what happened.
 */
export async function restoreBackup(id: string, who: { name: string; role: string }, reason: string) {
  const snap = await getBackup(id);
  if (!snap) throw new Error("That backup is no longer on this device.");
  if (id !== "before-restore") await saveBeforeRestore();
  const keysIn = { ...snap.keys };
  try {
    const log = JSON.parse(keysIn["stanley.audit.v1"] ?? "[]") as { id: string }[];
    const max = log.reduce((m, e) => Math.max(m, Number(String(e.id).replace(/\D/g, "")) || 0), 0);
    log.unshift({ id: `AUD-${String(max + 1).padStart(6, "0")}`, at: new Date().toISOString(), user: who.name, role: who.role, category: "System", action: "Data restored from automatic backup", record: `Backup of ${new Date(snap.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`, details: `Reason: ${reason} · ${Object.keys(keysIn).length} stores restored`, branchId: null } as never);
    keysIn["stanley.audit.v1"] = JSON.stringify(log);
  } catch {
    /* keep the backup's audit log as it is */
  }
  for (const k of stanleyKeys()) if (!HOUSEKEEPING.has(k)) window.localStorage.removeItem(k);
  for (const [k, v] of Object.entries(keysIn)) window.localStorage.setItem(k, v);
  window.location.reload();
}

/**
 * Newest backup copy of one store that is readable — used to repair a store
 * that can't be read. Returns null when no backup has a good copy.
 */
export async function goodCopyOf(key: string): Promise<{ value: string; at: string } | null> {
  const snaps = (await allSnaps()).sort((a, b) => b.at.localeCompare(a.at));
  for (const s of snaps) {
    const v = s.keys[key];
    if (v != null && isReadable(key, v)) return { value: v, at: s.at };
  }
  return null;
}

/** Keep an unreadable store aside (one slot per store) so a developer can still recover it. */
export async function quarantine(key: string, raw: string) {
  await setMeta(`quarantine:${key}`, { at: new Date().toISOString(), raw });
}

/** Total size of all backups kept on this device. */
export async function backupsSize(): Promise<number> {
  const list = await allSnaps();
  return list.reduce((s, x) => s + x.bytes, 0);
}

/* ─────────────── Backup folder on the computer ─────────────── */

type PermState = "granted" | "denied" | "prompt";
interface DirHandle {
  name: string;
  queryPermission?: (o: { mode: "readwrite" }) => Promise<PermState>;
  requestPermission?: (o: { mode: "readwrite" }) => Promise<PermState>;
  getFileHandle: (name: string, o: { create: boolean }) => Promise<{ createWritable: () => Promise<{ write: (d: string) => Promise<void>; close: () => Promise<void> }> }>;
}

export type FolderStatus = { state: "unsupported" } | { state: "none" } | { state: "needs-permission"; name: string } | { state: "ready"; name: string; lastWritten?: string; lastFile?: string };

export const folderSupported = () => typeof window !== "undefined" && "showDirectoryPicker" in window;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const folderFileName = (d: Date) => `STANLEY backup - ${WEEKDAYS[d.getDay()]}.json`;

export async function folderStatus(): Promise<FolderStatus> {
  if (!folderSupported()) return { state: "unsupported" };
  const h = await getMeta<DirHandle>("folder").catch(() => undefined);
  if (!h) return { state: "none" };
  const perm = (await h.queryPermission?.({ mode: "readwrite" }).catch(() => "prompt" as PermState)) ?? "prompt";
  if (perm !== "granted") return { state: "needs-permission", name: h.name };
  const info = await getMeta<{ at: string; file: string }>("folderWritten").catch(() => undefined);
  return { state: "ready", name: h.name, lastWritten: info?.at, lastFile: info?.file };
}

/** Pick the folder (must be called from a click). */
export async function chooseBackupFolder(): Promise<string | null> {
  const picker = (window as unknown as { showDirectoryPicker: (o: { mode: "readwrite"; id?: string }) => Promise<DirHandle> }).showDirectoryPicker;
  try {
    const h = await picker({ mode: "readwrite", id: "stanley-backups" });
    await setMeta("folder", h);
    return h.name;
  } catch {
    return null; // cancelled
  }
}

/** Browsers ask again after a restart — a click on "Allow" grants it. */
export async function allowBackupFolder(): Promise<boolean> {
  const h = await getMeta<DirHandle>("folder").catch(() => undefined);
  if (!h?.requestPermission) return false;
  return (await h.requestPermission({ mode: "readwrite" }).catch(() => "denied")) === "granted";
}

export async function forgetBackupFolder() {
  await setMeta("folder", undefined);
  await setMeta("folderWritten", undefined);
}

async function writeToFolder(snap: Snapshot, meta: { company: string; by: string }, changed: boolean): Promise<BackupResult["folder"]> {
  if (!folderSupported()) return "unsupported";
  const h = await getMeta<DirHandle>("folder").catch(() => undefined);
  if (!h) return "none";
  const perm = (await h.queryPermission?.({ mode: "readwrite" }).catch(() => "prompt" as PermState)) ?? "prompt";
  if (perm !== "granted") return "needs-permission";
  const now = new Date();
  const file = folderFileName(now);
  const prev = await getMeta<{ at: string; file: string }>("folderWritten").catch(() => undefined);
  if (!changed && prev && dayId(new Date(prev.at)) === dayId(now)) return "written";
  try {
    const fh = await h.getFileHandle(file, { create: true });
    const w = await fh.createWritable();
    await w.write(backupFile(snap, meta.company, meta.by));
    await w.close();
    await setMeta("folderWritten", { at: now.toISOString(), file });
    return "written";
  } catch (e) {
    recordIncident({ kind: "backup", title: "The backup file couldn't be written to the backup folder", detail: "The backup is still kept inside STANLEY. Check that the folder still exists (or the flash drive is plugged in), then choose it again in Settings → System health.", area: "Backups", fixed: false, technical: errorText(e) });
    return "failed";
  }
}
