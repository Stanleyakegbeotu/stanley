/**
 * Branch header search — finds patient records fast. Suggestions appear while
 * typing (patient ID, any part of it, or a visit number); choosing one opens
 * the patient visit record pop-up (the same card used across the app).
 *
 * Matches patient names (any part, as you type), patient IDs (PT-… demo
 * patients, ABJ-W…/ABJ-R… patients billed in STANLEY) and visit or invoice numbers.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, UserRound } from "lucide-react";
import { DATA_START, addDays, diffDays, TODAY } from "@/data/demo/generator";
import { findVisit, latestVisit, orderVisits, patientIndex, type PatientVisit } from "@/data/demo/dailyLines";
import { useBilling } from "@/services/billing";
import { formatMoney } from "@/shared/format";
import { Popover } from "@/shared/ui/Popover";
import { PatientRecordModal } from "@/features/shared/PatientRecord";

const MAX = 8;
/** A bill saved in STANLEY, found by its invoice number (INV-2026-000001). */
const latestVisitByInvoice = (branchId: string, term: string) => orderVisits([branchId]).find((v) => v.id.toLowerCase() === term.trim().toLowerCase()) ?? null;
const dayText = (i: number) => {
  const t = diffDays(DATA_START, TODAY);
  if (i === t) return "Today";
  if (i === t - 1) return "Yesterday";
  return addDays(DATA_START, i).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

/** Bold the matched digits / letters inside the patient ID. */
function Mark({ text, digits }: { text: string; digits: string }) {
  if (!digits) return <>{text}</>;
  const raw = text.replace(/\D/g, "");
  const at = raw.indexOf(digits);
  if (at < 0) return <>{text}</>;
  // Map digit positions back onto the formatted text (e.g. "PT-04835").
  const pos: number[] = [];
  [...text].forEach((ch, i) => /\d/.test(ch) && pos.push(i));
  const s = pos[at];
  const e = pos[at + digits.length - 1] + 1;
  return (
    <>
      {text.slice(0, s)}
      <mark>{text.slice(s, e)}</mark>
      {text.slice(e)}
    </>
  );
}

export function PatientSearch({ branchId }: { branchId: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [viewing, setViewing] = useState<PatientVisit | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Patients billed in STANLEY are included and searchable straight after saving.
  const billing = useBilling();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const index = useMemo(() => patientIndex(branchId), [branchId, billing.patients, billing.orders]);
  const term = q.trim();
  const digits = term.replace(/\D/g, "");
  const words = term.toLowerCase().split(/\s+/).filter((w) => /[a-z]/.test(w));
  const visitMatch = /^(v|inv)/i.test(term) && term.length >= 12 ? (findVisit(branchId, term.toUpperCase()) ?? latestVisitByInvoice(branchId, term)) : null;

  const rows = useMemo(() => {
    let list = index;
    if (!term) list = index.filter((p, i) => i < MAX || p.lastDay === index[0]?.lastDay);
    else {
      // Every typed word must match the name (start of a name part) or the ID; digits match any part of the ID.
      list = index.filter((p) => {
        const name = p.name.toLowerCase();
        const nameOk = words.every((w) => name.split(/[\s-]+/).some((part) => part.startsWith(w)) || p.ref.toLowerCase().includes(w));
        const idOk = !digits || p.ref.replace(/\D/g, "").includes(digits);
        return nameOk && idOk;
      });
    }
    // ID prefix matches first, then most recent.
    const ranked = digits ? [...list].sort((a, b) => Number(b.ref.replace(/\D/g, "").replace(/^0+/, "").startsWith(digits)) - Number(a.ref.replace(/\D/g, "").replace(/^0+/, "").startsWith(digits)) || b.lastDay - a.lastDay) : list;
    return { total: ranked.length, top: ranked.slice(0, MAX).map((p) => ({ ...p, last: latestVisit(branchId, p.ref) })) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, term, branchId]);

  const choices: PatientVisit[] = visitMatch ? [visitMatch] : rows.top.map((r) => r.last).filter((v): v is PatientVisit => !!v);
  const pick = (v: PatientVisit) => {
    setViewing(v);
    setOpen(false);
    setQ("");
    input.current?.blur();
  };

  return (
    <>
      <div ref={wrap} className="hdr-control hdr-search hdr-psearch" role="combobox" aria-expanded={open} aria-haspopup="listbox">
        <Search size={19} />
        <input
          ref={input}
          value={q}
          placeholder="Search patient ID or name"
          aria-label="Search patient records"
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(choices.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter" && choices[active]) pick(choices[active]);
            else if (e.key === "Escape") setOpen(false);
          }}
        />
        <span className="kbd">Ctrl K</span>
        <Popover anchor={wrap} open={open} onClose={() => setOpen(false)} matchWidth noAutoFocus role="listbox" label="Patient suggestions" className="ps-pop">
          {visitMatch ? (
            <>
              <div className="menu-label">Visit</div>
              <Row v={visitMatch} title={visitMatch.patientName} sub={`${visitMatch.patientRef} · visit ${visitMatch.id} · ${dayText(diffDays(DATA_START, visitMatch.at))}`} active={active === 0} onHover={() => setActive(0)} onPick={pick} />
            </>
          ) : rows.top.length === 0 ? (
            <div className="ps-empty">
              <Search size={22} />
              <strong>No patient matches “{term}”</strong>
              <small>Try the patient's first or last name, or any part of their patient ID (e.g. 4835 or ABJ-W000001).</small>
            </div>
          ) : (
            <>
              <div className="menu-label">
                {term ? `${rows.total.toLocaleString("en-NG")} patient${rows.total === 1 ? "" : "s"} match` : `Seen ${dayText(index[0]?.lastDay ?? 0).toLowerCase()}`}
                {rows.total > MAX && <span> · showing {MAX} — keep typing to narrow</span>}
              </div>
              {rows.top.map(
                (r, i) =>
                  r.last && (
                    <Row
                      key={r.ref}
                      v={r.last}
                      title={
                        <>
                          <span className="ps-name">{r.name}</span> <Mark text={r.ref} digits={digits} />
                        </>
                      }
                      sub={`${r.visits} visit${r.visits === 1 ? "" : "s"} · last ${dayText(r.lastDay)} · ${r.last.services.map((s) => s.name).join(", ")}`}
                      active={i === active}
                      onHover={() => setActive(i)}
                      onPick={pick}
                    />
                  ),
              )}
            </>
          )}
        </Popover>
      </div>
      <PatientRecordModal visit={viewing} onClose={() => setViewing(null)} />
    </>
  );
}

function Row({ v, title, sub, active, onHover, onPick }: { v: PatientVisit; title: React.ReactNode; sub: string; active: boolean; onHover: () => void; onPick: (v: PatientVisit) => void }) {
  return (
    <button type="button" className={`menu-item ps-row ${active ? "is-selected" : ""}`} role="option" aria-selected={active} onMouseEnter={onHover} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(v)}>
      <span className="mi-icon">
        <UserRound size={16} />
      </span>
      <span className="mi-text">
        <span className="ps-title">{title}</span>
        <small>{sub}</small>
      </span>
      <span className="ps-tag" title="Billed at the last visit">
        {formatMoney(v.billed, "NGN", true)}
      </span>
    </button>
  );
}
