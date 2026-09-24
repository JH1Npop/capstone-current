# Inventory Ledger and Reservation Contract

This document is the current integrity contract for inventory stock movements.
The API, models, database constraints, and tests must continue to agree with it.

## Stock balances

- `quantity` is physical stock and cannot be negative.
- `reserved_quantity` cannot be negative or exceed physical stock.
- `available_quantity` is derived as `quantity - reserved_quantity`.
- Existing item quantity cannot be edited through the item endpoint. Stock must
  change through a transaction. Initial quantity may be supplied when an item is
  first created, but the API records it atomically as an `adjustment` transaction
  with an `OPENING-<item id>` reference and opening-balance reason.
- Issue and transfer operations consume only available, unreserved stock.
- An absolute adjustment cannot set physical stock below reserved stock.

## Transaction meanings

| Type | Balance effect |
| --- | --- |
| `purchase` | Adds physical stock |
| `return` | Adds physical stock |
| `issue` | Removes available physical stock |
| `transfer` | Removes available physical stock |
| `reservation` | Adds reserved stock without changing physical stock |
| `cancellation` | Releases reserved stock without changing physical stock |
| `adjustment` | Sets the absolute physical count |

All movement quantities must be greater than zero. An `adjustment` may be zero
because an observed physical count can be empty. Manual adjustments require a
reason in `notes` and the inventory-management capability.

Inventory movement APIs expose `ITX-######` display identities and reservations
expose `RSV-######`. These computed identities are distinct from the optional
transaction `reference_number`, which preserves external or business context.

## Immutability and concurrency

- Transactions and reservations cannot be updated or deleted through the API.
- Reservation fulfillment and cancellation are named POST actions. Their status
  cannot be selected by the caller.
- Creating a movement locks the inventory-item row before reading and changing
  its balances. Reservation fulfillment/cancellation also locks the reservation
  row, preventing competing requests from applying the same movement twice on
  PostgreSQL.
- A fulfilled reservation first releases its reserved balance and then records
  the issue, inside one database transaction.
- Inventory items with ledger/reservation history and categories containing
  items cannot be deleted through the API. Historical items should be retired.
- An item with reserved stock cannot be retired, and retired items cannot be
  added to new service-type inventory templates.
- `stock_status` is derived from available quantity and the configured low-stock
  threshold. The stored `available`/`out_of_stock` status is synchronized on
  stock changes while maintenance, in-use, reserved, and retired states remain
  explicit lifecycle choices.

## Technician visibility

- Technician inventory reads require `technician.inventory.view`; explicitly
  scoped technicians do not retain inventory access through role alone.
- The catalog remains read-only for technicians. Transaction and reservation
  querysets expose only rows assigned to the authenticated technician.
- Low-stock names and quantities on the technician dashboard require the same
  field-inventory capability, preventing dashboard access from bypassing the
  inventory boundary.

## Catalog identity and customization

- SKU is required, trimmed, normalized to uppercase, and unique ignoring case.
- Category names are trimmed and unique ignoring case. Parent relationships
  cannot point to the category itself or create a nesting cycle.
- Item type is selected from equipment, spare part, tool, consumable, or other.
- Unit of measurement is management-defined rather than restricted to a fixed
  seed list. Product details may include supplier, location, purchase/warranty
  dates, pricing, specifications, description, and notes.

## Database migration safety

Migration `0005_inventory_integrity_constraints` adds database checks for item,
transaction, reservation, and service-requirement quantities. It recognizes one
known legacy generated batch: negative `issue` quantities whose note is exactly
`Auto-aligned with AC Service volume`. Those signs are normalized without
replaying stock movement. Any other incompatible legacy data stops migration so
an operator can review it instead of silently changing business records.

Migration `0006_inventorycategory_inventory_category_name_ci_unique` normalizes
existing SKU/category whitespace and SKU casing, refuses ambiguous duplicates or
blank identifiers, then adds case-insensitive uniqueness constraints for category
names and item SKUs.

The migration must be tested against a staging copy of the Aiven PostgreSQL
database and backed up before production deployment.

## Regression coverage

`backend/inventory/tests.py` verifies append-only endpoints, protected history,
quantity validation, adjustment reasons, opening-balance history, catalog
identity, category cycles, retirement rules, reserved-stock protection, and the
ticket reservation/issue workflow. Django's test database also applies the
integrity migrations from a clean state. The focused Playwright inventory journey
creates a category and custom item, then reads the opening transaction through
the real browser/API/database path.
