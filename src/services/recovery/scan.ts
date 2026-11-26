/**
 * "Scan for errors" (owner, 2026-11-22) — one engine used by Settings →
 * System health and by Report an issue (which scans just the area a person
 * complains about).
 *
 * Each check answers in plain words and ends in one of:
 *  • ok        — all good
 *  • fixed     — STANLEY fixed it by itself (and says what it did)
 *  • action    — something the person can do (restart, fix the clock, allow the backup folder…)
 *  • developer — needs the developer (code or data repair STANLEY must not guess at)
 *  • info      — worth knowing, nothing wrong
 *
 * Self-fixes are only ever safe ones: repairing unreadable data from a backup,
 * releasing patient IDs held by bills that no longer exist, clearing trash past
 * its 30-day retention, asking the browser to protect STANLEY's storage, making
 * an overdue backup. Nothing a person entered is ever deleted.
 */
import { billingState, releasePatientId } from "@/services/billing";
import { canOpenBranchPage } from "@/shell/navigation";
import { ACTIVE_BRANCHES } from "@/data/company";
import { explainError } from "./explain";
import { folderStatus, goodCopyOf, lastBackupRun, quarantine, runBackup } from "./backups";
import { errorText, healthState, lastSeenClock, liveSignals, markIncidentsFixed, otherOpenTabs, recordIncident, routeArea } from "./health";
import { isReadable, kb, LOCAL_LIMIT, localUsed, readKey, stanleyKeys, STORES, storeLabel } from "./stores";

export type CheckStatus = "ok" | "fixed" | "action" | "developer" | "info";
export type CheckAction = "restart" | "backup-folder" | "allow-folder" | "download-backup" | "open-page" | "contact";

export interface CheckResult {
  id: string;
  /** Short name of what was checked. */
  name: string;
  status: CheckStatus;
  /** Plain-words finding. */
  message: string;
  /** Where it shows in the app. */
  where?: string;
  /** What to do, in order. */
  steps?: string[];
  action?: { kind: CheckAction; label: string; to?: string };
  technical?: string;
  /**
   * page = about the page the person asked about; device = about this computer
   * or the whole app (clock, storage, speed…). A page complaint is judged on
   * page results only; device results are shown apart, labelled as such.
   */
  scope?: "page" | "device";
}

export interface ScanContext {
  user: { name: string; role: string; kind: "admin" | "manager" | "staff" };
  branchId?: string;
  /** Focus on one page ("billing", "records"…) — Report an issue uses this. */
  focus?: string;
  /** Called as each check starts, for the progress bar. */
  onStep?: (label: string, done: number, total: number) => void;
  /** Opens a hidden test copy of a page (services/assistant/probe.ts). */
  probe?: (path: string) => Promise<import("@/services/assistant/probe").ProbeResult>;
}

export interface ScanReport {
  at: string;
  results: CheckResult[];
  /** Worst status found. */
  verdict: CheckStatus;
  /** Focused scans: worst status among the computer-wide results (shown apart). */
  deviceVerdict?: CheckStatus;
  durationMs: number;
  focus?: string;
}

const RANK: Record<CheckStatus, number> = { ok: 0, info: 0, fixed: 1, action: 2, developer: 3 };

/* Which stores each page depends on — so a page complaint checks the right data. */
const PAGE_STORES: Record<string, string[]> = {
  billing: ["stanley.billing.v1", "stanley.config.v1", "stanley.receipt.v1", "stanley.staff.v1"],
  drafts: ["stanley.billing.v1"],
  records: ["stanley.billing.v1"],
  patients: ["stanley.billing.v1"],
  expenses: ["stanley.expenses.v1", "stanley.staff.v1"],
  staff: ["stanley.staff.v1"],
  settings: ["stanley.settings.v1", "stanley.config.v1", "stanley.permissions.v1", "stanley.org.v1"],
  branches: ["stanley.org.v1"],
  audit: ["stanley.audit.v1"],
  trash: ["stanley.trash.v1"],
  inventory: ["stanley.config.v1"],
  reports: ["stanley.billing.v1", "stanley.expenses.v1", "stanley.permissions.v1"],
  analysis: ["stanley.billing.v1"],
  dashboard: ["stanley.billing.v1", "stanley.expenses.v1", "stanley.config.v1"],
  finance: ["stanley.expenses.v1", "stanley.billing.v1"],
  pr: ["stanley.config.v1"],
};

