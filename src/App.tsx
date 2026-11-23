// Branches added in Settings must join the live branch list before anything reads it.
import "@/services/org";
import { useEffect, useRef } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { CheckCheck, LogOut } from "lucide-react";
import { AppStateProvider, useApp } from "@/app/AppState";
import { branchRoute, type Route } from "@/app/router";
import { getBranch } from "@/data/company";
import { EASE } from "@/shared/motion";
import { Button } from "@/shared/ui/controls";
import { Modal } from "@/shared/ui/Modal";
import { Header } from "@/shell/Header";
import { Sidebar } from "@/shell/Sidebar";
import { COMPANY_NAV, BRANCH_NAV_ITEMS } from "@/shell/navigation";
import { CompanyDashboard } from "@/features/company/CompanyDashboard";
import { AuditPage, BranchesPage, FinancePage, InventoryPage, PatientsPage, PRPage, ReportsPage, StaffPage, TrashPage } from "@/features/company/pages";
import { SettingsPage } from "@/features/settings/AdminSettings";
import { BranchWorkspacePage } from "@/features/branch/pages";
import { AssistantDock } from "@/features/assistant/AssistantDock";
import { AssistantPage } from "@/features/assistant/AssistantPage";
import { PageProbeHost } from "@/features/assistant/PageProbeHost";
import { setPageRenderer } from "@/services/assistant/probe";
import { setReturnPath } from "@/services/assistant/store";
import { RecoveryBoundary } from "@/features/recovery/RecoveryBoundary";
import { HealthBanner, WelcomeBack } from "@/features/recovery/WelcomeBack";
import { scheduleDailyBackups } from "@/services/recovery/backups";
import { setSessionUser } from "@/services/recovery/health";
import { companyName } from "@/services/settingsStore";

function RouteView({ route }: { route: Route }) {
  const br = branchRoute(route);
  if (br) return <BranchWorkspacePage branchId={br.branchId} page={br.page} />;
  switch (route.segments[0]) {
    case "branches":
      return <BranchesPage />;
    case "inventory":
      return <InventoryPage />;
    case "staff":
      return <StaffPage />;
    case "pr":
      return <PRPage />;
    case "patients":
      return <PatientsPage />;
    case "finance":
      return <FinancePage />;
    case "reports":
      return <ReportsPage />;
    case "settings":
      return <SettingsPage />;
    case "audit":
      return <AuditPage />;
    case "trash":
      return <TrashPage />;
    case "assistant":
      return <AssistantPage mode="intelligence" base="" />;
    case "support":
      return <AssistantPage mode="issues" base="" />;
    default:
      return <CompanyDashboard />;
  }
}

/** The real page check draws any page from its path (services/assistant/probe.ts). */
function routeFromPath(path: string): Route {
  const [p, q = ""] = path.split("?");
  return { path: p, segments: p.split("/").filter(Boolean), query: new URLSearchParams(q) };
}
setPageRenderer((path) => <RouteView route={routeFromPath(path)} />);

function pageTitle(route: Route): string {
  const br = branchRoute(route);
  if (br) {
    const label = BRANCH_NAV_ITEMS.find((i) => i.id === br.page)?.label ?? "Dashboard";
    return `${label} · ${getBranch(br.branchId)?.name ?? "Branch"} · STANLEY`;
  }
  const label = COMPANY_NAV.find((i) => route.path.startsWith(i.path))?.label ?? "Dashboard";
  return `${label} · STANLEY`;
}

function Shell() {
  const { collapsed, route, toast, signOutOpen, setSignOutOpen, showToast, user, navigate } = useApp();
  const scroller = useRef<HTMLElement>(null);
  const br = branchRoute(route);
  const home = br ? `/branch/${br.branchId}/dashboard` : "/dashboard";
  const healthPath = br ? `/branch/${br.branchId}/settings?section=health` : "/settings?section=health";
  const area = pageTitle(route).split(" · ")[0];

  // Recovery: who is working (for the power-cut notice) and the automatic daily backup.
  useEffect(() => setSessionUser(`${user.name} (${user.role})`), [user.name, user.role]);
  const userRef = useRef(user.name);
  userRef.current = user.name;
  useEffect(() => scheduleDailyBackups(() => ({ company: companyName(), by: `Automatic daily backup (${userRef.current} signed in)` })), []);

  useEffect(() => {
    document.title = pageTitle(route);
    // Minimise / close in STANLEY AI return to the last page outside it.
    if (!/\/(assistant|support)$/.test(route.path)) setReturnPath(route.path + (route.query.toString() ? `?${route.query}` : ""));
  }, [route]);

  return (
    <div className="app-shell" data-collapsed={collapsed}>
      <RecoveryBoundary area="The sidebar" variant="widget">
        <Sidebar />
      </RecoveryBoundary>
      <motion.div className="workspace" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE, delay: 0.05 }}>
        <RecoveryBoundary area="The header" variant="widget">
          <Header />
        </RecoveryBoundary>
        <HealthBanner />
        <main ref={scroller} className="scroll-area thin-scroll" id="main">
          <div className="page-wrap">
            <AnimatePresence mode="wait" onExitComplete={() => scroller.current?.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior })}>
              <RecoveryBoundary key={route.path} area={area} variant="page" resetKey={route.path} onHome={() => navigate(home)} onScan={() => navigate(healthPath)}>
                <RouteView route={route} />
              </RecoveryBoundary>
            </AnimatePresence>
          </div>
        </main>
        {/* Docked bottom bar slot (mirror of the header) — pages such as Billing render their action bar here. */}
        <div id="workspace-footer" className="workspace-footer" />
      </motion.div>

      <RecoveryBoundary area="The assistant" variant="widget">
        <AssistantDock />
      </RecoveryBoundary>
      <WelcomeBack />
      <PageProbeHost />

      <AnimatePresence>
        {toast && (
          <motion.div className="toast" role="status" initial={{ opacity: 0, y: 16, x: "-50%" }} animate={{ opacity: 1, y: 0, x: "-50%" }} exit={{ opacity: 0, y: 10, x: "-50%" }}>
            <CheckCheck size={17} />
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <Modal
        open={signOutOpen}
        onClose={() => setSignOutOpen(false)}
        title="Sign out of STANLEY?"
        description="You will need to sign in again to access company and branch workspaces."
        footer={
          <>
            <Button variant="secondary" onClick={() => setSignOutOpen(false)}>
              Stay signed in
            </Button>
            <Button
              onClick={() => {
                setSignOutOpen(false);
                showToast("Signed out (demo — authentication is not connected yet)");
              }}
            >
              <LogOut size={16} /> Sign out
            </Button>
          </>
        }
      >
        <p className="hint" style={{ margin: 0 }}>
          Unsaved drafts stay on this device until they are submitted.
        </p>
      </Modal>
    </div>
  );
}

export default function App() {
  return (
    <AppStateProvider>
      <MotionConfig reducedMotion="user">
        <Shell />
      </MotionConfig>
    </AppStateProvider>
  );
}
