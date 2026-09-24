# AFN Current ERD Connections

Each relationship follows this format:

`(SOURCE ENTITY) ---- source cardinality ---- VERB ---- target cardinality ---- (TARGET ENTITY)`

`N` means many, `1` means exactly one, and `0..1` means optional one. The field mapping identifies the exact foreign-key and referenced fields.

Total relationships: **102**

### Analytics

1. (DEMAND FORECAST) ---- N ---- USES SERVICE ---- 1 ---- (SERVICE TYPE)  [`service_type_id` -> `service_type_id`]
2. (SERVICE ANALYTICS) ---- N ---- USES SERVICE ---- 1 ---- (SERVICE TYPE)  [`service_type_id` -> `service_type_id`]
3. (SERVICE TREND) ---- N ---- USES SERVICE ---- 1 ---- (SERVICE TYPE)  [`service_type_id` -> `service_type_id`]
4. (TECHNICIAN PERFORMANCE) ---- N ---- ASSIGNED TO ---- 1 ---- (USER)  [`technician_id` -> `user_id`]

### After-Sales and Communication

5. (AFTER-SALES CASE) ---- N ---- ASSIGNED TO ---- 1 ---- (USER)  [`assigned_to_id` -> `user_id`]
6. (AFTER-SALES CASE) ---- N ---- OWNED BY ---- 1 ---- (USER)  [`client_id` -> `user_id`]
7. (AFTER-SALES CASE) ---- N ---- CREATED BY ---- 1 ---- (USER)  [`created_by_id` -> `user_id`]
8. (AFTER-SALES CASE) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`service_ticket_id` -> `service_ticket_id`]
9. (AFTER-SALES CASE EVENT) ---- N ---- PERFORMED BY ---- 1 ---- (USER)  [`actor_id` -> `user_id`]
10. (AFTER-SALES CASE EVENT) ---- N ---- FOR CASE ---- 1 ---- (AFTER-SALES CASE)  [`case_id` -> `after_sales_case_id`]
11. (CUSTOMER SUPPORT CASE) ---- N ---- OWNED BY ---- 1 ---- (USER)  [`client_id` -> `user_id`]
12. (CUSTOMER SUPPORT CASE) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
13. (MAINTENANCE SCHEDULE) ---- N ---- OWNED BY ---- 1 ---- (USER)  [`client_id` -> `user_id`]
14. (MAINTENANCE SCHEDULE) ---- 1 ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`service_ticket_id` -> `service_ticket_id`]
15. (MAINTENANCE SCHEDULE) ---- N ---- USES SERVICE ---- 1 ---- (SERVICE TYPE)  [`service_type_id` -> `service_type_id`]
16. (MESSAGE) ---- N ---- RECEIVED BY ---- 1 ---- (USER)  [`receiver_id` -> `user_id`]
17. (MESSAGE) ---- N ---- SENT BY ---- 1 ---- (USER)  [`sender_id` -> `user_id`]
18. (MESSAGE) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
19. (NOTIFICATION) ---- N ---- FOR REQUEST ---- 1 ---- (SERVICE REQUEST)  [`request_id` -> `service_request_id`]
20. (NOTIFICATION) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
21. (NOTIFICATION) ---- N ---- BELONGS TO ---- 1 ---- (USER)  [`user_id` -> `user_id`]

### Identity, Access, Configuration and Audit

22. (ACTIVITY LOG) ---- N ---- PERFORMED BY ---- 1 ---- (USER)  [`actor_id` -> `user_id`]
23. (ADMIN SETTINGS) ---- N ---- LOCATION SETTINGS UPDATED BY ---- 1 ---- (USER)  [`location_validation_updated_by_id` -> `user_id`]
24. (ADMIN SETTINGS) ---- N ---- UPDATED BY ---- 1 ---- (USER)  [`updated_by_id` -> `user_id`]
25. (CHANGE LOG) ---- N ---- CHANGED BY ---- 1 ---- (USER)  [`changed_by_id` -> `user_id`]
26. (CLIENT PROFILE) ---- 1 ---- BELONGS TO ---- 1 ---- (USER)  [`user_id` -> `user_id`]
27. (LANDING PAGE ASSET) ---- N ---- UPLOADED BY ---- 1 ---- (USER)  [`uploaded_by_id` -> `user_id`]
28. (MANAGEMENT PROFILE) ---- 1 ---- BELONGS TO ---- 1 ---- (USER)  [`user_id` -> `user_id`]
29. (TECHNICIAN PROFILE) ---- 1 ---- BELONGS TO ---- 1 ---- (USER)  [`user_id` -> `user_id`]
30. (USER CAPABILITY GRANT) ---- N ---- GRANTED BY ---- 1 ---- (USER)  [`granted_by_id` -> `user_id`]
31. (USER CAPABILITY GRANT) ---- N ---- BELONGS TO ---- 1 ---- (USER)  [`user_id` -> `user_id`]

### Service Intake, Dispatch and Progress

