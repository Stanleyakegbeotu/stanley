/**
 * Price calculator (branch header) — for patients who come in to ask prices.
 * Same two-section layout as the report builder:
 *
 *  • Theme sidebar = the service catalogue: search any test, or open a
 *    category card → its services → Add. "All categories" stays pinned while
 *    scrolling a long category.
 *  • White main area = the quote: optional enquirer name, processed by (the
 *    signed-in person, automatic), date, each test with its price, total.
 *    A price can be changed for this quote only — the original price stays
 *    visible on screen (never printed); the inventory price never changes.
 *  • Print price quote → paper (58 / 80 mm till roll or A5), preview, then
 *    Print, Download (PDF) or Export (image). A price enquiry, not a receipt.
 *
 * One theme colour throughout; categories are told apart by icon and name.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, CalendarDays, Calculator, Check, ChevronRight, Download, FlaskConical, ImageDown, Loader2, Plus, Printer, RotateCcw, Search, Trash2, UserRound, X } from "lucide-react";
import { useApp } from "@/app/AppState";
import { getBranch } from "@/data/company";
import { logAudit } from "@/services/audit";
import { useReceiptProfile } from "@/services/receiptProfile";
import { formatMoney, initials } from "@/shared/format";
import { useMotionPreset } from "@/shared/motion";
import { NAME_INPUT_PROPS, nameChange } from "@/shared/nameCase";
import { buildItems, categoryMeta, groupCategories, type CatalogueItem } from "@/features/inventory/InventoryCatalog";
import { RECEIPT_CSS, RECEIPT_PAPERS, type ReceiptPaper } from "@/features/receipts/Receipt";
import { ReceiptDetailsCard } from "@/features/receipts/ReceiptModal";
import { downloadPdf, exportPng, printDocument } from "@/features/receipts/receiptOutput";
import { QuoteDoc, quoteTotal, type QuoteLine, type QuoteOptions } from "./QuoteDoc";
import { QuickServices, useQuickServices } from "@/features/billing/QuickServices";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Header button that opens the calculator. */
export function PriceCalculatorButton({ branchId }: { branchId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="hdr-calc" onClick={() => setOpen(true)} aria-haspopup="dialog" title="Price calculator — quote test prices for an enquiry">
        <Calculator size={19} />
        <span>Price calculator</span>
      </button>
      {open && <PriceCalculator branchId={branchId} onClose={() => setOpen(false)} />}
    </>
  );
}

function useEscape(box: React.RefObject<HTMLDivElement | null>, onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const layers = document.querySelectorAll(".modal-layer");
      if (e.key === "Escape" && layers[layers.length - 1] === box.current?.parentElement) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [box, onClose]);
}

