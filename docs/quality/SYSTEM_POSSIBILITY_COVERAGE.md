# System possibility coverage

The checklist of what the system can do, by area. For each possibility it records the code that
decides it, the server test, the browser (Playwright) test, and its status. An entry is filled in
only after the test has been read and confirmed to check that possibility; a keyword match is not
enough.

Status: **Covered** (server and browser), **Server only** (rule tested; screens not), **Gap** (no
test), **Decision** (the behaviour needs an owner decision before it can be tested as right or wrong).

Parts of the checklist:

1. Settings and customization (filled in, 2026-11-08)
2. Workflow steps and refused steps, per role (filled in, 2026-11-09)
3. Job types (with or without inspection, quotation, deposit) × every cancel or "no" point (filled in, 2026-11-09)
4. Time cases, with the clock moved (filled in, 2026-11-09)
5. Large data (filled in, 2026-11-13), and the staging hand check (real email, Cloudinary, live updates, phones) (to do: needs a deploy)

## 1. Settings and customization

Admin Settings (`/admin/settings`, `users/views/admin_settings.py`, `AdminSettingsSerializer`).
Server tests: `services/tests/test_settings_effects.py` unless noted. Browser: `e2e/57-settings-effects.spec.js`
(effect of a change) and `e2e/31-admin-settings-controls.spec.js` (controls and validation).

### Who may change what

Server test names are `file::test`. `TSE` = `services/tests/test_settings_effects.py`.

| Possibility | Decided by | Server test | Browser test | Status |
| --- | --- | --- | --- | --- |
| Operational settings need `system.settings.manage` | `AdminSettingsViewSet.update` | `users/tests.py::test_configured_admin_requires_system_settings_capabilities` | 31 (admin and superadmin save) | Covered |
| Organization and document defaults are superadmin-only | `SUPERADMIN_ONLY_FIELDS` | `users/tests.py::test_admin_settings_can_be_updated` (admin `companyName` 403), `::test_superadmin_can_update_document_and_payment_defaults` | 31 (view-only notice for admin) | Covered |
| Public-site fields need `public_site.publish` | `LANDING_PAGE_FIELDS` | `users/tests.py::test_public_site_actions_use_granular_capabilities`, `TSE::test_an_admin_who_can_only_view_the_public_site_can_save_system_settings` | n/a | Server only |
| An admin who may view but not publish the public site can save system settings | page sends only changed fields | `TSE::test_an_admin_who_can_only_view_the_public_site_can_save_system_settings` | 57 | Covered (was broken: every save 403) |
| An admin without service-catalog access gets a working page with real values | page loads settings and SLA rules separately | n/a | 57 | Covered (was broken: load failed, defaults such as Notifications off were shown) |
| A save of one field is checked against the saved values (closing after opening, reason when validation off, overtime 8-16 h) | `AdminSettingsSerializer.validate` falls back to the saved row | `TSE::test_single_field_saves_are_checked_against_the_saved_values` | 31 (validation messages) | Covered |

### Each setting changes behaviour

