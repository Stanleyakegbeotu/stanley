/**
 * DEMONSTRATION DATA — operational records (staff, activity, notifications,
 * inventory, transactions…). Timestamps are relative to "now" so the demo
 * always looks current. Replace with API calls for production.
 */
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000);

/* ─────────────── Staff ─────────────── */
export type StaffStatus = "Active" | "On leave" | "Inactive";
export interface StaffMember {
  id: string;
  name: string;
  role: string;
  branchId: string;
  status: StaffStatus;
  added: string;
  lastActive: Date;
  email: string;
}

const staffSeed: [string, string, string, StaffStatus, string, number][] = [
  ["Dr. Sarah Adeyemi", "Branch Manager", "victoria-island", "Active", "12 Jan 2024", 26],
  ["Chinedu Okoro", "Senior Lab Scientist", "victoria-island", "Active", "03 Feb 2024", 14],
  ["Mariama Yusuf", "Billing Officer", "victoria-island", "Active", "18 Mar 2024", 640],
  ["Temilade George", "Radiographer", "victoria-island", "Active", "22 Apr 2024", 52],
  ["Chinwe Eze", "Radiographer", "victoria-island", "Active", "Today", 38],
  ["Michael Ekanem", "Lab Assistant", "victoria-island", "Inactive", "09 Sep 2023", 9200],
  ["Tunde Afolabi", "Branch Manager", "wuse-ii", "Active", "17 Jan 2022", 12],
  ["Zainab Musa", "Lab Scientist", "wuse-ii", "Active", "02 May 2023", 33],
  ["Ibrahim Danladi", "Front Desk Officer", "wuse-ii", "On leave", "11 Jul 2023", 4300],
  ["Grace Okon", "Billing Officer", "wuse-ii", "Active", "20 Oct 2023", 71],
  ["Tamuno Briggs", "Branch Manager", "gra-port-harcourt", "Active", "05 Sep 2022", 95],
  ["Boma Jack", "Sonographer", "gra-port-harcourt", "Active", "14 Feb 2023", 48],
  ["Ebiere Tari", "Lab Scientist", "gra-port-harcourt", "Active", "30 Mar 2024", 210],
  ["Esther Omale", "Branch Manager", "lokoja-central", "Active", "12 Jun 2023", 130],
  ["Yakubu Ali", "Lab Scientist", "lokoja-central", "Active", "01 Aug 2023", 64],
  ["Kwame Asante", "Branch Manager", "accra-osu", "Active", "19 Feb 2024", 22],
  ["Abena Boateng", "Lab Scientist", "accra-osu", "Active", "04 Mar 2024", 41],
  ["Yaw Darko", "Billing Officer", "accra-osu", "On leave", "27 May 2024", 6100],
];

export const STAFF: StaffMember[] = staffSeed.map(([name, role, branchId, status, added, mins], i) => ({
  id: `STF-${(1040 + i).toString()}`,
  name,
  role,
  branchId,
  status,
  added,
  lastActive: ago(mins),
  email: `${name.toLowerCase().replace(/^dr\.\s*/, "").replace(/[^a-z]+/g, ".")}@abcdiagnostics.example`,
}));

/** Headcount per branch (the staff list above is a sample of each roster). */
export const HEADCOUNT: Record<string, { total: number; active: number; onLeave: number }> = {
  "victoria-island": { total: 34, active: 31, onLeave: 2 },
  "wuse-ii": { total: 27, active: 25, onLeave: 2 },
  "gra-port-harcourt": { total: 21, active: 20, onLeave: 1 },
  "lokoja-central": { total: 15, active: 15, onLeave: 0 },
  "accra-osu": { total: 18, active: 16, onLeave: 2 },
  "ibadan-ring-road": { total: 0, active: 0, onLeave: 0 },
};

