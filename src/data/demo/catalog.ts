/**
 * DEMONSTRATION DATA — company structure and reference catalogues.
 * Kept apart from presentation components so a database/API layer can replace
 * these modules without touching the UI.
 */
import type { Branch, Currency } from "../types";

export const DEMO_DATA = true;

export const COMPANY = {
  name: "ABC Diagnostic Centre",
  shortName: "ABC Diagnostics",
  owner: "Amina Bello",
};

export const CURRENT_USER = {
  name: "Amina Bello",
  firstName: "Amina",
  role: "Company Admin",
  email: "admin@abcdiagnostics.example",
};

export const BRANCHES: Branch[] = [
  {
    id: "victoria-island",
    name: "Victoria Island",
    city: "Lagos",
    country: "Nigeria",
    currency: "NGN",
    status: "Active",
    manager: "Dr. Sarah Adeyemi",
    phone: "+234 802 555 0194",
    address: "14 Adeola Odeku Street, Victoria Island, Lagos",
    basePatients: 86,
    openedOn: "2021-03-08",
  },
  {
    id: "wuse-ii",
    name: "Wuse II",
    city: "Abuja",
    country: "Nigeria",
    currency: "NGN",
    status: "Active",
    manager: "Tunde Afolabi",
    phone: "+234 803 555 0112",
    address: "22 Aminu Kano Crescent, Wuse II, Abuja",
    basePatients: 64,
    openedOn: "2022-01-17",
  },
  {
    id: "gra-port-harcourt",
    name: "GRA",
    city: "Port Harcourt",
    country: "Nigeria",
    currency: "NGN",
    status: "Active",
    manager: "Tamuno Briggs",
    phone: "+234 805 555 0177",
    address: "7 Tombia Street, GRA Phase 2, Port Harcourt",
    basePatients: 53,
    openedOn: "2022-09-05",
  },
  {
    id: "lokoja-central",
    name: "Lokoja Central",
    city: "Lokoja",
    country: "Nigeria",
    currency: "NGN",
    status: "Active",
    manager: "Esther Omale",
    phone: "+234 806 555 0133",
    address: "3 IBB Way, Lokoja, Kogi",
    basePatients: 38,
    openedOn: "2023-06-12",
  },
  {
    id: "accra-osu",
    name: "Accra Osu",
    city: "Accra",
    country: "Ghana",
    currency: "GHS",
    status: "Active",
    manager: "Kwame Asante",
    phone: "+233 30 255 0148",
    address: "Oxford Street, Osu, Accra",
    basePatients: 41,
    openedOn: "2024-02-19",
  },
  {
    id: "ibadan-ring-road",
    name: "Ibadan Ring Road",
    city: "Ibadan",
    country: "Nigeria",
    currency: "NGN",
    status: "Inactive",
    manager: "Unassigned",
    phone: "—",
    address: "Ring Road, Ibadan, Oyo (setup in progress)",
    basePatients: 0,
    openedOn: "—",
  },
];

export const ACTIVE_BRANCHES = BRANCHES.filter((b) => b.status === "Active");

export function getBranch(id: string | null | undefined): Branch | undefined {
  return BRANCHES.find((b) => b.id === id);
}

export interface ServiceDef {
  name: string;
  category: string;
  /** Relative share of daily orders. */
  mix: number;
  price: Record<Currency, number>;
}

export const SERVICES: ServiceDef[] = [
  { name: "Full Blood Count", category: "Haematology", mix: 0.32, price: { NGN: 8500, GHS: 95 } },
  { name: "Malaria Parasite Test", category: "Parasitology", mix: 0.26, price: { NGN: 4500, GHS: 60 } },
  { name: "Urinalysis", category: "Clinical Chemistry", mix: 0.2, price: { NGN: 3500, GHS: 45 } },
  { name: "Lipid Profile", category: "Chemical Pathology", mix: 0.12, price: { NGN: 16500, GHS: 180 } },
  { name: "X-ray (Chest)", category: "Radiology", mix: 0.14, price: { NGN: 20000, GHS: 240 } },
  { name: "Abdominal Ultrasound", category: "Imaging", mix: 0.11, price: { NGN: 24000, GHS: 290 } },
  { name: "HbA1c", category: "Chemical Pathology", mix: 0.08, price: { NGN: 12000, GHS: 150 } },
  { name: "Thyroid Function Test", category: "Endocrinology", mix: 0.06, price: { NGN: 19500, GHS: 230 } },
  { name: "Liver Function Test", category: "Chemical Pathology", mix: 0.07, price: { NGN: 14000, GHS: 165 } },
  { name: "ECG", category: "Cardiology", mix: 0.05, price: { NGN: 15000, GHS: 200 } },
  { name: "CT Scan", category: "Radiology", mix: 0.018, price: { NGN: 95000, GHS: 1150 } },
  { name: "MRI", category: "Radiology", mix: 0.007, price: { NGN: 180000, GHS: 2300 } },
];

export interface ReferrerDef {
  name: string;
  branchId: string;
  /** Share of the branch's referrals. */
  weight: number;
  specialty?: string;
}

export const DOCTORS: ReferrerDef[] = [
  { name: "Dr. Ifeoma Eze", branchId: "victoria-island", weight: 0.24, specialty: "Internal Medicine" },
  { name: "Dr. Chidi Nnaji", branchId: "victoria-island", weight: 0.17, specialty: "Cardiology" },
  { name: "Dr. Funke Adebayo", branchId: "victoria-island", weight: 0.12, specialty: "Obstetrics" },
  { name: "Dr. Ahmed Bello", branchId: "wuse-ii", weight: 0.27, specialty: "Family Medicine" },
  { name: "Dr. Halima Sani", branchId: "wuse-ii", weight: 0.16, specialty: "Paediatrics" },
  { name: "Dr. Tamuno Briggs", branchId: "gra-port-harcourt", weight: 0.29, specialty: "General Surgery" },
  { name: "Dr. Ibiere Jack", branchId: "gra-port-harcourt", weight: 0.14, specialty: "Endocrinology" },
  { name: "Dr. Mary Ocholi", branchId: "lokoja-central", weight: 0.33, specialty: "Family Medicine" },
  { name: "Dr. Efua Mensah", branchId: "accra-osu", weight: 0.31, specialty: "Internal Medicine" },
  { name: "Dr. Kofi Owusu", branchId: "accra-osu", weight: 0.18, specialty: "Orthopaedics" },
];

export const HOSPITALS: ReferrerDef[] = [
  { name: "Harbour Specialist Hospital", branchId: "victoria-island", weight: 0.28 },
  { name: "Crescent Medical Centre", branchId: "victoria-island", weight: 0.18 },
  { name: "Unity Family Clinic", branchId: "wuse-ii", weight: 0.3 },
  { name: "Capital Women's Hospital", branchId: "wuse-ii", weight: 0.15 },
  { name: "Palmgrove Hospital", branchId: "gra-port-harcourt", weight: 0.32 },
  { name: "Riverside Medical Centre", branchId: "gra-port-harcourt", weight: 0.12 },
  { name: "Confluence Specialist Clinic", branchId: "lokoja-central", weight: 0.36 },
  { name: "Osu Family Clinic", branchId: "accra-osu", weight: 0.34 },
  { name: "Ridge View Hospital", branchId: "accra-osu", weight: 0.16 },
];
