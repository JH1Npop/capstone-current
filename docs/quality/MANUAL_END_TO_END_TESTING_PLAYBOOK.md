# AFN Service Management — Complete Manual E2E Checklist

Use this Markdown checklist to test the complete system manually from a user's
point of view. It combines one ordered business lifecycle with a route-by-route
sweep, negative tests, role-access checks, operational checks, responsive and
accessibility checks, and an evidence/sign-off record.

Testing status: **Not started / In progress / Passed / Failed / Blocked**

Mark a test complete only after its result survives a page reload and is visible
to the correct next role. Use the test IDs when reporting defects.

## 1. Rules for a trustworthy test run

- Test in a disposable local or staging environment, never against production.
- Use invented names, addresses, messages, images, and contact details.
- Do not reuse real customer, employee, payment, or location data.
- Record the build/commit identifier, browser, viewport, tester, and test date.
- For every failure, capture the route, exact steps, expected result, actual
  result, screenshot, console error, and failed Network request.
- Refresh after important saves. A result is not proven until it survives a
  reload and appears to the next authorized role.
- Test both success and rejection. A button appearing is not enough.
- Run the lifecycle in order because later stages depend on records created in
  earlier stages.

### Pass criteria

A check passes only when all of these are true:

1. The intended action completes once and displays clear feedback.
2. Reloading preserves the correct value or state.
3. The correct next role can see the change.
4. An unauthorized role cannot see or perform the action.
5. No unexpected HTTP 4xx/5xx, JavaScript error, duplicate record, clipped
   control, or misleading success message appears.

## 2. Master execution order

Follow this order for one complete manual run. Do not jump to completion,
Purchase Records, or after-sales before creating the records they depend on.

| Order | Role | What to test | Continue when |
| ---: | --- | --- | --- |
| 1 | Tester | Start the isolated environment and seed the four test accounts using Section 3 | Backend health and the frontend login page load |
| 2 | Public visitor | Test Landing, About, public Solar Calculator, mobile navigation, and every public link | All public destinations and anchors work |
| 3 | New client | Register with a CALABARZON address, verify email, test invalid login/resend/reset, then log in | The new account reaches the client dashboard |
| 4 | Superadmin | Check users, roles/capabilities, active services, technician skills/location, inventory, and dispatch settings | At least one active service, qualified technician, and stocked item are ready |
| 5 | Client | Save a Solar Estimate, then create the uniquely marked golden service request | One pending request appears in Request Tracking |
| 6 | Admin | Find the request on Dashboard/Service Tickets, inspect it, test one disposable rejection, then approve the golden request once | Exactly one service ticket exists |
| 7 | Admin | Open Calendar, set/reschedule the visit with a reason, then test overlap and daily-capacity rejection | The golden ticket has one valid future slot |
| 8 | Admin | Open Dispatch Board, test Find Best Match, assign lead/crew, and create the equipment reservation plan | Assignment, reservation, history, and notifications persist after reload |
| 9 | Client | Check Dashboard, Request Tracking, request detail, and Notifications | Schedule and assigned-technician information match the admin record |
| 10 | Technician | Check Dashboard, My Jobs, and Schedule | Only the assigned golden ticket appears with the correct role and slot |
| 11 | Technician | Open Map Navigation; test policy, GPS deny/allow, start navigation, outside-radius arrival, then valid arrival | Ticket reaches Arrived on Site with location evidence |
| 12 | Technician | If inspection is required, complete the Inspection Checklist, required notes, readings, and proof | Inspection submission is saved for admin review |
| 13 | Admin | Review the inspection; test a reason-required exception, then move the valid job toward Ready for Service/material readiness | The approved work can proceed without an invalid transition |
| 14 | Admin | Prepare and save/reload the quotation, contract, and applicable technical documents | Accepted/source documents contain correct client, ticket, value, and scope |
| 15 | Admin | Recheck the installation/service schedule, dispatch, team, capacity, and equipment after inspection/document changes | The final field visit is valid and assigned |
| 16 | Technician | Navigate/arrive if needed, start work, complete the Service Checklist, field report, equipment/proof, and completion notes | Ticket reaches Completed once with full evidence |
| 17 | Admin and client | Review Job History and Service History, generate final/commissioning documents, and complete Turnover / Accepted | Final history and documents match across authorized roles |
| 18 | Technician then admin | Declare unused equipment, then reject one invalid return and verify one usable return | Exactly one valid return movement restores stock |
| 19 | Admin | Create Sales Record draft, verify quotation/contract value source, confirm it, then test void-and-replace | One authoritative confirmed/replacement chain exists |
| 20 | Client | Open Purchase Records and verify the owned read-only record and value source | Client sees no edit/payment controls or another client's data |
| 21 | Client then admin | Create a support/after-sales case, reply, assign owner, resolve with reason, reopen with reason | Both sides see the correct status and append-only activity |
| 22 | All roles | Exchange authorized messages and exercise notifications/read/delete/badges | Messages persist and notification counts synchronize |
| 23 | Admin | Reconcile Dashboard, Analytics, Reports, Operations Report, Coverage, Activity Logs, Settings, and Landing editor/public preview | Totals and published content agree with their source records |
| 24 | Each role | Complete the route tables in Sections 8–10, including empty, loading, validation, and permission cases | Every listed route has a recorded result |
| 25 | Each role | Run mobile, keyboard, 200% zoom, pagination, offline, double-submit, two-session concurrency, upload, export, and deep-link tests | Section 11 has no unrecorded Critical/High failure |
| 26 | Each role | Test the logout modal and direct protected URLs after logout | Back/refresh cannot reveal protected content |
| 27 | Tester | Reconcile IDs and audit trails, retest defects, and complete the sign-off table | Every area is Pass, Fail, or explicitly Blocked with evidence |

