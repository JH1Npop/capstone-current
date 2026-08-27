# Database Structure and Dictionary

## `users_user`

Stores the main user accounts for clients, technicians, admins, and superadmins.

| Field | Data Type | Key | Description |
| --- | --- | --- | --- |
| `id` | integer | PK | Unique user identifier |
| `username` | varchar |  | Login username |
| `email` | varchar |  | User email address |
| `first_name` | varchar |  | User first name |
| `last_name` | varchar |  | User last name |
| `role` | varchar |  | User role in the system |
| `phone` | varchar |  | User contact number |
| `address` | text |  | User address |
| `status` | varchar |  | Account status |
| `created_at` | datetime |  | Date and time created |
| `updated_at` | datetime |  | Date and time updated |

## `users_technicianprofile`

Stores technician-specific profile and tracking data.

| Field | Data Type | Key | Description |
| --- | --- | --- | --- |
| `id` | integer | PK | Unique technician profile identifier |
| `user_id` | integer | FK, Unique | Linked user account |
| `current_latitude` | decimal |  | Current technician latitude |
| `current_longitude` | decimal |  | Current technician longitude |
| `is_available` | boolean |  | Technician availability status |
| `skill_level` | varchar |  | Technician skill level |
| `max_daily_assignments` | integer |  | Maximum assignments per day |
| `updated_at` | datetime |  | Date and time updated |

## `users_clientprofile`

Stores client-specific information.

| Field | Data Type | Key | Description |
| --- | --- | --- | --- |
| `id` | integer | PK | Unique client profile identifier |
| `user_id` | integer | FK, Unique | Linked user account |
| `client_type` | varchar |  | Type of client |
| `company_name` | varchar |  | Company name if applicable |
| `preferred_contact_method` | varchar |  | Preferred contact method |
| `billing_address` | text |  | Client billing address |
| `updated_at` | datetime |  | Date and time updated |

## `services_servicetype`

Stores the list of service types offered by the business.

| Field | Data Type | Key | Description |
| --- | --- | --- | --- |
| `id` | integer | PK | Unique service type identifier |
| `name` | varchar |  | Name of service |
| `description` | text |  | Service description |
| `estimated_duration` | integer |  | Estimated duration in minutes |
| `estimated_cost` | decimal |  | Estimated service cost |
| `max_daily_assignments` | integer |  | Maximum daily assignments for this service |

## `services_servicerequest`

Stores service requests submitted by clients.

| Field | Data Type | Key | Description |
| --- | --- | --- | --- |
| `id` | integer | PK | Unique service request identifier |
| `client_id` | integer | FK | Client who submitted the request |
| `service_type_id` | integer | FK | Requested service type |
| `description` | text |  | Request description |
| `priority` | varchar |  | Request priority |
| `status` | varchar |  | Request status |
| `preferred_date` | date |  | Preferred service date |
| `preferred_time_slot` | varchar |  | Preferred service time slot |
| `request_date` | datetime |  | Date and time submitted |
| `auto_ticket_created` | boolean |  | Indicates if a ticket was automatically created |

## `services_servicelocation`

Stores the address and geographic coordinates of a service request.

| Field | Data Type | Key | Description |
| --- | --- | --- | --- |
| `id` | integer | PK | Unique location identifier |
| `request_id` | integer | FK, Unique | Linked service request |
| `address` | text |  | Service address |
| `city` | varchar |  | City |
| `province` | varchar |  | Province |
| `latitude` | decimal |  | Service location latitude |
| `longitude` | decimal |  | Service location longitude |

## `services_serviceticket`

Stores the main work order and dispatch details.

| Field | Data Type | Key | Description |
| --- | --- | --- | --- |
| `id` | integer | PK | Unique service ticket identifier |
| `request_id` | integer | FK | Linked service request |
| `technician_id` | integer | FK | Assigned technician |
| `assigned_admin_id` | integer | FK | Admin or superadmin managing the ticket |
| `scheduled_date` | date |  | Scheduled service date |
| `scheduled_time` | time |  | Scheduled service time |
| `status` | varchar |  | Ticket status |
| `priority` | varchar |  | Ticket priority |
| `auto_assigned` | boolean |  | Indicates if auto-dispatch assigned the ticket |
| `assigned_at` | datetime |  | Date and time assigned |
| `start_time` | datetime |  | Work start time |
| `end_time` | datetime |  | Work end time |
| `completed_date` | datetime |  | Completion date and time |
| `client_rating` | integer |  | Client rating after service |
| `created_at` | datetime |  | Date and time created |
| `updated_at` | datetime |  | Date and time updated |

