# Data Modeling

## Main Entities

| Entity | Description |
| --- | --- |
| `users_user` | Stores all user accounts, including clients, technicians, admins, and superadmins |
| `users_technicianprofile` | Stores technician-specific data such as location, availability, and skill level |
| `users_clientprofile` | Stores client-specific data such as client type, company name, and billing address |
| `services_servicetype` | Stores the list of services offered by the business |
| `services_servicerequest` | Stores service requests submitted by clients |
| `services_servicelocation` | Stores the address and coordinates of each service request |
| `services_serviceticket` | Stores the main work order used for dispatch and service execution |
| `services_technicianskill` | Stores the service types that each technician can perform |
| `services_ticketcrewassignment` | Stores additional technicians assigned to a service ticket |
| `services_servicestatushistory` | Stores the status history of each service ticket |
| `services_inspectionchecklist` | Stores inspection and completion handoff information |
| `inventory_inventoryitem` | Stores inventory items used in service operations |
| `inventory_inventoryreservation` | Stores reserved inventory items for scheduled service tickets |
| `notifications_notification` | Stores notifications sent to system users |

## Key Relationships

| Relationship | Foreign Key |
| --- | --- |
| A service request belongs to a client | `services_servicerequest.client_id -> users_user.id` |
| A service request has one service type | `services_servicerequest.service_type_id -> services_servicetype.id` |
| A service location belongs to one request | `services_servicelocation.request_id -> services_servicerequest.id` |
| A service ticket is created from a request | `services_serviceticket.request_id -> services_servicerequest.id` |
| A service ticket is assigned to a technician | `services_serviceticket.technician_id -> users_user.id` |
| A crew assignment belongs to a ticket | `services_ticketcrewassignment.ticket_id -> services_serviceticket.id` |
| A status history record belongs to a ticket | `services_servicestatushistory.ticket_id -> services_serviceticket.id` |
| An inventory reservation belongs to an item | `inventory_inventoryreservation.item_id -> inventory_inventoryitem.id` |
| An inventory reservation belongs to a ticket | `inventory_inventoryreservation.service_ticket_id -> services_serviceticket.id` |
| A notification belongs to a user | `notifications_notification.user_id -> users_user.id` |

## Cardinality

| Relationship | Cardinality |
| --- | --- |
| User to Technician Profile | One-to-one |
| User to Client Profile | One-to-one |
| Client to Service Request | One-to-many |
| Service Type to Service Request | One-to-many |
| Service Request to Service Location | One-to-one |
| Service Request to Service Ticket | One-to-many |
| Technician to Service Ticket | One-to-many |
| Service Ticket to Crew Assignment | One-to-many |
| Service Ticket to Status History | One-to-many |
| Service Ticket to Inspection Checklist | One-to-one |
| Inventory Item to Inventory Reservation | One-to-many |
| Service Ticket to Inventory Reservation | One-to-many |
| User to Notification | One-to-many |

## Data Model Flow

```text
Client/User
   -> Service Request
   -> Service Location
   -> Service Ticket
   -> Technician Assignment
   -> Status History
   -> Inspection Checklist
   -> Inventory Reservation
   -> Notification
```

## Summary

The data model supports the AFN Service Management workflow by connecting users, service requests, service tickets, technician assignments, inventory reservations, and notifications. Primary keys uniquely identify each record, while foreign keys connect related records across the system.