export const STAFF_REQUESTS = [
  { id: "SR-221", title: "Leave request — Ibrahim Danladi", branchId: "wuse-ii", at: ago(180) },
  { id: "SR-219", title: "Role change — Boma Jack to Senior Sonographer", branchId: "gra-port-harcourt", at: ago(1500) },
  { id: "SR-217", title: "New account — Lab assistant", branchId: "accra-osu", at: ago(2900) },
];

/* ─────────────── Activity ─────────────── */
export type ActivityKind = "patient" | "order" | "payment" | "expense" | "staff" | "branch" | "referral" | "admin" | "approval";
export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  title: string;
  detail: string;
  actor: string;
  branchId: string | null;
  at: Date;
  status: "Completed" | "Recorded" | "Pending approval" | "Flagged" | "Approved";
  route: string;
}

export const ACTIVITY: ActivityEvent[] = [
  { id: "EV-9081", kind: "payment", title: "Payment received", detail: "₦32,500 via POS for Adaobi Nwosu (TXN-84291)", actor: "Mariama Yusuf", branchId: "victoria-island", at: ago(6), status: "Completed", route: "/finance" },
  { id: "EV-9080", kind: "order", title: "Diagnostic order created", detail: "Abdominal Ultrasound + Full Blood Count for Musa Abdullahi", actor: "Grace Okon", branchId: "wuse-ii", at: ago(14), status: "Recorded", route: "/patients" },
  { id: "EV-9079", kind: "expense", title: "Branch expense recorded", detail: "Reagent restock — GH₵ 3,480 awaiting approval", actor: "Kwame Asante", branchId: "accra-osu", at: ago(27), status: "Pending approval", route: "/finance" },
  { id: "EV-9078", kind: "patient", title: "New patient registered", detail: "Tonye Amadi registered at GRA front desk", actor: "Ebiere Tari", branchId: "gra-port-harcourt", at: ago(41), status: "Completed", route: "/patients" },
  { id: "EV-9077", kind: "staff", title: "New staff account created", detail: "Chinwe Eze added as Radiographer", actor: "Amina Bello", branchId: "victoria-island", at: ago(58), status: "Completed", route: "/staff" },
  { id: "EV-9076", kind: "referral", title: "Referral received", detail: "Dr. Ahmed Bello referred 3 patients for imaging", actor: "System", branchId: "wuse-ii", at: ago(96), status: "Recorded", route: "/pr" },
  { id: "EV-9075", kind: "admin", title: "Service price updated", detail: "X-ray (Chest) changed from ₦18,000 to ₦20,000", actor: "Tunde Afolabi", branchId: "wuse-ii", at: ago(130), status: "Flagged", route: "/audit" },
  { id: "EV-9074", kind: "approval", title: "Expense approved", detail: "Generator servicing — ₦185,000", actor: "Amina Bello", branchId: "lokoja-central", at: ago(240), status: "Approved", route: "/finance" },
  { id: "EV-9073", kind: "branch", title: "Branch setup progressed", detail: "Ibadan Ring Road equipment delivery confirmed", actor: "Amina Bello", branchId: "ibadan-ring-road", at: ago(1400), status: "Recorded", route: "/branches" },
];

/* ─────────────── Pending approvals (feeds Attention Required) ─────────────── */
export const PENDING_APPROVALS = [
  { id: "EXP-5521", title: "Reagent restock", branchId: "accra-osu", amount: 3480, currency: "GHS" as const, at: ago(27) },
  { id: "EXP-5519", title: "Ultrasound probe repair", branchId: "gra-port-harcourt", amount: 412000, currency: "NGN" as const, at: ago(310) },
  { id: "EXP-5514", title: "Courier contract renewal", branchId: "victoria-island", amount: 260000, currency: "NGN" as const, at: ago(1700) },
];

/* ─────────────── Notifications ─────────────── */
export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  at: Date;
  read: boolean;
  kind: "price" | "approval" | "staff" | "inventory" | "system";
  route: string;
}

