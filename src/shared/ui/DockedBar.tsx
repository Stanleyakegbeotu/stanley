/**
 * Renders its children in the workspace's docked bottom bar — fixed under the
 * page like the header above it (App.tsx #workspace-footer), so actions are
 * always reachable without scrolling. Stays empty inside the hidden test copy
 * used by the real page check (probe mode).
 */
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useProbeMode } from "@/services/assistant/probe";

export function DockedBar({ children }: { children: ReactNode }) {
  const probing = useProbeMode();
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setSlot(document.getElementById("workspace-footer")), []);
  return slot && !probing ? createPortal(children, slot) : null;
}