| Setting | Read by | Server test | Browser test | Status |
| --- | --- | --- | --- | --- |
| Notifications (master) | `notification_utils.notification_channels` (every in-app and alert-email path) | `TSE::test_master_switch_off_stops_in_app_and_email` | Gap | Server only (was partial: purchase-record, payment, warranty, maintenance, after-sales and equipment notices ignored it) |
| In-app Alerts | `in_app_notifications_enabled()`: `create_notification`, messages, sales records, maintenance, inventory, security alerts | `TSE::test_in_app_alerts_off_stops_every_in_app_notice_and_on_restores_it`, `test_sales_records.py::test_in_app_alerts_off_means_no_purchase_record_notice`, `TSE::test_in_app_off_sends_no_reminder_and_the_stage_waits` | 57 (client gets no notice when off, gets it when on) | Covered (most senders ignored it). Off also silences admin security alerts and chat notices |
| Email Alerts | `email_notifications_enabled()`: `send_notification_email`, `send_system_email`, maintenance reminder email | `TSE::test_email_alerts_off_stops_alert_email_and_on_restores_it`, `TSE::test_email_alerts_off_skips_the_reminder_email_only` | n/a (e2e email is captured) | Server only (request emails and maintenance reminders ignored it) |
| Auto Dispatch | `auto_dispatch.get_auto_dispatch_settings`, approval in `service_requests.py` | `test_auto_dispatch_and_sla.py::test_auto_dispatch_respects_admin_setting`, `test_audit_regressions.py::test_sla_escalation_does_not_auto_assign_when_auto_dispatch_is_disabled` | Gap (spec 18 tests manual Find Best Match, not this setting) | Server only |
| Quotation Before Installation | `helpers.quotation_acceptance_required` (inspection decision) | `test_business_flow_controls.py::test_setting_can_turn_the_requirement_off` and the decline/accept tests beside it | Unverified (10.2 and 11.2 run with it on; not re-read this session) | Server only |
| Overtime Dispatch and limit | `helpers.get_daily_capacity_limit_minutes` | `test_auto_dispatch_and_sla.py::test_find_best_technician_allows_configured_overtime_capacity` | 57 (a stored 8-hour value shows as "8 hours") | Server only for the effect; page display covered |
| Working days, hours, holidays | `work_calendar.py` (technician capacity, execution SLA) | `test_work_calendar.py::test_a_long_job_skips_weekends_and_holidays`, `test_technician_dashboard_business_day.py` | Gap | Server only. Decided (owner, 2026-11-08): they do not block client booking; the office closes those dates on the Calendar (closures block booking, covered by spec 13). |
| Maintenance Reminder (days) | `maintenance.process_maintenance_alerts` | `TSE::test_reminder_days_setting_decides_when_the_first_reminder_goes_out` | Gap (needs the daily job; part 4) | Server only |
| Quotation Validity (days) | `quotation_validity.default_validity_days` on every send | `test_quotation_revision.py::test_the_validity_setting_applies_each_time_the_office_sends` | 53 (expiry with a backdated quotation) | Covered |
| Default Warranty (days) | `maintenance.py` warranty sync when a turnover has no inspection warranty | Gap | Gap | Gap |
| Company Name, Company Address | server documents, document prefill, Admin Documents header and contract form | `TSE::test_document_prefill_uses_the_company_details_in_settings` | 57 (Documents header and contract form) | Covered (the Admin Documents builder and prefill ignored them) |
| Currency | contract placeholder in server documents | Gap | Gap | Gap (the Admin Documents contract form keeps its own "Philippine Peso" choice) |
| Document Footer, External Payment Notice | passed to documents; no template or placeholder prints them | n/a | n/a | Decision: wire in or remove from the page |
| System Name, Support Email | saved only; nothing reads them | n/a | n/a | Decision: wire in or remove from the page |
| Default Time Zone, Max Technician Assignments | saved, not shown, not used (business time is fixed UTC+8; daily limits come from each service) | n/a | n/a | Recorded; not changed |
| Location Range Validation (on/off, reason) | `helpers.compute_arrival_validation_result` | `TSE::test_validation_off_lets_a_far_arrival_through_and_on_refuses_it` | 57 | Covered |
| Allowed Radius | same | `TSE::test_radius_decides_how_close_the_technician_must_be` | Gap (57 uses the default radius) | Server only |
| "Last updated by/at" for arrival validation | stamped only when one of its values changed | `TSE::test_saving_another_setting_does_not_change_who_last_set_arrival_validation` | 57 | Covered (every save stamped it) |
| SLA rules (warning, overdue) | `sla._rule_durations` | `TSE::test_a_saved_sla_rule_applies_immediately`, `test_sla_evaluation.py` rule tests | 31 (edit and save) | Covered (a change waited up to 5 minutes) |
| SLA rule Off | `sla._rule_durations` uses built-in default times for an inactive rule | n/a | n/a | Decision: "Off" does not switch the rule off |
| Public site content, promotions, projects, solar calculator values | `api/views.py` public endpoints | Unverified | Unverified | Unverified (landing page audited earlier; not re-read this session) |

### Not settings, but found here

- Daily maintenance job: now uses the business (UTC+8) date, reminds clients in the app even without an
  email address or when the email fails, names the real number of days ("due in 12 days", not a fixed
  "7 days"), and no longer alerts inactive admins (`MaintenanceReminderSettingTests`).
- Company phone typo 09171480224 in the document prefill; 09171460224 is used everywhere else and kept.
- The timed jobs (maintenance reminders, SLA alerts, auto-dispatch, location purge) do not run on staging:
  no scheduler is configured (see the handoff risk list). Decision pending.

## 2. Workflow steps and refused steps, per role

`TSR` = `services/tests/test_ticket_and_request_state_rules.py`. Areas still to do: quotations and
deposits, sales records, inventory, maintenance and after-sales, support and messages, documents.

### 2a. Service requests and job tickets (2026-11-09)

