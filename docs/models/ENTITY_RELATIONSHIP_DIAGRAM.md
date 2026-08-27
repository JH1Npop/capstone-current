# Entity Relationship Diagram

## Where To Insert

Insert this after the **Data Flow Diagram**. The DFD shows data movement; the ERD shows how the main data is stored and connected in the database.

Suggested caption:

**Figure X. Entity Relationship Diagram of the Proposed AFN Service Management System**

## Diagram Tool

Use **Mermaid ER diagram**.

## Mermaid Code

Paste this exact code into Mermaid:

```mermaid
erDiagram
    USER ||--o{ SERVICE_REQUEST : creates
    USER ||--o{ SERVICE_TICKET : assigned_as_technician
    USER ||--o{ SERVICE_STATUS_HISTORY : changes
    USER ||--o{ MESSAGE : sends
    USER ||--o{ NOTIFICATION : receives
    USER ||--o{ ACTIVITY_LOG : performs

    SERVICE_TYPE ||--o{ SERVICE_REQUEST : requested_for
    SERVICE_TYPE ||--o{ TECHNICIAN_SKILL : required_skill
    SERVICE_TYPE ||--o{ MAINTENANCE_SCHEDULE : scheduled_for

    SERVICE_REQUEST ||--|| SERVICE_LOCATION : has
    SERVICE_REQUEST ||--o{ SERVICE_TICKET : generates

    SERVICE_TICKET ||--o{ SERVICE_STATUS_HISTORY : has
    SERVICE_TICKET ||--|| INSPECTION_CHECKLIST : validates_completion
    SERVICE_TICKET ||--o{ INVENTORY_RESERVATION : reserves
    SERVICE_TICKET ||--o{ AFTER_SALES_CASE : creates
    SERVICE_TICKET ||--o| MAINTENANCE_SCHEDULE : schedules
    SERVICE_TICKET ||--o{ MESSAGE : links_to

    INVENTORY_ITEM ||--o{ INVENTORY_RESERVATION : reserved_as
    INVENTORY_ITEM ||--o{ INVENTORY_TRANSACTION : records

    USER {
        int id PK
        string username
        string email
        string role
        string status
    }

    SERVICE_TYPE {
        int id PK
        string name
        int estimated_duration
        int sla_hours
    }

    SERVICE_REQUEST {
        int id PK
        int client_id FK
        int service_type_id FK
        string status
        string priority
        datetime request_date
    }

    SERVICE_LOCATION {
        int id PK
        int request_id FK
        string address
        string city
        string province
        decimal latitude
        decimal longitude
    }

    SERVICE_TICKET {
        int id PK
        int request_id FK
        int technician_id FK
        string status
        date scheduled_date
        datetime completed_date
    }

    SERVICE_STATUS_HISTORY {
        int id PK
        int ticket_id FK
        string status
        int changed_by_id FK
        datetime timestamp
    }

    INSPECTION_CHECKLIST {
        int id PK
        int ticket_id FK
        boolean is_completed
        boolean maintenance_required
        boolean warranty_provided
        boolean follow_up_required
    }

    INVENTORY_ITEM {
        int id PK
        string name
        string sku
        int quantity
        int minimum_stock
    }

    INVENTORY_RESERVATION {
        int id PK
        int ticket_id FK
        int item_id FK
        int quantity
        string status
    }

    INVENTORY_TRANSACTION {
        int id PK
        int item_id FK
        string transaction_type
        int quantity
        datetime created_at
    }

    AFTER_SALES_CASE {
        int id PK
        int service_ticket_id FK
        int client_id FK
        string case_type
        string status
        date due_date
    }

    MAINTENANCE_SCHEDULE {
        int id PK
        int service_ticket_id FK
        int client_id FK
        int service_type_id FK
        date next_due_date
        string status
    }

    MESSAGE {
        int id PK
        int sender_id FK
        int ticket_id FK
        string room_type
        text content
        datetime created_at
    }

    NOTIFICATION {
        int id PK
        int recipient_id FK
        string notification_type
        string status
        datetime created_at
    }

    ACTIVITY_LOG {
        int id PK
        int actor_id FK
        string category
        string action
        string target_model
        datetime created_at
    }

    TECHNICIAN_SKILL {
        int id PK
        int technician_id FK
        int service_type_id FK
        string skill_level
    }
```