const dt = (d: string | number | Date) => new Date(d).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

/* ─────────────── checks ─────────────── */

async function checkData(focus?: string): Promise<CheckResult> {
  const keys = focus ? (PAGE_STORES[focus] ?? []).filter((k) => readKey(k) != null) : stanleyKeys();
  const bad = keys.filter((k) => !isReadable(k, readKey(k)));
  const scope = focus ? `${routeArea(focus)} page data` : "Saved data";
  if (!bad.length) return { id: "data", name: scope, status: "ok", message: `All ${keys.length || "the"} saved store${keys.length === 1 ? "" : "s"}${focus ? ` this page uses` : ""} can be read correctly.` };
  const repaired: string[] = [];
  const lost: string[] = [];
  for (const k of bad) {
    const raw = readKey(k) ?? "";
    await quarantine(k, raw).catch(() => undefined);
    const good = await goodCopyOf(k).catch(() => null);
    try {
      if (good) {
        window.localStorage.setItem(k, good.value);
        repaired.push(`${storeLabel(k)} (from the backup of ${dt(good.at)})`);
      } else lost.push(storeLabel(k));
    } catch {
      lost.push(storeLabel(k));
    }
  }
  recordIncident({ kind: "data", title: "Unreadable saved data found by a scan", detail: [repaired.length ? `Repaired: ${repaired.join(", ")}.` : "", lost.length ? `No good backup yet for: ${lost.join(", ")}.` : ""].join(" "), area: scope, fixed: !lost.length, technical: `Unreadable keys: ${bad.join(", ")}` });
  if (lost.length)
    return {
      id: "data",
      name: scope,
      status: "developer",
      message: `Some saved information can't be read: ${lost.join(", ")}. ${repaired.length ? `Repaired from backups: ${repaired.join(", ")}. ` : ""}The damaged copy is kept safely.`,
      where: bad.map((k) => STORES[k]?.pages ?? k).join(" · "),
      steps: ["Keep working — other parts of STANLEY are fine.", "Send the scan report to your developer so they can recover the damaged copy."],
      action: { kind: "contact", label: "Contact developer" },
      technical: `Unreadable keys: ${bad.join(", ")} (quarantined in IndexedDB)`,
    };
  return {
    id: "data",
    name: scope,
    status: "action",
    message: `Fixed: ${repaired.join(", ")} couldn't be read, so STANLEY put back a good copy from a backup. Restart STANLEY so the pages load the repaired copy.`,
    where: bad.map((k) => STORES[k]?.pages ?? k).join(" · "),
    steps: ["Press “Restart STANLEY”.", "Check the most recent entries in that area — anything entered after the backup time may need entering again."],
    action: { kind: "restart", label: "Restart STANLEY" },
  };
}

function checkRecords(): CheckResult {
  const s = billingState();
  const dup = (list: string[]) => list.filter((v, i) => list.indexOf(v) !== i);
  const dupBills = dup(s.orders.map((o) => o.invoiceNo));
  const dupPatients = dup(s.patients.map((p) => `${p.branchId}|${p.patientId}`));
  const broken = s.orders.filter((o) => !o.invoiceNo || !Array.isArray(o.services)).length + s.drafts.filter((d) => !d.id || !d.patient).length;
  if (!dupBills.length && !dupPatients.length && !broken)
    return { id: "records", name: "Bills & patient records", status: "ok", message: `${s.orders.length} saved bill${s.orders.length === 1 ? "" : "s"}, ${s.patients.length} patient${s.patients.length === 1 ? "" : "s"} and ${s.drafts.length} draft${s.drafts.length === 1 ? "" : "s"} checked — no duplicates or broken records.` };
  return {
    id: "records",
    name: "Bills & patient records",
    status: "developer",
    message: [dupBills.length ? `${dupBills.length} invoice number${dupBills.length === 1 ? " is" : "s are"} used twice` : "", dupPatients.length ? `${dupPatients.length} Patient ID${dupPatients.length === 1 ? " is" : "s are"} used twice` : "", broken ? `${broken} record${broken === 1 ? " is" : "s are"} incomplete` : ""].filter(Boolean).join(", ") + ". STANLEY doesn't change bills or patients by itself (they are financial records), so nothing was touched.",
    where: "Billing, Records and receipts",
    steps: ["Keep working — new bills get new numbers.", "Send the scan report to your developer to correct the duplicates."],
    action: { kind: "contact", label: "Contact developer" },
    technical: `Duplicate invoices: ${dupBills.slice(0, 10).join(", ")} · duplicate patients: ${dupPatients.slice(0, 10).join(", ")} · incomplete: ${broken}`,
  };
}