| Possibility | Decided by | Server test | Browser test | Status |
| --- | --- | --- | --- | --- |
| Each of the 99 forbidden ticket moves is refused, ticket and history unchanged (service tickets and inspection visits) | `ALLOWED_TICKET_TRANSITIONS`, `validate_ticket_transition` | `TSR::test_every_status_pair_for_service_tickets`, `TSR::test_every_status_pair_for_inspection_visits` | n/a (no screen offers them) | Server only |
| Each of the 33 allowed moves works and records the reason in the status history | same | same | 10.1, 10.2, 11.x (real flows) | Covered |
| Completion needs the checklist; an inspection visit never ends as Completed | `ensure_ticket_checklist_completed` | `TSR::test_completion_needs_the_checklist_and_never_closes_an_inspection_visit` | 10.1 | Covered |
| A manual status change needs a reason and a real status | `update_status` | `TSR::test_a_reason_and_a_real_status_are_required` | 17 (Dismiss ticket reason rule) | Covered |
| No field work without a technician | new guard | `TSR::test_no_field_work_without_a_technician` | n/a | Server only (was allowed through the manual status change) |
| A required inspection cannot be skipped | new guard | `TSR::test_a_required_inspection_cannot_be_skipped` | n/a | Server only (was allowed through the manual status change) |
| A required deposit blocks service work | `ticket_deposit_gate` | `TSR::test_a_required_deposit_blocks_service_work` | 11.2 | Covered |
| Cancelling a ticket closes the request, releases held stock and frees the technician | `apply_ticket_status_change` | `TSR::test_cancelling_closes_the_request_too`, `inventory/tests.py::test_dismissing_the_ticket_releases_reserved_inventory_and_the_technician` | 17 (Dismiss ticket) | Covered |
| Who may approve, reject, cancel, travel, arrive, start, pause, change status, ask to reschedule, rate (8 roles × 10 actions) | permission classes and owner checks | `TSR::test_each_role_on_each_action` | 58 (crew sees no Put on Hold / Finish Job; lead does) | Covered |
| Approve and reject only a Pending request; approving twice makes one ticket | `service_requests.approve/reject` | `TSR::test_approve_and_reject_only_a_pending_request`, `TSR::test_approving_twice_creates_one_ticket` | 11.5 (office rejection) | Covered |
| The client can cancel until the technician sets off; not while on the way, on site, working or paused (409, call the office) | `service_requests.cancel` | `TSR::test_the_client_can_cancel_until_the_technician_sets_off` | 58 (Dismiss request shown for a waiting job, hidden for a paused one), 50 | Covered (a paused job could be cancelled by the client) |
| The office can cancel a paused job | same | `TSR::test_the_office_can_still_cancel_a_paused_job` | 58 (Dismiss ticket shown for the paused job) | Covered |
| A finished job offers no Dismiss to the office | `TERMINABLE_TICKET_STATUSES` | n/a | 58 | Covered |
| Crew members cannot pause or finish a job | technician status and completion endpoints | `TSR::test_each_role_on_each_action` (pause), `TSR::test_only_the_lead_can_finish_a_job` (both finish endpoints) | 58, 11.8 | Covered |

### 2b. Quotations and deposits (2026-11-09)

`TQD` = `services/tests/test_quotation_and_deposit_rules.py`.

| Possibility | Decided by | Server test | Browser test | Status |
| --- | --- | --- | --- | --- |
| Each office status move between Draft, Sent, Accepted, Rejected (5 allowed, 7 refused) | `QuotationRecordSerializer.validate` | `TQD::test_every_office_status_move` | 11.2 (send, revise and resend), 59 (offline acceptance) | Covered (the office could decline for the client, turn a sent quotation back into a draft) |
| A new quotation starts as Draft or Sent | same | `TQD::test_new_quotations_start_as_draft_or_sent` | 11.2 | Covered (could be created already accepted or declined) |
| Only a draft can be deleted | `QuotationRecordViewSet.destroy` | `TQD::test_only_a_draft_can_be_deleted` | n/a (no screen deletes) | Server only (an accepted quotation could be deleted) |
| The client answers only a Sent quotation; decline needs a reason | `respond` | `TQD::test_the_client_answers_only_a_sent_quotation` | 53, 11.2 | Covered |
| Expired quotation cannot be accepted until resent | `quotation_validity` | `test_quotation_revision.py::QuotationValidityTests` | 53 | Covered |
| Nothing is sent, accepted, answered or paid for a cancelled job; an earlier payment can still be voided | serializer, `respond`, `payments` | `TQD::test_nothing_is_sent_accepted_or_paid_for_a_cancelled_job` | 59 (client sees "no longer needs an answer", no Accept or Decline) | Covered (all of it was possible) |
| Deposit amount, date and remaining balance checks | `payments`, `SalesPaymentSerializer` | `TQD::test_amounts_dates_and_the_remaining_balance` | 11.2 | Covered |
| Deposits only on an accepted quotation that needs one | `payments` | `TQD::test_deposits_only_on_an_accepted_quotation_that_needs_one` | n/a | Server only |
| A void needs a reason and happens once | `void_payment` | `TQD::test_a_void_needs_a_reason_and_happens_once` | 11.2 | Covered |
| A partial deposit keeps service blocked | `ticket_deposit_gate` | `TSR::test_a_required_deposit_blocks_service_work` | 11.2 | Covered |
| Who may view, create, change, delete, accept, decline, pay, void (7 roles × 8 actions) | permissions and owner checks | `TQD::test_each_role_on_each_action` | n/a | Server only |
| A deposit was paid and the job is cancelled: the office is told and records Refunded or Kept once, with a note; the client is told | `settle_deposit`, `notify_deposit_decision_needed` | `TQD::DepositAfterCancellationTests` (5: notice on office and client cancellation and none without money, refunded voids, kept stays counted, refusals, what the client sees) | 60 (Dismiss dialog asks; the notice opens the ticket; the panel records Kept; the client page shows the refund) | Covered (owner asked for it 2026-11-09; nothing was recorded before) |
| Kept deposits appear in Sales analytics as their own figure (not as sales); refunds do not | `kept_deposit_totals`, sales workspace `kpis.kept_deposits` | `TQD::test_kept_deposits_show_in_sales_analytics_and_refunds_do_not` | 60 (Analytics > Sales "Kept deposits" card) | Covered |