The detailed instructions for orders 2–23 are in Phases A–C. The page sweeps
for order 24 are in Phases D–F, cross-cutting tests are in Phase G, operational
checks are in Section 12, and final reconciliation is in Section 13.

## 3. Safe isolated setup

The preferred manual environment uses the ignored E2E SQLite database. The
following reset is destructive **only to `backend/db.e2e.sqlite3`**. Stop if the
settings name is not exactly `afn_service_management.settings_e2e`.

From the repository root, use PowerShell terminal 1:

```powershell
$env:DJANGO_SETTINGS_MODULE = 'afn_service_management.settings_e2e'
.\venv\Scripts\python.exe backend\manage.py migrate
.\venv\Scripts\python.exe backend\manage.py flush --noinput
.\venv\Scripts\python.exe e2e\seed-test-data-exec.py
.\venv\Scripts\python.exe backend\manage.py runserver 127.0.0.1:8011 --noreload --noasgi
```

Use PowerShell terminal 2:

```powershell
$env:VITE_BACKEND_HOST = 'http://127.0.0.1:8011'
$env:VITE_DEV_SERVER_PORT = '5181'
& 'C:\Program Files\nodejs\npm.cmd' --prefix frontend run dev:e2e
```

Open `http://127.0.0.1:5181`. Confirm
`http://127.0.0.1:8011/api/health/database/` returns a healthy response before
starting.

### Seeded isolated accounts

| Role | Username | Password | Primary purpose |
| --- | --- | --- | --- |
| Superadmin | `superadmin_test` | `TestPass123!` | Full authority and access-control management |
| Admin | `admin_test` | `TestPass123!` | Normal office operations |
| Technician | `tech_test` | `TestPass123!` | Field workflow |
| Client | `client_test` | `TestPass123!` | Customer workflow |

Treat all four credentials as local test fixtures only.

## 4. Test-run header and issue record

Fill this before testing:

| Field | Value |
| --- | --- |
| Tester |  |
| Date/time |  |
| Environment/base URL |  |
| Build or commit |  |
| Browser/version |  |
| Desktop viewport | `1440 x 900` recommended |
| Mobile viewport | `390 x 844` recommended |
| Database reset/seed completed | Yes / No |

Use one row per defect:

| ID | Test ID | Severity | Expected | Actual | Evidence | Retest |
| --- | --- | --- | --- | --- | --- | --- |
| BUG-001 |  | Critical/High/Medium/Low |  |  | Screenshot + console/network | Open/Passed |

## 5. Phase A — public pages and account lifecycle

### PUB-01 Landing page `/`

- Verify logo, navigation, hero, services, calculator, projects, contact, and
  footer render without blank regions or broken images.
