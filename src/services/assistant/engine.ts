/**
 * The two built-in engines behind STANLEY AI (no AI model — rules + records):
 *
 *  • intelligence — figures from STANLEY's calculation services (insights.ts)
 *    for the person's scope and period; "where is / how do I" questions are
 *    answered from the help desk guide; problem reports are offered a switch
 *    to Report an issue.
 *  • issues — the help desk (recovery/helpdesk.ts): find a page, show steps,
 *    or run a REAL scan (including opening a hidden test copy of the page).
 *
 * Both follow rules.ts. A future AI engine plugs in beside these and returns
 * the same message blocks.
 */
import type { DateRange } from "@/data/types";
import { logAudit } from "@/services/audit";
import { answerQuestion } from "@/services/insights";
import { priorRange, summarize } from "@/services/analytics";
import { addIssue, understand, updateIssue, type Kind } from "@/services/recovery/helpdesk";
import { reportText, runScan, type ScanReport } from "@/services/recovery/scan";
import { routeArea } from "@/services/recovery/health";
import { probePage } from "./probe";
import { addMessage, ensureConversation, patchMessage, type Block, type Message, type Mode } from "./store";

export interface EngineContext {
  user: { name: string; role: string; kind: Kind; branchId?: string };
  /** Branches the person is looking at (their branch, or the company context). */
  branchIds: string[];
  range: DateRange;
  /** "Abuja branch · This month" */
  scopeLabel: string;
  /** For the developer report. */
  report: { branch?: string; company: string; version: string };
}

export async function send(mode: Mode, text: string, ctx: EngineContext): Promise<void> {
  const msg = text.trim();
  if (!msg) return;
  const conv = ensureConversation(mode);
  addMessage(conv.id, { role: "user", blocks: [{ type: "text", text: msg }] });
  if (mode === "intelligence") return intelligence(conv.id, msg, ctx);
  return issues(conv.id, msg, ctx);
}

/* ─────────────── STANLEY Intelligence ─────────────── */

function intelligence(convId: string, q: string, ctx: EngineContext) {
  const u = understand(q);
  const top = u.matches[0];
  const blocks: Block[] = [];

  // Rule: net profit / margin is for the Company Admin only.
  if (ctx.user.kind !== "admin" && /\b(profit|margin|net)\b/i.test(q)) {
    blocks.push({ type: "text", text: "Net profit and margin are only for the Company Admin (company rule). I can tell you money in, payments, expenses and balances for your branch instead.", meta: ctx.scopeLabel });
  } else if (u.intent === "problem" && (top?.score ?? 0) > 0.5) {
    // Sounds like something is wrong — that's the support desk's job.
    blocks.push({ type: "switch", mode: "issues", text: "That sounds like a problem with STANLEY. Report an issue can check it for you — it runs a real check and explains how to fix it.", prompt: q });
  } else if ((u.intent === "find" || u.intent === "howto") && (u.pages[0] || (top?.score ?? 0) > 0.55) && !/\b(how much|how many|revenue|total|paid|balance|owe)\b/i.test(q)) {
    if (u.intent === "find" && u.pages[0]) blocks.push({ type: "locate", pageId: u.pages[0].id });
    else if (top) blocks.push({ type: "guide", entryId: top.entry.id });
  } else {
    const summary = summarize(ctx.branchIds, ctx.range);
    const pr = priorRange(ctx.range);
    const prior = pr ? summarize(ctx.branchIds, pr) : null;
    blocks.push({ type: "text", text: answerQuestion(q, ctx.branchIds, ctx.range, summary, prior), meta: ctx.scopeLabel });
  }
  addMessage(convId, { role: "assistant", blocks });
}

/* ─────────────── Report an issue ─────────────── */

