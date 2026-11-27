# STANLEY Current State Audit

Audit date: 2026-11-27  
Scope: both accessible STANLEY repositories in C:\Users\Stanley. This is a source and configuration audit. Local demo behavior does not imply production service behavior.

## Executive summary

The accessible “desktop” repository is a React/Vite browser application, not an Electron application: it has no Electron main process, preload, IPC bridge, native packaging configuration, database driver, or server. The “mobile” repository is also a React/Vite web application, not React Native or Expo. It has mobile-oriented screens and browser storage, but no native project or service worker was found. Both contain substantial interactive workflows and sample/local persistence; neither currently has authenticated accounts or a remote application API.

Both apps contain client-side workflow logic for staff, branch operations, marketing/PR, reporting and messaging. Authorization is largely navigation/UI gating and local business logic. It is not a security boundary against a user who can modify the browser or local storage. Mobile sign-in screens are disabled and its API module is stubbed. Desktop inbox content is localStorage/IndexedDB data. Mobile clinician chat uses device-key AES-GCM encryption, but that is not server-side identity or account authorization.

Therefore, production Assistant Manager support with backend-enforced permissions and private account chat cannot be delivered safely within the current architecture. This report completes the required audit-first step. Production role/account isolation needs authenticated identity plus a trusted backend/API or a properly secured native desktop IPC/database boundary. A client-only demo role must not be described as meeting the security requirements.

## Repositories and source control

| Repository | Branch and HEAD | Working tree at audit | Recent development |
|---|---|---|---|
| Stanley Admin Dashboard Designs | feature/company-admin-redesign, 352ee4f | Modified src/features/staff/StaffWorkspace.tsx, src/styles/staff.css | Marketing tasks, bonus, rules of engagement, transfers and dormant hospitals; preceded by money/weekly targets, sample split, marketer ownership/targets, staff queries/deactivation and PR permission work. |
| STANLEY PR Agent App | main, 9a384eb | Modified src/admin/pages/Reports.tsx, src/admin/pages/Staff.tsx | Mobile marketing manager/admin pages, marketer tasks, rules, transfers and cautions; preceded by target coaching, analysis, announcements and dashboard work. |

The four uncommitted files are pre-existing user work for report preview/download and staff-page actions. They were inspected and left untouched. No staged changes were reported. No database migrations or recent dependency additions were found in the examined history. Do not reset, clean, or overwrite these files.

## Architecture and technology

### Desktop repository

- React 19 + TypeScript 5.7, Vite 8.0.5, Tailwind CSS v4. package.json scripts build/run a Vite app; there are no Electron dependencies or main/preload entrypoints.
- Entry/state/routing: src/main.tsx, src/App.tsx, src/app/AppState.tsx, src/app/router.ts; hash-based client routing. Router comments describe a possible future Electron shell.
- Feature areas are divided under src/features/ and shared shell/components under src/shell/ and src/components/, with services under src/services/.
- AppState and service modules keep state in browser storage. Staff records use localStorage; inbox uses localStorage plus IndexedDB attachments. No SQL schema, migration system, API client, database, or cloud sync implementation was found.
- The account switch/demo identity is app state, not authentication. Sample and legacy data coexist with locally edited records.
- The app is usable in-browser with its local data, but no service worker or background sync was found. Offline use is limited to already loaded resources and local data; it is not a verified offline-first sync system.

### Mobile/PR Agent repository

- React 19 + TypeScript 5.7, Vite 8.1.7, Tailwind CSS v4. It is a mobile-oriented web app, not React Native/Expo. No native project, mobile build config, manifest or service worker was found in the inspected structure.
- Entry and app switching: src/main.tsx, src/app/Root.tsx, src/domain/role.ts. scripts/sync-company.mjs copies shared business logic into src/company/ from the desktop repository; this is generated logic, not a live shared package.
- Admin/branch workspaces are under src/admin/ and src/staff/; PR/marketer workspace under src/marketer/; clinician portal under src/screens/ and src/domain/.
- src/domain/api.ts is explicitly stubbed: requests fail, fetches return null, and syncQueue() is empty. It is not connected to a backend.
- src/domain/vault.ts encrypts selected patient/referral data using browser AES-GCM and a device-local key. This protects selected local data at rest but does not establish authenticated account identity or remote access control.

