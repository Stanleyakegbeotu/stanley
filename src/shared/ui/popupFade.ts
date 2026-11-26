/**
 * Every pop-up fades out when it closes (owner, 2026-11-26: "something
 * opening up and something closing", never just disappearing).
 *
 * Pop-ups fade in already (their framer-motion entry). Many are closed by
 * their parent removing them, which skips any exit animation, so this one
 * global watcher catches a pop-up layer (.modal-layer) the moment it leaves
 * the page and fades out a still copy of it in its place. Layers that already
 * faded out (framer-motion exit, opacity 0) are left alone, and so is
 * everything when the computer asks for reduced motion.
 */
const OUT_MS = 240;

function ghost(layer: HTMLElement) {
  if (layer.dataset.ghost) return;
  if (parseFloat(layer.style.opacity || "1") < 0.5) return;
  const copy = layer.cloneNode(true) as HTMLElement;
  copy.dataset.ghost = "1";
  // Not a live layer any more: Escape and "top-most dialog" checks ignore it.
  copy.classList.remove("modal-layer");
  copy.classList.add("modal-ghost");
  copy.setAttribute("aria-hidden", "true");
  copy.style.opacity = "";
  copy.style.pointerEvents = "none";
  document.body.appendChild(copy);
  window.setTimeout(() => copy.remove(), OUT_MS + 40);
}

export function installPopupFade() {
  if (typeof window === "undefined" || !document.body) return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const obs = new MutationObserver((list) => {
    for (const m of list)
      m.removedNodes.forEach((n) => {
        if (!(n instanceof HTMLElement)) return;
        if (n.classList.contains("modal-layer")) ghost(n);
        else n.querySelectorAll?.<HTMLElement>(".modal-layer").forEach(ghost);
      });
  });
  obs.observe(document.body, { childList: true });
}
