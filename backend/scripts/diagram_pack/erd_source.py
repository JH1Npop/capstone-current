"""Point the Chen generator at the paper schema.

The paper schema uses the paper table names (service_ticket, primary key service_ticket_id). The Chen generator and the
saved seat grid are keyed by the original database table names (services_serviceticket), so this module translates the
schema text back to those keys in a generated file next to this one. Attribute names (including every
<table>_id key) are taken unchanged from the paper schema, so the ERD and the schema stay identical.
"""
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SCHEMA = ROOT / "docs/academic/final_diagrams/AFN-SERVE-Paper-Schema.dbml"
GENERATED = HERE / "_erd_source.dbml"


def prepare(c):
    renames = json.loads((HERE / "table_names.json").read_text(encoding="utf-8"))   # db table -> paper table
    back = {paper: db for db, paper in renames.items()}
    text = SCHEMA.read_text(encoding="utf-8")
    text = re.sub(r"^Table (\w+) \{", lambda m: f"Table {back[m.group(1)]} {{", text, flags=re.M)
    text = re.sub(r"ref: ([<>-]) (\w+)\.", lambda m: f"ref: {m.group(1)} {back[m.group(2)]}.", text)
    text = re.sub(r"^  (\w+)$", lambda m: "  " + back.get(m.group(1), m.group(1)), text, flags=re.M)
    GENERATED.write_text(text, encoding="utf-8", newline="\n")
    c.DBML_PATH = GENERATED
    c.VERB_ONLY = True
    c.LEG_EDGE = c.LEG_EDGE.replace("jumpStyle=arc;jumpSize=8;", "")
    order = c.TABLE_ORDER["Service Intake, Dispatch and Progress"]
    if "services_calendarclosure" not in order:
        order.insert(3, "services_calendarclosure")
    # entity labels read exactly like the paper table names (SERVICE TICKET <-> service_ticket)
    import generate_afn_relationship_map as rm
    for db_table, paper in renames.items():
        rm.ENTITY_NAMES[db_table] = paper.replace("_", " ").upper()
    grid = HERE / "erd_grid.json"
    if grid.exists():
        c.ENTITY_GRID = json.loads(grid.read_text(encoding="utf-8"))   # seats found by optimize_erd.py
