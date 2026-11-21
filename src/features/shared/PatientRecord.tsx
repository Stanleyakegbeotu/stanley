/**
 * Patient visit record — the app-wide patient card. Every place that lists
 * patients (Patients page, dashboard Patients pop-up, PR agent profiles) opens
 * this same component; reuse it rather than building another patient view.
 *  • Left (theme panel): patient overview — status, number of visits, total
 *    generated, paid and outstanding — and every visit, newest first; pick one
 *    to view it.
 *  • Right: the selected visit as a receipt-style slip — date, arrival time,
 *    who processed it, payment method, referrer and the itemised tests.
 * Patients are anonymous references (no patient records were exported); staff
 * names appear once staff accounts exist.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, Clock3, CreditCard, Handshake, MapPin, Phone, Printer, UserCheck, UserRound, X } from "lucide-react";
import { useApp } from "@/app/AppState";
import { SERVICES, getBranch } from "@/data/company";
import { patientHistory, type PatientVisit } from "@/data/demo/dailyLines";
import { useMotionPreset } from "@/shared/motion";
import { formatCount, formatMoney, formatShortDate, formatTime } from "@/shared/format";
import { Button } from "@/shared/ui/controls";
import { ReceiptModal } from "@/features/receipts/ReceiptModal";

const CATEGORY = new Map(SERVICES.map((s) => [s.id, s.category]));
const fullDate = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

export function PatientRecordModal({ visit, onClose }: { visit: PatientVisit | null; onClose: () => void }) {
  return <>{visit && <PatientRecord key={visit.id} visit={visit} onClose={onClose} />}</>;
}

function PatientRecord({ visit, onClose }: { visit: PatientVisit; onClose: () => void }) {
  const m = useMotionPreset();
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  const history = useMemo(() => patientHistory(visit.branchId, visit.patientRef), [visit.branchId, visit.patientRef]);
  const visits = history.visits.length ? history.visits : [visit];
  const [selectedId, setSelectedId] = useState(visit.id);
  const [receiptFor, setReceiptFor] = useState<PatientVisit | null>(null);
  const current = visits.find((v) => v.id === selectedId) ?? visit;
  const branch = getBranch(visit.branchId);
  const c = branch?.currency ?? "NGN";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const layers = document.querySelectorAll(".modal-layer");
      if (e.key === "Escape" && layers[layers.length - 1] === box.current?.parentElement) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Keep the selected visit visible in the history list.
  useEffect(() => {
    box.current?.querySelector<HTMLElement>(".vrd-history button.is-current")?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  const totals = visits.reduce((s, v) => ({ billed: s.billed + v.billed, paid: s.paid + v.paid, tests: s.tests + v.services.length }), { billed: 0, paid: 0, tests: 0 });
  const outstanding = totals.billed - totals.paid;
  const first = visits[0];
  const last = visits[visits.length - 1];
  const newestFirst = [...visits].reverse();
  const status = visits.length > 1 ? `Returning patient · ${visits.length} visits` : "Single visit";

  return createPortal(
    <AnimatePresence>
      <motion.div key="patient-record" className="modal-layer fd-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <motion.div ref={box} className="fd vrd" role="dialog" aria-modal="true" aria-labelledby={titleId} initial={m.modal.initial} animate={m.modal.animate} exit={m.modal.exit}>
          {/* Patient overview */}
          <aside className="fd-side vrd-side">
            <div className="vrd-id">
              <span className="vrd-avatar" aria-hidden="true">
                <UserRound size={30} />
              </span>
              <span className="vrd-eyebrow">Patient</span>
              <strong>{visit.patientRef}</strong>
              <em>{status}</em>
              <span className="vrd-phone">
                <Phone size={13} aria-hidden="true" />
                {visit.phone ?? "Phone not provided"}
              </span>
            </div>

            <dl className="vrd-stats">
              <div>
                <dt>Visits</dt>
                <dd className="num">{formatCount(visits.length)}</dd>
              </div>
              <div>
                <dt>Tests</dt>
                <dd className="num">{formatCount(totals.tests)}</dd>
              </div>
              <div className="wide">
                <dt>Total generated</dt>
                <dd className="num">{formatMoney(totals.billed, c)}</dd>
              </div>
              <div>
                <dt>Paid</dt>
                <dd className="num">{formatMoney(totals.paid, c, true)}</dd>
              </div>
              <div className={outstanding > 0 ? "is-due" : ""}>
                <dt>Outstanding</dt>
                <dd className="num">{formatMoney(outstanding, c, true)}</dd>
              </div>
            </dl>

            <div className="vrd-dates">
              <span>{history.preExisting ? "Registered before records began" : `First visit ${formatShortDate(first.at)} ${first.at.getFullYear()}`}</span>
              <span>Last visit {formatShortDate(last.at)} {last.at.getFullYear()}</span>
            </div>

            <div className="vrd-history">
              <span className="vrd-history-title">Visit history</span>
              <ol className="thin-scroll">
                {newestFirst.map((v) => (
                  <li key={v.id}>
                    <button type="button" className={v.id === current.id ? "is-current" : ""} aria-current={v.id === current.id ? "true" : undefined} onClick={() => setSelectedId(v.id)}>
                      <span className={`vrd-dot is-${v.payment === "Paid" ? "paid" : v.payment === "Part-paid" ? "part" : "unpaid"}`} aria-hidden="true" />
                      <span className="vrd-visit">
                        <b>
                          {formatShortDate(v.at)} {v.at.getFullYear()}
                        </b>
                        <small>
                          {v.services.length} test{v.services.length === 1 ? "" : "s"} · {v.payment}
                        </small>
                      </span>
                      <span className="vrd-amt num">{formatMoney(v.billed, c, true)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          </aside>

          {/* Selected visit */}
          <section className="fd-main">
            <header className="fd-head">
              <div>
                <span className="fd-eyebrow">
                  Visit {newestFirst.findIndex((v) => v.id === current.id) + 1} of {visits.length} · {branch?.name} branch
                </span>
                <h2 id={titleId}>Patient visit record</h2>
                <p>
                  {current.id} · {fullDate(current.at)}
                </p>
              </div>
              <button type="button" className="fd-close" onClick={onClose} aria-label="Close patient record" data-close>
                <X size={20} />
              </button>
            </header>

            <div className="fd-body thin-scroll">
              <VisitSlip visit={current} />
            </div>

            <footer className="fd-foot">
              <span className="left">Demonstration visit built from the real catalogue and prices. Patients are anonymous references.</span>
              <Button variant="secondary" onClick={onClose}>
                Done
              </Button>
              <Button onClick={() => setReceiptFor(current)}>
                <Printer size={16} /> Print receipt
              </Button>
            </footer>
          </section>
        </motion.div>
      </motion.div>
      {receiptFor && <ReceiptModal key={receiptFor.id} visit={receiptFor} onClose={() => setReceiptFor(null)} />}
    </AnimatePresence>,
    document.body,
  );
}

function VisitSlip({ visit }: { visit: PatientVisit }) {
  const { agents } = useApp();
  const branch = getBranch(visit.branchId);
  const c = branch?.currency ?? "NGN";
  const agent = visit.agentId !== null ? agents.find((a) => a.id === visit.agentId) : undefined;
  const balance = visit.billed - visit.paid;
  const stamp = visit.payment === "Paid" ? "paid" : visit.payment === "Part-paid" ? "part" : "unpaid";

  return (
    <div className="vr">
      <section className="vr-top">
        <div className="vr-patient">
          <span className="vr-label">Patient</span>
          <strong>{visit.patientRef}</strong>
          <small>{visit.isNew ? "New patient · first visit" : "Returning patient"}</small>
          <span className="vr-phone">
            <Phone size={14} aria-hidden="true" />
            <span>Phone number</span>
            {visit.phone ? <b className="num">{visit.phone}</b> : <em className="vr-missing">Not provided</em>}
          </span>
        </div>
        <span className={`vr-stamp is-${stamp}`}>{visit.payment}</span>
      </section>

      <dl className="vr-grid">
        <div>
          <dt>
            <CalendarDays size={15} /> Date of visit
          </dt>
          <dd>{fullDate(visit.at)}</dd>
        </div>
        <div>
          <dt>
            <Clock3 size={15} /> Arrival time
          </dt>
          <dd>{formatTime(visit.at)}</dd>
        </div>
        <div>
          <dt>
            <UserCheck size={15} /> Processed by
          </dt>
          <dd>
            {visit.processedBy.name ?? <span className="vr-missing">Name not on record</span>}
            <small>{visit.processedBy.role}</small>
          </dd>
        </div>
        <div>
          <dt>
            <CreditCard size={15} /> Payment method
          </dt>
          <dd>
            {visit.method ?? <span className="vr-missing">Not paid yet</span>}
            {visit.method && visit.payment === "Part-paid" && <small>Part payment</small>}
          </dd>
        </div>
        <div>
          <dt>
            <Handshake size={15} /> Referred by
          </dt>
          <dd>
            {agent ? agent.name : visit.agentId !== null ? `PR agent #${visit.agentId}` : "Walk-in (no referrer)"}
            {agent?.hospital.trim() && <small>{agent.hospital.trim().toUpperCase()}</small>}
          </dd>
        </div>
        <div>
          <dt>
            <MapPin size={15} /> Branch
          </dt>
          <dd>
            {branch?.name} · {branch?.code}
            <small>{branch?.city}</small>
          </dd>
        </div>
      </dl>

      <section className="vr-bill">
        <header>
          <span>Tests performed</span>
          <b>
            {visit.services.length} test{visit.services.length === 1 ? "" : "s"}
          </b>
        </header>
        <ul>
          {visit.services.map((s, i) => (
            <li key={`${s.id}-${i}`}>
              <span className="vr-test">
                <strong>{s.name}</strong>
                <small>
                  {CATEGORY.get(s.id) ?? "—"} · #{s.id}
                </small>
              </span>
              <i aria-hidden="true" />
              <b className="num">{formatMoney(s.price, c)}</b>
            </li>
          ))}
        </ul>
        <dl className="vr-totals">
          <div>
            <dt>Total billed</dt>
            <dd className="num">{formatMoney(visit.billed, c)}</dd>
          </div>
          <div>
            <dt>Amount paid{visit.method ? ` · ${visit.method}` : ""}</dt>
            <dd className="num">{formatMoney(visit.paid, c)}</dd>
          </div>
          <div className={balance > 0 ? "is-due" : "is-clear"}>
            <dt>{balance > 0 ? "Balance due" : "Balance"}</dt>
            <dd className="num">{formatMoney(balance, c)}</dd>
          </div>
        </dl>
      </section>

      {!visit.processedBy.name && <p className="vr-note">Staff records were not part of the legacy export. The name of the receptionist or manager who processed the visit appears here once staff accounts are set up.</p>}
    </div>
  );
}
