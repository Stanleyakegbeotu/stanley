/**
 * Report builder pop-up, styled like the app shell: a theme-coloured side
 * panel that curves into a white preview "island".
 *
 *  • Side panel: the guide, then one step at a time (type → period → branch →
 *    content → paper → review) with Back / Next. It can be resized by dragging
 *    its edge, folded to a slim rail (button, double-click the edge, or Ctrl+B)
 *    and reopened — like the VS Code sidebar.
 *  • Preview: real pages, exactly as they print; nothing is cut off.
 *  • Outputs unlock on the Review step, which lists anything left out and asks
 *    for confirmation before printing, downloading or exporting without it.
 */
import { useCallback, useDeferredValue, useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  Download,
  FileSpreadsheet,
  Lightbulb,
  ListChecks,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Printer,
  SlidersHorizontal,
  TriangleAlert,
  X,
  ZoomIn,
} from "lucide-react";
import { useApp } from "@/app/AppState";
import { logAudit } from "@/services/audit";
import { BRANCHES } from "@/data/company";
import { companyName } from "@/services/settingsStore";
import { DATA_START, TODAY, addDays, isoDate } from "@/data/demo/generator";
import type { DateRange } from "@/data/types";
import { resolveRange } from "@/services/analytics";
import { useMotionPreset } from "@/shared/motion";
import { formatCount, formatShortDate } from "@/shared/format";
import { SelectMenu } from "@/shared/ui/controls";
import { SearchSelect } from "@/shared/ui/SearchSelect";
import { Modal } from "@/shared/ui/Modal";
import { PAPER_LABEL, paperName, paperPx, savePdf, saveFile, tableRowCount, toCsv, type Orientation, type Paper, type PaperSize } from "./model";
import { AllPages, PageView, usePagination, type Page } from "./ReportPages";
import { REPORT_CSS, REPORT_FONT_URL } from "./reportCss";
import type { ReportParams, ReportSpec } from "./specs";
import { setReportPreparer } from "./specs";

type Preset = "today" | "week" | "month" | "lastMonth" | "year" | "custom";
type StepId = "type" | "period" | "branch" | "content" | "paper" | "review";
type Output = "print" | "pdf" | "csv";

const NO_COLUMNS: string[] = [];
const PRESETS: { id: Preset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "lastMonth", label: "Last month" },
  { id: "year", label: "This year" },
  { id: "custom", label: "Custom dates" },
];
const STEP_TITLE: Record<StepId, string> = { type: "Report type", period: "Period", branch: "Branch", content: "What to include", paper: "Paper", review: "Check before printing" };
const STEP_HELP: Record<StepId, string> = {
  type: "Pick what you want to see. Each option says what is inside.",
  period: "Choose a quick period, or enter exact From and To dates. Records start on 1 January.",
  branch: "Choose one branch, or All branches for the whole company.",
  content: "Choose what appears in the report. Fewer columns fit better and read more easily.",
  paper: "A paper size that fits is suggested. Landscape suits wide tables.",
  review: "Your choices so far. Anything left out is listed, so you can add it before printing.",
};

const PANEL = { min: 320, max: 620, def: 430, rail: 72 };
const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* storage unavailable — keep the in-memory value */
    }
  },
};

function presetRange(p: Preset, from: string, to: string): DateRange {
  if (p === "lastMonth") {
    const start = new Date(TODAY.getFullYear(), TODAY.getMonth() - 1, 1);
    const end = new Date(TODAY.getFullYear(), TODAY.getMonth(), 0);
    return resolveRange({ key: "custom", from: isoDate(start < DATA_START ? DATA_START : start), to: isoDate(end) });
  }
  if (p === "custom") return resolveRange({ key: "custom", from, to });
  return resolveRange({ key: p });
}

/* ── Months (for monthly reports) ── */
const monthKeyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
function monthRange(key: string): DateRange {
  const [y, m] = key.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0);
  return resolveRange({ key: "custom", from: isoDate(start < DATA_START ? DATA_START : start), to: isoDate(end > TODAY ? TODAY : end) });
}
const monthLabel = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  const name = new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  return key === monthKeyOf(TODAY) ? `${name} (so far)` : name;
};
/** Months with records, newest first. */
function availableMonths(): string[] {
  const out: string[] = [];
  for (let d = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1); d >= new Date(DATA_START.getFullYear(), DATA_START.getMonth(), 1); d = new Date(d.getFullYear(), d.getMonth() - 1, 1)) out.push(monthKeyOf(d));
  return out;
}

