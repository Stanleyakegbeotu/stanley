/**
 * Inventory catalogue — category cards first, then the services and prices
 * inside a category. Used by the company Inventory page, the branch Inventory
 * page and the branch workspace viewer so all three look and behave the same.
 *
 * The legacy catalogue is read-only. The owner's category decisions
 * (data/catalogueRules) are applied on top of it; renames, price/name edits and
 * added services are session-only overrides (AppState.inventory) and the
 * recorded value is always kept and shown next to an edit.
 */
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowDownWideNarrow,
  ArrowLeft,
  ArrowRight,
  Banknote,
  Bone,
  Brain,
  ChevronRight,
  CircleAlert,
  Crown,
  Dna,
  FlaskConical,
  Heart,
  HeartPulse,
  Layers,
  Magnet,
  Microscope,
  Pencil,
  Plus,
  RotateCcw,
  ScanLine,
  Stethoscope,
  Tag,
  Timer,
  TrendingUp,
  Waves,
  type LucideIcon,
} from "lucide-react";
import { useApp } from "@/app/AppState";
import type { Currency } from "@/data/types";
import { INVENTORY_NOTES, LEGACY_BRANCH_ID } from "@/data/legacy";
import { CATALOGUE_INVENTORY, ITEM_REASSIGN } from "@/data/catalogueRules";
import { categoryKey } from "@/data/legacy";
import type { InventoryChanges } from "@/data/userRecords";
import { useMotionPreset } from "@/shared/motion";
import { formatCount, formatMoney } from "@/shared/format";
import { Badge, Button, EmptyState, SearchInput, Segmented, SelectMenu } from "@/shared/ui/controls";
import { Modal } from "@/shared/ui/Modal";
import { FieldError, focusFirstError } from "@/shared/ui/FieldError";
import { Pagination } from "@/shared/ui/Pagination";
import { SummaryChips } from "@/features/dashboard/ExpensesPatients";
import { AddServiceDialog } from "@/features/shared/createForms";

/* ─────────────── Model ─────────────── */

export interface CatalogueItem {
  id: number;
  name: string;
  price: number | null;
  /** Catalogue category key (after the owner's merge rules). */
  category: string;
  rawCategory: string;
  order: number;
  source: "legacy" | "user";
  /** Recorded legacy values when an edit is applied. */
  recorded?: { name: string; price: number | null };
  edited: boolean;
  note?: string;
  /** Name in the legacy export when the owner gave the service a different display name. */
  recordedAs?: string;
  /** Added by the owner as a permanent catalogue item (not in the legacy export). */
  owner?: boolean;
}

export interface CategoryGroup {
  key: string;
  label: string;
  raw: string[];
  items: CatalogueItem[];
  priced: number;
  noPrice: number;
  min: number | null;
  max: number | null;
  avg: number | null;
  notes: number;
  edited: number;
  added: number;
}

export type ServiceActivity = Map<number, { count: number; revenue: number }>;

/*
 * One colour throughout — the selected app theme (owner decision, 2026-11-21:
 * no per-category rainbow colours). Categories are told apart by their own
 * icon, name/code and size rank; main cards carry a theme accent line along
 * the top, specialist tiles one down their left edge.
 */
interface CategoryMeta {
  icon: LucideIcon;
  label: string;
}

const META: Record<string, CategoryMeta> = {
  LAB: { icon: FlaskConical, label: "Laboratory tests" },
  "X-RAY": { icon: Bone, label: "X-ray imaging" },
  MRI: { icon: Magnet, label: "Magnetic resonance imaging" },
  SCAN: { icon: Waves, label: "Ultrasound scans" },
  "CT SCAN": { icon: ScanLine, label: "Computed tomography" },
  ECHO: { icon: HeartPulse, label: "Echocardiography" },
  ECG: { icon: Activity, label: "Electrocardiogram" },
  "HOLTER ECG": { icon: Timer, label: "24-hour heart monitoring" },
  EEG: { icon: Brain, label: "Electroencephalography" },
  // Colonoscopy, oesophagoscopy and gastroscopy are filed under PHARYNGOSCOPY (data/catalogueRules).
  PHARYNGOSCOPY: { icon: Microscope, label: "Endoscopy procedures" },
  "MEDICAL EXAMINATION": { icon: Stethoscope, label: "Clinical examination" },
  CARDIOLOGY: { icon: Heart, label: "Cardiology consultation" },
  DNA: { icon: Dna, label: "DNA paternity testing" },
};
export function categoryMeta(key: string): CategoryMeta {
  return META[key] ?? { icon: Tag, label: "Added category" };
}

