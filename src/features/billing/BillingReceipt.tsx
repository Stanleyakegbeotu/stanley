/**
 * Step 5 — Receipt. Built only from the SAVED order (price snapshots, discount,
 * payment, referral), never from today's catalogue, so reprints always match.
 * Same till-roll layout and print/PDF/PNG pipeline as the patient receipts.
 */
import { useMemo, useRef, useState } from "react";
import { CircleCheck, CloudUpload, Download, ImageDown, Loader2, Printer, ReceiptText } from "lucide-react";
import { useApp } from "@/app/AppState";
import { type getBranch } from "@/data/company";
import { formatMoney } from "@/shared/format";
import { BrandLogo, useCompanyName } from "@/shell/BrandLogo";
import { logAudit } from "@/services/audit";
import { useReceiptProfile, type ReceiptProfile } from "@/services/receiptProfile";
import { syncQueue, useBilling, type Order } from "@/services/billing";
import { useNetworkStatus } from "@/shared/useNetworkStatus";
import { RECEIPT_CSS, RECEIPT_PAPERS, type ReceiptPaper } from "@/features/receipts/Receipt";
import { downloadPdf, exportPng, printDocument } from "@/features/receipts/receiptOutput";
import { Card, methodLabel } from "./BillingSteps";
import { DockedBar } from "@/shared/ui/DockedBar";

const PAPER_STYLE: Record<ReceiptPaper, { pad: string; fs: string; logo: string }> = {
  "58": { pad: "3mm 3mm 4mm", fs: "7.6pt", logo: "11mm" },
  "80": { pad: "4mm 4.5mm 5mm", fs: "8.8pt", logo: "13mm" },
  a5: { pad: "10mm 12mm 12mm", fs: "10.5pt", logo: "17mm" },
};
const dateText = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const timeText = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const METHOD_NAME: Record<string, string> = { Cash: "Cash", POS: "POS", Transfer: "Bank transfer" };

