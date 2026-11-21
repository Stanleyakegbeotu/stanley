import { useCallback, useEffect, useState } from "react";

export interface Route {
  /** Path without query, e.g. "/dashboard" or "/branch/wuse-ii/billing". */
  path: string;
  segments: string[];
  query: URLSearchParams;
}

const DEFAULT_PATH = "/dashboard";

function parse(): Route {
  const raw = window.location.hash.replace(/^#/, "") || DEFAULT_PATH;
  const [pathPart, queryPart = ""] = raw.split("?");
  const path = pathPart.startsWith("/") ? pathPart : `/${pathPart}`;
  return { path, segments: path.split("/").filter(Boolean), query: new URLSearchParams(queryPart) };
}

/** Minimal hash router: works from file:// and inside the future Electron shell. */
export function useHashRoute() {
  const [route, setRoute] = useState<Route>(parse);

  useEffect(() => {
    if (!window.location.hash) window.history.replaceState(null, "", `#${DEFAULT_PATH}`);
    const onChange = () => setRoute(parse());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  const navigate = useCallback((to: string) => {
    if (`#${to}` !== window.location.hash) window.location.hash = to;
  }, []);

  return { route, navigate };
}

/** "/branch/:id/..." → { branchId, page } */
export function branchRoute(route: Route): { branchId: string; page: string } | null {
  if (route.segments[0] !== "branch" || !route.segments[1]) return null;
  return { branchId: route.segments[1], page: route.segments[2] ?? "dashboard" };
}