- Test every header, hero, service, calculator, contact, and footer link.
- Follow Home/About cross-page anchor links and verify they land on the correct
  section, not merely the correct page.
- Resize to mobile. Open/close the menu, follow every destination, and check for
  horizontal scrolling, overlap, or controls hidden behind the assistant.
- If a project is published later in Phase D, return here and verify it appears
  only after publication.

### PUB-02 About and solar calculator

- Open `/about-us`; test all navigation back to the landing page.
- Open `/solar-calculator`; enter minimum, normal, maximum, blank, negative,
  decimal, and nonnumeric values where possible.
- Verify estimates update consistently, units/currency are clear, and the page
  states that the result is an estimate rather than a contract or payment.

### PUB-03 Registration `/register`

- Verify persistent labels, required markers, password visibility, password
  guidance, role selection, and disabled/enabled submit behavior.
- Test each CALABARZON province: Cavite, Laguna, Batangas, Rizal, and Quezon.
- Verify province changes reset the city and barangay; city changes reset the
  barangay; Lucena is stored under Quezon correctly.
- Submit blank fields, invalid email, duplicate username/email, malformed phone,
  weak password, mismatched password, and terms not accepted.
- Confirm each error remains beside its field and typed values are not lost
  unnecessarily.
- Create one valid client. Confirm the stored address reads as one correct,
  ordered address after login/profile reload.
- Attempt rapid/double submission; only one account should be created.

### PUB-04 Verification, login, reset, and logout

- Verify `/verify-email` succeeds with a valid test token and safely rejects an
  invalid, expired, or reused token.
- Test resend verification. Confirm neutral wording does not reveal whether an
  email exists and the cooldown prevents repeated sends.
- On `/login`, test blank, wrong, inactive, and unverified credentials, then all
  four valid roles. Each must land in its own allowed workspace.
- On `/forgot-password`, test known/unknown email with enumeration-safe feedback.
- Open `/reset-password` with invalid and valid test tokens. Test weak and
  mismatched passwords, then prove the old password fails and the new one works.
- Click sidebar Logout. Verify the centered confirmation, consequence text,
  Cancel, Escape, focus return, and final Log out action. Back navigation must
  not reopen protected content.

## 6. Phase B — access control before business testing

Run these in a private/incognito window so cached sessions do not hide defects.

| ID | Actor | Attempt | Expected |
| --- | --- | --- | --- |
| SEC-01 | Logged out | Open `/admin/dashboard`, `/technician/my-jobs`, `/client/requests` | Redirect to login; no protected data flashes |
| SEC-02 | Client | Open `/admin/user-management` and `/admin/activity-logs` | Redirect/deny; no data returned in Network response |
| SEC-03 | Client | Open another client's `/client/requests/{id}` | Not found/forbidden; no other-client identity or location disclosed |
| SEC-04 | Technician | Open `/admin/settings`, `/admin/sales-records`, `/admin/inventory` | Redirect/deny according to role/capability |
| SEC-05 | Technician | Open a ticket not assigned as lead or crew | Not found/forbidden |
| SEC-06 | Limited admin | Remove one capability as superadmin, then open its URL directly | Menu item hidden and backend action denied |
| SEC-07 | All roles | Modify an ID in the address bar and retry read/edit/delete | Ownership/capability remains enforced |
| SEC-08 | Logged-out former user | Log out, press Back, refresh, and replay a saved API request | Login/401/403; no stale private content |

Restore capabilities before continuing.

## 7. Phase C — one golden service lifecycle

Use a unique marker such as `MANUAL-YYYYMMDD-01` in descriptions and notes.
Search for that marker after every handoff.

### LIFE-01 Client estimate and service request

1. Log in as client and open `/client/solar-estimates`.
2. Create and save a calculation. Reload and confirm it remains in the list.
3. Open `/client/service-requests` and create a request using a published active
   service, concrete future date/time, complete CALABARZON address, map point,
   description marker, and any supported service items.
4. Test dirty-form Cancel before the real submission; the draft warning must
   protect entered work.
5. Submit once, reload, and confirm the request appears exactly once.
6. Open `/client/requests` and its detail route. Verify identity codes, status,
   service, address, schedule, timeline, and client-safe technician display.
