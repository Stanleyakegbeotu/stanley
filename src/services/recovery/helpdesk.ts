/**
 * Report an issue — the built-in help desk (owner, 2026-11-22). No AI: it
 * understands a typed message with a fixed guide of STANLEY's pages, tasks and
 * common problems.
 *
 * How a message is understood:
 *  1. Clean it up — lower case, common short forms ("cant", "pls"), Nigerian
 *     Pidgin ("e no dey load", "e dey hang") mapped to plain English.
 *  2. Correct spelling word by word against STANLEY's own vocabulary with
 *     Fuse.js (open-source fuzzy search, Apache-2.0): "bilingg" → "billing".
 *  3. Work out what the person wants:
 *       • problem  ("not loading", "slow", "not saving", "error"…)
 *       • find     ("where is", "can't find", "how do I get to"…)
 *       • how-to   ("how do I…", "how to…")
 *     and which page they mean ("billing", "price list", "receipt"…).
 *  4. Score every guide entry by the words they share (phrases count more than
 *     single words) and answer with the best one — role-aware, so it says
 *     where the page is in THAT person's sidebar, or who to ask if their role
 *     can't open it.
 *  5. A problem with a page → that page is scanned at once (scan.ts focus).
 *
 * Every report is kept (last 60) so managers / the Company Admin can see what
 * people ran into and send it to the developer.
 */
import Fuse from "fuse.js";
import { useSyncExternalStore } from "react";
import { canOpenBranchPage } from "@/shell/navigation";
import type { CheckStatus } from "./scan";

export type Kind = "admin" | "manager" | "staff";
export type Intent = "problem" | "find" | "howto" | "unknown";

/* ─────────────── The pages ─────────────── */

export interface PageGuide {
  id: string;
  label: string;
  /** What it's for, one line. */
  what: string;
  /** Branch page (inside a branch workspace) or company page (Company Admin sidebar). */
  scope: "branch" | "company" | "both";
  /** Words people use for it. */
  words: string[];
}

export const PAGES: PageGuide[] = [
  { id: "dashboard", label: "Dashboard", what: "Today's summary — payments, patient payment status, quick actions.", scope: "both", words: ["dashboard", "home", "main page", "front page", "summary", "overview", "quick actions", "daily payment summary"] },
  { id: "billing", label: "Billing", what: "Register a patient and create a bill: patient → services → payment → preview → receipt.", scope: "branch", words: ["billing", "bill", "bills", "invoice", "new bill", "create bill", "charge", "payment", "pay", "patient registration", "register patient", "new patient", "referral id"] },
  { id: "drafts", label: "Drafts", what: "Unfinished bills, saved automatically — continue or discard them here.", scope: "branch", words: ["drafts", "draft", "unfinished bill", "saved bill", "incomplete bill", "continue bill", "half bill"] },
  { id: "records", label: "Records", what: "Every patient visit — search, open a visit, reprint a receipt.", scope: "branch", words: ["records", "record", "patient list", "patient history", "patients", "visit", "visits", "old patient", "patient details", "reprint", "previous bill"] },
  { id: "patients", label: "Patients", what: "Every patient visit across branches (company view).", scope: "company", words: ["patients", "patient list", "patient directory", "patient history"] },
  { id: "inventory", label: "Inventory", what: "The price list — every test/service, its category and price.", scope: "both", words: ["inventory", "price list", "prices", "price", "services", "tests", "test", "catalogue", "scan price", "xray price", "lab tests", "categories"] },
  { id: "pr", label: "PR Management", what: "PR agents (marketers), the hospitals they bring patients from, commission.", scope: "both", words: ["pr", "pr agent", "pr agents", "agent", "agents", "marketer", "marketers", "referral", "referrer", "hospital", "hospitals", "commission", "payout"] },
  { id: "analysis", label: "Analysis", what: "Money in, trends, most-done tests and the role's reports.", scope: "branch", words: ["analysis", "reports", "report", "statistics", "stats", "trend", "chart", "graph", "performance"] },
  { id: "reports", label: "Reports", what: "Build, preview, print, download (PDF) or export (CSV) reports.", scope: "company", words: ["reports", "report", "pdf", "csv", "export", "statement"] },
  { id: "expenses", label: "Expenses", what: "Record branch spending; managers approve or reject.", scope: "branch", words: ["expenses", "expense", "spending", "spent", "cost", "costs", "purchase", "outsourced", "approve expense", "petty cash", "diesel", "fuel"] },
  { id: "finance", label: "Finance & Expenses", what: "Money in, costs and net profit (Company Admin).", scope: "company", words: ["finance", "profit", "net profit", "money", "revenue", "income", "outstanding"] },
  { id: "staff", label: "Staff Management", what: "The branch team — manager and front-desk accounts.", scope: "both", words: ["staff", "staff management", "employee", "employees", "team", "worker", "workers", "front desk", "manager", "add staff"] },
  { id: "branches", label: "Branches", what: "Every branch — add, open, suspend (Company Admin).", scope: "company", words: ["branches", "branch", "new branch", "add branch", "location"] },
  { id: "settings", label: "Settings", what: "Your profile, about your account, theme, system health, report an issue.", scope: "both", words: ["settings", "setting", "profile", "my profile", "photo", "picture", "password", "theme", "colour", "color", "account", "my role", "permissions"] },
  { id: "audit", label: "Audit", what: "Read-only history of every change, who made it and when.", scope: "both", words: ["audit", "audit log", "history", "log", "who changed", "who deleted", "activity"] },
  { id: "trash", label: "Trash", what: "Anything deleted, kept 30 days so it can be restored.", scope: "both", words: ["trash", "deleted", "delete", "bin", "recycle", "restore", "removed", "recover"] },
  { id: "notifications", label: "Notifications", what: "Alerts — daily summary, big bills, unpaid balances, payouts.", scope: "both", words: ["notifications", "notification", "alerts", "alert", "bell"] },
];