export const NOTIFICATIONS: NotificationItem[] = [
  { id: "N-1", title: "Service price updated", body: "Wuse II changed X-ray (Chest) from ₦18,000 to ₦20,000.", at: ago(130), read: false, kind: "price", route: "/audit" },
  { id: "N-2", title: "Expense awaiting approval", body: "Accra Osu submitted a reagent restock of GH₵ 3,480.", at: ago(27), read: false, kind: "approval", route: "/finance" },
  { id: "N-3", title: "Low stock alert", body: "EDTA sample tubes are below reorder level at Victoria Island.", at: ago(75), read: false, kind: "inventory", route: "/inventory" },
  { id: "N-4", title: "Staff leave request", body: "Ibrahim Danladi (Wuse II) requested 5 days of leave.", at: ago(180), read: false, kind: "staff", route: "/staff" },
  { id: "N-5", title: "Nightly backup completed", body: "All branch records were backed up successfully.", at: ago(620), read: true, kind: "system", route: "/settings" },
  { id: "N-6", title: "New manager assigned", body: "Esther Omale confirmed as Lokoja Central manager.", at: ago(2600), read: true, kind: "staff", route: "/staff" },
];

/* ─────────────── Inventory ─────────────── */
export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  branchId: string;
  unit: string;
  stock: number;
  reorderLevel: number;
  expiresInDays: number | null;
  unitCost: number; // branch currency
}

const inv: [string, string, string, string, number, number, number | null, number][] = [
  ["EDTA sample tubes", "Consumables", "victoria-island", "box", 6, 20, 210, 4200],
  ["Malaria RDT kits", "Reagents", "victoria-island", "kit", 48, 30, 64, 18500],
  ["Ultrasound gel", "Consumables", "victoria-island", "bottle", 22, 12, 400, 3500],
  ["Haematology reagent pack", "Reagents", "wuse-ii", "pack", 9, 10, 21, 96000],
  ["X-ray film 14×17", "Imaging", "wuse-ii", "box", 14, 8, null, 52000],
  ["Urinalysis strips", "Reagents", "gra-port-harcourt", "tub", 31, 15, 120, 9800],
  ["Lipid control serum", "Reagents", "gra-port-harcourt", "vial", 3, 6, 12, 27500],
  ["Nitrile gloves (M)", "Consumables", "lokoja-central", "box", 40, 25, null, 6500],
  ["HbA1c cartridges", "Reagents", "lokoja-central", "pack", 5, 8, 45, 74000],
  ["EDTA sample tubes", "Consumables", "accra-osu", "box", 18, 12, 260, 48],
  ["Thyroid assay kit", "Reagents", "accra-osu", "kit", 2, 4, 30, 1350],
  ["ECG electrodes", "Consumables", "accra-osu", "pack", 26, 10, 300, 85],
];

export const INVENTORY: InventoryItem[] = inv.map(([name, category, branchId, unit, stock, reorderLevel, expiresInDays, unitCost], i) => ({
  id: `INV-${2100 + i}`,
  name,
  category,
  branchId,
  unit,
  stock,
  reorderLevel,
  expiresInDays,
  unitCost,
}));

/* ─────────────── PR / referral partners ─────────────── */
export const PR_OFFICERS = [
  { id: "PR-11", name: "Kemi Adesanya", branchId: "victoria-island", partners: 14, share: 0.46, status: "Active" },
  { id: "PR-12", name: "Obinna Uche", branchId: "victoria-island", partners: 9, share: 0.31, status: "Active" },
  { id: "PR-14", name: "Hauwa Garba", branchId: "wuse-ii", partners: 11, share: 0.58, status: "Active" },
  { id: "PR-15", name: "Sotonye West", branchId: "gra-port-harcourt", partners: 8, share: 0.62, status: "Active" },
  { id: "PR-17", name: "Joseph Idakwo", branchId: "lokoja-central", partners: 6, share: 0.7, status: "Active" },
  { id: "PR-19", name: "Ama Owusu", branchId: "accra-osu", partners: 7, share: 0.66, status: "On leave" },
];

