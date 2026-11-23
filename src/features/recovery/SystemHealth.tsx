/**
 * Settings → System health (every account: Company Admin, Branch Manager,
 * Front Desk). Owner, 2026-11-22.
 *
 *  • Scan for errors — checks this computer and STANLEY's data, fixes what is
 *    safe to fix by itself, and says in plain words what's left: restart, fix
 *    the clock, allow the backup folder, or contact the developer.
 *  • Automatic backups — status for everyone; the Company Admin and Branch
 *    Managers can download, choose a backup folder and restore.
 *  • Recent problems — what went wrong and whether it was fixed.
 *  • Support contact — who to call (set by the Company Admin).
 */
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCopy, Cloud, Download, FolderOpen, HardDrive, LifeBuoy, RefreshCw, RotateCcw, ShieldCheck, Stethoscope, Wrench, Info, Phone, Mail } from "lucide-react";
import { useApp } from "@/app/AppState";
import { useBilling } from "@/services/billing";
import { logAudit } from "@/services/audit";
import { companyName } from "@/services/settingsStore";
import { recordBackup } from "@/services/config";
import { allowBackupFolder, backupFile, backupsSize, chooseBackupFolder, folderStatus, folderSupported, forgetBackupFolder, getBackup, KEEP_DAYS, listBackups, restoreBackup, runBackup, type FolderStatus, type SnapshotInfo } from "@/services/recovery/backups";
import { routeArea, setSupportContact, useHealth, type SupportContact } from "@/services/recovery/health";
import { reportText, runScan, type CheckResult, type CheckStatus, type ScanReport } from "@/services/recovery/scan";
import { kb } from "@/services/recovery/stores";
import { Button } from "@/shared/ui/controls";
import { ConfirmDialog, downloadFile } from "@/features/settings/admin/ui";
import { getBranch } from "@/data/company";
import { can, usePermissions } from "@/services/permissions";
import { Modal } from "@/shared/ui/Modal";
import pkg from "../../../package.json";

export const dtLong = (d: string | Date) => new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

const STATUS: Record<CheckStatus, { label: string; icon: typeof CheckCircle2 }> = {
  ok: { label: "All good", icon: CheckCircle2 },
  info: { label: "Good to know", icon: Info },
  fixed: { label: "Fixed automatically", icon: Wrench },
  action: { label: "You can fix this", icon: AlertTriangle },
  developer: { label: "Needs your developer", icon: LifeBuoy },
};
const ORDER: CheckStatus[] = ["developer", "action", "fixed", "info", "ok"];

/** Run the actions a result offers (restart, backup folder…). */
export function useResultActions(onDone?: () => void) {
  const { navigate, showToast, user } = useApp();
  return useCallback(
    async (r: CheckResult, contact?: () => void) => {
      const a = r.action;
      if (!a) return;
      if (a.kind === "restart") window.location.reload();
      else if (a.kind === "open-page" && a.to) navigate(a.to);
      else if (a.kind === "contact") contact?.();
      else if (a.kind === "download-backup") {
        await downloadNow(user.name);
        showToast("Backup downloaded to your computer");
      } else if (a.kind === "backup-folder") {
        const name = await chooseBackupFolder();
        if (name) {
          await runBackup("manual", { company: companyName(), by: user.name });
          showToast(`Daily backups will be saved in “${name}”`);
        }
      } else if (a.kind === "allow-folder") {
        showToast((await allowBackupFolder()) ? "Backup folder allowed" : "The browser didn't allow the folder");
        await runBackup("manual", { company: companyName(), by: user.name });
      }
      onDone?.();
    },
    [navigate, showToast, user.name, onDone],
  );
}

/** Make (or refresh) today's backup and download it. */
export async function downloadNow(by: string) {
  const r = await runBackup("manual", { company: companyName(), by });
  const snap = r.snapshot ? await getBackup(r.snapshot.id) : undefined;
  const at = snap?.at ?? new Date().toISOString();
  const text = backupFile(snap ?? { at, keys: {} }, companyName(), by);
  downloadFile(`stanley-backup-${new Date().toISOString().slice(0, 10)}.json`, text, "application/json");
  recordBackup("backup", by, text.length);
}