## Feature inventory

Status key: **Implemented and verified** means confirmed by source and/or recorded build/type checks, not production-service verification. **Implemented but not fully verified** means the UI and client logic exist but external, account or deployment behavior is absent or unverified. **Partially implemented** means some path exists while important integration or security is missing.

### Desktop/company and branch workspaces

| Feature | Location and purpose | UI and client behavior | Persistence, permissions, connectivity | Status / limitation |
|---|---|---|---|---|
| Company dashboard/navigation | src/shell/navigation.ts, src/features/company/ | Company dashboard and module navigation. | Local/sample records; client role gating; no cloud or server authorization. | Implemented but not fully verified; browser demo. |
| Branch dashboard/context | src/features/branch/, src/app/AppState.tsx | Shared branch modules and branch context. | Local sample/current branch; client identity and permissions. | Implemented but not fully verified; branch is not bound to an authenticated account. |
| Branch/company staff | src/features/staff/StaffWorkspace.tsx, src/data/userRecords.ts, src/services/permissions.ts | Staff list/profile, local add/edit/deactivate and role records. | Browser storage and sample data; permission controls are local; no account provisioning service. | Implemented but not fully verified; creation is not real identity provisioning. |
| Inventory/catalog | Inventory feature modules and services | Catalog and inventory views/workflows. | Local data; client role gates; no server sync. | Implemented but not fully verified. |
| Patients, billing and records | Branch feature modules and services | Local patient/operational records and billing workflows. | Browser/local demo storage; no server database. | Implemented but not fully verified; not a production clinical records service. |
| PR/marketers and hospitals | src/features/marketing/MarketingPage.tsx, dialogs.tsx, data.ts, src/services/marketing.ts | Marketer/hospital ownership, monthly money targets, tasks/bonus/policy, transfers and dormant-hospital workflows. Functions include setTarget, setHospitalOwner, requestRelease, directMove, decideTransfer. | Client persistence and UI permission checks; no trusted authorization. | Client workflow exists; secure authority enforcement absent. Ownership reassignment and transfer approval are distinct paths and both need control. |
| Finance and expenses | Finance/expense feature modules | Operational finance and expense interfaces/reports. | Local/sample records; no server persistence. | Implemented but not fully verified. |
| Reports, analytics, print/export | Reporting/analysis modules | Report views, print/PDF/CSV-style output and analytics. User's current uncommitted staff change routes list download into in-app preview. | Generated on client from local records; no central reporting service. | Implemented but not fully verified. |
| Messages/inbox | src/services/inbox.ts, src/features/inbox/InboxPage.tsx | Inbox, role/context conversations, read state and attachments. Party IDs include admin, mgr:<branch>, fd:<branch>, pr:<agent>. | stanley.inbox.v2 localStorage and stanley-inbox-files IndexedDB; reads keyed by party. No remote delivery/auth. Multiple managers in a branch would share mgr:<branch>. | Partial; not private account messaging. Local routes/storage are user-modifiable. |
| Settings, audit, trash/recovery/backup | Settings and service modules | Settings, local activity, trash/recovery and local backup affordances. | Browser-side only. | Implemented but not fully verified; records are not tamper-resistant server logs and backup is not cloud recovery. |
| AI assistant | src/services/assistant/engine.ts | Deterministic rules/records-based help desk, calculations, issue/report and scanning flows. | No model integration, remote inference or AI conversation service. | Implemented as local rules; LLM/automation not found. |
| Notifications/search/calculator/other tools | Feature and shared component modules | Local interface and calculation/search support. | No push notification backend or background service found. | Partial/local; no remote delivery. |