/* ─────────────── The guide ─────────────── */

export interface GuideEntry {
  id: string;
  intent: Exclude<Intent, "unknown">;
  title: string;
  /** Typical ways people say it (scored as phrases). */
  phrases: string[];
  /** Answer, plain words. */
  answer: string;
  steps?: string[];
  /** Page this is about (link + access check). */
  page?: string;
  /** Who can do it; others are told who can. */
  roles?: Kind[];
  /** Run a focused scan of this page (problems). "all" = full scan. */
  scan?: string;
}

const ALL: Kind[] = ["admin", "manager", "staff"];
const BRANCH: Kind[] = ["manager", "staff"];

export const GUIDE: GuideEntry[] = [
  // ── How-to ──
  { id: "create-bill", intent: "howto", title: "Create a bill", page: "billing", roles: BRANCH, phrases: ["create a bill", "make a bill", "new bill", "bill a patient", "register a patient", "add a patient", "start billing", "how do i bill"], answer: "Bills are created on the Billing page, in four short steps.", steps: ["Open Billing in the sidebar.", "Press “Start new patient billing” (or “Enter referral ID” for a patient sent by a PR agent).", "Step 1 Patient: name (and phone if known), walk-in or referred.", "Step 2 Services: tap the tests — “Most done services” are one tap.", "Step 3 Payment: amount paid and method (Cash / POS / Transfer). A balance needs a reason and who approved it.", "Step 4 Preview: check, then Save — the receipt appears for printing."] },
  { id: "referral-id", intent: "howto", title: "Bill a patient with a referral ID", page: "billing", roles: BRANCH, phrases: ["referral id", "referral number", "pr agent patient", "referred patient", "abj-r"], answer: "Patients sent by a PR agent come with a referral ID like ABJ-R000123.", steps: ["Billing → “Enter referral ID”.", "Type the 6 digits after ABJ-R.", "If it's not found while offline, connect to the internet — referral IDs come from the PR agents' app. Online and still not found: check the number, or bill as a new patient and pick the PR agent by hand."] },
  { id: "continue-draft", intent: "howto", title: "Continue an unfinished bill", page: "drafts", roles: BRANCH, phrases: ["continue a bill", "unfinished bill", "resume bill", "where is my draft", "bill i didnt finish", "saved bill", "lost my bill", "power went off during billing", "light went off"], answer: "Bills are saved automatically as drafts while you type — even if the power goes off.", steps: ["Open Drafts in the sidebar (Billing also shows “N unfinished bills”).", "Find the patient's name and press Continue.", "It opens at the step you stopped."] },
  { id: "reprint", intent: "howto", title: "Reprint a receipt", page: "records", roles: ALL, phrases: ["reprint receipt", "print receipt again", "old receipt", "receipt copy", "lost receipt", "duplicate receipt"], answer: "Every saved bill's receipt can be printed again from the patient's visit record.", steps: ["Open Records (Patients for the Company Admin).", "Search the patient's name, Patient ID or visit number.", "Open the visit → “Print receipt”.", "Choose 58 mm / 80 mm till roll or A5, then Print, Download PDF or Export PNG."] },
  { id: "price-quote", intent: "howto", title: "Give a price quote / check a price", page: "inventory", roles: BRANCH, phrases: ["price quote", "how much is", "check price", "price calculator", "quotation", "enquiry", "cost of a test", "price of"], answer: "Use the Price calculator in the header (top of every branch page) — it never creates a bill.", steps: ["Press “Price calculator” in the header.", "Search or tap categories, add tests to the quote.", "Print or download the quote (marked “PRICE ENQUIRY · NOT PAID”).", "To just look up prices, open Inventory (the price list)."] },
  { id: "change-price", intent: "howto", title: "Change a price or give a discount", page: "inventory", roles: ["admin", "manager"], phrases: ["change price", "edit price", "update price", "give discount", "discount", "reduce price", "vip price", "price override"], answer: "Branch Managers (and the Company Admin) can change a price for one bill (VIP price) in Billing step 2, give a discount in step 3, or edit the price list in Inventory. Front desk can't — ask your Branch Manager.", steps: ["One bill only: Billing → step 2 → the service's price → change it (the price list stays the same).", "Permanent: Inventory → the service → edit price (managers / Company Admin)."] },
  { id: "record-expense", intent: "howto", title: "Record an expense", page: "expenses", roles: BRANCH, phrases: ["record expense", "add expense", "enter expense", "spent money", "bought", "diesel", "fuel", "outsourced test", "partner lab"], answer: "Expenses are recorded on the Expenses page and must name who approved them.", steps: ["Open Expenses → “Record expense”.", "Pick the category, enter amount and description.", "Choose “Already approved” + who approved it, or “Send for approval” (the manager approves or rejects).", "Only approved expenses count as spent."] },
  { id: "approve-expense", intent: "howto", title: "Approve or reject an expense", page: "expenses", roles: ["admin", "manager"], phrases: ["approve expense", "reject expense", "pending expense", "expense approval"], answer: "Branch Managers and the Company Admin approve expenses. A rejection needs a reason.", steps: ["Expenses → filter “Pending”.", "Open the expense → Approve, or Reject with a reason."] },
  { id: "balance", intent: "howto", title: "Record part payment / a balance", page: "billing", roles: BRANCH, phrases: ["part payment", "balance", "owing", "owes", "outstanding", "not paid", "pay later", "debt", "promise to pay"], answer: "In Billing step 3 enter what was paid. Anything left needs a reason and who approved it (usually the Branch Manager), and can have a promised payment date.", steps: ["Outstanding balances: Dashboard → “Outstanding balances” card.", "When the patient pays the rest it is recorded as a balance recovered."] },
  { id: "add-staff", intent: "howto", title: "Add a staff member", page: "staff", roles: ["admin", "manager"], phrases: ["add staff", "new staff", "employ", "add front desk", "create account", "new worker"], answer: "Branch Managers and the Company Admin add staff in Staff Management. Each branch has one manager; everyone else is Front Desk.", steps: ["Staff Management → “Add staff”.", "Fill in name, role (Front Desk), contact and start date → Save."] },
  { id: "restore-trash", intent: "howto", title: "Restore something deleted", page: "trash", roles: ["admin", "manager"], phrases: ["restore", "undo delete", "deleted by mistake", "bring back", "recover deleted", "deleted a draft", "deleted staff"], answer: "Nothing in STANLEY is deleted outright — it goes to Trash for 30 days.", steps: ["Open Trash.", "Find the item → Restore.", "Front desk can see Trash but restoring is for managers — ask your Branch Manager."] },
  { id: "photo", intent: "howto", title: "Change my profile photo or details", page: "settings", roles: ALL, phrases: ["change photo", "profile picture", "my picture", "change my name", "my phone number", "edit profile", "my details"], answer: "Settings → My profile. Your role and branch are set by your manager / the Company Admin.", steps: ["Settings → My profile.", "Upload or remove the photo; edit your contact details → Save."] },
  { id: "theme", intent: "howto", title: "Change the colours (theme)", page: "settings", roles: ALL, phrases: ["change colour", "change color", "theme", "dark mode", "appearance", "background colour"], answer: "Settings → Appearance. The theme applies to the whole app on this computer. There is no dark mode." },
  { id: "my-role", intent: "howto", title: "What my role can do", page: "settings", roles: ALL, phrases: ["what can i do", "my role", "my permissions", "my duties", "my tasks", "what am i allowed", "why cant i see", "access denied", "not part of your work"], answer: "Settings → About my account explains your role in plain words: what you do, what you can and can't do, and who to ask. Pages outside your role show “not part of your work” — that isn't an error." },
  { id: "backup", intent: "howto", title: "Backups", page: "settings", roles: ALL, phrases: ["backup", "back up", "save my data", "copy my data", "restore backup", "data safe", "keep data safe"], answer: "STANLEY backs itself up every day automatically (the last 7 days are kept, never more). Settings → System health shows the last backup; managers and the Company Admin can download one, choose a backup folder, or restore." },
  { id: "reports-make", intent: "howto", title: "Make a report", page: "analysis", roles: ALL, phrases: ["make report", "print report", "monthly report", "daily report", "export report", "report for accountant", "download report", "excel"], answer: "Branch staff: Analysis → pick a report card → “Create report” (3 steps, preview before printing). Company Admin: Reports. Every report prints, downloads as PDF or exports to CSV (opens in Excel)." },
  { id: "payout", intent: "howto", title: "PR agents' commission payout", page: "pr", roles: ["admin", "manager"], phrases: ["commission", "payout", "pay pr agents", "agent payment", "marketer payment", "bank details"], answer: "Reports → PR agents → “Monthly commission payout” lists each agent's commission grouped by bank. Commission = full bill of each referred patient × the agent's rate." },

  // ── Problems ──
  { id: "page-not-loading", intent: "problem", title: "A page isn't loading", scan: "page", roles: ALL, phrases: ["not loading", "wont load", "doesnt load", "not opening", "wont open", "blank page", "white screen", "empty page", "page is blank", "keeps loading", "stuck loading", "not showing", "page error", "something went wrong", "crashed", "crash", "broken"], answer: "Let's check that page now." },
  { id: "slow", intent: "problem", title: "STANLEY is slow or freezing", scan: "all", roles: ALL, phrases: ["slow", "very slow", "lagging", "lag", "freezing", "frozen", "hanging", "hang", "not responding", "takes long", "taking time", "delay", "sluggish", "stuck"], answer: "Let's measure the speed and look for the cause." },
  { id: "not-saving", intent: "problem", title: "Changes aren't saving", scan: "all", roles: ALL, phrases: ["not saving", "wont save", "didnt save", "changes lost", "save failed", "couldnt save", "storage full", "disk full"], answer: "Let's check saving and storage space." },
  { id: "data-missing", intent: "problem", title: "Something is missing", scan: "all", roles: ALL, phrases: ["missing", "disappeared", "gone", "lost", "cant see my", "data lost", "records missing", "bill missing", "patient missing", "vanished", "empty"], answer: "Let's check the saved data. Also: deleted items are in Trash for 30 days, unfinished bills are in Drafts, and filters (date, branch, search) can hide records — clear them first." },
  { id: "wrong-date", intent: "problem", title: "Wrong date or time", scan: "all", roles: ALL, phrases: ["wrong date", "wrong time", "date is wrong", "time is wrong", "yesterday date", "date not correct", "clock", "time zone"], answer: "STANLEY uses this computer's clock. Let's check it." },
  { id: "print", intent: "problem", title: "Printing doesn't work", roles: ALL, phrases: ["cant print", "printer", "not printing", "print not working", "receipt not printing", "printout", "paper"], answer: "Printing goes through the computer's printer settings.", steps: ["Check the printer is on, has paper, and is connected (cable or Wi-Fi).", "In the print box, choose the right printer (not “Save as PDF”).", "Till-roll printers: pick 58 mm or 80 mm in STANLEY to match the roll.", "Try “Download PDF” and print the PDF instead.", "Still failing: restart the printer and the computer. If other programs can't print either, it's the printer, not STANLEY."] },
  { id: "offline", intent: "problem", title: "No internet / offline", roles: ALL, phrases: ["no internet", "offline", "network", "no network", "no connection", "data finished", "wifi", "sync", "not syncing"], answer: "STANLEY works fully offline — billing, receipts, records, reports all keep working. Only referral-ID lookups need internet. Bills wait on this computer for the cloud database (not connected yet)." },
  { id: "referral-not-found", intent: "problem", title: "Referral ID not found", page: "billing", roles: BRANCH, phrases: ["referral not found", "referral id not working", "cant find referral", "invalid referral"], answer: "Referral IDs come from the PR agents' phone app through the cloud.", steps: ["Connect to the internet and try again.", "Check the 6 digits with the patient / agent.", "It may not have synced from the agent's phone yet — bill as a new patient and pick the PR agent by hand."] },
  { id: "cant-login", intent: "problem", title: "Can't sign in / wrong account", roles: ALL, phrases: ["cant login", "cant sign in", "password", "forgot password", "logged out", "wrong account", "locked out"], answer: "Sign-in with passwords isn't connected in this version — accounts are switched with “Switch account (demo)” in the header. Your Branch Manager or the Company Admin manages accounts." },
  { id: "wrong-price", intent: "problem", title: "A price is wrong", page: "inventory", roles: ALL, phrases: ["wrong price", "price is wrong", "price changed", "price not correct", "incorrect price", "overcharged"], answer: "Prices come from the price list (Inventory). Branch Managers can change one bill's price (VIP price) or edit the list; front desk can't — ask your Branch Manager. Every price change is in the Audit log." },
  { id: "scan", intent: "problem", title: "Scan for errors", scan: "all", roles: ALL, phrases: ["scan for errors", "check for errors", "run a scan", "scan the system", "check the system", "system check", "full scan", "is everything ok"], answer: "Running a full check of STANLEY and this computer." },
  { id: "error-message", intent: "problem", title: "An error message appeared", scan: "page", roles: ALL, phrases: ["error", "error message", "red message", "warning", "failed", "problem", "issue", "bug"], answer: "Let's scan where it happened. STANLEY's own error screens explain the problem in plain words and keep everything else working." },
];

