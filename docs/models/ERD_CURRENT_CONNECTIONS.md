# AFN Current ERD Connections

Each relationship follows this format:

`(SOURCE ENTITY) ---- source cardinality ---- VERB ---- target cardinality ---- (TARGET ENTITY)`

`N` means many, `1` means exactly one, and `0..1` means optional one. The field mapping identifies the exact foreign-key and referenced fields.

Each code R001–R107 is printed in the matching relationship diamond of the Chen ERD (`AFN_ERD_CHEN_PRESENTATION.drawio`).

Total relationships: **107**

### Analytics

- **R001** (DEMAND FORECAST) ---- N ---- USES SERVICE ---- 1 ---- (SERVICE TYPE)  [`service_type_id` -> `service_type_id`]
- **R002** (SERVICE ANALYTICS) ---- N ---- USES SERVICE ---- 1 ---- (SERVICE TYPE)  [`service_type_id` -> `service_type_id`]
- **R003** (SERVICE TREND) ---- N ---- USES SERVICE ---- 1 ---- (SERVICE TYPE)  [`service_type_id` -> `service_type_id`]
- **R004** (TECHNICIAN PERFORMANCE) ---- N ---- ASSIGNED TO ---- 1 ---- (USER)  [`technician_id` -> `user_id`]

### After-Sales and Communication

- **R005** (AFTER-SALES CASE) ---- N ---- ASSIGNED TO ---- 1 ---- (USER)  [`assigned_to_id` -> `user_id`]
- **R006** (AFTER-SALES CASE) ---- N ---- OWNED BY ---- 1 ---- (USER)  [`client_id` -> `user_id`]
- **R007** (AFTER-SALES CASE) ---- N ---- CREATED BY ---- 1 ---- (USER)  [`created_by_id` -> `user_id`]
- **R008** (AFTER-SALES CASE) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`service_ticket_id` -> `service_ticket_id`]
- **R009** (AFTER-SALES CASE EVENT) ---- N ---- PERFORMED BY ---- 1 ---- (USER)  [`actor_id` -> `user_id`]
- **R010** (AFTER-SALES CASE EVENT) ---- N ---- FOR CASE ---- 1 ---- (AFTER-SALES CASE)  [`case_id` -> `after_sales_case_id`]
- **R011** (CUSTOMER SUPPORT CASE) ---- N ---- OWNED BY ---- 1 ---- (USER)  [`client_id` -> `user_id`]
- **R012** (CUSTOMER SUPPORT CASE) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
- **R013** (MAINTENANCE SCHEDULE) ---- N ---- OWNED BY ---- 1 ---- (USER)  [`client_id` -> `user_id`]
- **R014** (MAINTENANCE SCHEDULE) ---- 1 ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`service_ticket_id` -> `service_ticket_id`]
- **R015** (MAINTENANCE SCHEDULE) ---- N ---- USES SERVICE ---- 1 ---- (SERVICE TYPE)  [`service_type_id` -> `service_type_id`]
- **R016** (MESSAGE) ---- N ---- RECEIVED BY ---- 1 ---- (USER)  [`receiver_id` -> `user_id`]
- **R017** (MESSAGE) ---- N ---- SENT BY ---- 1 ---- (USER)  [`sender_id` -> `user_id`]
- **R018** (MESSAGE) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
- **R019** (NOTIFICATION) ---- N ---- FOR REQUEST ---- 1 ---- (SERVICE REQUEST)  [`request_id` -> `service_request_id`]
- **R020** (NOTIFICATION) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
- **R021** (NOTIFICATION) ---- N ---- BELONGS TO ---- 1 ---- (USER)  [`user_id` -> `user_id`]

### Identity, Access, Configuration and Audit

