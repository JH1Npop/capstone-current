# Data Flow Diagram

## Where To Insert

Insert this after the **Use Case Diagram**. The use case diagram shows what users do, while the DFD shows how data moves through the system.

Suggested caption:

**Figure X. Data Flow Diagram of the Proposed AFN Service Management System**

## Diagram Tool

Use **Mermaid flowchart** for a clean Level 1 DFD-style diagram. This follows the reference structure: external actors on the left, numbered processes in the middle, and data stores on the right.

## Mermaid Code

Paste this exact code into Mermaid:

```mermaid
flowchart LR
    Client["Client"]:::entity
    Technician["Technician"]:::entity
    Admin["Admin / Superadmin"]:::entity

    P1["1.0<br/>Process User<br/>Account Data"]:::process
    P2["2.0<br/>Process Service<br/>Request Data"]:::process
    P3["3.0<br/>Process Ticket<br/>Dispatch Data"]:::process
    P4["4.0<br/>Process Technician<br/>Job Data"]:::process
    P5["5.0<br/>Process After-Sales<br/>and Message Data"]:::process
    P6["6.0<br/>Generate Reports,<br/>Analytics, and Logs"]:::process

    D1[("D1<br/>User Records")]:::store
    D2[("D2<br/>Service Request Records")]:::store
    D3[("D3<br/>Service Ticket Records")]:::store
    D4[("D4<br/>Checklist and Proof Records")]:::store
    D5[("D5<br/>Inventory Records")]:::store
    D6[("D6<br/>After-Sales and Maintenance Records")]:::store
    D7[("D7<br/>Message and Notification Records")]:::store
    D8[("D8<br/>Report, Analytics, and Activity Log Records")]:::store

    Summary["D1 User Records<br/>D2 Service Request Records<br/>D3 Service Ticket Records<br/>D4 Checklist and Proof Records<br/>D5 Inventory Records<br/>D6 After-Sales and Maintenance Records<br/>D7 Message and Notification Records<br/>D8 Report, Analytics, and Activity Log Records"]:::summary

    Client -->|"User Account Data"| P1
    Technician -->|"User Account Data"| P1
    Admin -->|"Role and User Update Data"| P1
    P1 -->|"Validated User Data"| D1

    Client -->|"Service Request Data"| P2
    Admin -->|"Request Approval Data"| P2
    P2 -->|"Service Request Record Data"| D2

    Admin -->|"Assignment and Schedule Data"| P3
    D2 -->|"Approved Request Data"| P3
    P3 -->|"Service Ticket Record Data"| D3
    P3 -->|"Assigned Job Data"| Technician

    Technician -->|"Job Status, Checklist, and Proof Data"| P4
    D3 -->|"Assigned Ticket Data"| P4
    P4 -->|"Checklist and Proof Data"| D4
    P4 -->|"Inventory Usage Data"| D5
    P4 -->|"Completed Ticket Data"| D3

    Client -->|"After-Sales Concern / Ticket Message Data"| P5
    Technician -->|"Job Message Data"| P5
    Admin -->|"Follow-Up Action Data"| P5
    D3 -->|"Completed Service Ticket Data"| P5
    P5 -->|"After-Sales and Maintenance Data"| D6
    P5 -->|"Message and Notification Data"| D7

    Admin -->|"Report Request Data"| P6
    Summary -->|"System Record Data"| P6
    P6 -->|"Generated Report, Analytics, and Audit Data"| D8
    P6 -->|"Generated Report / Dashboard Data"| Admin

    classDef entity fill:#fff7ed,stroke:#f59e0b,stroke-width:2px,color:#111827
    classDef process fill:#fdecc8,stroke:#d97706,stroke-width:2px,color:#111827
    classDef store fill:#f8fafc,stroke:#64748b,stroke-width:2px,color:#111827
    classDef summary fill:#ffffff,stroke:#475569,stroke-width:2px,color:#111827
```