/* ─────────────── Patients ─────────────── */
export const PATIENTS = [
  { id: "ABC-001982", name: "Adaobi Nwosu", sex: "Female, 34", branchId: "victoria-island", last: ago(30), orders: 8, phone: "+234 803 555 2210" },
  { id: "ABC-001647", name: "Musa Abdullahi", sex: "Male, 52", branchId: "wuse-ii", last: ago(110), orders: 12, phone: "+234 806 555 1934" },
  { id: "ABC-001521", name: "Tonye Amadi", sex: "Male, 41", branchId: "gra-port-harcourt", last: ago(41), orders: 1, phone: "+234 805 555 7781" },
  { id: "ABC-001408", name: "Blessing Okafor", sex: "Female, 29", branchId: "victoria-island", last: ago(2900), orders: 4, phone: "+234 809 555 4402" },
  { id: "ABC-001177", name: "Esther Ojo", sex: "Female, 47", branchId: "lokoja-central", last: ago(4300), orders: 9, phone: "+234 807 555 6650" },
  { id: "ABC-001095", name: "Kojo Mensah", sex: "Male, 38", branchId: "accra-osu", last: ago(260), orders: 3, phone: "+233 24 555 0187" },
  { id: "ABC-000988", name: "Femi Lawal", sex: "Male, 63", branchId: "lokoja-central", last: ago(95), orders: 15, phone: "+234 802 555 3317" },
  { id: "ABC-000921", name: "Akosua Frimpong", sex: "Female, 26", branchId: "accra-osu", last: ago(1500), orders: 2, phone: "+233 20 555 7741" },
];

/* ─────────────── Transactions ─────────────── */
export const TRANSACTIONS = [
  { id: "TXN-84291", patient: "Adaobi Nwosu", branchId: "victoria-island", billed: 32500, paid: 32500, method: "POS", at: ago(6) },
  { id: "TXN-84290", patient: "Musa Abdullahi", branchId: "wuse-ii", billed: 68000, paid: 50000, method: "Transfer", at: ago(23) },
  { id: "TXN-84289", patient: "Tonye Amadi", branchId: "gra-port-harcourt", billed: 24000, paid: 24000, method: "Cash", at: ago(44) },
  { id: "TXN-84288", patient: "Kojo Mensah", branchId: "accra-osu", billed: 470, paid: 300, method: "POS", at: ago(66) },
  { id: "TXN-84287", patient: "Femi Lawal", branchId: "lokoja-central", billed: 15500, paid: 10000, method: "POS", at: ago(97) },
  { id: "TXN-84286", patient: "Blessing Okafor", branchId: "victoria-island", billed: 16500, paid: 16500, method: "HMO", at: ago(150) },
  { id: "TXN-84285", patient: "Akosua Frimpong", branchId: "accra-osu", billed: 240, paid: 240, method: "Cash", at: ago(205) },
];

/* ─────────────── Expenses ─────────────── */
export const EXPENSE_RECORDS = [
  { id: "EXP-5521", branchId: "accra-osu", category: "Reagents & consumables", description: "Reagent restock", amount: 3480, date: ago(27), status: "Pending", by: "Kwame Asante" },
  { id: "EXP-5520", branchId: "victoria-island", category: "Utilities", description: "Electricity — monthly", amount: 642000, date: ago(400), status: "Approved", by: "Dr. Sarah Adeyemi" },
  { id: "EXP-5519", branchId: "gra-port-harcourt", category: "Equipment maintenance", description: "Ultrasound probe repair", amount: 412000, date: ago(310), status: "Pending", by: "Tamuno Briggs" },
  { id: "EXP-5518", branchId: "lokoja-central", category: "Equipment maintenance", description: "Generator servicing", amount: 185000, date: ago(240), status: "Approved", by: "Esther Omale" },
  { id: "EXP-5517", branchId: "wuse-ii", category: "Logistics", description: "Sample courier — week 46", amount: 96500, date: ago(1900), status: "Approved", by: "Tunde Afolabi" },
  { id: "EXP-5516", branchId: "victoria-island", category: "Administrative", description: "Printer toner", amount: 38000, date: ago(2600), status: "Rejected", by: "Mariama Yusuf" },
];

