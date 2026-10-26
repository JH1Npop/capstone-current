# AFN Final Capstone Diagram Pack

These sources follow the four formats shown in the approved pre-oral paper:

1. Context Diagram
2. Data Flow Diagram (DFD)
3. Entity Relationship Diagram (Chen notation)
4. Database Schema

They describe the implemented AFN Service Management System as audited on
2026-10-17 and refreshed on 2026-10-23: the DFD adds the client's quotation
decision, the inspection report loop from field work back to dispatch, and the
service and inspection checklists read from the service catalog; the Context
Diagram adds the client's handover confirmation and the technician's
inspection report and hold reason, and every flow now has its own lane and
label. The DBML was regenerated with no schema change, and the Chen ERD was
re-laid out with the same entities, attributes, and relationships so that its
lines no longer stack on shared rails. They intentionally replace obsolete notification-template,
Firebase-token, SMS, and retired service-history elements with the active
notification, ticket-status/progress, sales, equipment-return, and after-sales
records.

## Files to use

| Paper figure | Source | Tool |
| --- | --- | --- |
| Context Diagram | `01_CONTEXT_DIAGRAM.drawio` | diagrams.net: File > Open From > Device |
| Data Flow Diagram | `../../models/AFN_DETAILED_DFD_STRUCTURED.drawio` | diagrams.net: File > Open From > Device |
| Entity Relationship Diagram | `../../models/AFN_ERD_CHEN_PRESENTATION.drawio` | diagrams.net: File > Open From > Device |
| Database Schema | `../../models/AFN_ERD.dbml` | dbdiagram.io |

## Required figure captions

- Context Diagram of the AFN Service Management System
- Data Flow Diagram of the AFN Service Management System
- Entity Relationship Diagram of the AFN Service Management System
- Database Schema of the AFN Service Management System

## Layout rules

- Use landscape orientation for every diagram.
- Keep actor/entity boxes at the outer edges, processes/relationships in the
  middle, and data stores/related entities beside their owning process.
- Submit exactly one figure for each required diagram type. The editable
  `.drawio` sources use manually positioned shapes like the approved pre-oral
  figures; export each complete canvas as one high-resolution PNG or PDF.
- A context diagram treats the application as one process. The database is
  shown only as the professor-required system data store, not as an external
  actor.
- Data-flow arrows use data names, not actions such as "click" or "press".
- Underlined attributes in the Chen ERD are primary identifiers. `1`, `0..1`,
  and `N` labels state cardinality.
- The ERD is one exhaustive editable canvas generated directly from the DBML
  physical-schema contract. It contains all 52 entities, all 708 local
  attributes, and all 107 in-scope relationships, with each entity drawn once.
  Every relationship diamond sits between the two entities it relates, and
  both legs connect the actual entity boxes to it. Every line has its own
  track, so no two lines share a segment and none passes through a shape;
  the remaining crossings are drawn as bridge arcs. Each diamond prints its
  stable `R001`-`R107` code, verb, and foreign-key field, matching
  `ERD_CURRENT_CONNECTIONS.md`, and the legs carry the `1`, `0..1`, or `N`
  cardinality. Export the complete canvas as one high-resolution image; do not
  split it into separate figures.
- `docs/models/ERD_CURRENT.md` is the complete readable schema reference. It
  and the `ERD_CURRENT_CONNECTIONS.md` companion list all 107 relationships
  using source-cardinality-verb-cardinality-target lines with exact field
  mappings and do not require tracing lines across the ERD.

## Scope statements for the oral defense

- Schedule overlap is explicitly shown as a Yes/No branch in the request and
  dispatch DFD. A detected conflict leads to client coordination for an
  alternative schedule; it is not silently accepted.
- Quotation Records snapshot the selected service deposit rule and required
  amount. Sales Payment records document money received outside the portal,
  including deposit payments later credited to the Sales Record balance. The
  system still has no online payment gateway, receipt issuer, reconciliation
  import, or refund processor.
- A client may decline a quotation with a reason; the office revises and
  resends it on the same record (`QUO-…-R2`) and the decline stays in the
  activity log. An accepted quotation is locked.
- `Awaiting Materials` returns to service through the Dispatch Board once
  materials arrive; a deposit-required job still waits for the full deposit.
- After-sales and maintenance records can trigger notices and follow-up work,
  but a new visit still enters through the controlled request/ticket workflow.
- `Time TBD` appointments are covered by daily capacity rules but cannot be
  evaluated as exact-time overlaps until a concrete time is recorded.

## Color key matching the earlier paper

- External actor/entity: light purple (`#E9DDF2`)
- System/process: light blue or cyan (`#DCE6F1`, `#D9F0F0`)
- Data store: light rose (`#F4CCCC`)
- ERD entity: reference green (`#B7E36D`)
- ERD relationship: reference orange (`#F6B26B`)
- ERD attribute: reference yellow (`#FFD966`)
