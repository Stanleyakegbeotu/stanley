/**
 * Settings → Branch Monitoring: the health of every branch and a side-by-side
 * comparison. Figures come from the same sources as the dashboards (demo
 * activity for the legacy branch, bills saved in STANLEY, live drafts,
 * expenses and the audit log) — a new branch shows zero until it bills.
 */
import { useMemo, useState } from "react";
import { ExternalLink, Settings2 } from "lucide-react";
import { useApp } from "@/app/AppState";
import type { PeriodSelection } from "@/data/types";
import { resolveRange, summarize } from "@/services/analytics";
import { useBilling } from "@/services/billing";
import { formatCount, formatMoney } from "@/shared/format";
import { Badge, Button, Segmented } from "@/shared/ui/controls";
import { rangeText } from "@/features/dashboard/WelcomeBanner";
import { useOrgFacts } from "./orgData";
import { STATUS_TONE } from "./Branches";
import { Panel, StatusChip, dateTime } from "./ui";

const PERIODS: { value: PeriodSelection["key"]; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
];

export function MonitoringSection({ go }: { go: (section: string) => void }) {
  const { navigate } = useApp();
  const f = useOrgFacts();
  const billing = useBilling();
  const [key, setKey] = useState<PeriodSelection["key"]>("month");
  const range = useMemo(() => resolveRange({ key }), [key]);
  const todayRange = useMemo(() => resolveRange({ key: "today" }), []);

  const rows = useMemo(
    () =>
      f.perBranch.map((b) => {
        const s = summarize([b.branch.id], range);
        const t = summarize([b.branch.id], todayRange);
        const from = range.from.getTime();
        const to = range.to.getTime() + 86_400_000;
        const stanleyBills = billing.orders.filter((o) => o.branchId === b.branch.id && new Date(o.createdAt).getTime() >= from && new Date(o.createdAt).getTime() < to).length;
        return { ...b, s, t, stanleyBills };
      }),
    [f.perBranch, range, todayRange, billing.orders],
  );

  return (
    <div className="sc-stack">
      <div className="sc-mon-grid">
        {rows.map((r) => (
          <article key={r.branch.id} className={`card sc-mon is-${r.health.tone}`}>
            <header>
              <div>
                <h4>{r.branch.name} branch</h4>
                <small className="mono">
                  {r.branch.code} · {r.branch.idCode ?? "—"}
                </small>
              </div>
              <StatusChip status={r.health.tone}>{r.health.label}</StatusChip>
            </header>
            <dl>
              <div>
                <dt>Status</dt>
                <dd>
                  <Badge tone={STATUS_TONE[r.branch.status]} dot>
                    {r.branch.status}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt>Manager</dt>
                <dd>{r.manager?.name ?? <span className="sc-missing">Not assigned</span>}</dd>
              </div>
              <div>
                <dt>Staff</dt>
                <dd>
                  {r.activeStaff} active · {r.staff.length} total
                </dd>
              </div>
              <div>
                <dt>Patients today</dt>
                <dd className="num">{formatCount(r.t.patients)}</dd>
              </div>
              <div>
                <dt>Money in today</dt>
                <dd className="num">{formatMoney(r.t.payments.NGN ?? 0, "NGN")}</dd>
              </div>
              <div>
                <dt>Bills saved today</dt>
                <dd className="num">{formatCount(r.billsToday)}</dd>
              </div>
              <div>
                <dt>Pending approvals</dt>
                <dd className="num">{formatCount(r.pendingExpenses)}</dd>
              </div>
              <div>
                <dt>Unfinished bills</dt>
                <dd className="num">{formatCount(r.drafts)}</dd>
              </div>
              <div>
                <dt>Waiting to sync</dt>
                <dd className="num" title="Saved on this device — the cloud database isn't connected yet">
                  {formatCount(r.queued)}
                </dd>
              </div>
              <div className="is-wide">
                <dt>Last activity</dt>
                <dd>{r.lastActivity ? `${r.lastActivity.action} · ${r.lastActivity.user} · ${dateTime(r.lastActivity.at)}` : "No activity recorded yet"}</dd>
              </div>
            </dl>
            {r.gaps.length > 0 && <div className="sc-gaps">Issues: {r.gaps.join(" · ")}</div>}
            <footer>
              <Button size="sm" variant="secondary" onClick={() => go("branches")}>
                <Settings2 size={14} /> Manage
              </Button>
              {r.branch.status === "Active" && (
                <Button size="sm" variant="secondary" onClick={() => navigate(`/branch/${r.branch.id}/dashboard`)}>
                  <ExternalLink size={14} /> Open workspace
                </Button>
              )}
            </footer>
          </article>
        ))}
      </div>

      <Panel title="Compare branches" note={`${rangeText(range)} · patients, billing and approvals side by side`} actions={<Segmented label="Comparison period" value={key} onChange={(v) => setKey(v)} options={PERIODS} />}>
        <div className="table-wrap thin-scroll">
          <table className="bp-table rf-table sc-table" aria-label="Branch comparison">
            <thead>
              <tr>
                <th>Branch</th>
                <th className="right">Patients</th>
                <th className="right">Bills</th>
                <th className="right">Billed</th>
                <th className="right">Money in</th>
                <th className="right">Referred</th>
                <th className="right">Still owed</th>
                <th className="right">Saved in STANLEY</th>
                <th className="right">Pending approvals</th>
                <th className="right">Staff</th>
                <th>Health</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.branch.id}>
                  <td>
                    <strong>{r.branch.name}</strong>
                    <small className="ep-sub">{r.branch.status}</small>
                  </td>
                  <td className="right num">{formatCount(r.s.patients)}</td>
                  <td className="right num">{formatCount(r.s.transactions)}</td>
                  <td className="right num">{formatMoney(r.s.revenue.NGN ?? 0, "NGN", true)}</td>
                  <td className="right num">{formatMoney(r.s.payments.NGN ?? 0, "NGN", true)}</td>
                  <td className="right num">{formatCount(r.s.referrals)}</td>
                  <td className="right num">{formatMoney(r.s.outstanding.NGN ?? 0, "NGN", true)}</td>
                  <td className="right num">{formatCount(r.stanleyBills)}</td>
                  <td className="right num">{formatCount(r.pendingExpenses)}</td>
                  <td className="right num">{formatCount(r.activeStaff)}</td>
                  <td>
                    <StatusChip status={r.health.tone}>{r.health.label}</StatusChip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="lg-muted">Patients, billed, money in, referred and still owed use the same figures as the dashboards (the Abuja branch runs on demonstration activity); "Saved in STANLEY" counts bills made in the app. Branches added in STANLEY have no invented activity.</p>
      </Panel>
    </div>
  );
}
