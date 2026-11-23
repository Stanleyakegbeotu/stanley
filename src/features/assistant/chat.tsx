/**
 * Shared pieces of the STANLEY AI chat — used by the small pop-up and by the
 * full workspace page, so both show the same conversation the same way.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowRight, BarChart3, BookOpen, Bot, CheckCircle2, Compass, FileText, Gauge, LifeBuoy, MessageSquareWarning, Plus, Send, Sparkles, Stethoscope, ThumbsDown, ThumbsUp, UserRound, Wallet, AlertCircle, ArrowLeftRight, type LucideIcon } from "lucide-react";
import { useApp } from "@/app/AppState";
import { branchRoute } from "@/app/router";
import { getBranch } from "@/data/company";
import { periodLabel, resolveBranchIds, resolveRange } from "@/services/analytics";
import { companyName } from "@/services/settingsStore";
import { GUIDE, locate, pageById, updateIssue } from "@/services/recovery/helpdesk";
import { developerReport, send, type EngineContext } from "@/services/assistant/engine";
import { patchMessage, setDockMode, type Block, type Conversation, type Message, type Mode } from "@/services/assistant/store";
import { reportText, type CheckResult, type ScanReport } from "@/services/recovery/scan";
import { Button } from "@/shared/ui/controls";
import { DeveloperDialog, ScanResults, useResultActions, verdictText } from "@/features/recovery/SystemHealth";
import pkg from "../../../package.json";

/* ─────────────── Modes ─────────────── */

export interface ModeInfo {
  label: string;
  badge: string;
  icon: LucideIcon;
  intro: string;
  placeholder: string;
  activityTitle: string;
}

export const MODES: Record<Mode, ModeInfo> = {
  intelligence: {
    label: "STANLEY Intelligence",
    badge: "Intelligence Workspace",
    icon: Sparkles,
    intro: "Ask about your branches: revenue, payments, patients, referrals and daily activity — answered from your STANLEY records.",
    placeholder: "Type a message to STANLEY Intelligence…",
    activityTitle: "Intelligence Activity",
  },
  issues: {
    label: "Report an issue",
    badge: "Support Desk",
    icon: MessageSquareWarning,
    intro: "Tell STANLEY what's wrong — or what you're looking for — in your own words. It points you to the right page, shows the steps, or runs a real check and explains how to fix it.",
    placeholder: "Describe the problem, e.g. “My billing page is not loading”…",
    activityTitle: "Support Activity",
  },
};

export interface Suggestion {
  icon: LucideIcon;
  title: string;
  text: string;
  prompt: string;
}

export function suggestionsFor(mode: Mode, kind: "admin" | "manager" | "staff"): Suggestion[] {
  if (mode === "issues")
    return [
      { icon: Stethoscope, title: "Scan for errors", text: "Check STANLEY and this computer now — real checks, nothing guessed.", prompt: "Scan for errors" },
      { icon: Compass, title: "Find a page", text: "Ask where something is — STANLEY shows where it is in your sidebar.", prompt: "Where do I find the price list?" },
      { icon: Gauge, title: "STANLEY is slow", text: "Measure speed and find what's slowing it down.", prompt: "STANLEY is very slow" },
      { icon: BookOpen, title: "How do I…?", text: "Step-by-step help for everyday tasks.", prompt: "How do I reprint a receipt?" },
    ];
  return [
    { icon: BarChart3, title: kind === "admin" ? "Analyse branch performance" : "Analyse branch performance", text: kind === "admin" ? "Compare revenue, payments and patients across branches." : "Revenue, payments and patients for your branch.", prompt: kind === "admin" ? "Which branch leads revenue?" : "How is revenue?" },
    { icon: FileText, title: "Prepare a business report", text: kind === "admin" ? "Open Reports to preview, print or download reports." : "Open Analysis to preview, print or download reports.", prompt: "How do I make a report?" },
    { icon: Wallet, title: "Check collections", text: "How much has been paid against what was billed.", prompt: "How are collections?" },
    { icon: AlertCircle, title: "Find outstanding balances", text: "Where unpaid balances are building up.", prompt: "Where are balances building up?" },
  ];
}

