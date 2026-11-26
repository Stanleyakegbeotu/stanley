/**
 * Opening hours editor (owner, 2026-11-26), for the Company Admin and the
 * Branch Manager: open 24 hours, 7 days a week, or each day closed, open
 * 24 hours, or from a time to a time. PR agents' messages to patients
 * carry these hours.
 */
import { DAY_NAMES, WEEK_ORDER, weekText, type DayHours, type WeekHours } from "@/services/openingHours";
import { FieldError } from "@/shared/ui/FieldError";
import { Toggle } from "./admin/ui";

type Mode = "closed" | "hours" | "allDay";
const modeOf = (d: DayHours): Mode => (!d.open ? "closed" : d.allDay ? "allDay" : "hours");

export function OpeningHoursEditor({ value, onChange, error }: { value: WeekHours; onChange: (w: WeekHours) => void; error?: string | null }) {
  const setDay = (i: number, patch: Partial<DayHours>) => onChange({ ...value, days: value.days.map((d, j) => (j === i ? { ...d, ...patch } : d)) });
  /** Monday's hours for Tuesday to Saturday. */
  const mondayToSaturday = () => onChange({ ...value, days: value.days.map((d, j) => (j >= 2 && j <= 6 ? { ...value.days[1]! } : d)) });
  return (
    <div className={`oh-editor ${error ? "is-error" : ""}`} data-field-error={error ? "true" : undefined}>
      <Toggle checked={value.always} onChange={(always) => onChange({ ...value, always })} label="Open 24 hours, 7 days a week" hint="Turn off to set each day's hours." />
      {!value.always && (
        <div className="oh-days" role="group" aria-label="Opening hours per day">
          {WEEK_ORDER.map((i) => {
            const d = value.days[i]!;
            const mode = modeOf(d);
            return (
              <div key={i} className={`oh-day ${mode === "closed" ? "is-closed" : ""}`}>
                <b>{DAY_NAMES[i]}</b>
                <select aria-label={`${DAY_NAMES[i]}`} value={mode} onChange={(e) => setDay(i, { open: e.target.value !== "closed", allDay: e.target.value === "allDay" })}>
                  <option value="hours">Open</option>
                  <option value="allDay">Open 24 hours</option>
                  <option value="closed">Closed</option>
                </select>
                {mode === "hours" ? (
                  <span className="oh-times">
                    <input type="time" aria-label={`${DAY_NAMES[i]} opens`} value={d.from} onChange={(e) => setDay(i, { from: e.target.value })} />
                    <span>to</span>
                    <input type="time" aria-label={`${DAY_NAMES[i]} closes`} value={d.to} onChange={(e) => setDay(i, { to: e.target.value })} />
                  </span>
                ) : (
                  <span className="oh-times lg-muted">{mode === "closed" ? "Closed all day" : "Open all day and night"}</span>
                )}
                {i === 1 && (
                  <button type="button" className="oh-copy" onClick={mondayToSaturday}>
                    Same for Tue to Sat
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="hint oh-summary">Patients see: {weekText(value)}</p>
      <FieldError msg={error} />
    </div>
  );
}
