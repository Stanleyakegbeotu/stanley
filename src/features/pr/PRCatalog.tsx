/**
 * PR / Hospital management — hospital cards first (like the inventory
 * catalogue), then a pop-up of the PR agents at a hospital, then an agent's
 * profile with an edit form (name, phone, hospital transfer).
 *
 * One colour throughout (the app theme). Hospital cards are told apart by
 * their code monogram, rank, agent initials and figures — never by colour.
 *
 * Agent edits are session-only overrides (AppState.agentEdits); the legacy
 * export is never modified and the recorded values stay visible.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Banknote,
  CalendarDays,
  Handshake,
  Hospital,
  Pencil,
  Percent,
  Plus,
  RotateCcw,
  TrendingUp,
  UserRound,
  UserX,
  Users,
  X,
} from "lucide-react";
import { useApp } from "@/app/AppState";
import { getBranch } from "@/data/company";
import type { DateRange } from "@/data/types";
import { DATA_START, TODAY, addDays, diffDays, isoDate } from "@/data/demo/generator";
import { patientVisits, type PatientVisit } from "@/data/demo/dailyLines";
import { LEGACY_BRANCH_ID, buildHospitalDirectory, hasPhone, hospitalKey, type HospitalEntry } from "@/data/legacy";
import { recordedAgent, type AgentRecord } from "@/data/userRecords";
import { DEMO_PR_COMMISSION_RATE } from "@/services/businessRules";
import { resolveRange } from "@/services/analytics";
import { useMotionPreset } from "@/shared/motion";
import { formatCount, formatMoney, formatShortDate, formatTime } from "@/shared/format";
import { PatientRecordModal } from "@/features/shared/PatientRecord";
import { Badge, Button, EmptyState, SearchInput, Segmented, SelectMenu } from "@/shared/ui/controls";
import { Modal } from "@/shared/ui/Modal";
import { Pagination } from "@/shared/ui/Pagination";
import { SearchSelect, type SearchOption } from "@/shared/ui/SearchSelect";
import { SummaryChips } from "@/features/dashboard/ExpensesPatients";
import { AddAgentDialog } from "@/features/shared/createForms";

export type AgentActivity = Map<number, { referrals: number; revenue: number; commission: number }>;

/** Which agents a list pop-up shows: one hospital, the unassigned agents, or everyone. */
type AgentScope = { kind: "hospital"; key: string } | { kind: "unassigned" } | { kind: "all" };

const NO_HOSPITAL = "No hospital assigned";
const money = (n: number, compact = false) => formatMoney(n, "NGN", compact);
/** Two-letter initials that skip titles (Dr, Nrs, Mr…) and punctuation: "Dr Abegunde Babatunde" → "AB". */
const TITLES = new Set(["DR", "DOC", "NRS", "NURSE", "MR", "MRS", "MS", "MISS", "PROF", "PHARM", "ENGR", "CHIEF", "SIR", "MATRON"]);
function agentInitials(name: string): string {
  const words = name.toUpperCase().replace(/[^A-Z\s]/g, " ").split(/\s+/).filter(Boolean);
  const real = words.filter((w) => !TITLES.has(w));
  const use = real.length ? real : words;
  return (use.length > 1 ? use[0][0] + use[1][0] : (use[0] ?? "#").slice(0, 2)).toUpperCase();
}
const monogram = (code: string) => code.replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase() || "#";

type CardSort = "agents" | "referrals" | "name";

