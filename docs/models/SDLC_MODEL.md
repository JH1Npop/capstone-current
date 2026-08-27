# Software Development Lifecycle Model

## Where To Insert

Insert this in the **Software Development Lifecycle** section of Chapter III, replacing the generic/reference model content with your system-specific content.

Suggested caption:

**Figure X. The Software Development Lifecycle of the Proposed AFN Service Management System**

## Diagram Tool

Use **Mermaid flowchart**. This follows the reference Google Doc's Scrum-inspired Agile model.

## Mermaid Code

Paste this exact code into Mermaid:

```mermaid
flowchart LR
    PV["Project Vision<br/>Centralized service request,<br/>dispatch, technician work,<br/>after-sales, and reporting system"] --> RP["Release Planning<br/>Users, requests, tickets,<br/>technician jobs, inventory,<br/>after-sales, reports, analytics"]

    RP --> SP["Sprint Planning<br/>Select features, define roles,<br/>identify data fields,<br/>prepare UI and API tasks"]

    SP --> Sprint(("SPRINT<br/>Scrum-Inspired<br/>Agile Development"))

    Sprint --> IMP["Implementation<br/>(Sprint Execution)<br/>Django REST APIs,<br/>React pages, database integration,<br/>role-based workflows"]

    IMP --> DS["Daily Scrum<br/>Review progress, blockers,<br/>disconnected pages, wrong counts,<br/>and integration issues"]

    DS --> SR["Sprint Review<br/>Demonstrate client request,<br/>admin dispatch, technician checklist,<br/>after-sales, and reports"]

    SR --> RETRO["Sprint Retrospective<br/>Improve workflow, fix bugs,<br/>clean unused modules,<br/>refine usability and data accuracy"]

    RETRO --> SP

    SR --> DEP["Deployment<br/>Run migrations, build frontend,<br/>prepare demo data, and validate<br/>admin, client, and technician flows"]

    DEP --> RP

    classDef vision fill:#fff7ed,stroke:#f59e0b,stroke-width:2px,color:#111827
    classDef release fill:#e0f2fe,stroke:#0284c7,stroke-width:2px,color:#111827
    classDef planning fill:#dcfce7,stroke:#16a34a,stroke-width:2px,color:#111827
    classDef sprint fill:#ffffff,stroke:#111827,stroke-width:3px,color:#111827
    classDef implementation fill:#dbeafe,stroke:#2563eb,stroke-width:2px,color:#111827
    classDef scrum fill:#fef3c7,stroke:#f59e0b,stroke-width:2px,color:#111827
    classDef review fill:#fee2e2,stroke:#dc2626,stroke-width:2px,color:#111827
    classDef deploy fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#111827

    class PV vision
    class RP release
    class SP planning
    class Sprint sprint
    class IMP implementation
    class DS scrum
    class SR review
    class RETRO review
    class DEP deploy
```

