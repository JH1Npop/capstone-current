# Real Data Flow Diagram Set

This is the detailed DFD set for the AFN Service Management System based on the actual codebase. Use this when you need the "real" version instead of a simplified single-page DFD.

## Why This Is A Set

A real DFD for this system should not be forced into one diagram because the codebase has multiple connected modules:

- authentication and role access
- client service requests
- service ticket approval and dispatch
- technician job workflow
- checklist and proof upload
- inventory reservations and usage
- after-sales cases
- maintenance schedules
- messages and notifications
- reports, analytics, and activity logs

For a clean capstone document, use:

1. Context Diagram
2. Level 1 DFD
3. Level 2 DFD - Service Request and Ticket Dispatch
4. Level 2 DFD - Technician Job Completion
5. Level 2 DFD - After-Sales, Messages, and Maintenance
6. Level 2 DFD - Reports, Analytics, and Activity Logs

## Figure Captions

- **Figure X. Context Diagram of the Proposed AFN Service Management System**
- **Figure X. Level 1 Data Flow Diagram of the Proposed AFN Service Management System**
- **Figure X. Level 2 Data Flow Diagram for Service Request and Ticket Dispatch**
- **Figure X. Level 2 Data Flow Diagram for Technician Job Completion**
- **Figure X. Level 2 Data Flow Diagram for After-Sales, Messages, and Maintenance**
- **Figure X. Level 2 Data Flow Diagram for Reports, Analytics, and Activity Logs**

---

# 1. Context Diagram

Use this as the highest-level DFD.

```mermaid
flowchart LR
    Client["Client"]:::entity
    Technician["Technician"]:::entity
    Admin["Admin / Superadmin"]:::entity

    System(("AFN Service<br/>Management System")):::system

    Client -->|"account data, service request, reschedule request,<br/>after-sales message, feedback"| System
    System -->|"request status, ticket status, schedule updates,<br/>notifications, service history"| Client

    Technician -->|"job status, checklist data, proof uploads,<br/>equipment request, messages"| System
    System -->|"assigned jobs, schedule, inventory details,<br/>notifications, job history"| Technician

    Admin -->|"approval decision, dispatch assignment,<br/>service setup, inventory updates, report request"| System
    System -->|"dashboards, reports, analytics,<br/>activity logs, alerts, ticket queues"| Admin

    classDef entity fill:#ddd6fe,stroke:#7c3aed,stroke-width:2px,color:#111827
    classDef system fill:#fdecc8,stroke:#d97706,stroke-width:3px,color:#111827
```

---

# 2. Level 1 DFD

This is the complete high-level data flow.

```mermaid
flowchart LR
    Client["Client"]:::entity
    Technician["Technician"]:::entity
    Admin["Admin / Superadmin"]:::entity

    P1(("1.0<br/>Manage User Access")):::process
    P2(("2.0<br/>Manage Service Requests")):::process
    P3(("3.0<br/>Manage Ticket Dispatch")):::process
    P4(("4.0<br/>Manage Technician Job Completion")):::process
    P5(("5.0<br/>Manage Inventory Usage")):::process
    P6(("6.0<br/>Manage After-Sales and Maintenance")):::process
    P7(("7.0<br/>Manage Messages and Notifications")):::process
    P8(("8.0<br/>Generate Reports, Analytics, and Logs")):::process

    D1[("D1<br/>User Records")]:::store
    D2[("D2<br/>Service Request Records")]:::store
    D3[("D3<br/>Service Ticket Records")]:::store
    D4[("D4<br/>Checklist and Proof Records")]:::store
    D5[("D5<br/>Inventory Records")]:::store
    D6[("D6<br/>After-Sales Case Records")]:::store
    D7[("D7<br/>Maintenance Schedule Records")]:::store
    D8[("D8<br/>Message Records")]:::store
    D9[("D9<br/>Notification Records")]:::store
    D10[("D10<br/>Activity Log and Analytics Records")]:::store

    Client -->|"login/register/profile data"| P1
    Technician -->|"login/profile data"| P1
    Admin -->|"user and permission updates"| P1
    P1 --> D1

    Client -->|"service request details"| P2
    P2 --> D2
    D2 -->|"pending requests"| Admin

    Admin -->|"approval, schedule, technician assignment"| P3
    D2 -->|"approved request data"| P3
    P3 --> D3
    P3 -->|"assigned job data"| Technician

    Technician -->|"job status, checklist, proof"| P4
    D3 -->|"assigned ticket data"| P4
    P4 --> D4
    P4 -->|"completion update"| D3
    P4 -->|"inventory usage request"| P5

    Admin -->|"inventory item updates"| P5
    P5 --> D5
    D5 -->|"available item data"| P4

    D3 -->|"completed ticket data"| P6
    Client -->|"after-sales concern"| P6
    Admin -->|"follow-up action"| P6
    P6 --> D6
    P6 --> D7

    Client -->|"ticket message"| P7
    Technician -->|"job message"| P7
    Admin -->|"admin message / alert action"| P7
    P7 --> D8
    P7 --> D9

    D1 --> P8
    D2 --> P8
    D3 --> P8
    D4 --> P8
    D5 --> P8
    D6 --> P8
    D7 --> P8
    D8 --> P8
    D9 --> P8
    P8 --> D10
    P8 -->|"dashboard, report, analytics, audit output"| Admin

    classDef entity fill:#ddd6fe,stroke:#7c3aed,stroke-width:2px,color:#111827
    classDef process fill:#fdecc8,stroke:#d97706,stroke-width:2px,color:#111827
    classDef store fill:#ffffff,stroke:#64748b,stroke-width:2px,color:#111827
```

