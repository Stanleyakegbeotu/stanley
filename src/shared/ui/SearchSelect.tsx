import { useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Plus, Search } from "lucide-react";
import { Popover } from "./Popover";

export interface SearchOption {
  value: string;
  label: string;
  description?: string;
  /** Extra text matched by search but not shown. */
  keywords?: string;
}

/**
 * Searchable dropdown for long lists (e.g. 95 hospitals). Typing filters the
 * options; with `allowCreate`, an unmatched term can be chosen as a new value.
 */
export function SearchSelect({
  value,
  options,
  onChange,
  ariaLabel,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  allowCreate,
  createLabel = (t: string) => `Use “${t}”`,
  className = "select-btn",
  width = 320,
  leading,
}: {
  value: string;
  options: SearchOption[];
  onChange: (v: string) => void;
  ariaLabel: string;
  placeholder?: string;
  searchPlaceholder?: string;
  allowCreate?: boolean;
  createLabel?: (term: string) => string;
  className?: string;
  width?: number;
  leading?: ReactNode;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const selected = options.find((o) => o.value === value);
  const term = q.trim().toLowerCase();
  const filtered = useMemo(
    () => (term ? options.filter((o) => `${o.label} ${o.description ?? ""} ${o.keywords ?? ""}`.toLowerCase().includes(term)) : options),
    [options, term],
  );
  const exact = options.some((o) => o.label.toLowerCase() === term || o.value.toLowerCase() === term);
  const choose = (v: string) => {
    onChange(v);
    setOpen(false);
    setQ("");
  };

  return (
    <>
      <button ref={ref} type="button" className={className} aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel} onClick={() => setOpen((o) => !o)}>
        {leading}
        <span className="ss-value">{selected ? selected.label : value || placeholder}</span>
        <ChevronDown size={16} />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} matchWidth width={width} role="listbox" label={ariaLabel} className="ss-popover">
        <label className="search-input ss-search">
          <Search size={15} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder} aria-label={searchPlaceholder} data-autofocus />
        </label>
        <div className="ss-list">
          {allowCreate && term && !exact && (
            <button className="menu-item" role="option" aria-selected={false} onClick={() => choose(q.trim())}>
              <span className="mi-icon">
                <Plus size={15} />
              </span>
              <span className="mi-text">{createLabel(q.trim())}</span>
            </button>
          )}
          {filtered.length === 0 && !(allowCreate && term) && <div className="empty" style={{ padding: 18 }}>No matches</div>}
          {filtered.map((o) => (
            <button key={o.value} className={`menu-item ${o.value === value ? "is-selected" : ""}`} role="option" aria-selected={o.value === value} onClick={() => choose(o.value)}>
              <span className="mi-text">
                {o.label}
                {o.description && <small>{o.description}</small>}
              </span>
              {o.value === value && <Check size={16} className="mi-check" />}
            </button>
          ))}
        </div>
      </Popover>
    </>
  );
}