/* ─────────────── Understanding the message ─────────────── */

const SHORT: [RegExp, string][] = [
  [/\bcan'?t\b|\bcannot\b|\bcant\b/g, "cant"],
  [/\bwon'?t\b/g, "wont"],
  [/\b(don|doesn|didn|isn|couldn|wouldn)'?t\b/g, "$1t"],
  [/\bpls\b|\bplz\b|\bplease\b|\bkindly\b|\bsir\b|\bma\b/g, ""],
  [/\bu\b/g, "you"],
  [/\bur\b/g, "your"],
  [/\bpg\b/g, "page"],
  [/\bpix\b|\bpic\b/g, "picture"],
  [/\blight\b(?= (went|go|don|has|is) (off|out))/g, "power"],
  [/\bnepa\b|\bphcn\b|\bblackout\b/g, "power"],
  // Nigerian Pidgin
  [/\bno dey (load|open|show|work)\b/g, "not $1ing"],
  [/\bno gree (load|open|work|save)\b/g, "wont $1"],
  [/\bdey hang\b|\bdey freeze\b/g, "freezing"],
  [/\bdey slow\b|\bslow die\b/g, "very slow"],
  [/\bwhere i (go|fit) (see|find)\b/g, "where is"],
  [/\bhow i (go|fit|take)\b/g, "how do i"],
  [/\bdon (lost|loss|miss|go)\b/g, "missing"],
  [/\be don spoil\b|\bspoil\b/g, "broken"],
];

const STOP = new Set("a an the i me my we our you your it its is are was were be been am to of in on at for and or but so with this that there here do does did have has had just now please help want need some any can could would should will shall from by as up out about into than then them they he she his her what".split(" "));
/** Everyday words that must never be "spelling-corrected" into a STANLEY word (while → white). */
const COMMON = new Set("while which when whole where were there their these those after before again still today yesterday morning evening every thing things something someone work working worked always never often other others since until because really very much many little first last next time times right left people person customer customers".split(" "));

function normalise(text: string): string {
  let t = ` ${text.toLowerCase().replace(/[’`]/g, "'")} `;
  for (const [re, rep] of SHORT) t = t.replace(re, rep);
  return t.replace(/[^a-z0-9\- ]+/g, " ").replace(/\s+/g, " ").trim();
}

// Vocabulary for spelling correction: every word the guide and pages use.
const VOCAB = Array.from(new Set([...PAGES.flatMap((p) => p.words), ...GUIDE.flatMap((g) => [...g.phrases, g.title.toLowerCase()])].flatMap((s) => normalise(s).split(" ")).filter((w) => w.length > 2 && !STOP.has(w))));
const vocabFuse = new Fuse(VOCAB, { threshold: 0.34, ignoreLocation: true, includeScore: true, minMatchCharLength: 3 });

/** Fix spelling word by word ("bilingg" → "billing", "recipt" → "receipt"). */
function correct(words: string[]): string[] {
  return words.map((w) => {
    if (w.length < 4 || VOCAB.includes(w) || STOP.has(w) || COMMON.has(w) || /\d/.test(w)) return w;
    const hit = vocabFuse.search(w, { limit: 1 })[0];
    return hit && (hit.score ?? 1) < 0.34 ? hit.item : w;
  });
}

const PROBLEM_CUES = ["not", "wont", "cant", "error", "slow", "freez", "hang", "stuck", "blank", "crash", "broken", "missing", "lost", "fail", "wrong", "problem", "issue", "bug", "disappear", "gone", "lag", "empty", "spoil"];
const FIND_CUES = ["where", "find", "locate", "see the", "get to", "go to", "open the", "which page", "cant find", "cant see", "look for"];
const HOW_CUES = ["how do", "how to", "how can", "how i", "steps", "way to", "teach", "show me", "explain"];

export interface Understanding {
  intent: Intent;
  /** Pages mentioned, best first. */
  pages: PageGuide[];
  /** Best guide entries, best first, with a 0–1 confidence. */
  matches: { entry: GuideEntry; score: number }[];
  cleaned: string;
}

export function understand(text: string): Understanding {
  const cleaned = correct(normalise(text).split(" ").filter(Boolean)).join(" ");
  const padded = ` ${cleaned} `;
  const tokens = new Set(cleaned.split(" ").filter((w) => w.length > 1 && !STOP.has(w)));
  const has = (cue: string) => padded.includes(cue.includes(" ") ? ` ${cue}` : cue);

  // Pages: longest matching name wins (e.g. "price list" before "price").
  const pageScores = PAGES.map((p) => {
    let s = 0;
    for (const w of p.words) {
      const nw = normalise(w);
      if (padded.includes(` ${nw} `)) s = Math.max(s, nw.split(" ").length * 2 + (nw === normalise(p.label) ? 1 : 0));
    }
    return { p, s };
  })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);

  const problem = PROBLEM_CUES.some(has);
  const find = FIND_CUES.some(has);
  const how = HOW_CUES.some(has);

  const matches = GUIDE.map((entry) => {
    let s = 0;
    for (const ph of entry.phrases) {
      const np = normalise(ph);
      const words = np.split(" ").filter((w) => !STOP.has(w));
      if (padded.includes(` ${np} `)) s += 3 + words.length * 2;
      else {
        const hit = words.filter((w) => tokens.has(w) || [...tokens].some((t) => t.length > 4 && (t.startsWith(w) || w.startsWith(t)))).length;
        if (hit && words.length) s += (hit / words.length) * words.length * 1.2;
      }
    }
    if (entry.page && pageScores.some((x) => x.p.id === entry.page)) s += 2;
    if (entry.intent === "problem" && problem) s += 2;
    if (entry.intent === "howto" && how) s += 2;
    return { entry, s };
  })
    .filter((x) => x.s > 1.5)
    .sort((a, b) => b.s - a.s)
    .slice(0, 4);
  const top = matches[0]?.s ?? 0;

  let intent: Intent = "unknown";
  // "where is billing" / "can't find the price list" → find, even though "cant" is a problem cue.
  if (find && pageScores.length && !/(not|wont) (load|open|show|work)/.test(cleaned)) intent = "find";
  else if (problem) intent = "problem";
  else if (how) intent = "howto";
  else if (matches[0]) intent = matches[0].entry.intent;
  else if (pageScores.length) intent = "find";

  return { intent, pages: pageScores.map((x) => x.p), matches: matches.map((m) => ({ entry: m.entry, score: Math.min(1, m.s / Math.max(8, top)) })), cleaned };
}

/** Where a page is for this person, in plain words, and whether they can open it. */
export function locate(page: PageGuide, who: { kind: Kind; role: string; branchId?: string; branchName?: string }): { canOpen: boolean; where: string; to?: string } {
  if (who.kind === "admin") {
    if (page.scope === "branch")
      return { canOpen: true, where: `${page.label} is a branch page. In the sidebar open Branches, choose the branch, then ${page.label} in that branch's sidebar.${page.id === "billing" ? " (By the company's rules the Company Admin doesn't create bills — that's the branch's work.)" : ""}`, to: "/branches" };
    const path = page.id === "notifications" ? "/notifications" : `/${page.id}`;
    return { canOpen: true, where: `${page.label} is in your sidebar on the left${page.id === "notifications" ? " (the bell at the top right)" : ""}.`, to: path };
  }
  if (page.scope === "company")
    return { canOpen: false, where: `${page.label} is a Company Admin page. ${page.id === "patients" ? "At your branch, patients are on the Records page." : page.id === "reports" ? "At your branch, reports are on the Analysis page." : page.id === "finance" ? "Net profit and company finance are only for the Company Admin." : page.id === "branches" ? "Branches are managed by the Company Admin." : ""}`.trim() };
  if (!who.branchId) return { canOpen: false, where: `${page.label} is inside the branch workspace.` };
  if (page.id === "notifications") return { canOpen: true, where: "Notifications are the bell at the top right of the header.", to: `/branch/${who.branchId}/notifications` };
  const ok = canOpenBranchPage(who.role, page.id);
  return ok
    ? { canOpen: true, where: `${page.label} is in your sidebar on the left.`, to: `/branch/${who.branchId}/${page.id}` }
    : { canOpen: false, where: `${page.label} isn't part of the ${who.role} role, so it isn't in your sidebar. Ask your Branch Manager or the Company Admin if you need it for your work.` };
}

