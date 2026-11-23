/**
 * Price quote — what a patient takes away after a price enquiry. Same till-roll
 * layout and stylesheet as the patient receipt (so it prints identically on POS
 * printers), but it is NOT a receipt: no payment, clearly stamped as a price
 * enquiry, with the date the prices were quoted.
 */
import { type getBranch } from "@/data/company";
import { formatMoney } from "@/shared/format";
import { BrandLogo, useCompanyName } from "@/shell/BrandLogo";
import type { ReceiptProfile } from "@/services/receiptProfile";
import { RECEIPT_PAPERS, type ReceiptPaper } from "@/features/receipts/Receipt";

export interface QuoteLine {
  id: number;
  name: string;
  category: string;
  /** Catalogue price when the line was added. */
  listPrice: number;
  /** Price quoted (equals listPrice unless changed for this quote). */
  price: number;
}

export interface QuoteOptions {
  codes: boolean;
  printedOn: boolean;
}

export interface QuoteData {
  quoteNo: string;
  lines: QuoteLine[];
  payer: string;
  /** The signed-in person who prepared the quote. */
  processedBy: { name: string; role: string };
  branch: ReturnType<typeof getBranch>;
  profile: ReceiptProfile;
  paper: ReceiptPaper;
  options: QuoteOptions;
  at: Date;
}

const PAPER_STYLE: Record<ReceiptPaper, { pad: string; fs: string; logo: string }> = {
  "58": { pad: "3mm 3mm 4mm", fs: "7.6pt", logo: "11mm" },
  "80": { pad: "4mm 4.5mm 5mm", fs: "8.8pt", logo: "13mm" },
  a5: { pad: "10mm 12mm 12mm", fs: "10.5pt", logo: "17mm" },
};
const dateText = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const timeText = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

export const quoteTotal = (lines: QuoteLine[]) => lines.reduce((s, l) => s + l.price, 0);

export function QuoteDoc({ quoteNo, lines, payer, processedBy, branch, profile, paper, options, at }: QuoteData) {
  const companyName = useCompanyName();
  const money = (n: number) => formatMoney(n, branch?.currency ?? "NGN");
  const contact = (branch && profile.branches[branch.id]) || { address: "", phone: "" };
  const ps = PAPER_STYLE[paper];
  const width = RECEIPT_PAPERS.find((p) => p.id === paper)!.widthMm;
  const total = quoteTotal(lines);

  return (
    <div className={`rc rc-${paper}`} style={{ width: `${width}mm`, padding: ps.pad, fontSize: ps.fs, ["--rc-logo" as string]: ps.logo }}>
      <header className="rc-head">
        <div className="rc-logo">
          <BrandLogo receipt />
        </div>
        <div className="rc-co">{companyName}</div>
        {profile.motto && <div className="rc-motto">“{profile.motto}”</div>}
        <div className="rc-line rc-branch">
          {branch?.name} Branch · {branch?.code}
        </div>
        <div className="rc-line">{contact.address || `${branch?.city}, ${branch?.country}`}</div>
        {contact.phone && <div className="rc-line">Tel: {contact.phone}</div>}
        {profile.email && <div className="rc-line">{profile.email}</div>}
      </header>

      <div className="rc-title">Price quote</div>
      <div className="rc-kv">
        <span>Quote no.</span>
        <b className="rc-num">{quoteNo}</b>
      </div>
      <div className="rc-kv">
        <span>Date</span>
        <b>
          {dateText(at)} · {timeText(at)}
        </b>
      </div>
      <div className="rc-kv">
        <span>Prepared for</span>
        <b>{payer.trim() || "Walk-in enquiry"}</b>
      </div>
      <div className="rc-kv">
        <span>Processed by</span>
        <b>
          {processedBy.name} · {processedBy.role}
        </b>
      </div>

      <section className="rc-sec">
        <div className="rc-sec-t">
          Tests &amp; prices <span className="rc-count">({lines.length})</span>
        </div>
        {lines.map((l, i) => (
          <div className="rc-item" key={`${l.id}-${i}`}>
            <span className="rc-item-name">{l.name}</span>
            <span className="rc-num">{money(l.price)}</span>
            {options.codes && (
              <small>
                {l.category} · #{l.id}
              </small>
            )}
          </div>
        ))}
      </section>

      <section className="rc-sec rc-pay">
        <div className="rc-kv">
          <span>Number of tests</span>
          <b>{lines.length}</b>
        </div>
        <div className="rc-kv rc-total">
          <span>Estimated total</span>
          <b className="rc-num">{money(total)}</b>
        </div>
        <div className="rc-stamp is-due">Price enquiry · not paid</div>
        <div className="rc-note">This is a price quote, not a receipt — no payment has been made. Prices are as at the date above and may change.</div>
      </section>

      <footer className="rc-foot">
        <div className="rc-thanks">{profile.thankYou.replace(/\breceipt\b/gi, "quote")}</div>
        {options.printedOn && (
          <div className="rc-small">
            Printed {dateText(at)} · {timeText(at)}
          </div>
        )}
        <div className="rc-small">Powered by STANLEY</div>
      </footer>
    </div>
  );
}
