/**
 * STANLEY AI — the full chat workspace (owner, 2026-11-22). Same architecture
 * as the approved design: header (mark, title, workspace badge, status; model
 * picker, rules, new chat, history, more, minimise, close) → chat card
 * (welcome + suggestion cards, thread, composer) beside an Activity panel
 * (All / Alerts / Answers / Approvals).
 *
 * Two "models" share the page: STANLEY Intelligence (/assistant) and Report an
 * issue (/support) — each with its own conversation and activity. The small
 * pop-up shows the same conversations; minimise goes back to it.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, Check, PanelRightClose, PanelRightOpen, ChevronDown, Clock3, Cpu, Download, History, Minus, MoreHorizontal, Plus, ShieldCheck, Trash2, X, Settings2 } from "lucide-react";
import { useApp } from "@/app/AppState";
import { AnimatedPage } from "@/shared/motion";
import { Modal } from "@/shared/ui/Modal";
import { attentionItems } from "@/services/insights";
import { useExpenses } from "@/services/expenses";
import { can, usePermissions } from "@/services/permissions";
import { formatMoney } from "@/shared/format";
import { send } from "@/services/assistant/engine";
import { ASSISTANT_RULES, ENGINES } from "@/services/assistant/rules";
import { activeConversation, deleteConversation, ensureConversation, getReturnPath, newConversation, openDock, selectConversation, useAssistant, type Conversation, type Mode } from "@/services/assistant/store";
import { verdictText } from "@/features/recovery/SystemHealth";
import { downloadFile } from "@/features/settings/admin/ui";
import { Composer, MODES, Thread, Welcome, useEngineContext } from "./chat";
import { StanleyOrb } from "./StanleyOrb";

const ACTIVITY_KEY = "stanley.ai.activity";
const dt = (d: string) => new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function AssistantPage({ mode, base }: { mode: Mode; base: string }) {
  const { navigate } = useApp();
  const store = useAssistant();
  const ctx = useEngineContext();
  const info = MODES[mode];
  const conv = activeConversation(mode, store);
  const [ready, setReady] = useState(false);
  const [rules, setRules] = useState(false);
  const busy = !!conv?.messages.some((m) => m.pending);
  // Activity panel: open (narrow) or folded to a slim strip — remembered on this computer.
  const [folded, setFolded] = useState(() => {
    try {
      return window.localStorage.getItem(ACTIVITY_KEY) === "folded";
    } catch {
      return false;
    }
  });
  const fold = (v: boolean) => {
    setFolded(v);
    try {
      window.localStorage.setItem(ACTIVITY_KEY, v ? "folded" : "open");
    } catch {
      /* this session only */
    }
  };

  // "Starting…" while the engines load their records, then ready.
  useEffect(() => {
    setReady(false);
    const t = window.setTimeout(() => setReady(true), 450);
    return () => window.clearTimeout(t);
  }, [mode]);
  useEffect(() => {
    ensureConversation(mode);
  }, [mode]);

  const go = (m: Mode) => navigate(`${base}/${m === "issues" ? "support" : "assistant"}`);
  const onSend = (t: string) => void send(mode, t, ctx);

  return (
    <AnimatedPage>
      <section className="ai-workspace">
        <header className="ai-head">
          <span className="ai-mark is-orb" aria-hidden="true">
            <StanleyOrb size={54} mood={busy ? "thinking" : ready ? "idle" : "awake"} />
          </span>
          <div className="ai-title">
            <div>
              <h1>STANLEY AI</h1>
              <span className="ai-badge">{info.badge}</span>
            </div>
            <span className={`ai-status ${ready ? "is-ready" : ""}`}>
              <i /> {ready ? (mode === "issues" ? "Ready · real checks on this computer" : "Ready · answers from your STANLEY records") : "Starting…"}
            </span>
          </div>
          <div className="ai-tools">
            <ModelPicker mode={mode} ready={ready} onPick={go} />
            <button type="button" className="ai-icon" aria-label="Rules & engines" title="Rules & engines" onClick={() => setRules(true)}>
              <Settings2 size={17} />
            </button>
            <span className="ai-sep" aria-hidden="true" />
            <button type="button" className="ai-icon is-flat" aria-label="New chat" title="New chat" onClick={() => newConversation(mode)}>
              <Plus size={19} />
            </button>
            <HistoryMenu mode={mode} conversations={store.conversations.filter((c) => c.mode === mode && c.messages.length)} activeId={conv?.id} />
            <MoreMenu conv={conv} onRules={() => setRules(true)} />
            <span className="ai-sep" aria-hidden="true" />
            <button
              type="button"
              className="ai-icon is-flat"
              aria-label="Minimise to the small chat"
              title="Minimise to the small chat"
              onClick={() => {
                openDock(mode);
                navigate(getReturnPath());
              }}
            >
              <Minus size={19} />
            </button>
            <button type="button" className="ai-icon is-close" aria-label="Close STANLEY AI" title="Close" data-close onClick={() => navigate(getReturnPath())}>
              <X size={18} />
            </button>
          </div>
        </header>

        <div className={`ai-body ${folded ? "is-folded" : ""}`}>
          <div className="ai-chat">
            <div className="ai-scroll thin-scroll">{conv && conv.messages.length ? <Thread conv={conv} /> : <Welcome mode={mode} onSend={onSend} />}</div>
            <Composer mode={mode} busy={busy} onSend={onSend} />
          </div>
          <ActivityPanel mode={mode} conv={conv} folded={folded} onFold={fold} />
        </div>
      </section>

      <RulesDialog open={rules} onClose={() => setRules(false)} />
    </AnimatedPage>
  );
}