function checkReservations(): CheckResult {
  const s = billingState();
  const live = new Set(s.drafts.map((d) => d.id));
  const old = Object.entries(s.reservations).filter(([, session]) => !live.has(session));
  if (old.length && otherOpenTabs() > 0)
    // A bill being typed in another STANLEY window may not be a draft yet — never take its number.
    return { id: "ids", name: "Patient ID numbers", status: "info", message: `${old.length} Patient ID${old.length === 1 ? " is" : "s are"} held by bills that aren't saved as drafts. Another STANLEY window is open, so they were left alone in case a bill is being typed there. Close other STANLEY windows and scan again to release them.` };
  if (!old.length) return { id: "ids", name: "Patient ID numbers", status: "ok", message: "No Patient IDs are stuck on bills that were never finished." };
  for (const [id] of old) releasePatientId(id);
  return { id: "ids", name: "Patient ID numbers", status: "fixed", message: `Released ${old.length} Patient ID${old.length === 1 ? "" : "s"} held by bills that were closed without saving (for example by a power cut). They can be given to new patients again.`, where: "Billing", technical: old.map(([id, s2]) => `${id}←${s2}`).join(", ") };
}

function checkTrash(): CheckResult {
  const raw = readKey("stanley.trash.v1");
  if (!raw) return { id: "trash", name: "Trash", status: "ok", message: "Trash is empty." };
  try {
    const list = JSON.parse(raw) as { deletedAt: string }[];
    const cutoff = Date.now() - 30 * 86_400_000;
    const keep = list.filter((t) => new Date(t.deletedAt).getTime() >= cutoff);
    if (keep.length === list.length) return { id: "trash", name: "Trash", status: "ok", message: `${list.length} item${list.length === 1 ? "" : "s"} in Trash, all within the 30-day recovery window.` };
    window.localStorage.setItem("stanley.trash.v1", JSON.stringify(keep));
    return { id: "trash", name: "Trash", status: "fixed", message: `Cleared ${list.length - keep.length} item${list.length - keep.length === 1 ? "" : "s"} older than 30 days from Trash (the stated Trash policy), freeing space.`, where: "Trash" };
  } catch {
    return { id: "trash", name: "Trash", status: "ok", message: "Trash is checked with saved data above." };
  }
}

async function checkSpace(): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  const used = localUsed();
  const pct = Math.round((used / LOCAL_LIMIT) * 100);
  if (pct < 70) out.push({ id: "space", name: "STANLEY's storage space", status: "ok", message: `${kb(used)} used of about ${kb(LOCAL_LIMIT)} (${pct}%). Plenty of room.` });
  else
    out.push({
      id: "space",
      name: "STANLEY's storage space",
      status: pct >= 90 ? "developer" : "action",
      message: `${kb(used)} used of about ${kb(LOCAL_LIMIT)} (${pct}%). ${pct >= 90 ? "It is nearly full — new saves may soon fail." : "It is filling up."} Records can't be deleted to make room (they are business records).`,
      where: "Every page that saves",
      steps: ["Download a backup now.", "Contact your developer — the records need to move to the cloud database, which removes this limit."],
      action: { kind: "download-backup", label: "Download backup" },
    });
  try {
    const e = await navigator.storage?.estimate?.();
    if (e?.quota && e.usage != null) {
      const free = e.quota - e.usage;
      out.push(
        free < 300 * 1024 * 1024
          ? { id: "disk", name: "Computer storage", status: "action", message: `The browser has only ${kb(free)} left to give STANLEY — the computer's disk is nearly full.`, steps: ["Empty the Recycle Bin.", "Delete old files from Downloads (keep your STANLEY backup files).", "Uninstall programs you don't use.", "Then run the scan again."] }
          : { id: "disk", name: "Computer storage", status: "ok", message: `Enough free space on this computer (${kb(free)} available to STANLEY).` },
      );
    }
    if (navigator.storage?.persisted) {
      const persisted = await navigator.storage.persisted();
      if (persisted) out.push({ id: "persist", name: "Storage protection", status: "ok", message: "The browser has agreed never to clear STANLEY's data on its own." });
      else {
        const granted = await navigator.storage.persist?.().catch(() => false);
        out.push(
          granted
            ? { id: "persist", name: "Storage protection", status: "fixed", message: "Turned on: the browser will no longer clear STANLEY's data on its own when the computer is low on space." }
            : { id: "persist", name: "Storage protection", status: "info", message: "The browser didn't agree to protect STANLEY's data from automatic clean-up. It usually agrees once STANLEY is installed as an app or used often. Daily backups cover this.", steps: ["Never use “Clear browsing data” with “Cookies and site data” ticked on this computer."] },
        );
      }
    }
  } catch {
    /* estimate not supported */
  }
  return out;
}

