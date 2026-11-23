/**
 * Settings → Report an issue (every account). The conversation itself lives in
 * STANLEY AI (sidebar "Report an issue", or the floating STANLEY icon) — this
 * section opens it and lists the issues people have reported.
 */
import { useMemo, useState } from "react";
import { ArrowRight, MessageSquareWarning } from "lucide-react";
import { useApp } from "@/app/AppState";
import { pageById, updateIssue, useIssues, type IssueReport } from "@/services/recovery/helpdesk";
import { Button } from "@/shared/ui/controls";
import { DeveloperDialog, dtLong } from "./SystemHealth";

export function ReportIssueSection() {
  const { user, navigate } = useApp();
  const [dev, setDev] = useState<string | null>(null);
  const base = user.kind !== "admin" && user.branchId ? `/branch/${user.branchId}` : "";
  return (
    <div className="ri-stack">
      <section className="ri-compose ri-launch">
        <span className="hs-hero-icon" aria-hidden="true">
          <MessageSquareWarning size={24} />
        </span>
        <div>
          <label>Report an issue</label>
          <p>Describe what's wrong — or what you're looking for — in your own words. STANLEY points you to the right page, shows the steps, or runs a real check (it even opens a hidden test copy of the page) and explains how to fix it. Also on the sidebar and the floating STANLEY icon.</p>
        </div>
        <Button onClick={() => navigate(`${base}/support`)}>
          Open Report an issue <ArrowRight size={15} />
        </Button>
      </section>
      <IssueLog onOpen={(r) => r.report && setDev(r.report)} />
      {dev && <DeveloperDialog text={dev} onClose={() => setDev(null)} />}
    </div>
  );
}

/* ─────────────── Reported issues ─────────────── */

const STATUS_LABEL: Record<IssueReport["status"], string> = { solved: "Solved", open: "Open", developer: "Sent to developer" };

export function IssueLog({ onOpen }: { onOpen: (r: IssueReport) => void }) {
  const { user } = useApp();
  const all = useIssues();
  // Company Admin: everyone's. Manager: the branch's. Front desk: their own.
  const list = useMemo(() => all.filter((r) => (user.kind === "admin" ? true : user.kind === "manager" ? r.branchId === user.branchId : r.by === user.name)), [all, user]);
  if (!list.length) return null;
  return (
    <section className="sc-panel">
      <header>
        <div>
          <h4>{user.kind === "admin" ? "Issues reported across STANLEY" : user.kind === "manager" ? "Issues reported at this branch" : "Your reported issues"}</h4>
          <p>What people ran into, what STANLEY answered, and what still needs the developer. The last 60 are kept.</p>
        </div>
      </header>
      <table className="bp-table hs-table">
        <thead>
          <tr>
            <th>When</th>
            {user.kind !== "staff" && <th>Who</th>}
            <th>What they said</th>
            <th>STANLEY's answer</th>
            <th>Status</th>
            <th className="right" />
          </tr>
        </thead>
        <tbody>
          {list.slice(0, 20).map((r) => (
            <tr key={r.id}>
              <td className="nowrap">{dtLong(r.at)}</td>
              {user.kind !== "staff" && (
                <td>
                  {r.by}
                  <small className="hs-muted"> · {r.role}</small>
                </td>
              )}
              <td>“{r.message}”</td>
              <td>{r.answer ?? (r.intent === "find" && r.page ? `Where to find ${pageById(r.page)?.label ?? r.page}` : "—")}</td>
              <td>
                <span className={`ri-status is-${r.status}`}>{STATUS_LABEL[r.status]}</span>
              </td>
              <td className="right">
                {r.status === "open" && (
                  <Button size="sm" variant="ghost" onClick={() => updateIssue(r.id, { status: "solved" })}>
                    Mark solved
                  </Button>
                )}
                {r.report && (
                  <Button size="sm" variant="ghost" onClick={() => onOpen(r)}>
                    Report
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