export function PRCatalog({
  scope,
  activity,
  periodText,
  initialAgents = false,
  initialHospital = null,
  initialAgent = null,
}: {
  scope: string[] | null;
  activity: AgentActivity;
  periodText: string;
  /** Open the "All PR agents" list straight away (e.g. /pr?tab=agents). */
  initialAgents?: boolean;
  /** Open this hospital's agent list straight away. */
  initialHospital?: string | null;
  /** Open this agent's profile straight away. */
  initialAgent?: number | null;
}) {
  const { agents: allAgents, agentEdits } = useApp();
  const m = useMotionPreset();
  const inScope = !scope || scope.includes(LEGACY_BRANCH_ID);
  const agents = useMemo(() => (inScope ? allAgents : []), [inScope, allAgents]);
  const directory = useMemo(() => buildHospitalDirectory(agents), [agents]);
  const byId = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);
  const unassigned = useMemo(() => agents.filter((a) => !hospitalKey(a.hospital)), [agents]);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<CardSort>("agents");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [list, setList] = useState<{ scope: AgentScope; filter: AgentFilter; session: number } | null>(
    initialHospital ? { scope: { kind: "hospital", key: initialHospital }, filter: "all", session: 1 } : initialAgents ? { scope: { kind: "all" }, filter: "all", session: 1 } : null,
  );
  const [profile, setProfile] = useState<number | null>(initialAgent);
  const [adding, setAdding] = useState<{ hospital: string; session: number } | null>(null);

  if (!inScope) return <EmptyState title="No PR agents for this branch">The PR network currently belongs to BR001 (Abuja).</EmptyState>;

  const act = (id: number) => activity.get(id);
  const hospitalStats = (h: HospitalEntry) => {
    let referrals = 0;
    let revenue = 0;
    let active = 0;
    for (const id of h.agentIds) {
      const a = act(id);
      if (a) {
        referrals += a.referrals;
        revenue += a.revenue;
        active += 1;
      }
    }
    return { referrals, revenue, active };
  };
  const totals = [...activity.values()].reduce((s, a) => ({ referrals: s.referrals + a.referrals, revenue: s.revenue + a.revenue, commission: s.commission + a.commission }), { referrals: 0, revenue: 0, commission: 0 });
  const edited = Object.keys(agentEdits).length;
  const added = agents.filter((a) => a.source === "user").length;
  const flagged = directory.filter((h) => h.notes.length > 0).length;
  // Rank by agent count (stable, independent of filters).
  const rank = new Map([...directory].sort((a, b) => b.agentCount - a.agentCount || a.key.localeCompare(b.key)).map((h, i) => [h.key, i + 1]));

  const term = q.trim().toLowerCase();
  const agentHits = (h: HospitalEntry) => (term ? h.agentIds.filter((id) => byId.get(id)?.name.toLowerCase().includes(term)).length : 0);
  const shown = directory
    .filter((h) => !term || h.key.toLowerCase().includes(term) || h.rawVariants.some((r) => r.toLowerCase().includes(term)) || agentHits(h) > 0)
    .slice()
    .sort((a, b) => {
      if (sort === "name") return a.key.localeCompare(b.key);
      if (sort === "referrals") return hospitalStats(b).referrals - hospitalStats(a).referrals || b.agentCount - a.agentCount;
      return b.agentCount - a.agentCount || a.key.localeCompare(b.key);
    });
  const pages = Math.max(1, Math.ceil(shown.length / pageSize));
  const safe = Math.min(page, pages);
  const visible = shown.slice((safe - 1) * pageSize, safe * pageSize);
  const openList = (s: AgentScope, filter: AgentFilter = "all") => setList((l) => ({ scope: s, filter, session: (l?.session ?? 0) + 1 }));
  const maxAgents = Math.max(1, ...directory.map((h) => h.agentCount));

  return (
    <div className="inv pr">
      <SummaryChips
        items={[
          { label: "PR agents", icon: Handshake, value: formatCount(agents.length), caption: `${formatCount(agents.length - unassigned.length)} with a hospital${added ? ` · ${added} added` : ""}` },
          { label: "Partner hospitals", icon: Hospital, value: formatCount(directory.length), caption: flagged ? `${flagged} codes need review` : "From agent assignments" },
          { label: `Referrals · ${periodText}`, icon: TrendingUp, value: formatCount(totals.referrals), caption: `${formatCount(activity.size)} agents referred · ${money(totals.revenue, true)}` },
          { label: `Commission · ${periodText}`, icon: Percent, value: money(totals.commission), caption: "Placeholder rate until confirmed" },
        ]}
      />

      <div className="inv-toolbar">
        <SearchInput
          placeholder="Search hospitals or PR agents"
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
        />
        <div className="inv-smart" role="group" aria-label="Agent lists">
          <button type="button" onClick={() => openList({ kind: "all" })}>
            <Users size={15} /> All PR agents <b>{formatCount(agents.length)}</b>
          </button>
          <button type="button" onClick={() => openList({ kind: "unassigned" })}>
            <UserX size={15} /> No hospital <b>{formatCount(unassigned.length)}</b>
          </button>
          {edited > 0 && (
            <button type="button" onClick={() => openList({ kind: "all" }, "edited")}>
              <Pencil size={15} /> Edited <b>{edited}</b>
            </button>
          )}
        </div>
        <SelectMenu
          value={sort}
          ariaLabel="Sort hospitals"
          className="select-btn inv-sort"
          options={[
            { value: "agents", label: "Most PR agents" },
            { value: "referrals", label: "Most referrals" },
            { value: "name", label: "Hospital code A–Z" },
          ]}
          onChange={(v: CardSort) => {
            setSort(v);
            setPage(1);
          }}
        />
      </div>

      <section className="inv-section">
        <header className="inv-section-head">
          <h3>Partner hospitals</h3>
          <span>
            {formatCount(shown.length)} hospital{shown.length === 1 ? "" : "s"}
            {term ? ` matching “${q}”` : ""} · ranked by PR agents
          </span>
        </header>

        {shown.length === 0 ? (
          <div className="inv-empty">
            <EmptyState title={`No hospitals or agents match “${q}”`} />
          </div>
        ) : (
          <motion.div className="pr-grid" variants={m.staggerGroup} initial="hidden" animate="visible" key={`${term}|${sort}|${safe}|${pageSize}`}>
            {visible.map((h) => {
              const st = hospitalStats(h);
              const people = h.agentIds.map((id) => byId.get(id)).filter((a): a is AgentRecord => !!a);
              const lead = [...people].sort((a, b) => (act(b.id)?.referrals ?? 0) - (act(a.id)?.referrals ?? 0) || a.order - b.order);
              const hits = agentHits(h);
              const r = rank.get(h.key) ?? 0;
              return (
                <motion.button key={h.key} type="button" className={`pr-card ${r <= 3 ? "is-top" : ""}`} variants={m.revealItem} whileHover={m.cardHover} onClick={() => openList({ kind: "hospital", key: h.key })} aria-label={`${h.key}: ${h.agentCount} PR agents — view agents`}>
                  <div className="pr-card-head">
                    <span className="pr-mono" aria-hidden="true">
                      {monogram(h.key)}
                    </span>
                    <div className="pr-card-title">
                      <h3 title={h.key}>{h.key}</h3>
                      <p>{h.rawVariants.length > 1 ? `Recorded as ${h.rawVariants.join(", ")}` : "Partner hospital"}</p>
                    </div>
                    <span className="pr-rank" title={`Ranked #${r} by PR agents`}>
                      #{r}
                    </span>
                  </div>

                  <div className="pr-card-body">
                    <div className="pr-agents-big">
                      <strong className="num">{formatCount(h.agentCount)}</strong>
                      <span>PR agent{h.agentCount === 1 ? "" : "s"}</span>
                    </div>
                    <div className="pr-avatars" aria-hidden="true">
                      {lead.slice(0, 4).map((a) => (
                        <i key={a.id} title={a.name}>
                          {agentInitials(a.name)}
                        </i>
                      ))}
                      {people.length > 4 && <em>+{people.length - 4}</em>}
                    </div>
                    <div className="pr-card-bar" aria-hidden="true">
                      <i style={{ width: `${Math.max(3, (h.agentCount / maxAgents) * 100)}%` }} />
                    </div>
                    <dl className="pr-card-stats">
                      <div>
                        <dt>Referrals</dt>
                        <dd className="num">{formatCount(st.referrals)}</dd>
                      </div>
                      <div>
                        <dt>Active</dt>
                        <dd className="num">
                          {formatCount(st.active)}/{formatCount(h.agentCount)}
                        </dd>
                      </div>
                      <div>
                        <dt>Revenue</dt>
                        <dd className="num">{money(st.revenue, true)}</dd>
                      </div>
                    </dl>
                    {(hits > 0 || h.notes.length > 0) && (
                      <div className="inv-card-tags">
                        {hits > 0 && <em className="is-match">{hits} matching agent{hits === 1 ? "" : "s"}</em>}
                        {h.notes.length > 0 && <em className="is-warn">Code needs review</em>}
                      </div>
                    )}
                  </div>

                  <div className="inv-card-foot">
                    <span className="num">{lead[0] && act(lead[0].id) ? `Top: ${lead[0].name}` : `${periodText} · no referrals`}</span>
                    <span className="inv-card-go">
                      View agents <ArrowRight size={15} />
                    </span>
                  </div>
                </motion.button>
              );
            })}
            {safe === pages && !term && unassigned.length > 0 && (
              <motion.button type="button" className="pr-card is-unassigned" variants={m.revealItem} whileHover={m.cardHover} onClick={() => openList({ kind: "unassigned" })}>
                <div className="pr-card-head">
                  <span className="pr-mono" aria-hidden="true">
                    <UserX size={22} />
                  </span>
                  <div className="pr-card-title">
                    <h3>{NO_HOSPITAL}</h3>
                    <p>Agents without a hospital code</p>
                  </div>
                </div>
                <div className="pr-card-body">
                  <div className="pr-agents-big">
                    <strong className="num">{formatCount(unassigned.length)}</strong>
                    <span>PR agents</span>
                  </div>
                  <p className="pr-unassigned-note">Open the list to assign them to a hospital from their profile.</p>
                </div>
                <div className="inv-card-foot">
                  <span>Kept separate — never guessed into a hospital</span>
                  <span className="inv-card-go">
                    View agents <ArrowRight size={15} />
                  </span>
                </div>
              </motion.button>
            )}
          </motion.div>
        )}

        {shown.length > 0 && (
          <div className="pr-pager">
            <Pagination page={safe} pageSize={pageSize} sizes={[12, 24, 48]} total={shown.length} noun="hospitals" onPage={(p) => setPage(Math.min(Math.max(1, p), pages))} onPageSize={(s) => { setPageSize(s); setPage(1); }} />
          </div>
        )}
      </section>

      {list && (
        <AgentsModal
          key={list.session}
          scope={list.scope}
          initialFilter={list.filter}
          agents={agents}
          directory={directory}
          activity={activity}
          periodText={periodText}
          onClose={() => setList(null)}
          onOpenProfile={setProfile}
          onAdd={(hospital) => setAdding((a) => ({ hospital, session: (a?.session ?? 0) + 1 }))}
        />
      )}
      {profile !== null && byId.get(profile) && <AgentProfile key={profile} agent={byId.get(profile)!} directory={directory} activity={activity} periodText={periodText} onClose={() => setProfile(null)} />}
      {adding && (
        <AddAgentDialog key={adding.session} open onClose={() => setAdding(null)} initialHospital={adding.hospital} hospitals={directory.map((h) => ({ key: h.key, count: h.agentCount, raw: h.rawVariants }))} />
      )}
    </div>
  );
}