## `services_technicianskill`

Stores the service types each technician can perform.

| Field | Data Type | Key | Description |
| --- | --- | --- | --- |
| `id` | integer | PK | Unique skill record identifier |
| `technician_id` | integer | FK | Linked technician user |
| `service_type_id` | integer | FK | Linked service type |
| `skill_level` | varchar |  | Skill level for the service type |

## `services_ticketcrewassignment`

Stores additional technicians assigned to a ticket.

| Field | Data Type | Key | Description |
| --- | --- | --- | --- |
| `id` | integer | PK | Unique crew assignment identifier |
| `ticket_id` | integer | FK | Linked service ticket |
| `technician_id` | integer | FK | Crew technician |
| `created_at` | datetime |  | Date and time assigned |

## `services_servicestatushistory`

Stores the status timeline of service tickets.

| Field | Data Type | Key | Description |
| --- | --- | --- | --- |
| `id` | integer | PK | Unique status history identifier |
| `ticket_id` | integer | FK | Linked service ticket |
| `status` | varchar |  | Ticket status value |
| `changed_by_id` | integer | FK | User who changed the status |
| `notes` | text |  | Status change notes |
| `timestamp` | datetime |  | Date and time of status change |

## `services_inspectionchecklist`

Stores inspection and job completion handoff information.

| Field | Data Type | Key | Description |
| --- | --- | --- | --- |
| `id` | integer | PK | Unique checklist identifier |
| `ticket_id` | integer | FK, Unique | Linked service ticket |
| `created_at` | datetime |  | Date and time created |
| `completed_at` | datetime |  | Date and time completed |
| `is_completed` | boolean |  | Checklist completion status |
| `recommendation` | varchar |  | Inspection recommendation |
| `maintenance_required` | boolean |  | Indicates if maintenance is required |
| `maintenance_profile` | varchar |  | Maintenance profile type |
| `follow_up_required` | boolean |  | Indicates if follow-up is required |
| `follow_up_case_type` | varchar |  | Type of follow-up case |

## `inventory_inventoryitem`

Stores inventory items used in service operations.

| Field | Data Type | Key | Description |
| --- | --- | --- | --- |
| `id` | integer | PK | Unique inventory item identifier |
| `name` | varchar |  | Item name |
| `sku` | varchar | Unique | Stock keeping unit |
| `category_id` | integer | FK | Inventory category |
| `item_type` | varchar |  | Type of item |
| `quantity` | integer |  | Total item quantity |
| `minimum_stock` | integer |  | Minimum stock threshold |
| `reserved_quantity` | integer |  | Quantity reserved for jobs |
| `status` | varchar |  | Item status |
| `unit_price` | decimal |  | Unit price |
| `total_value` | decimal |  | Total inventory value |
| `updated_at` | datetime |  | Date and time updated |

## `inventory_inventoryreservation`

Stores inventory reservations for scheduled service tickets.

| Field | Data Type | Key | Description |
| --- | --- | --- | --- |
| `id` | integer | PK | Unique inventory reservation identifier |
| `item_id` | integer | FK | Reserved inventory item |
| `technician_id` | integer | FK | Technician assigned to use the item |
| `quantity` | integer |  | Reserved quantity |
| `required_date` | date |  | Date item is needed |
| `service_ticket_id` | integer | FK | Linked service ticket |
| `status` | varchar |  | Reservation status |
| `created_at` | datetime |  | Date and time created |

## `notifications_notification`

Stores notifications sent to system users.

| Field | Data Type | Key | Description |
| --- | --- | --- | --- |
| `id` | integer | PK | Unique notification identifier |
| `user_id` | integer | FK | Notification recipient |
| `ticket_id` | integer | FK | Related service ticket |
| `request_id` | integer | FK | Related service request |
| `message` | text |  | Notification message |
| `type` | varchar |  | Notification type |
| `status` | varchar |  | Read/unread status |
| `created_at` | datetime |  | Date and time created |
| `read_at` | datetime |  | Date and time read |