### 2c. Sales records (2026-11-09)

`TSL` = `services/tests/test_sales_record_rules.py`; detailed rules stay in `services/test_sales_records.py`.

| Possibility | Decided by | Server test | Browser test | Status |
| --- | --- | --- | --- | --- |
| Each action (edit, confirm, void, take payment, void payment) on each status (draft, confirmed, voided) | `SalesRecordViewSet` | `TSL::test_every_action_on_every_status` | 25 (prepare, confirm, pay, void payment, void, replace), 11.4 | Covered (a payment on a voided, read-only sale could still be voided) |
| Prepare refuses open or cancelled work and reuses the active record | `prepare` | `TSL::test_prepare_refuses_open_or_cancelled_work_and_reuses_the_active_record` | 25 | Covered |
| A voided sale is replaced by a new draft linked to it, never reopened | `ensure_draft_sales_record` | `TSL::test_a_voided_sale_is_replaced_not_reopened` | 25 (Prepare replacement) | Covered |
| A sale with a live payment cannot be voided; the office sees why | `void` | `TSL::test_a_sale_with_live_payments_cannot_be_voided` | 25 (the refusal message, then void the payment first) | Covered |
| Manual value needs a reason when no accepted quotation or signed contract exists | `confirm` | `test_sales_records.py::test_manual_value_requires_missing_connected_source_and_reason` | 25 | Covered |
| Payment amounts, dates and balance; paid in full | `payments` | `test_business_flow_controls.py::test_partial_then_full_payment`, `::test_overpayment_future_dates_and_zero_are_rejected` | 25, 52 | Covered |
| Clients see only their confirmed records (totals, not payment entries); technicians see none | `get_queryset`, serializer | `TSL::test_clients_see_only_their_confirmed_records`, `test_sales_records.py` client tests | 52 | Covered |
| Who may view, prepare, edit, confirm, void, pay, void payments, list payments (7 roles × 8 actions) | permissions | `TSL::test_each_role_on_each_action` | n/a | Server only |

### 2d. Inventory (2026-11-09)

`TIR` = `inventory/test_inventory_rules.py`; detailed ledger and return rules stay in `inventory/tests.py`.

| Possibility | Decided by | Server test | Browser test | Status |
| --- | --- | --- | --- | --- |
| Movement amounts (no zero or negative except a counted-empty adjustment), a reason on every movement, issue only from available stock | ledger serializer | `TIR::test_movement_amounts_reasons_and_available_stock` | 23 | Covered |
| Stock changes only through movements; movements cannot be edited or deleted; an item with real history cannot be deleted (opening balance alone can); a category with items cannot be deleted | item and ledger views | `TIR::test_quantity_changes_only_through_movements_and_history_is_kept` | 23 | Covered |
| Reserved stock: no adjustment below it, no issue from it, no retiring while reserved | ledger, item serializer | `TIR::test_reserved_stock_is_protected` | 23 (Retire disabled with a reason) | Covered |
| A retired item cannot be requested or added to a service template | request_parts, template serializer | `TIR::test_a_retired_item_cannot_be_requested_or_added_to_a_service_template` | n/a | Server only |
| Equipment requests in each of the 12 job statuses (9 open allowed, 3 closed refused), never changing the job status | `request_parts` | `TIR::test_requests_in_every_job_status` | 11.1 | Covered |
| Lead and crew may request; other technicians (404) and clients (403) may not; zero or more than stock refused | `request_parts` | `TIR::test_who_may_request_and_what` | 11.1 | Covered |
| Office decision: approve issues and releases, reject (8+ character reason) releases without issuing, decided once | `decide_ticket` | `TIR::test_the_office_decision` | 11.1 | Covered |
| Equipment returns: only outstanding issued stock, a note, verified once; rejected returns restore nothing; clients refused | `equipment_reconciliation` | `inventory/tests.py` reconciliation tests | 11.1 | Covered (only the lead submits a return; crew members do not) |
| Who may list, create, move stock, list movements and reservations, decide (8 roles × 6 actions); technicians see only their own rows | `CanManageInventory`, querysets | `TIR::test_each_role_on_each_action`, `TIR::test_technicians_see_only_their_own_movements_and_reservations` | n/a | Server only |

### 2e. Maintenance and after-sales (2026-11-09)

`TAS` = `services/tests/test_after_sales_rules.py`; reminder automation stays in `test_maintenance_workflow.py`.

