/**
 * "Welcome back" (owner, 2026-11-22): shown once when STANLEY opens after an
 * unexpected shutdown (power cut, computer switched off, browser forced
 * closed), after saved data was repaired, or when the clock went backwards.
 * Tells people in plain words what happened, what was checked, and puts their
 * unfinished bills one click away.
 *
 * Also: the live banner when saving to this computer fails (storage full or
 * blocked), so nobody keeps typing into work that isn't being saved.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, Check, Clock3, FilePenLine, HardDriveDownload, PlugZap, ShieldCheck, X } from "lucide-react";
import { useApp } from "@/app/AppState";
import { useBilling } from "@/services/billing";
import { startupReport } from "@/services/recovery/startup";
import { clearSaveFailure, routeArea, useLiveSignals } from "@/services/recovery/health";
import { STORES, storeLabel } from "@/services/recovery/stores";
import { Button } from "@/shared/ui/controls";
import { Modal } from "@/shared/ui/Modal";

const dt = (d: Date | string) => new Date(d).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

let shownThisRun = false;

export function WelcomeBack() {
  const { user, navigate } = useApp();
  const billing = useBilling();
  const report = startupReport();
  const [open, setOpen] = useState(() => !shownThisRun && !!(report.shutdown || report.repairs.length || report.clock || report.storageBlocked));
  const branchId = user.kind === "admin" ? null : (user.branchId ?? null);
  // Unfinished bills this person can continue, newest first.
  const drafts = useMemo(
    () =>
      billing.drafts
        .filter((d) => !branchId || d.branchId === branchId)
        .sort((a, b) => (b.lastSaved ?? b.startedAt).localeCompare(a.lastSaved ?? a.startedAt))
        .slice(0, 5),
    [billing.drafts, branchId],
  );
  if (!open) return null;
  const close = () => {
    shownThisRun = true;
    setOpen(false);
  };
  const settingsPath = branchId ? `/branch/${branchId}/settings?section=health` : "/settings?section=health";

  return (
    <Modal open onClose={close} wide title={report.shutdown ? "Welcome back — STANLEY closed unexpectedly" : "STANLEY checked your data"} description={report.shutdown ? `It stopped at ${dt(report.shutdown.lastSeen)} without closing normally — usually a power cut, the computer switching off, or the browser being forced closed.` : "Here's what was found when STANLEY opened."}>
      <ul className="rc-findings">
        {report.storageBlocked ? (
          <li className="is-bad">
            <AlertTriangle size={16} />
            <span>
              <b>This browser is blocking STANLEY from saving.</b> Close this window and open STANLEY in a normal (not private) window, or nothing you do will be kept.
            </span>
          </li>
        ) : report.repairs.length === 0 ? (
          <li className="is-ok">
            <ShieldCheck size={16} />
            <span>
              <b>All saved data was checked and is fine</b> ({report.checked} store{report.checked === 1 ? "" : "s"}). Nothing was lost.
            </span>
          </li>
        ) : (
          report.repairs.map((r) => (
            <li key={r.key} className={r.outcome === "restored" ? "is-fixed" : "is-bad"}>
              {r.outcome === "restored" ? <Check size={16} /> : <AlertTriangle size={16} />}
              <span>
                <b>{storeLabel(r.key)}</b>{" "}
                {r.outcome === "restored"
                  ? `couldn't be read (damaged while saving), so it was repaired from the backup of ${dt(r.backupAt!)}. Check the latest entries in ${STORES[r.key]?.pages ?? "that area"} — anything after that time may need entering again.`
                  : `couldn't be read and no backup had a good copy yet. ${STORES[r.key]?.pages ?? "That area"} start empty; the damaged copy is kept so your developer can recover it. Everything else works.`}
              </span>
            </li>
          ))
        )}
        {report.shutdown && (
          <li className="is-ok">
            <PlugZap size={16} />
            <span>
              <b>You were on {routeArea(report.shutdown.route)}</b>
              {report.shutdown.user ? ` as ${report.shutdown.user}` : ""}.{" "}
              {routeArea(report.shutdown.route) === "Billing" ? (drafts.length ? "Bills save themselves automatically as you type, so the bill you were on is waiting in Drafts — continue it below." : "No unfinished bill was found, so nothing had been entered yet.") : "Nothing you had saved was lost."}
            </span>
          </li>
        )}
        {report.clock && (
          <li className="is-bad">
            <Clock3 size={16} />
            <span>
              <b>This computer's clock went backwards</b> — it now shows {dt(new Date())}, but STANLEY was already running at {dt(report.clock.lastSeen)}. This often happens after a power cut when the computer's clock battery is weak. Bills would get the wrong date: set the correct date and time (Windows Settings → Time &amp; language → Date &amp; time → “Set time automatically”).
            </span>
          </li>
        )}
      </ul>

      {drafts.length > 0 && (
        <>
          <h4 className="rc-sub">Unfinished bills you can continue</h4>
          <ul className="rc-drafts">
            {drafts.map((d) => (
              <li key={d.id}>
                <FilePenLine size={15} />
                <span>
                  <b>{d.patient.name || "Patient not named yet"}</b>
                  <small>
                    Step {Math.min(d.step, 4)} of 4 · {d.services.length} service{d.services.length === 1 ? "" : "s"} · saved {dt(d.lastSaved ?? d.startedAt)}
                  </small>
                </span>
                <Button
                  size="sm"
                  onClick={() => {
                    close();
                    navigate(`/branch/${d.branchId}/billing?draft=${d.id}`);
                  }}
                >
                  Continue
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="rc-modal-actions">
        <Button
          variant="secondary"
          onClick={() => {
            close();
            navigate(settingsPath);
          }}
        >
          <HardDriveDownload size={15} /> Open System health
        </Button>
        <Button onClick={close}>Carry on working</Button>
      </div>
    </Modal>
  );
}

/** Live warning under the header when a save to this computer fails. */
export function HealthBanner() {
  const { user, navigate } = useApp();
  const live = useLiveSignals();
  const [hidden, setHidden] = useState<string | null>(null);
  const f = live.saveFailed;
  if (!f || hidden === f.at) return null;
  const branchId = user.kind === "admin" ? null : user.branchId;
  return (
    <div className="rc-banner" role="alert">
      <AlertTriangle size={17} />
      <span>
        <b>{f.reason === "full" ? "Your last change wasn't saved — STANLEY's storage on this computer is full." : "STANLEY can't save on this computer — the browser is blocking it."}</b>{" "}
        {f.reason === "full" ? `It's still on screen (${storeLabel(f.key)}). Don't close STANLEY: run a scan to free space or download a backup.` : "Use a normal (not private) browser window."}
      </span>
      <Button size="sm" variant="secondary" onClick={() => navigate(branchId ? `/branch/${branchId}/settings?section=health` : "/settings?section=health")}>
        Scan for errors
      </Button>
      <button
        type="button"
        className="rc-banner-x"
        aria-label="Hide this message"
        onClick={() => {
          setHidden(f.at);
          clearSaveFailure();
        }}
      >
        <X size={15} />
      </button>
    </div>
  );
}
