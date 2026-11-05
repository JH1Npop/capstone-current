"""Generate the paper-sized AFN schema (DBML) from the active Django models.

The full physical schema is `docs/models/AFN_ERD.dbml`. For the capstone paper the ERD and the
schema must show the same data, but not every technical column. This script applies one
mechanical attribute rule to the live models and writes `docs/academic/final_diagrams/
AFN-SERVE-Paper-Schema.dbml`; the Chen ERD page is generated from that file, so the two cannot
drift apart.

Kept: primary keys, foreign keys (every relationship), unique columns, and business columns whose
name matches KEEP_PATTERNS (capped at MAX_BUSINESS per table). Dropped: audit timestamps,
JSON blobs, free-text notes, file paths, tokens, and framework columns.

    .\\venv\\Scripts\\python.exe backend\\scripts\\generate_afn_paper_schema.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import generate_afn_dbml as full  # noqa: E402  (calls django.setup())

from django.apps import apps  # noqa: E402
from django.db import models  # noqa: E402

OUT = Path(__file__).resolve().parents[2] / "docs" / "academic" / "final_diagrams" / "AFN-SERVE-Paper-Schema.dbml"
MAX_BUSINESS = 7

KEEP_PATTERNS = re.compile(
    r"(^|_)(status|name|title|type|code|number|no|date|time|slot|amount|total|price|cost|"
    r"quantity|stock|balance|email|phone|role|address|priority|category|reference|sku|"
    r"latitude|longitude|capacity|rating|score|skill|level|kind|method|reason|action|"
    r"severity|channel|is_active|username|first_name|last_name|subject|content|message)(_|$)"
)
DROP_PATTERNS = re.compile(
    r"(^|_)(created|updated|modified|deleted|password|token|hash|secret|snapshot|metadata|json|"
    r"payload|url|path|file|image|photo|signature|notes?|remarks?|description|details?|"
    r"last_login|is_superuser|is_staff|date_joined|ip|agent|raw|cache|checksum|extra)(_|$)"
)
# Audit-trail links to the User entity (who created, updated, reviewed, voided ... a record). They carry no business
# meaning of their own and account for most line crossings in the Chen ERD, so the paper schema omits them unless the
# link is the table's only relationship. The physical database keeps every one of these columns.
AUDIT_FK = re.compile(
    r"^(created|updated|changed|voided|reviewed|confirmed|client_confirmed|completed|submitted|prepared|generated|"
    r"finalized|uploaded|granted|reopened|recorded|performed|location_validation_updated)_by$"
)
# CalendarClosure is a current workflow (admin-controlled closures) the older paper schema omitted.
EXTRA_TABLE_GROUPS = {"Service Intake, Dispatch and Progress": {"services_calendarclosure"}}


def keep(field: models.Field) -> bool:
    if field.primary_key or field.unique:
        return True
    if isinstance(field, (models.ForeignKey, models.OneToOneField)):
        return True
    return False


def business_columns(model: type[models.Model]) -> list[models.Field]:
    chosen = []
    for field in model._meta.local_fields:
        if keep(field) or isinstance(field, (models.JSONField, models.BinaryField, models.FileField)):
            continue
        if DROP_PATTERNS.search(field.column) or not KEEP_PATTERNS.search(field.column):
            continue
        chosen.append(field)
    return chosen[:MAX_BUSINESS]


def snake(name: str) -> str:
    """CamelCase model name to snake_case (SLARule -> sla_rule)."""
    return re.sub(r"(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])", "_", name).lower()


def audit_columns(model: type[models.Model]) -> set[str]:
    fks = [f for f in model._meta.local_fields if isinstance(f, (models.ForeignKey, models.OneToOneField))]
    audit = {f.column for f in fks if AUDIT_FK.match(f.name)}
    return audit if len(audit) < len(fks) else set()


def generate() -> str:
    for group, tables in EXTRA_TABLE_GROUPS.items():
        full.TABLE_GROUPS[group] |= tables
    selected = sorted(
        (m for m in apps.get_models() if m._meta.app_label in full.APP_LABELS),
        key=lambda m: m._meta.db_table,
    )
    included = {m._meta.db_table for m in selected}
    grouped = set().union(*full.TABLE_GROUPS.values())
    if included - grouped:
        # Document-template infrastructure is administration configuration, not a conceptual entity.
        selected = [m for m in selected if m._meta.db_table in grouped]
        included = {m._meta.db_table for m in selected}
    # Paper names: the table is the snake_case model name and its primary key is <table>_id, so the two always match.
    rename = {m._meta.db_table: (snake(m.__name__), m._meta.pk.column) for m in selected}
    if len({new for new, _ in rename.values()}) != len(rename):
        raise RuntimeError("Paper table names are not unique")
    RENAMES.update({old: new for old, (new, _) in rename.items()})

    def paper_ref(setting: str) -> str:
        def swap(match):
            new_table, old_pk = rename[match.group(2)]
            column = f"{new_table}_id" if match.group(3) == old_pk else match.group(3)
            return f"ref: {match.group(1)} {new_table}.{column}"
        return re.sub(r"ref: ([<>-]) (\w+)\.(\w+)", swap, setting)

    lines = [
        "Project AFN_SERVE_Paper_Schema {",
        "  database_type: 'PostgreSQL'",
        f"  Note: 'Paper schema: {len(selected)} entities; every table is named after its entity and its primary key is <table>_id; relationships and core business "
        "attributes. Generated from the active Django models by generate_afn_paper_schema.py; "
        "the Chen ERD is generated from this same file.'",
        "}",
        "",
    ]
    for model in selected:
        wanted = {f.column for f in model._meta.local_fields if keep(f)} - audit_columns(model) | {
            f.column for f in business_columns(model)
        }
        new_table = rename[model._meta.db_table][0]
        lines.append(f"Table {new_table} {{")
        for field in model._meta.local_fields:
            if field.column not in wanted:
                continue
            settings = [paper_ref(item) for item in full.field_settings(field, included)]
            suffix = f" [{', '.join(settings)}]" if settings else ""
            column = f"{new_table}_id" if field.primary_key else field.column
            lines.append(f"  {column} {full.dbml_type(field)}{suffix}")
        lines.extend(["}", ""])
    for group, tables in full.TABLE_GROUPS.items():
        members = sorted(rename[t][0] for t in tables if t in included)
        if members:
            lines.append(f'TableGroup "{group}" {{')
            lines.extend(f"  {t}" for t in members)
            lines.extend(["}", ""])
    return "\n".join(lines)


RENAMES: dict[str, str] = {}   # db_table -> paper table name, filled by generate()
NAMES_JSON = Path(__file__).resolve().parent / "diagram_pack" / "table_names.json"

if __name__ == "__main__":
    text = generate()
    import json
    NAMES_JSON.write_text(json.dumps(RENAMES, indent=1, sort_keys=True), encoding="utf-8", newline="\n")
    OUT.write_text(text, encoding="utf-8", newline="\n")
    tables = re.findall(r"^Table ", text, re.M)
    cols = len(re.findall(r"^  [a-z_0-9]+ [a-z(]", text, re.M))
    print(f"Generated {OUT}: {len(tables)} tables, {cols} columns")