export function buildItems(inv: InventoryChanges): CatalogueItem[] {
  const legacy = CATALOGUE_INVENTORY.map<CatalogueItem>((i) => {
    const e = inv.edits[i.id];
    const name = e?.name ?? i.name;
    const price = e && "price" in e && e.price !== undefined ? e.price : i.price;
    const edited = !!e && (name !== i.name || price !== i.price);
    // Items the owner re-filed (e.g. #293 → DNA) report their new category, not the recorded one.
    const rawCategory = i.recordedName || i.origin === "owner" || ITEM_REASSIGN[i.id] ? i.catalogueCategory : i.category;
    return { id: i.id, name, price, category: i.catalogueCategory, rawCategory, order: i.order, source: "legacy", recorded: edited ? { name: i.name, price: i.price } : undefined, edited, note: INVENTORY_NOTES[i.id], recordedAs: i.recordedName, owner: i.origin === "owner" };
  });
  const added = inv.added.map<CatalogueItem>((s, k) => ({ id: s.id, name: s.name, price: s.price, category: categoryKey(s.category), rawCategory: s.category, order: 100_000 + k, source: "user", edited: false }));
  return [...legacy, ...added];
}

export function groupCategories(items: CatalogueItem[], names: Record<string, string>): CategoryGroup[] {
  const map = new Map<string, CatalogueItem[]>();
  for (const it of items) map.set(it.category, [...(map.get(it.category) ?? []), it]);
  return [...map.entries()]
    .map(([key, list]) => {
      const prices = list.map((i) => i.price).filter((p): p is number => p !== null);
      return {
        key,
        label: names[key] ?? key,
        raw: [...new Set(list.map((i) => i.rawCategory))],
        items: list,
        priced: prices.length,
        noPrice: list.length - prices.length,
        min: prices.length ? Math.min(...prices) : null,
        max: prices.length ? Math.max(...prices) : null,
        avg: prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null,
        notes: list.filter((i) => i.note).length,
        edited: list.filter((i) => i.edited).length,
        added: list.filter((i) => i.source === "user").length,
      };
    })
    .sort((a, b) => b.items.length - a.items.length || a.key.localeCompare(b.key));
}

const money = (n: number | null, compact = false) => (n === null ? "—" : formatMoney(n, "NGN", compact));
const rangeText = (g: Pick<CategoryGroup, "min" | "max">) => (g.min === null ? "No price on file" : g.min === g.max ? money(g.min, true) : `${money(g.min, true)} – ${money(g.max, true)}`);
/** Categories with fewer services than this are shown as compact "specialist" tiles. */
const MAIN_MIN = 3;

/* ─────────────── Component ─────────────── */

type View = { kind: "grid" } | { kind: "category"; key: string } | { kind: "smart"; filter: "noprice" | "review" | "edited" | "added" };
type CardSort = "size" | "name" | "performed" | "price";

