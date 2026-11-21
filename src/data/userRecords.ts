/**
 * User-created records — kept strictly separate from the legacy baseline.
 *
 * The baseline (src/data/legacy) is immutable and loaded once as part of the
 * bundle; it is never re-appended or overwritten. Records created in the app
 * live here with their own id range, and views merge the two at read time.
 *
 * Persistence: STANLEY has no database layer yet, so user-created records last
 * for the current session. When Supabase/SQLite is connected, persist this
 * collection (and only this collection) — the baseline needs no seeding.
 */
import { LEGACY_PR_AGENTS, type LegacyPrAgent } from "./legacy";

/** User records start well above every legacy id so the two can never collide. */
export const USER_ID_START = 1_000_000;

/** Where an agent's commission is paid. Not in the legacy export — added in the app (never invented). */
export interface BankDetails {
  bankName: string;
  accountNumber: string;
  /** Name on the bank account — may differ from the name the agent is listed under. */
  accountName: string;
  at: string;
}

export interface AgentRecord extends LegacyPrAgent {
  source: "legacy" | "user";
  createdAt?: string;
  bank?: BankDetails;
}

export const BASELINE_AGENTS: readonly AgentRecord[] = Object.freeze(LEGACY_PR_AGENTS.map((a) => ({ ...a, source: "legacy" as const })));

export function nextUserId(existing: readonly AgentRecord[]): number {
  return existing.reduce((max, a) => Math.max(max, a.id), USER_ID_START - 1) + 1;
}

export function mergeAgents(user: readonly AgentRecord[]): AgentRecord[] {
  return [...BASELINE_AGENTS, ...user];
}

/* ─────────────── PR agent changes (overrides; the legacy export is never modified) ─────────────── */

/** A profile change to a legacy agent (e.g. a transfer to another hospital). Absent fields keep the recorded value. */
export interface AgentEdit {
  name?: string;
  phone?: string;
  /** Hospital code; "" = no hospital assigned. */
  hospital?: string;
  at: string;
}

const BASELINE_BY_ID = new Map(BASELINE_AGENTS.map((a) => [a.id, a]));

/** The agent exactly as recorded in the legacy export (undefined for agents created in the app). */
export const recordedAgent = (id: number): AgentRecord | undefined => BASELINE_BY_ID.get(id);

export function applyAgentEdits(agents: AgentRecord[], edits: Record<number, AgentEdit>): AgentRecord[] {
  if (!Object.keys(edits).length) return agents;
  return agents.map((a) => {
    const e = edits[a.id];
    return e ? { ...a, name: e.name ?? a.name, phone: e.phone ?? a.phone, hospital: e.hospital ?? a.hospital } : a;
  });
}

/* ─────────────── Inventory changes (overrides; the legacy catalogue is never modified) ─────────────── */

/** A change to a catalogue service. Absent fields keep the recorded value. */
export interface ServiceEdit {
  name?: string;
  price?: number | null;
  at: string;
}

export interface AddedService {
  id: number;
  name: string;
  /** Normalised category key (upper-case). */
  category: string;
  price: number;
  turnaround?: string;
  sample?: string;
  notes?: string;
  createdAt: string;
}

export interface InventoryChanges {
  /** Display names for category keys, e.g. { LAB: "Laboratory" }. */
  categoryNames: Record<string, string>;
  edits: Record<number, ServiceEdit>;
  added: AddedService[];
}

export const EMPTY_INVENTORY_CHANGES: InventoryChanges = { categoryNames: {}, edits: {}, added: [] };

export function nextServiceId(added: readonly AddedService[]): number {
  return added.reduce((max, s) => Math.max(max, s.id), USER_ID_START - 1) + 1;
}

/* ─────────────── Nigerian banks (for the agent payment account) ─────────────── */

export const NIGERIAN_BANKS: readonly string[] = [
  "Access Bank",
  "Citibank Nigeria",
  "Ecobank Nigeria",
  "Fidelity Bank",
  "First Bank of Nigeria",
  "First City Monument Bank (FCMB)",
  "Globus Bank",
  "Guaranty Trust Bank (GTBank)",
  "Jaiz Bank",
  "Keystone Bank",
  "Kuda Microfinance Bank",
  "Lotus Bank",
  "Moniepoint Microfinance Bank",
  "Opay",
  "Optimus Bank",
  "PalmPay",
  "Parallex Bank",
  "Polaris Bank",
  "PremiumTrust Bank",
  "Providus Bank",
  "Signature Bank",
  "Stanbic IBTC Bank",
  "Standard Chartered Bank",
  "Sterling Bank",
  "SunTrust Bank",
  "TAJBank",
  "Titan Trust Bank",
  "Union Bank of Nigeria",
  "United Bank for Africa (UBA)",
  "Unity Bank",
  "Wema Bank",
  "Zenith Bank",
];

/** Nigerian (NUBAN) account numbers are 10 digits. */
export const isNuban = (n: string) => /^\d{10}$/.test(n.trim());

/* ─────────────── Staff (created in STANLEY — none were in the legacy export) ─────────────── */

export type StaffStatus = "Active" | "On leave" | "Suspended" | "Left";
export const STAFF_STATUSES: readonly StaffStatus[] = ["Active", "On leave", "Suspended", "Left"];

/** The branch head. Each branch has at most one active manager; every other staff member reports to them. */
export const MANAGER_ROLE = "Branch Manager";

export const STAFF_ROLES: readonly { value: string; access: string; permissions: string[] }[] = [
  { value: MANAGER_ROLE, access: "Runs the branch: billing, staff, expenses and settings", permissions: ["Register patients and create bills", "Approve expenses", "Manage branch staff", "Branch reports and settings"] },
  { value: "Front Desk", access: "Patient registration and billing", permissions: ["Register patients", "Create bills and take payments", "Print receipts"] },
  { value: "Laboratory Scientist", access: "Lab orders and results", permissions: ["View lab orders", "Enter and release lab results"] },
  { value: "Radiographer", access: "Imaging orders and reports", permissions: ["View imaging orders", "Upload imaging reports"] },
  { value: "Sonographer", access: "Ultrasound orders and reports", permissions: ["View ultrasound orders", "Upload scan reports"] },
  { value: "Accountant", access: "Payments, expenses and reports", permissions: ["Record expenses", "View payments and balances", "Financial reports"] },
];

export const EMPLOYMENT_TYPES: readonly string[] = ["Full-time", "Part-time", "Contract", "Locum"];

export interface StaffRecord {
  id: string;
  name: string;
  role: string;
  branchId: string;
  status: StaffStatus;
  email: string;
  phone: string;
  employment: string;
  /** yyyy-mm-dd */
  startDate: string;
  address?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export const isManager = (s: Pick<StaffRecord, "role">) => s.role === MANAGER_ROLE;

/** The branch's current manager (active or on leave), if any. */
export const managerOf = (staff: readonly StaffRecord[], branchId: string) => staff.find((s) => s.branchId === branchId && isManager(s) && s.status !== "Left");

export function nextStaffId(staff: readonly StaffRecord[]): string {
  const max = staff.reduce((m, s) => Math.max(m, Number(s.id.replace(/\D/g, "")) || 0), 0);
  return `STF-${String(max + 1).padStart(4, "0")}`;
}
