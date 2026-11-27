import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Activity, ArrowRight, Award, Banknote, FlaskConical, Layers } from "lucide-react";
import { useApp } from "@/app/AppState";
import { SERVICES, getBranch } from "@/data/company";
import type { DateRange, Money, PeriodSelection } from "@/data/types";
import { CountUp, useMotionPreset, Reveal } from "@/shared/motion";
import { formatCount, formatMoney, formatPct, moneyEntries } from "@/shared/format";
import { Button, EmptyState, SectionHeader, Segmented, SelectMenu } from "@/shared/ui/controls";
import { Modal } from "@/shared/ui/Modal";
import { Pagination } from "@/shared/ui/Pagination";
import { periodLabel, serviceRanking, type ServiceRank } from "@/services/analytics";
import { rangeText } from "./WelcomeBanner";
import { CardHead, CardShell, FilterBar, StackBar, SummaryChips, defaultBranch, toSegments, useModalFilters } from "./ExpensesPatients";

const moneyText = (m: Money, compact = true) =>
  moneyEntries(m)
    .map(([c, v]) => formatMoney(v, c, compact))
    .join(" · ") || "—";

const plural = (n: number, one: string, many: string) => `${formatCount(n)} ${n === 1 ? one : many}`;

const PRICE = new Map(SERVICES.map((s) => [s.id, s.price]));
const priceText = (id: number) =>
  Object.entries(PRICE.get(id) ?? {})
    .map(([c, v]) => formatMoney(v as number, c as "NGN"))
    .join(" · ") || "—";

interface CategoryRow {
  name: string;
  count: number;
  services: number;
  revenue: Money;
}

