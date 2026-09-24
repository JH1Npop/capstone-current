# Sales Record Contract

Sales Records are the canonical, auditable record of products and services
confirmed as sold or delivered through a completed service ticket. They are not
a billing ledger, accounts-receivable module, receipt, or payment processor.

## Connected source chain

```text
Client -> Service Request -> Service Ticket -> Accepted Quotation
       -> Inventory Issues / Installed Equipment -> Sales Record
       -> Warranty / After-Sales
```

- A record can be prepared only for a `Completed` or `Turned Over / Accepted`
  ticket.
- The client and services come from that ticket and its request.
- The agreed total and commercial line items come from an accepted quotation
  when available. A signed installation-contract total is a fallback for the
  record total.
- If no accepted quotation BOM exists, product lines come from append-only
  inventory `issue` transactions connected to the ticket.
- Installed equipment, serial numbers, inventory transaction identifiers,
  service details, location, and warranty data are retained in the source
  snapshot.
- Creating or confirming a Sales Record never creates, edits, or deletes an
  inventory transaction.

## Lifecycle and immutability

| State | Allowed action |
| --- | --- |
| `draft` | Refresh connected sources; edit notes; when neither an accepted quotation nor signed-contract amount exists, enter a manual recorded contract value, currency, and required reason; confirm |
| `confirmed` | Read only; void with a required reason |
| `voided` | Read-only audit record; prepare a linked replacement for the ticket |

Only one active (`draft` or `confirmed`) record can exist per ticket. Preparing
is retry-safe and returns the existing active record. A value from an accepted
quotation or signed contract is source-controlled and cannot be edited through
the Sales Record. Confirmation refreshes that value and the other connected
source data before freezing the record, assigns the sale date, records the
confirming admin, and notifies the client. Manual value entry is available only
when neither connected source provides an amount, and confirmation requires a
nonblank explanation. Corrections use a reasoned void and a new record linked
through `replaces`; confirmed data is never silently overwritten.

## Authorization

- Admin/superadmin users need the existing Documents view capability to read
  Sales Records and the Documents manage capability to prepare, edit drafts,
  confirm, or void them.
- Clients can read only their own confirmed records.
- Technicians and unrelated roles receive no Sales Record rows.
- Clients cannot prepare, edit, confirm, or void records.

## Monetary meaning

The UI labels `agreed_total` as **Recorded contract value**. Together with
`unit_price` and `line_total`, it describes the reference value captured in the
accepted commercial record. The record exposes whether the total came from an
accepted quotation, a signed installation contract, or a reasoned manual entry.
These values do not mean cash received,
collected revenue, outstanding balance, tax posting, or payment settlement. The
model deliberately has no paid/unpaid status, payment method, card data, or
balance-tracking fields.

## Deployment

Migration `services.0057_salesrecord_salesrecordline` creates the two Sales
Record tables, indexes, non-negative value/quantity constraints, and the
conditional one-active-record-per-ticket constraint. It has passed fresh SQLite
test/E2E migration and was applied successfully to the local development SQLite
database on 2026-08-30. It must still be tested against staging, backed up, and
explicitly authorized before application to the Aiven PostgreSQL database.
