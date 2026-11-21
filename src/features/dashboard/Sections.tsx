import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Building2,
  CircleAlert,
  ClipboardList,
  CreditCard,
  FileText,
  FlaskConical,
  Hospital,
  Info,
  MapPin,
  ReceiptText,
  Stethoscope,
  TriangleAlert,
  UserRound,
  UserRoundPlus,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useApp } from "@/app/AppState";
import { getBranch } from "@/data/demo/catalog";
import { ACTIVITY, HEADCOUNT, STAFF, STAFF_REQUESTS, type ActivityEvent, type ActivityKind } from "@/data/demo/records";
import type { DateRange } from "@/data/types";
import { CountUp, Reveal, useMotionPreset } from "@/shared/motion";
import { formatCount, formatMoney, formatPct, formatRelative, initials, moneyEntries } from "@/shared/format";
import { Badge, Button, SectionHeader, type Tone } from "@/shared/ui/controls";
import { HBarList, ProgressBar } from "@/shared/ui/charts";
import { Modal } from "@/shared/ui/Modal";
import { branchPerformance, compareMoney, doctorRanking, hospitalRanking, serviceRanking } from "@/services/analytics";
import { attentionItems, type Severity } from "@/services/insights";

/* ─────────────── Branch performance ─────────────── */
export function BranchPerformanceSection({ range, focusId }: { range: DateRange; focusId: string | null }) {
  const { navigate } = useApp();
  const m = useMotionPreset();
  const rows = useMemo(() => branchPerformance(range), [range]);
  return (
    <>
      <SectionHeader
        eyebrow="Branch performance"
        title="Branch comparison"
        description="Each branch is compared only with peers that record in the same currency."
        demo
        actions={
          <Button variant="secondary" size="sm" onClick={() => navigate("/branches")}>
            All branches <ArrowRight size={15} />
          </Button>
        }
      />
      <Reveal mode="stagger" className="branch-grid">
        {rows.map(({ branch, summary, prior, currencyShare, rankInCurrency }) => {
          const c = branch.currency;
          const fm = (n: number) => formatMoney(n, c, true);
          const change = summary ? compareMoney(summary.revenue, prior?.revenue ?? null)[c] : null;
          const inactive = !summary;
          return (
            <motion.article
              key={branch.id}
              variants={m.revealItem}
              whileHover={m.cardHover}
              className={`card branch-card ${focusId === branch.id ? "is-focused" : ""} ${inactive ? "is-inactive" : ""}`}
            >
              <div className="branch-card-head">
                <span className="branch-glyph">
                  <Building2 size={21} />
                </span>
                <div>
                  <h3>{branch.name}</h3>
                  <p>
                    <MapPin size={13} /> {branch.city}, {branch.country}
                  </p>
                </div>
                <div className="badges">
                  <Badge tone={inactive ? "neutral" : "ok"} dot>
                    {branch.status}
                  </Badge>
                  <span className="currency-chip">{c}</span>
                </div>
              </div>
              {summary ? (
                <>
                  <div className="branch-stats">
                    <div>
                      <span>Patients</span>
                      <strong>
                        <CountUp value={summary.patients} format={formatCount} />
                      </strong>
                    </div>
                    <div>
                      <span>Diagnostic orders</span>
                      <strong>
                        <CountUp value={summary.orders} format={formatCount} />
                      </strong>
                    </div>
                    <div>
                      <span>Revenue generated</span>
                      <strong>
                        <CountUp value={summary.revenue[c] ?? 0} format={fm} />
                      </strong>
                    </div>
                    <div>
                      <span>Payments received</span>
                      <strong>
                        <CountUp value={summary.payments[c] ?? 0} format={fm} />
                      </strong>
                    </div>
                    <div>
                      <span>Outstanding</span>
                      <strong>
                        <CountUp value={summary.outstanding[c] ?? 0} format={fm} />
                      </strong>
                    </div>
                    <div>
                      <span>Expenses</span>
                      <strong>
                        <CountUp value={summary.expenses[c] ?? 0} format={fm} />
                      </strong>
                    </div>
                  </div>
                  <div className="branch-share">
                    <div>
                      <span>
                        Share of {c} revenue · rank <b>#{rankInCurrency}</b>
                      </span>
                      <b>{formatPct(currencyShare ?? 0, 0)}</b>
                    </div>
                    <ProgressBar value={currencyShare ?? 0} />
                  </div>
                </>
              ) : (
                <div className="notice" style={{ marginTop: 18 }}>
                  <Info size={17} />
                  <span>Setup in progress. This branch is excluded from all company totals until it is activated.</span>
                </div>
              )}
              <div className="branch-card-foot">
                {summary ? (
                  <span className="hint">{change == null ? "No prior-period data" : `${change >= 0 ? "▲" : "▼"} ${Math.abs(change).toFixed(1)}% revenue vs prior period`}</span>
                ) : (
                  <span className="hint">Opening: to be scheduled</span>
                )}
                <Button
                  variant={summary ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => navigate(summary ? `/branch/${branch.id}/dashboard` : "/branches")}
                >
                  {summary ? "Open branch" : "View setup"} <ArrowRight size={15} />
                </Button>
              </div>
            </motion.article>
          );
        })}
      </Reveal>
    </>
  );
}

