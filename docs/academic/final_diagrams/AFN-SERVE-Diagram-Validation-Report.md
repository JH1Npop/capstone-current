# AFN-SERVE System Diagrams: Validation Report

Date: 2026-11-05. Deliverable: `AFN-SERVE-System-Diagrams.drawio` (four pages). Schema companion: `AFN-SERVE-Paper-Schema.dbml`. Tooling: `backend/scripts/diagram_pack/`.

## Counts

| Item | Value |
| --- | --- |
| ERD entities / relationships / attributes | 53 / 88 / 324 (audit links to User omitted, see Round 3) |
| Context external entities / flows | 8 (Client, Technician, Administrator, Superadministrator, Mapping and Routing, Email Delivery, Cloud File Storage, optional AI Assistant) / 44 labelled flows (42 entity flows plus 2 database flows); centre box 520x230 |
| Level 0 processes / data stores / external entities / flows | 9 / 16 / 8 / 95 directed flows drawn as 54 lines (41 two-way, 13 one-way) |
| Level 1 (decomposes 3.0 Manage Ticket Dispatch) subprocesses / data stores / flows | 7 / 4 / 28 (plus 3 dashed stubs for adjacent processes 2.0, 4.0, 7.0 and 3 external entities) |

## Checks actually run (all by `validate.py`, 2026-11-05)

- Four pages, unique page ids, landscape, no duplicate cell ids, no edge with a missing source/target, no shape outside its page, no overlapping shapes on any page.
- ERD entity, attribute and relationship counts equal the schema's table, column and foreign-key counts (53/346/110). The ERD and the schema are generated from the same DBML.
- DFD rules: every flow has a process at one end; no miracles or black holes; no store without both input and output on Level 0; each external entity drawn once; no duplicate flows.
- Balancing: Context entities equal Level 0 entities, with the same in/out directions per entity. Level 1 boundary neighbours equal Level 0 process 3.0's neighbours.
- Geometry from `check.py`: Context 0 crossings (44 flows, 0 diagonal segments); Level 1 2 crossings; Level 0 35 crossings. Line-hop arcs (jumpStyle) were removed from every page, so crossings are plain crossings. No connector passes through a shape and no two connectors share a segment on any DFD page.

## Not done

- No render in draw.io itself (not installed), so no real visual inspection and no PDF. The previews were drawn by my own SVG approximation.
- ERD connector crossings and edge-through-shape checks were not run; only the generator's own routing was relied on. The ERD page is 9414x6774 and will be unreadable if shrunk onto one paper page.
- Chen notation: entities, relationships, key attributes and cardinality labels are drawn. Participation (total/partial), weak entities and derived attributes are not modelled.

## Unresolved assumptions and discrepancies

1. The earlier context diagram omitted the Google Gemini API, which `backend/users/views/admin_services.py` calls when `GEMINI_API_KEY` is set. It is now an optional provider on Context and Level 0.
2. The older paper ERD/DBML omitted 9 of the 61 models: `CalendarClosure` (added now) and 8 document-template models (`DocumentDefinition`, `DocumentTemplate`, `DocumentTemplateVersion`, `DocumentTemplateField`, `DocumentFieldDefinition`, `DocumentInstance`, `DocumentOutput`, `DocumentAttachment`). The 8 remain excluded as administration configuration; decide whether the paper needs them.
3. The older DFD had no store or process for quotations, sales, payments or documents. Level 0 now adds process 9.0 with stores D15 and D16, and keeps processes 1.0 to 8.0 numbered as before.
4. The client-side support assistant is a frontend widget over the tickets and support-case endpoints, so there is no separate client-assistant flow.
5. The Context diagram keeps the AFN-SERVE database (the professor-required store), although a strict context diagram has no store.
6. Level 1 decomposes only 3.0 (a conventional Level 1 decomposes one parent process). Decomposing the other eight processes is left to the author.
7. Process-to-store mapping, and which process writes D2 (service catalog, SLA rules, skills, assigned to 2.0), are modelling choices backed by `ServiceTypeViewSet`, `SLARuleViewSet` and `TechnicianSkillViewSet` in `services/views/`.

## Evidence for key decisions

| Element | Evidence |
| --- | --- |
| Roles client, technician, admin, superadmin | `backend/users/rbac.py` |
| Geocoding provider | `backend/api/views.py` (Nominatim); routing `backend/services/ors_utils.py` (ORS with OSRM fallback), used in `services/views/tickets.py` |
| Email provider | `backend/afn_service_management/email_backends.py` (Brevo) |
| File storage | `backend/afn_service_management/storage.py` (Cloudinary) |
| AI provider | `backend/users/views/admin_services.py` (Gemini, optional) |
| 3.1 to 3.7 dispatch subprocesses | `ServiceRequestViewSet.approve/reject`, `scheduling_policy.py`, `deposits.ticket_deposit_gate`, `auto_dispatch.py`, `tickets.assign/auto_assign`, `tickets.inspection_decision`, `sla.check_and_escalate_sla_breaches` |
| Entity/attribute set | `AFN-SERVE-Paper-Schema.dbml` generated from Django models |