- **R022** (ACTIVITY LOG) ---- N ---- PERFORMED BY ---- 1 ---- (USER)  [`actor_id` -> `user_id`]
- **R023** (ADMIN SETTINGS) ---- N ---- LOCATION SETTINGS UPDATED BY ---- 1 ---- (USER)  [`location_validation_updated_by_id` -> `user_id`]
- **R024** (ADMIN SETTINGS) ---- N ---- UPDATED BY ---- 1 ---- (USER)  [`updated_by_id` -> `user_id`]
- **R025** (CHANGE LOG) ---- N ---- CHANGED BY ---- 1 ---- (USER)  [`changed_by_id` -> `user_id`]
- **R026** (CLIENT PROFILE) ---- 1 ---- BELONGS TO ---- 1 ---- (USER)  [`user_id` -> `user_id`]
- **R027** (LANDING PAGE ASSET) ---- N ---- UPLOADED BY ---- 1 ---- (USER)  [`uploaded_by_id` -> `user_id`]
- **R028** (MANAGEMENT PROFILE) ---- 1 ---- BELONGS TO ---- 1 ---- (USER)  [`user_id` -> `user_id`]
- **R029** (TECHNICIAN PROFILE) ---- 1 ---- BELONGS TO ---- 1 ---- (USER)  [`user_id` -> `user_id`]
- **R030** (USER CAPABILITY GRANT) ---- N ---- GRANTED BY ---- 1 ---- (USER)  [`granted_by_id` -> `user_id`]
- **R031** (USER CAPABILITY GRANT) ---- N ---- BELONGS TO ---- 1 ---- (USER)  [`user_id` -> `user_id`]

### Service Intake, Dispatch and Progress

- **R032** (ARRIVAL VALIDATION LOG) ---- N ---- PERFORMED BY ---- 1 ---- (USER)  [`performed_by_id` -> `user_id`]
- **R033** (ARRIVAL VALIDATION LOG) ---- N ---- ASSIGNED TO ---- 1 ---- (USER)  [`technician_id` -> `user_id`]
- **R034** (ARRIVAL VALIDATION LOG) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
- **R035** (SERVICE LOCATION) ---- 1 ---- FOR REQUEST ---- 1 ---- (SERVICE REQUEST)  [`request_id` -> `service_request_id`]
- **R036** (SERVICE REQUEST) ---- N ---- OWNED BY ---- 1 ---- (USER)  [`client_id` -> `user_id`]
- **R037** (SERVICE REQUEST) ---- N ---- USES SERVICE ---- 1 ---- (SERVICE TYPE)  [`service_type_id` -> `service_type_id`]
- **R038** (SERVICE REQUEST SERVICE) ---- N ---- FOR REQUEST ---- 1 ---- (SERVICE REQUEST)  [`request_id` -> `service_request_id`]
- **R039** (SERVICE REQUEST SERVICE) ---- N ---- USES SERVICE ---- 1 ---- (SERVICE TYPE)  [`service_type_id` -> `service_type_id`]
- **R040** (SERVICE STATUS HISTORY) ---- N ---- CHANGED BY ---- 1 ---- (USER)  [`changed_by_id` -> `user_id`]
- **R041** (SERVICE STATUS HISTORY) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
- **R042** (SERVICE TICKET) ---- N ---- MANAGED BY ---- 1 ---- (USER)  [`assigned_admin_id` -> `user_id`]
- **R043** (SERVICE TICKET) ---- N ---- FOR REQUEST ---- 1 ---- (SERVICE REQUEST)  [`request_id` -> `service_request_id`]
- **R044** (SERVICE TICKET) ---- N ---- ASSIGNED TO ---- 1 ---- (USER)  [`technician_id` -> `user_id`]
- **R045** (SOLAR ESTIMATE) ---- N ---- OWNED BY ---- 1 ---- (USER)  [`client_id` -> `user_id`]
- **R046** (SOLAR ESTIMATE) ---- 0..1 ---- FROM REQUEST ---- 1 ---- (SERVICE REQUEST)  [`service_request_id` -> `service_request_id`]
- **R047** (TECHNICIAN LOCATION HISTORY) ---- N ---- ASSIGNED TO ---- 1 ---- (USER)  [`technician_id` -> `user_id`]
- **R048** (TECHNICIAN SKILL) ---- N ---- USES SERVICE ---- 1 ---- (SERVICE TYPE)  [`service_type_id` -> `service_type_id`]
- **R049** (TECHNICIAN SKILL) ---- N ---- ASSIGNED TO ---- 1 ---- (USER)  [`technician_id` -> `user_id`]
- **R050** (TICKET CREW ASSIGNMENT) ---- N ---- ASSIGNED TO ---- 1 ---- (USER)  [`technician_id` -> `user_id`]
- **R051** (TICKET CREW ASSIGNMENT) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
- **R052** (TICKET PROGRESS) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
- **R053** (TICKET PROGRESS) ---- N ---- UPDATED BY ---- 1 ---- (USER)  [`updated_by_id` -> `user_id`]