| Possibility | Decided by | Server test | Browser test | Status |
| --- | --- | --- | --- | --- |
| Each after-sales case status change (open, in progress, resolved, closed) | `FollowUpCaseSerializer.ALLOWED_STATUS_TRANSITIONS` | `TAS::test_every_case_status_change` | 26 (start, done, reopen) | Covered |
| Resolving or closing needs notes; reopening needs a reason | serializer | `TAS::test_closing_needs_notes_and_reopening_needs_a_reason` | 26 | Covered |
| Cases only for finished jobs, start open, warranty only while active; never deleted | serializer, viewset | `TAS::test_which_cases_can_be_opened_and_that_none_are_deleted` | 26 (create) | Covered |
| A maintenance case resolved completes its active schedule | `perform_update` | `TAS::test_resolving_the_case_completes_an_active_schedule` | 61 | Covered |
| A maintenance case closed without the work keeps reminders going | `perform_update` | `TAS::test_closing_the_case_without_the_work_keeps_reminders_going` | n/a (closing is automatic) | Server only (closing used to record the maintenance as done and end its reminders) |
| A completed or stopped schedule is not changed from a case (reopen does not revive it; resolve does not complete a stopped one) | `perform_update` | `TAS::test_a_completed_or_stopped_schedule_is_not_changed_from_a_case` | 61 (reopen keeps it completed) | Covered (reopening used to put a completed schedule back to due) |
| Each maintenance action (stop, resume, reschedule, complete) on each schedule status | `MaintenanceScheduleViewSet` | `TAS::test_every_action_on_every_schedule_status` | 27 | Covered |
| A reason is required; a reschedule date cannot be in the past (business date) | same | `TAS::test_a_reason_is_required_and_dates_cannot_be_past` | 27 | Covered (before 08:00 local, "yesterday" was accepted) |
| Stopping reminders closes the open maintenance case | `_close_linked_cases` | `TAS::test_stopping_closes_the_open_maintenance_case`, `test_maintenance_workflow.py` | 27 | Covered |
| Who may list and change cases and schedules (6 roles × 5 actions) | `CanAccessAfterSales`, `CanManageAfterSalesCases` | `TAS::test_each_role_on_each_action` | n/a | Server only |

### 2f. Support and messages (2026-11-09)

`TMR` = `messages_app/test_message_rules.py`; notifications, images and live updates stay in `messages_app/tests.py`.

| Possibility | Decided by | Server test | Browser test | Status |
| --- | --- | --- | --- | --- |
| A client never reads or writes another client's support thread (including a client whose id starts with theirs) | `MessageViewSet.get_queryset`, `MessageSerializer.validate` | `TMR::test_a_client_never_reads_another_clients_support_thread` | 54 (own cases only) | Covered (client 1 could read client 10's support messages) |
| Who writes in a job's thread: owning client, lead, crew, office; not other clients or technicians | `MessageSerializer.validate` | `TMR::test_who_may_write_in_a_ticket_thread` | 28 | Covered |
| Who reads a job's thread | `get_queryset` | `TMR::test_who_reads_a_ticket_thread` | 28 | Covered |
| Clients cannot use staff group or direct messages | `create` | `TMR::test_clients_cannot_use_staff_threads` | n/a | Server only |
| Only the sender edits (text or image only) or unsends; an unsent message stays unsent | `update`, `destroy` | `TMR::test_only_the_sender_edits_or_unsends_and_only_text_or_image` | 28 | Covered |
| Only the office with support management changes a support case | `CustomerSupportCaseViewSet.perform_update` | `TMR::test_only_the_office_with_support_management_changes_a_case` | 29 | Covered |
| Support cases are visible only to their client and the office; a case links only the client's own job | queryset, serializer | `TMR::test_cases_are_visible_only_to_their_client_and_the_office`, `TMR::test_a_case_links_only_the_clients_own_job` | 54 | Covered |
| Client messages only into their own open case; resolved or closed cases are read-only | serializer | `messages_app/tests.py::ClientSupportCaseRulesTests` | 54 | Covered |

### 2g. Job documents (2026-11-09)

`TDR` = `services/tests/test_document_rules.py`. The template-based document system (definitions, templates, versions, instances, outputs) is office-only (`CanViewDocuments` is admin-workspace) and keeps its own tests (`test_dynamic_document_generation.py`, `test_document_templates*.py`).

| Possibility | Decided by | Server test | Browser test | Status |
| --- | --- | --- | --- | --- |
| Who lists, reads and changes each job document (turnover, contract, data sheet, field service report, commissioning) — 8 roles | per-viewset permissions and `get_visible_service_tickets_queryset` | `TDR::test_who_reads_and_changes_each_job_document` | 12, 41, 62 | Covered (technicians got a 500 on field service reports: missing import) |
| Proof photos follow the job's visibility | `proof_images` | `TDR::test_proof_photos_follow_the_job` | 53 | Covered |
| A finished document (finalized, accepted, signed, reviewed, acknowledged) cannot be changed or deleted | serializer locks, `KeepFinishedDocumentsMixin` | `TDR::test_a_finished_document_cannot_be_changed_or_deleted` | n/a (no screen deletes) | Server only (finished documents, including signed contracts, could be deleted) |
| A draft document can be deleted by the office only | same | `TDR::test_a_draft_document_can_be_deleted_by_the_office` | n/a | Server only |
| A technician cannot record the client's acknowledgement on a field service report | `FieldServiceReportSerializer.validate` | `TDR::test_a_technician_cannot_record_the_clients_acknowledgement` | 62 | Covered |
| The technician's field service report loads, saves, and updates one report | `FieldServiceReportForm` | n/a | 62 | Covered (it never loaded, could not save, and would have created a new report on every save) |