## Weakest page

Level 0 is the densest. Nine processes, eight external entities and 16 stores produce 92 flows. It is valid and balanced but not a clean read. Options if it is too busy for the paper: split it into two figures by actor, or merge request/response pairs into single two-way arrows.

## Round 2 changes (2026-11-05)

- ERD relationship diamonds show only a verb (no R-code, no foreign-key column); cardinality 1/N stays beside each diamond.
- Context rebuilt in the hub-and-spoke style of the user's reference: small centre box, 44 parallel labelled lines, nested routing so no group crosses itself. Built by `backend/scripts/diagram_pack/build_context.py`.
- The 44 Context labels are more detailed than Level 0 labels but only restate Level 0 data (turnover acceptance, change logs, public content and map tiles come from existing models and the frontend map layer). Map tile images are drawn as a Mapping and Routing flow although the browser fetches tiles directly.
- Still not rendered in draw.io; the preview is my own SVG approximation.
- Context restyled to match the reference figure on a white background: compact actor boxes with stepped line fan-out, tightly packed rows, blue centre box, green external providers, red database cylinder. Only the Context page uses these colours; Level 0 and Level 1 keep purple/turquoise/yellow. `validate.py` recognises both colour sets.
- Import look (2026-11-05): connectors are black on every page; label backgrounds use the theme-neutral `labelBackgroundColor=default` instead of a fixed white, because a viewer in dark mode turned the white into black behind the text; Context labels sit just above their line; fills are flat (no gradient, shadow or transparency). `merge.py` applies the colour and label rules to all pages in its FINISH step.

## Round 3 changes (2026-11-05): ERD entanglement

- With the line-hop arcs removed, the ERD showed its real crossings: 283 crossings between relationship lines (measured on the generated geometry; earlier reports said ERD crossings were not checked). 41 of the 110 relationships end in "by" and their legs caused 208 of the 283 crossings.
- `generate_afn_paper_schema.py` now omits pure audit-trail foreign keys to User (created, updated, changed, voided, reviewed, confirmed, completed, submitted, prepared, generated, finalized, uploaded, granted, reopened, recorded, performed, location-validation-updated "by"), unless that link is the table's only relationship. The physical database is unchanged. The ERD and the paper schema are both regenerated from that reduced file: 53 entities, 88 relationships, 324 attributes. Business links such as owned by, sent by, received by and managed by stay. The ERD page note says audit links are omitted.
- Entity seats in the ERD grid are searched with `backend/scripts/diagram_pack/optimize_erd.py` (annealing against the real crossing count); `chen.py` loads the result from `erd_grid.json`.
- Result: ERD relationship-line crossings 283 -> 202 after omitting audit links -> 84 after the seat search (three annealing passes, about 11,500 evaluated layouts). Measured by script on the generated geometry; not seen in draw.io. Hubs User and Service Ticket still account for most of the remaining crossings. Level 0 is unchanged and still has the most crossings among the DFD pages.
- Round 3 follow-up: line-hop arcs (`jumpStyle=arc`) were restored on the ERD, Level 0 and Level 1 pages at the user's request; `merge.py` adds them. Crossing counts are unchanged (ERD 84, Level 0 and Level 1 as before); Context has none.

## Round 4: is Level 0 the real data flow? (2026-11-05)

Checked Level 0 flows against the code (routes in `urls.py`, `FileField` use, `send_mail` callers, frontend file inputs). Corrections made:

- Removed `2.0 <-> Cloud File Storage` "request attachment upload/reference": service requests have no file field in the backend and the client request pages have no file input, so the flow did not exist. The same word was removed from the Context diagram.
- Added the uploads that do exist: `1.0 <-> Cloud` (profile photos via `User.profile_image`, landing-page images via `LandingPageAsset`) and `7.0 <-> Cloud` (message image attachments via `Message.image`).
- Added `6.0 -> Email` "maintenance reminder email request": `services/maintenance.py` calls `send_mail` directly. The `7.0 -> Email` flow is now "notification email request" (`notifications/notification_utils.py`).
- Technician flow to `4.0` now names arrival and GPS location; store D5 is now "Ticket Progress, Status History, and Location Log" (`TechnicianLocationHistory`, `ArrivalValidationLog`).
- Confirmed as real: ORS/OSRM routing and geocoding, Gemini analytics, password reset and email verification email, proof photo and video upload, document file storage, support cases and messages, maintenance schedules, follow-up cases.
- Not verified one by one: the exact process-to-store read/write assignments (modelling choices).
- Layout cost: with the corrected flows Level 0 routes to 95 flows and 91 crossings (check.py count) with no diagonal segments, up from 35 before. A refinement search did not beat this. Merging request/response pairs into two-way arrows, or splitting the page, would be the next step.

