import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Send, Sparkles, X } from "lucide-react";
import { useApp } from "@/app/AppState";
import { branchRoute } from "@/app/router";
import { getBranch } from "@/data/company";
import type { DateRange } from "@/data/types";
import { Reveal, useMotionPreset } from "@/shared/motion";
import { Button } from "@/shared/ui/controls";
import { periodLabel, priorRange, resolveBranchIds, resolveRange, summarize, type Summary } from "@/services/analytics";
import { answerQuestion, briefing } from "@/services/insights";

const SUGGESTIONS = ["Which branch leads revenue?", "How are collections?", "Where are balances building up?", "Top referring doctor?"];

const CONNECTOR_NOTE = "Answers are composed from STANLEY's calculation services (demonstration data). No language-model connector is configured yet.";

export function IntelligenceBriefing({ branchIds, range, summary, prior, scope }: { branchIds: string[]; range: DateRange; summary: Summary; prior: Summary | null; scope: string }) {
  const { period, askAssistant } = useApp();
  const m = useMotionPreset();
  const points = useMemo(() => briefing(branchIds, range, summary, prior), [branchIds, range, summary, prior]);
  const [q, setQ] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    askAssistant(q.trim());
    setQ("");
  };
  return (
    <Reveal hover className="card intel-card">
      <div className="intel-head">
        <span className="intel-mark">
          <Sparkles size={19} />
        </span>
        <div>
          <strong>STANLEY Intelligence</strong>
          <small>
            {scope} briefing · {periodLabel(period)}
          </small>
        </div>
      </div>
      <motion.ul className="intel-points" variants={m.rowStagger} initial="hidden" animate="visible">
        {points.map((p) => (
          <motion.li key={p.text} variants={m.rowItem}>
            <i />
            <span>
              {p.text}
              <small>Source: {p.source}</small>
            </span>
          </motion.li>
        ))}
      </motion.ul>
      <form className="intel-ask" onSubmit={submit}>
        <input className="input" style={{ flex: 1 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask a follow-up question…" aria-label="Ask STANLEY Intelligence" />
        <Button type="submit" aria-label="Send question">
          <Send size={16} />
        </Button>
      </form>
      <div className="intel-suggest">
        {SUGGESTIONS.map((s) => (
          <button key={s} className="chip-btn" onClick={() => askAssistant(s)}>
            {s}
          </button>
        ))}
      </div>
      <p className="hint" style={{ padding: "0 24px 20px", margin: 0 }}>
        {CONNECTOR_NOTE}
      </p>
    </Reveal>
  );
}

interface Message {
  id: number;
  from: "user" | "bot";
  text: string;
  meta?: string;
}

/** Floating assistant. Minimised it stays available as a launcher in the corner. */
export function AssistantDock() {
  const { assistantOpen, setAssistantOpen, assistantQuestion, clearAssistantQuestion, context, period, route } = useApp();
  const m = useMotionPreset();
  const br = branchRoute(route);
  const branchIds = useMemo(() => (br ? resolveBranchIds(br.branchId) : resolveBranchIds(context)), [br?.branchId, context]); // eslint-disable-line react-hooks/exhaustive-deps
  const scope = br ? `${getBranch(br.branchId)?.name ?? "Branch"} branch` : context === "all" ? "All branches" : `${getBranch(context)?.name} branch`;
  const [messages, setMessages] = useState<Message[]>([
    { id: 0, from: "bot", text: "Hello — I can explain the figures on your dashboard for the current context and reporting period. What would you like to know?", meta: CONNECTOR_NOTE },
  ]);
  const [q, setQ] = useState("");
  const list = useRef<HTMLDivElement>(null);

  const respond = (question: string) => {
    const range = resolveRange(period);
    const pr = priorRange(range);
    const summary = summarize(branchIds, range);
    const prior = pr ? summarize(branchIds, pr) : null;
    const answer = answerQuestion(question, branchIds, range, summary, prior);
    setMessages((ms) => [
      ...ms,
      { id: ms.length + 1, from: "user", text: question },
      { id: ms.length + 2, from: "bot", text: answer, meta: `${scope} · ${periodLabel(period)}` },
    ]);
  };

  useEffect(() => {
    if (assistantQuestion) {
      respond(assistantQuestion);
      clearAssistantQuestion();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistantQuestion]);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [messages, assistantOpen]);

  return (
    <AnimatePresence mode="wait" initial={false}>
      {assistantOpen ? (
        <motion.section
          key="panel"
          className="intel-panel"
          aria-label="STANLEY Intelligence assistant"
          initial={m.modal.initial}
          animate={m.modal.animate}
          exit={m.modal.exit}
          style={{ transformOrigin: "bottom right" }}
        >
          <div className="intel-head">
            <span className="intel-mark">
              <Sparkles size={18} />
            </span>
            <div>
              <strong>STANLEY Intelligence</strong>
              <small>
                {scope} · {periodLabel(period)}
              </small>
            </div>
            <button className="icon-btn" onClick={() => setAssistantOpen(false)} aria-label="Close STANLEY Intelligence" data-close>
              <X size={18} />
            </button>
          </div>
          <div className="intel-messages thin-scroll" ref={list} aria-live="polite">
            {messages.map((msg) => (
              <div key={msg.id} className={`msg ${msg.from}`}>
                {msg.text}
                {msg.meta && <small>{msg.meta}</small>}
              </div>
            ))}
          </div>
          <form
            className="intel-input"
            onSubmit={(e) => {
              e.preventDefault();
              if (q.trim()) {
                respond(q.trim());
                setQ("");
              }
            }}
          >
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about revenue, balances, referrals…" aria-label="Message STANLEY Intelligence" autoFocus />
            <Button type="submit" aria-label="Send">
              <Send size={16} />
            </Button>
          </form>
        </motion.section>
      ) : (
        <motion.button
          key="launcher"
          className="intel-launcher"
          onClick={() => setAssistantOpen(true)}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          whileTap={m.press}
          aria-label="Open STANLEY Intelligence"
          title="STANLEY Intelligence"
        >
          {/* Collapsed to a circle; the name rolls out on hover / keyboard focus. */}
          <span className="intel-launcher-label" aria-hidden="true">
            STANLEY Intelligence
          </span>
          <span className="intel-mark">
            <Sparkles size={20} />
          </span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