async function issues(convId: string, msg: string, ctx: EngineContext) {
  const u = understand(msg);
  const top = u.matches[0]?.entry;
  const page = u.pages[0];
  const issue = addIssue({ by: ctx.user.name, role: ctx.user.role, kind: ctx.user.kind, branchId: ctx.user.branchId ?? null, message: msg, intent: u.intent, page: page?.id ?? top?.page ?? null, answer: top?.title ?? null, scanVerdict: null, status: "open" });
  logAudit({ category: "System", action: "Issue reported", record: issue.id, details: msg.slice(0, 160), branchId: ctx.user.branchId ?? null });

  if (u.intent !== "problem") {
    const blocks: Block[] = [];
    if (u.intent === "find" && page) {
      blocks.push({ type: "locate", pageId: page.id });
      if (top && top.page === page.id && (u.matches[0]?.score ?? 0) > 0.6 && (!top.roles || top.roles.includes(ctx.user.kind))) blocks.push({ type: "guide", entryId: top.id, compact: true });
    } else if (top && (u.matches[0]?.score ?? 0) > 0.35) {
      blocks.push({ type: "guide", entryId: top.id });
      const more = u.matches.slice(1).map((m) => m.entry.id);
      if (more.length) blocks.push({ type: "suggest", title: "Related:", entryIds: more });
    } else {
      blocks.push({ type: "text", text: "I couldn't match that to a page or a known problem. Try naming the page (e.g. “billing”, “records”, “price list”) and what happens (e.g. “not loading”, “slow”, “wrong date”) — or send it to your developer below." });
      blocks.push({ type: "suggest", title: u.matches.length ? "Did you mean one of these?" : "People often ask:", entryIds: u.matches.length ? u.matches.map((m) => m.entry.id) : ["create-bill", "continue-draft", "reprint", "slow", "page-not-loading"] });
    }
    addMessage(convId, { role: "assistant", blocks, issueId: issue.id });
    return;
  }

  // A problem: run a real scan — of the page they named, or of everything.
  const lead = page ? `I understood: a problem with ${page.label}. I'm checking it now — including opening a hidden test copy of the page.` : `I understood: ${top ? top.title.toLowerCase() : "something isn't working"}. I'm running a full scan now.`;
  const reply = addMessage(convId, { role: "assistant", blocks: [{ type: "text", text: lead }], pending: "Starting…", issueId: issue.id });
  const scan = await runScan({ user: ctx.user, branchId: ctx.user.branchId, focus: page?.id, probe: probePage, onStep: (label) => patchMessage(convId, reply.id, { pending: label }) });
  const blocks: Block[] = [{ type: "text", text: page ? `I checked ${page.label}.` : "I ran a full scan." }, { type: "scan", report: scan, pageLabel: page?.label }];
  if (top && top.intent === "problem" && !["page-not-loading", "error-message", "scan"].includes(top.id)) blocks.push({ type: "guide", entryId: top.id });
  patchMessage(convId, reply.id, { pending: undefined, blocks });
  updateIssue(issue.id, { scanVerdict: scan.verdict, status: scan.verdict === "developer" ? "developer" : "open", report: reportText(scan, { user: ctx.user, ...ctx.report, note: msg }) });
}

/** Report for the developer for one answer (runs a full scan if the answer had none). */
export async function developerReport(convId: string, m: Message, question: string, ctx: EngineContext): Promise<string> {
  let scan = m.blocks.find((b): b is Extract<Block, { type: "scan" }> => b.type === "scan")?.report as ScanReport | undefined;
  if (!scan) {
    patchMessage(convId, m.id, { pending: "Collecting details for your developer…" });
    scan = await runScan({ user: ctx.user, branchId: ctx.user.branchId, probe: probePage, onStep: (label) => patchMessage(convId, m.id, { pending: label }) });
    patchMessage(convId, m.id, { pending: undefined });
  }
  const text = reportText(scan, { user: ctx.user, ...ctx.report, note: question });
  if (m.issueId) updateIssue(m.issueId, { status: "developer", report: text, scanVerdict: scan.verdict });
  return text;
}

export const focusLabel = (r: ScanReport) => (r.focus ? routeArea(r.focus) : null);