## 3. Job types × cancel or "no" points (2026-11-09)

`CM` = `services/tests/test_job_type_cancel_matrix.py`. Four job types are driven through the real API:
**direct**, **direct with a deposit**, **inspection first**, **inspection first with a deposit**. At every
stage (pending, approved, inspection visit assigned / on the way / arrived / working / paused, inspection
reported, quotation sent / declined / accepted, deposit part-paid / paid, ready for service, awaiting
materials, service visit assigned / on the way / arrived / working / paused, completed) each of five cancel
paths is tried in a rolled-back savepoint: client cancels, office cancels the request, office rejects,
office dismisses the ticket, office cancels at the inspection review. 270 combinations; each runs the same
checks.

| Possibility | Decided by | Server test | Browser test | Status |
| --- | --- | --- | --- | --- |
| Which cancel path is allowed at which stage: client until the technician sets off (409 `cancellation_requires_office` on the way, on site, working or paused); office request cancel and ticket dismissal until completed; reject only while pending; inspection-review cancel only after the inspection reported; nothing after completion | `service_requests.cancel` / `reject`, `ALLOWED_TICKET_TRANSITIONS`, `inspection_decision` | `CM::CancelMatrixTests` (4 job types) | 50, 58, 11.3, 11.5 | Covered |
| After any cancel: request and ticket `Cancelled`, every technician on the job released and told, the client told ("Cancelled" / "Rejected") | same, `sync_ticket_team_availability` | `CM::CancelMatrixTests` | 63 | Covered (an office dismissal told the client only "Status Updated" and did not tell crew members) |
| A deposit decision is asked for only when deposit money was received (part or full) | `notify_deposit_decision_needed` | `CM::CancelMatrixTests` | 60 | Covered |
| After a cancel nothing more happens: no second cancel, no answer to the quotation, no travel, no reschedule request, no dispatch | each action's state checks | `CM::CancelMatrixTests` | 59, 63 | Covered |
| The client declines the quotation, the office revises and sends it again | `respond`, quotation rules | `test_quotation_revision.py`, `test_quotation_and_deposit_rules.py` | 11.2 | Covered |
| A technician tries to change a job the office cancelled (travel, arrive, start, hold, proof upload, equipment request, finish, inspection report, field forms) | `TechniciansLeaveCancelledJobsMixin`, `TechnicianJobViewSet.cancelled_job_response` | `CM::CancelledJobForTechniciansTests` | 63 | Covered (proof photos and new field service reports were accepted on a cancelled job; travel replies were misleading, e.g. "Start navigation before marking arrival") |
| The technician's map for a cancelled job | `TechnicianMapNavigation.jsx` | n/a | 63 | Covered (it said "This job is finished" and linked to Job History) |
| Another technician learns nothing about a cancelled job that is not theirs | `refuse_technician_change_on_cancelled_job` (own jobs only) | `CM::test_another_technician_learns_nothing_about_the_cancelled_job` | n/a | Server only |
| The office says "no" to a client's reschedule request | `decline_reschedule` | `test_reschedule_decline.py` | 68 | Covered (2026-11-18): "Keep Current Date" (`decline_reschedule`) closes the request with a reason and tells the client |
| The client declines the handover | `client_confirm` (confirm only) | n/a | n/a | Recorded: the client confirms or contacts support; there is no decline |
| The lead cannot continue a started job (sick, phone dead, left the company) | `update_status` → `On Hold`, then `assign` | `test_office_stuck_job_actions.py` | 69 | Covered (2026-11-18): **dead end fixed**. Before, a job `Arrived on Site`/`In Progress` could not be reassigned or paused by the office; only "Dismiss ticket" was left, and the technician could not be deactivated. Now **Pause job**, then Update Assignment |
| The technician is at the site but the GPS arrival check blocks them (wrong pin) | `update_status` → `Arrived on Site`, `ArrivalValidationLog` | `test_office_stuck_job_actions.py` | 69 | Covered (2026-11-18): office **Confirm arrival** with a logged reason; before, the only way was turning location checks off for everyone |
| Any sequence of events by any role, on any job type (random walks), never breaks a rule or strands a job | all workflow actions | `test_flow_explorer.py` (seeded; widen with `FLOW_EXPLORER_WALKS`) | n/a | Covered (2026-11-18): found a reported inspection that could be travelled/worked again or set Ready for Service by hand (skipping the review, never finishable), a service checklist on an inspection visit that froze it In Progress, and 500s on unknown ids; all fixed, pinned in `test_flow_explorer_findings.py` |
| The company cancels a job (not the client) | dismissal reason prefix | `test_office_stuck_job_actions.py` | 69 | Covered (2026-11-18): "Office cancelled (our side)"; before, every dismissal was recorded as "Client backed out" |

## 4. Time cases (2026-11-09)

`TC` = `services/tests/test_time_cases.py` (the clock is moved with `mock.patch('django.utils.timezone.now')`;
password-reset links with `PasswordResetTokenGenerator._now`). The server keeps `TIME_ZONE=UTC` by design
(recorded earlier; analytics and report day buckets stay UTC). Rules that show or block something by
date, and every comparison of a local appointment time with "now", use the business day and time (UTC+8).