/* ─────────────── Context for the engines ─────────────── */

export function useEngineContext(): EngineContext {
  const { user, route, context, period } = useApp();
  const br = branchRoute(route);
  return useMemo(() => {
    const branchId = br?.branchId ?? (user.kind !== "admin" ? user.branchId : undefined);
    const branchIds = branchId ? resolveBranchIds(branchId) : resolveBranchIds(context);
    const b = branchId ? getBranch(branchId) : context !== "all" ? getBranch(context) : undefined;
    const scope = b ? `${b.name} branch` : "All branches";
    return {
      user: { name: user.name, role: user.role, kind: user.kind, branchId: user.kind === "admin" ? branchId : user.branchId },
      branchIds,
      range: resolveRange(period),
      scopeLabel: `${scope} · ${periodLabel(period)}`,
      report: { branch: b ? `${b.name} (${b.code})` : undefined, company: companyName(), version: pkg.version },
    };
  }, [user, br?.branchId, context, period]); // eslint-disable-line react-hooks/exhaustive-deps
}

/* ─────────────── Welcome ─────────────── */

export function Welcome({ mode, compact, onSend }: { mode: Mode; compact?: boolean; onSend: (t: string) => void }) {
  const { user } = useApp();
  const info = MODES[mode];
  const cards = suggestionsFor(mode, user.kind);
  return (
    <div className={`ai-welcome ${compact ? "is-compact" : ""}`}>
      <span className="ai-welcome-mark" aria-hidden="true">
        <info.icon size={compact ? 22 : 30} />
      </span>
      <h2>
        Good to see you, {user.firstName || user.name.split(" ")[0]} <span aria-hidden="true">👋</span>
      </h2>
      <h3>{mode === "issues" ? "What's not working, or what are you looking for?" : "What would you like us to work on today?"}</h3>
      {!compact && <p>{info.intro}</p>}
      <div className="ai-cards">
        {cards.map((c) => (
          <button key={c.title} type="button" className="ai-card" onClick={() => onSend(c.prompt)}>
            <span className="ai-card-icon" aria-hidden="true">
              <c.icon size={compact ? 16 : 20} />
            </span>
            <span className="ai-card-text">
              <b>{c.title}</b>
              {!compact && <small>{c.text}</small>}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─────────────── Thread ─────────────── */

export function Thread({ conv, compact }: { conv: Conversation; compact?: boolean }) {
  const end = useRef<HTMLDivElement>(null);
  const last = conv.messages[conv.messages.length - 1];
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [conv.messages.length, last?.pending, last?.blocks.length]);
  return (
    <ol className={`ai-thread ${compact ? "is-compact" : ""}`} aria-live="polite">
      {conv.messages.map((m, i) => (
        <li key={m.id} className={`ai-msg is-${m.role}`}>
          <span className="ai-avatar" aria-hidden="true">
            {m.role === "user" ? <UserRound size={14} /> : <Bot size={14} />}
          </span>
          <div className="ai-bubble">
            {m.blocks.map((b, j) => (
              <BlockView key={j} block={b} />
            ))}
            {m.pending && (
              <p className="ai-pending">
                <span className="hs-dot" /> {m.pending}
              </p>
            )}
            {m.role === "assistant" && conv.mode === "issues" && !m.pending && <IssueFeedback conv={conv} m={m} question={questionBefore(conv, i)} />}
          </div>
        </li>
      ))}
      <div ref={end} />
    </ol>
  );
}

function questionBefore(conv: Conversation, i: number): string {
  for (let k = i - 1; k >= 0; k--) {
    const m = conv.messages[k];
    if (m.role === "user") return (m.blocks[0] as { text?: string })?.text ?? "";
  }
  return "";
}

function IssueFeedback({ conv, m, question }: { conv: Conversation; m: Message; question: string }) {
  const ctx = useEngineContext();
  const [dev, setDev] = useState<string | null>(null);
  const toDeveloper = async () => setDev(await developerReport(conv.id, m, question, ctx));
  return (
    <div className="ai-feedback">
      {m.feedback === "yes" ? (
        <span className="ai-thanks">
          <CheckCircle2 size={14} /> Glad that helped — marked as solved.
        </span>
      ) : m.feedback === "no" ? (
        <span className="ai-thanks">Sorry about that — send it to your developer.</span>
      ) : (
        <>
          <span>Did this solve it?</span>
          <Button size="sm" variant="secondary" onClick={() => (patchMessage(conv.id, m.id, { feedback: "yes" }), m.issueId && updateIssue(m.issueId, { status: "solved" }))}>
            <ThumbsUp size={13} /> Yes
          </Button>
          <Button size="sm" variant="secondary" onClick={() => patchMessage(conv.id, m.id, { feedback: "no" })}>
            <ThumbsDown size={13} /> No
          </Button>
        </>
      )}
      <Button size="sm" variant={m.feedback === "no" ? "primary" : "ghost"} onClick={() => void toDeveloper()}>
        <LifeBuoy size={13} /> Send to developer
      </Button>
      {dev && <DeveloperDialog text={dev} onClose={() => setDev(null)} />}
    </div>
  );
}

/* ─────────────── Blocks ─────────────── */

function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case "text":
      return (
        <div className="ai-text">
          {block.text.split("\n").map((line, i) => (
            <p key={i}>{line}</p>
          ))}
          {block.meta && <small className="ai-meta">{block.meta}</small>}
        </div>
      );
    case "scan":
      return <ScanBlock report={block.report} />;
    case "guide":
      return <GuideBlock entryId={block.entryId} compact={block.compact} />;
    case "locate":
      return <LocateBlock pageId={block.pageId} />;
    case "suggest":
      return <SuggestBlock title={block.title} entryIds={block.entryIds} />;
    case "switch":
      return <SwitchBlock text={block.text} mode={block.mode} prompt={block.prompt} />;
  }
}

function ScanBlock({ report }: { report: ScanReport }) {
  const act = useResultActions();
  const [dev, setDev] = useState(false);
  const v = verdictText(report);
  const page = report.results.filter((r) => r.scope !== "device");
  const device = report.focus ? report.results.filter((r) => r.scope === "device" && r.status !== "ok" && r.status !== "info") : [];
  const shownPage = report.verdict === "ok" ? page.filter((r) => r.status === "ok").slice(0, 5) : page.filter((r) => r.status !== "ok");
  const onAction = (r: CheckResult) => void act(r, () => setDev(true));
  const ctx = useEngineContext();
  return (
    <div className="ai-scan">
      <div className={`ri-verdict is-${report.verdict}`}>
        <b>{v.title}</b>
        <span>{v.text}</span>
      </div>
      <ScanResults report={{ ...report, results: shownPage }} onContact={() => setDev(true)} onAction={onAction} />
      {device.length > 0 && (
        <div className="ai-device">
          <h5>Also noticed on this computer — not caused by {report.focus ? (pageById(report.focus)?.label ?? "this page") : "this page"}</h5>
          <ScanResults report={{ ...report, results: device }} onContact={() => setDev(true)} onAction={onAction} />
        </div>
      )}
      {dev && <DeveloperDialogFor report={report} onClose={() => setDev(false)} ctx={ctx} />}
    </div>
  );
}

/** Same plain-text report as System health. */
function DeveloperDialogFor({ report, onClose, ctx }: { report: ScanReport; onClose: () => void; ctx: EngineContext }) {
  const text = useMemo(() => reportText(report, { user: ctx.user, ...ctx.report }), [report, ctx]);
  return <DeveloperDialog text={text} onClose={onClose} />;
}

function GuideBlock({ entryId, compact }: { entryId: string; compact?: boolean }) {
  const { user, navigate } = useApp();
  const entry = GUIDE.find((g) => g.id === entryId);
  if (!entry) return null;
  const allowed = !entry.roles || entry.roles.includes(user.kind);
  const page = entry.page ? pageById(entry.page) : undefined;
  const loc = page ? locate(page, { kind: user.kind, role: user.role, branchId: user.branchId }) : null;
  return (
    <div className="ri-guide">
      {!compact && <b className="ri-guide-title">{entry.title}</b>}
      <p>{entry.answer}</p>
      {!allowed && <p className="ri-note">{user.kind === "staff" ? "This is done by your Branch Manager (or the Company Admin) — ask them." : user.kind === "admin" ? "This is branch work — done by the branch's manager and front desk." : "This is done by the Company Admin."}</p>}
      {entry.steps && (
        <ol>
          {entry.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      )}
      {allowed && loc?.canOpen && loc.to && (
        <Button size="sm" onClick={() => navigate(loc.to!)}>
          Open {page!.label} <ArrowRight size={13} />
        </Button>
      )}
    </div>
  );
}

function LocateBlock({ pageId }: { pageId: string }) {
  const { user, navigate } = useApp();
  const page = pageById(pageId);
  if (!page) return null;
  const loc = locate(page, { kind: user.kind, role: user.role, branchId: user.branchId });
  return (
    <div className="ai-locate">
      <p>
        <b>{page.label}</b> — {page.what}
      </p>
      <p>{loc.where}</p>
      {loc.canOpen && loc.to && (
        <Button size="sm" onClick={() => navigate(loc.to!)}>
          Open {page.label} <ArrowRight size={13} />
        </Button>
      )}
    </div>
  );
}

function SuggestBlock({ title, entryIds }: { title: string; entryIds: string[] }) {
  const ctx = useEngineContext();
  const list = entryIds.map((id) => GUIDE.find((g) => g.id === id)).filter(Boolean) as typeof GUIDE;
  if (!list.length) return null;
  return (
    <div className="ri-related">
      <span>{title}</span>
      {list.slice(0, 4).map((g) => (
        <button key={g.id} type="button" onClick={() => void send("issues", g.phrases[0], ctx)}>
          {g.title}
        </button>
      ))}
    </div>
  );
}

function SwitchBlock({ text, mode, prompt }: { text: string; mode: Mode; prompt: string }) {
  const { route, navigate } = useApp();
  const ctx = useEngineContext();
  const onPage = /\/(assistant|support)$/.test(route.path);
  return (
    <div className="ai-switch">
      <p>{text}</p>
      <Button
        size="sm"
        onClick={() => {
          if (onPage) navigate(route.path.replace(/(assistant|support)$/, mode === "issues" ? "support" : "assistant"));
          else setDockMode(mode);
          void send(mode, prompt, ctx);
        }}
      >
        <ArrowLeftRight size={13} /> Check it in {MODES[mode].label}
      </Button>
    </div>
  );
}

/* ─────────────── Composer ─────────────── */

export function Composer({ mode, compact, busy, onSend, extra }: { mode: Mode; compact?: boolean; busy?: boolean; onSend: (t: string) => void; extra?: ReactNode }) {
  const [text, setText] = useState("");
  const [menu, setMenu] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const submit = () => {
    if (!text.trim() || busy) return;
    onSend(text.trim());
    setText("");
  };
  const quick = mode === "issues" ? ["Scan for errors", "The billing page is not loading", "STANLEY is very slow", "Where is Trash?"] : ["How is revenue?", "How are collections?", "Top referring hospital?", "How do I make a report?"];
  return (
    <div className={`ai-composer ${compact ? "is-compact" : ""}`}>
      <div className="ai-plus-wrap">
        <button type="button" className="ai-round" aria-label="Quick prompts" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
          <Plus size={compact ? 16 : 18} />
        </button>
        {menu && (
          <ul className="ai-menu is-up" role="menu" onMouseLeave={() => setMenu(false)}>
            {quick.map((q) => (
              <li key={q}>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenu(false);
                    onSend(q);
                  }}
                >
                  {q}
                </button>
              </li>
            ))}
            {extra}
          </ul>
        )}
      </div>
      <textarea
        ref={box}
        rows={1}
        value={text}
        maxLength={500}
        placeholder={MODES[mode].placeholder}
        aria-label={MODES[mode].placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <button type="button" className="ai-send" aria-label="Send" disabled={!text.trim() || busy} onClick={submit}>
        {busy ? <span className="hs-dot" /> : compact ? <Send size={16} /> : <ArrowRight size={20} />}
      </button>
    </div>
  );
}
