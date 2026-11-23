/**
 * Settings → system administration (Priority 3): Notifications, Security,
 * Appearance, Data Management & Backup, Integrations, Audit Logs, System
 * Configuration and About. Anything not built or not connected yet says so —
 * no fake toggles, statuses or connections.
 */
import { useMemo, useRef, useState } from "react";
import { Cloud, Download, FileSpreadsheet, Mail, MessageSquare, Smartphone, Upload, Wallet, type LucideIcon } from "lucide-react";
import { useApp } from "@/app/AppState";
import { COMPANY } from "@/data/company";
import { DATA_START } from "@/data/demo/generator";
import { LEGACY_META } from "@/data/legacy";
import { useAuditLog } from "@/services/audit";
import { syncQueue, useBilling } from "@/services/billing";
import { backupOverdue, recordBackup, updateConfig, useConfig } from "@/services/config";
import { expenseSyncQueue, useExpenses } from "@/services/expenses";
import { NOTE_KINDS } from "@/services/notifications";
import { formatCount } from "@/shared/format";
import { Button, Row, SelectMenu, Table } from "@/shared/ui/controls";
import { FieldError } from "@/shared/ui/FieldError";
import { useCompanyName } from "@/shell/BrandLogo";
import { AuditLogView } from "@/features/admin/AdminLogs";
import { ThemeCards } from "../SettingsFrame";
import pkg from "../../../../package.json";
import { ConfirmDialog, NotConnected, Panel, StatusChip, Toggle, csvCell, dateTime, downloadFile, shortDate } from "./ui";

/* ─────────────── Notifications ─────────────── */

const NOTE_HINT: Record<string, string> = {
  summary: "Each morning: the previous day's patients and money in",
  bill: "A single bill of ₦300,000 or more",
  unpaid: "A bill of ₦100,000 or more left unpaid",
  overdue: "Mondays: balances unpaid for more than 14 days",
  payout: "1st of the month: PR commission payout is due",
  data: "Notices about the legacy data",
};

export function NotificationsSection() {
  const cfg = useConfig();
  const kinds = cfg.notifications.kinds;
  return (
    <div className="sc-stack">
      <Panel title="In-app notifications" scope="global" note="Choose which notifications appear in the bell. Switching one off hides it everywhere.">
        <div className="sc-checks">
          {NOTE_KINDS.map((k) => (
            <Toggle key={k.id} label={k.label} hint={NOTE_HINT[k.id]} checked={kinds[k.id] !== false} onChange={(on) => updateConfig("notifications", { kinds: { ...kinds, [k.id]: on } }, `${k.label} notifications ${on ? "on" : "off"}`)} />
          ))}
        </div>
      </Panel>
      <NotConnected>Email and SMS notifications need an email / SMS service, which isn't connected yet (see Integrations). Notifications currently show in the app for everyone with access to the page they link to.</NotConnected>
    </div>
  );
}

/* ─────────────── Security ─────────────── */

