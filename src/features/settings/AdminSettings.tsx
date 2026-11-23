/**
 * Company Admin Settings Center — the administrative command centre of
 * STANLEY: organisation, branches, managers, staff, roles & permissions,
 * approvals, patient / billing / referral / service configuration, and system
 * administration. Each section is its own module (settings/admin/*); every
 * control writes to a store the rest of the app reads. Branch Managers and
 * Front Desk never see this page — they get their own settings in the branch.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Bell,
  Building2,
  ClipboardCheck,
  CreditCard,
  Database,
  Gauge,
  Handshake,
  Info,
  KeyRound,
  LayoutDashboard,
  Package,
  Palette,
  Plug,
  ScrollText,
  Search,
  ShieldCheck,
  Store,
  UserRound,
  UserSquare2,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useApp } from "@/app/AppState";
import { AnimatedPage, Reveal } from "@/shared/motion";
import { PageHero } from "@/features/shared/PageHero";
import { ProfileCard } from "./ProfileCard";
import { Overview } from "./admin/Overview";
import { CompanySection } from "./admin/Company";
import { BranchesSection } from "./admin/Branches";
import { MonitoringSection } from "./admin/Monitoring";
import { ManagersSection } from "./admin/Managers";
import { StaffSection } from "./admin/Staff";
import { RolesSection } from "./admin/Roles";
import { ApprovalsSection, BillingSection, PatientsSection, ReferralSection, ServicesSection } from "./admin/Business";
import { AppearanceSection, AuditSection, DataSection, IntegrationsSection, NotificationsSection, SecuritySection, SystemSection } from "./admin/System";
import { useOrgFacts } from "./admin/orgData";

export { ReceiptPreview } from "./admin/Company";

interface Section {
  id: string;
  label: string;
  icon: LucideIcon;
  hint: string;
  /** Extra words the settings search matches. */
  keywords: string;
}
interface Group {
  label: string;
  sections: Section[];
}

const GROUPS: Group[] = [
  {
    label: "Control center",
    sections: [
      { id: "overview", label: "Overview", icon: LayoutDashboard, hint: "The organisation at a glance, what needs attention and quick actions.", keywords: "dashboard alerts status configuration quick actions" },
      { id: "profile", label: "My profile", icon: UserRound, hint: "Your own account — photo and contact details.", keywords: "photo avatar name email phone account" },
    ],
  },
  {
    label: "Organisation",
    sections: [
      { id: "company", label: "Company settings", icon: Building2, hint: "Company information, logos, receipts and where each setting applies.", keywords: "company name logo branding receipt registration rc address motto theme scope" },
      { id: "branches", label: "Branch management", icon: Store, hint: "Every branch — add, edit, activate, suspend; branch codes and payment methods.", keywords: "branch add new code abj lag activate deactivate suspend location address" },
      { id: "monitoring", label: "Branch monitoring", icon: Gauge, hint: "Branch health and a side-by-side comparison.", keywords: "health compare comparison operational activity sync" },
      { id: "managers", label: "Branch managers", icon: KeyRound, hint: "Who runs each branch — assign, replace, remove.", keywords: "manager assign replace remove appoint head" },
      { id: "staff", label: "Staff management", icon: Users, hint: "Every staff account — roles, transfers, status.", keywords: "staff front desk transfer role suspend directory employee" },
      { id: "roles", label: "Roles & permissions", icon: ShieldCheck, hint: "What each role can see and do.", keywords: "permissions roles access matrix rights discount override" },
    ],
  },
  {
    label: "Business configuration",
    sections: [
      { id: "approvals", label: "Approvals & workflows", icon: ClipboardCheck, hint: "How each approval works and everything waiting for a decision.", keywords: "approval queue expense reject workflow pending" },
      { id: "patients", label: "Patient & registration", icon: UserSquare2, hint: "Patient ID format per branch and registration rules.", keywords: "patient id format referred walk-in duplicate phone registration" },
      { id: "billing", label: "Billing & payments", icon: CreditCard, hint: "Payment methods, split payments, discounts and numbering.", keywords: "payment method cash pos transfer split discount invoice receipt numbering price override" },
      { id: "referral", label: "Referral & commission", icon: Handshake, hint: "The company commission rate and referral rules.", keywords: "referral commission pr agent hospital rate percentage" },
      { id: "services", label: "Services & inventory", icon: Package, hint: "The catalogue and who can change prices.", keywords: "services inventory catalogue price list categories" },
    ],
  },
  {
    label: "System",
    sections: [
      { id: "notifications", label: "Notifications", icon: Bell, hint: "Which notifications appear in the app.", keywords: "notifications alerts email sms bell" },
      { id: "security", label: "Security & access", icon: ShieldCheck, hint: "Access control, sensitive actions and security history.", keywords: "security password login session lockout sensitive access" },
      { id: "appearance", label: "Appearance & themes", icon: Palette, hint: "The colour theme for the whole app.", keywords: "theme colour color appearance light" },
      { id: "data", label: "Data & backup", icon: Database, hint: "What's stored on this device, backups and restore.", keywords: "backup restore data storage export file" },
      { id: "integrations", label: "Integrations", icon: Plug, hint: "Connected services — honest status only.", keywords: "integration cloud sync email sms payment gateway api" },
      { id: "audit", label: "Audit log", icon: ScrollText, hint: "Every change, who made it and when.", keywords: "audit log history activity export" },
      { id: "system", label: "System & about", icon: Info, hint: "System configuration, version and data sources.", keywords: "system version timezone currency format about" },
    ],
  },
];
const ALL = GROUPS.flatMap((g) => g.sections);

