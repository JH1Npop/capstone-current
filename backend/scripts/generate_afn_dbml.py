"""Generate the paper's physical DBML schema from active Django models."""

from __future__ import annotations

import os
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "afn_service_management.settings")

import django  # noqa: E402

django.setup()

from django.apps import apps  # noqa: E402
from django.db import models  # noqa: E402


APP_LABELS = {
    "users",
    "services",
    "inventory",
    "messages_app",
    "notifications",
    "progress",
}

TABLE_GROUPS = {
    "Identity, Access, Configuration and Audit": {
        "users_user",
        "users_technicianprofile",
        "users_clientprofile",
        "users_managementprofile",
        "users_usercapabilitygrant",
        "users_adminsettings",
        "users_landingpageasset",
        "users_activitylog",
        "users_changelog",
    },
    "Service Intake, Dispatch and Progress": {
        "services_servicetype",
        "services_slarule",
        "services_servicerequest",
        "services_servicerequestservice",
        "services_servicelocation",
        "services_solarestimate",
        "services_serviceticket",
        "services_ticketcrewassignment",
        "services_servicestatushistory",
        "progress_ticketprogress",
        "services_technicianskill",
        "services_technicianlocationhistory",
        "services_arrivalvalidationlog",
    },
    "Field Evidence and Documents": {
        "services_inspectionchecklist",
        "services_generateddocument",
        "services_technicaldatasheet",
        "services_solarcommissioningchecklist",
        "services_turnoveracceptance",
        "services_quotationrecord",
        "services_installationcontract",
        "services_solarprojectprofile",
        "services_fieldservicereport",
        "services_installedequipment",
    },
    "Inventory, Returns and Sales": {
        "inventory_inventorycategory",
        "inventory_inventoryitem",
        "inventory_inventoryreservation",
        "inventory_inventorytransaction",
        "inventory_servicetypeinventoryrequirement",
        "inventory_equipmentreturnrequest",
        "inventory_equipmentreturnrequestitem",
        "services_salesrecord",
        "services_salesrecordline",
    },
    "After-Sales and Communication": {
        "services_aftersalescase",
        "services_aftersalescaseevent",
        "services_maintenanceschedule",
        "messages_app_customersupportcase",
        "messages_app_message",
        "notifications_notification",
    },
    "Analytics": {
        "services_serviceanalytics",
        "services_technicianperformance",
        "services_demandforecast",
        "services_servicetrend",
    },
}


def dbml_type(field: models.Field) -> str:
    """Return a portable PostgreSQL-oriented DBML type."""
    if isinstance(field, (models.ForeignKey, models.OneToOneField)):
        return dbml_type(field.target_field)
    if isinstance(field, (models.BigAutoField, models.BigIntegerField)):
        return "bigint"
    if isinstance(field, models.SmallIntegerField):
        return "smallint"
    if isinstance(field, (models.AutoField, models.IntegerField)):
        return "integer"
    if isinstance(field, models.DecimalField):
        return f"decimal({field.max_digits},{field.decimal_places})"
    if isinstance(field, models.FloatField):
        return "double"
    if isinstance(field, models.BooleanField):
        return "boolean"
    if isinstance(field, models.DateTimeField):
        return "timestamp"
    if isinstance(field, models.DateField):
        return "date"
    if isinstance(field, models.TimeField):
        return "time"
    if isinstance(field, models.JSONField):
        return "jsonb"
    if isinstance(field, (models.TextField,)):
        return "text"
    if isinstance(field, models.UUIDField):
        return "uuid"
    if isinstance(field, models.BinaryField):
        return "bytea"
    if isinstance(field, models.GenericIPAddressField):
        return "varchar(39)"
    if isinstance(field, (models.CharField, models.EmailField, models.FileField)):
        return f"varchar({field.max_length})"
    return field.get_internal_type().lower()


