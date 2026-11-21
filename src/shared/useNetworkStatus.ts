import { useEffect, useState } from "react";

/** Network Information API (Chromium/Electron); absent in some browsers. */
interface NetworkInformationLike extends EventTarget {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}

export interface NetworkStatus {
  online: boolean;
  /** When the current state began (page load counts as the start). */
  since: Date;
  /** e.g. "4g" — only where the browser reports it. */
  effectiveType?: string;
  /** Estimated bandwidth in Mbit/s, where reported. */
  downlink?: number;
  /** Estimated round-trip time in ms, where reported. */
  rtt?: number;
}

const connection = (): NetworkInformationLike | undefined => (navigator as Navigator & { connection?: NetworkInformationLike }).connection;

function read(online: boolean, since: Date): NetworkStatus {
  const c = connection();
  return { online, since, effectiveType: c?.effectiveType, downlink: c?.downlink, rtt: c?.rtt };
}

/**
 * Live online/offline state from the browser (navigator.onLine plus the
 * online/offline events). STANLEY is offline-first, so this only informs the
 * user — nothing stops working when it goes offline.
 */
export function useNetworkStatus(onChange?: (online: boolean) => void): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>(() => read(navigator.onLine, new Date()));

  useEffect(() => {
    const update = (e: Event) => {
      const online = e.type === "online" ? true : e.type === "offline" ? false : navigator.onLine;
      setStatus((s) => (s.online === online ? read(online, s.since) : read(online, new Date())));
      if (e.type === "online" || e.type === "offline") onChange?.(online);
    };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    const c = connection();
    c?.addEventListener?.("change", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      c?.removeEventListener?.("change", update);
    };
  }, [onChange]);

  return status;
}
