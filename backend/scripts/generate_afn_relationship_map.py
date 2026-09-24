"""Generate complete readable Markdown ERD references from the AFN DBML."""

from __future__ import annotations

from collections import defaultdict

from generate_afn_chen_drawio import (
    DBML_PATH,
    FIELD_RE,
    GROUP_ORDER,
    TABLE_ORDER,
    TABLE_RE,
    parse_dbml,
    relationship_title,
)


OUTPUT_PATH = DBML_PATH.with_name("ERD_CURRENT.md")
CONNECTIONS_OUTPUT_PATH = DBML_PATH.with_name("ERD_CURRENT_CONNECTIONS.md")

ENTITY_NAMES = {
    "services_serviceanalytics": "SERVICE ANALYTICS",
    "services_technicianperformance": "TECHNICIAN PERFORMANCE",
    "services_demandforecast": "DEMAND FORECAST",
    "services_servicetrend": "SERVICE TREND",
    "services_aftersalescase": "AFTER-SALES CASE",
    "services_aftersalescaseevent": "AFTER-SALES CASE EVENT",
    "services_maintenanceschedule": "MAINTENANCE SCHEDULE",
    "messages_app_customersupportcase": "CUSTOMER SUPPORT CASE",
    "messages_app_message": "MESSAGE",
    "notifications_notification": "NOTIFICATION",
    "users_user": "USER",
    "users_clientprofile": "CLIENT PROFILE",
    "users_technicianprofile": "TECHNICIAN PROFILE",
    "users_managementprofile": "MANAGEMENT PROFILE",
    "users_usercapabilitygrant": "USER CAPABILITY GRANT",
    "users_adminsettings": "ADMIN SETTINGS",
    "users_landingpageasset": "LANDING PAGE ASSET",
    "users_activitylog": "ACTIVITY LOG",
    "users_changelog": "CHANGE LOG",
    "services_servicetype": "SERVICE TYPE",
    "services_slarule": "SLA RULE",
    "services_servicerequest": "SERVICE REQUEST",
    "services_servicerequestservice": "SERVICE REQUEST SERVICE",
    "services_servicelocation": "SERVICE LOCATION",
    "services_solarestimate": "SOLAR ESTIMATE",
    "services_serviceticket": "SERVICE TICKET",
    "services_ticketcrewassignment": "TICKET CREW ASSIGNMENT",
    "services_servicestatushistory": "SERVICE STATUS HISTORY",
    "progress_ticketprogress": "TICKET PROGRESS",
    "services_technicianskill": "TECHNICIAN SKILL",
    "services_technicianlocationhistory": "TECHNICIAN LOCATION HISTORY",
    "services_arrivalvalidationlog": "ARRIVAL VALIDATION LOG",
    "services_inspectionchecklist": "INSPECTION CHECKLIST",
    "services_generateddocument": "GENERATED DOCUMENT",
    "services_technicaldatasheet": "TECHNICAL DATA SHEET",
    "services_solarcommissioningchecklist": "SOLAR COMMISSIONING CHECKLIST",
    "services_turnoveracceptance": "TURNOVER ACCEPTANCE",
    "services_quotationrecord": "QUOTATION RECORD",
    "services_installationcontract": "INSTALLATION CONTRACT",
    "services_solarprojectprofile": "SOLAR PROJECT PROFILE",
    "services_fieldservicereport": "FIELD SERVICE REPORT",
    "services_installedequipment": "INSTALLED EQUIPMENT",
    "inventory_inventorycategory": "INVENTORY CATEGORY",
    "inventory_inventoryitem": "INVENTORY ITEM",
    "inventory_servicetypeinventoryrequirement": "SERVICE TYPE INVENTORY REQUIREMENT",
    "inventory_inventoryreservation": "INVENTORY RESERVATION",
    "inventory_inventorytransaction": "INVENTORY TRANSACTION",
    "inventory_equipmentreturnrequest": "EQUIPMENT RETURN REQUEST",
    "inventory_equipmentreturnrequestitem": "EQUIPMENT RETURN REQUEST ITEM",
    "services_salesrecord": "SALES RECORD",
    "services_salesrecordline": "SALES RECORD LINE",
}


def entity_name(table_name: str) -> str:
    """Return the paper-friendly entity name for an exact database table."""
    return ENTITY_NAMES[table_name]


