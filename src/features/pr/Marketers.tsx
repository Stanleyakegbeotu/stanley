/**
 * Marketers (owner, 2026-11-26), for the Branch Manager and the Company Admin
 * in PR Management: each marketer's month against their target, who owns
 * which hospital (with a fair split to confirm when someone leaves or joins),
 * new partner hospitals waiting for a decision, and each marketer's work.
 * The marketers themselves use the mobile app (services/marketing).
 */
import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Building2, Check, ClipboardCheck, Hospital, Scale, Target, UserPlus, Users, X } from "lucide-react";
import { useApp } from "@/app/AppState";
import { LEGACY_BRANCH_ID } from "@/data/legacy";
import { getBranch } from "@/data/company";
import { logAudit } from "@/services/audit";
import { useCheckUps } from "@/services/agentMonitor";
import { staffKey, useAccountAccess } from "@/services/accountAccess";
import { can } from "@/services/permissions";
import { ENTRY_TEXT, applyMoves, decidePartner, hospitalFigures, hospitalsOf, marketersOf, monthKey, monthName, monthRange, paceWord, progressFor, setHospitalOwner, setTarget, shiftMonth, suggestSplit, useMarketing, type HospitalInfo, type Move, type Progress } from "@/services/marketing";
import type { StaffRecord } from "@/data/userRecords";
import { formatCount, formatMoney } from "@/shared/format";
import { Badge, Button, EmptyState, SelectMenu } from "@/shared/ui/controls";
import { Modal } from "@/shared/ui/Modal";

const initials = (n: string) =>
  n
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
const agentsText = (n: number) => `${formatCount(n)} agent${n === 1 ? "" : "s"}`;
const when = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) + " · " + new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

export function TargetBar({ p, money }: { p: Progress; money: (n: number) => string }) {
  const pct = Math.min(1, p.pct);
  return (
    <span className="mk-bar" title={`${Math.round(p.pct * 100)}% of the target · even pace by today: ${Math.round(p.pace * 100)}%`}>
      <span className="mk-bar-text">
        <b className="num">{money(p.revenue)}</b> / {money(p.target)}
        <em>{Math.round(p.pct * 100)}%</em>
      </span>
      <span className="mk-bar-track">
        <i style={{ width: `${pct * 100}%` }} className={p.pct >= 1 ? "is-done" : p.pct >= p.pace ? "is-ok" : p.pct >= p.pace * 0.8 ? "is-warn" : "is-bad"} />
        {p.pace < 1 && <span className="mk-bar-pace" style={{ left: `${p.pace * 100}%` }} />}
      </span>
    </span>
  );
}

export function SplitDialog({ branchId, mode, hospitals, marketers, onClose }: { branchId: string; mode: "fill" | "even"; hospitals: HospitalInfo[]; marketers: StaffRecord[]; onClose: () => void }) {
  const { user, showToast } = useApp();
  const active = marketers.filter((m) => m.status === "Active");
  const moves: Move[] = useMemo(() => suggestSplit(hospitals, active.map((m) => m.id), mode === "even"), [hospitals, active, mode]);
  const nameOf = (id: string | null) => (id ? (marketers.find((m) => m.id === id)?.name ?? "A former marketer") : "No marketer");
  const load = new Map(active.map((m) => [m.id, 0]));
  for (const h of hospitals) {
    const owner = moves.find((x) => x.hospital === h.key)?.to ?? h.owner?.marketerId;
    if (owner && load.has(owner)) load.set(owner, load.get(owner)! + h.agentIds.length);
  }
  return (
    <Modal
      open
      wide
      onClose={onClose}
      icon={Scale}
      title={mode === "fill" ? "Share out the hospitals without a marketer" : "Even out the split"}
      description={mode === "fill" ? "Each goes to the marketer with the fewest PR agents so far. Check it, then confirm." : "Whole hospitals move from the busiest marketers to the lightest until the PR agents are shared fairly. Check it, then confirm."}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!moves.length}
            onClick={() => {
              applyMoves(branchId, moves, user.name, mode === "fill" ? "Fair split: hospitals without a marketer" : "Fair split: evened out");
              logAudit({ category: "PR agents", action: "Hospitals shared out to marketers", record: `${moves.length} hospitals`, details: moves.map((m) => `${m.hospital} → ${nameOf(m.to)}`).join(", "), branchId });
              showToast(`${moves.length} hospital${moves.length === 1 ? "" : "s"} given to marketers`);
              onClose();
            }}
          >
            <Check size={15} /> Confirm {moves.length} change{moves.length === 1 ? "" : "s"}
          </Button>
        </>
      }
    >
      {moves.length ? (
        <>
          <ul className="mk-moves">
            {moves.map((m) => (
              <li key={m.hospital}>
                <span className="inv-cat-chip">{m.hospital}</span>
                <small>{agentsText(m.agents)}</small>
                <span className="mk-move">
                  {nameOf(m.from)} <ArrowRight size={13} /> <b>{nameOf(m.to)}</b>
                </span>
              </li>
            ))}
          </ul>
          <p className="mk-loads">
            After this:{" "}
            {active.map((m, i) => (
              <span key={m.id}>
                {i > 0 && " · "}
                {m.name.split(" ")[0]} <b>{formatCount(load.get(m.id) ?? 0)}</b> agents
              </span>
            ))}
          </p>
        </>
      ) : (
        <EmptyState title="Nothing to change">The split is already as fair as whole hospitals allow.</EmptyState>
      )}
    </Modal>
  );
}
