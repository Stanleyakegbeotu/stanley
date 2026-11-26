/**
 * Reports (owner, 2026-11-26): complaints and issues sent to the branch or
 * the company, by PR agents (often passing on what a patient said) or by
 * staff. For example: the front desk spoke rudely to a patient, a result was
 * not clear or did not show what the doctor needed, a patient was charged
 * more than the quote, a long wait, no power, or a problem with the app.
 *
 * Each report goes to one recipient, who sees it on their Reports page:
 *   • the Company Admin (sees every report, every branch),
 *   • the Branch Manager (sees their branch's reports to the manager and to
 *     the front desk),
 *   • the front desk (sees only what was sent to the front desk).
 * A report is New, then Attended (someone is looking into it), then Resolved
 * (with what was done). It can be reopened. Every step is kept in its history
 * and written to the audit log.
 *
 * Saved on this computer until the cloud connection carries reports from the
 * PR agents' app; until then the page shows sample reports.
 */
import { useSyncExternalStore } from "react";
import { ACTIVE_BRANCHES } from "@/data/company";
import { BASELINE_AGENTS } from "@/data/userRecords";
import { branchPrefix } from "@/services/billing";

export type ReportTo = "admin" | "manager" | "frontdesk";
export type ReportStatus = "new" | "attended" | "resolved";
export type ReportCategory = "Staff conduct" | "Results" | "Billing and prices" | "Waiting time" | "Facility" | "App problem" | "Other";
export const REPORT_CATEGORIES: ReportCategory[] = ["Staff conduct", "Results", "Billing and prices", "Waiting time", "Facility", "App problem", "Other"];
export const TO_TEXT: Record<ReportTo, string> = { admin: "Company Admin", manager: "Branch Manager", frontdesk: "Front desk" };
export const STATUS_TEXT: Record<ReportStatus, string> = { new: "New", attended: "Attended", resolved: "Resolved" };

export interface ReportStep {
  at: string;
  by: string;
  action: string;
  note?: string;
}
export interface IssueReport {
  id: string;
  branchId: string;
  at: string;
  from: { kind: "agent" | "staff"; name: string; role: string; agentId?: number };
  to: ReportTo;
  category: ReportCategory;
  subject: string;
  details: string;
  /** Referral or patient ID it is about, when there is one. */
  patientRef?: string;
  /** Who or what it is about (a staff member, "Front desk", a test …). */
  about?: string;
  urgent: boolean;
  status: ReportStatus;
  history: ReportStep[];
}

const KEY = "stanley.reports.v1";
const listeners = new Set<() => void>();
let state: IssueReport[] | null = null;

function load(): IssueReport[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as IssueReport[];
  } catch {
    /* fall back to the sample */
  }
  return sampleReports();
}
function commit(next: IssueReport[]) {
  state = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage full: this session only */
  }
  listeners.forEach((l) => l());
}
const current = () => (state ??= load());

export function useIssueReports(): IssueReport[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    current,
  );
}

/** Which reports a person may see. */
export function visibleReports(list: IssueReport[], who: { kind: "admin" | "manager" | "staff"; branchId: string | null }, scope: string[] | null): IssueReport[] {
  return list.filter((r) => {
    if (who.kind === "admin") return !scope || scope.includes(r.branchId);
    if (r.branchId !== who.branchId) return false;
    return who.kind === "manager" ? r.to === "manager" || r.to === "frontdesk" : r.to === "frontdesk";
  });
}

const nextId = (list: IssueReport[]) => `RPT-${String(list.reduce((n, r) => Math.max(n, Number(r.id.replace(/\D/g, "")) || 0), 0) + 1).padStart(5, "0")}`;

export function addReport(r: Omit<IssueReport, "id" | "at" | "status" | "history">, by: string): IssueReport {
  const list = current();
  const at = new Date().toISOString();
  const rep: IssueReport = { ...r, id: nextId(list), at, status: "new", history: [{ at, by, action: "Report sent" }] };
  commit([rep, ...list]);
  return rep;
}

export function setReportStatus(id: string, status: ReportStatus, by: string, note?: string) {
  const action = status === "attended" ? "Marked attended" : status === "resolved" ? "Resolved" : "Reopened";
  commit(current().map((r) => (r.id === id ? { ...r, status, history: [...r.history, { at: new Date().toISOString(), by, action, note: note?.trim() || undefined }] } : r)));
}
export function addReportNote(id: string, by: string, note: string) {
  commit(current().map((r) => (r.id === id ? { ...r, history: [...r.history, { at: new Date().toISOString(), by, action: "Note added", note: note.trim() }] } : r)));
}

/* ─────────────── sample reports (until the cloud connection) ─────────────── */

