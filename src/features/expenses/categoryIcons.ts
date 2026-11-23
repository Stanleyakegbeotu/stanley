/**
 * One icon per expense category. Categories are told apart by icon, never by
 * colour — everything uses the selected theme colour (owner rule).
 */
import { Briefcase, FlaskConical, Handshake, Receipt, Truck, Wallet, Wrench, Zap, type LucideIcon } from "lucide-react";
import { OUTSOURCED } from "@/services/expenses";

const ICONS: Record<string, LucideIcon> = {
  "Reagents & consumables": FlaskConical,
  Salaries: Wallet,
  Utilities: Zap,
  "Equipment maintenance": Wrench,
  Logistics: Truck,
  Administrative: Briefcase,
  [OUTSOURCED]: Handshake,
};

export const categoryIcon = (category: string): LucideIcon => ICONS[category] ?? Receipt;