const brandColours = () => {
  const cs = getComputedStyle(document.documentElement);
  return { brand: cs.getPropertyValue("--brand-600").trim() || "#2a746e", ink: cs.getPropertyValue("--brand-800").trim() || "#185753" };
};

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch] as string);
const dayText = (d: Date) => `${formatShortDate(d)} ${d.getFullYear()}`;

async function printPages(doc: ReturnType<ReportSpec["build"]>, pages: Page[], paper: Paper) {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const markup = renderToStaticMarkup(<AllPages doc={doc} pages={pages} paper={paper} company={companyName()} />);
  const { brand, ink } = brandColours();
  const size = paper.size === "Letter" ? "letter" : paper.size;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(doc.title)}</title><link rel="stylesheet" href="${REPORT_FONT_URL}"><style>${REPORT_CSS}
:root{--rp-brand:${brand};--rp-brand-ink:${ink}}@page{size:${size} ${paper.orientation};margin:0}html,body{margin:0;padding:0;background:#fff}
.rp-page{break-after:page;page-break-after:always}.rp-page:last-child{break-after:auto;page-break-after:auto}</style></head><body>${markup}</body></html>`;
  const frame = document.createElement("iframe");
  Object.assign(frame.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
  frame.setAttribute("aria-hidden", "true");
  document.body.appendChild(frame);
  const w = frame.contentWindow;
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
  await new Promise((r) => setTimeout(r, 300));
  try {
    await Promise.race([w.document.fonts.ready, new Promise((r) => setTimeout(r, 2000))]);
  } catch {
    /* fonts unavailable offline — system font is used, as in the preview */
  }
  w.addEventListener("afterprint", () => setTimeout(() => frame.remove(), 500), { once: true });
  setTimeout(() => frame.remove(), 120_000);
  w.focus();
  w.print();
}

interface Reminder {
  id: string;
  label: string;
  /** Usually included (default on) — triggers the confirmation before output. */
  recommended: boolean;
  include: () => void;
}

export function ReportBuilder({
  spec,
  initialBranch,
  initialVariant,
  initialMonth,
  onClose,
  lockedBranch,
  maxDays,
}: {
  spec: ReportSpec;
  initialBranch?: string;
  /** Longest period this person may report on (front desk: one month). */
  maxDays?: number;
  /** Branch workspace: the report always covers this branch (no "All branches"). */
  lockedBranch?: string;
  /** Deep links (e.g. a commission-payout notification). */
  initialVariant?: string | null;
  initialMonth?: string | null;
  onClose: () => void;
}) {
  const { agents, showToast, user } = useApp();
  // Net profit / margin only for the Company Admin (owner rule).
  const hideProfit = user.kind !== "admin";
  setReportPreparer(user.name, user.role);
  const m = useMotionPreset();
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  const pane = useRef<HTMLDivElement>(null);

  /* ── Choices ── */
  const [variant, setVariant] = useState(spec.variants.find((x) => x.id === initialVariant)?.id ?? spec.variants[0].id);
  const [preset, setPreset] = useState<Preset>("month");
  const [from, setFrom] = useState(isoDate(addDays(TODAY, -6)));
  const [to, setTo] = useState(isoDate(TODAY));
  // Month picker (monthly reports such as the commission payout): "YYYY-MM"; defaults to the last full month.
  const [month, setMonth] = useState(() => (initialMonth && /^\d{4}-\d{2}$/.test(initialMonth) ? initialMonth : null) ?? monthKeyOf(TODAY.getMonth() > DATA_START.getMonth() || TODAY.getFullYear() > DATA_START.getFullYear() ? new Date(TODAY.getFullYear(), TODAY.getMonth() - 1, 1) : TODAY));
  const [branch, setBranch] = useState(lockedBranch ?? initialBranch ?? "all");
  const [options, setOptions] = useState<Record<string, boolean>>(() => Object.fromEntries((spec.options ?? []).map((o) => [o.id, o.default])));
  const [columns, setColumns] = useState<Record<string, string[]>>(() => Object.fromEntries(Object.entries(spec.columns ?? {}).map(([v, defs]) => [v, defs.filter((d) => d.default).map((d) => d.id)])));
  const [selects, setSelects] = useState<Record<string, string>>(() => Object.fromEntries((spec.selects ?? []).map((s) => [s.id, s.default])));
  const [paperChoice, setPaperChoice] = useState<Paper | null>(null);

  /* ── Steps ── */
  const [stepIdx, setStepIdx] = useState(0);
  const [furthest, setFurthest] = useState(0);

  /* ── Panel (resizable / foldable) ── */
  const [panelW, setPanelW] = useState(() => Math.min(PANEL.max, Math.max(PANEL.min, Number(store.get("rb.panel.w")) || PANEL.def)));
  const [folded, setFolded] = useState(() => store.get("rb.panel.folded") === "1");
  const [dragging, setDragging] = useState(false);
  const [guideOpen, setGuideOpen] = useState(() => store.get("rb.guide") !== "0");

  /* ── Preview / output ── */
  const [zoom, setZoom] = useState<"fit" | "actual">("fit");
  const [limit, setLimit] = useState(12);
  const [paneW, setPaneW] = useState(800);
  const [busy, setBusy] = useState<null | Output>(null);
  const [confirm, setConfirm] = useState<Output | null>(null);

  const v = spec.variants.find((x) => x.id === variant)!;
  const dated = v.dated !== false;
  const monthly = v.periodMode === "month";
  const range = useMemo(() => {
    const r = monthly ? monthRange(month) : presetRange(preset, from, to);
    // Roles limited to a month: a longer custom range is cut to the last `maxDays` days of it.
    if (maxDays && r.days > maxDays) return resolveRange({ key: "custom", from: isoDate(addDays(r.to, -(maxDays - 1))), to: isoDate(r.to) });
    return r;
  }, [monthly, month, preset, from, to, maxDays]);
  const presets = maxDays && maxDays < 365 ? PRESETS.filter((p) => p.id !== "year") : PRESETS;
  const cols = columns[variant] ?? NO_COLUMNS;
  const optionDefs = (spec.options ?? []).filter((o) => !o.variants || o.variants.includes(variant));
  const selectDefs = (spec.selects ?? []).filter((s) => !s.variants || s.variants.includes(variant));
  const columnDefs = spec.columns?.[variant];
  const hasContent = selectDefs.length > 0 || optionDefs.length > 0 || !!columnDefs;
  // Three steps, each grouping related choices into sections.
  const steps: { id: string; title: string; icon: typeof Printer; sections: StepId[] }[] = [
    { id: "report", title: "Choose report", icon: ListChecks, sections: ["type", ...(dated ? (["period"] as StepId[]) : [])] },
    { id: "content", title: "Choose content", icon: SlidersHorizontal, sections: ["branch", ...(hasContent ? (["content"] as StepId[]) : [])] },
    { id: "print", title: "Paper & review", icon: Printer, sections: ["paper", "review"] },
  ];
  const current = steps[Math.min(stepIdx, steps.length - 1)];
  const atReview = stepIdx >= steps.length - 1;

  const recommended = spec.suggestPaper({ variant, range, branch, options, columns: cols, selects, paper: { size: "A4", orientation: "portrait" } });
  const chosen = paperChoice ?? recommended;
  const paperKey = `${chosen.size}|${chosen.orientation}`;
  const paper = useMemo<Paper>(() => {
    const [size, orientation] = paperKey.split("|") as [PaperSize, Orientation];
    return { size, orientation };
  }, [paperKey]);
  const params = useMemo<ReportParams>(() => ({ variant, range, branch, options, columns: cols, selects, paper }), [variant, range, branch, options, cols, selects, paper]);
  const deferred = useDeferredValue(params);
  const doc = useMemo(() => spec.build(deferred, { agents, hideProfit }), [spec, deferred, agents, hideProfit]);
  const stale = deferred !== params;
  const { pages, measurer } = usePagination(doc, deferred.paper);
  const rows = tableRowCount(doc);
  const { w: pw, h: ph } = paperPx(deferred.paper);
  const scale = zoom === "fit" ? Math.min(1, Math.max(0.2, (paneW - 56) / pw)) : 1;
  const ready = !!pages && !stale;

  const setPaper = (p: Partial<Paper>) => setPaperChoice({ ...paper, ...p });
  const toggleColumn = (id: string) =>
    setColumns((c) => {
      const list = c[variant] ?? [];
      const on = list.includes(id);
      return { ...c, [variant]: on ? list.filter((x) => x !== id) : (columnDefs ?? []).map((x) => x.id).filter((x) => x === id || list.includes(x)) };
    });

  /* Anything left out — shown on Review and confirmed before output. */
  const reminders: Reminder[] = [
    ...(columnDefs ?? []).filter((d) => !d.required && !cols.includes(d.id)).map((d) => ({ id: `c-${d.id}`, label: `${d.label} column`, recommended: d.default, include: () => toggleColumn(d.id) })),
    ...optionDefs.filter((o) => !options[o.id]).map((o) => ({ id: `o-${o.id}`, label: o.label, recommended: o.default, include: () => setOptions((x) => ({ ...x, [o.id]: true })) })),
  ];
  const missingRecommended = reminders.filter((r) => r.recommended);

  /* ── Effects ── */
  useEffect(() => setLimit(12), [doc, paper]);
  // Everything was included from the reminder box — close it; the preview already shows the result.
  useEffect(() => {
    if (confirm && missingRecommended.length === 0) {
      setConfirm(null);
      showToast("Added to the report — check the preview, then choose your output again");
    }
  }, [confirm, missingRecommended.length, showToast]);
  useEffect(() => {
    const el = pane.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setPaneW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const toggleFold = useCallback(() => {
    setFolded((f) => {
      store.set("rb.panel.folded", f ? "0" : "1");
      return !f;
    });
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const layers = document.querySelectorAll(".modal-layer");
      const top = layers[layers.length - 1] === box.current?.parentElement;
      if (!top) return;
      if (e.key === "Escape") onClose();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleFold();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, toggleFold]);

  /* ── Panel resize (drag the edge) ── */
  const startDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (folded) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = panelW;
    setDragging(true);
    let latest = startW;
    const move = (ev: PointerEvent) => {
      const w = startW + (ev.clientX - startX);
      // Dragging well past the minimum folds the panel, like VS Code.
      if (w < PANEL.min - 90) {
        setFolded(true);
        store.set("rb.panel.folded", "1");
        return;
      }
      latest = Math.min(PANEL.max, Math.max(PANEL.min, w));
      setPanelW(latest);
    };
    const up = () => {
      setDragging(false);
      store.set("rb.panel.w", String(latest));
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const goStep = (i: number) => {
    const n = Math.max(0, Math.min(steps.length - 1, i));
    setStepIdx(n);
    setFurthest((f) => Math.max(f, n));
    // The guide has done its job after step 1; fold it so the step card is in view (its button reopens it).
    if (n > 0) setGuideOpen(false);
    if (folded) toggleFold();
  };
  const jumpTo = (id: StepId) => goStep(Math.max(0, steps.findIndex((s) => s.sections.includes(id))));

  /* ── Outputs ── */
  const run = async (o: Output) => {
    setConfirm(null);
    logAudit({
      category: "Reports",
      action: o === "print" ? "Report printed" : o === "pdf" ? "Report downloaded (PDF)" : "Report exported (spreadsheet)",
      record: doc.title,
      details: `${doc.subtitle} · ${paperName(deferred.paper)}${missingRecommended.length ? ` · left out: ${missingRecommended.map((r) => r.label).join(", ")}` : ""}`,
      branchId: branch === "all" ? null : branch,
    });
    if (o === "csv") {
      saveFile(`${doc.filename}.csv`, toCsv(doc), "text/csv;charset=utf-8");
      showToast(`Saved ${doc.filename}.csv — opens in Excel`);
      return;
    }
    setBusy(o);
    try {
      if (o === "print" && pages) await printPages(doc, pages, deferred.paper);
      if (o === "pdf") {
        await savePdf(doc, deferred.paper, brandColours().brand, companyName());
        showToast(`Saved ${doc.filename}.pdf`);
      }
    } finally {
      setBusy(null);
    }
  };
  const request = (o: Output) => (missingRecommended.length ? setConfirm(o) : run(o));
  const OUTPUT_NAME: Record<Output, string> = { print: "Print", pdf: "Download PDF", csv: "Export spreadsheet" };

  /* ── Step summaries for the step list ── */
  const summary: Record<StepId, string> = {
    type: v.label,
    period: !dated ? "Not needed" : monthly ? monthLabel(month) : range.days === 1 ? dayText(range.from) : `${dayText(range.from)} – ${dayText(range.to)}`,
    branch: branch === "all" ? "All branches" : `${BRANCHES.find((b) => b.id === branch)?.name ?? branch} branch`,
    content: [columnDefs ? `${cols.length} columns` : "", optionDefs.length ? `${optionDefs.filter((o) => options[o.id]).length} of ${optionDefs.length} extras` : "", ...selectDefs.map((s) => s.options({ agents }).find((o) => o.value === selects[s.id])?.label ?? "")].filter(Boolean).join(" · "),
    paper: paperName(paper),
    review: missingRecommended.length ? `${missingRecommended.length} reminder${missingRecommended.length === 1 ? "" : "s"}` : "Ready",
  };
  const stepSummary = (i: number) =>
    steps[i].sections
      .map((s) => summary[s])
      .filter((x) => x && x !== "Not needed")
      .join(" · ");

  const panelStyle = { ["--rb-panel" as string]: `${folded ? PANEL.rail : panelW}px` };

  return createPortal(
    <AnimatePresence>
      <motion.div key="report-builder" className="modal-layer fd-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <motion.div ref={box} className={`rb ${folded ? "is-folded" : ""} ${dragging ? "is-dragging" : ""}`} style={panelStyle} role="dialog" aria-modal="true" aria-labelledby={titleId} initial={m.modal.initial} animate={m.modal.animate} exit={m.modal.exit}>
          <style>{REPORT_CSS}</style>

          {/* ── Theme side panel ── */}
          <aside className="rb-panel" aria-label="Report steps">
            <div className="rb-panel-head">
              <span className="rb-icon" aria-hidden="true">
                <spec.icon size={20} />
              </span>
              <div className="rb-panel-title rb-fade">
                <span>Report builder</span>
                <strong id={titleId}>{spec.title}</strong>
              </div>
              <button type="button" className="rb-fold" onClick={toggleFold} aria-label={folded ? "Open the steps panel" : "Fold the steps panel"} title={`${folded ? "Open" : "Fold"} panel (Ctrl+B)`}>
                {folded ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
              </button>
            </div>

            {folded ? (
              <ol className="rb-rail" aria-label="Steps">
                {steps.map((s, i) => (
                  <li key={s.id}>
                    <button type="button" className={`${i === stepIdx ? "is-current" : ""} ${i <= furthest && i !== stepIdx ? "is-done" : ""}`} disabled={i > furthest} onClick={() => goStep(i)} title={`${i + 1}. ${s.title} — ${stepSummary(i)}`}>
                      {i <= furthest && i !== stepIdx ? <Check size={15} /> : i + 1}
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <>
                {/* Progress: 1 Choose report → 2 Choose content → 3 Paper & review */}
                <ol className="rb-progress" aria-label="Steps">
                  {steps.map((s, i) => {
                    const state = i === stepIdx ? "is-current" : i <= furthest ? "is-done" : "is-locked";
                    return (
                      <li key={s.id} className={state}>
                        <button type="button" disabled={i > furthest} onClick={() => goStep(i)} aria-current={i === stepIdx ? "step" : undefined}>
                          <i>{state === "is-done" ? <Check size={14} /> : i + 1}</i>
                          <span>{s.title}</span>
                        </button>
                      </li>
                    );
                  })}
                </ol>

                <div className="rb-panel-body thin-scroll">
                  <section className={`rb-guide ${guideOpen ? "is-open" : ""}`}>
                    <button
                      type="button"
                      className="rb-guide-toggle"
                      aria-expanded={guideOpen}
                      onClick={() =>
                        setGuideOpen((o) => {
                          store.set("rb.guide", o ? "0" : "1");
                          return !o;
                        })
                      }
                    >
                      <CircleHelp size={17} /> How to create this report <ChevronDown size={17} className="rb-chev" />
                    </button>
                    {guideOpen && (
                      <div className="rb-guide-body">
                        <p className="rb-guide-lead">
                          <Lightbulb size={16} /> {spec.guide}
                        </p>
                        <ol>
                          {steps.map((s, i) => (
                            <li key={s.id}>
                              <b>{s.title}</b>
                              <span>{i === 0 ? "Pick the report and the dates it covers." : i === 1 ? "Pick the branch and what the report should include." : "Pick the paper, check the reminders, then print, download or export."}</span>
                            </li>
                          ))}
                        </ol>
                        <p className="rb-guide-tip">The preview on the right updates as you choose and shows exactly what will print.</p>
                      </div>
                    )}
                  </section>

                  <div className="rb-card">
                    <header className="rb-card-head">
                      <span className="rb-card-icon" aria-hidden="true">
                        <current.icon size={18} />
                      </span>
                      <div>
                        <span className="rb-card-step">
                          Step {stepIdx + 1} of {steps.length}
                        </span>
                        <h3>{current.title}</h3>
                      </div>
                    </header>
                    {current.sections.map((sec) => (
                      <section key={sec} className="rb-sec">
                        <h4>{STEP_TITLE[sec]}</h4>
                        <p className="rb-sec-help">{STEP_HELP[sec]}</p>
                        {sectionBody(sec)}
                      </section>
                    ))}
                  </div>
                </div>

                <nav className="rb-panel-nav" aria-label="Step navigation">
                  {stepIdx > 0 ? (
                    <button type="button" className="rb-back" onClick={() => goStep(stepIdx - 1)}>
                      <ArrowLeft size={16} /> Back
                    </button>
                  ) : (
                    <span />
                  )}
                  {atReview ? (
                    <span className="rb-ready">
                      <CircleCheck size={16} /> Choose an output under the preview
                    </span>
                  ) : (
                    <button type="button" className="rb-next" onClick={() => goStep(stepIdx + 1)}>
                      Next: {steps[stepIdx + 1].title} <ArrowRight size={16} />
                    </button>
                  )}
                </nav>
              </>
            )}
            <div className="rb-sash" onPointerDown={startDrag} onDoubleClick={toggleFold} role="separator" aria-orientation="vertical" aria-label="Drag to resize the steps panel; double-click to fold" title="Drag to resize · double-click to fold" />
          </aside>

          {/* ── White preview island ── */}
          <section className="rb-island" aria-label="Report preview">
            <header className="rb-island-head">
              <div className="rb-island-title">
                <span>Preview</span>
                <strong>
                  {pages ? `${formatCount(pages.length)} page${pages.length === 1 ? "" : "s"}` : "…"} · {paperName(deferred.paper)} · {formatCount(rows)} line{rows === 1 ? "" : "s"}
                </strong>
              </div>
              {!ready && (
                <span className="rb-busy">
                  <Loader2 size={15} className="spin" /> Updating preview…
                </span>
              )}
              {pages && pages.length > 40 && (
                <span className="rb-warn">
                  <TriangleAlert size={15} /> Long report — consider a shorter period or Export
                </span>
              )}
              <button type="button" className="rb-zoom" onClick={() => setZoom((z) => (z === "fit" ? "actual" : "fit"))}>
                <ZoomIn size={15} /> {zoom === "fit" ? "Actual size" : "Fit to width"}
              </button>
              <button type="button" className="fd-close" onClick={onClose} aria-label="Close report builder" data-close>
                <X size={20} />
              </button>
            </header>
            <div ref={pane} className={`rb-pages thin-scroll ${stale ? "is-stale" : ""}`} style={{ ["--rp-brand" as string]: "var(--brand-600)", ["--rp-brand-ink" as string]: "var(--brand-800)" }}>
              {pages?.slice(0, limit).map((p, i) => (
                <div key={i} className="rb-sheet" style={{ width: pw * scale, height: ph * scale }}>
                  <div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
                    <PageView doc={doc} page={p} index={i} count={pages.length} paper={deferred.paper} company={companyName()} />
                  </div>
                </div>
              ))}
              {pages && pages.length > limit && (
                <button type="button" className="rb-more" onClick={() => setLimit((l) => l + 12)}>
                  Show more pages ({formatCount(pages.length - limit)} not shown) — every page is included when you print or download
                </button>
              )}
              {measurer}
            </div>
            <footer className="rb-foot">
              <span className="rb-foot-note">{atReview ? "What you see is exactly what prints. Download and Export include every page and line." : `Step ${stepIdx + 1} of ${steps.length} · finish the steps on the left to unlock printing`}</span>
              <button type="button" className="rb-action" onClick={() => request("csv")} disabled={!atReview || !ready}>
                <FileSpreadsheet size={17} />
                <span>
                  Export
                  <small>Spreadsheet (CSV)</small>
                </span>
              </button>
              <button type="button" className="rb-action" onClick={() => request("pdf")} disabled={!atReview || !ready || busy !== null}>
                {busy === "pdf" ? <Loader2 size={17} className="spin" /> : <Download size={17} />}
                <span>
                  Download
                  <small>PDF file</small>
                </span>
              </button>
              <button type="button" className="rb-action is-primary" onClick={() => request("print")} disabled={!atReview || !ready || busy !== null}>
                {busy === "print" ? <Loader2 size={17} className="spin" /> : <Printer size={17} />}
                <span>
                  Print
                  <small>{paperName(deferred.paper)}</small>
                </span>
              </button>
            </footer>
          </section>
        </motion.div>

        <Modal
          open={confirm !== null}
          onClose={() => setConfirm(null)}
          icon={CircleAlert}
          title="Some details are not included"
          description="These are usually part of this report. Include them, or continue without them."
          footer={
            <>
              <button
                type="button"
                className="rb-back"
                onClick={() => {
                  setConfirm(null);
                  jumpTo(hasContent ? "content" : "review");
                }}
              >
                <ArrowLeft size={16} /> Go back and include
              </button>
              <button type="button" className="rb-next" onClick={() => confirm && run(confirm)}>
                {confirm ? OUTPUT_NAME[confirm] : ""} without them <ArrowRight size={16} />
              </button>
            </>
          }
        >
          <ul className="rb-remind-list">
            {missingRecommended.map((r) => (
              <li key={r.id}>
                <CircleAlert size={15} /> {r.label}
                <button type="button" className="text-link" onClick={r.include}>
                  Include
                </button>
              </li>
            ))}
          </ul>
        </Modal>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );

  /* ─────────────── Step bodies ─────────────── */
  function sectionBody(id: StepId) {
    if (id === "type")
      return (
        <div className="rb-choices" role="radiogroup" aria-label="Report type">
          {spec.variants.map((x) => (
            <button key={x.id} type="button" role="radio" aria-checked={x.id === variant} className={`rb-choice ${x.id === variant ? "is-on" : ""}`} onClick={() => setVariant(x.id)}>
              <i aria-hidden="true">{x.id === variant && <Check size={12} />}</i>
              <span>
                <b>{x.label}</b>
                <small>{x.description}</small>
              </span>
            </button>
          ))}
        </div>
      );

    if (id === "period" && monthly)
      return (
        <>
          <div className="rb-label">Month</div>
          <div className="rb-months" role="radiogroup" aria-label="Month">
            {availableMonths().map((k) => (
              <button key={k} type="button" role="radio" aria-checked={k === month} className={k === month ? "is-on" : ""} onClick={() => setMonth(k)}>
                {monthLabel(k)}
              </button>
            ))}
          </div>
          <p className="rb-note">
            <CalendarDays size={14} /> {summary.period}. Pick an earlier month to look back at past payouts.
          </p>
        </>
      );

    if (id === "period")
      return (
        <>
          <div className="rb-label">Quick period</div>
          <div className="rb-chips" role="group" aria-label="Quick period">
            {presets.map((p) => (
              <button key={p.id} type="button" className={preset === p.id ? "is-on" : ""} onClick={() => setPreset(p.id)}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="rb-label">Or exact dates</div>
          <div className="rb-dates">
            {(["from", "to"] as const).map((k) => (
              <label key={k}>
                <span>{k === "from" ? "From" : "To"}</span>
                <span className="rb-date">
                  <CalendarDays size={15} />
                  <input
                    type="date"
                    value={isoDate(k === "from" ? range.from : range.to)}
                    min={isoDate(DATA_START)}
                    max={isoDate(TODAY)}
                    onChange={(e) => {
                      if (!e.target.value) return;
                      if (k === "from") {
                        setFrom(e.target.value);
                        setTo(isoDate(range.to));
                      } else {
                        setTo(e.target.value);
                        setFrom(isoDate(range.from));
                      }
                      setPreset("custom");
                    }}
                  />
                </span>
              </label>
            ))}
          </div>
          <p className="rb-note">
            <CalendarDays size={14} /> {summary.period} · {formatCount(range.days)} day{range.days === 1 ? "" : "s"}
            {v.periodNote ? ` · ${v.periodNote}` : ""}
          </p>
          {maxDays && maxDays < 365 && <p className="rb-note">Your role reports on up to one month at a time (yearly reports are with the Branch Manager).</p>}
        </>
      );

    if (id === "branch" && lockedBranch) {
      const b = BRANCHES.find((x) => x.id === lockedBranch);
      return (
        <>
          <div className="rb-choices" aria-label="Branch">
            <div className="rb-choice is-on is-locked">
              <i aria-hidden="true">
                <Check size={12} />
              </i>
              <span>
                <b>
                  {b?.name} branch · {b?.code}
                </b>
                <small>Reports from the branch workspace always cover this branch only.</small>
              </span>
            </div>
          </div>
        </>
      );
    }

    if (id === "branch")
      return (
        <>
          <div className="rb-choices" role="radiogroup" aria-label="Branch">
            <button type="button" role="radio" aria-checked={branch === "all"} className={`rb-choice ${branch === "all" ? "is-on" : ""}`} onClick={() => setBranch("all")}>
              <i aria-hidden="true">{branch === "all" && <Check size={12} />}</i>
              <span>
                <b>All branches</b>
                <small>The whole company, each branch in its own currency</small>
              </span>
            </button>
            {BRANCHES.map((b) => (
              <button key={b.id} type="button" role="radio" aria-checked={branch === b.id} disabled={b.status !== "Active"} className={`rb-choice ${branch === b.id ? "is-on" : ""}`} onClick={() => setBranch(b.id)}>
                <i aria-hidden="true">{branch === b.id && <Check size={12} />}</i>
                <span>
                  <b>
                    {b.name} branch · {b.code}
                  </b>
                  <small>
                    {b.city}, {b.country} · {b.status === "Active" ? b.currency : "not trading yet"}
                  </small>
                </span>
              </button>
            ))}
          </div>
          {BRANCHES.filter((b) => b.status === "Active").length === 1 && <p className="rb-note">Only one branch is trading, so both choices give the same figures for now.</p>}
        </>
      );

    if (id === "content")
      return (
        <>
          {selectDefs.map((s) => {
            const opts = s.options({ agents });
            return (
              <div key={s.id} className="rb-field">
                <div className="rb-label">{s.label}</div>
                {opts.length > 10 ? (
                  <SearchSelect value={selects[s.id]} options={opts} onChange={(val) => setSelects((x) => ({ ...x, [s.id]: val }))} ariaLabel={s.label} searchPlaceholder={`Search ${s.label.toLowerCase()}…`} className="select-btn rb-select" width={340} />
                ) : (
                  <SelectMenu value={selects[s.id]} options={opts} onChange={(val: string) => setSelects((x) => ({ ...x, [s.id]: val }))} ariaLabel={s.label} className="select-btn rb-select" />
                )}
                <small>{s.help}</small>
              </div>
            );
          })}
          {columnDefs && (
            <div className="rb-field">
              <div className="rb-label">
                Columns to print <em>{cols.length} selected</em>
              </div>
              <div className="rb-cols">
                {columnDefs.map((d) => {
                  const on = cols.includes(d.id);
                  return (
                    <button key={d.id} type="button" className={`rb-check ${on ? "is-on" : ""}`} aria-pressed={on} disabled={d.required} onClick={() => toggleColumn(d.id)} title={d.required ? "Always included" : undefined}>
                      <i aria-hidden="true">{on && <Check size={11} />}</i>
                      {d.label}
                    </button>
                  );
                })}
              </div>
              <small>Names are always included. Columns you leave out are listed on the Review step.</small>
            </div>
          )}
          {optionDefs.length > 0 && (
            <div className="rb-field">
              <div className="rb-label">Extras</div>
              {optionDefs.map((o) => (
                <button key={o.id} type="button" className={`rb-toggle ${options[o.id] ? "is-on" : ""}`} aria-pressed={!!options[o.id]} onClick={() => setOptions((x) => ({ ...x, [o.id]: !x[o.id] }))}>
                  <i aria-hidden="true" />
                  <span>
                    <b>{o.label}</b>
                    <small>{o.help}</small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      );

    if (id === "paper")
      return (
        <>
          <div className="rb-label">Paper size</div>
          <div className="rb-chips" role="group" aria-label="Paper size">
            {(["A4", "A3", "Letter"] as PaperSize[]).map((s) => (
              <button key={s} type="button" className={paper.size === s ? "is-on" : ""} onClick={() => setPaper({ size: s })} title={PAPER_LABEL[s]}>
                {s}
              </button>
            ))}
          </div>
          <div className="rb-label">Orientation</div>
          <div className="rb-orient" role="group" aria-label="Orientation">
            {(["portrait", "landscape"] as Orientation[]).map((o) => (
              <button key={o} type="button" className={paper.orientation === o ? "is-on" : ""} onClick={() => setPaper({ orientation: o })}>
                <span className={`rb-sheet-icon is-${o}`} aria-hidden="true" />
                {o === "portrait" ? "Portrait" : "Landscape"}
              </button>
            ))}
          </div>
          <p className="rb-note">
            {PAPER_LABEL[paper.size]} · {paper.orientation}.{" "}
            {paperName(paper) === paperName(recommended) ? (
              <b>Recommended for this report.</b>
            ) : (
              <>
                Recommended: <b>{paperName(recommended)}</b>{" "}
                <button type="button" className="text-link" onClick={() => setPaperChoice(null)}>
                  Use recommended
                </button>
              </>
            )}
          </p>
        </>
      );

    // Review
    return (
      <>
        <dl className="rb-review">
          {steps
            .flatMap((s) => s.sections)
            .filter((s) => s !== "review" && !(s === "period" && !dated))
            .map((s) => (
              <div key={s}>
                <dt>{STEP_TITLE[s]}</dt>
                <dd>{summary[s]}</dd>
                <button type="button" className="text-link" onClick={() => jumpTo(s)}>
                  Change
                </button>
              </div>
            ))}
        </dl>
        {reminders.length ? (
          <div className={`rb-remind ${missingRecommended.length ? "is-warn" : ""}`}>
            <div className="rb-remind-title">
              <CircleAlert size={16} /> Not included in this report
            </div>
            <ul>
              {reminders.map((r) => (
                <li key={r.id}>
                  <span>
                    {r.label}
                    {r.recommended && <em>usually included</em>}
                  </span>
                  <button type="button" onClick={r.include}>
                    <Plus size={13} /> Include
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="rb-remind is-ok">
            <div className="rb-remind-title">
              <CircleCheck size={16} /> Everything available is included
            </div>
          </div>
        )}
        <p className="rb-note">
          <ArrowRight size={14} /> Choose <b>Print</b>, <b>Download</b> or <b>Export</b> under the preview.
        </p>
      </>
    );
  }
}