7. Create a second request and cancel it with a meaningful reason. Confirm it
   cannot be cancelled again or advanced afterward.

### LIFE-02 Admin intake and request decision

1. Log in as admin and locate the marker on `/admin/dashboard` and
   `/admin/service-tickets`.
2. Open request details; compare client, contact, service items, location,
   schedule, description, and status with the client view.
3. Reject a disposable pending request: blank/short reasons must fail; a valid
   reason must persist and be visible to the client.
4. Approve the golden request once. A second approval attempt must not create a
   duplicate ticket.
5. Create a walk-in request. Test Clear and Close dirty-draft warnings, then save
   one for review and one with immediate approval if authorized.
6. Verify identifiers consistently use `REQ-` and `TKT-` formatting.

### LIFE-03 Calendar and scheduling protection

1. Open `/admin/calendar`; find the golden ticket by date, service, technician,
   status, and search filters.
2. Open details and confirm client/location/team/work information matches.
3. Reschedule with a reason; reload and verify both the new slot and history.
4. Try an overlapping time for the same lead and then for a crew member. Both
   must be rejected without partial changes.
5. Test `Time TBD`; note that only daily-duration capacity can be enforced.
6. Attempt to exceed the normal daily hours and service maximum assignments;
   verify rejection. If overtime is enabled in settings, verify only the
   configured extension is allowed.

### LIFE-04 Smart and manual dispatch

1. Open `/admin/dispatch-board`. Without selecting a ticket, lead/crew and
   confirmation actions must remain disabled.
2. Select the golden ticket. Verify matching technicians, availability,
   existing team, capacity, and equipment plan.
3. Click **Find Best Match**. Confirm the selected technician has the required
   skill, no exact-time overlap, enough daily capacity, valid coordinates, and a
   score above 30.
4. Run Find Best Match again. If the current technician is still best, it should
   remain assigned instead of being replaced merely because it is current.
5. Create an overlap for every eligible technician and retry; assignment must
   return a clear conflict and leave the ticket unassigned/unchanged.
6. Toggle unattended automatic dispatch off in Settings. Verify Find Best Match
   remains a clearly manual action; newly approved work should not be silently
   auto-assigned. Turn it on and test a disposable approval.
7. Manually select lead and crew. Try duplicate lead/crew, unavailable staff,
   wrong skill, excessive capacity, and overlap; each must be blocked.
8. Add equipment: duplicate items and quantities below 1 must fail. A quantity
   above available stock should show the documented partial-stock warning.
9. Confirm assignment once, reload, and verify lead, crew, score/summary,
   reservation, status history, notifications, and client-visible assignment.
10. Treat smart distance as approximate: compare it with the technician's stored
    location timestamp and the route shown after assignment. Record stale GPS or
    implausible route data as a dispatch-data-quality defect.

### LIFE-05 Technician navigation and field work

1. Log in as the assigned technician. Check `/technician/dashboard`,
   `/technician/my-jobs`, and `/technician/schedule`; the same ticket and schedule
   must appear without unrelated clients' work.
2. Open `/technician/map-navigation`. Before consent, verify the policy states
   purpose, authorized viewers, collection trigger, and retention; the browser
   should not request GPS until **Start location sharing**.
3. Deny GPS once and verify recovery instructions. Then allow GPS using a safe
   simulated/test location and verify timestamp/accuracy update.
4. Start navigation. An invalid transition, wrong technician, or missing
   location must fail without changing state.
5. Attempt arrival outside the configured radius; verify the blocked evidence.
   Then use an in-radius test position and verify successful arrival/history.
6. Start work. Confirm the client/admin sees the state and notifications.
7. For an inspection ticket, open `/technician/inspection-checklist`: answer all
   required questions, test negative-answer notes, proof upload type/size,
   local draft recovery, removal, submission, and review state.
8. For installation/service work, open `/technician/checklist`: complete every
   procedure, test required proof, readings, installed-equipment information,
   field report, commissioning data, incomplete submission rejection, and final
   successful submission.
9. Test Awaiting Materials and On Hold with meaningful notes, then resume only
   through allowed state transitions.
10. Complete the work with completion notes. Reload My Jobs and verify the job
    moves to `/technician/job-history` with actual timing, team, evidence,
    materials/equipment, report, warranty, documents, and timeline.

