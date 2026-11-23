/**
 * The small STANLEY AI pop-up (owner, 2026-11-22).
 *
 *  • The floating STANLEY icon opens a chooser: "Report an issue" or
 *    "Chat with STANLEY Intelligence" — the choice sets the pop-up's task.
 *  • The pop-up holds the same conversation as the full page; the expand
 *    button opens it there (and minimising the full page comes back here).
 *  • Hidden on the STANLEY AI pages themselves.
 */
import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeftRight, ChevronRight, Maximize2, MessageSquareWarning, Sparkles, X } from "lucide-react";
import { useApp } from "@/app/AppState";
import { branchRoute } from "@/app/router";
import { useMotionPreset } from "@/shared/motion";
import { send } from "@/services/assistant/engine";
import { activeConversation, closeDock, ensureConversation, openDock, setDockMode, useAssistant, type Mode } from "@/services/assistant/store";
import { Composer, MODES, Thread, Welcome, useEngineContext } from "./chat";

export function AssistantDock() {
  const { route, navigate, assistantQuestion, clearAssistantQuestion, user } = useApp();
  const m = useMotionPreset();
  const store = useAssistant();
  const ctx = useEngineContext();
  const br = branchRoute(route);
  const base = br ? `/branch/${br.branchId}` : user.kind !== "admin" && user.branchId ? `/branch/${user.branchId}` : "";
  const onAiPage = /\/(assistant|support)$/.test(route.path);
  const { open, mode } = store.dock;
  const conv = mode ? activeConversation(mode, store) : null;
  const busy = !!conv?.messages.some((x) => x.pending);

  // Questions asked from elsewhere (e.g. the dashboard briefing) open Intelligence and are answered.
  useEffect(() => {
    if (!assistantQuestion) return;
    openDock("intelligence");
    void send("intelligence", assistantQuestion, ctx);
    clearAssistantQuestion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistantQuestion]);

  useEffect(() => {
    if (mode) ensureConversation(mode);
  }, [mode]);

  if (onAiPage) return null;
  const expand = (md: Mode) => {
    closeDock();
    navigate(`${base}/${md === "issues" ? "support" : "assistant"}`);
  };

  return (
    <AnimatePresence mode="wait" initial={false}>
      {open ? (
        <motion.section key={mode ? `panel-${mode}` : "chooser"} className={`intel-panel ai-dock ${mode ? "" : "is-chooser"}`} aria-label="STANLEY AI" initial={m.modal.initial} animate={m.modal.animate} exit={m.modal.exit} style={{ transformOrigin: "bottom right" }}>
          {!mode ? (
            <>
              <div className="intel-head">
                <span className="intel-mark">
                  <Sparkles size={18} />
                </span>
                <div>
                  <strong>STANLEY AI</strong>
                  <small>What would you like to do?</small>
                </div>
                <button className="icon-btn" onClick={closeDock} aria-label="Close STANLEY AI" data-close>
                  <X size={18} />
                </button>
              </div>
              <div className="ai-choose">
                <ChooseCard mode="issues" title="Report an issue" text="Something isn't working, or you can't find something. STANLEY checks it and explains how to fix it." onPick={setDockMode} />
                <ChooseCard mode="intelligence" title="Chat with STANLEY Intelligence" text="Ask about revenue, payments, balances, referrals and patients — answered from your records." onPick={setDockMode} />
              </div>
            </>
          ) : (
            <>
              <div className="intel-head">
                <span className="intel-mark">{mode === "issues" ? <MessageSquareWarning size={18} /> : <Sparkles size={18} />}</span>
                <div>
                  <strong>{MODES[mode].label}</strong>
                  <small>{mode === "issues" ? "Support desk · real checks" : ctx.scopeLabel}</small>
                </div>
                <button className="icon-btn" onClick={() => setDockMode(null)} aria-label="Choose another task" title="Switch task">
                  <ArrowLeftRight size={16} />
                </button>
                <button className="icon-btn" onClick={() => expand(mode)} aria-label="Expand to the full chat" title="Expand">
                  <Maximize2 size={16} />
                </button>
                <button className="icon-btn" onClick={closeDock} aria-label="Close STANLEY AI" data-close>
                  <X size={18} />
                </button>
              </div>
              <div className="intel-messages ai-dock-body thin-scroll">{conv && conv.messages.length ? <Thread conv={conv} compact /> : <Welcome mode={mode} compact onSend={(t) => void send(mode, t, ctx)} />}</div>
              <div className="ai-dock-input">
                <Composer mode={mode} compact busy={busy} onSend={(t) => void send(mode, t, ctx)} />
              </div>
            </>
          )}
        </motion.section>
      ) : (
        <motion.button key="launcher" className="intel-launcher" onClick={() => openDock(null)} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} whileTap={m.press} aria-label="Open STANLEY AI" title="STANLEY AI">
          <span className="intel-launcher-label" aria-hidden="true">
            STANLEY AI
          </span>
          <span className="intel-mark">
            <Sparkles size={20} />
          </span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}

function ChooseCard({ mode, title, text, onPick }: { mode: Mode; title: string; text: string; onPick: (m: Mode) => void }) {
  const Icon = MODES[mode].icon;
  return (
    <button type="button" className="ai-choose-card" onClick={() => onPick(mode)}>
      <span className="ai-card-icon" aria-hidden="true">
        <Icon size={20} />
      </span>
      <span className="ai-card-text">
        <b>{title}</b>
        <small>{text}</small>
      </span>
      <ChevronRight size={18} />
    </button>
  );
}
