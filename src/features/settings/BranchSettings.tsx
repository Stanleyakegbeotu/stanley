/**
 * Branch workspace pages: Settings, Audit and Trash.
 *
 * Settings depends on who is signed in:
 *  • Branch Manager — controls the branch (details printed on receipts) and
 *    the staff accounts under it, plus their own profile and appearance.
 *  • Any other branch staff (front desk / receptionist, lab, accountant…) —
 *    strictly their own account: profile, what their role can do, appearance.
 * Company-wide settings (logo, company profile, roles) are only in the Company
 * Admin's Settings.
 */
import { BookOpenText, Building2, KeyRound, MessageSquareWarning, Stethoscope, Palette, ScrollText, ShieldCheck, Trash2, UserRound, Users } from "lucide-react";
import { MyRoleView, MySecurityView } from "./MyAccess";
import { useApp, TRASH_RETENTION_DAYS } from "@/app/AppState";
import { THEMES } from "@/app/themes";
import type { Branch } from "@/data/types";
import { MANAGER_ROLE } from "@/data/userRecords";
import { AnimatedPage } from "@/shared/motion";
import { PageHero } from "@/features/shared/PageHero";
import { AuditLogView, TrashLogView } from "@/features/admin/AdminLogs";
import { can, usePermissions } from "@/services/permissions";
import { BranchProfileForm, BranchStaffControl } from "./BranchForms";
import { ProfileCard } from "./ProfileCard";
import { SettingsFrame, ThemeCards, useSection, type SettingsSection } from "./SettingsFrame";
import { SystemHealthSection } from "@/features/recovery/SystemHealth";
import { ReportIssueSection } from "@/features/recovery/ReportIssue";
import { AboutAccountSection } from "@/features/recovery/AboutAccount";

const PROFILE: SettingsSection = { id: "profile", label: "My profile", icon: UserRound, hint: "Your own account — photo and contact details." };
const APPEARANCE: SettingsSection = { id: "appearance", label: "Appearance", icon: Palette, hint: "Colour theme for STANLEY on this device." };

// Read-only for everyone at the branch (owner, 2026-11-22): what the role can do and how the system is protected.
const ROLE: SettingsSection = { id: "access", label: "My role & permissions", icon: KeyRound, hint: "Your role, the permissions it has, and the pages and reports it opens. Read-only." };
const SECURITY: SettingsSection = { id: "security", label: "Security & access", icon: ShieldCheck, hint: "How STANLEY controls access and protects the branch's records. Read-only." };

// Recovery & help (owner, 2026-11-22) — for every account at the branch.
const ABOUT: SettingsSection = { id: "about", label: "About my account", icon: BookOpenText, hint: "Your role in plain words — your job, everyday tasks, what you can and can't do, the rules and who to ask." };
const HEALTH: SettingsSection = { id: "health", label: "System health", icon: Stethoscope, hint: "Scan for errors — STANLEY checks itself, fixes what it can and tells you plainly about the rest. Backups and recent problems." };
const ISSUE: SettingsSection = { id: "issues", label: "Report an issue", icon: MessageSquareWarning, hint: "Say what's wrong or what you're looking for in your own words — STANLEY points you to it, shows the steps, or scans for the cause." };

const MANAGER_SECTIONS: SettingsSection[] = [
  { id: "branch", label: "Branch profile", icon: Building2, hint: "This branch's contact details and opening hours — printed on receipts and quotes." },
  { id: "staff", label: "Branch staff", icon: Users, hint: "The staff accounts under this branch and their account status." },
  PROFILE,
  ABOUT,
  ROLE,
  SECURITY,
  HEALTH,
  ISSUE,
  APPEARANCE,
];

const STAFF_SECTIONS: SettingsSection[] = [PROFILE, ABOUT, ROLE, SECURITY, HEALTH, ISSUE, APPEARANCE];

export function BranchSettingsPage({ branch }: { branch: Branch }) {
  const { user, theme, staff } = useApp();
  // Branch sections follow the role's permissions (Settings → Roles & Permissions).
  usePermissions();
  const isManagerView = user.kind === "manager" && (can(user.role, "branch.settings") || can(user.role, "staff.manage"));
  const sections = isManagerView ? MANAGER_SECTIONS : STAFF_SECTIONS;
  const current = useSection(sections);
  const basePath = `/branch/${branch.id}/settings`;
  const branchStaff = staff.filter((s) => s.branchId === branch.id);

  return (
    <AnimatedPage>
      <PageHero
        eyebrow={isManagerView ? `Branch configuration · ${branch.name}` : `My account · ${branch.name} branch`}
        title={isManagerView ? "Settings" : "My settings"}
        period={false}
        icon={isManagerView ? Building2 : UserRound}
        strip={[
          { label: "Signed in as", value: `${user.name} · ${user.role}` },
          { label: "Branch", value: `${branch.name} · ${branch.code}` },
          ...(isManagerView ? [{ label: "Staff accounts", value: String(branchStaff.length) }] : []),
          { label: "Theme", value: THEMES.find((t) => t.id === theme)?.name ?? theme },
          { label: "Saved", value: "On this device" },
        ]}
      />
      <SettingsFrame sections={sections} current={current} basePath={basePath}>
        {current.id === "branch" && <BranchProfileForm branch={branch} />}
        {current.id === "staff" && <BranchStaffControl branch={branch} />}
        {current.id === "profile" && <ProfileCard user={user} managedBy={isManagerView ? "the Company Admin" : `your ${MANAGER_ROLE}`} />}
        {current.id === "about" && <AboutAccountSection />}
        {current.id === "health" && <SystemHealthSection />}
        {current.id === "issues" && <ReportIssueSection />}
        {current.id === "access" && <MyRoleView user={user} branch={branch} />}
        {current.id === "security" && <MySecurityView user={user} branch={branch} />}
        {current.id === "appearance" && (
          <>
            <p className="hint" style={{ marginTop: 0 }}>
              The theme applies to the whole app on this device. The company logo and name are set by the Company Admin.
            </p>
            <ThemeCards />
          </>
        )}
      </SettingsFrame>
    </AnimatedPage>
  );
}

export function BranchAuditPage({ branch }: { branch: Branch }) {
  return (
    <AnimatedPage>
      <PageHero eyebrow={`Read-only record · ${branch.name} branch`} title="Audit" period={false} icon={ScrollText} stats="audit" scope={[branch.id]} />
      <AuditLogView scope={[branch.id]} branchMode />
    </AnimatedPage>
  );
}

export function BranchTrashPage({ branch }: { branch: Branch }) {
  const { user } = useApp();
  return (
    <AnimatedPage>
      <PageHero eyebrow={`Recoverable for ${TRASH_RETENTION_DAYS} days · ${branch.name} branch`} title="Trash" period={false} icon={Trash2} stats="trash" scope={[branch.id]} />
      <TrashLogView scope={[branch.id]} readOnly={!can(user.role, "trash.restore")} />
    </AnimatedPage>
  );
}
