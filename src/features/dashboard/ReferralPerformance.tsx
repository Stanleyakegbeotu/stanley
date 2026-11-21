import { useMemo, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Activity, ArrowRight, BadgeCheck, Banknote, CalendarDays, ChevronDown, ChevronsUpDown, Handshake, Hospital, Percent, type LucideIcon } from "lucide-react";
import { useApp } from "@/app/AppState";
import { ACTIVE_BRANCHES, getBranch } from "@/data/company";
import type { Branch, DateRange, Money, PeriodSelection } from "@/data/types";
import { isoDate } from "@/data/demo/generator";
import { CountUp, Reveal, useMotionPreset } from "@/shared/motion";
import { formatCount, formatMoney, formatPct, initials, moneyEntries } from "@/shared/format";
import { Badge, Button, EmptyState, SearchInput, SectionHeader, Segmented, SelectMenu } from "@/shared/ui/controls";
import { FitText } from "@/shared/ui/FitText";
import { Modal } from "@/shared/ui/Modal";
import { Pagination } from "@/shared/ui/Pagination";
import { DATA_START, PERIOD_OPTIONS, TODAY, agentRanking, hospitalRanking, periodLabel, resolveBranchIds, resolveRange } from "@/services/analytics";
import { LEGACY_BRANCH_ID, buildHospitalDirectory, hasPhone } from "@/data/legacy";
import { rangeText } from "./WelcomeBanner";
import { CardHead } from "./ExpensesPatients";

type Kind = "hospitals" | "agents";

interface RefRow {
  id: string;
  name: string;
  sub: string;
  branch: Branch;
  referrals: number;
  revenue: Money;
  commission?: Money;
  /** Agents only: assigned hospital code ("" = unassigned). */
  hospital?: string;
  status?: string;
}

/**
 * Rows come straight from the analytics service over the REAL PR agents and
 * hospitals. Referral volumes are demonstration activity (see generator).
 */
function referralRows(kind: Kind, branchIds: string[], range: DateRange): RefRow[] {
  if (kind === "hospitals")
    return hospitalRanking(branchIds, range).map((h) => ({
      id: h.key,
      name: h.name,
      sub: `${h.agentCount} PR agent${h.agentCount === 1 ? "" : "s"} · ${h.activeAgents} referred`,
      branch: h.branch,
      referrals: h.referrals,
      revenue: h.revenue,
    }));
  return agentRanking(branchIds, range).map((a) => ({
    id: String(a.id),
    name: a.name,
    sub: `#${a.id}${hasPhone(a.phone) ? ` · ${a.phone}` : " · no phone on file"}`,
    branch: a.branch,
    referrals: a.referrals,
    revenue: a.revenue,
    commission: a.commission,
    hospital: a.hospitalKey,
  }));
}

const moneyText = (m: Money, compact = true) =>
  moneyEntries(m)
    .map(([c, v]) => formatMoney(v, c, compact))
    .join(" · ") || "—";

function sumMoney(rows: RefRow[], pick: (r: RefRow) => Money | undefined): Money {
  const out: Money = {};
  for (const r of rows) for (const [c, v] of moneyEntries(pick(r) ?? {})) out[c] = (out[c] ?? 0) + v;
  return out;
}

const META: Record<Kind, { title: string; modalTitle: string; icon: typeof Hospital; noun: string; cta: string; route: string }> = {
  hospitals: { title: "Top performing hospitals", modalTitle: "All referring hospitals", icon: Hospital, noun: "hospitals", cta: "Open hospital directory", route: "/pr?tab=hospitals" },
  agents: { title: "Top performing PR agents", modalTitle: "All PR agents", icon: Handshake, noun: "PR agents", cta: "Open PR Management", route: "/pr" },
};

/* ─────────────── Dashboard section ─────────────── */