| Possibility | Decided by | Server test | Browser test | Status |
| --- | --- | --- | --- | --- |
| Late start and missed dispatch are measured from the local appointment time, at any hour | `sla._resolve_scheduled_start`, `get_ticket_dispatch_state` | `TC::LocalAppointmentTimeTests` | n/a | Covered (a 09:00 job was read as 09:00 UTC = 17:00 local: alerts and "missed dispatch" came 8 hours late, all day) |
| A same-day installation time must still be ahead of the local time | `inspection_decision` | `TC::test_a_same_day_installation_time_must_still_be_ahead` | n/a | Covered (at 14:00 a 10:00 installation was accepted) |
| Before 08:00: no installation or office reschedule dated yesterday; "today" needs a time | `inspection_decision`, `reschedule` | `TC::BeforeEightInTheMorningTests` | n/a | Covered (yesterday was accepted; today without a time was accepted) |
| Before 08:00: maintenance due today is "due" | `maintenance.evaluate_schedule_status` and the rest of `maintenance.py` | `TC::test_maintenance_due_today_is_due` | n/a | Covered (it showed "due soon") |
| A job finished before 08:00 starts its warranty and maintenance cycle that local day | `maintenance._normalize_to_date` | `TC::test_a_job_finished_before_eight_counts_on_that_local_day` | n/a | Covered (they started the day before) |
| Landing-page promotions start and end on local days | `public_landing_page_settings_view` | `TC::test_landing_page_promotions_run_by_the_local_day` | n/a | Covered (before 08:00 a promotion starting today was hidden and one that ended yesterday was still shown) |
| The calendar refuses changes to yesterday | `AdminCalendarClosureView` | `TC::test_the_calendar_refuses_changes_to_yesterday` | 13 | Covered |
| Activity log "today" count and date filters; Job History date filter | `admin_activity`, `TechnicianHistoryView` (`business_day_start`) | `TC::test_activity_log_today_and_date_filters_use_the_local_day`, `TC::test_technician_job_history_date_filter_uses_the_local_day` | 64 | Covered (a job finished at 07:00 local fell on the previous day) |
| After-sales overdue count, dashboard and calendar "today", default visit date, reservation date | `views_follow_up.summary`, `views_dashboard`, `helpers.build_initial_ticket_payload`, `request_parts` | `TC::test_after_sales_overdue_count_uses_the_local_day` | n/a | Covered |
| Activity log values that are times read as local time | `users.signals._display_change_value`, `AdminActivityLogs.metadataText` | n/a | 34 | Covered (raw UTC timestamps were shown) |
| Late-start alerts repeat at most once a day | `check_and_escalate_sla_breaches` (24 h dedupe) | `TC::test_a_late_start_alert_repeats_at_most_once_a_day` | n/a | Server only |
| Warranty is active through its last day; leap-day jobs get whole periods | `evaluate_warranty_status`, `sync_ticket_warranty` | `TC::test_warranty_is_active_through_its_last_day`, `TC::test_a_leap_day_job_gets_whole_periods` | n/a | Server only |
| A password reset link expires after 3 days | Django token generator | `TC::test_a_password_reset_link_expires` | n/a | Server only |
| Quotation expiry, unverified-account cleanup, maintenance reminder stages | existing | `test_quotation_revision.py`, `users/tests.py`, `test_maintenance_workflow.py` | 53 | Covered |
| Frontend "today": installation contract default date, CSV file names | `utils/date.getLocalDateInputValue` | n/a | n/a | Fixed (they used the UTC date) |
| Analytics and reports group days by UTC | `services/views/analytics.py`, `reports.py`, `users/forecasting_service.py` | n/a | n/a | Recorded design (earlier decision); a job finished 00:00-08:00 local counts on the previous day in those charts |
| Timed jobs (maintenance reminders and statuses, SLA escalations, auto-dispatch, analytics snapshots, location purge, forecasts) | `run_operational_automations` | their own tests | n/a | **Decision**: staging has no scheduler, so none of these run; a maintenance schedule stays "scheduled" on the Maintenance page after its date passes and no reminder is sent |
| The office says "Mark as Done" on a maintenance schedule | `MaintenanceScheduleViewSet.complete` | `test_after_sales_rules.py` | 61 | **Decision**: it ends the plan; the next cycle starts only when the maintenance visit is booked and completed as a job |

## 5. Large data and the staging hand check

### 5a. Large data (local, 2026-11-13)

A scratch copy of the test settings with its own SQLite file (the dev and e2e databases were not
touched) was filled with a few years of business: 3,042 users (40 technicians, 3,000 clients), 25,400
requests, 25,000 jobs, 74,000 status changes, 12,000 checklists, 6,000 quotations, 8,000 sales records,
400 items, 30,000 stock movements, 4,000 reservations, 5,000 maintenance schedules, 4,000 after-sales
cases, 46,000 messages, 82,000 notifications, 150,000 activity-log rows, 200,000 location points. Every
address the screens use was called as the office, a technician and a client, recording time, database
queries and response size. Times are this laptop on SQLite (staging PostgreSQL will differ); query
counts do not depend on the machine.