/* ─────────────── Agents pop-up (one hospital / unassigned / all) ─────────────── */

type AgentFilter = "all" | "referred" | "nophone" | "edited";
type AgentSort = "referrals" | "name" | "id";

function AgentsModal({
  scope,
  initialFilter,
  agents,
  directory,
  activity,
  periodText,
  onClose,
  onOpenProfile,
  onAdd,
}: {
  scope: AgentScope;
  initialFilter: AgentFilter;
  agents: AgentRecord[];
  directory: HospitalEntry[];
  activity: AgentActivity;
  periodText: string;
  onClose: () => void;
  onOpenProfile: (id: number) => void;
  onAdd: (hospital: string) => void;
}) {
  const { agentEdits } = useApp();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<AgentFilter>(initialFilter);
  const [sort, setSort] = useState<AgentSort>("referrals");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const entry = scope.kind === "hospital" ? directory.find((h) => h.key === scope.key) : undefined;
  const base = scope.kind === "all" ? agents : scope.kind === "unassigned" ? agents.filter((a) => !hospitalKey(a.hospital)) : agents.filter((a) => hospitalKey(a.hospital) === scope.key);
  const term = q.trim().toLowerCase();
  const isEdited = (a: AgentRecord) => !!agentEdits[a.id];
  const rows = base
    .filter((a) => {
      if (filter === "referred" && !activity.has(a.id)) return false;
      if (filter === "nophone" && hasPhone(a.phone)) return false;
      if (filter === "edited" && !isEdited(a) && a.source !== "user") return false;
      return !term || `${a.name} ${a.id} ${a.phone} ${a.hospital}`.toLowerCase().includes(term);
    })
    .slice()
    .sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "id") return a.id - b.id;
      return (activity.get(b.id)?.referrals ?? 0) - (activity.get(a.id)?.referrals ?? 0) || a.order - b.order;
    });
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safe = Math.min(page, pages);
  const visible = rows.slice((safe - 1) * pageSize, safe * pageSize);
  const referred = base.filter((a) => activity.has(a.id));
  const sum = referred.reduce((s, a) => ({ referrals: s.referrals + (activity.get(a.id)?.referrals ?? 0), revenue: s.revenue + (activity.get(a.id)?.revenue ?? 0), commission: s.commission + (activity.get(a.id)?.commission ?? 0) }), { referrals: 0, revenue: 0, commission: 0 });
  const title = scope.kind === "all" ? "All PR agents" : scope.kind === "unassigned" ? NO_HOSPITAL : scope.key;
  const reset = () => setPage(1);
  const showHospital = scope.kind === "all";

  return (
    <Modal
      open
      onClose={onClose}
      xl
      icon={scope.kind === "unassigned" ? UserX : scope.kind === "all" ? Users : Hospital}
      title={title}
      description={
        scope.kind === "hospital"
          ? `${formatCount(base.length)} PR agents${entry && entry.rawVariants.length > 1 ? ` · recorded as ${entry.rawVariants.join(", ")}` : ""} · ${periodText}`
          : `${formatCount(base.length)} PR agents · ${periodText}`
      }
      footer={
        <>
          <span className="left">Select an agent to see their profile, edit details or transfer them to another hospital.</span>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button onClick={() => onAdd(scope.kind === "hospital" ? scope.key : "")}>
            <Plus size={16} /> {scope.kind === "hospital" ? `Add agent to ${scope.key}` : "Add PR agent"}
          </Button>
        </>
      }
    >
      <SummaryChips
        items={[
          { label: "PR agents", icon: Handshake, value: formatCount(base.length), caption: `${formatCount(base.filter((a) => hasPhone(a.phone)).length)} with a phone number` },
          { label: `Referred · ${periodText}`, icon: TrendingUp, value: formatCount(referred.length), caption: `${formatCount(sum.referrals)} referrals` },
          { label: "Revenue generated", icon: Banknote, value: money(sum.revenue), caption: "Billed value of referred tests" },
          { label: "Commission", icon: Percent, value: money(sum.commission), caption: "Placeholder rate until confirmed" },
        ]}
      />

      <div className="inv-table-card">
        <div className="inv-table-tools">
          <SearchInput placeholder="Agent name, ID or phone" value={q} onChange={(v) => { setQ(v); reset(); }} />
          <Segmented
            label="Filter agents"
            value={filter}
            onChange={(v) => { setFilter(v); reset(); }}
            options={[
              { value: "all", label: "All" },
              { value: "referred", label: "Referred" },
              { value: "nophone", label: "No phone" },
              { value: "edited", label: "Edited" },
            ]}
          />
          <SelectMenu
            value={sort}
            ariaLabel="Sort agents"
            className="select-btn inv-sort"
            options={[
              { value: "referrals", label: "Most referrals" },
              { value: "name", label: "Name A–Z" },
              { value: "id", label: "Agent ID" },
            ]}
            onChange={(v: AgentSort) => { setSort(v); reset(); }}
          />
          <span className="inv-count">
            {formatCount(rows.length)} of {formatCount(base.length)}
          </span>
        </div>
        <div className="table-wrap thin-scroll">
          <table className="inv-table">
            <thead>
              <tr>
                <th>PR agent</th>
                {showHospital && <th>Hospital</th>}
                <th>Phone</th>
                <th className="right">Referrals</th>
                <th className="right">Revenue</th>
                <th className="right">Commission</th>
                <th className="right" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={showHospital ? 7 : 6}>
                    <EmptyState title={term ? `No agents match “${q}”` : "No agents in this view"} />
                  </td>
                </tr>
              ) : (
                visible.map((a) => {
                  const ac = activity.get(a.id);
                  const key = hospitalKey(a.hospital);
                  return (
                    <tr key={a.id} className="pr-row" onClick={() => onOpenProfile(a.id)}>
                      <td>
                        <div className="inv-svc">
                          <span className="inv-svc-avatar" aria-hidden="true">
                            {agentInitials(a.name)}
                          </span>
                          <div className="inv-svc-copy">
                            <span className="inv-name">
                              <strong>{a.name}</strong>
                              {a.source === "user" && <Badge tone="brand">Added</Badge>}
                              {isEdited(a) && <Badge tone="info">Edited</Badge>}
                            </span>
                            <small className="mono">#{a.id}</small>
                          </div>
                        </div>
                      </td>
                      {showHospital && <td>{key ? <span className="inv-cat-chip">{key}</span> : <span className="lg-muted">Unassigned</span>}</td>}
                      <td className="ep-nowrap">{hasPhone(a.phone) ? a.phone : <span className="lg-muted">N/A</span>}</td>
                      <td className="right num">
                        <strong>{formatCount(ac?.referrals ?? 0)}</strong>
                      </td>
                      <td className="right num ep-nowrap">{ac ? money(ac.revenue) : <span className="lg-muted">—</span>}</td>
                      <td className="right num ep-nowrap">{ac ? money(ac.commission) : <span className="lg-muted">—</span>}</td>
                      <td className="right">
                        <button
                          type="button"
                          className="inv-edit"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenProfile(a.id);
                          }}
                          aria-label={`View profile of ${a.name}`}
                        >
                          <UserRound size={15} />
                          <span>Profile</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={safe} pageSize={pageSize} sizes={[10, 25, 50]} total={rows.length} noun="PR agents" onPage={(p) => setPage(Math.min(Math.max(1, p), pages))} onPageSize={(s) => { setPageSize(s); setPage(1); }} />
      </div>
    </Modal>
  );
}

