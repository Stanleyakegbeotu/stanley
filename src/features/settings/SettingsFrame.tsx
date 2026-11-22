/**
 * Shared settings layout: section list on the left, one content card on the
 * right. The open section is in the URL (?section=…) so header links such as
 * "My profile" land on the right section.
 */
import { motion } from "framer-motion";
import { Check, ChevronRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useApp } from "@/app/AppState";
import { THEMES } from "@/app/themes";
import { Reveal, useMotionPreset } from "@/shared/motion";

export interface SettingsSection {
  id: string;
  label: string;
  icon: LucideIcon;
  /** One line under the section title. */
  hint: string;
}

export function SettingsFrame({ sections, current, basePath, actions, children }: { sections: SettingsSection[]; current: SettingsSection; basePath: string; actions?: ReactNode; children: ReactNode }) {
  const { navigate } = useApp();
  return (
    <Reveal className="settings-layout">
      <nav className="settings-nav" aria-label="Settings sections">
        {sections.map((s) => {
          const Icon = s.icon;
          return (
            <button key={s.id} className={s.id === current.id ? "is-active" : ""} onClick={() => navigate(`${basePath}?section=${s.id}`)} aria-current={s.id === current.id ? "page" : undefined}>
              <Icon size={17} />
              {s.label}
              <ChevronRight size={15} className="chev" />
            </button>
          );
        })}
      </nav>
      <div className="card card-pad settings-content">
        <div className="card-head">
          <div>
            <h3>{current.label}</h3>
            <p>{current.hint}</p>
          </div>
          {actions}
        </div>
        {children}
      </div>
    </Reveal>
  );
}

/** Pick the section from ?section=…, with aliases (e.g. "appearance" → "branding" for the admin). */
export function useSection(sections: SettingsSection[], aliases: Record<string, string> = {}): SettingsSection {
  const { route } = useApp();
  const raw = route.query.get("section") ?? sections[0].id;
  const id = aliases[raw] ?? raw;
  return sections.find((s) => s.id === id) ?? sections[0];
}

/** Colour theme cards. The theme is saved on this device and applies to the whole app. */
export function ThemeCards() {
  const { theme, setTheme } = useApp();
  const m = useMotionPreset();
  return (
    <motion.div className="theme-cards" variants={m.staggerGroup} initial="hidden" animate="visible">
      {THEMES.map((t) => (
        <motion.button key={t.id} className={`theme-card ${theme === t.id ? "is-active" : ""}`} variants={m.revealItem} whileHover={m.cardHover} onClick={() => setTheme(t.id)} aria-pressed={theme === t.id}>
          <span className="theme-preview" aria-hidden="true">
            <i style={{ background: t.sidebar }} />
            <span>
              <b style={{ background: t.accent }} />
              <em />
              <em />
            </span>
          </span>
          <span className="theme-name">
            {t.name}
            {theme === t.id && <Check size={16} />}
          </span>
        </motion.button>
      ))}
    </motion.div>
  );
}

export function SettingsBlock({ title, note, children, action }: { title: string; note?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="st-block">
      <header>
        <div>
          <h4>{title}</h4>
          {note && <p>{note}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