function PriceCalculator({ branchId, onClose }: { branchId: string; onClose: () => void }) {
  const { inventory, user } = useApp();
  const m = useMotionPreset();
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const branch = getBranch(branchId);
  const money = (n: number) => formatMoney(n, branch?.currency ?? "NGN");
  useEscape(box, onClose);

  const items = useMemo(() => buildItems(inventory), [inventory]);
  const groups = useMemo(() => groupCategories(items, inventory.categoryNames), [items, inventory.categoryNames]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [payer, setPayer] = useState("");
  const [printing, setPrinting] = useState(false);
  const [now] = useState(() => new Date());

  const group = groups.find((g) => g.key === cat) ?? null;
  const term = norm(q);
  const hits = useMemo(() => {
    if (!term) return [];
    const words = term.split(" ");
    return items.filter((i) => words.every((w) => norm(`${i.name} ${i.category} ${i.recordedAs ?? ""} ${i.id}`).includes(w))).slice(0, 80);
  }, [items, term]);
  const catHits = term ? groups.filter((g) => norm(`${g.key} ${g.label}`).includes(term)) : [];
  const added = new Set(lines.map((l) => l.id));
  const labelOf = (key: string) => groups.find((g) => g.key === key)?.label ?? key;
  // Most done services at this branch — same quick add as Billing.
  const quick = useQuickServices(branchId, items, 8);

  const toggle = (i: CatalogueItem) => {
    if (i.price === null) return;
    if (added.has(i.id)) setLines((ls) => ls.filter((l) => l.id !== i.id));
    else setLines((ls) => [...ls, { id: i.id, name: i.name, category: labelOf(i.category), listPrice: i.price!, price: i.price! }]);
  };
  const setPrice = (id: number, raw: string) => {
    const clean = raw.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");
    setDrafts((d) => ({ ...d, [id]: clean }));
    if (clean !== "") setLines((ls) => ls.map((l) => (l.id === id ? { ...l, price: Number(clean) } : l)));
  };
  const resetPrice = (id: number) => {
    setLines((ls) => ls.map((x) => (x.id === id ? { ...x, price: x.listPrice } : x)));
    setDrafts(({ [id]: _, ...rest }) => rest);
  };
  const invalid = lines.some((l) => drafts[l.id] === "");
  const total = quoteTotal(lines);
  const listTotal = lines.reduce((s, l) => s + l.listPrice, 0);
  const changed = lines.filter((l) => l.price !== l.listPrice).length;
  const openCat = (key: string | null) => {
    setCat(key);
    setQ("");
    list.current?.scrollTo({ top: 0 });
  };

  const serviceRow = (i: CatalogueItem, showCat: boolean) => {
    const on = added.has(i.id);
    return (
      <li key={i.id} className={`pc-svc ${on ? "is-added" : ""}`}>
        <div className="pc-svc-text">
          <b>{i.name}</b>
          <small>
            {showCat ? `${labelOf(i.category)} · ` : ""}#{i.id}
          </small>
        </div>
        <div className="pc-svc-end">
          <span className={`pc-svc-price ${i.price === null ? "is-none" : ""}`}>{i.price === null ? "No price on file" : money(i.price)}</span>
          {i.price === null ? (
            <span className="pc-add is-disabled" title="Set a price in Inventory before this test can be quoted">
              Unavailable
            </span>
          ) : (
            <button type="button" className={`pc-add ${on ? "is-on" : ""}`} onClick={() => toggle(i)} aria-pressed={on} title={on ? "Remove from the quote" : "Add to the quote"}>
              {on ? <Check size={15} /> : <Plus size={15} />}
              {on ? "Added" : "Add"}
            </button>
          )}
        </div>
      </li>
    );
  };

  return createPortal(
    <AnimatePresence>
      <motion.div key="price-calc" className="modal-layer fd-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <motion.div ref={box} className="pc" role="dialog" aria-modal="true" aria-labelledby={titleId} initial={m.modal.initial} animate={m.modal.animate} exit={m.modal.exit}>
          {/* ── Sidebar: service catalogue ── */}
          <aside className="pc-side" aria-label="Service catalogue">
            <div className="pc-side-head">
              <span className="pc-side-icon" aria-hidden="true">
                <Calculator size={21} />
              </span>
              <div>
                <span>Branch price quote</span>
                <strong>Service catalogue</strong>
                <small>
                  {groups.length} categories · {items.length} services · {branch?.name} branch
                </small>
              </div>
            </div>

            <div className="pc-find">
              <label className="pc-find-box">
                <Search size={18} />
                <input ref={search} autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={group ? `Search ${group.label} or any test` : "Search any test or category"} aria-label="Search tests" />
                {q ? (
                  <button type="button" onClick={() => (setQ(""), search.current?.focus())} aria-label="Clear search">
                    <X size={15} />
                  </button>
                ) : (
                  <kbd>e.g. FBC, x-ray, MRI</kbd>
                )}
              </label>
            </div>

            <div className="pc-side-list thin-scroll" ref={list}>
              {term ? (
                <>
                  <div className="pc-pin">
                    <button type="button" className="pc-back" onClick={() => setQ("")}>
                      <ArrowLeft size={16} /> {group ? group.label : "All categories"}
                    </button>
                    <span className="pc-pin-text">
                      <b>
                        {hits.length >= 80 ? "80+" : hits.length} result{hits.length === 1 ? "" : "s"}
                      </b>
                      <small>for “{q.trim()}”</small>
                    </span>
                  </div>
                  {catHits.length > 0 && (
                    <div className="pc-chips">
                      {catHits.map((g) => {
                        const Icon = categoryMeta(g.key).icon;
                        return (
                          <button key={g.key} type="button" onClick={() => openCat(g.key)}>
                            <Icon size={14} /> {g.label} <small>{g.items.length}</small>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {hits.length ? <ul className="pc-svcs">{hits.map((i) => serviceRow(i, true))}</ul> : <p className="pc-empty">No test matches “{q.trim()}”. Try another spelling or open a category.</p>}
                </>
              ) : group ? (
                <>
                  <div className="pc-pin">
                    <button type="button" className="pc-back" onClick={() => openCat(null)}>
                      <ArrowLeft size={16} /> All categories
                    </button>
                    <span className="pc-pin-icon" aria-hidden="true">
                      {(() => {
                        const Icon = categoryMeta(group.key).icon;
                        return <Icon size={17} />;
                      })()}
                    </span>
                    <span className="pc-pin-text">
                      <b>{group.label}</b>
                      <small>
                        {group.items.length} services · {group.items.filter((i) => added.has(i.id)).length} added
                      </small>
                    </span>
                  </div>
                  <ul className="pc-svcs">{[...group.items].sort((a, b) => a.name.localeCompare(b.name)).map((i) => serviceRow(i, false))}</ul>
                </>
              ) : (
                <>
                  <QuickServices list={quick} isAdded={(id) => added.has(id)} onToggle={toggle} labelOf={labelOf} money={money} className="is-dark" />
                  <p className="pc-side-label">Choose a test category</p>
                  <div className="pc-cats">
                    {groups.map((g, rank) => {
                      const meta = categoryMeta(g.key);
                      const Icon = meta.icon;
                      const n = g.items.filter((i) => added.has(i.id)).length;
                      return (
                        <button key={g.key} type="button" className={`pc-cat ${n ? "has-added" : ""}`} onClick={() => openCat(g.key)} title={meta.label}>
                          <Icon className="pc-cat-mark" size={78} strokeWidth={1.4} aria-hidden="true" />
                          <span className="pc-cat-top">
                            <span className="pc-cat-icon" aria-hidden="true">
                              <Icon size={19} />
                              {rank < 3 && <i>{rank + 1}</i>}
                            </span>
                            <ChevronRight size={16} className="pc-cat-go" />
                          </span>
                          <b>{g.label}</b>
                          <small>
                            {g.items.length} service{g.items.length === 1 ? "" : "s"}
                          </small>
                          {n > 0 && (
                            <em>
                              <Check size={12} /> {n} added
                            </em>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </aside>

          {/* ── Main: the quote ── */}
          <section className="pc-main">
            <header className="pc-main-head">
              <div>
                <span>Price calculator</span>
                <h2 id={titleId}>Price quote</h2>
                <p>Current catalogue prices. A quote does not create a bill or payment.</p>
              </div>
              <button type="button" className="fd-close" onClick={onClose} aria-label="Close price calculator" data-close>
                <X size={20} />
              </button>
            </header>

            <div className="pc-main-body thin-scroll">
              <div className="pc-meta">
                <label className="pc-meta-field">
                  <span>
                    Patient or enquirer <small>Optional</small>
                  </span>
                  <span className="pc-input">
                    <UserRound size={16} />
                    <input value={payer} {...NAME_INPUT_PROPS} onChange={nameChange(setPayer)} placeholder="Name to print on the quote" />
                  </span>
                </label>
                <div className="pc-meta-field">
                  <span>
                    Processed by <small>Automatic</small>
                  </span>
                  <span className="pc-who">
                    <i aria-hidden="true">{initials(user.name)}</i>
                    <span>
                      <b>{user.name}</b>
                      <small>{user.role}</small>
                    </span>
                  </span>
                </div>
                <div className="pc-meta-field">
                  <span>Date</span>
                  <span className="pc-who is-date">
                    <CalendarDays size={16} />
                    <b>{now.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</b>
                  </span>
                </div>
              </div>

              <div className="pc-items">
                <div className="pc-items-head">
                  <strong>Tests &amp; prices</strong>
                  <span className="pc-count">
                    {lines.length} test{lines.length === 1 ? "" : "s"}
                  </span>
                  <button
                    type="button"
                    className="text-link pc-clear"
                    disabled={!lines.length && !payer}
                    onClick={() => {
                      setLines([]);
                      setDrafts({});
                      setPayer("");
                    }}
                  >
                    Clear quote
                  </button>
                </div>
                {lines.length === 0 ? (
                  <div className="pc-lines-empty">
                    <FlaskConical size={24} />
                    <b>No tests added yet</b>
                    <p>Search for a test or open a category on the left, then select Add.</p>
                  </div>
                ) : (
                  <ol className="pc-lines">
                    {lines.map((l, i) => {
                      const diff = l.price - l.listPrice;
                      return (
                        <li key={l.id} className={`pc-line ${diff ? "is-changed" : ""}`}>
                          <span className="pc-line-no">{i + 1}</span>
                          <div className="pc-line-name">
                            <b>{l.name}</b>
                            <small>
                              {l.category} · #{l.id}
                            </small>
                          </div>
                          <div className="pc-line-price">
                            <span className="pc-input is-price">
                              <span className="pc-cur">₦</span>
                              <input inputMode="numeric" value={drafts[l.id] ?? l.price.toLocaleString("en-NG")} onChange={(e) => setPrice(l.id, e.target.value)} onBlur={() => setDrafts(({ [l.id]: _, ...rest }) => rest)} aria-label={`Price for ${l.name}`} />
                            </span>
                            {diff ? (
                              <span className="pc-orig" title="Shown on screen only — the printed quote shows the new price">
                                <span>
                                  Original <s>{money(l.listPrice)}</s> <ArrowRight size={12} /> {money(l.price)}
                                </span>
                                <span className={diff < 0 ? "is-down" : "is-up"}>
                                  {diff < 0 ? "−" : "+"}
                                  {money(Math.abs(diff))}
                                  <button type="button" onClick={() => resetPrice(l.id)}>
                                    <RotateCcw size={12} /> Use original
                                  </button>
                                </span>
                              </span>
                            ) : (
                              <small className="pc-cat-price">Catalogue price</small>
                            )}
                          </div>
                          <button type="button" className="pc-remove" onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))} aria-label={`Remove ${l.name}`} title="Remove from the quote">
                            <Trash2 size={15} />
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            </div>

            <footer className="pc-main-foot">
              <div className="pc-total">
                <span>
                  Quote total
                  <small>
                    {lines.length} test{lines.length === 1 ? "" : "s"}
                    {changed > 0 && ` · ${changed} price${changed === 1 ? "" : "s"} changed · catalogue total ${money(listTotal)}`}
                  </small>
                </span>
                <b>{lines.length ? money(total) : "₦0"}</b>
              </div>
              <button type="button" className="pc-print" disabled={!lines.length || invalid} onClick={() => setPrinting(true)}>
                <Printer size={18} /> Print price quote
              </button>
            </footer>
            <p className="pc-foot-note">Changed prices apply to this quote only — the original price shows here on screen, never on the printout, and the inventory price stays the same. Printed quotes are recorded in the audit log.</p>
          </section>
        </motion.div>
      </motion.div>
      {printing && <QuotePrint key="quote-print" branchId={branchId} lines={lines} payer={payer} processedBy={user} onClose={() => setPrinting(false)} />}
    </AnimatePresence>,
    document.body,
  );
}

/* ─────────────── Print step: paper, preview, output ─────────────── */

function QuotePrint({ branchId, lines, payer, processedBy, onClose }: { branchId: string; lines: QuoteLine[]; payer: string; processedBy: { name: string; role: string }; onClose: () => void }) {
  const { showToast } = useApp();
  const profile = useReceiptProfile();
  const m = useMotionPreset();
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  const shotRef = useRef<HTMLDivElement>(null);
  const [paper, setPaper] = useState<ReceiptPaper>("80");
  const [options, setOptions] = useState<QuoteOptions>({ codes: true, printedOn: false });
  const [busy, setBusy] = useState<null | "print" | "pdf" | "png">(null);
  const at = useMemo(() => new Date(), []);
  useEscape(box, onClose);

  const branch = getBranch(branchId);
  const pad = (n: number) => String(n).padStart(2, "0");
  const quoteNo = `Q${branch?.code ?? ""}-${String(at.getFullYear()).slice(2)}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`;
  const paperDef = RECEIPT_PAPERS.find((p) => p.id === paper)!;
  const fileBase = `price-quote-${quoteNo}-${paper === "a5" ? "a5" : `${paper}mm`}`;
  const total = quoteTotal(lines);
  const changed = lines.filter((l) => l.price !== l.listPrice);
  const el = () => shotRef.current?.querySelector<HTMLElement>(".rc") ?? null;
  const log = (action: string) =>
    logAudit({
      category: "Receipts",
      action,
      record: `${quoteNo}${payer.trim() ? ` · ${payer.trim()}` : ""}`,
      details: `${lines.length} test${lines.length === 1 ? "" : "s"} · ${formatMoney(total, branch?.currency ?? "NGN")} · ${paperDef.label}${changed.length ? ` · price changed for this quote: ${changed.map((l) => `${l.name} ${formatMoney(l.listPrice, "NGN")} → ${formatMoney(l.price, "NGN")}`).join("; ")}` : ""}`,
      branchId,
    });
  const run = async (kind: "print" | "pdf" | "png") => {
    const node = el();
    if (!node) return;
    setBusy(kind);
    try {
      if (kind === "print") {
        log("Price quote printed");
        await printDocument(node, paper, fileBase);
      } else if (kind === "pdf") {
        log("Price quote downloaded (PDF)");
        await downloadPdf(node, paper, fileBase);
        showToast(`Saved ${fileBase}.pdf`);
      } else {
        log("Price quote exported (image)");
        if (await exportPng(node, fileBase)) showToast(`Saved ${fileBase}.png — ready to share`);
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <motion.div className="modal-layer fd-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div ref={box} className="rcm" role="dialog" aria-modal="true" aria-labelledby={titleId} initial={m.modal.initial} animate={m.modal.animate} exit={m.modal.exit}>
        <style>{RECEIPT_CSS}</style>
        <aside className="rcm-side thin-scroll">
          <div className="rcm-side-head">
            <span className="rcm-icon" aria-hidden="true">
              <Calculator size={20} />
            </span>
            <div>
              <span>Price quote</span>
              <strong id={titleId}>{payer.trim() || "Walk-in enquiry"}</strong>
              <small>
                {lines.length} test{lines.length === 1 ? "" : "s"} · {formatMoney(total, branch?.currency ?? "NGN")}
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
              <i>2</i> Show on the quote
            </h3>
            {(
              [
                ["codes", "Test category and code", "e.g. LAB · #82 under each test"],
                ["printedOn", "Printed date and time", "The quote date is always shown"],
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

          <ReceiptDetailsCard step={3} branch={branch} />
        </aside>

        <section className="rcm-main">
          <header className="rcm-head">
            <div>
              <span>Preview</span>
              <strong>
                {paperDef.label} · {lines.length} test{lines.length === 1 ? "" : "s"}
              </strong>
            </div>
            <button type="button" className="fd-close" onClick={onClose} aria-label="Close price quote" data-close>
              <X size={20} />
            </button>
          </header>
          <div className="rcm-stage thin-scroll">
            <div className={`rcm-paper is-${paper}`} ref={shotRef}>
              <QuoteDoc quoteNo={quoteNo} lines={lines} payer={payer} processedBy={processedBy} branch={branch} profile={profile} paper={paper} options={options} at={at} />
            </div>
            <p className="rcm-stage-note">Shown at actual size. Scroll to see the whole quote — it prints exactly like this.</p>
          </div>
          <footer className="rcm-foot">
            <span className="rcm-foot-note">A price enquiry only — no bill or payment is created.</span>
            <button type="button" className="rb-action" onClick={() => run("png")} disabled={busy !== null}>
              {busy === "png" ? <Loader2 size={17} className="spin" /> : <ImageDown size={17} />}
              <span>
                Export
                <small>Image (PNG)</small>
              </span>
            </button>
            <button type="button" className="rb-action" onClick={() => run("pdf")} disabled={busy !== null}>
              {busy === "pdf" ? <Loader2 size={17} className="spin" /> : <Download size={17} />}
              <span>
                Download
                <small>PDF file</small>
              </span>
            </button>
            <button type="button" className="rb-action is-primary" onClick={() => run("print")} disabled={busy !== null}>
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
  );
}