32. (ARRIVAL VALIDATION LOG) ---- N ---- PERFORMED BY ---- 1 ---- (USER)  [`performed_by_id` -> `user_id`]
33. (ARRIVAL VALIDATION LOG) ---- N ---- ASSIGNED TO ---- 1 ---- (USER)  [`technician_id` -> `user_id`]
34. (ARRIVAL VALIDATION LOG) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
35. (SERVICE LOCATION) ---- 1 ---- FOR REQUEST ---- 1 ---- (SERVICE REQUEST)  [`request_id` -> `service_request_id`]
36. (SERVICE REQUEST) ---- N ---- OWNED BY ---- 1 ---- (USER)  [`client_id` -> `user_id`]
37. (SERVICE REQUEST) ---- N ---- USES SERVICE ---- 1 ---- (SERVICE TYPE)  [`service_type_id` -> `service_type_id`]
38. (SERVICE REQUEST SERVICE) ---- N ---- FOR REQUEST ---- 1 ---- (SERVICE REQUEST)  [`request_id` -> `service_request_id`]
39. (SERVICE REQUEST SERVICE) ---- N ---- USES SERVICE ---- 1 ---- (SERVICE TYPE)  [`service_type_id` -> `service_type_id`]
40. (SERVICE STATUS HISTORY) ---- N ---- CHANGED BY ---- 1 ---- (USER)  [`changed_by_id` -> `user_id`]
41. (SERVICE STATUS HISTORY) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
42. (SERVICE TICKET) ---- N ---- MANAGED BY ---- 1 ---- (USER)  [`assigned_admin_id` -> `user_id`]
43. (SERVICE TICKET) ---- N ---- FOR REQUEST ---- 1 ---- (SERVICE REQUEST)  [`request_id` -> `service_request_id`]
44. (SERVICE TICKET) ---- N ---- ASSIGNED TO ---- 1 ---- (USER)  [`technician_id` -> `user_id`]
45. (SOLAR ESTIMATE) ---- N ---- OWNED BY ---- 1 ---- (USER)  [`client_id` -> `user_id`]
46. (SOLAR ESTIMATE) ---- 0..1 ---- FROM REQUEST ---- 1 ---- (SERVICE REQUEST)  [`service_request_id` -> `service_request_id`]
47. (TECHNICIAN LOCATION HISTORY) ---- N ---- ASSIGNED TO ---- 1 ---- (USER)  [`technician_id` -> `user_id`]
48. (TECHNICIAN SKILL) ---- N ---- USES SERVICE ---- 1 ---- (SERVICE TYPE)  [`service_type_id` -> `service_type_id`]
49. (TECHNICIAN SKILL) ---- N ---- ASSIGNED TO ---- 1 ---- (USER)  [`technician_id` -> `user_id`]
50. (TICKET CREW ASSIGNMENT) ---- N ---- ASSIGNED TO ---- 1 ---- (USER)  [`technician_id` -> `user_id`]
51. (TICKET CREW ASSIGNMENT) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
52. (TICKET PROGRESS) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
53. (TICKET PROGRESS) ---- N ---- UPDATED BY ---- 1 ---- (USER)  [`updated_by_id` -> `user_id`]

### Field Evidence and Documents

54. (FIELD SERVICE REPORT) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
55. (GENERATED DOCUMENT) ---- N ---- GENERATED BY ---- 1 ---- (USER)  [`generated_by_id` -> `user_id`]
56. (GENERATED DOCUMENT) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
57. (INSPECTION CHECKLIST) ---- N ---- COMPLETED BY ---- 1 ---- (USER)  [`completed_by_id` -> `user_id`]
58. (INSPECTION CHECKLIST) ---- N ---- SUBMITTED BY ---- 1 ---- (USER)  [`submitted_by_id` -> `user_id`]
59. (INSPECTION CHECKLIST) ---- 1 ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
60. (INSTALLATION CONTRACT) ---- 1 ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
61. (INSTALLED EQUIPMENT) ---- N ---- OWNED BY ---- 1 ---- (USER)  [`client_id` -> `user_id`]
62. (INSTALLED EQUIPMENT) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
63. (QUOTATION RECORD) ---- N ---- OWNED BY ---- 1 ---- (USER)  [`client_id` -> `user_id`]
64. (QUOTATION RECORD) ---- 1 ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
65. (SOLAR COMMISSIONING CHECKLIST) ---- N ---- COMPLETED BY ---- 1 ---- (USER)  [`completed_by_id` -> `user_id`]
66. (SOLAR COMMISSIONING CHECKLIST) ---- 1 ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
67. (SOLAR PROJECT PROFILE) ---- 1 ---- AT LOCATION ---- 1 ---- (SERVICE LOCATION)  [`location_id` -> `service_location_id`]
68. (SOLAR PROJECT PROFILE) ---- 0..1 ---- ORIGINATES FROM ---- 1 ---- (SERVICE TICKET)  [`original_ticket_id` -> `service_ticket_id`]
69. (TECHNICAL DATA SHEET) ---- N ---- PREPARED BY ---- 1 ---- (USER)  [`prepared_by_id` -> `user_id`]
70. (TECHNICAL DATA SHEET) ---- N ---- REVIEWED BY ---- 1 ---- (USER)  [`reviewed_by_id` -> `user_id`]
71. (TECHNICAL DATA SHEET) ---- 1 ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
72. (TURNOVER ACCEPTANCE) ---- N ---- FINALIZED BY ---- 1 ---- (USER)  [`finalized_by_id` -> `user_id`]
73. (TURNOVER ACCEPTANCE) ---- N ---- USES DOCUMENT ---- 1 ---- (GENERATED DOCUMENT)  [`generated_document_id` -> `generated_document_id`]
74. (TURNOVER ACCEPTANCE) ---- 1 ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]