export function ReferralPerformanceSection({ branchIds, range }: { branchIds: string[]; range: DateRange }) {
  const { period, agents: allAgents } = useApp();
  const hospitals = useMemo(() => referralRows("hospitals", branchIds, range), [branchIds, range]);
  const agents = useMemo(() => referralRows("agents", branchIds, range), [branchIds, range]);
  // Every real agent / hospital in scope, whether or not they referred in this period.
  const listed = useMemo(() => {
    const scoped = branchIds.includes(LEGACY_BRANCH_ID) ? allAgents : [];
    return { agents: scoped.length, hospitals: buildHospitalDirectory(scoped).length };
  }, [branchIds, allAgents]);
  const [modal, setModal] = useState<{ kind: Kind; session: number; open: boolean } | null>(null);
  const openModal = (kind: Kind) => setModal((m) => ({ kind, session: (m?.session ?? 0) + 1, open: true }));

  return (
    <>
      <SectionHeader
        eyebrow="Referral performance"
        title="Top performing hospitals & PR agents"
        description="Ranked by referrals in the reporting period. Amounts are the billed value of referred diagnostics, in each branch's recorded currency."
        demo
      />
      <Reveal mode="stagger" className="analytics-grid pair-grid">
        <TopReferralCard kind="hospitals" rows={hospitals} listed={listed.hospitals} periodText={periodLabel(period)} onSeeAll={() => openModal("hospitals")} />
        <TopReferralCard kind="agents" rows={agents} listed={listed.agents} periodText={periodLabel(period)} onSeeAll={() => openModal("agents")} />
      </Reveal>
      {modal && <ReferralModal key={modal.session} kind={modal.kind} open={modal.open} basePeriod={period} onClose={() => setModal((m) => (m ? { ...m, open: false } : m))} />}
    </>
  );
}

/**
 * Top-5 card: a clean ranked list (name, referrals, amount). The header and the
 * footer link both open the full-details modal for the reporting period.
 */
function TopReferralCard({ kind, rows, listed, periodText, onSeeAll }: { kind: Kind; rows: RefRow[]; listed: number; periodText: string; onSeeAll: () => void }) {
  const m = useMotionPreset();
  const meta = META[kind];
  const Icon = meta.icon;
  const referred = rows.filter((r) => r.referrals > 0);
  const top = referred.slice(0, 5);

  return (
    <Reveal hover className="card span-6 dcard accent-theme rfx-card">
      {/* Header band uses the selected theme colour so both cards read as one unit. */}
      <CardHead icon={Icon} title={meta.title} sub="Top 5 by referrals" periodText={periodText} onClick={onSeeAll} />

      {top.length === 0 ? (
        <div className="rfx-empty">
          <EmptyState title="No referrals in this period" />
        </div>
      ) : (
        <motion.ol className="rfx-list" variants={m.rowStagger} initial="hidden" animate="visible">
          {top.map((r, i) => (
            <motion.li key={r.id} className={`rfx-item ${i === 0 ? "is-leader" : ""}`} variants={m.rowItem}>
              <span className="rfx-rank num">{i + 1}</span>
              <span className="rfx-name">
                <strong title={r.name}>{r.name}</strong>
                <small>
                  {formatCount(r.referrals)} referral{r.referrals === 1 ? "" : "s"}
                  {kind === "agents" && r.hospital ? ` · ${r.hospital}` : ""}
                </small>
              </span>
              <span className="rfx-amt">
                <strong className="num">{moneyText(r.revenue)}</strong>
                <small>{r.commission ? `${moneyText(r.commission)} commission` : "generated"}</small>
              </span>
            </motion.li>
          ))}
        </motion.ol>
      )}

      <div className="dc-foot">
        <span className="dc-foot-note">
          {formatCount(referred.length)} of {formatCount(listed)} {meta.noun} referred
        </span>
        <button type="button" className="dc-link" onClick={onSeeAll} aria-haspopup="dialog">
          View full ranking <ArrowRight size={15} />
        </button>
      </div>
    </Reveal>
  );
}

/* ─────────────── "See all" modal ─────────────── */

const QUICK_PERIODS: { value: PeriodSelection["key"]; label: string }[] = PERIOD_OPTIONS.filter((o) => o.key !== "custom").map((o) => ({
  value: o.key,
  label: o.label,
}));