Fixed (each now has a fixed number of queries however many rows there are; `services/tests/test_query_ceilings.py`
goes from 3 to 30 jobs and checks the count stays the same; putting the old code back failed it for the dashboard, calendar, tickets summary, users and clients, and technician performance failed it before its fix):

| Screen (address) | Before | After |
| --- | --- | --- |
| Dashboard (`/api/services/dashboard/`) | 14.5 s, 3,662 queries | 7.1 s, 55 queries (SLA read once per list; the 20 active jobs were built twice and asked one query each for their latest % report) |
| Tickets summary cards (`service-tickets/summary/`) | 47.7 s, 1,637 queries | 3.0 s, 5 queries (counts in the database; only open jobs are checked for SLA) |
| Calendar (`/api/admin/calendar/`) | 19.4 s, 6,311 queries | 3.3 s, 7 queries |
| Users and Clients lists | 6.4 s, 3,045 queries each | 1.4-1.6 s, 3 queries |
| Technician performance (`performance_breakdown`) | 7.7 s, 1,121 queries | 2.9 s, 7 queries (one grouped query per figure; answers byte-identical to before in 7 cases) |
| Analytics (`/api/admin/analytics/`) | 14.3 s | 8.5 s (SLA read once) |
| Notifications page | read every notice, ten at a time (15,000 notices = 1,500 requests), and again on every new notice | one page of ten from the server per tab: 0.1 s (tabs, counts, Previous/Next in specs 55 and 45; the step back after deleting the last notice on a page, or when the page no longer exists, is not browser-tested) |

Fine at this size (under about 1 s): request, ticket, sales, quotation, follow-up, maintenance, inventory,
transaction, message and status-history lists (all paged), notification count, dashboard change check,
every client address.

Still slow (not changed; owner decision on priority):

| Screen (address) | Time, size | Why |
| --- | --- | --- |
| Ticket report (`service-tickets/report/`) | 50.9 s, 19 MB | Sends all 25,000 jobs in one answer |
| Coverage heatmaps (`completed_jobs`, `service_density`) | 15.8 s, 19.7 s | Group every job by place in Python |
| Activity-log filter lists (`facets`) | 7.4 s | Distinct values over 150,000 rows; an index would help (needs a migration) |
| Dashboard, Dashboard stats | 4.7-7.1 s | SLA checked for every open job (5,660) in Python |
| Tracking (`/api/tracking/`) | 4.3 s, 3.8 MB | Sends every open job with its locations |
| Technician My Jobs (`/api/technician/jobs/`) | 3.6 s, 2.6 MB | A busy technician's 2,490 jobs, not paged |
| Pending reservations | 2.1 s, 1.7 MB | 4,000 rows, not paged |
| Activity log list | 3.3 s | Counting 150,000 rows for the page count |

**Decision:** seven screens (Service Tickets, Dispatch Board, Reports, Follow-up Cases, Sales Records,
Support, the support assistant) load every job through `fetchAllPages('/services/service-tickets/')`,
ten per request: 25,000 jobs means about 2,500 requests in a row before the screen shows. Client
requests, admin users, maintenance schedules, sales records and inventory screens do the same with
their lists. Each needs its own server paging, search and filters; this is a larger change, best done
screen by screen after the current fixes are deployed.

### 5b. Staging hand check (to do: needs a deploy and real phones)

These cannot be proved locally (local email prints to the console, media is on disk, live updates use
one machine, the database is SQLite). Each is done by hand on staging after the next deploy. Note: the
staging start command runs `migrate`, so a deploy applies the pending `progress.0005` migration to the
staging database.

| Check | How | Expected |
| --- | --- | --- |
| Real email (Brevo) | Register a new client with a real inbox; ask for a password reset; approve a request and send a quotation | Verification, reset and job emails arrive (inbox, not spam), links open the staging site, the reset link works once |
| Cloudinary uploads | Upload a profile photo, a job proof photo from a phone camera, a message image, a document attachment; reload; open on another device | Each shows after reload and on the other device; nothing points at `/media/` on the backend host |
| Live updates between two phones | Phone A (client) and phone B (technician) on mobile data; office assigns the job, technician starts the trip, arrives, reports 50 %, completes | Phone A's bell, request page and map update without a reload; phone B's job list updates when the office reassigns or cancels |
| Location on a real phone | Technician allows location; drives a short distance | The office tracking map moves; "Updated … ago" stays fresh; denying location shows the message, not a blank map |
| Install as an app (PWA) and offline | Add to home screen on Android and iPhone; open with mobile data off | Opens; shows the offline message; works again when back online |
| PostgreSQL | Repeat a quick request → job → completion on staging | Same results as local; no 500s in the Render log |
| Scheduler absent | Leave a maintenance schedule past its date, a job past its SLA | Nothing changes on its own (no reminder, no escalation): this is the open scheduler decision, not a bug to be found by hand |
| Staging data size | Open Dashboard, Tickets, Calendar, Notifications with staging's real data | Each opens in a few seconds |