async function checkBackups(ctx: ScanContext): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  const last = await lastBackupRun().catch(() => undefined);
  const age = last ? Date.now() - new Date(last).getTime() : Infinity;
  if (age > 26 * 3_600_000) {
    const r = await runBackup("daily", { company: "STANLEY", by: ctx.user.name });
    out.push(
      r.status === "failed"
        ? { id: "backup", name: "Automatic backup", status: "developer", message: "The daily backup couldn't be made on this computer.", steps: ["Restart STANLEY and run the scan again.", "If it still fails, contact your developer."], technical: r.error, action: { kind: "restart", label: "Restart STANLEY" } }
        : { id: "backup", name: "Automatic backup", status: "fixed", message: last ? `The last backup was ${dt(last)} — overdue, so a fresh one was made now.` : "No backup existed yet, so the first one was made now. From now on one is made every day automatically." },
    );
  } else out.push({ id: "backup", name: "Automatic backup", status: "ok", message: `Backed up ${dt(last!)}. A new backup is made every day automatically; only the last 7 days are kept.` });
  const f = await folderStatus().catch(() => ({ state: "unsupported" as const }));
  const canManage = ctx.user.kind === "admin";
  if (f.state === "needs-permission")
    out.push({ id: "folder", name: "Backup folder", status: "action", message: `The browser needs your OK again to keep saving daily backup files into “${f.name}” (it asks after a restart).`, steps: ["Press “Allow backup folder”, then choose “Allow” in the browser's box."], action: canManage ? { kind: "allow-folder", label: "Allow backup folder" } : undefined });
  else if (f.state === "none" && canManage)
    out.push({ id: "folder", name: "Backup folder", status: "info", message: "No backup folder is chosen. Choosing one (for example a flash drive or a synced cloud folder such as Google Drive or OneDrive) puts a backup file there every day — seven files at most, one per weekday.", action: { kind: "backup-folder", label: "Choose backup folder" } });
  else if (f.state === "ready") out.push({ id: "folder", name: "Backup folder", status: "ok", message: `Daily backup files go to “${f.name}”${f.lastWritten ? ` — last written ${dt(f.lastWritten)} (${f.lastFile})` : ""}.` });
  return out;
}

function checkClock(): CheckResult {
  const now = new Date();
  const problems: string[] = [];
  if (now.getFullYear() < 2026) problems.push(`the year shows ${now.getFullYear()}`);
  const seen = lastSeenClock();
  if (seen && now.getTime() < seen - 10 * 60_000) problems.push(`it is behind a time STANLEY already saw (${dt(seen)})`);
  // Records saved "in the future" mean the clock was ahead earlier, or is behind now.
  try {
    const audit = JSON.parse(readKey("stanley.audit.v1") ?? "[]") as { at: string }[];
    const newest = audit.reduce((m, e) => Math.max(m, new Date(e.at).getTime() || 0), 0);
    if (newest > now.getTime() + 10 * 60_000) problems.push(`records exist dated ${dt(newest)}, later than now`);
  } catch {
    /* audit checked with saved data */
  }
  const offset = -now.getTimezoneOffset() / 60;
  if (problems.length)
    return {
      id: "clock",
      name: "Date & time",
      status: "action",
      message: `This computer's date or time looks wrong: ${problems.join("; ")}. Bills, receipts and reports would get the wrong date.`,
      where: "Billing dates, receipts, reports, daily backups",
      steps: ["Open Windows Settings → Time & language → Date & time.", "Turn on “Set time automatically” and “Set time zone automatically” (or choose “(UTC+01:00) West Central Africa”).", "Press “Sync now”, then restart STANLEY."],
      action: { kind: "restart", label: "Restart STANLEY" },
    };
  if (offset !== 1)
    return { id: "clock", name: "Date & time", status: "action", message: `The time zone is set to UTC${offset >= 0 ? "+" : ""}${offset}, not Nigeria's West Africa Time (UTC+1). Times on bills and reports will be off by ${Math.abs(offset - 1)} hour${Math.abs(offset - 1) === 1 ? "" : "s"}.`, steps: ["Windows Settings → Time & language → Date & time → Time zone: “(UTC+01:00) West Central Africa”.", "Restart STANLEY."] };
  return { id: "clock", name: "Date & time", status: "ok", message: `The clock looks right (${dt(now)}, West Africa Time).` };
}