function RfKpi({
  tone,
  icon: Icon,
  label,
  value,
  caption,
}: {
  tone: "blue" | "green" | "orange" | "purple";
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  caption: string;
}) {
  return (
    <div className={`rf-kpi ${tone}`}>
      <div className="rf-kpi-head">
        <span className="rf-kpi-icon">
          <Icon size={18} strokeWidth={1.9} />
        </span>
        <span className="rf-kpi-label">{label}</span>
      </div>
      <FitText className="rf-kpi-value">{value}</FitText>
      <p className="rf-kpi-caption">{caption}</p>
    </div>
  );
}

/** Primary currency large; any other currency on its own line with a chip — never summed. */
function KpiMoney({ money }: { money: Money }) {
  const entries = moneyEntries(money);
  if (!entries.length) return <>—</>;
  const [[c0, v0], ...rest] = entries;
  return (
    <span className="rf-kpi-money">
      <CountUp value={v0} format={(n) => formatMoney(n, c0)} />
      {rest.map(([c, v]) => (
        <small key={c}>
          <span className="currency-chip">{c}</span>
          <CountUp value={v} format={(n) => formatMoney(n, c)} />
        </small>
      ))}
    </span>
  );
}

type SortKey = "rank" | "name" | "branch" | "referrals" | "revenue" | "commission" | "hospital";