function categorySummary(rows: ServiceRank[]): CategoryRow[] {
  const map = new Map<string, CategoryRow>();
  for (const r of rows) {
    if (!r.count) continue;
    const c = map.get(r.category) ?? { name: r.category, count: 0, services: 0, revenue: {} };
    c.count += r.count;
    c.services += 1;
    for (const [cur, v] of moneyEntries(r.revenue)) c.revenue[cur] = (c.revenue[cur] ?? 0) + v;
    map.set(r.category, c);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

/* ─────────────── Dashboard section ─────────────── */

export function DiagnosticServicesSection({ branchIds, range }: { branchIds: string[]; range: DateRange }) {
  const { period } = useApp();
  const m = useMotionPreset();
  const ranked = useMemo(() => serviceRanking(branchIds, range), [branchIds, range]);
  const performed = ranked.filter((r) => r.count > 0);
  const top = performed.slice(0, 5);
  const cats = useMemo(() => categorySummary(ranked), [ranked]);
  const totalTests = performed.reduce((s, r) => s + r.count, 0);
  const catSegments = useMemo(() => toSegments(cats.map((c) => [c.name, c.count] as [string, number]), "purple"), [cats]);
  // Revenue of the categories folded into "Other" (never mixes currencies).
  const otherRevenue = useMemo(() => {
    const shown = new Set(catSegments.map((s) => s.label));
    const out: Money = {};
    for (const c of cats) if (!shown.has(c.name)) for (const [cur, v] of moneyEntries(c.revenue)) out[cur] = (out[cur] ?? 0) + v;
    return out;
  }, [cats, catSegments]);
  const [modal, setModal] = useState<{ session: number; open: boolean; category: string } | null>(null);
  const open = (category = "all") => setModal((x) => ({ session: (x?.session ?? 0) + 1, open: true, category }));
  const periodText = periodLabel(period);

  return (
    <>
      <SectionHeader
        eyebrow="Daily test category summary"
        title={`Top diagnostic services · ${periodText}`}
        description="Tests performed in the reporting period, from the real service catalogue and prices. Open a card for every service."
        demo
      />
      <Reveal mode="stagger" className="analytics-grid pair-grid">
        {/* Top 5 services — the whole card opens the all-services modal */}
        <CardShell accent="teal" icon={FlaskConical} title="Top 5 diagnostic services" sub="By number performed" periodText={periodText} cta="View all services" onOpen={() => open()}>
          <div className="dc-hero">
            <div>
              <span className="dc-hero-label">Tests performed</span>
              <strong className="num">
                <CountUp value={totalTests} format={formatCount} />
              </strong>
            </div>
            <span className="dc-chip num">
              {formatCount(performed.length)} of {formatCount(ranked.length)} services
            </span>
          </div>
          {top.length === 0 ? (
            <p className="dc-none">No tests performed in this period.</p>
          ) : (
            <motion.ol className="dc-rank" variants={m.rowStagger} initial="hidden" animate="visible">
              {top.map((r, i) => (
                <motion.li key={r.id} className={i === 0 ? "is-leader" : undefined} variants={m.rowItem}>
                  <span className="dc-rank-no num">{i + 1}</span>
                  <span className="dc-main">
                    <strong title={r.name}>{r.name}</strong>
                    <small>
                      {formatCount(r.count)} performed · {r.category}
                    </small>
                    <span className="dc-mini" aria-hidden="true">
                      <motion.i style={{ width: `${top[0].count ? Math.max(4, (r.count / top[0].count) * 100) : 0}%` }} initial={m.reduced ? false : { scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true, amount: 0.3 }} transition={{ duration: 0.7, delay: 0.2 + i * 0.05 }} />
                    </span>
                  </span>
                  <span className="dc-amt-col">
                    <strong className="num">{moneyText(r.revenue)}</strong>
                    <small className="num">{priceText(r.id)} each</small>
                  </span>
                </motion.li>
              ))}
            </motion.ol>
          )}
        </CardShell>

        {/* Tests by category — header and footer open the modal; each category opens it pre-filtered */}
        <Reveal hover className="card span-6 dcard accent-purple">
          <CardHead icon={Layers} title="Tests by category" sub="Share of tests performed" periodText={periodText} onClick={() => open()} />
          <div className="dc-body">
            <div className="dc-hero">
              <div>
                <span className="dc-hero-label">Active categories</span>
                <strong className="num">
                  <CountUp value={cats.length} format={formatCount} />
                </strong>
              </div>
              <span className="dc-chip num">{formatCount(totalTests)} tests</span>
            </div>
            {catSegments.length > 0 && <StackBar label="Tests by category" segments={catSegments} />}
            {cats.length === 0 ? (
              <p className="dc-none">No tests performed in this period.</p>
            ) : (
              <motion.ul className="dc-list dc-cat-list" variants={m.rowStagger} initial="hidden" animate="visible">
                {catSegments.map((s) => {
                  const cat = cats.find((c) => c.name === s.label);
                  const share = totalTests ? (s.value / totalTests) * 100 : 0;
                  return (
                    <motion.li key={s.label} variants={m.rowItem}>
                      <button
                        type="button"
                        className="dc-legend is-button"
                        onClick={() => open(cat ? cat.name : "all")}
                        title={cat ? `Show ${cat.name} services` : "Show all services"}
                      >
                        <i style={{ background: s.color }} aria-hidden="true" />
                        <span className="dc-legend-name">
                          {s.label}
                          <small>
                            {formatCount(s.value)} tests{cat ? ` · ${cat.services} service${cat.services === 1 ? "" : "s"}` : ""}
                          </small>
                        </span>
                        <span className="dc-legend-pct num">{formatPct(share, share > 0 && share < 1 ? 1 : 0)}</span>
                        <span className="dc-amt num">{cat ? moneyText(cat.revenue) : moneyText(otherRevenue)}</span>
                      </button>
                    </motion.li>
                  );
                })}
              </motion.ul>
            )}
          </div>
          <div className="dc-foot">
            <button type="button" className="dc-link" onClick={() => open()} aria-haspopup="dialog">
              View all services <ArrowRight size={15} />
            </button>
          </div>
        </Reveal>
      </Reveal>
      {modal && (
        <ServicesModal
          key={modal.session}
          open={modal.open}
          basePeriod={period}
          baseBranchIds={branchIds}
          initialCategory={modal.category}
          onClose={() => setModal((x) => (x ? { ...x, open: false } : x))}
        />
      )}
    </>
  );
}

/* ─────────────── All services modal ─────────────── */

type Show = "performed" | "all";

function ServicesModal({
  open,
  basePeriod,
  baseBranchIds,
  initialCategory,
  onClose,
}: {
  open: boolean;
  basePeriod: PeriodSelection;
  baseBranchIds: string[];
  initialCategory: string;
  onClose: () => void;
}) {
  const { navigate } = useApp();
  const f = useModalFilters(basePeriod, baseBranchIds);
  const [category, setCategory] = useState(initialCategory);
  const [show, setShow] = useState<Show>("performed");

  const ranked = useMemo(() => serviceRanking(f.ids, f.range), [f.ids, f.range]);
  const categories = useMemo(() => [...new Set(SERVICES.map((s) => s.category))].sort(), []);
  const performedTotal = ranked.reduce((s, r) => s + r.count, 0);
  const needle = f.q.trim().toLowerCase();
  // Rank is by number performed over the whole period, regardless of filters.
  const withRank = ranked.map((r, i) => ({ ...r, rank: r.count > 0 ? i + 1 : null }));
  const rows = withRank.filter(
    (r) => (show === "all" || r.count > 0) && (category === "all" || r.category === category) && (!needle || `${r.name} ${r.category} ${r.id}`.toLowerCase().includes(needle)),
  );
  const pages = Math.max(1, Math.ceil(rows.length / f.pageSize));
  const page = Math.min(f.page, pages);
  const visible = rows.slice((page - 1) * f.pageSize, page * f.pageSize);
  const tests = rows.reduce((s, r) => s + r.count, 0);
  const revenue: Money = {};
  for (const r of rows) for (const [c, v] of moneyEntries(r.revenue)) revenue[c] = (revenue[c] ?? 0) + v;
  const leader = rows.find((r) => r.count > 0);
  const branchLabel = f.branchId === "all" ? "All branches" : `${getBranch(f.branchId)?.name} branch`;
  const baseBranch = defaultBranch(baseBranchIds);

  return (
    <Modal
      open={open}
      onClose={onClose}
      xl
      icon={FlaskConical}
      title={`Diagnostic services ·${f.isDay ? "Selected day" : periodLabel(f.period)}`}
      description={`${rangeText(f.range)} · ${branchLabel}`}
      footer={
        <>
          <span className="left">Real catalogue services and prices · volumes are demonstration activity</span>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button
            onClick={() => {
              onClose();
              navigate("/inventory");
            }}
          >
            Open Inventory <ArrowRight size={15} />
          </Button>
        </>
      }
    >
      <FilterBar
        f={f}
        basePeriod={basePeriod}
        searchPlaceholder="Service name, ID or category"
        dirty={category !== initialCategory || show !== "performed" || f.branchId !== baseBranch}
        onReset={() => {
          f.setPeriod(basePeriod);
          f.setBranchId(baseBranch);
          f.setQ("");
          setCategory(initialCategory);
          setShow("performed");
          f.setPage(1);
        }}
        extra={
          <>
            <div className="rf-filter">
              <span>Category</span>
              <SelectMenu
                value={category}
                ariaLabel="Test category"
                className="select-btn rf-select"
                options={[{ value: "all", label: "All categories" }, ...categories.map((c) => ({ value: c, label: c }))]}
                onChange={(v: string) => {
                  setCategory(v);
                  f.setPage(1);
                }}
              />
            </div>
            <div className="rf-filter">
              <span>Show</span>
              <Segmented
                label="Show services"
                value={show}
                onChange={(v) => {
                  setShow(v);
                  f.setPage(1);
                }}
                options={[
                  { value: "performed", label: "Performed" },
                  { value: "all", label: "Full catalogue" },
                ]}
              />
            </div>
          </>
        }
      />

      <SummaryChips
        items={[
          { label: "Tests performed", icon: Activity, value: formatCount(tests), caption: plural(new Set(rows.filter((r) => r.count > 0).map((r) => r.category)).size, "category", "categories") },
          { label: "Services performed", icon: FlaskConical, value: formatCount(rows.filter((r) => r.count > 0).length), caption: `of ${formatCount(rows.length)} listed in this view` },
          { label: "Revenue", icon: Banknote, value: moneyText(revenue, false), caption: "Billed value of tests performed" },
          { label: "Most performed", icon: Award, value: leader ? <span className="rf-kpi-name">{leader.name}</span> : "—", caption: leader ? `${formatCount(leader.count)} performed · ${leader.category}` : "No tests in this view" },
        ]}
      />

      <div className="card bp-card rf-table-card">
        <div className="table-wrap thin-scroll">
          <table className="bp-table rf-table ep-table" aria-label="Diagnostic services">
            <thead>
              <tr>
                <th>#</th>
                <th>Service</th>
                <th>Category</th>
                <th className="right">Unit price</th>
                <th className="right">Performed</th>
                <th className="right">Revenue</th>
                <th>Share of tests</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState title={needle ? `No services match “${f.q}”` : "No tests performed in this period"} />
                  </td>
                </tr>
              ) : (
                visible.map((r) => {
                  const share = performedTotal ? (r.count / performedTotal) * 100 : 0;
                  return (
                    <tr key={r.id} className={r.count === 0 ? "ds-idle" : undefined}>
                      <td className="num">{r.rank ? <span className="rank-no">{r.rank}</span> : <span className="lg-muted">—</span>}</td>
                      <td>
                        <strong>{r.name}</strong>
                        <small className="ep-sub mono">#{r.id}</small>
                      </td>
                      <td>
                        <span className="lg-chip">{r.category}</span>
                      </td>
                      <td className="right num ep-nowrap">{priceText(r.id)}</td>
                      <td className="right num strong">{formatCount(r.count)}</td>
                      <td className="right num ep-nowrap">{r.count ? moneyText(r.revenue, false) : "—"}</td>
                      <td>
                        <div className="bp-share">
                          <span className="bp-bar">
                            <i style={{ width: `${r.count ? Math.max(2, share) : 0}%` }} />
                          </span>
                          <span className="bp-pct">{formatPct(share, share > 0 && share < 1 ? 1 : 0)}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={page}
          pageSize={f.pageSize}
          sizes={[10, 25, 50]}
          total={rows.length}
          noun="services"
          onPage={(p) => f.setPage(Math.min(Math.max(1, p), pages))}
          onPageSize={(s) => {
            f.setPageSize(s);
            f.setPage(1);
          }}
        />
      </div>
    </Modal>
  );
}
