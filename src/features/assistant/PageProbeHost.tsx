/**
 * Draws the hidden test copy of a page for the real page check
 * (services/assistant/probe.ts). Off-screen, inert, removed when done.
 */
import { Component, useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { currentProbe, pageRenderer, ProbeModeContext, subscribeProbe, type ProbeRequest } from "@/services/assistant/probe";
import { errorText } from "@/services/recovery/health";

/** How long the page is watched after it has shown, for errors that come a moment later. */
const WATCH_MS = 900;
/** Give up if the page never finishes showing. */
const TIMEOUT_MS = 8000;

class ProbeBoundary extends Component<{ onError: (e: unknown) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e: unknown) {
    this.props.onError(e);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** Draws the page inside the boundary, so even an error in its very first step is caught. */
function PageAt({ path }: { path: string }) {
  return <>{pageRenderer()?.(path)}</>;
}

/** Placed after the page: its effect runs once the page's own effects have run. */
function Shown({ onShown }: { onShown: () => void }) {
  useEffect(() => onShown(), []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function Probe({ req }: { req: ProbeRequest }) {
  const start = useRef(performance.now());
  const done = useRef(false);
  const shownAt = useRef<number | null>(null);
  const later = useRef<string[]>([]);

  const finish = (error?: unknown) => {
    if (done.current) return;
    done.current = true;
    const ms = Math.round((shownAt.current ?? performance.now()) - start.current);
    req.resolve({ ok: !error, ms, error, laterErrors: later.current });
  };

  useEffect(() => {
    const onErr = (e: ErrorEvent) => e.error && later.current.push(errorText(e.error));
    window.addEventListener("error", onErr);
    const t = window.setTimeout(() => finish(new Error(`The page didn't finish opening within ${TIMEOUT_MS / 1000} seconds`)), TIMEOUT_MS);
    return () => {
      window.removeEventListener("error", onErr);
      window.clearTimeout(t);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ProbeModeContext.Provider value={true}>
      <ProbeBoundary onError={(e) => finish(e)}>
        <PageAt path={req.path} />
        <Shown
          onShown={() => {
            shownAt.current = performance.now();
            window.setTimeout(() => finish(), WATCH_MS);
          }}
        />
      </ProbeBoundary>
    </ProbeModeContext.Provider>
  );
}

export function PageProbeHost() {
  const req = useSyncExternalStore(subscribeProbe, currentProbe, currentProbe);
  if (!req) return null;
  return createPortal(
    <div className="probe-stage" aria-hidden="true" inert>
      <Probe key={req.id} req={req} />
    </div>,
    document.body,
  );
}
