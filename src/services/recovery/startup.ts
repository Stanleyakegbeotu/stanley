/**
 * Start-up check — runs BEFORE the app loads its data (main.tsx waits for it).
 *
 * Why before: every store reads its saved copy once when the app opens. If a
 * saved copy is damaged (e.g. the power went off mid-save), that store would
 * start empty and the next save would write over the damaged copy — data lost
 * for good. So first:
 *
 *  1. Start the watchers (failed saves, background errors, slow moments).
 *  2. Notice an unexpected shutdown (power cut / forced close) and a clock that
 *     went backwards.
 *  3. Check every saved store can be read. A damaged one is set aside (kept for
 *     the developer) and repaired from the newest backup that has a good copy;
 *     if no backup has one, that one area starts empty — and people are told
 *     exactly which area, in plain words.
 *
 * Never blocks start-up for long: the backup lookups give up after a few seconds.
 */
import { goodCopyOf, quarantine } from "./backups";
import { installWatchers, recordIncident, startSessionTracking, type ClockJump, type ShutdownInfo } from "./health";
import { isReadable, readKey, stanleyKeys, STORES, storeLabel } from "./stores";

export interface Repair {
  key: string;
  label: string;
  pages: string;
  /** restored = repaired from a backup; cleared = no good backup, area starts empty. */
  outcome: "restored" | "cleared";
  backupAt?: string;
}

export interface StartupReport {
  shutdown: ShutdownInfo | null;
  clock: ClockJump | null;
  repairs: Repair[];
  checked: number;
  /** The check itself couldn't finish (e.g. storage blocked). */
  storageBlocked: boolean;
}

let report: StartupReport = { shutdown: null, clock: null, repairs: [], checked: 0, storageBlocked: false };
export const startupReport = () => report;

const withTimeout = <T,>(p: Promise<T>, ms: number, fallback: T) => Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);

export async function runStartupChecks(): Promise<StartupReport> {
  installWatchers();
  let storageBlocked = false;
  try {
    window.localStorage.getItem("stanley.theme");
  } catch {
    storageBlocked = true;
  }
  const { shutdown, clock } = storageBlocked ? { shutdown: null, clock: null } : startSessionTracking();
  const repairs: Repair[] = [];
  const keys = stanleyKeys();

  for (const key of keys) {
    const raw = readKey(key);
    if (isReadable(key, raw) || raw == null) continue;
    const info = STORES[key];
    await withTimeout(quarantine(key, raw).catch(() => undefined), 2000, undefined);
    const good = await withTimeout(goodCopyOf(key).catch(() => null), 3000, null);
    try {
      if (good) window.localStorage.setItem(key, good.value);
      else window.localStorage.removeItem(key);
    } catch {
      /* storage full — the store will start from its default for this session */
    }
    const repair: Repair = { key, label: storeLabel(key), pages: info?.pages ?? "part of the app", outcome: good ? "restored" : "cleared", backupAt: good?.at };
    repairs.push(repair);
    recordIncident({
      kind: "data",
      title: good ? `${repair.label} couldn't be read — repaired from a backup` : `${repair.label} couldn't be read — set aside`,
      detail: good
        ? `The saved copy was damaged (often a power cut during saving). STANLEY put back the copy from the backup of ${new Date(good.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}. Anything entered after that time in ${repair.pages} may need to be entered again.`
        : `The saved copy was damaged and no backup had a good copy yet. ${repair.pages} start empty; the damaged copy is kept safely so your developer can try to recover it. Everything else works normally.`,
      area: repair.label,
      fixed: !!good,
      technical: `Store ${key}: unreadable JSON or wrong shape (expected ${info?.shape ?? "JSON"}), ${raw.length} chars. Quarantined in IndexedDB stanley-recovery/meta "quarantine:${key}".`,
    });
  }

  report = { shutdown, clock, repairs, checked: keys.length, storageBlocked };
  return report;
}