### LIFE-06 Inventory issue and return loop

1. As admin, open `/admin/inventory`; compare physical, reserved, and available
   counts for the assigned item.
2. Open reservation context and verify it names the correct ticket.
3. Receive stock with supplier/reference notes; verify physical/available totals
   and an append-only `purchase` movement.
4. Make a positive and negative correction with reasons. Reject a correction
   that would make stock invalid.
5. Issue/reserve equipment through the ticket workflow and verify no duplicate
   ledger movement occurs after refresh/retry.
6. After completion, have the technician declare unused quantity, condition,
   and notes. Verify this creates a pending return without increasing stock.
7. As dispatch-authorized staff, reject one damaged/incomplete test return and
   verify stock stays unchanged. Verify one sealed/usable return and confirm a
   single append-only movement restores the correct quantity.
8. Attempt an over-return and duplicate return; both must fail.

### LIFE-07 Documents, quotation, and turnover

On `/admin/documents`, test every offered document type that applies:

- quotation proposal;
- installation contract;
- technical data sheet;
- inspection/service documentation;
- solar commissioning checklist;
- turnover/acceptance document.

For each applicable document:

1. Select the ticket and verify client, location, service, equipment, quotation,
   and technical values prefill from the correct source.
2. Save a draft, leave the page, return, and prove it reloads.
3. Test required fields, invalid numbers/dates, long text, special characters,
   and proof/media validation.
4. Generate/preview/download. Verify identity, dates, totals, page breaks,
   signatures/acceptance state, and no clipped or blank printed content.
5. Confirm a technician can only access the permitted work-summary/document
   references, not office-controlled generation actions.

### LIFE-08 Sales and client purchase record

1. Open `/admin/sales-records` and create a draft from the completed ticket.
2. With an accepted quotation, verify **Recorded contract value** is read-only,
   identifies the quotation source, and refreshes from that source at confirm.
3. Repeat with signed-contract fallback if available.
4. For a legacy completed ticket with neither source, verify manual value appears
   only as fallback and requires an explanation.
5. Confirm once. Verify line items, installed equipment, warranty, source value,
   client/ticket identity, and confirmation evidence survive reload.
6. Attempt to edit a confirmed record directly; it must fail. Void with a reason
   and create a replacement, preserving the audit chain.
7. Log in as the owning client and open `/client/purchase-records`. Verify the
   read-only record and ensure another client cannot access it.
8. Confirm the page does not claim that payment was collected or that the record
   is an invoice/accounting ledger.

### LIFE-09 Completion, turnover, maintenance, and after-sales

1. On `/admin/job-history`, locate the completed ticket and inspect every detail
   section, CSV/export action, document link, return status, warranty,
   maintenance, after-sales link, and status timeline.
2. Test the `Completed` to `Turned Over / Accepted` boundary and verify no later
   operational transition is offered.
3. Open `/admin/after-sales-cases`; create/find the linked case, assign an owner,
   add notes, and verify response deadline is distinct from warranty expiry.
4. Resolve with a required reason, reload, reopen with a required reason, and
   inspect the append-only activity timeline.
5. Log in as client and verify `/client/service-history`, request detail,
   notifications, support, and Purchase Records all show the correct final
   client-safe evidence.

## 8. Phase D — administrator route-by-route sweep

Complete this even if the golden lifecycle already touched the page.

