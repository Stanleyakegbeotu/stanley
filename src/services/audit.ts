/**
 * Audit log — a read-only record of every change made in STANLEY: who, what,
 * which record, when and the details. Entries can never be edited or removed.
 *
 * Starts with the real legacy import event; everything after that is recorded
 * as people work (PR agents, commission, staff, catalogue, trash, reports and
 * receipts). Kept for the session until the database is connected.
 */
import { useSyncExternalStore } from "react";
import { CURRENT_USER } from "@/data/company";
import { LEGACY_BRANCH_ID, LEGACY_META } from "@/data/legacy";

export type AuditCategory = "System" | "PR agents" | "Commission" | "Staff" | "Catalogue" | "Trash" | "Reports" | "Receipts";
export const AUDIT_CATEGORIES: readonly AuditCategory[] = ["PR agents", "Commission", "Staff", "Catalogue", "Trash", "Reports", "Receipts", "System"];

export interface AuditEntry {
  id: string;
  at: Date;
  user: string;
  role: string;
  category: AuditCategory;
  action: string;
  /** The record that changed, e.g. "Dr Bello Nisa (#80)". */
  record: string;
  /** What changed, in plain words. */
  details: string;
  branchId: string | null;
}

let seq = 1;
let entries: AuditEntry[] = [
  {
    id: "AUD-000001",
    at: new Date(LEGACY_META.exportedAt),
    user: "System",
    role: "Data import",
    category: "System",
    action: "Baseline imported",
    record: LEGACY_META.sourceDatabase,
    details: `${LEGACY_META.counts.inventoryItems} inventory items · ${LEGACY_META.counts.prAgents} PR agents · ${LEGACY_META.counts.distinctHospitals} hospitals imported as the read-only baseline`,
    branchId: LEGACY_BRANCH_ID,
  },
];
const listeners = new Set<() => void>();

/** Record a change made by the signed-in user. */
export function logAudit(e: { category: AuditCategory; action: string; record: string; details: string; branchId?: string | null }) {
  seq += 1;
  entries = [{ id: `AUD-${String(seq).padStart(6, "0")}`, at: new Date(), user: CURRENT_USER.name, role: CURRENT_USER.role, branchId: e.branchId ?? null, ...e }, ...entries];
  listeners.forEach((l) => l());
}

/** Newest first. */
export function useAuditLog(): AuditEntry[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => entries,
  );
}