export function OrderReceiptDoc({ order, branch, profile, paper, printedAt }: { order: Order; branch: ReturnType<typeof getBranch>; profile: ReceiptProfile; paper: ReceiptPaper; printedAt: Date }) {
  const companyName = useCompanyName();
  const money = (n: number) => formatMoney(n, order.currency as "NGN");
  const contact = (branch && profile.branches[branch.id]) || { address: "", phone: "" };
  const ps = PAPER_STYLE[paper];
  const width = RECEIPT_PAPERS.find((p) => p.id === paper)!.widthMm;
  const at = new Date(order.createdAt);
  return (
    <div className={`rc rc-${paper}`} style={{ width: `${width}mm`, padding: ps.pad, fontSize: ps.fs, ["--rc-logo" as string]: ps.logo }}>
      <header className="rc-head">
        <div className="rc-logo">
          <BrandLogo receipt />
        </div>
        <div className="rc-co">{companyName}</div>
        {profile.motto && <div className="rc-motto">“{profile.motto}”</div>}
        <div className="rc-line rc-branch">
          {order.branchName} Branch · {branch?.code}
        </div>
        <div className="rc-line">{contact.address || `${branch?.city}, ${branch?.country}`}</div>
        {contact.phone && <div className="rc-line">Tel: {contact.phone}</div>}
        {profile.email && <div className="rc-line">{profile.email}</div>}
      </header>

      <div className="rc-title">Payment receipt</div>
      <div className="rc-kv">
        <span>Receipt no.</span>
        <b className="rc-num">{order.invoiceNo}</b>
      </div>
      <div className="rc-kv">
        <span>Date</span>
        <b>
          {dateText(at)} · {timeText(at)}
        </b>
      </div>

      <section className="rc-sec">
        <div className="rc-sec-t">Patient</div>
        <div className="rc-kv">
          <span>Name</span>
          <b>{order.patient.name}</b>
        </div>
        <div className="rc-kv">
          <span>Patient ID</span>
          <b className="rc-num">{order.patient.patientId}</b>
        </div>
        <div className="rc-kv">
          <span>Phone</span>
          <b>{order.patient.phone || "Not provided"}</b>
        </div>
        <div className="rc-kv">
          <span>Patient type</span>
          <b>{order.patient.type === "REFERRED" ? "Referred" : "Walk-in"}</b>
        </div>
      </section>

      <section className="rc-sec">
        <div className="rc-sec-t">Referral &amp; visit</div>
        <div className="rc-kv">
          <span>Referred by</span>
          <b>{order.referral.agentName ?? "Walk-in (no referrer)"}</b>
        </div>
        {order.referral.agentName && (
          <div className="rc-kv">
            <span>Hospital</span>
            <b>{order.referral.hospital}</b>
          </div>
        )}
        <div className="rc-kv">
          <span>Processed by</span>
          <b>{order.createdBy.name}</b>
        </div>
      </section>

      <section className="rc-sec">
        <div className="rc-sec-t">
          Tests &amp; services <span className="rc-count">({order.services.length})</span>
        </div>
        {order.services.map((s) => (
          <div className="rc-item" key={s.id}>
            <span className="rc-item-name">{s.name}</span>
            <span className="rc-num">{money(s.appliedPrice)}</span>
            <small>
              {s.category} · #{s.id}
            </small>
          </div>
        ))}
      </section>

      <section className="rc-sec rc-pay">
        <div className="rc-sec-t">Payment summary</div>
        <div className="rc-kv">
          <span>Subtotal</span>
          <b className="rc-num">{money(order.subtotal)}</b>
        </div>
        <div className="rc-kv">
          <span>Discount</span>
          <b>{order.discount > 0 ? `− ${money(order.discount)}` : "No discount"}</b>
        </div>
        <div className="rc-kv rc-total">
          <span>Total</span>
          <b className="rc-num">{money(order.total)}</b>
        </div>
        <div className="rc-kv">
          <span>Amount paid</span>
          <b className="rc-num">{money(order.amountPaid)}</b>
        </div>
        <div className="rc-kv">
          <span>Payment method</span>
          <b>{methodLabel(order.method)}</b>
        </div>
        {order.split.map((x) => (
          <div className="rc-kv" key={x.method}>
            <span>· {METHOD_NAME[x.method]}</span>
            <b className="rc-num">{money(x.amount)}</b>
          </div>
        ))}
        {order.balance > 0 && (
          <div className="rc-kv rc-due">
            <span>Outstanding balance</span>
            <b className="rc-num">{money(order.balance)}</b>
          </div>
        )}
        {order.balance > 0 && order.balanceInfo.promiseDate && (
          <div className="rc-kv">
            <span>Balance due by</span>
            <b>{dateText(new Date(`${order.balanceInfo.promiseDate}T00:00:00`))}</b>
          </div>
        )}
        <div className={`rc-stamp ${order.balance > 0 ? "is-due" : ""}`}>{order.balance <= 0 ? "Fully paid" : order.amountPaid > 0 ? "Part payment" : "Not paid"}</div>
      </section>

      <footer className="rc-foot">
        <div className="rc-thanks">{profile.thankYou}</div>
        <div className="rc-small">
          Printed {dateText(printedAt)} · {timeText(printedAt)}
        </div>
        <div className="rc-small">Powered by STANLEY</div>
      </footer>
    </div>
  );
}

