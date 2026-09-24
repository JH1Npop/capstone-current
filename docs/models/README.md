# Connected Model Files

For the final professor-format Context Diagram, unified DFD, Chen ERD, and
physical Database Schema, use
[`../academic/final_diagrams/README.md`](../academic/final_diagrams/README.md).
The files listed below remain supporting model documentation.

Use these files as the connected model set for Chapter III. They are based on the reference Google Doc style, but the content is aligned with the actual AFN Service Management System codebase.

Recommended insertion order:

1. `SYSTEM_WORKFLOW_MODEL.md`
2. `USE_CASE_DIAGRAM.md`
3. `DATA_FLOW_DIAGRAM.md`
4. `ENTITY_RELATIONSHIP_DIAGRAM.md`
5. `DEPLOYMENT_DIAGRAM.md`
6. `SDLC_MODEL.md`

Recommended Chapter III placement:

- Put `SDLC_MODEL.md` inside the **Software Development Lifecycle** section.
- Put `SYSTEM_WORKFLOW_MODEL.md` after requirements or before system design diagrams.
- Put `USE_CASE_DIAGRAM.md` after the workflow model.
- Put `DATA_FLOW_DIAGRAM.md` after the use case diagram.
- Put `ENTITY_RELATIONSHIP_DIAGRAM.md` after the DFD or in the database design section.
- Put `DEPLOYMENT_DIAGRAM.md` in the deployment diagram section.

Supporting-diagram tool:

- The supporting Markdown model files use Mermaid.
- The four required final figures use editable draw.io sources and DBML as
  specified by the final diagram pack guide linked above.

Regenerate the physical DBML after any Django model change:

```powershell
.\venv\Scripts\python.exe backend\scripts\generate_afn_dbml.py
```

The generator includes the 51 AFN application tables and annotates framework
relationships that intentionally terminate outside the paper's application
schema boundary.

Regenerate the exhaustive single-page Chen ERD from the same models:

```powershell
.\venv\Scripts\python.exe backend\scripts\generate_afn_chen_drawio.py
```

The resulting `.drawio` file is generated directly from `AFN_ERD.dbml` and
contains all 51 application entities, all 676 local attributes, and a Chen
relationship diamond for all 102 in-scope relationships. Every relationship
edge connects the actual canonical entity box to its diamond. Connections leave
through clear space below each entity, share an orderly domain gutter, and then
branch onto dedicated horizontal rails; visible bridge arcs keep the exhaustive
cross-domain wiring readable. Stable `R001`-`R102` identifiers appear on both
legs and the matching diamond, while every diamond prints its complete source
and target entity, field, and cardinality. This allows a reader to identify a
connection without following a long rail across the canvas. The notation
follows the supplied reference:
small green entity rectangles, yellow attribute ovals, orange relationship
diamonds, black connectors, underlined primary keys, and cardinality labels.
Placement is graph-driven rather than table-ordered: the User and Service Ticket
hubs are centered, related modules surround them, and low-connectivity entities
sit toward the landscape edges.

Regeneration writes identical maintained copies to
`AFN_ERD_CHEN_PRESENTATION.drawio` and the convenient `ERD_CURRENT.drawio`
alias.

For the complete connection map, open `ERD_CURRENT.md`. It contains all 102
relationships as `(SOURCE) ---- N ---- VERB ---- 1 ---- (TARGET)` with exact
field mappings and no diagram lines to trace. `ERD_CURRENT_CONNECTIONS.md` is
an identical descriptive alias. Regenerate both Markdown files with:

```powershell
.\venv\Scripts\python.exe backend\scripts\generate_afn_relationship_map.py
```

