/**
 * Company, branch and service catalogue — REAL baseline records.
 *
 * Company and branch come from the legacy Silhouette export metadata; the
 * service catalogue is the legacy inventory (priced items only are billable).
 * Fields the export does not contain are marked "Not on record" instead of
 * being invented.
 */
import { LEGACY_BRANCH_ID } from "./legacy";
import { CATALOGUE_INVENTORY } from "./catalogueRules";
import type { Branch, Currency } from "./types";

export const NOT_ON_RECORD = "Not on record";

export const COMPANY = {
  name: "Silhouette Diagnostic Consultants",
  shortName: "Silhouette",
  owner: NOT_ON_RECORD,
};

/** Signed-in user. No user records were exported, so this is a generic administrator account. */
export const CURRENT_USER = {
  name: "Company Administrator",
  firstName: "Administrator",
  role: "Company Admin",
  email: NOT_ON_RECORD,
};

export const BRANCHES: Branch[] = [
  {
    id: LEGACY_BRANCH_ID,
    code: "BR001",
    name: "Abuja",
    city: "Abuja",
    country: "Nigeria",
    currency: "NGN",
    status: "Active",
    manager: NOT_ON_RECORD,
    phone: NOT_ON_RECORD,
    address: NOT_ON_RECORD,
    /** Daily patient volume used only by the demo-activity generator. */
    basePatients: 64,
    openedOn: NOT_ON_RECORD,
  },
];

export const ACTIVE_BRANCHES = BRANCHES.filter((b) => b.status === "Active");

export function getBranch(id: string | null | undefined): Branch | undefined {
  return BRANCHES.find((b) => b.id === id);
}

/* ─────────────── Service catalogue (from the legacy inventory) ─────────────── */

export interface ServiceDef {
  /** Legacy inventory id. */
  id: number;
  name: string;
  /** Normalised category key (upper-case); `rawCategory` keeps the original text. */
  category: string;
  rawCategory: string;
  /** Price per currency. The legacy catalogue is priced in whole NGN only. */
  price: Partial<Record<Currency, number>>;
  /** Relative demand weight — used ONLY by the demo-activity generator. */
  mix: number;
}

/** Demo-activity demand by category (how often each kind of test is ordered). Not business data. */
const CATEGORY_DEMAND: Record<string, number> = {
  LAB: 1,
  SCAN: 0.55,
  "X-RAY": 0.4,
  XRAY: 0.4,
  ECG: 0.25,
  ECHO: 0.15,
  "CT SCAN": 0.08,
  MRI: 0.06,
  EEG: 0.05,
  "HOLTER ECG": 0.04,
  CARDIOLOGY: 0.05,
};

function seeded(n: number) {
  const x = Math.sin(n * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

/** Billable services = legacy items that have a price on file (2 items without a price are excluded). */
export const SERVICES: ServiceDef[] = CATALOGUE_INVENTORY.filter((i) => i.price !== null).map((i) => {
  const key = i.catalogueCategory;
  const demand = CATEGORY_DEMAND[key] ?? 0.02;
  // Cheaper routine tests are ordered more often than expensive imaging (demo assumption).
  const priceDamping = Math.pow(10_000 / Math.max(2_000, i.price as number), 0.45);
  return {
    id: i.id,
    name: i.name,
    category: key,
    rawCategory: i.category,
    price: { NGN: i.price as number },
    mix: demand * priceDamping * (0.25 + 1.5 * seeded(i.id)),
  };
});

export function servicePrice(s: ServiceDef, currency: Currency): number {
  return s.price[currency] ?? 0;
}
