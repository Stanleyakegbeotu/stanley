/**
 * Reports page: one compact card per report. A card shows the report name and
 * one line; its report types fold out from a dropdown. "Create report" opens
 * the step-by-step builder (choose → preview → print, download or export).
 */
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ChevronDown } from "lucide-react";
import { useApp } from "@/app/AppState";
import { Reveal, useMotionPreset } from "@/shared/motion";
import { ReportBuilder } from "./ReportBuilder";
import { REPORTS, reportById, type ReportSpec } from "./specs";

/** Old links (?tab=…) from before the builder existed. */
const LEGACY_TABS: Record<string, string> = { overview: "revenue", doctors: "agents", hospitals: "hospitals", services: "services" };

export function ReportsHome({ initialBranch }: { initialBranch?: string }) {
  const { route, navigate } = useApp();
  const m = useMotionPreset();
  const q = route.query.get("report") ?? LEGACY_TABS[route.query.get("tab") ?? ""] ?? null;
  const open = reportById(q);
  const go = (id: string | null) => navigate(id ? `/reports?report=${id}` : "/reports");

  return (
    <>
      <section className="inv-section">
        <header className="inv-section-head">
          <h3>Choose a report</h3>
          <span>Select Create report to choose the period, branch and content, then preview it before printing</span>
        </header>
        <Reveal mode="stagger" className="rp-cards">
          {REPORTS.map((r) => (
            <motion.div key={r.id} variants={m.revealItem}>
              <ReportCard spec={r} onCreate={() => go(r.id)} />
            </motion.div>
          ))}
        </Reveal>
      </section>
      {open && <ReportBuilder key={open.id} spec={open} initialBranch={initialBranch} onClose={() => go(null)} />}
    </>
  );
}

function ReportCard({ spec, onCreate }: { spec: ReportSpec; onCreate: () => void }) {
  const [open, setOpen] = useState(false);
  const Icon = spec.icon;
  return (
    <article className={`card rp-card ${open ? "is-open" : ""}`}>
      <div className="rp-card-top">
        <span className="rp-card-icon" aria-hidden="true">
          <Icon size={21} />
        </span>
        <div className="rp-card-name">
          <h3>{spec.title}</h3>
          <p>{spec.tagline}</p>
        </div>
      </div>
      <button type="button" className="rp-card-more" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {spec.variants.length} report type{spec.variants.length === 1 ? "" : "s"}
        <ChevronDown size={16} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul className="rp-card-list" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }}>
            {spec.variants.map((v) => (
              <li key={v.id}>
                <b>{v.label}</b>
                <span>{v.description}</span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
      <button type="button" className="rp-card-go" onClick={onCreate} aria-haspopup="dialog">
        Create report <ArrowRight size={16} />
      </button>
    </article>
  );
}
