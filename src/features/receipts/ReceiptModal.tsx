/**
 * Receipt pop-up: choose the paper (58 mm / 80 mm till roll or A5), check the
 * live preview (scrolls for long receipts), then Print, Download (PDF) or
 * Export (image). The PDF and image are rendered from the preview itself, and
 * Print uses the same markup and stylesheet, so all three match the preview.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Download, ImageDown, Loader2, Printer, ReceiptText, X } from "lucide-react";
import { useApp } from "@/app/AppState";
import { logAudit } from "@/services/audit";
import { formatMoney } from "@/shared/format";
import { getBranch } from "@/data/company";
import type { PatientVisit } from "@/data/demo/dailyLines";
import { hospitalKey } from "@/data/legacy";
import { updateBranchContact, updateReceiptProfile, useReceiptProfile } from "@/services/receiptProfile";
import { useMotionPreset } from "@/shared/motion";
import { saveFile } from "@/features/reports/model";
import { REPORT_FONT_URL } from "@/features/reports/reportCss";
import { RECEIPT_CSS, RECEIPT_PAPERS, ReceiptDoc, type ReceiptData, type ReceiptOptions, type ReceiptPaper } from "./Receipt";

const PX_PER_MM = 96 / 25.4;
const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch] as string);

/**
 * Renders the receipt with the browser's own layout engine (SVG foreignObject),
 * so the image and PDF match the preview pixel for pixel — fonts included.
 */
async function capture(el: HTMLElement) {
  const { toCanvas } = await import("html-to-image");
  await document.fonts?.ready;
  return toCanvas(el, { pixelRatio: 3, backgroundColor: "#ffffff", cacheBust: true });
}