export function InventoryCatalog({
  scope,
  activity,
  currency = "NGN",
  periodText,
  initialFilter = "all",
  compact = false,
  onAddService,
  onDetailChange,
}: {
  scope: string[] | null;
  /** Tests performed / revenue per service id in the reporting period. */
  activity?: ServiceActivity;
  currency?: Currency;
  periodText?: string;
  initialFilter?: string;
  /** Tighter layout for the branch workspace pop-up. */
  compact?: boolean;
  /** Parent-owned add dialog; when omitted the catalogue opens its own. */
  onAddService?: (categoryKey?: string) => void;
  /** Told when a category / smart list opens or closes (pages hide their hero while it is open). */
  onDetailChange?: (detail: boolean) => void;
}) {
  const { inventory } = useApp();
  const m = useMotionPreset();
  const inScope = !scope || scope.includes(LEGACY_BRANCH_ID);
  const items = useMemo(() => (inScope ? buildItems(inventory) : []), [inScope, inventory]);
  const groups = useMemo(() => groupCategories(items, inventory.categoryNames), [items, inventory.categoryNames]);
  const [view, setView] = useState<View>(initialFilter === "noprice" ? { kind: "smart", filter: "noprice" } : initialFilter === "flagged" ? { kind: "smart", filter: "review" } : { kind: "grid" });
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<CardSort>("size");
  const [adding, setAdding] = useState<{ category?: string; session: number } | null>(null);
  const [editing, setEditing] = useState<CatalogueItem | null>(null);
  const [renaming, setRenaming] = useState<CategoryGroup | null>(null);

  const isDetail = view.kind !== "grid";
  useEffect(() => {
    onDetailChange?.(isDetail);
  }, [isDetail, onDetailChange]);

  const openAdd = (category?: string) => (onAddService ? onAddService(category) : setAdding((a) => ({ category, session: (a?.session ?? 0) + 1 })));

  if (!inScope) return <EmptyState title="No catalogue for this branch">The service catalogue currently belongs to BR001 (Abuja).</EmptyState>;

  const countOf = (i: CatalogueItem) => activity?.get(i.id)?.count ?? 0;
  const performedOf = (list: CatalogueItem[]) => list.reduce((a, i) => a + countOf(i), 0);
  const revenueOf = (list: CatalogueItem[]) => list.reduce((a, i) => a + (activity?.get(i.id)?.revenue ?? 0), 0);
  /** Services to show on a card: most performed first, then catalogue order. */
  const highlights = (list: CatalogueItem[], n: number) => [...list].sort((a, b) => countOf(b) - countOf(a) || a.order - b.order).slice(0, n);
  const priced = items.filter((i) => i.price !== null);
  const prices = priced.map((i) => i.price as number);
  const editedCount = items.filter((i) => i.edited).length;
  const addedCount = items.filter((i) => i.source === "user").length;

  const dialogs = (
    <>
      {!onAddService && adding && <AddServiceDialog key={adding.session} open onClose={() => setAdding(null)} initialCategory={adding.category} />}
      <EditServiceDialog item={editing} onClose={() => setEditing(null)} />
      <RenameCategoryDialog group={renaming} onClose={() => setRenaming(null)} />
    </>
  );

  /* ── Category detail / smart list (falls back to the grid if the category no longer exists) ── */
  const g = view.kind === "category" ? groups.find((x) => x.key === view.key) : undefined;
  if (view.kind === "smart" || g) {
    const smart =
      view.kind === "smart"
        ? {
            noprice: { title: "No price on file", sub: "Services that cannot be billed until a price is confirmed", list: items.filter((i) => i.price === null), icon: CircleAlert },
            review: { title: "Needs review", sub: "Services with a known data-quality note to confirm", list: items.filter((i) => i.note), icon: CircleAlert },
            edited: { title: "Edited services", sub: "Changed in this session — the recorded values are kept", list: items.filter((i) => i.edited), icon: Pencil },
            added: { title: "Added services", sub: "Created in STANLEY, stored separately from the legacy catalogue", list: items.filter((i) => i.source === "user"), icon: Plus },
          }[view.filter]
        : null;
    const list = g ? g.items : smart!.list;
    const meta = g ? categoryMeta(g.key) : null;
    const Icon = meta ? meta.icon : smart!.icon;
    const listPrices = list.map((i) => i.price).filter((p): p is number => p !== null);
    const top = highlights(list, 1)[0];
    const dear = [...list].filter((i) => i.price !== null).sort((a, b) => (b.price as number) - (a.price as number))[0];
    const cheap = [...list].filter((i) => i.price !== null).sort((a, b) => (a.price as number) - (b.price as number))[0];

    return (
      // Inside a category everything uses the app theme colour (no per-category accent).
      <div className={`inv ${compact ? "is-compact" : ""}`}>
        {/* Back navigation sits above the banner so it stands out from it. */}
        <nav className="inv-back" aria-label="Breadcrumb">
          <button type="button" className="inv-back-btn" onClick={() => setView({ kind: "grid" })}>
            <span className="inv-back-icon" aria-hidden="true">
              <ArrowLeft size={17} />
            </span>
            Back to all categories
          </button>
          <span className="inv-crumb">
            Inventory <ChevronRight size={14} /> <b>{g ? g.label : smart!.title}</b>
          </span>
        </nav>

        <section className="inv-banner">
          <div className="inv-banner-main">
            <span className="inv-banner-icon" aria-hidden="true">
              <Icon size={30} />
            </span>
            <div className="inv-banner-copy">
              <span className="inv-banner-eyebrow">{g ? `Category · ${g.key}` : "Smart list"}</span>
              <h2>{g ? g.label : smart!.title}</h2>
              <p>
                {meta ? meta.label : smart!.sub}
                {g && g.raw.length > 1 && <> · recorded as {g.raw.join(", ")}</>}
                {g && g.label !== g.key && <> · renamed from {g.key}</>}
              </p>
            </div>
            {g && (
              <div className="inv-banner-actions">
                <button type="button" className="inv-glass-btn" onClick={() => setRenaming(g)}>
                  <Pencil size={16} /> Rename
                </button>
                <button type="button" className="inv-solid-btn" onClick={() => openAdd(g.key)}>
                  <Plus size={17} /> Add service
                </button>
              </div>
            )}
          </div>
          <dl className="inv-banner-stats">
            <div>
              <dt>Services</dt>
              <dd className="num">{formatCount(list.length)}</dd>
            </div>
            <div>
              <dt>Billable</dt>
              <dd className="num">{formatCount(listPrices.length)}</dd>
            </div>
            <div>
              <dt>Average price</dt>
              <dd className="num">{listPrices.length ? money(listPrices.reduce((a, b) => a + b, 0) / listPrices.length, true) : "—"}</dd>
            </div>
            <div>
              <dt>Price range</dt>
              <dd className="num">{listPrices.length ? rangeText({ min: Math.min(...listPrices), max: Math.max(...listPrices) }) : "—"}</dd>
            </div>
            {activity && (
              <div>
                <dt>Performed · {periodText}</dt>
                <dd className="num">{formatCount(performedOf(list))}</dd>
              </div>
            )}
          </dl>
        </section>

        {list.length > 0 && (
          <div className="inv-spots">
            <Spotlight icon={TrendingUp} label={activity ? `Most performed · ${periodText}` : "First in catalogue"} item={top} value={top ? (activity ? `${formatCount(countOf(top))} performed` : money(top.price)) : "—"} />
            <Spotlight icon={Crown} label="Highest priced" item={dear} value={dear ? money(dear.price) : "—"} />
            <Spotlight icon={ArrowDownWideNarrow} label="Most affordable" item={cheap} value={cheap ? money(cheap.price) : "—"} />
          </div>
        )}

        <ServiceTable key={g ? g.key : view.kind === "smart" ? view.filter : "x"} items={list} activity={activity} currency={currency} periodText={periodText} initialQuery={q} showCategory={!g} groups={groups} onEdit={setEditing} />
        {dialogs}
      </div>
    );
  }

  /* ── Category grid ── */
  const term = q.trim().toLowerCase();
  const matches = (x: CategoryGroup) => (term ? x.items.filter((i) => `${i.name} ${i.id}`.toLowerCase().includes(term)).length : 0);
  const shown = groups
    .filter((x) => !term || x.label.toLowerCase().includes(term) || x.key.toLowerCase().includes(term) || matches(x) > 0)
    .slice()
    .sort((a, b) => {
      if (sort === "name") return a.label.localeCompare(b.label);
      if (sort === "performed") return performedOf(b.items) - performedOf(a.items) || b.items.length - a.items.length;
      if (sort === "price") return (b.max ?? -1) - (a.max ?? -1);
      return b.items.length - a.items.length || a.key.localeCompare(b.key);
    });
  const main = shown.filter((x) => x.items.length >= MAIN_MIN);
  const specialist = shown.filter((x) => x.items.length < MAIN_MIN);
  // Size rank (most services first) — stable whatever the sort or search.
  const sizeRank = new Map([...groups].sort((a, b) => b.items.length - a.items.length || a.key.localeCompare(b.key)).map((x, i) => [x.key, i + 1]));
  const largest = groups[0];
  const open = (key: string) => setView({ kind: "category", key });
  // Feature the largest category only when it leaves no gaps in the 3-column grid:
  // 2×2 when (n − 1 + 4) fills whole rows, 2×1 when (n − 1 + 2) does.
  const canFeature = !term && sort === "size" && !compact && main.length > 2;
  const featureMode: "tall" | "wide" | null = !canFeature ? null : (main.length + 3) % 3 === 0 ? "tall" : (main.length + 1) % 3 === 0 ? "wide" : null;

  return (
    <div className={`inv ${compact ? "is-compact" : ""}`}>
      <SummaryChips
        items={[
          { label: "Categories", icon: Layers, value: formatCount(groups.length), caption: `${groups.filter((x) => x.items.length >= MAIN_MIN).length} main · ${groups.filter((x) => x.items.length < MAIN_MIN).length} specialist` },
          { label: "Services", icon: FlaskConical, value: formatCount(items.length), caption: `${formatCount(priced.length)} billable${addedCount ? ` · ${addedCount} added` : ""}` },
          { label: "Price range", icon: Tag, value: prices.length ? `${money(Math.min(...prices), true)} – ${money(Math.max(...prices), true)}` : "—", caption: prices.length ? `Average ${money(prices.reduce((a, b) => a + b, 0) / prices.length, true)}` : "No prices on file" },
          activity
            ? { label: `Tests performed · ${periodText}`, icon: Activity, value: formatCount(performedOf(items)), caption: `${formatMoney(revenueOf(items), currency, true)} billed` }
            : { label: "Largest category", icon: Crown, value: largest?.label ?? "—", caption: largest ? `${formatCount(largest.items.length)} services` : "—" },
        ]}
      />

      <div className="inv-toolbar">
        <SearchInput placeholder="Search categories or services" value={q} onChange={setQ} />
        <div className="inv-smart" role="group" aria-label="Smart lists">
          <button type="button" onClick={() => setView({ kind: "smart", filter: "noprice" })}>
            <CircleAlert size={15} /> No price <b>{items.filter((i) => i.price === null).length}</b>
          </button>
          <button type="button" onClick={() => setView({ kind: "smart", filter: "review" })}>
            <CircleAlert size={15} /> Needs review <b>{items.filter((i) => i.note).length}</b>
          </button>
          {editedCount > 0 && (
            <button type="button" onClick={() => setView({ kind: "smart", filter: "edited" })}>
              <Pencil size={15} /> Edited <b>{editedCount}</b>
            </button>
          )}
          {addedCount > 0 && (
            <button type="button" onClick={() => setView({ kind: "smart", filter: "added" })}>
              <Plus size={15} /> Added <b>{addedCount}</b>
            </button>
          )}
        </div>
        <SelectMenu
          value={sort}
          ariaLabel="Sort categories"
          className="select-btn inv-sort"
          options={[
            { value: "size", label: "Most services" },
            { value: "name", label: "Name A–Z" },
            ...(activity ? [{ value: "performed" as CardSort, label: "Most performed" }] : []),
            { value: "price", label: "Highest price" },
          ]}
          onChange={(v: CardSort) => setSort(v)}
        />
        {/* Pages with a hero banner own the primary "Add service" button. */}
        {!onAddService && (
          <Button onClick={() => openAdd()}>
            <Plus size={16} /> Add service
          </Button>
        )}
      </div>

      {shown.length === 0 && (
        <div className="inv-empty">
          <EmptyState title={`No categories or services match “${q}”`} />
        </div>
      )}

      {main.length > 0 && (
        <section className="inv-section">
          <header className="inv-section-head">
            <h3>Main categories</h3>
            <span>{main.length} categories · {formatCount(main.reduce((a, x) => a + x.items.length, 0))} services</span>
          </header>
          <motion.div className="inv-grid" variants={m.staggerGroup} initial="hidden" animate="visible" key={`main|${term}|${sort}`}>
            {main.map((x, idx) => {
              const meta = categoryMeta(x.key);
              const Icon = meta.icon;
              const share = items.length ? (x.items.length / items.length) * 100 : 0;
              const featured = idx === 0 && featureMode !== null;
              const hits = matches(x);
              const picks = highlights(x.items, featured ? (featureMode === "tall" ? 7 : 4) : 3);
              return (
                <motion.button
                  key={x.key}
                  type="button"
                  className={`inv-card ${featured ? `is-featured is-${featureMode}` : ""}`}
                  variants={m.revealItem}
                  whileHover={m.cardHover}
                  onClick={() => open(x.key)}
                  aria-label={`${x.label}: ${x.items.length} services — view services`}
                >
                  <Icon className="cat-mark" size={featured ? 190 : 130} strokeWidth={1.3} aria-hidden="true" />
                  <div className="inv-card-head">
                    <span className="inv-card-icon" aria-hidden="true">
                      <Icon size={featured ? 26 : 22} />
                      <b className="inv-card-rank num" title={`#${sizeRank.get(x.key)} by number of services`}>
                        {sizeRank.get(x.key)}
                      </b>
                    </span>
                    <div className="inv-card-title">
                      <h3 title={x.label}>{x.label}</h3>
                      <p>{x.label !== x.key ? `${x.key} · ${meta.label}` : meta.label}</p>
                    </div>
                    <span className="inv-card-count">
                      <b className="num">{formatCount(x.items.length)}</b> {x.items.length === 1 ? "test" : "tests"}
                    </span>
                  </div>

                  <div className="inv-card-body">
                    <div className="inv-card-figures">
                      <div>
                        <span>Price range</span>
                        <strong className="num">{rangeText(x)}</strong>
                      </div>
                      <div>
                        <span>Average</span>
                        <strong className="num">{money(x.avg, true)}</strong>
                      </div>
                      {featured && (
                        <div>
                          <span>Billable</span>
                          <strong className="num">{formatCount(x.priced)}</strong>
                        </div>
                      )}
                    </div>
                    <div className="inv-card-share">
                      <div className="inv-card-bar" aria-hidden="true">
                        <i style={{ width: `${Math.max(2, share)}%` }} />
                      </div>
                      <span>{share >= 1 ? `${Math.round(share)}%` : "<1%"} of catalogue</span>
                    </div>

                    {featured ? (
                      <ul className="inv-card-list">
                        {picks.map((p) => (
                          <li key={p.id}>
                            <span>{p.name}</span>
                            <b className="num">{p.price === null ? "No price" : money(p.price, true)}</b>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="inv-card-chips">
                        {picks.map((p) => (
                          <span key={p.id} title={p.name}>
                            {p.name}
                          </span>
                        ))}
                        {x.items.length > picks.length && <em>+{x.items.length - picks.length} more</em>}
                      </div>
                    )}

                    {(hits > 0 || x.noPrice > 0 || x.notes > 0 || x.edited > 0 || x.added > 0) && (
                      <div className="inv-card-tags">
                        {hits > 0 && <em className="is-match">{hits} matching</em>}
                        {x.noPrice > 0 && <em className="is-warn">{x.noPrice} no price</em>}
                        {x.notes > 0 && <em className="is-warn">{x.notes} to review</em>}
                        {x.edited > 0 && <em>{x.edited} edited</em>}
                        {x.added > 0 && <em>{x.added} added</em>}
                      </div>
                    )}
                  </div>

                  <div className="inv-card-foot">
                    <span className="num">{activity ? `${formatCount(performedOf(x.items))} performed${compact ? "" : ` · ${periodText}`}` : `${formatCount(x.priced)} billable`}</span>
                    <span className="inv-card-go">
                      {featured ? "Open category" : "View services"} <ArrowRight size={15} />
                    </span>
                  </div>
                </motion.button>
              );
            })}
          </motion.div>
        </section>
      )}

      {specialist.length > 0 && (
        <section className="inv-section">
          <header className="inv-section-head">
            <h3>Specialist procedures</h3>
            <span>{specialist.length} categories with one or two services each</span>
          </header>
          <motion.div className="inv-tiles" variants={m.staggerGroup} initial="hidden" animate="visible" key={`spec|${term}|${sort}`}>
            {specialist.map((x) => {
              const meta = categoryMeta(x.key);
              const Icon = meta.icon;
              const only = x.items.length === 1 ? x.items[0] : null;
              return (
                <motion.button key={x.key} type="button" className="inv-tile" variants={m.revealItem} whileHover={m.cardHover} onClick={() => open(x.key)} aria-label={`${x.label} — view services`}>
                  <Icon className="cat-mark" size={76} strokeWidth={1.4} aria-hidden="true" />
                  <span className="inv-tile-icon" aria-hidden="true">
                    <Icon size={20} />
                  </span>
                  <span className="inv-tile-copy">
                    <strong title={x.label}>{x.label}</strong>
                    {/* Show the single service's name unless it just repeats the category name. */}
                    <small title={only ? only.name : undefined}>{only ? (only.name.trim().toUpperCase() === x.key ? meta.label : only.name) : `${x.items.length} services · ${meta.label}`}</small>
                  </span>
                  <span className="inv-tile-price">
                    <b className="num">{only ? money(only.price, true) : rangeText(x)}</b>
                    {activity && <small className="num">{formatCount(performedOf(x.items))} done</small>}
                  </span>
                  <ChevronRight size={18} className="inv-tile-chev" aria-hidden="true" />
                </motion.button>
              );
            })}
          </motion.div>
        </section>
      )}
      {dialogs}
    </div>
  );
}

function Spotlight({ icon: Icon, label, item, value }: { icon: LucideIcon; label: string; item?: CatalogueItem; value: string }) {
  return (
    <div className="inv-spot">
      <span className="inv-spot-icon" aria-hidden="true">
        <Icon size={19} />
      </span>
      <div>
        <span className="inv-spot-label">{label}</span>
        <strong title={item?.name}>{item ? item.name : "—"}</strong>
        <small className="num">{value}</small>
      </div>
    </div>
  );
}

/* ─────────────── Services table ─────────────── */

type ItemFilter = "all" | "priced" | "noprice" | "review" | "edited";
type ItemSort = "order" | "name" | "priceDesc" | "priceAsc" | "performed";
const BANDS: { id: string; label: string; test: (p: number) => boolean }[] = [
  { id: "u10", label: "Under ₦10K", test: (p) => p < 10_000 },
  { id: "10-50", label: "₦10K – ₦50K", test: (p) => p >= 10_000 && p < 50_000 },
  { id: "50-100", label: "₦50K – ₦100K", test: (p) => p >= 50_000 && p < 100_000 },
  { id: "100-250", label: "₦100K – ₦250K", test: (p) => p >= 100_000 && p < 250_000 },
  { id: "250", label: "₦250K and above", test: (p) => p >= 250_000 },
];

function ServiceTable({
  items,
  activity,
  currency,
  periodText,
  initialQuery,
  showCategory,
  groups,
  onEdit,
}: {
  items: CatalogueItem[];
  activity?: ServiceActivity;
  currency: Currency;
  periodText?: string;
  initialQuery: string;
  showCategory: boolean;
  groups: CategoryGroup[];
  onEdit: (i: CatalogueItem) => void;
}) {
  const [q, setQ] = useState(initialQuery);
  const [filter, setFilter] = useState<ItemFilter>("all");
  const [band, setBand] = useState<string | null>(null);
  const [sort, setSort] = useState<ItemSort>(activity ? "performed" : "order");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const labels = useMemo(() => new Map(groups.map((g) => [g.key, g.label])), [groups]);
  const term = q.trim().toLowerCase();
  const bands = BANDS.map((b) => ({ ...b, count: items.filter((i) => i.price !== null && b.test(i.price)).length })).filter((b) => b.count > 0);
  const bandMax = Math.max(1, ...bands.map((b) => b.count));
  const maxCount = Math.max(1, ...items.map((i) => activity?.get(i.id)?.count ?? 0));
  const rows = items
    .filter((i) => {
      if (filter === "priced" && i.price === null) return false;
      if (filter === "noprice" && i.price !== null) return false;
      if (filter === "review" && !i.note) return false;
      if (filter === "edited" && !i.edited && i.source !== "user") return false;
      if (band) {
        const b = BANDS.find((x) => x.id === band)!;
        if (i.price === null || !b.test(i.price)) return false;
      }
      return !term || `${i.name} ${i.id}`.toLowerCase().includes(term);
    })
    .slice()
    .sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "priceDesc") return (b.price ?? -1) - (a.price ?? -1);
      if (sort === "priceAsc") return (a.price ?? Infinity) - (b.price ?? Infinity);
      if (sort === "performed") return (activity?.get(b.id)?.count ?? 0) - (activity?.get(a.id)?.count ?? 0) || a.order - b.order;
      return a.order - b.order;
    });
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safe = Math.min(page, pages);
  const visible = rows.slice((safe - 1) * pageSize, safe * pageSize);
  const reset = () => setPage(1);

  return (
    <>
      {bands.length > 1 && (
        <div className="inv-bands" role="group" aria-label="Filter by price band">
          <span className="inv-bands-label">Price bands</span>
          {bands.map((b) => (
            <button
              key={b.id}
              type="button"
              className={band === b.id ? "is-active" : ""}
              aria-pressed={band === b.id}
              onClick={() => {
                setBand(band === b.id ? null : b.id);
                reset();
              }}
            >
              <span>{b.label}</span>
              <b className="num">{b.count}</b>
              <i aria-hidden="true">
                <s style={{ width: `${(b.count / bandMax) * 100}%` }} />
              </i>
            </button>
          ))}
        </div>
      )}

      <div className="inv-table-card">
        <div className="inv-table-tools">
          <SearchInput placeholder="Search services or ID" value={q} onChange={(v) => { setQ(v); reset(); }} />
          <Segmented
            label="Filter services"
            value={filter}
            onChange={(v) => { setFilter(v); reset(); }}
            options={[
              { value: "all", label: "All" },
              { value: "priced", label: "Priced" },
              { value: "noprice", label: "No price" },
              { value: "review", label: "Review" },
              { value: "edited", label: "Edited" },
            ]}
          />
          <SelectMenu
            value={sort}
            ariaLabel="Sort services"
            className="select-btn inv-sort"
            options={[
              ...(activity ? [{ value: "performed" as ItemSort, label: "Most performed" }] : []),
              { value: "order", label: "Catalogue order" },
              { value: "name", label: "Name A–Z" },
              { value: "priceDesc", label: "Price: high to low" },
              { value: "priceAsc", label: "Price: low to high" },
            ]}
            onChange={(v: ItemSort) => { setSort(v); reset(); }}
          />
          <span className="inv-count">
            {formatCount(rows.length)} of {formatCount(items.length)}
          </span>
        </div>

        <div className="table-wrap thin-scroll">
          <table className="inv-table">
            <thead>
              <tr>
                <th>Service</th>
                {showCategory && <th>Category</th>}
                <th className="right">Price</th>
                {activity && <th>Performed · {periodText}</th>}
                {activity && <th className="right">Revenue</th>}
                <th className="right" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={3 + (showCategory ? 1 : 0) + (activity ? 2 : 0)}>
                    <EmptyState title={term ? `No services match “${q}”` : "No services in this view"} />
                  </td>
                </tr>
              ) : (
                visible.map((i) => {
                  const act = activity?.get(i.id);
                  return (
                    <tr key={i.id}>
                      <td>
                        <div className="inv-svc">
                          <span className="inv-svc-avatar" aria-hidden="true">
                            {i.name.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "#"}
                          </span>
                          <div className="inv-svc-copy">
                            <span className="inv-name">
                              <strong>{i.name}</strong>
                              {i.source === "user" && <Badge tone="brand">Added</Badge>}
                              {i.owner && <Badge tone="brand">Owner added</Badge>}
                              {i.edited && <Badge tone="info">Edited</Badge>}
                            </span>
                            <small className="mono">
                              #{i.id}
                              {i.recorded && i.recorded.name !== i.name ? <> · recorded as {i.recorded.name}</> : i.recordedAs ? <> · recorded as {i.recordedAs}</> : null}
                            </small>
                            {i.note && (
                              <small className="inv-note" title={i.note}>
                                <CircleAlert size={12} /> {i.note}
                              </small>
                            )}
                          </div>
                        </div>
                      </td>
                      {showCategory && (
                        <td>
                          <span className="inv-cat-chip">{labels.get(i.category) ?? i.category}</span>
                        </td>
                      )}
                      <td className="right">
                        {i.price === null ? <span className="inv-noprice">No price</span> : <span className="inv-price num">{money(i.price)}</span>}
                        {i.recorded && i.recorded.price !== i.price && <small className="inv-was num">was {money(i.recorded.price)}</small>}
                      </td>
                      {activity && (
                        <td>
                          <div className="inv-perf">
                            <b className="num">{formatCount(act?.count ?? 0)}</b>
                            <span aria-hidden="true">
                              <i style={{ width: `${((act?.count ?? 0) / maxCount) * 100}%` }} />
                            </span>
                          </div>
                        </td>
                      )}
                      {activity && <td className="right num ep-nowrap">{act?.count ? formatMoney(act.revenue, currency) : <span className="lg-muted">—</span>}</td>}
                      <td className="right">
                        <button type="button" className="inv-edit" onClick={() => onEdit(i)} aria-label={`Edit ${i.name}`} title="Edit name and price">
                          <Pencil size={15} />
                          <span>Edit</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={safe} pageSize={pageSize} sizes={[10, 25, 50]} total={rows.length} noun="services" onPage={(p) => setPage(Math.min(Math.max(1, p), pages))} onPageSize={(s) => { setPageSize(s); setPage(1); }} />
      </div>
    </>
  );
}

/* ─────────────── Edit dialogs ─────────────── */

function EditServiceDialog({ item, onClose }: { item: CatalogueItem | null; onClose: () => void }) {
  return <>{item && <EditServiceForm key={item.id} item={item} onClose={onClose} />}</>;
}

function EditServiceForm({ item, onClose }: { item: CatalogueItem; onClose: () => void }) {
  const { editService, revertService, showToast } = useApp();
  const [name, setName] = useState(item.name);
  const [price, setPrice] = useState(item.price === null ? "" : String(item.price));
  const value = price.trim() === "" ? null : Number(price.replace(/,/g, ""));
  // Field errors — shown on each field after a blocked Save (owner rule), then updated live.
  const fieldErr = {
    name: name.trim().length === 0 ? "Enter the service name." : null,
    price: value !== null && !(Number.isFinite(value) && value > 0) ? "Enter a price greater than 0, or leave it blank." : null,
  };
  const valid = !fieldErr.name && !fieldErr.price;
  const [tried, setTried] = useState(false);
  const recorded = item.recorded ?? (item.source === "legacy" ? { name: item.name, price: item.price } : null);
  const changed = name.trim() !== item.name || value !== item.price;

  return (
    <Modal
      open
      onClose={onClose}
      icon={Pencil}
      title={`Edit ${item.name}`}
      description={`Service #${item.id} · ${item.source === "user" ? "added in STANLEY" : item.owner ? "added by the owner" : item.recordedAs ? `legacy item, recorded as ${item.recordedAs}` : "legacy catalogue item"}`}
      footer={
        <>
          {item.edited && (
            <Button
              variant="ghost"
              onClick={() => {
                revertService(item.id);
                showToast(`${item.recorded?.name ?? item.name} restored to its recorded values`);
                onClose();
              }}
            >
              <RotateCcw size={15} /> Restore recorded values
            </Button>
          )}
          <span className="left" />
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!changed}
            onClick={() => {
              if (!valid) {
                setTried(true);
                focusFirstError();
                return;
              }
              editService(item.id, { name: name.trim(), price: value });
              showToast(`${name.trim()} updated${value !== null ? ` · ${money(value)}` : ""} (this session)`);
              onClose();
            }}
          >
            Save changes
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <label className={`field full ${tried && fieldErr.name ? "is-error" : ""}`} data-field-error={tried && fieldErr.name ? true : undefined}>
          Service name
          <input value={name} onChange={(e) => setName(e.target.value)} />
          <FieldError msg={tried && fieldErr.name} />
        </label>
        <label className={`field ${tried && fieldErr.price ? "is-error" : ""}`} data-field-error={tried && fieldErr.price ? true : undefined}>
          Price (NGN)
          <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.,]/g, ""))} placeholder="No price on file" inputMode="decimal" />
          <FieldError msg={tried && fieldErr.price} />
        </label>
        <div className="field">
          Category
          <span className="inv-static">{item.category}</span>
        </div>
      </div>
      {recorded && item.source === "legacy" && !item.owner && (
        <div className="notice">
          <Banknote size={17} />
          <span>
            Recorded in the legacy system as <b>{recorded.name}</b> at <b>{money(recorded.price)}</b>. The legacy record is never overwritten — your change is kept separately and can be restored at any time. Changes last for this session until the database is connected.
          </span>
        </div>
      )}
      {item.note && (
        <div className="notice">
          <CircleAlert size={17} />
          <span>{item.note}</span>
        </div>
      )}
    </Modal>
  );
}

