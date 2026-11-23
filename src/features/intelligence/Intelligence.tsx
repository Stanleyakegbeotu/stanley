import { useMemo, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Send, Sparkles } from "lucide-react";
import { useApp } from "@/app/AppState";
import type { DateRange } from "@/data/types";
import { Reveal, useMotionPreset } from "@/shared/motion";
import { Button } from "@/shared/ui/controls";
import { periodLabel, type Summary } from "@/services/analytics";
import { briefing } from "@/services/insights";

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