| ID | Route | Minimum manual checks |
| --- | --- | --- |
| ADM-01 | `/admin/dashboard` | KPIs, attention links, pending decisions, active-job modal, refresh, empty/loading/error states |
| ADM-02 | `/admin/calendar` | Month/day navigation, filters, event detail, queue/dispatch/reschedule links, overlap warning |
| ADM-03 | `/admin/service-tickets` | All queue views, search/filter/pagination at 10, detail, approval/rejection, status reason, reschedule, walk-in |
| ADM-04 | `/admin/dispatch-board` | Ready-to-assign scope, select/team/review, best match, manual assignment, equipment plan |
| ADM-05 | `/admin/technician-tracking` | Available/on-job/offline filters, marker/detail, GPS age/accuracy, trail, contact, route fallback |
| ADM-06 | `/admin/user-management` | Search, role tabs, 10-row pagination, create each allowed role, edit profile/status/capabilities, validation |
| ADM-07 | `/admin/services` | Create/edit/retire service/category, duration, daily max, procedures, required equipment, request visibility |
| ADM-08 | `/admin/inventory` | Categories, custom product, SKU uniqueness, opening balance, receive/correct, filters, reservation detail |
| ADM-09 | `/admin/documents` | Every applicable type, ticket prefill, draft reload, preview/generate/download/print |
| ADM-10 | `/admin/sales-records` | Draft, source-controlled value, manual fallback reason, confirm, void/replace, pagination |
| ADM-11 | `/admin/analytics` | Every tab/chart/filter/date range, formula explanation, empty/small/large data, refresh |
| ADM-12 | `/admin/reports` | Date/type filters, generate/export, empty and populated periods, totals against source records |
| ADM-13 | `/admin/operations-report` | All sections, dates, totals, export/print, permission boundary |
| ADM-14 | `/admin/after-sales-cases` | Filters/pagination, create, ownership, notes, resolve/reopen reasons, deadlines/activity |
| ADM-15 | `/admin/settings` | Each visible setting, validation, save/reload, auto-dispatch/overtime/arrival/landing/calculator effects |
| ADM-16 | `/admin/landing-page` | Edit/save/preview/publish copy and projects, consent gate, upload/delete permission boundaries |
| ADM-17 | `/admin/landing-page/preview` | Draft/published content accuracy, links, desktop/mobile presentation |
| ADM-18 | `/admin/activity-logs` | Complete-query totals, search/category/action/date filters, 10-row pages, expand evidence, CSV formula safety |
| ADM-19 | `/admin/profile` | Save/reload/cancel, photo validation, pending email, password change/relogin, identity updates in shell |
| ADM-20 | `/admin/notifications` | Unread count, mark one/all read, delete, empty state, badge synchronization |
| ADM-21 | `/admin/messages` | Participants, send text/image, refresh/live update, unauthorized conversation, unsend evidence |
| ADM-22 | `/admin/client-support` | Queue/filter/detail, assignment/reply/status, private ownership and client visibility |
| ADM-23 | `/admin/coverage-heatmap` | Both layer controls, filters, bounds, markers/heat, empty data, map attribution |
| ADM-24 | `/admin/job-history` | Search/date/sort/10-row pages, full detail, CSV, documents, returns, final evidence |

Also verify legacy redirects land correctly:

- `/admin/technicians` and `/admin/clients` to the matching User Management tab;
- `/admin/support` to `/admin/client-support`;
- `/supervisor/dashboard`, `/supervisor/dispatch-board`,
  `/supervisor/technician-tracking`, `/supervisor/service-tickets`, and
  `/supervisor/user-access` to their `/admin/*` equivalents;
- `/follow-up/dashboard` and `/follow-up/cases` to the current destinations.

## 9. Phase E — technician route sweep

| ID | Route | Minimum manual checks |
| --- | --- | --- |
| TEC-01 | `/technician/dashboard` | Stats, schedule, active work, notifications, explicit GPS consent, refresh |
| TEC-02 | `/technician/my-jobs` | Assigned lead/crew jobs only, detail/actions, allowed transitions, errors |
| TEC-03 | `/technician/schedule` | Date navigation, all assigned work, open action, no overlap/clipping |
| TEC-04 | `/technician/map-navigation` | Policy, consent, deny/allow/stop GPS, accuracy, route, arrival boundary |
| TEC-05 | `/technician/checklist` | Procedures, local draft, validation, proof, reports, completion |
| TEC-06 | `/technician/inspection-checklist` | Required answers, negative notes, proof, draft/retry, submit |
| TEC-07 | `/technician/notifications` | Read/delete/empty/badge synchronization |
| TEC-08 | `/technician/messages` | Authorized participants, text/image, unsend, live/reload persistence |
| TEC-09 | `/technician/job-history` | Completed boundary, search/date/10-row pages, detail and work-summary download |
| TEC-10 | `/technician/profile` | Save/reload/cancel, image, contact, skills readout, password/relogin |

Verify `/technician/map` redirects to `/technician/map-navigation`.

## 10. Phase F — client route sweep