---

# 3. Level 2 DFD - Service Request and Ticket Dispatch

This expands the actual request-to-ticket flow.

```mermaid
flowchart LR
    Client["Client"]:::entity
    Admin["Admin / Superadmin"]:::entity
    Technician["Technician"]:::entity

    P21(("2.1<br/>Submit Service Request")):::process
    P22(("2.2<br/>Validate Request Details")):::process
    P23(("2.3<br/>Store Request and Location")):::process
    P31(("3.1<br/>Review Pending Request")):::process
    P32(("3.2<br/>Approve Request")):::process
    P33(("3.3<br/>Create Service Ticket")):::process
    P34(("3.4<br/>Assign Technician and Schedule")):::process
    P35(("3.5<br/>Notify Assigned Users")):::process

    D1[("D1<br/>User Records")]:::store
    D2[("D2<br/>ServiceRequest")]:::store
    D3[("D3<br/>ServiceLocation")]:::store
    D4[("D4<br/>ServiceType")]:::store
    D5[("D5<br/>TechnicianSkill")]:::store
    D6[("D6<br/>ServiceTicket")]:::store
    D7[("D7<br/>ServiceStatusHistory")]:::store
    D8[("D8<br/>Notification")]:::store

    Client -->|"request form data"| P21
    P21 --> P22
    D4 -->|"selected service type"| P22
    P22 -->|"validated request data"| P23
    P23 --> D2
    P23 --> D3

    Admin -->|"review action"| P31
    D2 -->|"pending request data"| P31
    P31 --> P32
    P32 -->|"approved request data"| P33
    P33 --> D6
    P33 --> D7

    Admin -->|"assignment and schedule data"| P34
    D1 -->|"technician account data"| P34
    D5 -->|"technician service skill data"| P34
    D6 -->|"ticket data"| P34
    P34 -->|"updated assignment data"| D6
    P34 --> P35
    P35 --> D8
    P35 -->|"assigned job notice"| Technician
    P35 -->|"ticket status notice"| Client

    classDef entity fill:#ddd6fe,stroke:#7c3aed,stroke-width:2px,color:#111827
    classDef process fill:#fdecc8,stroke:#d97706,stroke-width:2px,color:#111827
    classDef store fill:#ffffff,stroke:#64748b,stroke-width:2px,color:#111827
```

---

# 4. Level 2 DFD - Technician Job Completion

This expands the technician workflow from assigned job to completion.

```mermaid
flowchart LR
    Technician["Technician"]:::entity
    Client["Client"]:::entity
    Admin["Admin / Superadmin"]:::entity

    P41(("4.1<br/>View Assigned Job")):::process
    P42(("4.2<br/>Update Job Status")):::process
    P43(("4.3<br/>Complete Checklist")):::process
    P44(("4.4<br/>Upload Proof and Notes")):::process
    P45(("4.5<br/>Record Inventory Usage")):::process
    P46(("4.6<br/>Complete Ticket")):::process
    P47(("4.7<br/>Notify Client and Admin")):::process

    D1[("D1<br/>ServiceTicket")]:::store
    D2[("D2<br/>ServiceStatusHistory")]:::store
    D3[("D3<br/>InspectionChecklist")]:::store
    D4[("D4<br/>Proof Media / Completion Notes")]:::store
    D5[("D5<br/>InventoryReservation")]:::store
    D6[("D6<br/>InventoryTransaction")]:::store
    D7[("D7<br/>Notification")]:::store

    Technician -->|"job list request"| P41
    D1 -->|"assigned ticket data"| P41
    P41 -->|"job details"| Technician

    Technician -->|"status update"| P42
    P42 --> D2
    P42 -->|"updated ticket status"| D1

    Technician -->|"checklist answers"| P43
    P43 --> D3

    Technician -->|"proof images, notes"| P44
    P44 --> D4
    P44 --> D3

    Technician -->|"used items / equipment request"| P45
    P45 --> D5
    P45 --> D6

    D3 -->|"completed checklist"| P46
    D4 -->|"proof data"| P46
    P46 -->|"completed ticket data"| D1
    P46 --> P47

    P47 --> D7
    P47 -->|"completion notice"| Client
    P47 -->|"operations notice"| Admin

    classDef entity fill:#ddd6fe,stroke:#7c3aed,stroke-width:2px,color:#111827
    classDef process fill:#fdecc8,stroke:#d97706,stroke-width:2px,color:#111827
    classDef store fill:#ffffff,stroke:#64748b,stroke-width:2px,color:#111827
```