### Inventory, Returns and Sales

75. (EQUIPMENT RETURN REQUEST) ---- N ---- REVIEWED BY ---- 1 ---- (USER)  [`reviewed_by_id` -> `user_id`]
76. (EQUIPMENT RETURN REQUEST) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`service_ticket_id` -> `service_ticket_id`]
77. (EQUIPMENT RETURN REQUEST) ---- N ---- SUBMITTED BY ---- 1 ---- (USER)  [`submitted_by_id` -> `user_id`]
78. (EQUIPMENT RETURN REQUEST) ---- N ---- ASSIGNED TO ---- 1 ---- (USER)  [`technician_id` -> `user_id`]
79. (EQUIPMENT RETURN REQUEST ITEM) ---- N ---- USES ITEM ---- 1 ---- (INVENTORY ITEM)  [`item_id` -> `inventory_item_id`]
80. (EQUIPMENT RETURN REQUEST ITEM) ---- N ---- CONTAINS ---- 1 ---- (EQUIPMENT RETURN REQUEST)  [`return_request_id` -> `equipment_return_request_id`]
81. (INVENTORY CATEGORY) ---- N ---- HAS PARENT ---- 1 ---- (INVENTORY CATEGORY)  [`parent_id` -> `inventory_category_id`]
82. (INVENTORY ITEM) ---- N ---- IN CATEGORY ---- 1 ---- (INVENTORY CATEGORY)  [`category_id` -> `inventory_category_id`]
83. (INVENTORY RESERVATION) ---- N ---- USES ITEM ---- 1 ---- (INVENTORY ITEM)  [`item_id` -> `inventory_item_id`]
84. (INVENTORY RESERVATION) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`service_ticket_id` -> `service_ticket_id`]
85. (INVENTORY RESERVATION) ---- N ---- ASSIGNED TO ---- 1 ---- (USER)  [`technician_id` -> `user_id`]
86. (INVENTORY TRANSACTION) ---- N ---- USES ITEM ---- 1 ---- (INVENTORY ITEM)  [`item_id` -> `inventory_item_id`]
87. (INVENTORY TRANSACTION) ---- N ---- PERFORMED BY ---- 1 ---- (USER)  [`performed_by_id` -> `user_id`]
88. (INVENTORY TRANSACTION) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`service_ticket_id` -> `service_ticket_id`]
89. (INVENTORY TRANSACTION) ---- N ---- ASSIGNED TO ---- 1 ---- (USER)  [`technician_id` -> `user_id`]
90. (SALES RECORD) ---- N ---- OWNED BY ---- 1 ---- (USER)  [`client_id` -> `user_id`]
91. (SALES RECORD) ---- N ---- CONFIRMED BY ---- 1 ---- (USER)  [`confirmed_by_id` -> `user_id`]
92. (SALES RECORD) ---- N ---- CREATED BY ---- 1 ---- (USER)  [`created_by_id` -> `user_id`]
93. (SALES RECORD) ---- N ---- BASED ON ---- 1 ---- (QUOTATION RECORD)  [`quotation_id` -> `quotation_id`]
94. (SALES RECORD) ---- 0..1 ---- REPLACES ---- 1 ---- (SALES RECORD)  [`replaces_id` -> `sales_record_id`]
95. (SALES RECORD) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
96. (SALES RECORD) ---- N ---- VOIDED BY ---- 1 ---- (USER)  [`voided_by_id` -> `user_id`]
97. (SALES RECORD LINE) ---- N ---- USES EQUIPMENT ---- 1 ---- (INSTALLED EQUIPMENT)  [`installed_equipment_id` -> `installed_equipment_id`]
98. (SALES RECORD LINE) ---- N ---- USES ITEM ---- 1 ---- (INVENTORY ITEM)  [`inventory_item_id` -> `inventory_item_id`]
99. (SALES RECORD LINE) ---- N ---- CONTAINS ---- 1 ---- (SALES RECORD)  [`sales_record_id` -> `sales_record_id`]
100. (SALES RECORD LINE) ---- N ---- USES SERVICE ---- 1 ---- (SERVICE TYPE)  [`service_type_id` -> `service_type_id`]
101. (SERVICE TYPE INVENTORY REQUIREMENT) ---- N ---- USES ITEM ---- 1 ---- (INVENTORY ITEM)  [`item_id` -> `inventory_item_id`]
102. (SERVICE TYPE INVENTORY REQUIREMENT) ---- N ---- USES SERVICE ---- 1 ---- (SERVICE TYPE)  [`service_type_id` -> `service_type_id`]
