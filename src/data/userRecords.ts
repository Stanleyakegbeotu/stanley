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

export interface AgentRecord extends LegacyPrAgent {
  source: "legacy" | "user";
  createdAt?: string;
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
