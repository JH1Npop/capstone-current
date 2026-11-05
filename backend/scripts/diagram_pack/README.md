# AFN-SERVE diagram pack tooling

Rebuilds `docs/academic/final_diagrams/AFN-SERVE-System-Diagrams.drawio`. These are documentation tools only; none of them touches application code or the database (Django is only loaded to read model metadata).

## Pipeline

1. `python backend/scripts/generate_afn_paper_schema.py` writes `AFN-SERVE-Paper-Schema.dbml` from the live Django models (reduced attribute set, one rule for all tables).
2. `optimize_erd.py [iterations] [seed] [start_temp] [resume]` searches entity seats against the real crossing count and writes `erd_grid.json`; `chen.py <out.xml>` runs the existing Chen generator (`generate_afn_chen_drawio.py`) against that DBML. This is page 1, so ERD and schema cannot disagree. `erd.xml` is the committed output.
3. The Context page is hand-routed by `build_context.py` (hub-and-spoke, nested lanes, writes `context.frag`). Level 0/1 are drawn from specs: `spec_level0.py`, `spec_level1.py` (node positions and flows; `FIXED`-free, positions came from `anneal.py`).
   - `anneal.py spec.py spec_out.py [iters] [seed]` places nodes by simulated annealing (crossings, edge length, lines through boxes) and picks connector sides.
   - `dfd_build.py spec.py out.frag` builds `out.frag.gen.py`, which reuses the A* orthogonal router in `generate_afn_dfd_drawio.py`. Run it to produce `out.frag`. Level 0 takes roughly 10 minutes.
4. `merge.py out.drawio` merges `erd.xml` plus the three `*.frag` files into the four-page file (ids are prefixed per page).
5. `validate.py out.drawio schema.dbml` runs the structural and modeling checks. `check.py frag prefix` reports crossings/overlaps and writes an approximate SVG preview. `shot.js` screenshots an SVG with Playwright.

## Known limits

- The scripts were developed with absolute scratch paths (`S = ...` in `merge.py`, repository path in `chen.py`/`dfd_build.py`). Edit those constants before re-running elsewhere.
- Previews from `check.py` are an approximation, not a draw.io render. Open the `.drawio` in diagrams.net for the real check.
- No PDF export is produced because no draw.io export tool is installed.
