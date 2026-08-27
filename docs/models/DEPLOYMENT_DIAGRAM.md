# Deployment Diagram

## Where To Insert

Insert this near the **Deployment Diagram** portion of Chapter III, similar to the reference Google Doc.

Suggested caption:

**Figure X. Deployment Diagram of the Proposed AFN Service Management System**

## Diagram Tool

Use **Mermaid flowchart**.

## Mermaid Code

Paste this exact code into Mermaid:

```mermaid
flowchart TD
    subgraph Devices["User Devices"]
        ClientDevice["Client Browser / Mobile Browser"]
        TechDevice["Technician Browser / Mobile Browser"]
        AdminDevice["Admin / Superadmin Browser"]
    end

    subgraph Frontend["Frontend Web Application"]
        ReactApp["React Application<br/>Role-based pages and dashboards"]
        StaticBuild["Vite Static Build<br/>HTML, CSS, JavaScript assets"]
    end

    subgraph Backend["Backend Application Server"]
        Django["Django Application"]
        DRF["Django REST Framework API"]
        Auth["Authentication and Role-Based Access Control"]
        BusinessLogic["Service Request, Ticket,<br/>Dispatch, Checklist,<br/>After-Sales, Reports Logic"]
    end

    subgraph Storage["Data and File Storage"]
        Database[("Database<br/>Users, Requests, Tickets,<br/>Inventory, Messages, Logs")]
        Media["Media / File Storage<br/>Proof uploads, service images,<br/>generated reports"]
    end

    subgraph External["External Services"]
        Email["Email Service"]
        Push["Optional Push Notifications"]
        Maps["Optional Map / Routing Service"]
    end

    ClientDevice --> ReactApp
    TechDevice --> ReactApp
    AdminDevice --> ReactApp

    ReactApp --> StaticBuild
    ReactApp --> DRF

    DRF --> Django
    Django --> Auth
    Django --> BusinessLogic
    BusinessLogic --> Database
    BusinessLogic --> Media

    BusinessLogic --> Email
    BusinessLogic --> Push
    BusinessLogic --> Maps

    classDef device fill:#fff7ed,stroke:#f59e0b,stroke-width:2px,color:#111827
    classDef frontend fill:#dbeafe,stroke:#2563eb,stroke-width:2px,color:#111827
    classDef backend fill:#dcfce7,stroke:#16a34a,stroke-width:2px,color:#111827
    classDef storage fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#111827
    classDef external fill:#fee2e2,stroke:#dc2626,stroke-width:2px,color:#111827

    class ClientDevice,TechDevice,AdminDevice device
    class ReactApp,StaticBuild frontend
    class Django,DRF,Auth,BusinessLogic backend
    class Database,Media storage
    class Email,Push,Maps external
```