export function ReceiptStep({ order, branch, onNew, onDone }: { order: Order; branch: NonNullable<ReturnType<typeof getBranch>>; onNew: () => void; onDone: () => void }) {
  const { showToast } = useApp();
  const profile = useReceiptProfile();
  const [paper, setPaper] = useState<ReceiptPaper>("80");
  const [busy, setBusy] = useState<null | "print" | "pdf" | "png">(null);
  const printedAt = useMemo(() => new Date(), []);
  const queued = syncQueue(useBilling()).length;
  const { online } = useNetworkStatus();
  const ref = useRef<HTMLDivElement>(null);
  const money = (n: number) => formatMoney(n, branch.currency);
  const paperDef = RECEIPT_PAPERS.find((p) => p.id === paper)!;
  const fileBase = `receipt-${order.invoiceNo}-${paper === "a5" ? "a5" : `${paper}mm`}`;
  const run = async (kind: "print" | "pdf" | "png") => {
    const el = ref.current?.querySelector<HTMLElement>(".rc");
    if (!el) return;
    setBusy(kind);
    try {
      logAudit({ category: "Receipts", action: kind === "print" ? "Receipt printed" : kind === "pdf" ? "Receipt downloaded (PDF)" : "Receipt exported (image)", record: `${order.invoiceNo} · ${order.patient.patientId}`, details: paperDef.label, branchId: order.branchId });
      if (kind === "print") await printDocument(el, paper, fileBase);
      else if (kind === "pdf") {
        await downloadPdf(el, paper, fileBase);
        showToast(`Saved ${fileBase}.pdf`);
      } else if (await exportPng(el, fileBase)) showToast(`Saved ${fileBase}.png`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card icon={ReceiptText} title="Patient receipt" hint="The bill is saved. Print, download or share the receipt.">
      <div className={`bl-done ${order.balance > 0 ? "is-due" : ""}`}>
        <CircleCheck size={22} />
        <span>
          <b>Billing complete</b>
          <small>
            {order.invoiceNo} saved for {order.patient.name} ({order.patient.patientId}) · total {money(order.total)} · paid {money(order.amountPaid)}
            {order.balance > 0 ? ` · ${money(order.balance)} outstanding` : ""}
          </small>
        </span>
        <em className="bl-pill">{order.balance > 0 ? (order.amountPaid > 0 ? "Part payment" : "Unpaid") : "Paid"}</em>
      </div>
      <p className={`bl-sync ${online ? "is-online" : "is-offline"}`}>
        <CloudUpload size={16} />
        <span>
          <b>Saved on this device · queued for cloud sync</b>
          {queued > 1 ? ` (${queued} bills waiting, in order)` : ""}. {online ? "It uploads automatically once the cloud database is connected." : "You're offline — it stays queued and uploads when you're back online."}
        </span>
      </p>

      <div className="bl-receipt">
        <div className="bl-receipt-tools">
          <span>
            <b>Receipt preview</b>
            <small>Shown at actual size — it prints exactly like this.</small>
          </span>
          <div className="bl-papers" role="radiogroup" aria-label="Receipt size">
            {RECEIPT_PAPERS.map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={paper === p.id} className={paper === p.id ? "is-on" : ""} onClick={() => setPaper(p.id)}>
                {p.id === "a5" ? "A5" : `${p.id} mm`}
              </button>
            ))}
          </div>
        </div>
        <div className="bl-receipt-stage thin-scroll" ref={ref}>
          <style>{RECEIPT_CSS}</style>
          <OrderReceiptDoc order={order} branch={branch} profile={profile} paper={paper} printedAt={printedAt} />
        </div>
        {/* Actions live in the docked bottom bar — always reachable without scrolling the receipt. */}
        <DockedBar>
        <footer className="bl-foot bl-receipt-actions">
          <button type="button" className="rb-action is-primary" onClick={() => run("print")} disabled={busy !== null}>
            {busy === "print" ? <Loader2 size={17} className="spin" /> : <Printer size={17} />}
            <span>
              Print
              <small>{paperDef.label}</small>
            </span>
          </button>
          <button type="button" className="rb-action" onClick={() => run("pdf")} disabled={busy !== null}>
            {busy === "pdf" ? <Loader2 size={17} className="spin" /> : <Download size={17} />}
            <span>
              Download
              <small>PDF file</small>
            </span>
          </button>
          <button type="button" className="rb-action" onClick={() => run("png")} disabled={busy !== null}>
            {busy === "png" ? <Loader2 size={17} className="spin" /> : <ImageDown size={17} />}
            <span>
              Export
              <small>Image (PNG)</small>
            </span>
          </button>
          <span className="bl-receipt-gap" />
          <button type="button" className="bl-btn" onClick={onDone}>
            Done
          </button>
          <button type="button" className="bl-btn is-primary" onClick={onNew}>
            Start a new bill
          </button>
        </footer>
        </DockedBar>
      </div>
    </Card>
  );
}
