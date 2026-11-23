import {
  Banknote,
  Building2,
  ChartColumn,
  ChartLine,
  FilePenLine,
  FolderOpen,
  Handshake,
  LayoutGrid,
  Package,
  ReceiptText,
  ScrollText,
  Settings,
  Trash2,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { PAGE_PERMISSION, can } from "@/services/permissions";

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  path: string;
}

/**
 * COMPANY ADMINISTRATION — exact approved order.
 * Billing, Drafts, Records, Analysis and Expenses are branch-level and must
 * never appear here.
 */
export const COMPANY_NAV: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutGrid, path: "/dashboard" },
  { id: "branches", label: "Branches", icon: Building2, path: "/branches" },
  { id: "inventory", label: "Inventory", icon: Package, path: "/inventory" },
  { id: "staff", label: "Staff Management", icon: Users, path: "/staff" },
  { id: "pr", label: "PR Management", icon: Handshake, path: "/pr" },
  { id: "patients", label: "Patients", icon: UserRound, path: "/patients" },
  { id: "finance", label: "Finance & Expenses", icon: Wallet, path: "/finance" },
  { id: "reports", label: "Reports", icon: ChartLine, path: "/reports" },
  { id: "settings", label: "Settings", icon: Settings, path: "/settings" },
  { id: "audit", label: "Audit Log", icon: ScrollText, path: "/audit" },
  { id: "trash", label: "Trash", icon: Trash2, path: "/trash" },
];

/** BRANCH OPERATIONS — a separate workspace with its own navigation. */
export const BRANCH_NAV_ITEMS: Omit<NavItem, "path">[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
  { id: "billing", label: "Billing", icon: ReceiptText },
  { id: "drafts", label: "Drafts", icon: FilePenLine },
  { id: "records", label: "Records", icon: FolderOpen },
  { id: "inventory", label: "Inventory", icon: Package },
  { id: "pr", label: "PR Management", icon: Handshake },
  { id: "analysis", label: "Analysis", icon: ChartColumn },
  { id: "expenses", label: "Expenses", icon: Banknote },
  { id: "staff", label: "Staff Management", icon: Users },
  { id: "settings", label: "Settings", icon: Settings },
  { id: "audit", label: "Audit", icon: ScrollText },
  { id: "trash", label: "Trash", icon: Trash2 },
];

/**
 * Which branch pages a role can open — decided by Roles & Permissions
 * (services/permissions.ts, PAGE_PERMISSION). Defaults (owner, 2026-11-22):
 * the Branch Manager (and the Company Admin inside a branch) sees every page;
 * Front Desk gets the day-to-day work — billing, drafts, records, the price
 * list, expenses, Analysis (limited) and their own settings. The Company Admin
 * can change this in Settings.
 */
export function canOpenBranchPage(role: string, page: string): boolean {
  const base = page.split("?")[0] || "dashboard";
  const perm = PAGE_PERMISSION[base];
  return perm === null || perm === undefined ? true : can(role, perm);
}

export function branchNav(branchId: string, role = "Branch Manager"): NavItem[] {
  return BRANCH_NAV_ITEMS.filter((i) => canOpenBranchPage(role, i.id)).map((i) => ({ ...i, path: `/branch/${branchId}/${i.id}` }));
}