The “desktop” codebase is not an Electron app despite the requested audit heading. These entries describe code in the accessible repo, not a deployed service or live database.

### Mobile application and PR Agent

| Feature | Location | What is present | Status / integration |
|---|---|---|---|
| Role switch and workspaces | src/app/Root.tsx, src/domain/role.ts | Admin, manager, frontdesk, marketer and clinician app paths; role stored as stanley.dev.role. | Interactive local routing, not signed-in account role. |
| PR Agent/Marketer dashboard | src/marketer/MarketerApp.tsx and marketer pages | Dashboard, hospitals, analysis, inbox, activity, reports, rules, settings, alerts; targets/progress, follow-ups/tasks, bonuses and announcements. | Substantial client UI and sample/local data; no connected API or authenticated identity. PR Agent maps to Marketer here. |
| Hospital, referral and service flows | src/marketer/, src/screens/referrals/, src/data/ | Marketer hospital/visit tracking and clinician referral/patient/service paths. | Local datasets/browser storage; api.ts prevents claims of live submission/sync. |
| Earnings, commissions, targets/incentives | Marketer dashboard/analysis and shared marketing logic | Target and performance displays, monetary progress/bonus and manager controls. | Client calculations/local data; not payroll or commission settlement. |
| Messaging | src/domain/chat.ts, src/screens/chat/, src/marketer/chat.ts | Clinician/PR chat UI and per-marketer conversation-key conventions; manager/frontdesk IDs are fixed/shared in team data. | Clinician chat encryption is device-local; no authenticated backend. Manager private inbox isolation is absent. |
| Authentication/account | src/domain/account.ts, src/app/Gate.tsx, src/screens/auth/Auth.tsx | Registration/PIN/OTP/biometric UI and code. | AUTH_SCREENS_ENABLED and SIGN_IN_ENABLED are false; Gate bypasses auth and uses sample data. Demo OTP/account code is not production authentication. |
| Patient data vault | src/domain/vault.ts and secure-store/referral modules | AES-GCM encrypted local storage for selected patient/request data. | Device-local key/storage only; not server authorization, backup or shared-account boundary. |
| API and synchronization | src/domain/api.ts | API placeholders and queue entrypoints. | Stub: no API server, requests fail, sync is no-op; cloud sync not implemented. |
| Notifications/announcements/support | Mobile admin/marketer screens and announcement modules | Local announcements, alerts and issue/report UI. | Local state; no verified push or account-targeted service. |
| Native/offline installation | Project configuration | Responsive mobile web experience. | React Native/Expo and verified PWA service worker/offline sync not found. |

## Authentication, roles and permissions

Desktop src/services/permissions.ts defines Company Admin, Branch Manager and Front Desk in persisted stanley.permissions.v1 settings. Staff data includes Branch Manager, Front Desk and Marketer; a job label is not necessarily an app role. can() and page/navigation checks gate client controls. Company Admin receives broad allow behavior; Branch Manager defaults broadly within branch; Front Desk is restricted from manager-only pages; Marketer is excluded from manager pages.

Mobile src/domain/role.ts includes admin, manager, frontdesk, marketer and clinician, but selection is a developer/local role switch, not an authenticated session. Mobile admin/branch workspace is separate from marketer and clinician workspaces. Assistant Manager is not registered in either role model. The mobile role union and generated shared data also need compatibility treatment.

| Capability | Company Admin | Branch Manager | Front Desk | Marketer/PR Agent | Clinician |
|---|---|---|---|---|---|
| Company-wide admin | Broad client allow | No company admin | No manager-only pages | Own PR workspace | Referral/patient workspace |
| Branch operations | Admin workflows | Default manager branch permissions | Day-to-day subset | Own hospitals/tasks/analysis | Own referrals/patient flows |
| Staff/user management | Company/staff controls | Branch staff controls | Not manager-only actions | Not available | Not available |
| Monthly marketer targets | Admin controls | Manager UI calls setTarget | UI gated | Own target/progress | N/A |
| Hospital ownership/transfers | Admin controls | Manager screens invoke ownership/transfer functions | UI gated | Own hospital workflows | N/A |
| Direct API/IPC/service authorization | None: no trusted server/IPC | None | None | None | None |