/* ─────────────── Header menus ─────────────── */

function useOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const on = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && close();
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", on);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", on);
      document.removeEventListener("keydown", key);
    };
  }, [open, close]);
  return ref;
}

function ModelPicker({ mode, ready, onPick }: { mode: Mode; ready: boolean; onPick: (m: Mode) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useOutside(open, () => setOpen(false));
  return (
    <div className="ai-pop" ref={ref}>
      <button type="button" className="ai-model" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <i className={ready ? "is-ready" : ""} />
        Model: {ready ? MODES[mode].label : "checking…"}
        <ChevronDown size={16} />
      </button>
      {open && (
        <ul className="ai-menu" role="listbox">
          {ENGINES.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                role="option"
                aria-selected={e.id === mode}
                disabled={!e.connected}
                onClick={() => {
                  setOpen(false);
                  if (e.id === "intelligence" || e.id === "issues") onPick(e.id);
                }}
              >
                <span>
                  <b>{e.label}</b>
                  <small>{e.connected ? e.description : "Not connected yet"}</small>
                </span>
                {e.id === mode && <Check size={15} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HistoryMenu({ mode, conversations, activeId }: { mode: Mode; conversations: Conversation[]; activeId?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useOutside(open, () => setOpen(false));
  return (
    <div className="ai-pop" ref={ref}>
      <button type="button" className="ai-icon is-flat" aria-label="Conversation history" title="History" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <History size={18} />
      </button>
      {open && (
        <ul className="ai-menu is-right is-wide">
          <li className="ai-menu-head">{MODES[mode].label} · history</li>
          {conversations.length === 0 && <li className="ai-menu-empty">No earlier conversations.</li>}
          {conversations.map((c) => (
            <li key={c.id} className="ai-hist">
              <button
                type="button"
                className={c.id === activeId ? "is-active" : ""}
                onClick={() => {
                  selectConversation(mode, c.id);
                  setOpen(false);
                }}
              >
                <span>
                  <b>{c.title}</b>
                  <small>
                    <Clock3 size={11} /> {dt(c.updatedAt)} · {c.messages.length} message{c.messages.length === 1 ? "" : "s"}
                  </small>
                </span>
              </button>
              <button type="button" className="ai-hist-del" aria-label={`Delete “${c.title}”`} onClick={() => deleteConversation(c.id)}>
                <Trash2 size={13} />
              </button>
            </li>
          ))}
          <li className="ai-menu-foot">The last 20 conversations are kept on this computer.</li>
        </ul>
      )}
    </div>
  );
}

function MoreMenu({ conv, onRules }: { conv: Conversation | null; onRules: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useOutside(open, () => setOpen(false));
  const exportText = () => {
    if (!conv) return;
    const lines = conv.messages.map((m) => {
      const body = m.blocks
        .map((b) => (b.type === "text" ? b.text : b.type === "scan" ? `[Scan] ${verdictText(b.report).title}\n${b.report.results.map((r) => `  - ${r.name}: ${r.message}`).join("\n")}` : b.type === "guide" ? `[Guide] ${b.entryId}` : b.type === "locate" ? `[Page] ${b.pageId}` : ""))
        .filter(Boolean)
        .join("\n");
      return `${m.role === "user" ? "You" : "STANLEY"} · ${dt(m.at)}\n${body}`;
    });
    downloadFile(`stanley-ai-${conv.mode}-${conv.createdAt.slice(0, 10)}.txt`, `${MODES[conv.mode].label} — ${conv.title}\n\n${lines.join("\n\n")}`);
  };
  return (
    <div className="ai-pop" ref={ref}>
      <button type="button" className="ai-icon is-flat" aria-label="More" title="More" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <ul className="ai-menu is-right">
          <li>
            <button type="button" disabled={!conv?.messages.length} onClick={() => (exportText(), setOpen(false))}>
              <Download size={14} /> Export this conversation
            </button>
          </li>
          <li>
            <button type="button" disabled={!conv?.messages.length} onClick={() => (conv && deleteConversation(conv.id), setOpen(false))}>
              <Trash2 size={14} /> Delete this conversation
            </button>
          </li>
          <li>
            <button type="button" onClick={() => (onRules(), setOpen(false))}>
              <ShieldCheck size={14} /> Rules STANLEY AI follows
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}

function RulesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} wide icon={ShieldCheck} title="Rules & engines" description="Every engine behind STANLEY AI follows these rules — including any AI model connected later.">
      <h4 className="ai-rules-h">Engines</h4>
      <ul className="ai-engines">
        {ENGINES.map((e) => (
          <li key={e.id} className={e.connected ? "is-on" : ""}>
            <Cpu size={16} />
            <span>
              <b>{e.label}</b> <em>{e.connected ? "Built in · works offline" : "Not connected"}</em>
              <small>{e.description}</small>
            </span>
          </li>
        ))}
      </ul>
      <h4 className="ai-rules-h">Rules</h4>
      <ol className="ai-rules">
        {ASSISTANT_RULES.map((r) => (
          <li key={r.id}>
            <b>{r.title}</b>
            <span>{r.text}</span>
          </li>
        ))}
      </ol>
    </Modal>
  );
}

/* ─────────────── Activity panel ─────────────── */

interface Item {
  id: string;
  kind: string;
  title: string;
  detail: string;
  at?: string;
  tone?: "ok" | "warn" | "bad";
  route?: string;
}

function ActivityPanel({ mode, conv, folded, onFold }: { mode: Mode; conv: Conversation | null; folded: boolean; onFold: (v: boolean) => void }) {
  usePermissions();
  const { user, navigate } = useApp();
  const ctx = useEngineContext();
  const expenses = useExpenses();
  const tabs = mode === "issues" ? (["All", "Scans", "Fixed", "Developer"] as const) : (["All", "Alerts", "Answers", "Approvals"] as const);
  const [tab, setTab] = useState<string>("All");
  useEffect(() => setTab("All"), [mode]);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    const msgs = conv?.messages ?? [];
    if (mode === "intelligence") {
      for (const a of attentionItems(ctx.branchIds, ctx.range, user.kind === "admin").slice(0, 6)) out.push({ id: a.id, kind: "Alerts", title: a.title, detail: a.detail, tone: a.severity === "urgent" ? "bad" : a.severity === "attention" ? "warn" : undefined, route: a.route });
      for (const m of msgs) if (m.role === "assistant") for (const b of m.blocks) if (b.type === "text") out.push({ id: `${m.id}-a`, kind: "Answers", title: b.text.split("\n")[0].slice(0, 90), detail: b.meta ?? "", at: m.at });
      if (can(user.role, "expenses.approve"))
        for (const e of expenses.filter((x) => x.status === "Pending" && ctx.branchIds.includes(x.branchId)).slice(0, 8))
          out.push({ id: e.id, kind: "Approvals", title: `Expense waiting: ${e.description}`, detail: `${formatMoney(e.amount, "NGN")} · recorded by ${e.recordedBy.name}`, tone: "warn", route: `/branch/${e.branchId}/expenses` });
    } else {
      for (const m of msgs)
        for (const b of m.blocks)
          if (b.type === "scan") {
            const v = verdictText(b.report);
            out.push({ id: `${m.id}-s`, kind: "Scans", title: v.title, detail: `${b.report.results.length} checks · ${(b.report.durationMs / 1000).toFixed(1)} s`, at: b.report.at, tone: b.report.verdict === "developer" ? "bad" : b.report.verdict === "action" ? "warn" : "ok" });
            for (const r of b.report.results) {
              if (r.status === "fixed") out.push({ id: `${m.id}-${r.id}-f`, kind: "Fixed", title: r.name, detail: r.message, at: b.report.at, tone: "ok" });
              if (r.status === "developer") out.push({ id: `${m.id}-${r.id}-d`, kind: "Developer", title: r.name, detail: r.message, at: b.report.at, tone: "bad" });
            }
          }
    }
    return out;
  }, [mode, conv, ctx.branchIds, ctx.range, user, expenses]);

  const list = tab === "All" ? items : items.filter((i) => i.kind === tab);
  const count = (t: string) => items.filter((i) => i.kind === t).length;

  if (folded)
    return (
      <aside className="ai-activity is-folded" aria-label={MODES[mode].activityTitle}>
        <button type="button" className="ai-fold" aria-label={`Show ${MODES[mode].activityTitle}`} title={`Show ${MODES[mode].activityTitle}`} onClick={() => onFold(false)}>
          <PanelRightOpen size={17} />
        </button>
        <span className="ai-rail-title">{MODES[mode].activityTitle}</span>
        <ul className="ai-rail">
          {tabs
            .filter((t) => t !== "All")
            .map((t) => (
              <li key={t}>
                <button
                  type="button"
                  title={`${t}: ${count(t)}`}
                  aria-label={`${t}: ${count(t)} — show`}
                  onClick={() => {
                    setTab(t);
                    onFold(false);
                  }}
                >
                  <em className={count(t) ? "has" : ""}>{count(t)}</em>
                  <small>{t}</small>
                </button>
              </li>
            ))}
        </ul>
      </aside>
    );

  return (
    <aside className="ai-activity" aria-label={MODES[mode].activityTitle}>
      <h3>
        <Activity size={16} /> {MODES[mode].activityTitle}
        <button type="button" className="ai-fold" aria-label={`Hide ${MODES[mode].activityTitle}`} title="Hide panel — more room for the chat" onClick={() => onFold(true)}>
          <PanelRightClose size={16} />
        </button>
      </h3>
      <div className="ai-tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? "is-active" : ""} onClick={() => setTab(t)}>
            {t}
            {t !== "All" && items.some((i) => i.kind === t) ? <em>{items.filter((i) => i.kind === t).length}</em> : null}
          </button>
        ))}
      </div>
      <div className="ai-activity-list thin-scroll">
        {list.length === 0 ? (
          <div className="ai-empty">
            <Activity size={20} />
            <p>{mode === "issues" ? "No activity yet. Scans, fixes and anything for your developer will appear here." : tab === "Approvals" && !can(user.role, "expenses.approve") ? "Approvals are for managers and the Company Admin." : "No activity yet. Answers and alerts from your questions will appear here."}</p>
          </div>
        ) : (
          <ul>
            {list.map((i) => (
              <li key={i.id} className={i.tone ? `is-${i.tone}` : ""}>
                <button type="button" disabled={!i.route} onClick={() => i.route && navigate(i.route)}>
                  <span className="ai-act-kind">{i.kind}</span>
                  <b>{i.title}</b>
                  {i.detail && <small>{i.detail}</small>}
                  {i.at && <time>{dt(i.at)}</time>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="ai-foot">{mode === "issues" ? "From the checks in this conversation. Every result comes from a real check — nothing here is estimated or invented." : "Alerts and approvals come straight from your records; answers are from this conversation. Nothing here is estimated or invented."}</p>
    </aside>
  );
}