function RenameCategoryDialog({ group, onClose }: { group: CategoryGroup | null; onClose: () => void }) {
  return <>{group && <RenameCategoryForm key={group.key} group={group} onClose={onClose} />}</>;
}

function RenameCategoryForm({ group, onClose }: { group: CategoryGroup; onClose: () => void }) {
  const { renameCategory, showToast } = useApp();
  const [name, setName] = useState(group.label);
  return (
    <Modal
      open
      onClose={onClose}
      icon={Tag}
      title={`Rename ${group.label}`}
      description={`${group.items.length} services · category code ${group.key}`}
      footer={
        <>
          {group.label !== group.key && (
            <Button
              variant="ghost"
              onClick={() => {
                renameCategory(group.key, "");
                showToast(`Category restored to ${group.key}`);
                onClose();
              }}
            >
              <RotateCcw size={15} /> Use recorded name
            </Button>
          )}
          <span className="left" />
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || name.trim() === group.label}
            onClick={() => {
              renameCategory(group.key, name);
              showToast(`${group.key} is now shown as “${name.trim()}” (this session)`);
              onClose();
            }}
          >
            Save name
          </Button>
        </>
      }
    >
      <label className="field">
        Display name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={group.key} />
      </label>
      <p className="hint" style={{ margin: 0 }}>
        The display name changes how this category appears in STANLEY. The recorded category ({group.raw.join(", ")}) stays unchanged on every service.
      </p>
    </Modal>
  );
}
