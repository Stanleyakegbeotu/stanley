/**
 * Crash catchers (owner, 2026-11-22). When something breaks, people get plain
 * words — what happened, that their work is safe, which part is affected and
 * that everything else still works — never code (the technical text is folded
 * away for the developer).
 *
 *  • variant "page"   — wraps the page area. Only that page shows the problem;
 *                       sidebar, header and every other page keep working.
 *                       Resets when the person moves to another page.
 *  • variant "widget" — wraps a small part (header, sidebar, assistant) so its
 *                       failure never takes the page down.
 *  • variant "app"    — last line of defence around everything, with no
 *                       dependency on the rest of the app.
 */
import { Component, useState, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, Check, ChevronDown, Copy, Download, LayoutGrid, RefreshCw, RotateCcw, Stethoscope } from "lucide-react";
import { errorText, healthState, recordIncident } from "@/services/recovery/health";
import { explainError, type Explanation } from "@/services/recovery/explain";
import { backupFile, getBackup, listBackups, restoreBackup } from "@/services/recovery/backups";
import { collectData } from "@/services/recovery/stores";

interface Props {
  area: string;
  variant: "page" | "widget" | "app";
  /** Change it to clear the error (the page area passes the route). */
  resetKey?: string;
  onHome?: () => void;
  onScan?: () => void;
  children: ReactNode;
}
interface State {
  error: unknown;
  info: Explanation | null;
}

export class RecoveryBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    const ex = explainError(error, this.props.area);
    this.setState({ info: ex });
    recordIncident({
      kind: "crash",
      title: ex.title,
      detail: `${ex.what} ${this.props.variant === "page" ? "Only this page was affected; the rest of STANLEY kept working." : ""}`.trim(),
      area: this.props.area,
      fixed: false,
      technical: `${errorText(error)}\nComponent stack:${(info.componentStack ?? "").split("\n").slice(0, 8).join("\n")}`,
    });
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null, info: null });
  }

  retry = () => this.setState({ error: null, info: null });

  render() {
    if (!this.state.error) return this.props.children;
    const info = this.state.info ?? explainError(this.state.error, this.props.area);
    if (this.props.variant === "widget") return <WidgetProblem area={this.props.area} onRetry={this.retry} />;
    if (this.props.variant === "app") return <AppCrashScreen info={info} />;
    return <PageProblem area={this.props.area} info={info} onRetry={this.retry} onHome={this.props.onHome} onScan={this.props.onScan} />;
  }
}

/** How many times this area broke recently — repeated failures change the advice. */
function recentCrashes(area: string) {
  const since = Date.now() - 15 * 60_000;
  return healthState().incidents.filter((i) => i.kind === "crash" && i.area === area && new Date(i.at).getTime() > since).length;
}

