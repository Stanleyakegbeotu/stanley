/**
 * Turn a technical error into plain words for the people using STANLEY:
 * what happened, whether their work is safe, and what to do — never code.
 * The technical text is kept separately for the developer.
 */
import { errorText } from "./health";

export type Remedy = "retry" | "restart" | "scan" | "clock" | "storage" | "developer" | "connection";

export interface Explanation {
  title: string;
  /** What happened, plain words. */
  what: string;
  /** Steps to try, in order. */
  steps: string[];
  /** The main thing to do. */
  remedy: Remedy;
  technical: string;
}

export function explainError(error: unknown, area: string): Explanation {
  const technical = errorText(error);
  const msg = `${(error as Error)?.name ?? ""} ${(error as Error)?.message ?? String(error)}`.toLowerCase();

  if (/quota|storage.*full|exceeded the quota/.test(msg)) {
    return {
      title: `${area} couldn't save — device storage for STANLEY is full`,
      what: "This computer ran out of the space the browser gives STANLEY. Work already saved is safe.",
      steps: ["Open Settings → System health and press “Scan for errors” — it frees space it safely can.", "Download a backup to keep a copy.", "If it's still full, contact your developer: the data needs to move to the cloud database."],
      remedy: "storage",
      technical,
    };
  }
  if (/dynamically imported module|loading chunk|failed to fetch|importing a module script failed|networkerror/.test(msg)) {
    return {
      title: `${area} couldn't finish loading`,
      what: "Part of the page didn't load — usually the app was just updated, or the connection to the app server dropped for a moment.",
      steps: ["Press “Restart STANLEY” — it reloads the app.", "If it still fails, close the browser fully and open STANLEY again."],
      remedy: "restart",
      technical,
    };
  }
  if (/invalid time value|invalid date|rangeerror.*date|toisostring/.test(msg)) {
    return {
      title: `${area} ran into a date it couldn't understand`,
      what: "A date on this page doesn't make sense — often the computer's date or time is set wrongly, or a record has a damaged date.",
      steps: ["Check the date and time at the bottom-right of the screen. If wrong: Windows Settings → Time & language → Date & time → turn on “Set time automatically”.", "Then press “Try again”.", "If the date is correct, run “Scan for errors”."],
      remedy: "clock",
      technical,
    };
  }
  if (/cannot read propert|undefined is not|null is not|is not a function|is not iterable|cannot destructure/.test(msg)) {
    return {
      title: `${area} hit a problem showing some information`,
      what: "Some saved information wasn't in the form this page expected, so the page stopped to avoid showing anything wrong. Nothing was changed or deleted.",
      steps: ["Press “Try again”.", "If it happens again, run “Scan for errors” — it checks and repairs saved data.", "If it still happens, copy the details below and send them to your developer."],
      remedy: "scan",
      technical,
    };
  }
  if (/out of memory|maximum call stack|too much recursion/.test(msg)) {
    return {
      title: `${area} ran out of working memory`,
      what: "The computer didn't have enough free memory for this page — common when STANLEY has been open for days or many other programs are open.",
      steps: ["Press “Restart STANLEY”.", "Close other programs and browser tabs you aren't using.", "If it keeps happening, restart the computer."],
      remedy: "restart",
      technical,
    };
  }
  return {
    title: `${area} ran into an unexpected problem`,
    what: "Something on this page stopped working. Your saved work is safe — bills and drafts are saved on this device as you go.",
    steps: ["Press “Try again”.", "If it happens again, press “Restart STANLEY”.", "Still happening? Run “Scan for errors”, or copy the details and send them to your developer."],
    remedy: "retry",
    technical,
  };
}