This matrix describes client affordances and local service behavior, not secure authorization. Hiding a page or disabling a button does not protect data in the same browser profile. Staff roles and branch assignments are local records; “switch account” selects demo identities. No account provisioning endpoint or trusted branch-membership lookup was found.

## Messaging and account isolation

### Desktop

src/services/inbox.ts stores message metadata/body in localStorage stanley.inbox.v2 and attachment blobs in IndexedDB stanley-inbox-files. Parties are role/context IDs, not verified account IDs. Manager party is mgr:<branchId>; read markers use the party key. Drafts and private notification delivery are not backed by an authenticated service. Two manager-like users in one branch share the same manager party, and direct routes/local data are not protected.

### Mobile

src/domain/chat.ts encrypts locally persisted chat content and attachments using a browser device vault, with identifiers/read metadata outside that ciphertext. Team identities include fixed manager, frontdesk and admin IDs; manager chat is branch-role-oriented. Marketer chat keys include marketer IDs, but those IDs are selected locally and do not provide authenticated isolation. Device-key destruction is not remote account ownership or notification control.

Neither app meets the private Branch Manager vs Assistant Manager inbox requirement. Conversation ownership, read state, drafts, attachments and notifications require authenticated owner/participant checks. Account IDs cannot be securely substituted into the current model without actual sign-in identity and a trusted data layer.

## Database, integrity and synchronization

- No database engine, schema, tables, migrations, constraints, indexes or server repository was found in either repo.
- Persistence uses localStorage/IndexedDB and bundled legacy/sample JSON. There are no foreign keys or transactional guarantees. Branch/user ownership is application data and can be modified client-side.
- No server query scoping, sync conflict resolution, tamper-resistant audit log, or cloud backup exists. Trash/recovery is local behavior.
- Risks include duplicate local identities, stale generated shared data, branch/account ownership modified in storage, role-shared inbox keys, and non-transactional updates across local stores. Live database corruption/migration risks cannot be evaluated because no database exists.

## AI, automation, notifications

Desktop assistant is the deterministic local rules/records engine in src/services/assistant/engine.ts. No model/provider API, model key usage, online/offline inference, agent tool runner or persistent AI memory was found. No mobile AI/model integration was found. Alerts, announcements and activity/report features exist locally, but push/background delivery and account-specific notification services are not connected.

## Build, tests and reliability

- Both manifests provide Vite development/build scripts and TypeScript tooling. No automated unit, integration, end-to-end, permission, DB, offline or sync test suite was identified; no test runner script was found in either package manifest.
- TypeScript and production build checks are appropriate non-destructive checks for these browser apps, but cannot validate backend security because no backend exists. Execution results are recorded after checks below.
- Deployed-browser behavior, multi-device behavior, accessibility and service failure modes were not verified from source.
- Outstanding TODOs include eventual Electron shell/backend/cloud sync and removal of mobile developer role switching once sign-in determines identity. The API module documents unimplemented server work.

## Known limitations and security findings

1. Electron/native targets are not present: desktop is Vite/React; mobile is browser React, not React Native.
2. Authenticated identity is absent/disabled; role selection is a developer/demo switch.
3. Trusted authorization is absent. Client gating and local permissions are bypassable and cannot secure managerial actions or patient/staff data.
4. No database or migrations exist to extend.
5. Remote API/cloud sync is absent/stubbed.
6. Private manager inboxes are absent. Desktop manager identity is branch-role scoped; mobile manager identity is a shared role ID. Device encryption does not resolve ownership.
7. PR Agent features are substantial local workflows, not live-connected referrals, earnings settlement or messaging.
8. No automated regression suite covers direct calls, role bypass, account isolation or cross-device behavior.
9. Browser storage and user-editable identity are not production protection for healthcare data without a reviewed service/security architecture.