/* ─────────────── Top 5 performance ─────────────── */
interface RankRow {
  name: string;
  meta: string;
  value: string;
  sub?: string;
  pct: number;
}

function TopCard({ title, subtitle, icon: Icon, rows, onMore }: { title: string; subtitle: string; icon: LucideIcon; rows: RankRow[]; onMore: () => void }) {
  const m = useMotionPreset();
  return (
    <motion.article className="card card-pad" variants={m.revealItem} whileHover={m.cardHover}>
      <div className="card-head">
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span className="activity-icon">
            <Icon size={18} />
          </span>
          <div>
            <h3>{title}</h3>
            <p>{subtitle}</p>
          </div>
        </div>
        <button className="text-link" onClick={onMore}>
          See more <ArrowRight size={14} />
        </button>
      </div>
      {rows.length === 0 ? (
        <div className="empty">No records in this period.</div>
      ) : (
        <motion.ol className="rank-list" variants={m.rowStagger} initial="hidden" animate="visible">
          {rows.map((r, i) => (
            <motion.li key={r.name} className="rank-item" variants={m.rowItem}>
              <span className="rank-no">{i + 1}</span>
              <span className="rank-name" title={r.name}>
                {r.name}
              </span>
              <span className="rank-value">
                {r.value}
                {r.sub && <small>{r.sub}</small>}
              </span>
              <span className="rank-meta">{r.meta}</span>
              <span className="rank-bar">
                <motion.div style={{ width: `${r.pct}%` }} initial={m.reduced ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.7, delay: 0.25 + i * 0.05 }} />
              </span>
            </motion.li>
          ))}
        </motion.ol>
      )}
    </motion.article>
  );
}

const moneyText = (m: Partial<Record<"NGN" | "GHS", number>>) =>
  moneyEntries(m)
    .map(([c, v]) => formatMoney(v, c, true))
    .join(" · ");

export function TopPerformanceSection({ branchIds, range, basePath = "/reports" }: { branchIds: string[]; range: DateRange; basePath?: string }) {
  const { navigate } = useApp();
  const { doctors, hospitals, services } = useMemo(() => {
    const d = doctorRanking(branchIds, range).slice(0, 5);
    const h = hospitalRanking(branchIds, range).slice(0, 5);
    const s = serviceRanking(branchIds, range).slice(0, 5);
    return {
      doctors: d.map((x) => ({ name: x.name, meta: `${x.specialty ?? "Referring doctor"} · ${x.branch.name}`, value: `${formatCount(x.referrals)} referrals`, sub: moneyText(x.revenue), pct: d[0]?.referrals ? (x.referrals / d[0].referrals) * 100 : 0 })),
      hospitals: h.map((x) => ({ name: x.name, meta: x.branch.name, value: `${formatCount(x.referrals)} referrals`, sub: moneyText(x.revenue), pct: h[0]?.referrals ? (x.referrals / h[0].referrals) * 100 : 0 })),
      services: s.map((x) => ({ name: x.name, meta: x.category, value: `${formatCount(x.count)} performed`, sub: moneyText(x.revenue), pct: s[0]?.count ? (x.count / s[0].count) * 100 : 0 })),
    };
  }, [branchIds, range]);

  return (
    <>
      <SectionHeader eyebrow="Referral & service performance" title="Top performers" description="Referral contribution is the billed value of diagnostics from referred patients, kept in its recorded currency." demo />
      <Reveal mode="stagger" className="top-grid">
        <TopCard title="Top 5 referring doctors" subtitle="By referral count" icon={Stethoscope} rows={doctors} onMore={() => navigate(`${basePath}?tab=doctors`)} />
        <TopCard title="Top 5 referring hospitals" subtitle="Hospitals & organisations" icon={Hospital} rows={hospitals} onMore={() => navigate(`${basePath}?tab=hospitals`)} />
        <TopCard title="Top 5 diagnostic services" subtitle="By number performed" icon={FlaskConical} rows={services} onMore={() => navigate(`${basePath}?tab=services`)} />
      </Reveal>
    </>
  );
}

