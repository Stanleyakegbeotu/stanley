/**
 * Patients of one branch (Company Admin view — read only).
 *
 *  • KPI cards: patients and visits in the selected period, amount generated,
 *    and every patient on record at the branch.
 *  • Filters: quick periods, or any back-dated day / date range since records
 *    began, plus patient type and search.
 *  • Table: one row per patient seen in the period. Selecting a row opens the
 *    shared patient visit record (the same card used everywhere in the app).
 *
 * Admins cannot register patients or create bills — that is branch staff work.
 * Patients are anonymous references (no patient records were exported).
 */
import { useMemo, useState } from "react";
import { Banknote, ClipboardList, UserRound, Users } from "lucide-react";
import { useApp } from "@/app/AppState";
import { getBranch } from "@/data/company";
import type { PeriodSelection } from "@/data/types";
import { findVisit, patientsOnRecord, recordVisits, type PatientVisit } from "@/data/demo/dailyLines";
import { useBilling } from "@/services/billing";
import { isoDate } from "@/data/demo/generator";
import { formatCount, formatMoney, formatShortDate, formatTime } from "@/shared/format";
import { Badge, EmptyState, Segmented, SelectMenu } from "@/shared/ui/controls";
import { Pagination } from "@/shared/ui/Pagination";
import { periodLabel } from "@/services/analytics";
import { FilterBar, SummaryChips, useModalFilters } from "@/features/dashboard/ExpensesPatients";
import { rangeText } from "@/features/dashboard/WelcomeBanner";
import { PatientRecordModal } from "@/features/shared/PatientRecord";

type PatientType = "all" | "new" | "returning" | "referred" | "balance";
type PatientSort = "recent" | "visits" | "billed" | "balance";

interface PatientRow {
  ref: string;
  name: string;
  /** Visits in the selected period, newest first. */
  visits: PatientVisit[];
  latest: PatientVisit;
  billed: number;
  paid: number;
  tests: number;
  /** First-ever visit falls inside the period. */
  isNew: boolean;
  /** Most recent referrer in the period, if any. */
  agentId: number | null;
}

const BASE_PERIOD: PeriodSelection = { key: "today" };

function groupByPatient(visits: PatientVisit[]): PatientRow[] {
  const map = new Map<string, PatientRow>();
  // `visits` arrive newest first, so the first visit seen per patient is the latest.
  for (const v of visits) {
    const row = map.get(v.patientRef);
    if (!row) {
      map.set(v.patientRef, { ref: v.patientRef, name: v.patientName, visits: [v], latest: v, billed: v.billed, paid: v.paid, tests: v.services.length, isNew: v.isNew, agentId: v.agentId });
    } else {
      row.visits.push(v);
      row.billed += v.billed;
      row.paid += v.paid;
      row.tests += v.services.length;
      row.isNew ||= v.isNew;
      row.agentId ??= v.agentId;
    }
  }
  return [...map.values()];
}