export function ReceiptModal({ visit, onClose }: { visit: PatientVisit; onClose: () => void }) {
  const { agents, showToast } = useApp();
  const profile = useReceiptProfile();
  const m = useMotionPreset();
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  const shotRef = useRef<HTMLDivElement>(null);
  const [paper, setPaper] = useState<ReceiptPaper>("80");
  const [options, setOptions] = useState<ReceiptOptions>({ codes: true, printedOn: true });
  const [busy, setBusy] = useState<null | "print" | "pdf" | "png">(null);
  const printedAt = useMemo(() => new Date(), []);

  const branch = getBranch(visit.branchId);
  const agent = visit.agentId !== null ? agents.find((a) => a.id === visit.agentId) : undefined;
  const data: ReceiptData = {
    visit,
    branch,
    agentName: agent ? agent.name : visit.agentId !== null ? `PR agent #${visit.agentId}` : null,
    hospital: agent ? hospitalKey(agent.hospital) || null : null,
    profile,
    paper,
    options,
    printedAt,
  };
  const contact = (branch && profile.branches[branch.id]) || { address: "", phone: "" };
  const fileBase = `receipt-${visit.id}-${paper === "a5" ? "a5" : `${paper}mm`}`;
  const paperDef = RECEIPT_PAPERS.find((p) => p.id === paper)!;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const layers = document.querySelectorAll(".modal-layer");
      if (e.key === "Escape" && layers[layers.length - 1] === box.current?.parentElement) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const receiptEl = () => shotRef.current?.querySelector<HTMLElement>(".rc") ?? null;

  const doPrint = async () => {
    const el = receiptEl();
    if (!el) return;
    logAudit({ category: "Receipts", action: "Receipt printed", record: `${visit.id} · ${visit.patientRef}`, details: `${paperDef.label} · ${formatMoney(visit.paid, branch?.currency ?? "NGN")} paid of ${formatMoney(visit.billed, branch?.currency ?? "NGN")}`, branchId: visit.branchId });
    setBusy("print");
    try {
      const heightMm = Math.ceil(el.getBoundingClientRect().height / PX_PER_MM) + 2;
      const size = paper === "a5" ? "A5 portrait" : `${paperDef.widthMm}mm ${heightMm}mm`;
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(fileBase)}</title><link rel="stylesheet" href="${REPORT_FONT_URL}"><style>${RECEIPT_CSS}
@page{size:${size};margin:0}html,body{margin:0;padding:0;background:#fff}</style></head><body>${el.outerHTML}</body></html>`;
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
        /* offline: system font, same as preview */
      }
      w.addEventListener("afterprint", () => setTimeout(() => frame.remove(), 500), { once: true });
      setTimeout(() => frame.remove(), 120_000);
      w.focus();
      w.print();
    } finally {
      setBusy(null);
    }
  };

  const doPdf = async () => {
    const el = receiptEl();
    if (!el) return;
    logAudit({ category: "Receipts", action: "Receipt downloaded (PDF)", record: `${visit.id} · ${visit.patientRef}`, details: paperDef.label, branchId: visit.branchId });
    setBusy("pdf");
    try {
      const canvas = await capture(el);
      const { jsPDF } = await import("jspdf");
      const wMm = paperDef.widthMm;
      const hMm = (canvas.height / canvas.width) * wMm;
      const pdf = new jsPDF({ unit: "mm", format: paper === "a5" ? "a5" : [wMm, hMm], orientation: "portrait" });
      // High-quality JPEG keeps text crisp at print resolution while keeping the file small.
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, wMm, hMm);
      pdf.save(`${fileBase}.pdf`);
      showToast(`Saved ${fileBase}.pdf`);
    } finally {
      setBusy(null);
    }
  };

  const doPng = async () => {
    const el = receiptEl();
    if (!el) return;
    logAudit({ category: "Receipts", action: "Receipt exported (image)", record: `${visit.id} · ${visit.patientRef}`, details: paperDef.label, branchId: visit.branchId });
    setBusy("png");
    try {
      const canvas = await capture(el);
      const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/png"));
      if (blob) {
        saveFile(`${fileBase}.png`, blob, "image/png");
        showToast(`Saved ${fileBase}.png — ready to share`);
      }
    } finally {
      setBusy(null);
    }
  };

  const balance = visit.billed - visit.paid;

  return createPortal(
    <AnimatePresence>
      <motion.div key="receipt-modal" className="modal-layer fd-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <motion.div ref={box} className="rcm" role="dialog" aria-modal="true" aria-labelledby={titleId} initial={m.modal.initial} animate={m.modal.animate} exit={m.modal.exit}>
          <style>{RECEIPT_CSS}</style>

          {/* ── Settings ── */}
          <aside className="rcm-side thin-scroll">
            <div className="rcm-side-head">
              <span className="rcm-icon" aria-hidden="true">
                <ReceiptText size={20} />
              </span>
              <div>
                <span>Patient receipt</span>
                <strong id={titleId}>{visit.patientRef}</strong>
                <small>
                  {visit.id} · {balance <= 0 ? "Fully paid" : visit.paid > 0 ? "Part payment" : "Not paid"}
                </small>
              </div>
            </div>

            <section className="rcm-card">
              <h3>
                <i>1</i> Paper
              </h3>
              <p className="rcm-help">Choose the printer paper. Till rolls fit POS and thermal printers.</p>
              <div className="rcm-papers" role="radiogroup" aria-label="Paper">
                {RECEIPT_PAPERS.map((p) => (
                  <button key={p.id} type="button" role="radio" aria-checked={paper === p.id} className={paper === p.id ? "is-on" : ""} onClick={() => setPaper(p.id)}>
                    <span className={`rcm-roll is-${p.id}`} aria-hidden="true" />
                    <span>
                      <b>{p.label}</b>
                      <small>{p.note}</small>
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className="rcm-card">
              <h3>
                <i>2</i> Show on the receipt
              </h3>
              {(
                [
                  ["codes", "Test category and code", "e.g. LAB · #82 under each test"],
                  ["printedOn", "Printed date and time", "Shows when this copy was printed"],
                ] as const
              ).map(([k, label, help]) => (
                <button key={k} type="button" className={`rb-toggle ${options[k] ? "is-on" : ""}`} aria-pressed={options[k]} onClick={() => setOptions((o) => ({ ...o, [k]: !o[k] }))}>
                  <i aria-hidden="true" />
                  <span>
                    <b>{label}</b>
                    <small>{help}</small>
                  </span>
                </button>
              ))}
            </section>

            <section className="rcm-card">
              <h3>
                <i>3</i> Receipt details
              </h3>
              <p className="rcm-help">These were not in the legacy records. Fill them in once and they print on every receipt (saved for this session until the database is connected).</p>
              <label className="rcm-field">
                <span>{branch?.name} branch address</span>
                <input value={contact.address} onChange={(e) => branch && updateBranchContact(branch.id, { address: e.target.value })} placeholder={`e.g. Plot 12, … ${branch?.city}`} />
              </label>
              <label className="rcm-field">
                <span>Branch phone</span>
                <input value={contact.phone} onChange={(e) => branch && updateBranchContact(branch.id, { phone: e.target.value })} placeholder="e.g. 0803 000 0000" inputMode="tel" />
              </label>
              <label className="rcm-field">
                <span>Company email</span>
                <input value={profile.email} onChange={(e) => updateReceiptProfile({ email: e.target.value })} placeholder="e.g. info@company.com" />
              </label>
              <label className="rcm-field">
                <span>Motto</span>
                <input value={profile.motto} onChange={(e) => updateReceiptProfile({ motto: e.target.value })} placeholder="Optional" />
              </label>
              <label className="rcm-field">
                <span>Thank-you message</span>
                <textarea rows={3} value={profile.thankYou} onChange={(e) => updateReceiptProfile({ thankYou: e.target.value })} />
              </label>
            </section>
          </aside>

          {/* ── Preview ── */}
          <section className="rcm-main">
            <header className="rcm-head">
              <div>
                <span>Preview</span>
                <strong>
                  {paperDef.label} · {visit.services.length} test{visit.services.length === 1 ? "" : "s"}
                </strong>
              </div>
              <button type="button" className="fd-close" onClick={onClose} aria-label="Close receipt" data-close>
                <X size={20} />
              </button>
            </header>
            <div className="rcm-stage thin-scroll">
              <div className={`rcm-paper is-${paper}`} ref={shotRef}>
                <ReceiptDoc {...data} />
              </div>
              <p className="rcm-stage-note">Shown at actual size. Scroll to see the whole receipt — it prints exactly like this.</p>
            </div>
            <footer className="rcm-foot">
              <span className="rcm-foot-note">Check the preview, then choose how to output it.</span>
              <button type="button" className="rb-action" onClick={doPng} disabled={busy !== null}>
                {busy === "png" ? <Loader2 size={17} className="spin" /> : <ImageDown size={17} />}
                <span>
                  Export
                  <small>Image (PNG)</small>
                </span>
              </button>
              <button type="button" className="rb-action" onClick={doPdf} disabled={busy !== null}>
                {busy === "pdf" ? <Loader2 size={17} className="spin" /> : <Download size={17} />}
                <span>
                  Download
                  <small>PDF file</small>
                </span>
              </button>
              <button type="button" className="rb-action is-primary" onClick={doPrint} disabled={busy !== null}>
                {busy === "print" ? <Loader2 size={17} className="spin" /> : <Printer size={17} />}
                <span>
                  Print
                  <small>{paperDef.label}</small>
                </span>
              </button>
            </footer>
          </section>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
