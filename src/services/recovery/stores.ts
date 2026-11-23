/**
 * What STANLEY keeps on this device, described in plain words — one place for
 * the recovery system, the scan, backups and the Data page.
 *
 * Every saved store is one localStorage key starting with "stanley.". Most are
 * JSON; a couple are plain words (theme, sidebar). The recovery stores
 * (session / health / support) are housekeeping and are never restored from a
 * backup over newer ones.
 */

export interface StoreInfo {
  /** What is inside, for people. */
  label: string;
  /** Which pages use it, so a problem can say exactly where it shows. */
  pages: string;
  /** Expected JSON shape; "text" = plain words, not JSON. */
  shape: "object" | "array" | "text";
}

export const STORES: Record<string, StoreInfo> = {
  "stanley.billing.v1": { label: "Patients, bills & drafts", pages: "Billing, Drafts, Records and patient search", shape: "object" },
  "stanley.expenses.v1": { label: "Expenses", pages: "Expenses", shape: "object" },
  "stanley.staff.v1": { label: "Staff", pages: "Staff Management and sign-in accounts", shape: "array" },
  "stanley.trash.v1": { label: "Trash", pages: "Trash", shape: "array" },
  "stanley.audit.v1": { label: "Audit log", pages: "Audit log", shape: "array" },
  "stanley.org.v1": { label: "Branches", pages: "Branches and branch settings", shape: "object" },
  "stanley.config.v1": { label: "Business configuration", pages: "Billing rules, notifications and backup reminders", shape: "object" },
  "stanley.permissions.v1": { label: "Roles & permissions", pages: "What each role can open and do", shape: "object" },
  "stanley.settings.v1": { label: "Company profile, branding & photos", pages: "Company name, logo and profile photos", shape: "object" },
  "stanley.receipt.v1": { label: "Receipt details", pages: "Receipts and price quotes", shape: "object" },
  "stanley.theme": { label: "Theme", pages: "Colours", shape: "text" },
  "stanley.sidebar": { label: "Sidebar preference", pages: "Sidebar", shape: "text" },
  "stanley.ai.activity": { label: "STANLEY AI panel preference", pages: "STANLEY AI", shape: "text" },
  "stanley.session.v1": { label: "Open sessions (housekeeping)", pages: "Recovery after an unexpected shutdown", shape: "object" },
  "stanley.health.v1": { label: "System health history", pages: "System health", shape: "object" },
  "stanley.issues.v1": { label: "Reported issues", pages: "Report an issue", shape: "array" },
  "stanley.support.v1": { label: "Support contact", pages: "System health", shape: "object" },
};

/** Housekeeping keys: never part of a backup, never restored over. */
export const HOUSEKEEPING = new Set(["stanley.session.v1", "stanley.health.v1"]);

export const storeLabel = (k: string) => STORES[k]?.label ?? "Other saved data";

export function stanleyKeys(): string[] {
  try {
    return Object.keys(window.localStorage).filter((k) => k.startsWith("stanley."));
  } catch {
    return [];
  }
}

export function readKey(k: string): string | null {
  try {
    return window.localStorage.getItem(k);
  } catch {
    return null;
  }
}

/** Approximate bytes a key takes (browsers store UTF-16). */
export const sizeOf = (k: string) => ((readKey(k) ?? "").length + k.length) * 2;

/** Is this saved value readable and the shape the app expects? */
export function isReadable(k: string, raw: string | null): boolean {
  if (raw == null) return true;
  const shape = STORES[k]?.shape;
  if (shape === "text") return true;
  try {
    const v = JSON.parse(raw) as unknown;
    if (v === null || typeof v !== "object") return shape === undefined; // unknown keys may hold anything JSON
    if (shape === "array") return Array.isArray(v);
    if (shape === "object") return !Array.isArray(v);
    return true;
  } catch {
    // Unknown keys might be plain text on purpose.
    return shape === undefined;
  }
}

/** Everything worth backing up, as { key: raw text }. */
export function collectData(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of stanleyKeys()) {
    if (HOUSEKEEPING.has(k)) continue;
    const v = readKey(k);
    if (v != null) out[k] = v;
  }
  return out;
}

export const kb = (bytes: number) => (bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(2)} MB`);

/** Most browsers give a site about 5 MB of this kind of storage. */
export const LOCAL_LIMIT = 5 * 1024 * 1024;
export const localUsed = () => stanleyKeys().reduce((s, k) => s + sizeOf(k), 0);