def field_settings(field: models.Field, included_tables: set[str]) -> list[str]:
    settings: list[str] = []
    if field.primary_key:
        settings.append("pk")
    if isinstance(field, (models.AutoField, models.BigAutoField)):
        settings.append("increment")
    if not field.null and not field.primary_key:
        settings.append("not null")
    if field.unique and not field.primary_key:
        settings.append("unique")

    related_model = getattr(field, "related_model", None)
    if related_model is not None and related_model._meta.db_table in included_tables:
        relation = "-" if isinstance(field, models.OneToOneField) else ">"
        target = f"{related_model._meta.db_table}.{related_model._meta.pk.column}"
        settings.append(f"ref: {relation} {target}")
    elif related_model is not None:
        target = f"{related_model._meta.db_table}.{related_model._meta.pk.column}"
        settings.append(f"note: 'References framework table {target} outside this application diagram'")
    return settings


def composite_indexes(model: type[models.Model]) -> list[tuple[tuple[str, ...], bool]]:
    indexes: list[tuple[tuple[str, ...], bool]] = []
    seen: set[tuple[tuple[str, ...], bool]] = set()

    for field_names in model._meta.unique_together:
        item = (tuple(model._meta.get_field(name).column for name in field_names), True)
        if item not in seen:
            indexes.append(item)
            seen.add(item)

    for constraint in model._meta.constraints:
        if (
            isinstance(constraint, models.UniqueConstraint)
            and constraint.fields
            and not constraint.condition
            and not constraint.expressions
        ):
            item = (
                tuple(model._meta.get_field(name).column for name in constraint.fields),
                True,
            )
            if item not in seen:
                indexes.append(item)
                seen.add(item)

    for index in model._meta.indexes:
        if index.fields and not index.expressions:
            columns = tuple(
                model._meta.get_field(name.lstrip("-")).column for name in index.fields
            )
            item = (columns, False)
            if item not in seen:
                indexes.append(item)
                seen.add(item)
    return indexes


def generate() -> str:
    selected = [
        model
        for model in apps.get_models()
        if model._meta.app_label in APP_LABELS
    ]
    selected.sort(key=lambda model: model._meta.db_table)
    included_tables = {model._meta.db_table for model in selected}

    grouped_tables = set().union(*TABLE_GROUPS.values())
    if included_tables != grouped_tables:
        missing = sorted(included_tables - grouped_tables)
        stale = sorted(grouped_tables - included_tables)
        raise RuntimeError(f"Table groups are stale: missing={missing}, stale={stale}")

    lines = [
        "Project AFN_Service_Management_Database_Schema {",
        "  database_type: 'PostgreSQL'",
        "  Note: 'Generated from all 51 active AFN Django application models on 2026-09-04. Primary keys, columns, relationships, uniqueness, and nullability reflect the current model contract.'",
        "}",
        "",
    ]

    for model in selected:
        lines.append(f"Table {model._meta.db_table} {{")
        for field in model._meta.local_fields:
            settings = field_settings(field, included_tables)
            suffix = f" [{', '.join(settings)}]" if settings else ""
            lines.append(f"  {field.column} {dbml_type(field)}{suffix}")

        indexes = composite_indexes(model)
        if indexes:
            lines.extend(["", "  Indexes {"])
            for columns, unique in indexes:
                marker = " [unique]" if unique else ""
                lines.append(f"    ({', '.join(columns)}){marker}")
            lines.append("  }")
        lines.extend(["}", ""])

    for group_name, group_tables in TABLE_GROUPS.items():
        lines.append(f'TableGroup "{group_name}" {{')
        for table_name in sorted(group_tables):
            lines.append(f"  {table_name}")
        lines.extend(["}", ""])
    return "\n".join(lines)


if __name__ == "__main__":
    destination = Path(__file__).resolve().parents[2] / "docs" / "models" / "AFN_ERD.dbml"
    destination.write_text(generate(), encoding="utf-8")
    print(f"Generated {destination}")