function TechDetails({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <div className="rc-tech">
      <button type="button" className="rc-tech-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <ChevronDown size={14} style={{ transform: open ? "rotate(180deg)" : undefined }} /> Details for your developer
      </button>
      {open && (
        <>
          <pre>{text}</pre>
          <button
            type="button"
            className="rc-btn is-ghost"
            onClick={() => {
              void navigator.clipboard?.writeText(`STANLEY problem report\n${new Date().toLocaleString("en-GB")}\n${navigator.userAgent}\n\n${text}`).then(() => setCopied(true));
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy details"}
          </button>
        </>
      )}
    </div>
  );
}

function PageProblem({ area, info, onRetry, onHome, onScan }: { area: string; info: Explanation; onRetry: () => void; onHome?: () => void; onScan?: () => void }) {
  const repeated = recentCrashes(area) >= 3;
  return (
    <section className="rc-page" role="alert">
      <div className="rc-page-card">
        <span className="rc-icon" aria-hidden="true">
          <AlertTriangle size={26} />
        </span>
        <h2>{info.title}</h2>
        <p className="rc-what">{info.what}</p>

        <ul className="rc-facts">
          <li>
            <Check size={15} /> <span><b>Your saved work is safe.</b> Bills and drafts are saved on this computer as you go — nothing was deleted.</span>
          </li>
          <li>
            <Check size={15} /> <span><b>Only “{area}” is affected.</b> The sidebar, header and every other page still work — you can keep working elsewhere.</span>
          </li>
        </ul>

        <h3>What to do</h3>
        <ol className="rc-steps">
          {(repeated ? ["This page has stopped several times in a few minutes. Press “Restart STANLEY”.", "If it still happens after restarting, run “Scan for errors” and send the report to your developer.", "Meanwhile, use the other pages — they are not affected."] : info.steps).map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>

        <div className="rc-actions">
          {!repeated && (
            <button type="button" className="rc-btn is-primary" onClick={onRetry}>
              <RotateCcw size={15} /> Try again
            </button>
          )}
          <button type="button" className={`rc-btn ${repeated ? "is-primary" : ""}`} onClick={() => window.location.reload()}>
            <RefreshCw size={15} /> Restart STANLEY
          </button>
          {onScan && (
            <button type="button" className="rc-btn" onClick={onScan}>
              <Stethoscope size={15} /> Scan for errors
            </button>
          )}
          {onHome && (
            <button type="button" className="rc-btn is-ghost" onClick={onHome}>
              <LayoutGrid size={15} /> Go to dashboard
            </button>
          )}
        </div>
        <TechDetails text={info.technical} />
      </div>
    </section>
  );
}

function WidgetProblem({ area, onRetry }: { area: string; onRetry: () => void }) {
  return (
    <div className="rc-widget" role="status">
      <AlertTriangle size={14} />
      <span>{area} couldn't load — everything else works.</span>
      <button type="button" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

/**
 * The whole app failed to start or show. Self-contained: works even when the
 * rest of STANLEY can't. Offers restart, keeping a copy of the data, and — if
 * restarting doesn't help — putting yesterday's backup back.
 */
function AppCrashScreen({ info }: { info: Explanation }) {
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const crashes = healthState().incidents.filter((i) => i.kind === "crash" && i.area === "STANLEY" && Date.now() - new Date(i.at).getTime() < 10 * 60_000).length;

  const saveCopy = () => {
    try {
      const blob = new Blob([backupFile({ at: new Date().toISOString(), keys: collectData() }, "STANLEY", "Emergency copy")], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `stanley-emergency-copy-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setMsg("A copy of everything on this computer was downloaded. Keep it safe.");
    } catch {
      setMsg("The copy couldn't be made.");
    }
  };

  const restoreLatest = async () => {
    setBusy("restore");
    try {
      const list = (await listBackups()).filter((b) => b.id !== "before-restore");
      // The newest backup made before today's trouble started.
      const pick = list.find((b) => b.id < new Date().toISOString().slice(0, 10)) ?? list[0];
      if (!pick || !(await getBackup(pick.id))) {
        setMsg("No automatic backup is on this computer yet. Restart, or contact your developer.");
        setBusy("");
        return;
      }
      await restoreBackup(pick.id, { name: "Recovery screen", role: "System" }, "STANLEY could not start; restored from the recovery screen");
    } catch (e) {
      setMsg(`The backup couldn't be restored: ${e instanceof Error ? e.message : e}`);
      setBusy("");
    }
  };

  return (
    <div className="rc-app" role="alert">
      <div className="rc-app-card">
        <span className="rc-icon" aria-hidden="true">
          <AlertTriangle size={30} />
        </span>
        <h1>STANLEY needs a restart</h1>
        <p className="rc-what">{info.what}</p>
        <ul className="rc-facts">
          <li>
            <Check size={15} /> <span><b>Your data is still on this computer.</b> Nothing was deleted, and a backup is made every day.</span>
          </li>
        </ul>
        <h3>What to do</h3>
        <ol className="rc-steps">
          <li>Press “Restart STANLEY”.</li>
          {crashes >= 2 && <li>Restarting didn't help? Press “Keep a copy of my data” first, then “Put back the last backup”.</li>}
          <li>Still not working? Restart the computer, then contact your developer with the details below.</li>
        </ol>
        <div className="rc-actions">
          <button type="button" className="rc-btn is-primary" onClick={() => window.location.reload()}>
            <RefreshCw size={15} /> Restart STANLEY
          </button>
          <button type="button" className="rc-btn" onClick={saveCopy}>
            <Download size={15} /> Keep a copy of my data
          </button>
          {crashes >= 2 && (
            <button type="button" className="rc-btn" disabled={!!busy} onClick={() => void restoreLatest()}>
              <RotateCcw size={15} /> {busy ? "Restoring…" : "Put back the last backup"}
            </button>
          )}
        </div>
        {msg && <p className="rc-msg">{msg}</p>}
        <TechDetails text={info.technical} />
      </div>
    </div>
  );
}