### Field Evidence and Documents

- **R054** (FIELD SERVICE REPORT) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
- **R055** (GENERATED DOCUMENT) ---- N ---- GENERATED BY ---- 1 ---- (USER)  [`generated_by_id` -> `user_id`]
- **R056** (GENERATED DOCUMENT) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
- **R057** (INSPECTION CHECKLIST) ---- N ---- COMPLETED BY ---- 1 ---- (USER)  [`completed_by_id` -> `user_id`]
- **R058** (INSPECTION CHECKLIST) ---- N ---- SUBMITTED BY ---- 1 ---- (USER)  [`submitted_by_id` -> `user_id`]
- **R059** (INSPECTION CHECKLIST) ---- 1 ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
- **R060** (INSTALLATION CONTRACT) ---- 1 ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
- **R061** (INSTALLED EQUIPMENT) ---- N ---- OWNED BY ---- 1 ---- (USER)  [`client_id` -> `user_id`]
- **R062** (INSTALLED EQUIPMENT) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
- **R063** (QUOTATION RECORD) ---- N ---- OWNED BY ---- 1 ---- (USER)  [`client_id` -> `user_id`]
- **R064** (QUOTATION RECORD) ---- 1 ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
- **R065** (SOLAR COMMISSIONING CHECKLIST) ---- N ---- COMPLETED BY ---- 1 ---- (USER)  [`completed_by_id` -> `user_id`]
- **R066** (SOLAR COMMISSIONING CHECKLIST) ---- 1 ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
- **R067** (SOLAR PROJECT PROFILE) ---- 1 ---- AT LOCATION ---- 1 ---- (SERVICE LOCATION)  [`location_id` -> `service_location_id`]
- **R068** (SOLAR PROJECT PROFILE) ---- 0..1 ---- ORIGINATES FROM ---- 1 ---- (SERVICE TICKET)  [`original_ticket_id` -> `service_ticket_id`]
- **R069** (TECHNICAL DATA SHEET) ---- N ---- PREPARED BY ---- 1 ---- (USER)  [`prepared_by_id` -> `user_id`]
- **R070** (TECHNICAL DATA SHEET) ---- N ---- REVIEWED BY ---- 1 ---- (USER)  [`reviewed_by_id` -> `user_id`]
- **R071** (TECHNICAL DATA SHEET) ---- 1 ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
- **R072** (TURNOVER ACCEPTANCE) ---- N ---- HAS CLIENT CONFIRMED BY ---- 1 ---- (USER)  [`client_confirmed_by_id` -> `user_id`]
- **R073** (TURNOVER ACCEPTANCE) ---- N ---- FINALIZED BY ---- 1 ---- (USER)  [`finalized_by_id` -> `user_id`]
- **R074** (TURNOVER ACCEPTANCE) ---- N ---- USES DOCUMENT ---- 1 ---- (GENERATED DOCUMENT)  [`generated_document_id` -> `generated_document_id`]
- **R075** (TURNOVER ACCEPTANCE) ---- 1 ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]

### Inventory, Returns and Sales