export const pageById = (id: string) => PAGES.find((p) => p.id === id);

/* ─────────────── Reported issues log ─────────────── */

export interface IssueReport {
  id: string;
  at: string;
  by: string;
  role: string;
  kind: Kind;
  branchId: string | null;
  message: string;
  intent: Intent;
  page: string | null;
  /** What STANLEY answered (guide entry title). */
  answer: string | null;
  scanVerdict: CheckStatus | null;
  /** solved = self-help answered it; developer = sent on; open = waiting. */
  status: "solved" | "open" | "developer";
  /** Full plain-text report for the developer (scan + incidents). */
  report?: string;
}

const KEY = "stanley.issues.v1";
let issues: IssueReport[] = (() => {
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as IssueReport[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
})();
const listeners = new Set<() => void>();
function save() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(issues));
  } catch {
    /* kept for this session */
  }
  listeners.forEach((l) => l());
}

export function useIssues(): IssueReport[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => issues,
    () => issues,
  );
}

export function addIssue(i: Omit<IssueReport, "id" | "at">): IssueReport {
  const r: IssueReport = { ...i, id: `ISS-${Date.now().toString(36).toUpperCase()}`, at: new Date().toISOString() };
  issues = [r, ...issues].slice(0, 60);
  save();
  return r;
}

export function updateIssue(id: string, patch: Partial<IssueReport>) {
  issues = issues.map((x) => (x.id === id ? { ...x, ...patch } : x));
  save();
}
