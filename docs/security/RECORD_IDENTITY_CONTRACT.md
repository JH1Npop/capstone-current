# Record Identity Contract

This contract separates human-readable record identities from database primary
keys. Display codes do not replace, renumber, or mutate primary keys.

## Canonical identities

| Record | Display identity | Source |
| --- | --- | --- |
| Service request | `REQ-####` | `ServiceRequest.id` |
| Service ticket | `TKT-####` | `ServiceTicket.id` |
| Customer support case | `CSC-####` | `CustomerSupportCase.id` |
| After-sales case | `ASC-####` | `AfterSalesCase.id` |
| Sales record | `SAL-YYYY-XXXXXXXX` | Stored immutable `record_number` |
| Quotation | `QUO-####` by default | Stored `quotation_number`; generated from its one-to-one ticket when omitted |
| Inventory transaction | `ITX-######` | `InventoryTransaction.id` |
| Inventory reservation | `RSV-######` | `InventoryReservation.id` |
| Generated document | `DOC-####` | `GeneratedDocument.id` |
| Solar estimate | `EST-####` | `SolarEstimate.id` |
| Client account | `CL-####` | `User.id` for client role |
| Technician account | `TECH-####` | `User.id` for technician role |
| Admin account | `ADM-####` | `User.id` for admin role |
| Superadmin account | `SA-####` | `User.id` for superadmin role |

Inventory products use their required unique SKU, and installed equipment uses
its manufacturer serial number when available. Technical child/history rows keep
internal IDs unless a workflow needs a dedicated public identity.

## Relationship labels

A support or after-sales case is not a service ticket. Show its own `CSC` or
`ASC` identity first and show an optional connected `TKT` separately. Likewise,
show `REQ` and `TKT` together when both help explain a workflow.

`TCK` is not assigned to any current data model and must not be used as an alias
for `TKT`.

## Formatting and persistence

- Standard business identities use at least four zero-padded digits.
- High-volume inventory ledger identities use six digits.
- APIs retain numeric `id` fields for routing and relationships while adding
  read-only display-code fields.
- Quotation numbers are stored business identifiers, normalized to uppercase,
  required on save, and checked case-insensitively for duplicates by the API.
- Inventory `reference_number` remains separate from `transaction_code`; it may
  contain a supplier, opening-balance, or external reference.
- Existing database rows are not rewritten merely to change their presentation.