/* ─────────────── Result list (also used by Report an issue) ─────────────── */

export function ScanResults({ report, onContact, onAction }: { report: ScanReport; onContact?: () => void; onAction: (r: CheckResult) => void }) {
  const groups = ORDER.map((s) => ({ s, list: report.results.filter((r) => r.status === s) })).filter((g) => g.list.length);
  return (
    <div className="hs-results">
      {groups.map((g) => {
        const S = STATUS[g.s];
        return (
          <section key={g.s} className={`hs-group is-${g.s}`}>
            <h5>
              <S.icon size={15} /> {S.label} <em>{g.list.length}</em>
            </h5>
            <ul>
              {g.list.map((r) => (
                <li key={r.id} className={`hs-item is-${r.status}`}>
                  <div className="hs-item-head">
                    <b>{r.name}</b>
                    {r.where && <small>Affects: {r.where}</small>}
                  </div>
                  <p>{r.message}</p>
                  {r.steps && r.steps.length > 0 && (
                    <ol>
                      {r.steps.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ol>
                  )}
                  {r.action && (
                    <Button size="sm" variant={r.status === "action" || r.status === "developer" ? "primary" : "secondary"} onClick={() => (r.action?.kind === "contact" ? onContact?.() : onAction(r))}>
                      {r.action.kind === "restart" ? <RefreshCw size={14} /> : r.action.kind === "contact" ? <LifeBuoy size={14} /> : r.action.kind.includes("folder") ? <FolderOpen size={14} /> : r.action.kind === "download-backup" ? <Download size={14} /> : null}
                      {r.action.label}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export function verdictText(r: ScanReport): { title: string; text: string } {
  // A page check is judged on that page; computer-wide findings are listed apart.
  const list = r.focus ? r.results.filter((x) => x.scope !== "device") : r.results;
  const n = (st: CheckStatus) => list.filter((x) => x.status === st).length;
  const page = r.focus ? routeArea(r.focus) : null;
  const where = page ? ` on ${page}` : "";
  if (r.verdict === "developer") return { title: page ? `${page} has a problem that needs your developer` : "Some problems need your developer", text: `${n("developer")} problem${n("developer") === 1 ? "" : "s"}${where} STANLEY can't safely fix by itself. Send the report to your developer — everything else keeps working.` };
  if (r.verdict === "action") return { title: page ? `${page} needs something from you` : "A few things need you", text: `${n("action")} thing${n("action") === 1 ? "" : "s"}${where} you can fix in a minute — follow the steps below.${n("fixed") ? ` ${n("fixed")} other problem${n("fixed") === 1 ? " was" : "s were"} fixed automatically.` : ""}` };
  if (r.verdict === "fixed") return { title: page ? `Problems on ${page} found and fixed` : "Problems found and fixed", text: `STANLEY fixed ${n("fixed")} problem${n("fixed") === 1 ? "" : "s"}${where} by itself. Nothing else needs doing.` };
  return page ? { title: `No problems found on ${page}`, text: `${page} opened correctly and its saved data is fine.` } : { title: "No errors found", text: "STANLEY and this computer are working normally." };
}

/* ─────────────── Section ─────────────── */

export function SystemHealthSection() {
  const { user, staff } = useApp();
  const branch = user.branchId ? getBranch(user.branchId) : undefined;
  const [step, setStep] = useState<{ label: string; done: number; total: number } | null>(null);
  const [report, setReport] = useState<ScanReport | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const act = useResultActions(() => setTick((t) => t + 1));
  // Backups & restore stay Company Admin only (Roles & permissions: data.backup is admin-only).
  usePermissions();
  const canManage = can(user.role, "data.backup");
  void staff;

  const scan = async () => {
    setReport(null);
    const r = await runScan({ user, branchId: user.branchId, onStep: (label, done, total) => setStep({ label, done, total }) });
    setStep(null);
    setReport(r);
    setTick((t) => t + 1);
    logAudit({ category: "System", action: "Scan for errors", record: "System health", details: `${verdictText(r).title} · ${r.results.filter((x) => x.status === "fixed").length} fixed automatically`, branchId: user.branchId ?? null });
  };

  const ctx = { user, branch: branch ? `${branch.name} (${branch.code})` : undefined, company: companyName(), version: pkg.version };
  const v = report ? verdictText(report) : null;

  return (
    <div className="hs-stack">
      <section className={`hs-hero ${report ? `is-${report.verdict}` : ""}`}>
        <span className="hs-hero-icon" aria-hidden="true">
          {step ? <RefreshCw size={26} className="hs-spin" /> : report ? report.verdict === "ok" || report.verdict === "info" || report.verdict === "fixed" ? <ShieldCheck size={26} /> : <AlertTriangle size={26} /> : <Stethoscope size={26} />}
        </span>
        <div className="hs-hero-text">
          <h4>{step ? "Scanning…" : v ? v.title : "Scan for errors"}</h4>
          <p>{step ? step.label : v ? v.text : "Checks saved data, bills and Patient IDs, saving, storage space, backups, the date and time, speed and the browser. Fixes what it safely can by itself and tells you plainly about anything else."}</p>
          {step && (
            <div className="hs-progress" role="progressbar" aria-valuemin={0} aria-valuemax={step.total} aria-valuenow={step.done}>
              <i style={{ width: `${Math.round((step.done / step.total) * 100)}%` }} />
            </div>
          )}
        </div>
        <div className="hs-hero-actions">
          <Button onClick={() => void scan()} disabled={!!step}>
            <Stethoscope size={15} /> {report ? "Scan again" : "Scan for errors"}
          </Button>
          {report && (
            <Button
              variant="secondary"
              onClick={() => {
                void navigator.clipboard?.writeText(reportText(report, ctx));
                setContactOpen(true);
              }}
            >
              <ClipboardCopy size={15} /> Report for developer
            </Button>
          )}
        </div>
      </section>

      {report && <ScanResults report={report} onContact={() => setContactOpen(true)} onAction={(r) => void act(r, () => setContactOpen(true))} />}

      <BackupsPanel canManage={canManage} tick={tick} />
      <RecentProblems />
      <SupportPanel editable={user.kind === "admin"} />

      {contactOpen && report && <DeveloperDialog text={reportText(report, ctx)} onClose={() => setContactOpen(false)} />}
    </div>
  );
}

/* ─────────────── Developer contact dialog ─────────────── */

export function DeveloperDialog({ text, onClose }: { text: string; onClose: () => void }) {
  const { support } = useHealth();
  const [copied, setCopied] = useState(false);
  return <DevModal text={text} support={support} subject={encodeURIComponent("STANLEY problem report")} copied={copied} setCopied={setCopied} onClose={onClose} />;
}

function DevModal({ text, support, subject, copied, setCopied, onClose }: { text: string; support: SupportContact; subject: string; copied: boolean; setCopied: (v: boolean) => void; onClose: () => void }) {
  const has = support.name || support.phone || support.email;
  const wa = support.phone.replace(/\D/g, "").replace(/^0/, "234");
  return (
    <Modal
      open
      onClose={onClose}
      wide
      icon={LifeBuoy}
      title="Send this report to your developer"
      description={has ? "Copy it, then send it by WhatsApp, SMS or email. It has no patient names or money figures." : "No support contact is set yet — the Company Admin can add one in Settings → System health. You can still copy or download the report."}
      footer={
        <>
          <Button variant="secondary" onClick={() => downloadFile(`stanley-problem-report-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.txt`, text)}>
            <Download size={15} /> Download as file
          </Button>
          <Button onClick={() => void navigator.clipboard?.writeText(text).then(() => setCopied(true))}>
            <ClipboardCopy size={15} /> {copied ? "Copied" : "Copy report"}
          </Button>
        </>
      }
    >
      {has && (
        <div className="hs-contact">
          <b>{support.name || "Support"}</b>
          {support.phone && (
            <a href={`tel:${support.phone}`}>
              <Phone size={14} /> {support.phone}
            </a>
          )}
          {support.phone && wa.length >= 10 && (
            <a href={`https://wa.me/${wa}?text=${encodeURIComponent(text.slice(0, 1800))}`} target="_blank" rel="noreferrer">
              WhatsApp
            </a>
          )}
          {support.email && (
            <a href={`mailto:${support.email}?subject=${subject}&body=${encodeURIComponent(text.slice(0, 1800))}`}>
              <Mail size={14} /> {support.email}
            </a>
          )}
          {support.note && <small>{support.note}</small>}
        </div>
      )}
      <pre className="hs-report">{text}</pre>
    </Modal>
  );
}

/* ─────────────── Backups ─────────────── */

function BackupsPanel({ canManage, tick }: { canManage: boolean; tick: number }) {
  const { user, showToast } = useApp();
  const billing = useBilling();
  const [list, setList] = useState<SnapshotInfo[] | null>(null);
  const [size, setSize] = useState(0);
  const [folder, setFolder] = useState<FolderStatus>({ state: "none" });
  const [busy, setBusy] = useState(false);
  const [restore, setRestore] = useState<SnapshotInfo | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      setList(await listBackups());
      setSize(await backupsSize());
      setFolder(await folderStatus());
      setError("");
    } catch (e) {
      setList([]);
      setError(e instanceof Error ? e.message : "Backups aren't available in this browser.");
    }
  }, []);
  useEffect(() => void refresh(), [refresh, tick, billing]);

  const daily = (list ?? []).filter((b) => b.id !== "before-restore");
  const latest = daily[0];

  const backupNow = async () => {
    setBusy(true);
    const r = await runBackup("manual", { company: companyName(), by: user.name });
    setBusy(false);
    showToast(r.status === "unchanged" ? "Nothing changed since the last backup — no extra copy needed" : r.status === "failed" ? "The backup couldn't be made" : "Backup made");
    void refresh();
  };

  return (
    <section className="sc-panel hs-backups">
      <header>
        <div>
          <h4>Automatic backups</h4>
          <p>Made every day by itself. Only the last {KEEP_DAYS} days are kept and a day with no changes makes no new copy — so backups never pile up or fill this computer.</p>
        </div>
        {canManage && (
          <div className="sc-panel-actions">
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => void backupNow()}>
              <HardDrive size={14} /> {busy ? "Backing up…" : "Back up now"}
            </Button>
            <Button
              size="sm"
              onClick={async () => {
                await downloadNow(user.name);
                showToast("Backup downloaded to your computer");
                void refresh();
              }}
            >
              <Download size={14} /> Download backup
            </Button>
          </div>
        )}
      </header>

      <div className="hs-tiles">
        <div className="hs-tile">
          <span>Last backup</span>
          <b>{latest ? dtLong(latest.checkedAt > latest.at ? latest.checkedAt : latest.at) : list ? "Not yet" : "…"}</b>
          <small>{latest ? `${latest.stores} stores · ${kb(latest.bytes)}` : "The first one is made a few seconds after opening"}</small>
        </div>
        <div className="hs-tile">
          <span>Kept on this computer</span>
          <b>
            {daily.length} of {KEEP_DAYS} days
          </b>
          <small>{kb(size)} in total — separate from STANLEY's working storage</small>
        </div>
        <div className="hs-tile">
          <span>Backup folder</span>
          <b>{folder.state === "ready" ? folder.name : folder.state === "needs-permission" ? "Needs your OK" : folder.state === "unsupported" ? "Not available" : "Not chosen"}</b>
          <small>{folder.state === "ready" ? (folder.lastWritten ? `Last file ${folder.lastFile}` : "First file goes in with the next backup") : folder.state === "unsupported" ? "Use Chrome or Edge to save backup files automatically" : "One file per weekday — 7 files at most"}</small>
        </div>
        <div className="hs-tile">
          <span>Cloud copy</span>
          <b>
            <Cloud size={14} /> Not connected yet
          </b>
          <small>When the cloud database is connected, only the newest backup is sent</small>
        </div>
      </div>

      {canManage && folderSupported() && (
        <div className="hs-folder">
          <FolderOpen size={16} />
          <span>
            {folder.state === "ready"
              ? `Every day a backup file is saved in “${folder.name}” (STANLEY backup - Monday.json … Sunday.json — each one replaced a week later). Put this folder on a flash drive or inside Google Drive / OneDrive and it is copied off this computer too.`
              : folder.state === "needs-permission"
                ? `The browser needs your OK again to keep saving into “${folder.name}”.`
                : "Choose a folder on this computer (or a flash drive, or a Google Drive / OneDrive folder) and STANLEY saves a backup file there every day."}
          </span>
          {folder.state === "needs-permission" ? (
            <Button size="sm" onClick={async () => (showToast((await allowBackupFolder()) ? "Backup folder allowed" : "Not allowed"), void refresh())}>
              Allow
            </Button>
          ) : (
            <Button
              size="sm"
              variant={folder.state === "ready" ? "secondary" : "primary"}
              onClick={async () => {
                const name = await chooseBackupFolder();
                if (name) {
                  await runBackup("manual", { company: companyName(), by: user.name });
                  logAudit({ category: "System", action: "Backup folder chosen", record: name, details: "Daily backup files are saved in this folder", branchId: null });
                  showToast(`Daily backups will be saved in “${name}”`);
                }
                void refresh();
              }}
            >
              {folder.state === "ready" ? "Change folder" : "Choose backup folder"}
            </Button>
          )}
          {folder.state === "ready" && (
            <Button size="sm" variant="ghost" onClick={async () => (await forgetBackupFolder(), void refresh())}>
              Stop
            </Button>
          )}
        </div>
      )}

      {error && <p className="an-none">{error}</p>}
      {list && list.length > 0 && (
        <table className="bp-table hs-table">
          <thead>
            <tr>
              <th>Backup</th>
              <th>Made</th>
              <th className="right">Size</th>
              {canManage && <th className="right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {list.map((b) => (
              <tr key={b.id}>
                <td>
                  <b>{b.id === "before-restore" ? "Safety copy before the last restore" : new Date(`${b.id}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}</b>
                </td>
                <td>
                  {dtLong(b.at)}
                  {b.checkedAt > b.at && <small className="hs-muted"> · unchanged until {dtLong(b.checkedAt)}</small>}
                </td>
                <td className="right num">{kb(b.bytes)}</td>
                {canManage && (
                  <td className="right">
                    <div className="hs-row-actions">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          const s = await getBackup(b.id);
                          if (s) downloadFile(`stanley-backup-${b.id}.json`, backupFile(s, companyName(), user.name), "application/json");
                        }}
                      >
                        <Download size={14} /> Download
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setRestore(b)}>
                        <RotateCcw size={14} /> Restore
                      </Button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!canManage && <p className="hs-note">Backups are made and checked automatically for everyone, and damaged data is repaired from them by itself. Downloading, restoring and choosing a backup folder are for the Company Admin only.</p>}

      <ConfirmDialog
        open={!!restore}
        title="Put this backup back?"
        description={restore ? `Backup made ${dtLong(restore.at)}` : ""}
        consequences={["Everything on this computer goes back to how it was at that time", "Anything entered after that is replaced — a safety copy of the current data is kept first, so this can be undone", "STANLEY restarts when it's done"]}
        confirmLabel="Restore backup"
        danger
        reason
        onClose={() => setRestore(null)}
        onConfirm={async (reason) => {
          if (!restore) return;
          try {
            await restoreBackup(restore.id, user, reason);
          } catch (e) {
            showToast(e instanceof Error ? e.message : "The backup couldn't be restored");
            setRestore(null);
          }
        }}
      />
    </section>
  );
}

/* ─────────────── Recent problems ─────────────── */

function RecentProblems() {
  const { incidents } = useHealth();
  const [all, setAll] = useState(false);
  const list = all ? incidents : incidents.slice(0, 6);
  return (
    <section className="sc-panel">
      <header>
        <div>
          <h4>Recent problems</h4>
          <p>What went wrong on this computer, in plain words, and whether it was fixed. The last 40 are kept.</p>
        </div>
      </header>
      {incidents.length === 0 ? (
        <p className="an-none">No problems recorded. 🎉</p>
      ) : (
        <ol className="hs-incidents">
          {list.map((i) => (
            <li key={i.id} className={i.fixed ? "is-fixed" : "is-open"}>
              {i.fixed ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
              <div>
                <b>{i.title}</b>
                <p>{i.detail}</p>
                <small>
                  {dtLong(i.at)} · {i.area} · {i.fixed ? "Fixed / checked" : "Not fixed yet"}
                </small>
              </div>
            </li>
          ))}
        </ol>
      )}
      {incidents.length > 6 && (
        <Button size="sm" variant="ghost" onClick={() => setAll((a) => !a)}>
          {all ? "Show fewer" : `Show all ${incidents.length}`}
        </Button>
      )}
    </section>
  );
}

/* ─────────────── Support contact ─────────────── */

function SupportPanel({ editable }: { editable: boolean }) {
  const { support } = useHealth();
  const { showToast } = useApp();
  const [form, setForm] = useState<SupportContact>(support);
  useEffect(() => setForm(support), [support]);
  const changed = JSON.stringify(form) !== JSON.stringify(support);
  if (!editable)
    return (
      <section className="sc-panel">
        <header>
          <div>
            <h4>Who to contact</h4>
            <p>For problems STANLEY can't fix by itself.</p>
          </div>
        </header>
        {support.name || support.phone || support.email ? (
          <div className="hs-contact">
            <b>{support.name || "Support"}</b>
            {support.phone && (
              <a href={`tel:${support.phone}`}>
                <Phone size={14} /> {support.phone}
              </a>
            )}
            {support.email && (
              <a href={`mailto:${support.email}`}>
                <Mail size={14} /> {support.email}
              </a>
            )}
            {support.note && <small>{support.note}</small>}
          </div>
        ) : (
          <p className="an-none">Not set yet — ask the Company Admin to add the developer's contact.</p>
        )}
      </section>
    );
  return (
    <section className="sc-panel">
      <header>
        <div>
          <h4>Support contact</h4>
          <p>Shown to every account when a problem needs the developer. Saved on this computer.</p>
        </div>
        <div className="sc-panel-actions">
          <Button
            size="sm"
            disabled={!changed}
            onClick={() => {
              setSupportContact(form);
              logAudit({ category: "Settings", action: "Support contact changed", record: "System health", details: [form.name, form.phone, form.email].filter(Boolean).join(" · ") || "Cleared", branchId: null });
              showToast("Support contact saved");
            }}
          >
            Save
          </Button>
        </div>
      </header>
      <div className="hs-form">
        {(
          [
            ["name", "Name or company", "e.g. the developer's name"],
            ["phone", "Phone / WhatsApp", "e.g. 0803 000 0000"],
            ["email", "Email", "name@example.com"],
            ["note", "Note", "e.g. Available 8am–6pm, Mon–Sat"],
          ] as [keyof SupportContact, string, string][]
        ).map(([k, label, ph]) => (
          <label key={k} className="field">
            {label}
            <input className="input" value={form[k]} placeholder={ph} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
          </label>
        ))}
      </div>
    </section>
  );
}