## Round 5: Level 0 merged lines (2026-11-05)

- Each request/response pair between the same two nodes is now one two-way line (arrowheads at both ends). The label has two lines: the first is the flow into the process, the second is the flow out of it; a legend on the page says so. 95 directed flows are drawn as 54 lines (`dfd_build.py ... merge`).
- `validate.py` expands a two-way line into its two directed flows, so the miracle/black-hole, duplicate-flow, Context balancing and Level 1 balancing checks still count all 95 flows.
- Crossings (check.py count): 91 before merging, 28 after; 0 diagonal segments, 0 labels without a clear spot. Stores D2, D7, D14 and D16 were moved 150px outward so their two-line labels fit.
- Level 0 is still a wide page (4600x3000) with some long lines; not seen in draw.io. Context keeps one arrow per flow (superseded for Level 1 by Round 6).

## Round 6: fewer crossings (2026-11-05)

- Level 1 is now built with the same merged two-way lines as Level 0 (28 directed flows on 25 lines, legend on the page), routed with a high crossing cost and extra margin: 4 crossings (check.py count), 0 unplaced labels. Context is unchanged (one arrow per flow, 0 crossings).
- Level 0 routed with crossing costs 300 and 1500 on the same layout: 27 crossings both times; the cost setting does not lower crossings further, the layout limits it. Remaining crossings are drawn with line hops.
- `spec_level1.py` is now the padded variant (+200 px offsets, crossing cost 1500); do not run `variant.py` on it again.
- A hub-and-ring Level 0 layout (`ring_layout.py`, Administrator in the centre) had only 11 to 14 straight-line crossings but routed to 80 to 95 crossings with orthogonal lines, so it was rejected. The installed Level 0 layout (28 crossings) is final for now.

## Round 7: table names match their primary keys (2026-11-05)

- Paper schema tables are now named after their entity (snake_case model name) and every primary key is `<table>_id`, for example `service_ticket` / `service_ticket_id`, `technical_data_sheet` / `technical_data_sheet_id` (was `services_technicaldatasheet` / `tds_id`), `calendar_closure` / `calendar_closure_id` (was `services_calendarclosure` / `id`). Foreign-key columns keep their role names (`ticket_id`, `technician_id`) and point at `<table>.<table>_id`.
- The paper names differ from the real database table and key names (for example `services_fieldservicereport.fsr_id`, `services_calendarclosure.id`, `services_installationcontract.contract_id`, `services_quotationrecord.quotation_id`, `services_solarprojectprofile.project_profile_id`, `services_technicaldatasheet.tds_id`). The mapping of database table to paper table is `backend/scripts/diagram_pack/table_names.json`. The physical database is unchanged.
- Strict check (script, 53 tables): table set, column set per table, primary key (underlined attribute) and entity label (SERVICE TICKET <-> service_ticket) are identical between the ERD and the schema; 88 references all point at an existing `<table>.<table>_id`. ERD layout and crossings are unchanged (84).
- `diagram_pack/erd_source.py` translates the paper names back to the database keys that the Chen generator and the saved seat grid use; `chen.py` and `optimize_erd.py` both call it.

## Round 8: data dictionary (2026-11-05)

- `AFN-SERVE-Data-Dictionary.docx` has one table per paper-schema table (53 tables, 324 rows) in the capstone sample format: "Table N: Name", columns FieldName, DataType, PK, FK, Null, Description, "Yes" where the sample has a check mark, and a one-paragraph description under each table. It is built from `AFN-SERVE-Paper-Schema.dbml` by `diagram_pack/build_data_dictionary.py` (data) and `build_data_dictionary_docx.py` (Word, python-docx).
- Allowed values in the descriptions (for example the user roles) come from the Django model `choices`; type, key and nullability come from the schema. Table and column descriptions are written text, not generated from code comments.
- Checks run: Word schema validation passed; the document read back equals the data for all 53 tables. Not done: no page render (no Word or LibreOffice on this machine), so fonts and page breaks were not seen.
- Data types are shown without lengths (INTEGER, VARCHAR, TEXT, BOOLEAN, DATE, TIME, TIMESTAMP, DECIMAL, FLOAT) to match the sample.

