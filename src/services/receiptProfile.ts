/**
 * Receipt details printed on every patient receipt: company motto, email and
 * thank-you message, plus each branch's address and phone.
 *
 * None of these were in the legacy export, so they start empty (never
 * invented) and are filled in from the receipt pop-up. Saved for the session
 * until the database is connected.
 */
import { useSyncExternalStore } from "react";
import { COMPANY } from "@/data/company";

export interface ReceiptProfile {
  motto: string;
  email: string;
  thankYou: string;
  branches: Record<string, { address: string; phone: string }>;
}

let state: ReceiptProfile = {
  motto: "",
  email: "",
  thankYou: `Thank you for choosing ${COMPANY.name}. We wish you good health — please keep this receipt for your records.`,
  branches: {},
};
const listeners = new Set<() => void>();

export function updateReceiptProfile(patch: Partial<Omit<ReceiptProfile, "branches">>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function updateBranchContact(branchId: string, patch: Partial<{ address: string; phone: string }>) {
  const cur = state.branches[branchId] ?? { address: "", phone: "" };
  state = { ...state, branches: { ...state.branches, [branchId]: { ...cur, ...patch } } };
  listeners.forEach((l) => l());
}

export function useReceiptProfile(): ReceiptProfile {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}
