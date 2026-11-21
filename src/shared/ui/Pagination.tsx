import { ChevronLeft, ChevronRight } from "lucide-react";

/** Compact pager: "Showing 1–5 of 9" · page size · numbered pages. */
export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
  sizes = [5, 10, 25],
  noun = "records",
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
  onPageSize?: (s: number) => void;
  sizes?: number[];
  noun?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const numbers = Array.from({ length: pages }, (_, i) => i + 1).filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 1);

  return (
    <nav className="pager" aria-label="Pagination">
      <span className="pager-info">
        Showing <b>{from}</b>–<b>{to}</b> of <b>{total}</b> {noun}
      </span>
      <div className="pager-controls">
        {onPageSize && (
          <label className="pager-size">
            Rows
            <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}>
              {sizes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        )}
        <button className="pager-btn" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page">
          <ChevronLeft size={16} />
        </button>
        {numbers.map((n, i) => (
          <span key={n} style={{ display: "contents" }}>
            {i > 0 && n - numbers[i - 1] > 1 && <span className="pager-gap">…</span>}
            <button className={`pager-btn ${n === page ? "is-current" : ""}`} onClick={() => onPage(n)} aria-current={n === page ? "page" : undefined}>
              {n}
            </button>
          </span>
        ))}
        <button className="pager-btn" onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Next page">
          <ChevronRight size={16} />
        </button>
      </div>
    </nav>
  );
}