function checkSaves(): CheckResult {
  const f = liveSignals().saveFailed;
  if (!f) return { id: "saves", name: "Saving", status: "ok", message: "Every change this session was saved to this computer." };
  return f.reason === "full"
    ? { id: "saves", name: "Saving", status: "developer", message: `A change couldn't be saved at ${dt(f.at)} because STANLEY's storage is full (${storeLabel(f.key)}).`, where: STORES[f.key]?.pages, steps: ["Don't close STANLEY yet — download a backup first.", "Contact your developer."], action: { kind: "download-backup", label: "Download backup" } }
    : { id: "saves", name: "Saving", status: "action", message: "The browser is blocking STANLEY from saving (a private/incognito window, or site storage turned off). Changes will be lost when the window closes.", steps: ["Close this window and open STANLEY in a normal (not private) window.", "If it's a normal window: browser settings → Privacy → Site data → allow this site."] };
}

function checkIncidents(focus?: string): CheckResult {
  const week = Date.now() - 7 * 86_400_000;
  const area = focus ? routeArea(focus) : null;
  const list = healthState().incidents.filter((i) => new Date(i.at).getTime() > week && !i.fixed && (!area || i.area === area));
  const crashes = list.filter((i) => i.kind === "crash");
  if (!list.length) return { id: "incidents", name: area ? `Recent problems on ${area}` : "Recent problems", status: "ok", message: area ? `No problems recorded on ${area} in the last 7 days.` : "No unresolved problems in the last 7 days." };
  const byArea = new Map<string, number>();
  for (const c of crashes) byArea.set(c.area, (byArea.get(c.area) ?? 0) + 1);
  const repeated = [...byArea].filter(([, n]) => n >= 3);
  if (repeated.length)
    return {
      id: "incidents",
      name: area ? `Recent problems on ${area}` : "Recent problems",
      status: "developer",
      message: `${repeated.map(([a, n]) => `${a} stopped ${n} times`).join(", ")} in the last 7 days. A problem that keeps coming back needs the developer.`,
      where: repeated.map(([a]) => a).join(", "),
      steps: ["Other pages still work — use the sidebar.", "Send the scan report to your developer."],
      action: { kind: "contact", label: "Contact developer" },
      technical: crashes.slice(0, 5).map((c) => `${c.at} ${c.area}: ${c.technical?.split("\n")[0] ?? c.title}`).join("\n"),
    };
  // One-off problems: mark them seen so they don't keep showing.
  markIncidentsFixed(list.filter((i) => i.kind !== "storage").map((i) => i.id));
  return { id: "incidents", name: area ? `Recent problems on ${area}` : "Recent problems", status: "info", message: `${list.length} one-off problem${list.length === 1 ? "" : "s"} recorded this week (${[...new Set(list.map((i) => i.area))].join(", ")}). None is repeating, so no action is needed — they are now marked as checked.` };
}