function ReferralModal({ kind, open, basePeriod, onClose }: { kind: Kind; open: boolean; basePeriod: PeriodSelection; onClose: () => void }) {
  const { navigate } = useApp();
  const meta = META[kind];
  const [period, setPeriod] = useState<PeriodSelection>(basePeriod);
  const [branchId, setBranchId] = useState("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "rank", dir: "asc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  const range = useMemo(() => resolveRange(period), [period]);
  const ids = useMemo(() => (branchId === "all" ? resolveBranchIds("all") : [branchId]), [branchId]);
  const all = useMemo(() => referralRows(kind, ids, range).filter((r) => r.referrals > 0), [kind, ids, range]);

  // Rank is always by referrals; sorting the table never changes it.
  const ranked = useMemo(() => all.map((r, i) => ({ ...r, rank: i + 1 })), [all]);
  const filtered = ranked.filter((r) => `${r.name} ${r.branch.name} ${r.id}`.toLowerCase().includes(q.trim().toLowerCase()));
  const currencies = new Set(filtered.map((r) => r.branch.currency));
  const singleCurrency = currencies.size <= 1;

  const sorted = [...filtered].sort((a, b) => {
    const dir = sort.dir === "asc" ? 1 : -1;
    const money = (m?: Money) => moneyEntries(m ?? {})[0]?.[1] ?? 0;
    switch (sort.key) {
      case "name":
        return a.name.localeCompare(b.name) * dir;
      case "branch":
        return a.branch.name.localeCompare(b.branch.name) * dir;
      case "referrals":
        return (a.referrals - b.referrals) * dir;
      case "hospital":
        return (a.hospital || "~").localeCompare(b.hospital || "~") * dir;
      case "revenue":
        return (money(a.revenue) - money(b.revenue)) * dir;
      case "commission":
        return (money(a.commission) - money(b.commission)) * dir;
      default:
        return (a.rank - b.rank) * dir;
    }
  });

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pages);
  const visible = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);
  const totalReferrals = filtered.reduce((s, r) => s + r.referrals, 0);
  // "Listed" = every real agent / hospital in scope, whether or not they referred in this period.
  const { agents: allAgents } = useApp();
  const listed = useMemo(() => {
    const scoped = ids.includes(LEGACY_BRANCH_ID) ? allAgents : [];
    return kind === "agents" ? scoped.length : buildHospitalDirectory(scoped).length;
  }, [kind, ids, allAgents]);
  const leader = [...filtered].sort((a, b) => b.referrals - a.referrals)[0];
  const isDay = period.key === "custom" && period.from === period.to;
  const revenue = sumMoney(filtered, (r) => r.revenue);
  const commission = sumMoney(filtered, (r) => r.commission);

  const reset = () => setPage(1);
  const toggle = (key: SortKey) => {
    if ((key === "revenue" || key === "commission") && !singleCurrency) return;
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" || key === "branch" || key === "rank" ? "asc" : "desc" }));
  };

  const branchLabel = branchId === "all" ? "All branches" : `${getBranch(branchId)?.name} branch`;
  const columns: { key: SortKey; label: string; numeric?: boolean; moneySort?: boolean }[] =
    kind === "agents"
      ? [
          { key: "rank", label: "#" },
          { key: "name", label: "PR agent" },
          { key: "branch", label: "Branch" },
          { key: "hospital", label: "Hospital" },
          { key: "referrals", label: "Referrals", numeric: true },
          { key: "revenue", label: "Revenue generated", numeric: true, moneySort: true },
          { key: "commission", label: "Commission earned", numeric: true, moneySort: true },
        ]
      : [
          { key: "rank", label: "#" },
          { key: "name", label: "Hospital / organisation" },
          { key: "branch", label: "Branch" },
          { key: "referrals", label: "Referrals", numeric: true },
          { key: "revenue", label: "Revenue generated", numeric: true, moneySort: true },
          { key: "rank", label: "Share of referrals" },
        ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      xl
      icon={meta.icon}
      title={meta.modalTitle}
      description={`${period.key === "custom" && period.from === period.to ? "Selected day" : periodLabel(period)} · ${rangeText(range)} · ${branchLabel}`}
      footer={
        <>
          <span className="left">Demonstration data · calculated by STANLEY analytics</span>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button
            onClick={() => {
              onClose();
              navigate(meta.route);
            }}
          >
            {meta.cta} <ArrowRight size={15} />
          </Button>
        </>
      }
    >
      <div className="rf-filters" role="group" aria-label="Filters">
        <div className="rf-filter-row">
          <div className="rf-filter">
            <span>Period</span>
            <Segmented
              label="Reporting period"
              value={period.key}
              onChange={(key) => {
                setPeriod({ key });
                reset();
              }}
              options={QUICK_PERIODS}
            />
          </div>
          <label className="rf-filter">
            <span>Or pick a day</span>
            <span className={`rf-date ${isDay ? "is-set" : ""}`}>
              <CalendarDays size={16} />
              <input
                type="date"
                value={isDay ? (period.from ?? "") : ""}
                min={isoDate(DATA_START)}
                max={isoDate(TODAY)}
                onChange={(e) => {
                  if (!e.target.value) return;
                  setPeriod({ key: "custom", from: e.target.value, to: e.target.value });
                  reset();
                }}
                aria-label="Pick a specific day"
              />
            </span>
          </label>
        </div>
        <div className="rf-filter-row">
          <div className="rf-filter">
            <span>Branch</span>
            <SelectMenu
              value={branchId}
              ariaLabel="Branch"
              className="select-btn rf-select"
              options={[{ value: "all", label: "All branches", description: `${ACTIVE_BRANCHES.length} active branches` }, ...ACTIVE_BRANCHES.map((b) => ({ value: b.id, label: b.name, description: `${b.city} · ${b.currency}` }))]}
              onChange={(v: string) => {
                setBranchId(v);
                reset();
              }}
            />
          </div>
          <div className="rf-filter grow">
            <span>Search</span>
            <SearchInput
              placeholder={kind === "agents" ? "Agent name, ID or branch" : "Hospital or branch"}
              value={q}
              onChange={(v) => {
                setQ(v);
                reset();
              }}
            />
          </div>
          {(branchId !== "all" || q || period.key !== basePeriod.key || isDay) && (
            <button
              className="text-link rf-reset"
              onClick={() => {
                setPeriod(basePeriod);
                setBranchId("all");
                setQ("");
                reset();
              }}
            >
              Reset filters
            </button>
          )}
        </div>
      </div>

      <div className="rf-kpis">
        <RfKpi
          tone="blue"
          icon={meta.icon}
          label={kind === "agents" ? "PR agents with referrals" : "Referring hospitals"}
          value={<CountUp value={filtered.length} format={formatCount} />}
          caption={`${filtered.length} of ${listed} listed ${meta.noun} referred patients`}
        />
        <RfKpi
          tone="green"
          icon={Activity}
          label="Total referrals"
          value={<CountUp value={totalReferrals} format={formatCount} />}
          caption={filtered.length ? `${(totalReferrals / filtered.length).toFixed(1)} per ${kind === "agents" ? "agent" : "hospital"} on average` : "No referrals in this period"}
        />
        <RfKpi tone="orange" icon={Banknote} label="Revenue generated" value={<KpiMoney money={revenue} />} caption="Billed value of referred diagnostics" />
        {kind === "agents" ? (
          <RfKpi
            tone="purple"
            icon={Percent}
            label="Commission earned"
            value={<KpiMoney money={commission} />}
            caption={leader ? `Highest: ${leader.name}` : "Accrued on referred diagnostics"}
          />
        ) : (
          <RfKpi
            tone="purple"
            icon={BadgeCheck}
            label="Top hospital"
            value={leader ? <span className="rf-kpi-name">{leader.name}</span> : "—"}
            caption={leader ? `${formatCount(leader.referrals)} referrals · ${leader.branch.name}` : "No referrals in this period"}
          />
        )}
      </div>

      <div className="card bp-card rf-table-card">
        <div className="table-wrap thin-scroll">
          <table className="bp-table rf-table" aria-label={meta.modalTitle}>
            <thead>
              <tr>
                {columns.map((col, i) => {
                  const active = sort.key === col.key && !(col.label === "Share of referrals");
                  const disabled = col.moneySort && !singleCurrency;
                  const sortable = col.label !== "Share of referrals";
                  return (
                    <th
                      key={`${col.key}-${i}`}
                      className={col.numeric ? "right" : undefined}
                      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                    >
                      {sortable ? (
                        <button
                          className="bp-sort"
                          onClick={() => toggle(col.key)}
                          disabled={disabled}
                          title={disabled ? "Amounts in different currencies cannot be ranked against each other. Filter to one branch or currency to sort by amount." : undefined}
                        >
                          {col.label}
                          {active ? <ChevronDown size={14} /> : <ChevronsUpDown size={14} />}
                        </button>
                      ) : (
                        col.label
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={columns.length}>
                    <EmptyState title={q ? `No ${meta.noun} match “${q}”` : `No ${meta.noun} referred patients in this period`} />
                  </td>
                </tr>
              ) : (
                visible.map((r) => (
                  <tr key={r.id} className="rf-row">
                    <td className="num">
                      <span className="rank-no">{r.rank}</span>
                    </td>
                    <td>
                      <span className="bp-branch" style={{ cursor: "default" }}>
                        <span className="bp-avatar" aria-hidden="true">
                          {initials(r.name)}
                        </span>
                        <span className="bp-name">
                          <strong>
                            {r.name}
                            {r.status && r.status !== "Active" && <Badge tone="warn">{r.status}</Badge>}
                          </strong>
                          <small>{r.sub}</small>
                        </span>
                      </span>
                    </td>
                    <td>
                      {r.branch.name} <span className="currency-chip">{r.branch.currency}</span>
                    </td>
                    {kind === "agents" && <td>{r.hospital ? <span className="lg-chip">{r.hospital}</span> : <span className="lg-muted">Unassigned</span>}</td>}
                    <td className="right num strong">{formatCount(r.referrals)}</td>
                    <td className="right num">{moneyText(r.revenue, false)}</td>
                    {kind === "agents" ? (
                      <td className="right num">{moneyText(r.commission ?? {}, false)}</td>
                    ) : (
                      <td>
                        <div className="bp-share">
                          <span className="bp-bar">
                            <i style={{ width: `${totalReferrals ? Math.max(2, (r.referrals / totalReferrals) * 100) : 0}%` }} />
                          </span>
                          <span className="bp-pct">{formatPct(totalReferrals ? (r.referrals / totalReferrals) * 100 : 0, 0)}</span>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={safePage}
          pageSize={pageSize}
          total={sorted.length}
          noun={meta.noun}
          onPage={(p) => setPage(Math.min(Math.max(1, p), pages))}
          onPageSize={(s) => {
            setPageSize(s);
            setPage(1);
          }}
        />
      </div>

      {!singleCurrency && (
        <p className="hint" style={{ margin: 0 }}>
          Amounts stay in each branch&apos;s recorded currency ({[...currencies].join(", ")}) and are never added together.
        </p>
      )}
    </Modal>
  );
}
