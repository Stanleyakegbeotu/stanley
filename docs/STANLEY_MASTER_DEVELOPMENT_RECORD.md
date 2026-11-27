# STANLEY Master Development Record

Last updated: 2026-11-27

This document is the continuing project reference. The current-state audit remains historical evidence of what existed before the Assistant Manager development-layer implementation; this record reflects the current state.

## Project development strategy

STANLEY is being developed in layers:

1. **Layer 1 — UI, features, workflows and business logic.** Current work includes feature refinement, corrections, permission development, role expansion and desktop/mobile feature parity.
2. **Layer 2 — Backend, authentication, database and trusted authorization.** Planned for a future integration phase.
3. **Layer 3 — Electron desktop packaging and React Native mobile implementation.** Planned; current accessible repositories are browser React/Vite apps.
4. **Layer 4 — Offline-first architecture and cloud synchronization.** Planned; current data persistence is primarily browser-local.
5. **Subsequent layers — Additional planned features and integrations.**

The absence of Electron, React Native, a backend and trusted production authorization is recorded as deferred integration work for those layers. The present development-stage mock workflows are not production authentication or security.

## Current development stage

**Feature refinement, corrections, permission development, role expansion and desktop/mobile feature parity.**

Both active repos are currently web clients. The selected roles/accounts are development switches and locally persisted demo data.

## Assistant Manager

### Role and account

- Display name: Assistant Manager
- Role identifier: assistant_manager
- Desktop display-role convention: Assistant Manager
- Development mock account: **Amina Yusuf**
- Username label: assistant.manager.demo
- Account type: Demo account
- Status: Active
- Account record ID: STF-0012
- Assigned branch: same Abuja demo branch as Branch Manager Chioma Okafor
- No credentials or PIN are configured; the username is a mock account label, not a login credential.

### Workspace and permission policy

- Uses the existing Branch Manager workspace, routes, navigation, page components and operational screens on desktop and mobile.
- Role identity does not select a different dashboard design.
- Inherits the current Branch Manager permission grants dynamically, except for three fixed Branch Manager-only capabilities:
  1. Configure monthly marketer targets (including monthly task/target setup).
  2. Approve/reject/finalize hospital transfers.
  3. Directly reassign hospital ownership.
- May view target progress, marketer records, hospitals and transfer information. The existing request-release workflow remains available where it requests a marketer's agreement; direct execution and final decisions remain restricted.
- Can view/add/manage staff using the existing staff workflow in the assigned demo branch.
- Company Admin, Front Desk, Marketer/PR Agent and Clinician policy/workspaces remain unchanged.

### Account-specific inbox behavior

- Desktop keeps the existing Branch Manager mgr:<branch> identity and conversation history.
- Assistant Manager uses assistant_manager:<accountId> as its local party identity. Its conversation threads and read markers are separate. The account has counterpart threads for Company Admin, the Branch Manager, front desk and PR agents.
- Mobile retains the existing Branch Manager conversation IDs and uses the Assistant Manager account ID in its staff inbox conversation identity. Local message/read storage is therefore distinct from the Branch Manager account.
- Account-specific browser storage keys are development data separation, not production privacy/security. No server ownership authorization, cross-device sync or push notification delivery exists.

### Implementation status

| Capability | Desktop | Mobile | Status |
|---|---|---|---|
| Role registration | Human-readable role integrated into permissions and staff records | assistant_manager role added to developer role switch | Implemented |
| Mock account | Seeded Amina Yusuf record in Branch Manager demo branch; older saved staff lists gain it once | Uses synchronized staff record and role switch account ID | Implemented |
| Shared Branch Manager workspace | Same branch router, shell and pages | Same StaffApp/branch page components | Implemented |
| Permission inheritance | Dynamically follows Branch Manager grants, with three non-grantable restrictions | Uses synchronized desktop permission service | Implemented |
| Monthly targets | UI control unavailable; target/task service mutation checks policy | UI control unavailable/disabled; service mutation checks policy | Implemented |
| Transfer decision | Approval/rejection UI unavailable; decision service checks policy | Approval/rejection UI unavailable; decision service checks policy | Implemented |
| Direct reassignment | Move-now, ownership-save and split controls are restricted; mutation functions check policy | Owner/save and split controls restricted; mutation functions check policy | Implemented |
| Staff creation | Existing branch Staff Management and form shared by both roles | Existing mobile Staff page and form shared by both roles | Implemented |
| Private inbox identity | Assistant party key is distinct; manager key/history preserved | Account-aware staff conversation IDs; manager IDs preserved | Implemented for local demo behavior |
| Production authentication/authorization | No trusted service exists | Auth screens/API remain disabled/stubbed | Deferred to backend integration |
| Automated regression suite | No existing test runner | No existing test runner | No suite exists; type checks, production builds and focused runtime policy/identity checks passed |

## Broader feature status snapshot

Status means source-level development status, not production-service verification.

- Branch/company dashboards and workflow screens: **Implemented but requires verification** against final browser behavior.
- Marketing targets, tasks, bonuses, hospital ownership and transfer flows: **Implemented** as local business workflows; remote authority/persistence is deferred.
- Staff records and local add/edit workflows: **Implemented**; production account provisioning is deferred.
- Desktop and mobile inbox/chat interfaces: **Implemented** locally; cloud delivery, remote ownership and notification services are **Deferred to backend integration**.
- Sign-in/authentication: Mobile UI/code exists but auth is disabled; **Partially implemented**.
- Cloud API/sync and remote database: **Planned / Deferred to backend integration**.
- Electron shell and React Native clients: **Deferred to native integration**.
- Desktop deterministic assistant: **Implemented** local rules/records logic; LLM integration is **Planned**.
- Automated tests: **Partially implemented**; no automated test runner or suite was found.

For the detailed pre-role inventory and evidence, see docs/audits/STANLEY_CURRENT_STATE_AUDIT.md. For Assistant Manager implementation detail and known limits, see docs/audits/ASSISTANT_MANAGER_IMPLEMENTATION.md.

## Future integration requirements

1. Replace developer role/account switching with authenticated account identity.
2. Enforce role permissions and branch membership in a trusted backend or native IPC/service boundary.
3. Persist messages, attachments, drafts, per-account read state and notifications with participant authorization.
4. Add schema and migration support only in the selected backend/database.
5. Add service/API tests for target restrictions, transfer decisions, direct reassignment, staff branch scope and cross-account inbox access.
6. Preserve existing Branch Manager party keys/history during any messaging migration.
