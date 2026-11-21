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
