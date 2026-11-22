/**
 * "Most done services" — one-click quick add, shared by Billing (step 2) and
 * the Price calculator. Ranking comes from services/billing.ts
 * (frequentServices): tests billed in STANLEY at the branch first, then the
 * branch's last-30-days activity. Tests without a price are left out.
 */
import { useMemo } from "react";
import { Check, Plus, Zap } from "lucide-react";
import { addDays, isoDate } from "@/data/demo/generator";
import { resolveRange, serviceRanking } from "@/services/analytics";
import { frequentServices, useBilling } from "@/services/billing";
import { categoryMeta, type CatalogueItem } from "@/features/inventory/InventoryCatalog";

export function useQuickServices(branchId: string, items: CatalogueItem[], limit = 10) {
  const billing = useBilling();
  return useMemo(() => {
    const recent = new Map(serviceRanking([branchId], resolveRange({ key: "custom", from: isoDate(addDays(new Date(), -29)), to: isoDate(new Date()) })).map((r) => [r.id, r.count]));
    const byId = new Map(items.map((i) => [i.id, i]));
    return frequentServices(branchId, recent, limit * 3)
      .map((f) => ({ item: byId.get(f.id), count: f.count }))
      .filter((x): x is { item: CatalogueItem; count: number } => !!x.item && x.item.price !== null)
      .slice(0, limit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, items, billing.orders, limit]);
}

export function QuickServices({
  list,
  isAdded,
  onToggle,
  labelOf,
  money,
  className = "",
}: {
  list: { item: CatalogueItem; count: number }[];
  isAdded: (id: number) => boolean;
  onToggle: (item: CatalogueItem) => void;
  labelOf: (categoryKey: string) => string;
  money: (n: number) => string;
  className?: string;
}) {
  if (!list.length) return null;
  return (
    <section className={`bl-quick ${className}`} aria-label="Most done services">
      <header>
        <span className="bl-quick-icon" aria-hidden="true">
          <Zap size={15} />
        </span>
        <b>Most done services</b>
        <small>Click to add — no need to search</small>
      </header>
      <div className="bl-quick-list">
        {list.map(({ item, count }) => {
          const on = isAdded(item.id);
          const Icon = categoryMeta(item.category).icon;
          return (
            <button key={item.id} type="button" className={`bl-quick-chip ${on ? "is-on" : ""}`} aria-pressed={on} onClick={() => onToggle(item)} title={`${item.name} · ${labelOf(item.category)} · done ${count} time${count === 1 ? "" : "s"} recently`}>
              <span className="bl-quick-chip-icon" aria-hidden="true">
                {on ? <Check size={14} /> : <Icon size={14} />}
              </span>
              <span className="bl-quick-chip-text">
                <b>{item.name}</b>
                <small>
                  {money(item.price!)} · {labelOf(item.category)}
                </small>
              </span>
              {!on && <Plus size={15} className="bl-quick-add" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </section>
  );
}