---

# 5. Level 2 DFD - After-Sales, Messages, and Maintenance

This expands what happens after a ticket is completed or when the client sends a ticket-related concern.

```mermaid
flowchart LR
    Client["Client"]:::entity
    Admin["Admin / Superadmin"]:::entity
    Technician["Technician"]:::entity

    P51(("5.1<br/>Receive Ticket-Linked Message")):::process
    P52(("5.2<br/>Create or Update After-Sales Case")):::process
    P53(("5.3<br/>Generate Maintenance Schedule")):::process
    P54(("5.4<br/>Send Notifications")):::process
    P55(("5.5<br/>Track Case Resolution")):::process

    D1[("D1<br/>ServiceTicket")]:::store
    D2[("D2<br/>InspectionChecklist")]:::store
    D3[("D3<br/>Message")]:::store
    D4[("D4<br/>AfterSalesCase")]:::store
    D5[("D5<br/>MaintenanceSchedule")]:::store
    D6[("D6<br/>Notification")]:::store

    Client -->|"after-sales message / concern"| P51
    Technician -->|"job follow-up message"| P51
    Admin -->|"admin reply / handling note"| P51
    D1 -->|"ticket context"| P51
    P51 --> D3

    D3 -->|"message details"| P52
    D1 -->|"completed ticket data"| P52
    Admin -->|"case action"| P52
    P52 --> D4

    D2 -->|"maintenance or warranty recommendation"| P53
    D1 -->|"completed ticket and client data"| P53
    P53 --> D5

    P52 --> P54
    P53 --> P54
    P54 --> D6
    P54 -->|"case / reminder notice"| Client
    P54 -->|"after-sales notice"| Admin

    Admin -->|"resolution update"| P55
    P55 -->|"updated case status"| D4
    P55 -->|"case status notice"| Client

    classDef entity fill:#ddd6fe,stroke:#7c3aed,stroke-width:2px,color:#111827
    classDef process fill:#fdecc8,stroke:#d97706,stroke-width:2px,color:#111827
    classDef store fill:#ffffff,stroke:#64748b,stroke-width:2px,color:#111827
```

---

# 6. Level 2 DFD - Reports, Analytics, and Activity Logs

This expands the admin monitoring flow.

```mermaid
flowchart LR
    Admin["Admin / Superadmin"]:::entity

    P61(("6.1<br/>Request Dashboard Data")):::process
    P62(("6.2<br/>Generate Service Reports")):::process
    P63(("6.3<br/>Generate Analytics")):::process
    P64(("6.4<br/>Record Activity Log")):::process
    P65(("6.5<br/>Display Audit and Report Output")):::process

    D1[("D1<br/>User Records")]:::store
    D2[("D2<br/>ServiceRequest")]:::store
    D3[("D3<br/>ServiceTicket")]:::store
    D4[("D4<br/>InspectionChecklist")]:::store
    D5[("D5<br/>Inventory Records")]:::store
    D6[("D6<br/>AfterSalesCase")]:::store
    D7[("D7<br/>Message / Notification")]:::store
    D8[("D8<br/>ServiceAnalytics")]:::store
    D9[("D9<br/>TechnicianPerformance")]:::store
    D10[("D10<br/>ActivityLog")]:::store

    Admin -->|"dashboard request"| P61
    D1 --> P61
    D2 --> P61
    D3 --> P61
    D5 --> P61
    D6 --> P61

    Admin -->|"report request"| P62
    D2 --> P62
    D3 --> P62
    D4 --> P62
    D5 --> P62

    Admin -->|"analytics period / filter"| P63
    D2 --> P63
    D3 --> P63
    D8 --> P63
    D9 --> P63

    Admin -->|"admin action"| P64
    D1 -->|"actor data"| P64
    P64 --> D10

    P61 --> P65
    P62 --> P65
    P63 --> P65
    D10 --> P65
    P65 -->|"dashboard, report, analytics, activity log output"| Admin

    classDef entity fill:#ddd6fe,stroke:#7c3aed,stroke-width:2px,color:#111827
    classDef process fill:#fdecc8,stroke:#d97706,stroke-width:2px,color:#111827
    classDef store fill:#ffffff,stroke:#64748b,stroke-width:2px,color:#111827
```

