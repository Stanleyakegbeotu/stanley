# Assistant Manager Implementation Report

Date: 2026-11-27  
Status: **Development/mock role implemented in desktop and mobile; production authorization deferred**

## Revised scope and result

The revised development instruction explicitly authorizes UI/business-logic role support and a development mock account now, with trusted backend authorization and native packaging in later layers. The Assistant Manager, Amina Yusuf mock record, shared branch workspace, restricted marketing actions, staff access and separate account-keyed inbox identity have been implemented across both current web apps.

The existing architecture still has no production authentication or trusted service boundary:

- The desktop repository is a browser React/Vite app with localStorage/IndexedDB, not Electron. There is no main/preload process, IPC, backend or database.
- The mobile repository is a browser React/Vite app. Authentication is disabled, the role switch is local/developer-controlled, and the API/sync implementation is stubbed.

The UI and local business-logic policy support development testing. Browser storage and a demo account are not production security; server ownership, tamper-resistant authorization and cross-device delivery remain deferred.

## Requested behavior mapped to current extension points

### Role definition and permission inheritance

The existing desktop role/permission extension point is src/services/permissions.ts, with role data in src/data/userRecords.ts, app identity/state in src/app/AppState.tsx, and navigation/page checks under src/shell/. Mobile has a separate role union and developer switch in src/domain/role.ts, workspace selection in src/app/Root.tsx, and generated shared business data under src/company/.

Assistant Manager is a branch-level management role sharing Branch Manager's existing branch workspace. Desktop permissions dynamically inherit Branch Manager grants, with explicit fixed denials for:

1. Creating, changing, resetting or deleting monthly marketer targets.
2. Approving/performing hospital transfers.
3. Direct hospital ownership reassignment.

These remain separate permissions and service checks: marketing.targets.manage, marketing.transfers.decide and marketing.hospitals.reassign. Local service functions check the acting role, and the UI hides/disables the matching controls. Branch membership comes from the selected local account record in this development phase and is not server-verified.

### Staff creation and shared branch dashboard

Current staff list/profile and local add/create flows are in the desktop staff feature and mobile admin staff pages. Both Branch Manager and Assistant Manager use the existing shared branch workspace and staff page through the same app shell. The form stores local records and does not provision an authenticated production account.

### Private account messaging

The desktop inbox extension point is src/services/inbox.ts plus src/features/inbox/InboxPage.tsx; current manager party IDs are mgr:<branchId>. The mobile chat extension points are src/domain/chat.ts, src/marketer/chat.ts and chat screens; manager identity is currently a shared role ID. Neither model has verified account participants.

The required architecture needs every conversation and draft to carry server-validated owner/participant account IDs; read/unread state must be per account; attachment reads and notification delivery must check those same identities. Changing the manager party key to a locally selected account ID is not sufficient because the account selector is mutable and storage is client-accessible. The legacy branch-manager inbox must not be automatically copied or exposed to a new assistant account.

## Account-specific inbox

Desktop keeps the existing Branch Manager party key unchanged, preserving its history. Assistant Manager uses assistant_manager:<accountId>; read state and conversation thread IDs therefore differ for the mock account. The desktop inbox offers separate counterpart threads to the Company Admin, Branch Manager, front desk and agents.

Mobile uses the existing staff inbox/chat system with an account-aware identity derived from the role and staff ID. The Branch Manager's legacy manager conversation keys remain unchanged; Assistant Manager uses assistant_manager:<accountId> keys, which also scope local message/read data. The mobile admin inbox includes a separate assistant account conversation entry.

This is local development separation only. There is no server participant authorization, remote notification delivery or cross-device inbox synchronization in the current repos.

## Database changes and migrations

None made. Neither repo contains a database or migration framework to extend. Creating a new local schema here would not satisfy the required server-side ownership enforcement and would invent deployment behavior.

After the identity/backend target is selected, the service design needs to define durable users, branch membership, role assignment, conversation participants/ownership, messages, account-specific read state, drafts, attachment access and migrations. No table names or migration format are prescribed here because there is no existing schema to preserve.

## Files changed

Changed application and documentation files include:

- Desktop role, permission and mock-record work: src/data/userRecords.ts, src/app/AppState.tsx, src/services/permissions.ts, src/services/marketing.ts, src/features/settings/admin/Staff.tsx, src/features/settings/admin/Roles.tsx, src/features/inbox/InboxPage.tsx and marketing views/dialogs.
- Mobile role/account routing and chat: src/domain/role.ts, src/app/Root.tsx, src/staff/StaffApp.tsx, src/staff/chat.ts, src/admin/access.ts, src/admin/chat.ts, src/admin/marketingPage.tsx and src/admin/marketersCard.tsx.
- Generated shared policy/data synchronized into mobile src/company/ through scripts/sync-company.mjs.
- docs/STANLEY_MASTER_DEVELOPMENT_RECORD.md and this report.

The four earlier uncommitted staff/report files remain untouched.

## Tests and verification

- Desktop and mobile `pnpm exec tsc --noEmit`: passed.
- Desktop and mobile Vite production builds: passed. Both report the existing large-chunk warning; no build errors.
- Focused runtime policy checks passed for dynamic Branch Manager grant inheritance, the three Assistant Manager marketing denials, and unchanged Front Desk/Company Admin decisions.
- Service-level checks passed for denied Assistant Manager target/task/ownership/transfer mutations and the allowed release-request flow.
- Mobile role/account routing and inbox identity checks passed; Assistant Manager uses the Abuja branch route and distinct account-keyed local conversation IDs.
- Desktop inbox identity checks passed; the Branch Manager's existing `mgr:<branchId>` thread key is preserved and the Assistant Manager receives distinct thread IDs.
- The focused runtime checks were temporary verification harnesses, not committed automated tests. Neither repo has an existing test runner/script.
- Neither repo has an automated test runner/script. Local business-logic checks can test the role rules; browser storage separation is not a security test against a modified client.

## Known limitations and future extension points

The development-layer implementation is complete. Actual server authorization, authenticated account provisioning, durable account ownership, notifications and server-backed private messaging remain outstanding. The mock username is an identifying label only and has no password, PIN or login behavior.

Required prerequisites for a secure implementation:

1. Choose the deployed targets and trusted service boundary. If Electron is intended, provide/establish the Electron main/preload/IPC architecture; for web/mobile, establish the authenticated backend/API.
2. Implement real account authentication and server-verified role/branch membership, replacing the demo role selector as the source of authority.
3. Add service-level policy tests for manager-only marketing operations and staff branch scope.
4. Add authenticated conversation/attachment access and account-specific read/draft/notification persistence, plus tests that attempt cross-account identifier access.
5. Introduce durable schema and forward migrations only within the selected backend/database.
6. Validate Branch Manager, Company Admin, Front Desk, Marketer and clinician regression behavior against that real service.

No additional Assistant Manager restrictions have been invented. Company Admin, PR/Marketer, patient, billing, inventory, referral, finance and reporting logic were not changed.