/** Watch the screen for ~1 second: smoothness, memory, page size, uptime. */
async function checkSpeed(): Promise<CheckResult> {
  const frames: number[] = [];
  await new Promise<void>((resolve) => {
    let last = performance.now();
    const start = last;
    const step = (t: number) => {
      frames.push(t - last);
      last = t;
      if (t - start < 900) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
    setTimeout(resolve, 2500); // background tab: rAF pauses
  });
  const t0 = performance.now();
  for (const k of stanleyKeys()) {
    const raw = readKey(k);
    if (raw && STORES[k]?.shape !== "text") {
      try {
        JSON.parse(raw);
      } catch {
        /* reported by the data check */
      }
    }
  }
  const parseMs = Math.round(performance.now() - t0);
  const fps = frames.length > 3 ? Math.round(1000 / (frames.slice(1).reduce((a, b) => a + b, 0) / (frames.length - 1))) : 60;
  const worstFrame = Math.round(Math.max(0, ...frames.slice(1)));
  const mem = (performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
  const memPct = mem ? Math.round((mem.usedJSHeapSize / mem.jsHeapSizeLimit) * 100) : null;
  const nodes = document.getElementsByTagName("*").length;
  const sig = liveSignals();
  const uptimeH = (Date.now() - sig.sessionStart) / 3_600_000;
  const deviceMem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;

  const causes: string[] = [];
  const steps: string[] = [];
  let needsRestart = false;
  if (memPct != null && memPct > 70) (causes.push(`STANLEY is using ${memPct}% of the memory the browser allows`), (needsRestart = true));
  if (uptimeH > 48) (causes.push(`STANLEY has been open for ${Math.round(uptimeH / 24)} days without a restart`), (needsRestart = true));
  if (fps < 40) causes.push(`the screen is updating slowly (${fps} frames a second; smooth is 60)`);
  if (sig.longTasks > 40 && sig.worstTaskMs > 400) causes.push(`there were ${sig.longTasks} slow moments this session (worst ${(sig.worstTaskMs / 1000).toFixed(1)} s)`);
  if (parseMs > 300) causes.push(`reading saved data takes ${parseMs} ms — the records are getting large`);
  if (nodes > 20000) causes.push("the open page is very large (a long table or many pop-ups)");
  if (deviceMem && deviceMem <= 2) causes.push(`this computer has little memory (${deviceMem} GB)`);

  const facts = `${fps} fps · worst frame ${worstFrame} ms · data read ${parseMs} ms · ${nodes} page elements${memPct != null ? ` · memory ${memPct}%` : ""} · open ${uptimeH.toFixed(1)} h · ${sig.longTasks} long tasks`;
  if (!causes.length) return { id: "speed", name: "Speed", status: "ok", message: "STANLEY is running at normal speed.", technical: facts };
  if (needsRestart) steps.push("Press “Restart STANLEY” — it clears the memory the app has built up.");
  steps.push("Close browser tabs and programs you aren't using.");
  if (fps < 40 || (deviceMem && deviceMem <= 2)) steps.push("If the whole computer is slow, restart the computer.");
  if (parseMs > 300) steps.push("Tell your developer — moving records to the cloud database keeps STANLEY fast.");
  return { id: "speed", name: "Speed", status: "action", message: `STANLEY is slower than it should be: ${causes.join("; ")}.`, steps, action: needsRestart ? { kind: "restart", label: "Restart STANLEY" } : undefined, technical: facts };
}

function checkBrowser(): CheckResult {
  const missing: string[] = [];
  if (typeof indexedDB === "undefined") missing.push("backup storage (IndexedDB)");
  try {
    window.localStorage.setItem("stanley.__probe", "1");
    window.localStorage.removeItem("stanley.__probe");
  } catch {
    missing.push("saving on this computer");
  }
  if (typeof structuredClone === "undefined" || typeof Array.prototype.at !== "function") missing.push("modern browser features");
  if (!missing.length) return { id: "browser", name: "Browser", status: "ok", message: "This browser supports everything STANLEY needs." };
  return { id: "browser", name: "Browser", status: "action", message: `This browser is missing: ${missing.join(", ")}.`, steps: ["Use an up-to-date Google Chrome or Microsoft Edge.", "Don't use a private/incognito window for STANLEY."] };
}

function checkConnection(): CheckResult {
  const online = navigator.onLine;
  const b = billingState();
  const queued = b.orders.filter((o) => o.sync?.status !== "synced").length;
  return { id: "network", name: "Internet", status: "info", message: `${online ? "Online." : "Offline."} STANLEY works fully without internet — only referral-ID lookups from the PR agents' app need it. ${queued} bill${queued === 1 ? " is" : "s are"} saved on this computer, waiting for the cloud database (not connected yet).` };
}

function checkPageAccess(ctx: ScanContext): CheckResult | null {
  if (!ctx.focus || !ctx.branchId || ctx.user.kind === "admin") return null;
  const ok = canOpenBranchPage(ctx.user.role, ctx.focus);
  const name = routeArea(ctx.focus);
  return ok
    ? { id: "access", name: `Access to ${name}`, status: "ok", message: `Your role (${ctx.user.role}) is allowed to open ${name}.`, action: { kind: "open-page", label: `Open ${name}`, to: `/branch/${ctx.branchId}/${ctx.focus}` } }
    : { id: "access", name: `Access to ${name}`, status: "info", message: `${name} isn't part of the ${ctx.user.role} role, so STANLEY shows “not part of your work” instead of the page. Nothing is broken.`, steps: [`If you need it for your work, ask your Branch Manager or the Company Admin to change your permissions (Settings → Roles & permissions).`] };
}

/** Path of a page for the test copy. */
function pagePath(ctx: ScanContext): string | null {
  const f = ctx.focus;
  if (!f) return null;
  const company = ["patients", "finance", "branches"];
  if (ctx.user.kind === "admin" && (company.includes(f) || !ctx.branchId)) {
    if (company.includes(f) || ["dashboard", "inventory", "staff", "pr", "settings", "audit", "trash", "analysis", "reports", "messages"].includes(f)) return `/${f}`;
    const first = ACTIVE_BRANCHES[0]?.id;
    return first ? `/branch/${first}/${f}` : null;
  }
  if (company.includes(f)) return null; // not a branch page — the access check explains
  return ctx.branchId ? `/branch/${ctx.branchId}/${f}` : null;
}

/** Really open the page (hidden) and see whether it loads. */
async function checkPageOpens(ctx: ScanContext): Promise<CheckResult | null> {
  const path = pagePath(ctx);
  if (!path || !ctx.probe) return null;
  if (ctx.branchId && ctx.user.kind !== "admin" && !canOpenBranchPage(ctx.user.role, ctx.focus!)) return null;
  const name = routeArea(ctx.focus!);
  const r = await ctx.probe(path);
  if (r.skipped) return null;
  if (!r.ok) {
    const ex = explainError(r.error, name);
    recordIncident({ kind: "crash", title: `${name} failed to open during a check`, detail: ex.what, area: name, fixed: false, technical: errorText(r.error) });
    return {
      id: "opens",
      name: `Opening ${name}`,
      status: "developer",
      message: `STANLEY opened a test copy of ${name} and it failed: ${ex.what}`,
      where: name,
      steps: [...ex.steps.slice(0, 2), "Send this report to your developer — the details below show exactly where it failed."],
      action: { kind: "contact", label: "Contact developer" },
      technical: errorText(r.error),
      scope: "page",
    };
  }
  const slow = r.ms > 2500;
  return {
    id: "opens",
    name: `Opening ${name}`,
    status: r.laterErrors.length ? "developer" : slow ? "action" : "ok",
    message: r.laterErrors.length
      ? `${name} opened, but reported ${r.laterErrors.length} error${r.laterErrors.length === 1 ? "" : "s"} straight after.`
      : slow
        ? `${name} opened correctly but took ${(r.ms / 1000).toFixed(1)} seconds — slower than it should be (under 1 second is normal).`
        : `STANLEY opened a test copy of ${name} and it loaded correctly in ${r.ms < 1000 ? `${r.ms} ms` : `${(r.ms / 1000).toFixed(1)} s`} with no errors.`,
    steps: slow ? ["Press “Restart STANLEY” and try again.", "Close other programs and browser tabs."] : r.laterErrors.length ? ["Send this report to your developer."] : undefined,
    action: slow ? { kind: "restart", label: "Restart STANLEY" } : r.laterErrors.length ? { kind: "contact", label: "Contact developer" } : undefined,
    technical: r.laterErrors.length ? r.laterErrors.slice(0, 3).join("\n---\n") : `opened in ${r.ms} ms · path ${path}`,
    scope: "page",
  };
}

/** Checks about this computer / the whole app rather than one page. */
const DEVICE_CHECKS = new Set(["clock", "space", "disk", "persist", "speed", "browser", "network", "backup", "folder"]);

/* ─────────────── runner ─────────────── */

export async function runScan(ctx: ScanContext): Promise<ScanReport> {
  const t0 = performance.now();
  const plan: [string, () => Promise<CheckResult | CheckResult[] | null> | CheckResult | CheckResult[] | null][] = ctx.focus
    ? [
        ["Checking you can open the page", () => checkPageAccess(ctx)],
        ["Opening a hidden test copy of the page", () => checkPageOpens(ctx)],
        ["Checking the page's saved data", () => checkData(ctx.focus)],
        ...(["billing", "drafts", "records", "patients", "dashboard"].includes(ctx.focus) ? ([["Checking bills and patient records", checkRecords], ["Checking Patient ID numbers", checkReservations]] as [string, () => CheckResult][]) : []),
        ["Looking for recent problems on this page", () => checkIncidents(ctx.focus)],
        ["Checking saving", checkSaves],
        ["Checking the date and time", checkClock],
        ["Measuring speed", checkSpeed],
        ["Checking storage space", checkSpace],
      ]
    : [
        ["Checking saved data", () => checkData()],
        ["Checking bills and patient records", checkRecords],
        ["Checking Patient ID numbers", checkReservations],
        ["Checking Trash", checkTrash],
        ["Checking saving", checkSaves],
        ["Checking storage space", checkSpace],
        ["Checking backups", () => checkBackups(ctx)],
        ["Checking the date and time", checkClock],
        ["Looking at recent problems", () => checkIncidents()],
        ["Measuring speed", checkSpeed],
        ["Checking the browser", checkBrowser],
        ["Checking the connection", checkConnection],
      ];
  const results: CheckResult[] = [];
  for (let i = 0; i < plan.length; i++) {
    const [label, run] = plan[i];
    ctx.onStep?.(label, i, plan.length);
    // A visible pace so people see each check happen; real work runs too.
    const [r] = await Promise.all([Promise.resolve().then(run).catch((e: unknown) => ({ id: `err-${i}`, name: label.replace(/^Checking /, ""), status: "info" as const, message: "This check couldn't run on this browser.", technical: String(e) })), new Promise((res) => setTimeout(res, 180))]);
    if (Array.isArray(r)) results.push(...r);
    else if (r) results.push(r);
  }
  ctx.onStep?.("Done", plan.length, plan.length);
  for (const r of results) {
    if (!r.scope) r.scope = DEVICE_CHECKS.has(r.id) || (r.id === "saves" && ctx.focus && !(PAGE_STORES[ctx.focus] ?? []).some((k) => r.where === STORES[k]?.pages)) ? "device" : "page";
    if (!ctx.focus) r.scope = "page"; // a full scan is about everything
  }
  const worst = (list: CheckResult[]) => list.reduce<CheckStatus>((w, r) => (RANK[r.status] > RANK[w] ? r.status : w), "ok");
  const verdict = worst(results.filter((r) => r.scope === "page"));
  const deviceVerdict = ctx.focus ? worst(results.filter((r) => r.scope === "device")) : undefined;
  return { at: new Date().toISOString(), results, verdict, deviceVerdict, durationMs: Math.round(performance.now() - t0), focus: ctx.focus };
}

/** Plain-text report to send to the developer. */
export function reportText(r: ScanReport, ctx: { user: { name: string; role: string }; branch?: string; company: string; version: string; note?: string }): string {
  const label: Record<CheckStatus, string> = { ok: "OK", info: "INFO", fixed: "FIXED", action: "ACTION NEEDED", developer: "NEEDS DEVELOPER" };
  const lines = [
    `STANLEY scan report — ${ctx.company}`,
    `When: ${dt(r.at)} · Took ${(r.durationMs / 1000).toFixed(1)} s${r.focus ? ` · Focus: ${routeArea(r.focus)}` : ""}`,
    `By: ${ctx.user.name} (${ctx.user.role})${ctx.branch ? ` · Branch: ${ctx.branch}` : ""}`,
    `App: STANLEY ${ctx.version} · ${navigator.userAgent}`,
    ...(ctx.note ? ["", `What the user said: “${ctx.note}”`] : []),
    "",
    ...r.results.flatMap((x) => [`[${label[x.status]}] ${x.name}: ${x.message}`, ...(x.technical ? [`    tech: ${x.technical.replace(/\n/g, "\n    ")}`] : [])]),
    "",
    "Recent problems:",
    ...healthState()
      .incidents.slice(0, 10)
      .map((i) => `  ${dt(i.at)} · ${i.area} · ${i.title}${i.fixed ? " (fixed)" : ""}${i.technical ? `\n    tech: ${i.technical.split("\n")[0]}` : ""}`),
  ];
  return lines.join("\n");
}