| ID | Route | Minimum manual checks |
| --- | --- | --- |
| CLI-01 | `/client/dashboard` | Owned counts, active status, direct actions, refresh/empty state |
| CLI-02 | `/client/service-requests` | Create, validation, dirty cancel, service/address/map, duplicate-submit protection |
| CLI-03 | `/client/solar-estimates` | Calculate/save/reload/list and public-setting consistency |
| CLI-04 | `/client/requests` | Search/status, 10-row pages, owned records, cancel eligibility |
| CLI-05 | `/client/requests/{id}` | Client-safe detail, timeline, assignment, schedule, location, support links |
| CLI-06 | `/client/service-history` | Completed records only, detail, documents/work evidence, pagination |
| CLI-07 | `/client/purchase-records` | Owned read-only confirmed/void chain, value source, no payment claims |
| CLI-08 | `/client/support` | Create case, validation, attachment, replies, status, assistant safe guidance |
| CLI-09 | `/client/notifications` | Read/delete/empty/badge synchronization and record links |
| CLI-10 | `/client/profile` | Save/reload/cancel, complete name/company/contact, image, email/password rules |

## 11. Phase G — cross-cutting quality and failure testing

Run representative public, admin, technician, client, form, table, map, and
dialog pages at both `1440 x 900` and `390 x 844`.

### UI and accessibility

- Navigate using only Tab, Shift+Tab, Enter, Space, and Escape.
- Confirm visible focus, logical order, one main landmark, useful headings,
  labels for every input/control, dialog focus trap, Escape close, and trigger
  focus restoration.
- Zoom to 200%; verify content remains usable without two-dimensional scrolling.
- Check long names, long addresses, empty values, high counts, error banners,
  dropdowns, tables, sticky/fixed footers, modals, maps, and print previews.
- Verify destructive actions always explain impact and require confirmation;
  ordinary reversible navigation should not create unnecessary prompts.

### Pagination, search, and filters

- Create or use at least 11 records in every paginated list.
- Verify page 1 shows 10, page 2 contains the remainder, totals are correct, and
  next/previous boundaries disable correctly.
- Apply search plus multiple filters, remove individual chips, Clear all, change
  page, reload, and test an empty result.
- Verify CSV/export uses the complete filtered result, not only the visible page.

### Network and concurrency

- Use browser DevTools Network with cache disabled. Check for duplicate writes,
  unexpected 401/403/404/409/500, sensitive response fields, and requests that
  continue after leaving a page.
- Set Network to Offline before loading and before saving; verify recoverable
  errors and no false success. Restore network and retry once.
- Double-click important Save/Approve/Assign/Complete actions and repeat them in
  two tabs. Only one durable decision/movement/record should result.
- In two admin sessions, attempt conflicting approval, assignment, reschedule,
  inventory, return, sales confirmation, and after-sales decisions. The loser
  should receive a conflict/error and must not overwrite the winner.

### Files, exports, and data safety

- Upload valid small JPG/PNG files, then wrong extension, spoofed content,
  oversized file, empty file, and duplicate filename where supported.
- Open downloaded files and CSVs. Verify correct record ownership, readable
  encoding, escaped spreadsheet formulas, stable identity codes, and no secret
  tokens/internal-only fields.
- Print/preview documents at A4 and verify margins, page breaks, signatures,
  totals, tables, and images.

### Session and browser behavior

- Refresh every route, open it in a new tab, use Back/Forward, paste a deep link,
  expire/remove the token, and open two roles in separate browser profiles.
- Confirm notification badges update after actions and retain last-known data on
  a transient refresh failure.
- Verify unknown routes safely redirect and never expose a blank/error screen.

## 12. Operational and backend-function checks

These checks cover functions that are not represented by a dedicated page.
Run them only in the isolated local environment or an explicitly approved
staging environment.

