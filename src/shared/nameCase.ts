/**
 * Name typing (owner rule, 2026-11-22): every part of a person's name — first,
 * middle, last — starts with a capital letter, whether Caps Lock is on or off.
 * "amina bello" / "AMINA BELLO" → "Amina Bello"; "o'brien" → "O'Brien";
 * "ade-bayo" → "Ade-Bayo". Applied as the user types; the cursor stays put.
 */
import type { ChangeEvent } from "react";

export function formatPersonName(raw: string): string {
  return raw.toLowerCase().replace(/(^|[\s\-'’.(])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** onChange handler for a name input: formats the value and keeps the caret where it was. */
export function nameChange(setValue: (v: string) => void) {
  return (e: ChangeEvent<HTMLInputElement>) => {
    const el = e.target;
    const { selectionStart, selectionEnd } = el;
    const next = formatPersonName(el.value);
    setValue(next);
    if (next !== el.value && selectionStart !== null && selectionEnd !== null) {
      window.requestAnimationFrame(() => {
        try {
          el.setSelectionRange(selectionStart, selectionEnd);
        } catch {
          /* input type without selection support */
        }
      });
    }
  };
}

/** Extra props for name inputs (mobile keyboards capitalise words; no spell-check underlines on names). */
export const NAME_INPUT_PROPS = { autoCapitalize: "words", autoComplete: "off", spellCheck: false } as const;