- **R076** (EQUIPMENT RETURN REQUEST) ---- N ---- REVIEWED BY ---- 1 ---- (USER)  [`reviewed_by_id` -> `user_id`]
- **R077** (EQUIPMENT RETURN REQUEST) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`service_ticket_id` -> `service_ticket_id`]
- **R078** (EQUIPMENT RETURN REQUEST) ---- N ---- SUBMITTED BY ---- 1 ---- (USER)  [`submitted_by_id` -> `user_id`]
- **R079** (EQUIPMENT RETURN REQUEST) ---- N ---- ASSIGNED TO ---- 1 ---- (USER)  [`technician_id` -> `user_id`]
- **R080** (EQUIPMENT RETURN REQUEST ITEM) ---- N ---- USES ITEM ---- 1 ---- (INVENTORY ITEM)  [`item_id` -> `inventory_item_id`]
- **R081** (EQUIPMENT RETURN REQUEST ITEM) ---- N ---- CONTAINS ---- 1 ---- (EQUIPMENT RETURN REQUEST)  [`return_request_id` -> `equipment_return_request_id`]
- **R082** (INVENTORY CATEGORY) ---- N ---- HAS PARENT ---- 1 ---- (INVENTORY CATEGORY)  [`parent_id` -> `inventory_category_id`]
- **R083** (INVENTORY ITEM) ---- N ---- IN CATEGORY ---- 1 ---- (INVENTORY CATEGORY)  [`category_id` -> `inventory_category_id`]
- **R084** (INVENTORY RESERVATION) ---- N ---- USES ITEM ---- 1 ---- (INVENTORY ITEM)  [`item_id` -> `inventory_item_id`]
- **R085** (INVENTORY RESERVATION) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`service_ticket_id` -> `service_ticket_id`]
- **R086** (INVENTORY RESERVATION) ---- N ---- ASSIGNED TO ---- 1 ---- (USER)  [`technician_id` -> `user_id`]
- **R087** (INVENTORY TRANSACTION) ---- N ---- USES ITEM ---- 1 ---- (INVENTORY ITEM)  [`item_id` -> `inventory_item_id`]
- **R088** (INVENTORY TRANSACTION) ---- N ---- PERFORMED BY ---- 1 ---- (USER)  [`performed_by_id` -> `user_id`]
- **R089** (INVENTORY TRANSACTION) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`service_ticket_id` -> `service_ticket_id`]
- **R090** (INVENTORY TRANSACTION) ---- N ---- ASSIGNED TO ---- 1 ---- (USER)  [`technician_id` -> `user_id`]
- **R091** (SALES PAYMENT) ---- N ---- BASED ON ---- 1 ---- (QUOTATION RECORD)  [`quotation_id` -> `quotation_id`]
- **R092** (SALES PAYMENT) ---- N ---- HAS RECORDED BY ---- 1 ---- (USER)  [`recorded_by_id` -> `user_id`]
- **R093** (SALES PAYMENT) ---- N ---- CONTAINS ---- 1 ---- (SALES RECORD)  [`sales_record_id` -> `sales_record_id`]
- **R094** (SALES PAYMENT) ---- N ---- VOIDED BY ---- 1 ---- (USER)  [`voided_by_id` -> `user_id`]
- **R095** (SALES RECORD) ---- N ---- OWNED BY ---- 1 ---- (USER)  [`client_id` -> `user_id`]
- **R096** (SALES RECORD) ---- N ---- CONFIRMED BY ---- 1 ---- (USER)  [`confirmed_by_id` -> `user_id`]
- **R097** (SALES RECORD) ---- N ---- CREATED BY ---- 1 ---- (USER)  [`created_by_id` -> `user_id`]
- **R098** (SALES RECORD) ---- N ---- BASED ON ---- 1 ---- (QUOTATION RECORD)  [`quotation_id` -> `quotation_id`]
- **R099** (SALES RECORD) ---- 0..1 ---- REPLACES ---- 1 ---- (SALES RECORD)  [`replaces_id` -> `sales_record_id`]
- **R100** (SALES RECORD) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
- **R101** (SALES RECORD) ---- N ---- VOIDED BY ---- 1 ---- (USER)  [`voided_by_id` -> `user_id`]
- **R102** (SALES RECORD LINE) ---- N ---- USES EQUIPMENT ---- 1 ---- (INSTALLED EQUIPMENT)  [`installed_equipment_id` -> `installed_equipment_id`]
- **R103** (SALES RECORD LINE) ---- N ---- USES ITEM ---- 1 ---- (INVENTORY ITEM)  [`inventory_item_id` -> `inventory_item_id`]
- **R104** (SALES RECORD LINE) ---- N ---- CONTAINS ---- 1 ---- (SALES RECORD)  [`sales_record_id` -> `sales_record_id`]
- **R105** (SALES RECORD LINE) ---- N ---- USES SERVICE ---- 1 ---- (SERVICE TYPE)  [`service_type_id` -> `service_type_id`]
- **R106** (SERVICE TYPE INVENTORY REQUIREMENT) ---- N ---- USES ITEM ---- 1 ---- (INVENTORY ITEM)  [`item_id` -> `inventory_item_id`]
- **R107** (SERVICE TYPE INVENTORY REQUIREMENT) ---- N ---- USES SERVICE ---- 1 ---- (SERVICE TYPE)  [`service_type_id` -> `service_type_id`]
