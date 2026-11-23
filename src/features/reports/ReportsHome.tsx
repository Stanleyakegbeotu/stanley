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

export function ReportsHome({
  initialBranch,
  reports = REPORTS,
  basePath = "/reports",
  lockedBranch,
  heading = "Choose a report",
  maxDays,
  subheading = "Select Create report to choose the period, branch and content, then preview it before printing",
}: {
  initialBranch?: string;
  /** Reports to offer (the branch Analysis page passes the role's reports). */
  reports?: ReportSpec[];
  basePath?: string;
  /** Branch workspace: every report covers this branch only. */
  lockedBranch?: string;
  heading?: string;
  subheading?: string;
  /** Longest report period allowed (front desk: one month). */
  maxDays?: number;
}) {
  const { route, navigate } = useApp();
  const m = useMotionPreset();
  const q = route.query.get("report") ?? LEGACY_TABS[route.query.get("tab") ?? ""] ?? null;
  // Only reports in the offered list can be opened (a link to another report does nothing).
  const open = reportById(q) ? reports.find((r) => r.id === q) : undefined;
  const go = (id: string | null) => navigate(id ? `${basePath}?report=${id}` : basePath);

  return (
    <>
      <section className="inv-section">
        <header className="inv-section-head">
          <h3>{heading}</h3>
          <span>{subheading}</span>
        </header>
        <Reveal mode="stagger" className="rp-cards">
          {reports.map((r) => (
            <motion.div key={r.id} variants={m.revealItem}>
              <ReportCard spec={r} onCreate={() => go(r.id)} />
            </motion.div>
          ))}
        </Reveal>
      </section>
      {open && (
        <ReportBuilder
          key={`${open.id}|${route.query.get("variant") ?? ""}|${route.query.get("month") ?? ""}`}
          spec={open}
          initialBranch={route.query.get("branch") ?? initialBranch}
          lockedBranch={lockedBranch}
          maxDays={maxDays}
          initialVariant={route.query.get("variant")}
          initialMonth={route.query.get("month")}
          onClose={() => go(null)}
        />
      )}
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