export function PatientDirectory({
  branchId,
  initialQuery = "",
  initialVisitId = null,
}: {
  branchId: string;
  initialQuery?: string;
  /** Open this visit record, on its own day (notification links). */
  initialVisitId?: string | null;
}) {
  const { agents } = useApp();
  const branch = getBranch(branchId);
  const c = branch?.currency ?? "NGN";
  const ids = useMemo(() => [branchId], [branchId]);
  const f = useModalFilters(BASE_PERIOD, ids);
  const [type, setType] = useState<PatientType>("all");
  const [sort, setSort] = useState<PatientSort>("recent");
  const [viewing, setViewing] = useState<PatientVisit | null>(null);
  // Seed the search from a deep link (e.g. global search) once.
  const [seeded, setSeeded] = useState(false);
  if (!seeded) {
    setSeeded(true);
    if (initialQuery) f.setQ(initialQuery);
    const v = initialVisitId ? findVisit(branchId, initialVisitId) : null;
    if (v) {
      const day = isoDate(v.at);
      f.setPeriod({ key: "custom", from: day, to: day });
      setViewing(v);
    }
  }

  const agentName = useMemo(() => {
    const map = new Map(agents.map((a) => [a.id, a.name]));
    return (id: number | null) => (id === null ? null : (map.get(id) ?? `PR agent #${id}`));
  }, [agents]);

  // Demo activity + every bill saved in STANLEY (refreshes when a bill is saved).
  const billing = useBilling();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const visits = useMemo(() => recordVisits(ids, f.range), [ids, f.range, billing.orders]);
  const patients = useMemo(() => groupByPatient(visits), [visits]);
  // Demo patients on record + patients registered through STANLEY billing.
  const onRecord = useMemo(() => {
    const demo = patientsOnRecord(branchId);
    const billed = billing.patients.filter((p) => p.branchId === branchId).length;
    return { total: demo.total + billed, registered: demo.registered + billed };
  }, [branchId, billing.patients]);

  const label = f.period.key === "custom" ? (f.isDay ? formatShortDate(f.range.from) : "Selected dates") : periodLabel(f.period);
  const multiDay = f.range.days > 1;

  // KPI figures for the whole period (independent of type filter and search).
  const billed = visits.reduce((s, v) => s + v.billed, 0);
  const paid = visits.reduce((s, v) => s + v.paid, 0);
  const tests = visits.reduce((s, v) => s + v.services.length, 0);
  const referred = visits.filter((v) => v.agentId !== null).length;
  const newCount = patients.filter((p) => p.isNew).length;

  const needle = f.q.trim().toLowerCase();
  const rows = patients
    .filter((p) => {
      if (type === "new" && !p.isNew) return false;
      if (type === "returning" && p.isNew) return false;
      if (type === "referred" && !p.visits.some((v) => v.agentId !== null)) return false;
      if (type === "balance" && p.billed - p.paid <= 0) return false;
      if (!needle) return true;
      return p.visits
        .flatMap((v) => [v.id, v.services.map((s) => s.name).join(" "), agentName(v.agentId) ?? ""])
        .concat(p.ref, p.name)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    })
    .sort((a, b) => {
      if (sort === "visits") return b.visits.length - a.visits.length || b.latest.at.getTime() - a.latest.at.getTime();
      if (sort === "billed") return b.billed - a.billed;
      if (sort === "balance") return b.billed - b.paid - (a.billed - a.paid);
      return b.latest.at.getTime() - a.latest.at.getTime();
    });
  const pages = Math.max(1, Math.ceil(rows.length / f.pageSize));
  const page = Math.min(f.page, pages);
  const visible = rows.slice((page - 1) * f.pageSize, page * f.pageSize);
  const money = (n: number, compact = false) => formatMoney(n, c, compact);
  const open = (p: PatientRow) => setViewing(p.latest);

  return (
    <div className="inv">
      <SummaryChips
        items={[
          { label: `Patients · ${label}`, icon: UserRound, value: formatCount(patients.length), caption: `${formatCount(newCount)} new · ${formatCount(patients.length - newCount)} returning` },
          { label: "Patients on record", icon: Users, value: formatCount(onRecord.total), caption: `Since records began · ${formatCount(onRecord.registered)} newly registered` },
          { label: `Amount generated · ${label}`, icon: Banknote, value: money(billed), caption: `${money(paid, true)} paid · ${money(billed - paid, true)} outstanding` },
          { label: `Patient visits · ${label}`, icon: ClipboardList, value: formatCount(visits.length), caption: `${formatCount(tests)} tests · ${formatCount(referred)} referred` },
        ]}
      />

      <FilterBar
        f={f}
        basePeriod={BASE_PERIOD}
        branchSelect={false}
        allowRange
        searchPlaceholder="Patient name, ID, visit no., test or referrer"
        dirty={type !== "all"}
        onReset={() => {
          f.setPeriod(BASE_PERIOD);
          f.setQ("");
          setType("all");
          f.setPage(1);
        }}
        extra={
          <div className="rf-filter">
            <span>Patients</span>
            <Segmented
              label="Patient type"
              value={type}
              onChange={(v) => {
                setType(v);
                f.setPage(1);
              }}
              options={[
                { value: "all", label: "All" },
                { value: "new", label: "New" },
                { value: "returning", label: "Returning" },
                { value: "referred", label: "Referred" },
                { value: "balance", label: "Owing" },
              ]}
            />
          </div>
        }
      />

      <section className="inv-section">
        <header className="inv-section-head">
          <h3>Patients · {label}</h3>
          <span>
            {rangeText(f.range)} · {formatCount(rows.length)} patient{rows.length === 1 ? "" : "s"}
            {needle ? ` matching “${f.q}”` : ""} · select a patient to open their visit record
          </span>
        </header>

        <div className="card bp-card rf-table-card">
          <div className="inv-table-tools">
            <span className="inv-count">
              {formatCount(rows.length)} of {formatCount(patients.length)} patients
            </span>
            <SelectMenu
              value={sort}
              ariaLabel="Sort patients"
              className="select-btn inv-sort"
              options={[
                { value: "recent", label: "Most recent visit" },
                { value: "visits", label: "Most visits" },
                { value: "billed", label: "Highest billed" },
                { value: "balance", label: "Largest balance" },
              ]}
              onChange={(v: PatientSort) => {
                setSort(v);
                f.setPage(1);
              }}
            />
          </div>
          <div className="table-wrap thin-scroll">
            <table className="bp-table rf-table ep-table" aria-label={`Patients · ${label}`}>
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>{multiDay ? "Last visit" : "Arrived"}</th>
                  <th className="right">Visits</th>
                  <th>Latest tests</th>
                  <th>Referred by</th>
                  <th className="right">Billed</th>
                  <th className="right">Balance</th>
                  <th>Payment</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <EmptyState title={needle || type !== "all" ? "No patients match these filters" : "No patients in this period"} />
                    </td>
                  </tr>
                ) : (
                  visible.map((p) => {
                    const v = p.latest;
                    const balance = p.billed - p.paid;
                    const ref = agentName(p.agentId);
                    return (
                      <tr
                        key={p.ref}
                        className="pr-row"
                        tabIndex={0}
                        onClick={() => open(p)}
                        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), open(p))}
                        aria-label={`Open visit record for ${p.name}`}
                      >
                        <td>
                          <span className="ep-patient">
                            <strong>{p.name}</strong>
                            <Badge tone={p.isNew ? "brand" : "neutral"}>{p.isNew ? "New" : "Returning"}</Badge>
                          </span>
                          <small className="ep-sub mono">
                            {p.ref} · {v.id}
                          </small>
                        </td>
                        <td className="num ep-nowrap">{multiDay ? `${formatShortDate(v.at)} · ${formatTime(v.at)}` : formatTime(v.at)}</td>
                        <td className="right num">{formatCount(p.visits.length)}</td>
                        <td className="ep-services" title={v.services.map((s) => `${s.name} — ${money(s.price)}`).join("\n")}>
                          {v.services[0]?.name ?? "—"}
                          {v.services.length > 1 && <span className="ep-more">+{v.services.length - 1} more</span>}
                          <small className="ep-sub">
                            {formatCount(p.tests)} test{p.tests === 1 ? "" : "s"} in period
                          </small>
                        </td>
                        <td>{ref ?? <span className="lg-muted">Walk-in</span>}</td>
                        <td className="right num strong ep-nowrap">{money(p.billed)}</td>
                        <td className={`right num ep-nowrap ${balance > 0 ? "is-due" : ""}`}>{balance > 0 ? money(balance) : "—"}</td>
                        <td>
                          {/* Status over every visit in the period, so it always agrees with Balance. */}
                          <Badge tone={balance <= 0 ? "ok" : p.paid > 0 ? "warn" : "danger"} dot>
                            {balance <= 0 ? "Paid" : p.paid > 0 ? "Part-paid" : "Unpaid"}
                          </Badge>
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
            noun="patients"
            onPage={(n) => f.setPage(Math.min(Math.max(1, n), pages))}
            onPageSize={(s) => {
              f.setPageSize(s);
              f.setPage(1);
            }}
          />
        </div>
      </section>

      <p className="lg-muted" style={{ fontSize: 13 }}>
        Read-only for Company Admin — patients are registered and billed by branch managers and staff. Demonstration visits built from the real catalogue, prices and PR agents; patients are anonymous references.
      </p>

      {viewing && <PatientRecordModal visit={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