const SAMPLES: { to: ReportTo; category: ReportCategory; subject: string; details: string; about?: string; urgent?: boolean; ref?: boolean; resolution: string }[] = [
  { to: "manager", category: "Staff conduct", subject: "Patient says she was spoken to rudely at the front desk", details: "My patient told me the receptionist shouted at her when she asked why the scan costs more than she expected, and would not explain. She was upset and nearly left without doing the test.", about: "Front desk", ref: true, resolution: "Spoke with the receptionist on duty and apologised to the patient by phone. Front desk reminded to explain prices calmly." },
  { to: "frontdesk", category: "Results", subject: "Result is not clear enough for the doctor", details: "The doctor says the report does not state the liver size, which he needs for the follow up. Please ask the radiologist to add it.", ref: true, resolution: "Radiologist added the measurements and the result was resent." },
  { to: "manager", category: "Waiting time", subject: "Patient waited more than two hours", details: "Patient arrived at 9am for a fasting test and was attended to after 11am. She was weak because she had not eaten.", ref: true, urgent: true, resolution: "Fasting patients are now attended to first in the morning." },
  { to: "admin", category: "Billing and prices", subject: "Patient charged more than the price in my app", details: "The app showed the thyroid test as ₦25,000 but the patient was billed ₦30,000 at the branch.", ref: true, resolution: "Branch price list corrected to match the company price; the patient was refunded the difference." },
  { to: "manager", category: "Facility", subject: "No power during the scan, patient sent home", details: "The generator was off and the patient was asked to come back tomorrow. Please let us know when power is off so we don't send patients.", urgent: true, resolution: "Generator fuel schedule fixed. The branch now marks itself closed in the app during outages." },
  { to: "admin", category: "App problem", subject: "My referral is not showing at the branch", details: "I sent a referral in the morning but the front desk says they cannot see it.", ref: true, resolution: "The PR agent's phone was offline; the referral synced once it reconnected." },
  { to: "frontdesk", category: "Results", subject: "Please send the result to the doctor, not only the patient", details: "The patient lost her copy. Kindly share the result with Dr Okafor through the portal.", ref: true, resolution: "Result shared with the referring doctor." },
  { to: "manager", category: "Staff conduct", subject: "Phlebotomist was impatient with an elderly patient", details: "The patient's daughter complained that her mother was rushed and the sample was taken roughly.", about: "Laboratory", ref: true, resolution: "Discussed with the laboratory team; elderly patients get extra time." },
  { to: "frontdesk", category: "Other", subject: "Patient wants to change the appointment day", details: "Patient cannot come tomorrow, she will come on Saturday instead.", ref: true, resolution: "Referral marked Coming later for Saturday." },
  { to: "admin", category: "Staff conduct", subject: "Branch manager not answering calls", details: "I have called the branch manager several times about a patient's result with no answer.", about: "Branch Manager", resolution: "Spoke with the branch manager; calls are now returned the same day." },
];

function sampleReports(): IssueReport[] {
  const agents = BASELINE_AGENTS;
  if (!agents.length) return [];
  const out: IssueReport[] = [];
  const now = Date.now();
  let n = 0;
  for (const b of ACTIVE_BRANCHES) {
    SAMPLES.forEach((s, i) => {
      // Spread over the last four weeks: the oldest are resolved, the middle attended, the newest new.
      const ageH = 3 + i * 61 + (b.id.length % 5) * 7;
      const at = new Date(now - ageH * 3_600_000);
      const ag = agents[(i * 37 + 11) % agents.length]!;
      const status: ReportStatus = i < 3 ? "new" : i < 5 ? "attended" : "resolved";
      const history: ReportStep[] = [{ at: at.toISOString(), by: ag.name, action: "Report sent" }];
      const who = s.to === "admin" ? "Company Administrator" : s.to === "manager" ? "Branch Manager" : "Front desk";
      if (status !== "new") history.push({ at: new Date(at.getTime() + 2 * 3_600_000).toISOString(), by: who, action: "Marked attended" });
      if (status === "resolved") history.push({ at: new Date(at.getTime() + 26 * 3_600_000).toISOString(), by: who, action: "Resolved", note: s.resolution });
      n += 1;
      out.push({
        id: `RPT-${String(n).padStart(5, "0")}`,
        branchId: b.id,
        at: at.toISOString(),
        from: { kind: "agent", name: ag.name, role: "PR agent", agentId: ag.id },
        to: s.to,
        category: s.category,
        subject: s.subject,
        details: s.details,
        patientRef: s.ref ? `${branchPrefix(b.id)}-R${String(732_300 + i * 17).padStart(6, "0")}` : undefined,
        about: s.about,
        urgent: !!s.urgent,
        status,
        history,
      });
    });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}
