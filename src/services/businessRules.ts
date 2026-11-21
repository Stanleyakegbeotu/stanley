/**
 * Confirmed financial business rules.
 *
 * ESTIMATED OPERATING CONTRIBUTION
 * The formula for this measure has NOT been confirmed in STANLEY's business
 * rules. It is deliberately left unimplemented so the dashboard never shows a
 * figure derived from assumed logic. When the finance owner confirms the
 * definition (which revenue basis, which expense set, treatment of PR
 * commissions and outstanding balances), implement it here and the KPI card
 * will start rendering it automatically.
 */
import type { Currency } from "@/data/types";
import type { Summary } from "./analytics";

export type ContributionRule = (summary: Summary, currency: Currency) => number;

export const OPERATING_CONTRIBUTION_RULE: ContributionRule | null = null;

/**
 * PR AGENT COMMISSION RATE — PLACEHOLDER FOR DEMO ACTIVITY ONLY.
 * The legacy export does not include the commission rate or commission
 * history. This rate is used solely to illustrate commission figures on the
 * demonstration activity and must be replaced with the confirmed rate (or the
 * legacy commission records) before any figure is relied upon.
 */
export const DEMO_PR_COMMISSION_RATE = 0.05;
