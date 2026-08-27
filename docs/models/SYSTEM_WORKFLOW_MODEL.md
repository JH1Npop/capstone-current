# System Workflow Model

## Where To Insert

Insert this after the **Requirements Analysis** section or before the detailed system diagrams. This model explains the main business flow of the system before showing use cases, DFD, ERD, and deployment.

Suggested caption:

**Figure X. System Workflow Model of the Proposed AFN Service Management System**

## Diagram Tool

Use **Mermaid flowchart**.

## Mermaid Code

Paste this exact code into Mermaid:

```mermaid
flowchart TD
    A["Client<br/>Creates Service Request"] --> B["ServiceRequest<br/>Request is saved with service type,<br/>location, priority, and description"]
    B --> C["Admin / Superadmin<br/>Reviews pending request"]
    C --> D{"Approved?"}
    D -- "No" --> E["Request remains pending,<br/>cancelled, or returned for review"]
    D -- "Yes" --> F["ServiceTicket<br/>Ticket is created or connected<br/>to the approved request"]
    F --> G["Admin / Superadmin<br/>Assigns technician, schedule,<br/>crew, and inventory needs"]
    G --> H["Technician<br/>Views assigned job and schedule"]
    H --> I["Technician<br/>Starts work and updates job status"]
    I --> J["InspectionChecklist<br/>Technician completes checklist<br/>and uploads proof"]
    J --> K{"Checklist Complete?"}
    K -- "No" --> J
    K -- "Yes" --> L["ServiceTicket<br/>Ticket is marked completed"]
    L --> M["Client<br/>Views completed service<br/>and submits feedback/rating"]
    L --> N["AfterSalesCase / MaintenanceSchedule<br/>Follow-up, warranty, revisit,<br/>or maintenance record is created when needed"]
    N --> O["Messages and Notifications<br/>Client, technician, and admin<br/>receive updates"]
    O --> P["Reports, Analytics, and Activity Logs<br/>Admin monitors operations,<br/>performance, and audit trail"]

    classDef client fill:#e0f2fe,stroke:#0284c7,stroke-width:2px,color:#0f172a
    classDef admin fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#0f172a
    classDef tech fill:#dcfce7,stroke:#16a34a,stroke-width:2px,color:#0f172a
    classDef data fill:#f8fafc,stroke:#475569,stroke-width:2px,color:#0f172a
    classDef decision fill:#fef3c7,stroke:#f59e0b,stroke-width:2px,color:#0f172a
    classDef support fill:#fee2e2,stroke:#dc2626,stroke-width:2px,color:#0f172a

    class A,M client
    class C,G admin
    class H,I,J tech
    class B,F,L data
    class D,K decision
    class N,O,P support
```

