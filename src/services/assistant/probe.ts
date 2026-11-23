/**
 * Real page check (owner, 2026-11-22): when someone says "my billing page is
 * not loading", STANLEY opens a hidden test copy of that page — the same code
 * the person sees — and watches whether it really loads, how long it takes,
 * and whether it throws an error. Nothing is guessed.
 *
 * The test copy is rendered off-screen by <PageProbeHost> (mounted once in the
 * app shell) using the page renderer App.tsx registers here, inside "probe
 * mode" (docked action bars stay hidden, nothing is shown to the person). It
 * is removed as soon as the check ends.
 */
import { createContext, useContext, type ReactNode } from "react";

export interface ProbeResult {
  /** The page opened without an error. */
  ok: boolean;
  /** Time from starting to open it until it had finished showing. */
  ms: number;
  error?: unknown;
  /** Errors reported while it was open (outside React rendering). */
  laterErrors: string[];
  /** The test copy couldn't be run at all (renderer missing). */
  skipped?: boolean;
}

type Renderer = (path: string) => ReactNode;
let renderer: Renderer | null = null;
/** App.tsx registers how to draw any page from a path. */
export const setPageRenderer = (r: Renderer) => {
  renderer = r;
};
export const pageRenderer = () => renderer;

export interface ProbeRequest {
  id: number;
  path: string;
  resolve: (r: ProbeResult) => void;
}
let current: ProbeRequest | null = null;
const queue: ProbeRequest[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
export const subscribeProbe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
export const currentProbe = () => current;

let seq = 0;
/** Open a hidden test copy of the page at `path` and report how it went. */
export function probePage(path: string): Promise<ProbeResult> {
  if (!renderer) return Promise.resolve({ ok: true, ms: 0, laterErrors: [], skipped: true });
  return new Promise((resolve) => {
    const req: ProbeRequest = {
      id: ++seq,
      path,
      resolve: (r) => {
        current = queue.shift() ?? null;
        emit();
        resolve(r);
      },
    };
    if (current) queue.push(req);
    else {
      current = req;
      emit();
    }
  });
}

/** True inside the hidden test copy — parts that reach outside the page (docked bars) stay quiet. */
export const ProbeModeContext = createContext(false);
export const useProbeMode = () => useContext(ProbeModeContext);