| ID | Function | Manual check | Expected result |
| --- | --- | --- | --- |
| OPS-01 | Liveness | Open `/api/health/liveness/` | Healthy response without requiring authentication |
| OPS-02 | Readiness | Open `/api/health/readiness/` | Dependencies required by the selected environment are reported accurately |
| OPS-03 | Database health | Open `/api/health/database/` | Database is reachable; no credentials or internal connection string are exposed |
| OPS-04 | Email delivery | Trigger verification, reset, assignment, decision, completion, and support email events | Correct recipient and safe content; a delivery failure does not create false workflow success/failure |
| OPS-05 | Notifications | Trigger request, assignment, status, completion, support, and after-sales events | Exactly one durable in-app notification per intended recipient/event |
| OPS-06 | Real-time messaging | Keep two authorized users open in separate browser profiles and exchange messages | New messages appear or recover on refresh; unauthorized sockets/conversations fail closed |
| OPS-07 | Frequent automation | Run the documented frequent automation group against isolated data | SLA warnings/breaches and reminders are created once, failures return non-zero status |
| OPS-08 | Daily automation | Run the documented daily automation group against isolated data | Analytics, forecasts, maintenance, and cleanup execute with observable results |
| OPS-09 | SLA deduplication | Run the same SLA automation twice inside the deduplication window | No duplicate alert for the same record/window |
| OPS-10 | Location retention | Create an expired test trail/current position, run retention cleanup, then refresh tracking | Expired history/current coordinates are removed while recent data remains |
| OPS-11 | Route/geocode providers | Search/reverse-geocode and calculate a route, then simulate provider failure | Valid results stay inside configured bounds; failure uses explicit fallback, not fabricated road distance |
| OPS-12 | Media storage | Upload/view/delete permitted test images as authorized roles | File persists where expected; spoofed/oversized files fail; unauthorized access/delete is denied |
| OPS-13 | CSV/document export | Export filtered logs, reports, history, and generated documents | Complete authorized dataset, safe spreadsheet cells, readable file, stable record identities |
| OPS-14 | Scheduled settings | Change one safe test setting, run its dependent workflow, then restore it | Runtime behavior follows the saved value after reload |
| OPS-15 | Audit/change history | Reconcile login/logout, create/update, assignment, reschedule, completion, cancellation, settings, and critical record changes | Actor, timestamp, target, old/new state, reason, and technical evidence are accurate |
| OPS-16 | Idempotency/replay | Repeat request creation and critical POST actions using browser retry/double-click/two tabs | At most one intended durable record or transition is created |
| OPS-17 | Database constraints | Attempt duplicate SKU, duplicate skill, invalid quantity, over-return, and forbidden terminal transition through the UI/API client | Request fails clearly and leaves no partial mutation |
| OPS-18 | Capability changes | Revoke and restore one test capability while the user is signed in | Navigation and backend permission both update/fail safely; direct URL cannot bypass authority |
| OPS-19 | Deployment perimeter | In approved staging, verify HTTPS, secure headers, CORS, anonymous routes, PostgreSQL row locks, Redis, and durable media | Every staging-gate requirement passes before production recommendation |
| OPS-20 | Recovery | Stop backend/network during a read and a write, restart, then refresh/retry | UI retains last-known safe data where designed, shows recovery guidance, and creates no duplicate write |

Do not run staging or production-shaped checks against live services without the
required environment verification and authorization in the deployment
checklists.

## 13. Final reconciliation and sign-off

Before declaring the manual run complete:

- Reconcile the golden request, ticket, assignment, inventory reservation and
  movements, documents, sales record, warranty/maintenance, after-sales case,
  notifications, and activity/status histories by their canonical IDs.
- Confirm every important action has exactly one actor, timestamp, state, and
  reason/note where required.
- Compare dashboard/analytics/report totals with the source lists using the same
  filters and date boundaries.
- Confirm the client sees only client-safe owned information, the technician
  sees only assigned work, the admin sees only granted areas, and superadmin can
  administer access.
- Retest every Critical/High issue after repair and rerun the surrounding
  lifecycle, not just the failed click.

| Area | Result | Evidence/defects |
| --- | --- | --- |
| Public/account | Pass / Fail / Blocked |  |
| Access control | Pass / Fail / Blocked |  |
| Golden lifecycle | Pass / Fail / Blocked |  |
| Admin route sweep | Pass / Fail / Blocked |  |
| Technician route sweep | Pass / Fail / Blocked |  |
| Client route sweep | Pass / Fail / Blocked |  |
| Responsive/accessibility | Pass / Fail / Blocked |  |
| Failure/concurrency/files | Pass / Fail / Blocked |  |
| Final reconciliation | Pass / Fail / Blocked |  |

Overall release recommendation: **Pass / Pass with known limitations / Fail**

Tester signature/date: ______________________________________________