def parse_columns(source: str) -> dict[str, list[tuple[str, str, str]]]:
    """Return every table's ordered name/type/options column definitions."""
    columns: dict[str, list[tuple[str, str, str]]] = {}
    current_table: str | None = None
    in_indexes = False
    for line in source.splitlines():
        table_match = TABLE_RE.match(line)
        if table_match:
            current_table = table_match.group(1)
            columns[current_table] = []
            in_indexes = False
            continue
        if current_table is None:
            continue
        if line.strip() == "Indexes {":
            in_indexes = True
            continue
        if line == "}":
            if in_indexes:
                in_indexes = False
            else:
                current_table = None
            continue
        if in_indexes or not line.startswith("  "):
            continue
        field_match = FIELD_RE.match(line)
        if field_match:
            field_name, field_type, options = field_match.groups()
            columns[current_table].append(
                (field_name, field_type.strip(), options or "nullable")
            )
    return columns


def relationship_lines(relationships: list) -> list[str]:
    """Format all relationships by domain in the requested readable notation."""
    group_by_table = {
        table_name: group_name
        for group_name in GROUP_ORDER
        for table_name in TABLE_ORDER[group_name]
    }
    grouped = defaultdict(list)
    for relationship in relationships:
        grouped[group_by_table[relationship.source_table]].append(relationship)

    lines: list[str] = []
    relationship_number = 1
    for group_name in GROUP_ORDER:
        lines.extend((f"### {group_name}", ""))
        ordered = sorted(
            grouped[group_name],
            key=lambda relationship: (
                entity_name(relationship.source_table),
                relationship.source_field,
                entity_name(relationship.target_table),
            ),
        )
        for relationship in ordered:
            source_cardinality = (
                "0..1"
                if relationship.one_to_one and relationship.optional
                else "1"
                if relationship.one_to_one
                else "N"
            )
            lines.append(
                f"{relationship_number}. "
                f"({entity_name(relationship.source_table)}) "
                f"---- {source_cardinality} ---- "
                f"{relationship_title(relationship.source_field)} "
                f"---- 1 ---- "
                f"({entity_name(relationship.target_table)})  "
                f"[`{relationship.source_field}` -> `{relationship.target_field}`]"
            )
            relationship_number += 1
        lines.append("")
    return lines


def relationship_introduction(count: int) -> list[str]:
    return [
        "Each relationship follows this format:",
        "",
        "`(SOURCE ENTITY) ---- source cardinality ---- VERB ---- target cardinality ---- (TARGET ENTITY)`",
        "",
        "`N` means many, `1` means exactly one, and `0..1` means optional one. "
        "The field mapping identifies the exact foreign-key and referenced fields.",
        "",
        f"Total relationships: **{count}**",
        "",
    ]


def generate_complete_erd() -> str:
    """Return the complete entity, attribute, and relationship Markdown ERD."""
    source = DBML_PATH.read_text(encoding="utf-8")
    tables, relationships = parse_dbml(source)
    columns = parse_columns(source)
    lines = [
        "# AFN Current ERD — Complete Text Edition",
        "",
        "This is the complete readable ERD derived from `AFN_ERD.dbml`.",
        "",
        f"- Entities: **{len(tables)}**",
        f"- Attributes: **{sum(len(attributes) for attributes in tables.values())}**",
        f"- Relationships: **{len(relationships)}**",
        "",
        "## Entity and Attribute Catalog",
        "",
        "`pk` marks a primary key, `ref` marks a foreign key, `unique` marks a "
        "unique value, and `not null` marks a required value.",
        "",
    ]
    entity_number = 1
    for group_name in GROUP_ORDER:
        lines.extend((f"### {group_name}", ""))
        for table_name in TABLE_ORDER[group_name]:
            lines.extend((
                f"#### {entity_number}. {entity_name(table_name)}",
                "",
                f"Database table: `{table_name}`",
                "",
                "| Attribute | Data type | Database constraints |",
                "| --- | --- | --- |",
            ))
            for field_name, field_type, options in columns[table_name]:
                lines.append(
                    f"| `{field_name}` | `{field_type}` | `{options}` |"
                )
            lines.append("")
            entity_number += 1

    lines.extend(("## Relationship Map", ""))
    lines.extend(relationship_introduction(len(relationships)))
    lines.extend(relationship_lines(relationships))
    return "\n".join(lines)


def generate_connections_only() -> str:
    """Return the compact relationship-only companion document."""
    _tables, relationships = parse_dbml(DBML_PATH.read_text(encoding="utf-8"))
    lines = ["# AFN Current ERD Connections", ""]
    lines.extend(relationship_introduction(len(relationships)))
    lines.extend(relationship_lines(relationships))
    return "\n".join(lines)


if __name__ == "__main__":
    connections = generate_connections_only()
    outputs = {
        OUTPUT_PATH: connections,
        CONNECTIONS_OUTPUT_PATH: connections,
    }
    for output_path, content in outputs.items():
        output_path.write_text(content, encoding="utf-8")
        print(f"Generated {output_path}")