/* ─────────────── Agent profile (split layout, like the create dialogs) ─────────────── */

type ProfilePeriod = "today" | "yesterday" | "week" | "month" | "year" | "all" | "day";
type ProfileTab = "overview" | "patients" | "edit";

const PROFILE_PERIODS: { value: Exclude<ProfilePeriod, "day">; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
  { value: "all", label: "All time" },
];

function profileRange(p: ProfilePeriod, day: string): DateRange {
  if (p === "all") return { from: DATA_START, to: TODAY, days: diffDays(DATA_START, TODAY) + 1 };
  if (p === "day") return resolveRange({ key: "custom", from: day, to: day });
  return resolveRange({ key: p });
}

const inRange = (d: Date, r: DateRange) => d >= r.from && d < addDays(r.to, 1);

function AgentProfile({ agent, directory, onClose }: { agent: AgentRecord; directory: HospitalEntry[]; activity?: AgentActivity; periodText?: string; onClose: () => void }) {
  const { revertAgent, showToast, agentEdits } = useApp();
  const m = useMotionPreset();
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<ProfileTab>("overview");
  const [period, setPeriod] = useState<ProfilePeriod>("all");
  const [day, setDay] = useState(isoDate(TODAY));
  const [viewing, setViewing] = useState<PatientVisit | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const layers = document.querySelectorAll(".modal-layer");
      if (e.key === "Escape" && layers[layers.length - 1] === box.current?.parentElement) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Every patient this agent referred since records began (bills reconcile with commission).
  const allVisits = useMemo(() => patientVisits([LEGACY_BRANCH_ID], profileRange("all", "")).filter((v) => v.agentId === agent.id), [agent.id]);
  const monthRange = useMemo(() => resolveRange({ key: "month" }), []);
  const todayRange = useMemo(() => resolveRange({ key: "today" }), []);
  const selRange = useMemo(() => profileRange(period, day), [period, day]);
  const sumOf = (list: PatientVisit[]) => {
    const revenue = list.reduce((s, v) => s + v.billed, 0);
    return { patients: list.length, revenue, commission: revenue * DEMO_PR_COMMISSION_RATE };
  };
  const all = sumOf(allVisits);
  const month = sumOf(allVisits.filter((v) => inRange(v.at, monthRange)));
  const today = sumOf(allVisits.filter((v) => inRange(v.at, todayRange)));
  const selected = allVisits.filter((v) => inRange(v.at, selRange));
  const sel = sumOf(selected);
  const first = allVisits[allVisits.length - 1];

  const recorded = recordedAgent(agent.id);
  const edit = agentEdits[agent.id];
  const key = hospitalKey(agent.hospital);
  const recordedKey = recorded ? hospitalKey(recorded.hospital) : null;
  const transferred = !!recorded && recordedKey !== key;
  const branch = getBranch(LEGACY_BRANCH_ID);
  const periodName = period === "day" ? formatShortDate(selRange.from) : PROFILE_PERIODS.find((p) => p.value === period)?.label ?? "";

  const nav: { id: ProfileTab; label: string; icon: typeof UserRound; note: string }[] = [
    { id: "overview", label: "Overview", icon: TrendingUp, note: "Commission & revenue" },
    { id: "patients", label: "Referred patients", icon: Users, note: `${formatCount(all.patients)} since records began` },
    { id: "edit", label: "Edit profile", icon: Pencil, note: "Details & hospital transfer" },
  ];

  return createPortal(
    <>
    <AnimatePresence>
      <motion.div key="agent-profile" className="modal-layer fd-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <motion.div ref={box} className="fd ap" role="dialog" aria-modal="true" aria-labelledby={titleId} initial={m.modal.initial} animate={m.modal.animate} exit={m.modal.exit}>
          {/* Side panel */}
          <aside className="fd-side ap-side">
            <div className="ap-id">
              <span className="ap-avatar" aria-hidden="true">
                {agentInitials(agent.name)}
              </span>
              <strong>{agent.name}</strong>
              <small>PR agent #{agent.id}</small>
              <span className="ap-badges">
                {agent.source === "user" && <em>Added in app</em>}
                {edit && <em>Edited</em>}
                {transferred && <em>Transferred</em>}
              </span>
            </div>

            <ol className="fd-steps ap-nav" aria-label="Profile sections">
              {nav.map((n) => {
                const NIcon = n.icon;
                return (
                  <li key={n.id} className={tab === n.id ? "is-current" : ""}>
                    <button type="button" onClick={() => setTab(n.id)} aria-current={tab === n.id ? "page" : undefined}>
                      <span className="fd-step-dot" aria-hidden="true">
                        <NIcon size={16} />
                      </span>
                      <span className="fd-step-label">
                        {n.label}
                        <small>{n.note}</small>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>

            <div className="fd-aside">
              <div className="fd-preview">
                <span className="fd-preview-title">Contact & assignment</span>
                <div className="fd-preview-row">
                  <span>Phone</span>
                  <code>{hasPhone(agent.phone) ? agent.phone : "N/A"}</code>
                </div>
                <div className="fd-preview-row">
                  <span>Hospital</span>
                  <code className="is-code">{key || "None"}</code>
                </div>
                <div className="fd-preview-row">
                  <span>Branch</span>
                  <code>
                    {branch?.name} · {branch?.code}
                  </code>
                </div>
                <p>{transferred ? `Transferred from ${recordedKey || "no hospital"} (as recorded).` : first ? `First referral on ${formatShortDate(first.at)} ${first.at.getFullYear()}.` : "No referrals recorded yet."}</p>
              </div>
            </div>
          </aside>

          {/* Main */}
          <section className="fd-main">
            <header className="fd-head">
              <div>
                <span className="fd-eyebrow">PR agent profile · {key || "No hospital"}</span>
                <h2 id={titleId}>{tab === "edit" ? `Edit ${agent.name}` : tab === "patients" ? "Referred patients" : agent.name}</h2>
                <p>
                  {tab === "edit"
                    ? "Update contact details or transfer this agent to another hospital. The legacy record is never overwritten."
                    : "Commission and revenue come from the bills of the patients this agent referred. Select a patient to see their tests."}
                </p>
              </div>
              <button type="button" className="fd-close" onClick={onClose} aria-label="Close profile" data-close>
                <X size={20} />
              </button>
            </header>

            <div className="fd-body thin-scroll">
              {tab !== "edit" && (
                <>
                  {tab === "overview" && (
                    <section className="fd-section">
                      <h3 className="fd-section-title">
                        <span>At a glance</span>
                      </h3>
                      <SummaryChips
                        items={[
                          { label: "Commission · this month", icon: Percent, value: money(month.commission), caption: `So far · ${formatCount(month.patients)} referrals` },
                          { label: "Revenue · all time", icon: Banknote, value: money(all.revenue), caption: "Since records began (1 Jan)" },
                          { label: "Patients · all time", icon: Users, value: formatCount(all.patients), caption: `${money(all.commission, true)} commission overall` },
                          { label: "Today", icon: TrendingUp, value: formatCount(today.patients), caption: `${money(today.revenue, true)} · ${money(today.commission, true)} commission` },
                        ]}
                      />
                    </section>
                  )}

                  <section className="fd-section">
                    <h3 className="fd-section-title">
                      <span>Commission & referrals by period</span>
                    </h3>
                    <div className="ap-filter">
                      <Segmented label="Profile period" value={period === "day" ? ("custom" as Exclude<ProfilePeriod, "day">) : period} onChange={(v) => setPeriod(v)} options={PROFILE_PERIODS} />
                      <label className={`rf-date ${period === "day" ? "is-set" : ""}`}>
                        <CalendarDays size={16} />
                        <input
                          type="date"
                          aria-label="Pick a specific day"
                          value={period === "day" ? day : ""}
                          min={isoDate(DATA_START)}
                          max={isoDate(TODAY)}
                          onChange={(e) => {
                            if (!e.target.value) return;
                            setDay(e.target.value);
                            setPeriod("day");
                          }}
                        />
                      </label>
                    </div>
                    <dl className="ap-period">
                      <div>
                        <dt>Commission · {periodName}</dt>
                        <dd className="num">{money(sel.commission)}</dd>
                      </div>
                      <div>
                        <dt>Revenue generated</dt>
                        <dd className="num">{money(sel.revenue)}</dd>
                      </div>
                      <div>
                        <dt>Patients referred</dt>
                        <dd className="num">{formatCount(sel.patients)}</dd>
                      </div>
                      <div>
                        <dt>Average bill</dt>
                        <dd className="num">{sel.patients ? money(sel.revenue / sel.patients, true) : "—"}</dd>
                      </div>
                    </dl>
                  </section>

                  <section className="fd-section">
                    <h3 className="fd-section-title">
                      <span>Referred patients · {periodName}</span>
                    </h3>
                    <ReferredPatients visits={selected} onOpen={setViewing} />
                  </section>
                </>
              )}

              {tab === "edit" && <AgentEditForm agent={agent} directory={directory} transferred={transferred} recordedKey={recordedKey} onSaved={() => setTab("overview")} />}
            </div>

            <footer className="fd-foot">
              {tab === "edit" ? (
                <span className="left">Changes last for this session until the database is connected.</span>
              ) : (
                <span className="left">Commission uses the placeholder rate ({Math.round(DEMO_PR_COMMISSION_RATE * 100)}%) until the real rate is confirmed.</span>
              )}
              {edit && tab !== "edit" && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    revertAgent(agent.id);
                    showToast(`${recorded?.name ?? agent.name} restored to the recorded details`);
                  }}
                >
                  <RotateCcw size={15} /> Restore recorded details
                </Button>
              )}
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
              {tab !== "edit" && (
                <Button onClick={() => setTab("edit")}>
                  <Pencil size={16} /> Edit profile
                </Button>
              )}
            </footer>
          </section>
        </motion.div>
      </motion.div>
    </AnimatePresence>
    {viewing && <PatientRecordModal visit={viewing} onClose={() => setViewing(null)} />}
    </>,
    document.body,
  );
}

function ReferredPatients({ visits, onOpen }: { visits: PatientVisit[]; onOpen: (v: PatientVisit) => void }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const term = q.trim().toLowerCase();
  const rows = visits.filter((v) => !term || `${v.patientRef} ${v.id} ${v.services.map((s) => s.name).join(" ")}`.toLowerCase().includes(term));
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safe = Math.min(page, pages);
  const visible = rows.slice((safe - 1) * pageSize, safe * pageSize);
  return (
    <div className="inv-table-card">
      <div className="inv-table-tools">
        <SearchInput
          placeholder="Patient ref, visit ID or test"
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
        />
        <span className="inv-count">
          {formatCount(rows.length)} patient{rows.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="table-wrap thin-scroll">
        <table className="inv-table">
          <thead>
            <tr>
              <th>Date & time</th>
              <th>Patient</th>
              <th>Tests</th>
              <th className="right">Billed</th>
              <th className="right">Commission</th>
              <th>Payment</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <EmptyState title={term ? `No patients match “${q}”` : "No referred patients in this period"} />
                </td>
              </tr>
            ) : (
              visible.map((v) => (
                <tr key={v.id} className="pr-row" onClick={() => onOpen(v)} tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen(v))} aria-label={`Open visit record for ${v.patientRef}`}>
                  <td className="num ep-nowrap">
                    {formatShortDate(v.at)} · {formatTime(v.at)}
                  </td>
                  <td>
                    <span className="ep-patient">
                      <strong>{v.patientRef}</strong>
                      <Badge tone={v.isNew ? "brand" : "neutral"}>{v.isNew ? "New" : "Returning"}</Badge>
                    </span>
                    <small className="ep-sub mono">{v.id}</small>
                  </td>
                  <td>
                    {v.services[0]?.name ?? "—"}
                    {v.services.length > 1 && <span className="ep-more">+{v.services.length - 1} more</span>}
                  </td>
                  <td className="right num ep-nowrap">
                    <strong>{money(v.billed)}</strong>
                  </td>
                  <td className="right num ep-nowrap">{money(v.billed * DEMO_PR_COMMISSION_RATE)}</td>
                  <td>
                    <Badge tone={v.payment === "Paid" ? "ok" : v.payment === "Part-paid" ? "warn" : "danger"} dot>
                      {v.payment}
                    </Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={safe} pageSize={pageSize} sizes={[10, 25, 50]} total={rows.length} noun="patients" onPage={(p) => setPage(Math.min(Math.max(1, p), pages))} onPageSize={(s) => { setPageSize(s); setPage(1); }} />
    </div>
  );
}

function AgentEditForm({ agent, directory, transferred, recordedKey, onSaved }: { agent: AgentRecord; directory: HospitalEntry[]; transferred: boolean; recordedKey: string | null; onSaved: () => void }) {
  const { editAgent, showToast } = useApp();
  const key = hospitalKey(agent.hospital);
  const [name, setName] = useState(agent.name);
  const [phone, setPhone] = useState(hasPhone(agent.phone) ? agent.phone : "");
  const [hospital, setHospital] = useState(key);
  const options: SearchOption[] = [
    { value: "", label: NO_HOSPITAL, keywords: "none unassigned" },
    ...directory.map((h) => ({ value: h.key, label: h.key, description: `${h.agentCount} agent${h.agentCount === 1 ? "" : "s"}`, keywords: h.rawVariants.join(" ") })),
  ];
  const changed = name.trim() !== agent.name || (phone.trim() || "N/A") !== agent.phone || hospital !== key;
  return (
    <>
      <section className="fd-section">
        <h3 className="fd-section-title">
          <span>Agent details</span>
        </h3>
        <div className="fd-grid">
          <label className="fd-field full">
            <span className="fd-label">
              Full name <em aria-hidden="true">*</em>
            </span>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="fd-field">
            <span className="fd-label">
              Phone number <i>Optional</i>
            </span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Leave blank if unknown" inputMode="tel" />
            <small className="fd-hint">A blank phone is saved as “N/A”, matching the legacy convention.</small>
          </label>
          <div className="fd-field">
            <span className="fd-label">
              Assigned hospital <i>Optional</i>
            </span>
            <SearchSelect
              value={hospital}
              options={options}
              ariaLabel="Assigned hospital"
              placeholder={NO_HOSPITAL}
              searchPlaceholder="Search or type a new hospital code"
              allowCreate
              createLabel={(t) => `Use new hospital code “${t.toUpperCase()}”`}
              onChange={(v) => setHospital(v ? hospitalKey(v) : "")}
            />
            {transferred && <small className="fd-hint">Recorded hospital: {recordedKey || "none"}.</small>}
          </div>
        </div>
        {hospital !== key && (
          <p className="fd-note">
            Transfer: <b>{key || NO_HOSPITAL}</b> → <b>{hospital || NO_HOSPITAL}</b>. The agent moves to the new hospital's list straight away.
          </p>
        )}
      </section>
      <div className="ap-save">
        <Button
          disabled={!name.trim() || !changed}
          onClick={() => {
            editAgent(agent.id, { name, phone, hospital });
            showToast(hospital !== key ? `${name.trim()} transferred to ${hospital || "no hospital"}` : `${name.trim()} updated`);
            onSaved();
          }}
        >
          Save changes
        </Button>
      </div>
    </>
  );
}