/* ─────────────── Drafts (branch) ─────────────── */
export const DRAFTS = [
  { id: "DRF-301", patient: "Ngozi Eke", branchId: "victoria-island", services: "Full Blood Count, Lipid Profile", amount: 25000, saved: ago(18), by: "Mariama Yusuf" },
  { id: "DRF-300", patient: "Walk-in (unregistered)", branchId: "victoria-island", services: "Malaria Parasite Test", amount: 4500, saved: ago(64), by: "Chinwe Eze" },
  { id: "DRF-298", patient: "Bello Sadiq", branchId: "wuse-ii", services: "X-ray (Chest)", amount: 20000, saved: ago(300), by: "Grace Okon" },
  { id: "DRF-297", patient: "Efe Ighodaro", branchId: "gra-port-harcourt", services: "Abdominal Ultrasound", amount: 24000, saved: ago(820), by: "Ebiere Tari" },
  { id: "DRF-295", patient: "Esi Quaye", branchId: "accra-osu", services: "Thyroid Function Test", amount: 230, saved: ago(140), by: "Abena Boateng" },
];

/* ─────────────── Audit ─────────────── */
export const AUDIT = [
  { user: "Tunde Afolabi", role: "Branch Manager", branchId: "wuse-ii", action: "Price changed", record: "X-ray (Chest)", change: "₦18,000 → ₦20,000", at: ago(130) },
  { user: "Amina Bello", role: "Company Admin", branchId: "victoria-island", action: "Staff created", record: "Chinwe Eze", change: "Radiographer account", at: ago(58) },
  { user: "Mariama Yusuf", role: "Billing Officer", branchId: "victoria-island", action: "Payment recorded", record: "TXN-84291", change: "₦32,500 via POS", at: ago(6) },
  { user: "Kwame Asante", role: "Branch Manager", branchId: "accra-osu", action: "Expense submitted", record: "EXP-5521", change: "GH₵ 3,480 reagents", at: ago(27) },
  { user: "Amina Bello", role: "Company Admin", branchId: "lokoja-central", action: "Expense approved", record: "EXP-5518", change: "₦185,000 generator servicing", at: ago(240) },
  { user: "Tamuno Briggs", role: "Branch Manager", branchId: "gra-port-harcourt", action: "Service added", record: "Thyroid Function Test", change: "Initial price ₦19,500", at: ago(4400) },
];

/* ─────────────── Trash ─────────────── */
export const TRASH = [
  { id: "TR-88", type: "Draft bill", name: "DRF-289 · Walk-in patient", branchId: "victoria-island", deletedBy: "Mariama Yusuf", deletedAt: ago(300), purgeInDays: 29 },
  { id: "TR-87", type: "Service", name: "Widal Test (retired)", branchId: "wuse-ii", deletedBy: "Tunde Afolabi", deletedAt: ago(2900), purgeInDays: 27 },
  { id: "TR-85", type: "Expense", name: "EXP-5490 · Duplicate entry", branchId: "gra-port-harcourt", deletedBy: "Tamuno Briggs", deletedAt: ago(7300), purgeInDays: 25 },
  { id: "TR-81", type: "Staff account", name: "Michael Ekanem (deactivated)", branchId: "victoria-island", deletedBy: "Amina Bello", deletedAt: ago(14400), purgeInDays: 20 },
  { id: "TR-79", type: "Referral partner", name: "Sunrise Clinic", branchId: "accra-osu", deletedBy: "Kwame Asante", deletedAt: ago(20000), purgeInDays: 16 },
];