/* ─────────────── Activity & attention ─────────────── */
const ACTIVITY_ICON: Record<ActivityKind, LucideIcon> = {
  patient: UserRoundPlus,
  order: ClipboardList,
  payment: CreditCard,
  expense: Wallet,
  staff: Users,
  branch: Building2,
  referral: Stethoscope,
  admin: ReceiptText,
  approval: FileText,
};

const STATUS_TONE: Record<ActivityEvent["status"], Tone> = {
  Completed: "ok",
  Approved: "ok",
  Recorded: "brand",
  "Pending approval": "warn",
  Flagged: "danger",
};

const SEVERITY_META: Record<Severity, { label: string; tone: Tone; icon: LucideIcon }> = {
  urgent: { label: "Urgent", tone: "danger", icon: TriangleAlert },
  attention: { label: "Attention", tone: "warn", icon: CircleAlert },
  info: { label: "Informational", tone: "info", icon: Info },
};

export function ActivityAttentionSection({ branchIds, range, includeCompany }: { branchIds: string[]; range: DateRange; includeCompany: boolean }) {
  const { navigate } = useApp();
  const m = useMotionPreset();
  const [detail, setDetail] = useState<ActivityEvent | null>(null);
  const events = ACTIVITY.filter((e) => (e.branchId ? branchIds.includes(e.branchId) || (includeCompany && getBranch(e.branchId)?.status !== "Active") : includeCompany)).slice(0, 6);
  const alerts = useMemo(() => attentionItems(branchIds, range, includeCompany), [branchIds, range, includeCompany]);

  return (
    <>
      <SectionHeader eyebrow="Operations" title="Recent activity & attention required" demo />
      <Reveal mode="stagger" className="split-grid">
        <Reveal hover className="card card-pad">
          <div className="card-head">
            <div>
              <h3>Recent activity</h3>
              <p>{includeCompany ? "Important events across the company" : "Important events in this branch"}</p>
            </div>
            <button className="text-link" onClick={() => navigate("/audit")}>
              View audit log <ArrowRight size={14} />
            </button>
          </div>
          {events.length === 0 ? (
            <div className="empty">No recent activity.</div>
          ) : (
            <motion.ul className="activity-list" variants={m.rowStagger} initial="hidden" animate="visible">
              {events.map((e) => {
                const Icon = ACTIVITY_ICON[e.kind];
                return (
                  <motion.li key={e.id} variants={m.rowItem}>
                    <button className="activity-row" onClick={() => setDetail(e)}>
                      <span className="activity-icon">
                        <Icon size={18} />
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <strong>{e.title}</strong>
                        <small>
                          {e.detail} · {e.actor}
                          {e.branchId ? ` · ${getBranch(e.branchId)?.name}` : ""}
                        </small>
                      </span>
                      <span className="activity-side">
                        <time dateTime={e.at.toISOString()}>{formatRelative(e.at)}</time>
                        <Badge tone={STATUS_TONE[e.status]}>{e.status}</Badge>
                      </span>
                    </button>
                  </motion.li>
                );
              })}
            </motion.ul>
          )}
        </Reveal>

        <Reveal hover className="card card-pad">
          <div className="card-head">
            <div>
              <h3>Attention required</h3>
              <p>Calculated from balances, approvals, inventory and audit flags</p>
            </div>
            <Badge tone={alerts.some((a) => a.severity === "urgent") ? "danger" : alerts.length ? "warn" : "ok"}>{alerts.length} open</Badge>
          </div>
          {alerts.length === 0 ? (
            <div className="empty">Nothing needs your attention right now.</div>
          ) : (
            <motion.ul className="alert-list" variants={m.rowStagger} initial="hidden" animate="visible">
              {alerts.map((a) => {
                const meta = SEVERITY_META[a.severity];
                const Icon = meta.icon;
                return (
                  <motion.li key={a.id} className={`alert-row ${a.severity}`} variants={m.rowItem}>
                    <span className="alert-icon">
                      <Icon size={18} />
                    </span>
                    <div className="alert-body">
                      <div>
                        <strong>{a.title}</strong>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </div>
                      <p>{a.detail}</p>
                      <div className="alert-meta">
                        {a.branchId && <span>{getBranch(a.branchId)?.name}</span>}
                        <button className="text-link" onClick={() => navigate(a.route)}>
                          {a.action} <ArrowRight size={14} />
                        </button>
                      </div>
                    </div>
                  </motion.li>
                );
              })}
            </motion.ul>
          )}
        </Reveal>
      </Reveal>

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.title ?? ""}
        description={detail ? `${detail.id} · ${formatRelative(detail.at)}` : ""}
        footer={
          <>
            <span className="left">Demonstration record</span>
            <Button variant="secondary" onClick={() => setDetail(null)}>
              Close
            </Button>
            {detail && (
              <Button
                onClick={() => {
                  navigate(detail.route);
                  setDetail(null);
                }}
              >
                Open related screen <ArrowRight size={15} />
              </Button>
            )}
          </>
        }
      >
        {detail && (
          <div className="form-grid">
            <div className="field">
              Description
              <span className="hint" style={{ fontWeight: 400, fontSize: 14 }}>
                {detail.detail}
              </span>
            </div>
            <div className="field">
              Status
              <span>
                <Badge tone={STATUS_TONE[detail.status]}>{detail.status}</Badge>
              </span>
            </div>
            <div className="field">
              Performed by
              <span className="hint" style={{ fontSize: 14 }}>
                {detail.actor}
              </span>
            </div>
            <div className="field">
              Branch
              <span className="hint" style={{ fontSize: 14 }}>
                {detail.branchId ? getBranch(detail.branchId)?.name : "Company-wide"}
              </span>
            </div>
            <div className="field">
              Date & time
              <span className="hint" style={{ fontSize: 14 }}>
                {detail.at.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
              </span>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

/* ─────────────── Staff overview ─────────────── */
export function StaffOverviewCard({ branchIds, staffPath = "/staff" }: { branchIds: string[]; staffPath?: string }) {
  const { navigate } = useApp();
  const counts = branchIds.map((id) => ({ id, ...(HEADCOUNT[id] ?? { total: 0, active: 0, onLeave: 0 }) }));
  const total = counts.reduce((s, c) => s + c.total, 0);
  const active = counts.reduce((s, c) => s + c.active, 0);
  const onLeave = counts.reduce((s, c) => s + c.onLeave, 0);
  const requests = STAFF_REQUESTS.filter((r) => branchIds.includes(r.branchId));
  const recent = STAFF.filter((s) => branchIds.includes(s.branchId) && s.status === "Active")
    .sort((a, b) => b.lastActive.getTime() - a.lastActive.getTime())
    .slice(0, 3);

  return (
    <Reveal hover className="card card-pad">
      <div className="card-head">
        <div>
          <h3>Staff overview</h3>
          <p>Headcount and activity · demonstration data</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => navigate(staffPath)}>
          Staff Management <ArrowRight size={15} />
        </Button>
      </div>
      <div className="staff-stats">
        <div>
          <span>Total staff</span>
          <strong>
            <CountUp value={total} format={formatCount} />
          </strong>
        </div>
        <div>
          <span>Active</span>
          <strong>
            <CountUp value={active} format={formatCount} />
          </strong>
        </div>
        <div>
          <span>On leave</span>
          <strong>
            <CountUp value={onLeave} format={formatCount} />
          </strong>
        </div>
        <div>
          <span>Pending requests</span>
          <strong>
            <CountUp value={requests.length} format={formatCount} />
          </strong>
        </div>
      </div>
      {counts.length > 1 && (
        <>
          <div className="hint" style={{ marginBottom: 10 }}>
            Branch distribution
          </div>
          <HBarList items={counts.map((c) => ({ label: getBranch(c.id)?.name ?? c.id, value: c.total, display: `${c.total} staff`, color: "var(--brand-400)" }))} />
        </>
      )}
      <div className="hint" style={{ margin: "18px 0 6px" }}>
        Recently active
      </div>
      {recent.map((s) => (
        <div className="person" key={s.id} style={{ padding: "8px 0" }}>
          <span className="avatar">{initials(s.name)}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong style={{ fontSize: 14 }}>{s.name}</strong>
            <small>
              {s.role} · {getBranch(s.branchId)?.name}
            </small>
          </div>
          <span className="hint">{formatRelative(s.lastActive)}</span>
        </div>
      ))}
      {requests.length > 0 && (
        <div className="notice" style={{ marginTop: 12 }}>
          <UserRound size={17} />
          <span>{requests.map((r) => r.title).join(" · ")}</span>
        </div>
      )}
    </Reveal>
  );
}
