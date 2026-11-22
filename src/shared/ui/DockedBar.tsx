/**
 * Renders its children in the workspace's docked bottom bar — fixed under the
 * page like the header above it (App.tsx #workspace-footer), so actions are
 * always reachable without scrolling.
 */
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function DockedBar({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setSlot(document.getElementById("workspace-footer")), []);
  return slot ? createPortal(children, slot) : null;
}