## Recommended priorities

1. Confirm deployment targets (web, Electron, native mobile); repository labels and requested architecture do not match actual code.
2. Establish authenticated accounts and trusted authorization. Bind user ID, role and branch membership to verified identity.
3. Define Assistant Manager policy at the trusted service boundary. Preserve monthly marketer targets and separate transfer/reassignment workflows.
4. Design account-owned conversations and attachment/read/draft/notification checks before exposing separate manager inboxes. Migrate legacy shared-role chat conservatively.
5. Define real persistence schema and forward migrations after ownership/deployment decisions.
6. Add API/service tests for direct-call authorization, branch scope, role restrictions, chat isolation and regressions.
7. Keep generated mobile shared logic synchronized and add explicit provenance/checks for scripts/sync-company.mjs.
8. Preserve and review the current user changes through the normal workflow; this audit did not edit them.

## Evidence references

- Desktop setup/state/routes: package.json, src/main.tsx, src/App.tsx, src/app/AppState.tsx, src/app/router.ts.
- Desktop permissions/identities: src/services/permissions.ts, src/data/userRecords.ts, src/shell/navigation.ts.
- Desktop inbox/marketing: src/services/inbox.ts, src/features/inbox/InboxPage.tsx, src/services/marketing.ts, src/features/marketing/MarketingPage.tsx.
- Desktop assistant: src/services/assistant/engine.ts.
- Mobile role/gate/API: src/domain/role.ts, src/domain/account.ts, src/app/Gate.tsx, src/domain/api.ts, src/app/Root.tsx.
- Mobile encryption/chat/PR workspace: src/domain/vault.ts, src/domain/chat.ts, src/marketer/MarketerApp.tsx, src/marketer/chat.ts, src/admin/marketingPage.tsx.
- Shared logic generation: scripts/sync-company.mjs and src/company/.

## Verification results

TypeScript and production build checks were run in both repositories, with output directed to unique temporary directories:

- Desktop: pnpm exec tsc --noEmit passed; pnpm exec vite build passed (Vite 8.0.5).
- Mobile: pnpm exec tsc --noEmit passed; pnpm exec vite build passed (Vite 8.1.7).
- Both builds emitted a chunk-size advisory for a JavaScript chunk over 500 kB. No build failure occurred.
- No automated application/security tests were added or run. There is no test script/runner in these projects, and there is no trusted API/database layer on which to execute the requested direct-access security tests.

## Post-audit update — Assistant Manager development layer

This addendum records changes made after the source inventory above. The audit remains a record of the pre-implementation system. The revised user brief places mock role/account behavior in the current UI/business-logic layer and explicitly defers trusted backend authorization and native packaging.

- Assistant Manager is now a desktop branch role and mobile role-switch option. It reuses the Branch Manager workspace.
- Amina Yusuf (STF-0012, username label assistant.manager.demo, active Demo account) was added to the same Abuja demo branch as the existing Branch Manager. Existing saved staff lists gain the mock account once without replacing their current data.
- Assistant Manager dynamically inherits Branch Manager permission grants, except for fixed restrictions on monthly marketer target/task configuration, transfer decisions and direct ownership reassignment. Existing target, transfer and direct reassignment flows remain available to the Branch Manager. Staff management stays available to both manager roles.
- Local inbox identities now distinguish the Assistant Manager account from the existing Branch Manager identity; legacy manager conversation IDs remain unchanged. Mobile chat/read-state IDs are keyed by Assistant Manager account ID.
- This local model supports development testing only. Authentication, account ownership enforcement, remote/private messaging, database migrations and cloud notifications remain not found/deferred.
- The current-state audit was not rewritten; the continuing record is docs/STANLEY_MASTER_DEVELOPMENT_RECORD.md and implementation detail is docs/audits/ASSISTANT_MANAGER_IMPLEMENTATION.md.
