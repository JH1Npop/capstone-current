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

The generator includes the 52 AFN application tables and annotates framework
relationships that intentionally terminate outside the paper's application
schema boundary.

Regenerate the exhaustive single-page Chen ERD from the same models:

```powershell
.\venv\Scripts\python.exe backend\scripts\generate_afn_chen_drawio.py
```

The resulting `.drawio` file is generated directly from `AFN_ERD.dbml` and
contains all 52 application entities (each drawn once), all 708 local
attributes, and a Chen relationship diamond for all 107 in-scope relationships.
Entities sit on a 7 × 8 grid with their attribute ovals on both sides. Each
diamond sits in the horizontal channel beside its foreign-key entity, on the
path between the two entities it relates, and both legs run from the entity box
to the diamond. Every connecting line has its own track: no two lines share a
segment, no line passes through a shape, and the order of parallel tracks is
chosen to minimise crossings. The crossings that remain are drawn as bridge
arcs. Each diamond prints its stable `R001`-`R107` code, verb, and
foreign-key field; the codes are the same as in `ERD_CURRENT_CONNECTIONS.md`.
`1`, `0..1`, and `N` cardinality labels sit on the legs beside the diamond. The
notation follows the supplied reference: small green entity rectangles, yellow
attribute ovals, orange relationship diamonds, black connectors, and underlined
primary keys. Entity seats (`ENTITY_GRID` in the generator) were chosen by a
local search that minimised the measured line crossings of this layout; a new
table takes the free seat nearest the entities it references.

Regeneration writes identical maintained copies to
`AFN_ERD_CHEN_PRESENTATION.drawio` and the convenient `ERD_CURRENT.drawio`
alias.

For the complete entity, attribute, and connection reference, open
`ERD_CURRENT.md`. It contains all 52 entities, 708 attributes, and 107
relationships. `ERD_CURRENT_CONNECTIONS.md` is the compact relationship-only
companion. Both use `(SOURCE) ---- N ---- VERB ---- 1 ---- (TARGET)` with exact
field mappings and no diagram lines to trace; each line starts with the `R###`
code printed in the matching Chen ERD diamond. Regenerate both Markdown files
with:

```powershell
.\venv\Scripts\python.exe backend\scripts\generate_afn_relationship_map.py
```