export function SecuritySection() {
  const audit = useAuditLog();
  const history = useMemo(() => audit.filter((e) => /permission|role|branch (activated|reactivated|suspended|deactivated|created)|status changed|account switched|restored|backup|reset/i.test(e.action)).slice(0, 15), [audit]);
  const sensitive: [string, string][] = [
    ["Activate, deactivate or suspend a branch", "Company Admin only · confirmation · reason · audit"],
    ["Suspend, reactivate or remove staff", "Permission · confirmation · reason · audit · history kept"],
    ["Change roles or appoint managers", "Company Admin · confirmation · reason · audit"],
    ["Change permissions", "Company Admin only · sensitive ones confirmed · audit"],
    ["Change commission", "Confirmation · audit · agents' own rates kept"],
    ["Change payment methods or discounts", "Company Admin only · audit"],
    ["Change a branch's Patient ID code", "Locked once IDs are issued · audit"],
    ["Delete records", "Always to Trash first (30 days) · permanent delete needs permission · audit"],
    ["Restore a backup", "Company Admin · confirmation · reason · audit"],
  ];
  return (
    <div className="sc-stack">
      <Panel title="Sign-in & passwords" note="These arrive with sign-in, which isn't connected yet.">
        <ul className="st-checklist">
          <li>Password rules, account lockout after failed attempts, session timeout</li>
          <li>Invitations for new managers and staff, password resets</li>
          <li>Login history</li>
        </ul>
        <NotConnected>Until sign-in exists, STANLEY runs on this device and the "Switch account" menu sets who is working. Nothing here pretends to be enforced.</NotConnected>
      </Panel>
      <Panel title="Access control" note="Enforced in the app today.">
        <ul className="st-checklist">
          <li>Each role sees only the pages, buttons and reports its permissions allow (Roles & Permissions).</li>
          <li>Company-level powers — branches, company settings, roles, security, backups, net profit — belong to the Company Admin only.</li>
          <li>Branch Managers and Front Desk work inside their branch workspace; company-wide pages are the Company Admin's.</li>
        </ul>
      </Panel>
      <Panel title="Sensitive actions" note="How each one is protected.">
        <Table headers={["Action", "Protection"]} label="Sensitive actions">
          {sensitive.map(([a, p]) => (
            <Row key={a}>
              <td>
                <strong>{a}</strong>
              </td>
              <td>{p}</td>
            </Row>
          ))}
        </Table>
      </Panel>
      <Panel title="Security history" note="Permission, role, account and branch-status changes (from the audit log).">
        {history.length === 0 ? (
          <p className="an-none">No security-related changes yet.</p>
        ) : (
          <ol className="ex-history">
            {history.map((e) => (
              <li key={e.id}>
                <b>
                  {e.action} · {e.record}
                </b>
                <small>
                  {e.user} · {dateTime(e.at)}
                </small>
                {e.details && <p>{e.details}</p>}
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}

/* ─────────────── Appearance ─────────────── */

export function AppearanceSection() {
  return (
    <Panel title="Colour theme" note="The selected theme applies to the whole app — sidebar, header, banners, tables, charts and pop-ups. STANLEY uses a light professional interface (no dark mode). Saved on this device.">
      <ThemeCards />
    </Panel>
  );
}

/* ─────────────── Data Management & Backup ─────────────── */

const STORE_LABEL: Record<string, string> = {
  "stanley.billing.v1": "Patients, bills & drafts",
  "stanley.expenses.v1": "Expenses",
  "stanley.staff.v1": "Staff",
  "stanley.trash.v1": "Trash",
  "stanley.audit.v1": "Audit log",
  "stanley.org.v1": "Branches",
  "stanley.config.v1": "Business configuration",
  "stanley.permissions.v1": "Roles & permissions",
  "stanley.settings.v1": "Company profile, branding & photos",
  "stanley.receipt.v1": "Receipt details",
  "stanley.theme": "Theme",
  "stanley.sidebar": "Sidebar preference",
};

function stanleyKeys(): string[] {
  try {
    return Object.keys(window.localStorage).filter((k) => k.startsWith("stanley."));
  } catch {
    return [];
  }
}
const sizeOf = (k: string) => {
  try {
    return (window.localStorage.getItem(k) ?? "").length * 2;
  } catch {
    return 0;
  }
};
const kb = (bytes: number) => (bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(2)} MB`);

export function DataSection() {
  const { user, showToast } = useApp();
  const cfg = useConfig();
  const billing = useBilling();
  const expenses = useExpenses();
  const file = useRef<HTMLInputElement>(null);
  const [tick, setTick] = useState(0);
  const [restore, setRestore] = useState<{ name: string; keys: Record<string, string> } | null>(null);
  const [fileError, setFileError] = useState("");
  const keys = useMemo(() => stanleyKeys().sort(), [tick, cfg]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = keys.reduce((s, k) => s + sizeOf(k), 0);
  const queued = syncQueue(billing).length + expenseSyncQueue(expenses).length;

  const backup = () => {
    const data: Record<string, string> = {};
    for (const k of stanleyKeys()) data[k] = window.localStorage.getItem(k) ?? "";
    const payload = JSON.stringify({ app: "STANLEY", format: 1, createdAt: new Date().toISOString(), company: COMPANY.name, by: user.name, keys: data }, null, 1);
    downloadFile(`stanley-backup-${new Date().toISOString().slice(0, 10)}.json`, payload, "application/json");
    recordBackup("backup", user.name, payload.length);
    setTick((t) => t + 1);
    showToast("Backup saved to your computer");
  };

  const readFile = async (f: File) => {
    setFileError("");
    try {
      const parsed = JSON.parse(await f.text()) as { app?: string; keys?: Record<string, string> };
      if (parsed.app !== "STANLEY" || !parsed.keys || typeof parsed.keys !== "object") throw new Error("This isn't a STANLEY backup file.");
      const entries = Object.entries(parsed.keys).filter(([k, v]) => k.startsWith("stanley.") && typeof v === "string");
      if (!entries.length) throw new Error("The backup file is empty.");
      setRestore({ name: f.name, keys: Object.fromEntries(entries) });
    } catch (e) {
      setFileError(e instanceof Error ? e.message : "The file couldn't be read.");
    }
  };

  /** Replace everything on this device with the backup, then reload (nothing else may write in between). */
  const doRestore = (reason: string) => {
    if (!restore) return;
    const keysIn = { ...restore.keys };
    // Record the restore inside the restored audit log, so the history says what happened.
    try {
      const log = JSON.parse(keysIn["stanley.audit.v1"] ?? "[]") as { id: string }[];
      const max = log.reduce((m, e) => Math.max(m, Number(String(e.id).replace(/\D/g, "")) || 0), 0);
      log.unshift({ id: `AUD-${String(max + 1).padStart(6, "0")}`, at: new Date().toISOString(), user: user.name, role: user.role, category: "System", action: "Data restored from backup", record: restore.name, details: `Reason: ${reason} · ${Object.keys(keysIn).length} stores restored`, branchId: null } as never);
      keysIn["stanley.audit.v1"] = JSON.stringify(log);
    } catch {
      /* keep the backup's audit log as it is */
    }
    try {
      for (const k of stanleyKeys()) window.localStorage.removeItem(k);
      for (const [k, v] of Object.entries(keysIn)) window.localStorage.setItem(k, v);
    } catch {
      showToast("The backup couldn't be written — device storage may be full");
      return;
    }
    window.location.reload();
  };

  return (
    <div className="sc-stack">
      <Panel title="Data on this device" note="STANLEY is offline-first: everything is saved in this browser on this device until the cloud database is connected.">
        <div className="sc-tiles is-compact">
          <div className="sc-tile">
            <span className="sc-tile-head">Storage used</span>
            <b className="num">{kb(total)}</b>
            <small>Most browsers allow about 5 MB</small>
          </div>
          <div className="sc-tile">
            <span className="sc-tile-head">Last backup</span>
            <b>{cfg.backup.lastAt ? shortDate(cfg.backup.lastAt) : "Never"}</b>
            <small>{backupOverdue(cfg) ? "Overdue — back up now" : `Next due within ${cfg.backup.everyDays} days`}</small>
          </div>
          <div className="sc-tile">
            <span className="sc-tile-head">Waiting to sync</span>
            <b className="num">{formatCount(queued)}</b>
            <small>Cloud database not connected</small>
          </div>
        </div>
        <Table headers={["Store", "Contents", { label: "Size", align: "right" }]} label="Stores">
          {keys.map((k) => (
            <Row key={k}>
              <td className="mono">{k}</td>
              <td>{STORE_LABEL[k] ?? "Other"}</td>
              <td className="right num">{kb(sizeOf(k))}</td>
            </Row>
          ))}
        </Table>
      </Panel>

      <Panel title="Backup & restore" note="A backup is one file with everything on this device. Keep it somewhere safe (another computer, a flash drive).">
        <div className="sc-inline">
          <Button onClick={backup}>
            <Download size={15} /> Create backup
          </Button>
          <Button variant="secondary" onClick={() => file.current?.click()}>
            <Upload size={15} /> Restore from a backup…
          </Button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void readFile(f);
            }}
          />
          <label className="field" style={{ maxWidth: 240 }}>
            Remind me to back up every
            <SelectMenu
              value={String(cfg.backup.everyDays)}
              ariaLabel="Backup reminder"
              className="select-btn"
              options={["1", "3", "7", "14", "30"].map((d) => ({ value: d, label: `${d} day${d === "1" ? "" : "s"}` }))}
              onChange={(v: string) => updateConfig("backup", { everyDays: Number(v) }, `Backup reminder every ${v} days`)}
            />
          </label>
        </div>
        <FieldError msg={fileError} />
        <h5 className="sc-h5">Backup history</h5>
        {cfg.backup.history.length === 0 ? (
          <p className="an-none">No backups yet.</p>
        ) : (
          <Table headers={["When", "What", "By", { label: "Size", align: "right" }]} label="Backup history">
            {cfg.backup.history.map((h, i) => (
              <Row key={i}>
                <td>{dateTime(h.at)}</td>
                <td>{h.kind === "backup" ? "Backup created" : "Restored"}</td>
                <td>{h.by}</td>
                <td className="right num">{kb(h.bytes)}</td>
              </Row>
            ))}
          </Table>
        )}
        <NotConnected>Automatic and cloud backups need the cloud database. For now, back up to a file regularly — the Overview reminds you when one is due.</NotConnected>
      </Panel>

      <ConfirmDialog
        open={!!restore}
        title="Restore this backup?"
        description={restore ? `${restore.name} · ${Object.keys(restore.keys).length} stores` : ""}
        consequences={["Everything currently on this device is replaced by the backup", "Anything done since the backup was made is lost — create a backup first if unsure", "The app reloads when it's done"]}
        confirmLabel="Restore backup"
        danger
        reason
        onClose={() => setRestore(null)}
        onConfirm={doRestore}
      />
    </div>
  );
}

/* ─────────────── Integrations ─────────────── */

export function IntegrationsSection() {
  const billing = useBilling();
  const expenses = useExpenses();
  const queued = syncQueue(billing).length + expenseSyncQueue(expenses).length;
  const list: { name: string; icon: LucideIcon; text: string; status: "available" | "off"; note: string }[] = [
    { name: "Cloud database & sync", icon: Cloud, text: "Keeps every branch's data together and backs it up automatically.", status: "off", note: `${queued} record${queued === 1 ? "" : "s"} saved on this device and queued for when it's connected.` },
    { name: "PR agents' mobile app", icon: Smartphone, text: "Brings referral IDs from agents' phones into billing.", status: "off", note: "Needs the cloud database. Referral lookups say so when offline." },
    { name: "Email", icon: Mail, text: "Invitations, password resets and emailed notifications.", status: "off", note: "Not connected — notifications show in the app only." },
    { name: "SMS", icon: MessageSquare, text: "Text messages to patients and staff.", status: "off", note: "Not connected." },
    { name: "Payment gateway / POS", icon: Wallet, text: "Card terminal or online payments posting straight into bills.", status: "off", note: "Not connected — payments are recorded by hand in Billing." },
    { name: "Reports: print, PDF & spreadsheet", icon: FileSpreadsheet, text: "Every report prints, downloads as PDF or exports to CSV for accountants.", status: "available", note: "Built in — works offline." },
    { name: "Backup files", icon: Download, text: "Back up and restore everything as one file.", status: "available", note: "Built in — Data Management." },
  ];
  return (
    <div className="sc-stack">
      <div className="sc-integrations">
        {list.map((i) => (
          <article key={i.name} className="card sc-integration">
            <header>
              <span className="sc-tile-icon" aria-hidden="true">
                <i.icon size={17} />
              </span>
              <b>{i.name}</b>
              {i.status === "available" ? <StatusChip status="ok">Available</StatusChip> : <StatusChip status="disabled">Not connected</StatusChip>}
            </header>
            <p>{i.text}</p>
            <small>{i.note}</small>
          </article>
        ))}
      </div>
      <NotConnected>No integration is shown as connected unless it really works. Connecting the cloud database is the next step that unlocks sync, sign-in, invitations, email and the PR agents' app.</NotConnected>
    </div>
  );
}

/* ─────────────── Audit Logs ─────────────── */

export function AuditSection() {
  const { showToast } = useApp();
  const log = useAuditLog();
  const exportCsv = () => {
    const head = ["ID", "Date", "Time", "Person", "Role", "Area", "Action", "Record", "Details", "Branch"];
    const rows = log.map((e) => [e.id, e.at.toLocaleDateString("en-GB"), e.at.toLocaleTimeString("en-GB"), e.user, e.role, e.category, e.action, e.record, e.details, e.branchId ?? "Company-wide"]);
    downloadFile(`stanley-audit-log-${new Date().toISOString().slice(0, 10)}.csv`, "﻿" + [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n"), "text/csv");
    showToast(`Audit log exported (${log.length} entries)`);
  };
  return (
    <div className="sc-stack">
      <div className="sc-inline">
        <Button variant="secondary" onClick={exportCsv}>
          <Download size={15} /> Export to spreadsheet (CSV)
        </Button>
      </div>
      <AuditLogView scope={null} />
    </div>
  );
}

/* ─────────────── System Configuration & About ─────────────── */

export function SystemSection() {
  const name = useCompanyName();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const rows: [string, string][] = [
    ["System", `STANLEY ${pkg.version}`],
    ["Organisation", name],
    ["Mode", "Offline-first — works without internet; saves on this device"],
    ["Default currency", "NGN — Nigerian naira (whole naira)"],
    ["Timezone", `${tz} (this device's clock)`],
    ["Date format", `${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · ${new Date().toLocaleDateString("en-GB")}`],
    ["Time format", new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })],
    ["Number format", (1234567).toLocaleString("en-NG")],
    ["Records start", shortDate(DATA_START)],
  ];
  return (
    <div className="sc-stack">
      <Panel title="System configuration" scope="global" note="Fixed for this version — the same at every branch.">
        <Table headers={["Setting", "Value"]} label="System configuration">
          {rows.map(([k, v]) => (
            <Row key={k}>
              <td>
                <strong>{k}</strong>
              </td>
              <td>{v}</td>
            </Row>
          ))}
        </Table>
      </Panel>
      <AboutPanel />
    </div>
  );
}

function AboutPanel() {
  const c = LEGACY_META.counts;
  return (
    <Panel title="About STANLEY" note="Data sources and what's real.">
      <Table headers={["", ""]} label="About">
        <Row>
          <td>
            <strong>Legacy records</strong>
          </td>
          <td>
            {LEGACY_META.sourceApp} · {LEGACY_META.sourceDatabase} · exported {dateTime(LEGACY_META.exportedAt)}
          </td>
        </Row>
        <Row>
          <td>
            <strong>Imported</strong>
          </td>
          <td>
            {formatCount(c.inventoryItems)} services · {formatCount(c.prAgents)} PR agents · {formatCount(c.distinctHospitals)} hospitals (read-only baseline)
          </td>
        </Row>
        <Row>
          <td>
            <strong>Dashboard activity</strong>
          </td>
          <td>Demonstration activity for the Abuja branch, built on the real services, prices and agents. Bills, expenses and staff entered in STANLEY are real records.</td>
        </Row>
        <Row>
          <td>
            <strong>Sample staff photos</strong>
          </td>
          <td>Stock photos from Pexels (free licence) — see public/mock-photos/CREDITS.md.</td>
        </Row>
      </Table>
    </Panel>
  );
}