export function SettingsPage() {
  const { route, navigate, user } = useApp();
  const facts = useOrgFacts();
  const raw = route.query.get("section") ?? "overview";
  const current = ALL.find((s) => s.id === (raw === "permissions" ? "roles" : raw === "branding" || raw === "documents" ? "company" : raw)) ?? ALL[0];
  const action = route.query.get("action");
  const go = useCallback((section: string, act?: string) => navigate(`/settings?section=${section}${act ? `&action=${act}` : ""}`), [navigate]);
  const clearAction = useCallback(() => navigate(`/settings?section=${current.id}`), [navigate, current.id]);
  const badges: Record<string, number> = {
    approvals: facts.pendingApprovals,
    managers: facts.perBranch.filter((b) => !b.manager && b.branch.status !== "Inactive").length,
    data: facts.backupOverdue ? 1 : 0,
  };

  return (
    <AnimatedPage>
      <PageHero eyebrow="Company configuration · whole organisation" title="Settings" period={false} stats="settings" />
      <Reveal className="sc-layout">
        <aside className="sc-nav" aria-label="Settings sections">
          <SettingsSearch onPick={(id) => go(id)} />
          {GROUPS.map((g) => (
            <div key={g.label} className="sc-nav-group">
              <span className="sc-nav-label">{g.label}</span>
              {g.sections.map((s) => (
                <button key={s.id} type="button" className={s.id === current.id ? "is-active" : ""} aria-current={s.id === current.id ? "page" : undefined} onClick={() => go(s.id)}>
                  <s.icon size={16} />
                  <span>{s.label}</span>
                  {badges[s.id] ? <em>{badges[s.id]}</em> : null}
                </button>
              ))}
            </div>
          ))}
        </aside>
        <div className="sc-content">
          <header className="sc-content-head">
            <span className="sc-content-icon" aria-hidden="true">
              <current.icon size={20} />
            </span>
            <div>
              <h2>{current.label}</h2>
              <p>{current.hint}</p>
            </div>
          </header>
          {current.id === "overview" && <Overview go={go} />}
          {current.id === "profile" && <ProfileCard user={user} managedBy="the company (owner account)" />}
          {current.id === "company" && <CompanySection />}
          {current.id === "branches" && <BranchesSection action={action} onActionDone={clearAction} />}
          {current.id === "monitoring" && <MonitoringSection go={go} />}
          {current.id === "managers" && <ManagersSection />}
          {current.id === "staff" && <StaffSection action={action} onActionDone={clearAction} />}
          {current.id === "roles" && <RolesSection />}
          {current.id === "approvals" && <ApprovalsSection go={go} />}
          {current.id === "patients" && <PatientsSection go={go} />}
          {current.id === "billing" && <BillingSection go={go} />}
          {current.id === "referral" && <ReferralSection />}
          {current.id === "services" && <ServicesSection go={go} />}
          {current.id === "notifications" && <NotificationsSection />}
          {current.id === "security" && <SecuritySection />}
          {current.id === "appearance" && <AppearanceSection />}
          {current.id === "data" && <DataSection />}
          {current.id === "integrations" && <IntegrationsSection />}
          {current.id === "audit" && <AuditSection />}
          {current.id === "system" && <SystemSection />}
        </div>
      </Reveal>
    </AnimatedPage>
  );
}

/** Search settings by name or by what they control ("discount", "patient id", "backup"…). */
function SettingsSearch({ onPick }: { onPick: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const term = q.trim().toLowerCase();
  // Best matches first: the section name, then its description, then what it controls.
  const results = useMemo(() => {
    if (!term) return [];
    const score = (s: Section) => (s.label.toLowerCase().includes(term) ? 0 : s.hint.toLowerCase().includes(term) ? 1 : s.keywords.toLowerCase().includes(term) ? 2 : 9);
    return ALL.map((s) => ({ s, n: score(s) }))
      .filter((x) => x.n < 9)
      .sort((a, b) => a.n - b.n)
      .slice(0, 7)
      .map((x) => x.s);
  }, [term]);
  const pick = (id: string) => {
    onPick(id);
    setQ("");
    input.current?.blur();
  };
  return (
    <div className="sc-search">
      <Search size={15} aria-hidden="true" />
      <input
        ref={input}
        value={q}
        placeholder="Search settings"
        aria-label="Search settings"
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") (e.preventDefault(), setActive((a) => Math.min(results.length - 1, a + 1)));
          else if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => Math.max(0, a - 1)));
          else if (e.key === "Enter" && results[active]) pick(results[active].id);
          else if (e.key === "Escape") setQ("");
        }}
      />
      {term && (
        <ul className="sc-search-results" role="listbox">
          {results.length === 0 ? (
            <li className="is-empty">No settings match “{q}”.</li>
          ) : (
            results.map((r, i) => (
              <li key={r.id}>
                <button type="button" role="option" aria-selected={i === active} className={i === active ? "is-active" : ""} onMouseEnter={() => setActive(i)} onClick={() => pick(r.id)}>
                  <r.icon size={15} />
                  <span>
                    <b>{r.label}</b>
                    <small>{r.hint}</small>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
