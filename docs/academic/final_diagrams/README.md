# AFN Final Capstone Diagram Pack

These sources follow the four formats shown in the approved pre-oral paper:

1. Context Diagram
2. Data Flow Diagram (DFD)
3. Entity Relationship Diagram (Chen notation)
4. Database Schema

They describe the implemented AFN Service Management System as audited on
2026-09-04. They intentionally replace obsolete notification-template,
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
  physical-schema contract. It contains all 51 entities, all 676 local
  attributes, and all 102 in-scope relationships. Every relationship line
  connects an actual canonical entity box to a Chen diamond. Clear entity exits,
  shared domain gutters, dedicated relationship rails, and bridge arcs organize
  the unavoidable intersections without duplicate entity references. Stable
  `R001`-`R102` identifiers label both connection legs and their matching
  diamonds; each diamond also names its source and target entity, field, and
  cardinality so long routes remain unambiguous. Entity
  degree determines placement: the User and Service Ticket hubs occupy the
  center, related modules surround them, and low-connectivity modules use the
  outer landscape edges. Export the complete canvas as one high-resolution
  image; do not split it into separate figures.
- `docs/models/ERD_CURRENT.md` is the complete readable connection map. It and
  the identical `ERD_CURRENT_CONNECTIONS.md` alias list all 102 relationships
  using source-cardinality-verb-cardinality-target lines with exact field
  mappings and do not require tracing lines across the ERD.

## Scope statements for the oral defense

- Schedule overlap is explicitly shown as a Yes/No branch in the request and
  dispatch DFD. A detected conflict leads to client coordination for an
  alternative schedule; it is not silently accepted.
- Sales/Purchase Records preserve delivered service and product evidence. The
  system does not process payments or refunds, so no payment gateway or refund
  process appears in these diagrams.
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
