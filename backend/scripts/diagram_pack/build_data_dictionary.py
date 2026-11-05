"""Build data_dictionary.json (one entry per paper table) for the Word data dictionary.

Reads the paper schema (AFN-SERVE-Paper-Schema.dbml), looks up allowed values from the Django models, and adds the
written descriptions below. Documentation tool only: it reads model metadata and changes nothing in the system.
Run from the backend folder:  ..\\venv\\Scripts\\python.exe scripts\\diagram_pack\\build_data_dictionary.py
"""
import json
import os
import re
import sys
from pathlib import Path

import django

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parents[1]))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "afn_service_management.settings")
django.setup()

from django.apps import apps  # noqa: E402

import generate_afn_chen_drawio as chen  # noqa: E402

SCHEMA = ROOT / "docs/academic/final_diagrams/AFN-SERVE-Paper-Schema.dbml"
OUT = HERE / "data_dictionary.json"

TABLE_DESCRIPTIONS = {
    "user": "Stores the account information of all users in the system, including superadmin, admin, technician, and client accounts.",
    "client_profile": "Stores client-specific details such as client type, company name, billing address, preferred contact method, and account balance. Each profile belongs to exactly one user account.",
    "technician_profile": "Stores technician-specific details such as the current GPS position and skill level. Each profile belongs to exactly one user account.",
    "management_profile": "Stores the management profile of an administrator or superadmin account. Each profile belongs to exactly one user account.",
    "user_capability_grant": "Records each capability code granted to a user. The system uses these grants, together with the user role, to control which actions a user may perform.",
    "admin_settings": "Stores the system-wide settings managed by administrators, such as the system name, support email, email notification switch, business hours, time zone, and overtime capacity.",
    "landing_page_asset": "Stores the files uploaded for the public landing page, with their original names and content types.",
    "activity_log": "Records the actions performed by users in the system, grouped by category and action, to provide an audit trail.",
    "change_log": "Records the changes made to the data in the system, including the type of action and the field that was changed.",
    "service_type": "Stores the services offered by the company, with their category, estimated cost, and whether they are currently active.",
    "sla_rule": "Stores the service-level agreement rules that define the delay checks used to monitor requests and tickets.",
    "service_request": "Stores the service requests submitted by clients, including the requested service type, priority, status, and preferred date and time slot.",
    "service_request_service": "Stores each individual service included in a service request, so that one request can contain several services.",
    "service_location": "Stores the address and map coordinates of the site where the requested service will be performed.",
    "solar_estimate": "Stores the solar estimate prepared for a client and, once converted, the service request it became.",
    "service_ticket": "Stores the work tickets created from approved service requests, including the ticket type, assigned technician and administrator, schedule, and start and completion times.",
    "ticket_crew_assignment": "Stores the technicians assigned to the crew of a service ticket.",
    "service_status_history": "Stores each status that a service ticket has passed through, providing a history of its progress.",
    "ticket_progress": "Stores the progress status recorded for a service ticket while the job is being carried out.",
    "technician_skill": "Stores the service types that a technician is able to perform and the skill level for each.",
    "technician_location_history": "Stores the GPS positions reported by technicians over time for location tracking.",
    "arrival_validation_log": "Records the navigation, arrival, job start, and job completion actions of a technician, together with the technician and site coordinates used to validate arrival.",
    "calendar_closure": "Stores the dates and time slots that administrators have closed or limited for scheduling, with the reason.",
    "inspection_checklist": "Stores the inspection checklist completed by the technician for a ticket, including any follow-up case type and due date.",
    "generated_document": "Stores the documents generated for a ticket, such as the field service report, quotation proposal, or installation contract, with their title and status.",
    "technical_data_sheet": "Stores the technical data sheet gathered during the site inspection, describing the premises, ownership, and rooftop type, and the date the client confirmed it.",
    "solar_commissioning_checklist": "Stores the commissioning checklist of a solar installation, including the site, inverter details, commissioning date, and status.",
    "turnover_acceptance": "Stores the turnover acceptance signed off by the client after an installation, with the turnover date, the name of the accepting client, and the warranty start date.",
    "quotation_record": "Stores the quotation prepared for a ticket, including the quotation number, amounts, required deposit, and status.",
    "installation_contract": "Stores the installation contract of a ticket, including its start date, total amount, and status.",
    "solar_project_profile": "Stores the solar project details of a service location, such as the system capacity and the number of panels and inverters.",
    "field_service_report": "Stores the field service report of a ticket, including the serial number of the serviced equipment.",
    "installed_equipment": "Stores the equipment installed for a client, with its type, serial number, and capacity, to support warranty and maintenance follow-up.",
    "inventory_category": "Stores the categories used to group inventory items. A category can belong to a parent category.",
    "inventory_item": "Stores the items kept in inventory, with their SKU, type, capacity, stock on hand, minimum stock, reserved quantity, and unit price.",
    "service_type_inventory_requirement": "Stores the inventory items, and how many of each, that a service type requires.",
    "inventory_reservation": "Stores the inventory items reserved for a technician or ticket, with the quantity, required date, and status.",
    "inventory_transaction": "Records every stock movement of an inventory item, such as purchase, issue, return, and adjustment, with its quantity and date.",
    "equipment_return_request": "Stores the requests made by technicians to return unused equipment after a job, with the verification status.",
    "equipment_return_request_item": "Stores each inventory item, and its quantity, included in an equipment return request.",
    "sales_record": "Stores the sales record of a ticket, including the record number, sale date, currency, agreed total, status, and the record it replaces if it was corrected.",
    "sales_record_line": "Stores the lines of a sales record, each describing a service, product, or equipment sold with its quantity, unit price, and line total.",
    "sales_payment": "Stores the payments received against a sales record or quotation, with the amount, payment method, reference, and void reason if the payment was cancelled.",
    "after_sales_case": "Stores the after-sales cases opened for a completed ticket, such as follow-ups, maintenance, complaints, and warranty claims, with their priority, status, and due date.",
    "after_sales_case_event": "Stores the history of an after-sales case, recording each creation, assignment, and status change with the user who made it.",
    "maintenance_schedule": "Stores the maintenance schedule of a completed ticket, including the last service date, next due date, reminder date, status, and risk level.",
    "customer_support_case": "Stores the support conversations opened by clients, with their subject, category, priority, and status.",
    "message": "Stores the messages exchanged between users, either directly or in a group, optionally linked to a ticket.",
    "notification": "Stores the notifications sent to users, with their title, message, type, status, and whether an email was requested and sent.",
    "service_analytics": "Stores the daily service analytics, including the number of requests, average response and completion times, and satisfaction score.",
    "technician_performance": "Stores the daily performance of each technician, including total work hours and average response and completion times.",
    "demand_forecast": "Stores the forecasted demand for each service type on a given date, with the confidence level of the forecast.",
    "service_trend": "Stores the demand trends detected for each service type, such as seasonal, weekly, monthly, or yearly patterns.",
}

COLUMN_DESCRIPTIONS = {
    # inventory
    "equipment_return_request.status": "Current status of the equipment return request",
    "equipment_return_request_item.quantity": "Number of units of the item being returned.",
    "inventory_category.name": "Name of the inventory category.",
    "inventory_item.name": "Name of the inventory item.",
    "inventory_item.sku": "Unique stock keeping unit code of the item.",
    "inventory_item.item_type": "Type of the inventory item",
    "inventory_item.capacity": "Capacity or rating of the item, such as the wattage of a panel.",
    "inventory_item.quantity": "Number of units currently in stock.",
    "inventory_item.minimum_stock": "Stock level at or below which a low-stock alert is raised.",
    "inventory_item.reserved_quantity": "Number of units currently reserved for jobs.",
    "inventory_item.unit_price": "Price of one unit of the item.",
    "inventory_reservation.quantity": "Number of units reserved.",
    "inventory_reservation.required_date": "Date on which the reserved items are needed.",
    "inventory_reservation.status": "Current status of the reservation",
    "inventory_transaction.transaction_type": "Type of stock movement",
    "inventory_transaction.quantity": "Number of units moved by the transaction.",
    "inventory_transaction.reference_number": "Reference number of the document or ticket related to the transaction.",
    "inventory_transaction.transaction_date": "Date and time the transaction was recorded.",
    "service_type_inventory_requirement.quantity": "Number of units of the item that the service type requires.",
    # communication
    "customer_support_case.group_key": "Unique key that groups the messages belonging to the support case.",
    "customer_support_case.subject": "Subject of the support case.",
    "customer_support_case.category": "Category of the support case",
    "customer_support_case.priority": "Priority of the support case",
    "customer_support_case.status": "Current status of the support case",
    "message.room_type": "Type of conversation the message belongs to",
    "message.message_text": "Text content of the message.",
    "notification.message": "Full text of the notification.",
    "notification.title": "Short title of the notification.",
    "notification.type": "Type of the notification",
    "notification.status": "Current status of the notification, such as unread or read.",
    "notification.send_email": "Indicates whether an email should also be sent for the notification.",
    "notification.email_sent": "Indicates whether the email for the notification was sent.",
    # progress and after-sales
    "ticket_progress.progress_status": "Progress status recorded for the ticket.",
    "after_sales_case.case_type": "Type of the after-sales case",
    "after_sales_case.status": "Current status of the after-sales case",
    "after_sales_case.priority": "Priority of the after-sales case",
    "after_sales_case.due_date": "Date by which the case should be resolved.",
    "after_sales_case_event.event_type": "Type of event recorded for the case",
    "after_sales_case_event.from_status": "Status of the case before the event.",
    "after_sales_case_event.to_status": "Status of the case after the event.",
    "maintenance_schedule.last_service_date": "Date the equipment was last serviced.",
    "maintenance_schedule.next_due_date": "Date the next maintenance is due.",
    "maintenance_schedule.notify_on_date": "Date on which the client is reminded of the maintenance.",
    "maintenance_schedule.status": "Current status of the maintenance schedule",
    "maintenance_schedule.risk_level": "Maintenance risk level calculated for the equipment, such as low, medium, or high.",
    "maintenance_schedule.risk_score": "Numeric maintenance risk score calculated for the equipment.",
    # service intake and dispatch
    "arrival_validation_log.action": "Action recorded for the technician",
    "arrival_validation_log.technician_latitude": "Latitude of the technician when the action was recorded.",
    "arrival_validation_log.technician_longitude": "Longitude of the technician when the action was recorded.",
    "arrival_validation_log.service_latitude": "Latitude of the service site.",
    "arrival_validation_log.service_longitude": "Longitude of the service site.",
    "calendar_closure.date": "Date that is closed or limited.",
    "calendar_closure.time_slot": "Time slot affected by the closure",
    "calendar_closure.availability_status": "Availability of the date or time slot",
    "calendar_closure.reason": "Reason for closing or limiting the date.",
    "calendar_closure.is_active": "Indicates whether the closure is currently in effect.",
    "service_location.address": "Complete address of the service site.",
    "service_location.latitude": "Latitude of the service site.",
    "service_location.longitude": "Longitude of the service site.",
    "service_request.priority": "Priority of the service request",
    "service_request.status": "Current status of the service request",
    "service_request.preferred_date": "Date preferred by the client for the service.",
    "service_request.preferred_time_slot": "Time slot preferred by the client",
    "service_request.request_date": "Date and time the request was submitted.",
    "service_request_service.status": "Current status of the service within the request",
    "service_status_history.status": "Status that the ticket was changed to.",
    "service_ticket.ticket_type": "Type of the ticket",
    "service_ticket.scheduled_date": "Date the ticket is scheduled for.",
    "service_ticket.scheduled_time": "Exact time the ticket is scheduled for.",
    "service_ticket.scheduled_time_slot": "Time slot the ticket is scheduled for",
    "service_ticket.start_time": "Date and time the technician started the job.",
    "service_ticket.end_time": "Date and time the job ended.",
    "service_ticket.completed_date": "Date and time the ticket was completed.",
    "service_type.name": "Name of the service type.",
    "service_type.category": "Category of the service type, such as solar or air conditioning.",
    "service_type.estimated_cost": "Estimated cost of the service type.",
    "service_type.is_active": "Indicates whether the service type can currently be requested.",
    "sla_rule.key": "Identifier of the delay that the rule monitors",
    "sla_rule.is_active": "Indicates whether the rule is currently enforced.",
    "solar_estimate.status": "Current status of the solar estimate",
    "technician_location_history.latitude": "Latitude reported by the technician.",
    "technician_location_history.longitude": "Longitude reported by the technician.",
    "technician_skill.skill_level": "Skill level of the technician for the service type",
    # field evidence and documents
    "field_service_report.serial_number": "Serial number of the equipment serviced.",
    "generated_document.document_type": "Type of the generated document",
    "generated_document.title": "Title of the generated document.",
    "generated_document.status": "Current status of the document",
    "inspection_checklist.service_type_label": "Label of the service type that was inspected.",
    "inspection_checklist.follow_up_case_type": "Type of follow-up case requested after the inspection",
    "inspection_checklist.follow_up_due_date": "Date the follow-up case is due.",
    "installation_contract.start_date": "Date the installation is to start.",
    "installation_contract.total_contract_amount": "Total amount of the contract.",
    "installation_contract.status": "Current status of the contract",
    "installed_equipment.equipment_type": "Type of the installed equipment.",
    "installed_equipment.serial_number": "Serial number of the installed equipment.",
    "installed_equipment.capacity": "Capacity or rating of the installed equipment.",
    "quotation_record.quotation_number": "Number that identifies the quotation.",
    "quotation_record.total_amount": "Total amount of the quotation.",
    "quotation_record.downpayment_amount": "Down payment amount of the quotation.",
    "quotation_record.balance_amount": "Remaining balance of the quotation.",
    "quotation_record.required_deposit_amount": "Deposit the client must pay before work can be scheduled.",
    "quotation_record.status": "Current status of the quotation",
    "solar_commissioning_checklist.site_name": "Name of the site being commissioned.",
    "solar_commissioning_checklist.inverter_type": "Type of the installed inverter.",
    "solar_commissioning_checklist.inverter_serial_number": "Serial number of the installed inverter.",
    "solar_commissioning_checklist.commissioned_date": "Date the system was commissioned.",
    "solar_commissioning_checklist.status": "Current status of the checklist",
    "solar_project_profile.system_capacity": "Total capacity of the solar system.",
    "solar_project_profile.number_of_panels": "Number of solar panels installed.",
    "solar_project_profile.number_of_inverters": "Number of inverters installed.",
    "technical_data_sheet.status": "Current status of the technical data sheet",
    "technical_data_sheet.premise_type": "Type of the premises, such as residential or commercial.",
    "technical_data_sheet.premise_category": "Category of the premises.",
    "technical_data_sheet.ownership_type": "Ownership type of the premises.",
    "technical_data_sheet.private_or_government_type": "Indicates whether the premises are private or government owned.",
    "technical_data_sheet.rooftop_type": "Type of the rooftop where the system is installed.",
    "technical_data_sheet.client_confirmation_date": "Date the client confirmed the technical data sheet.",
    "turnover_acceptance.turnover_date": "Date the installation was turned over to the client.",
    "turnover_acceptance.accepted_by_client_name": "Name of the client who accepted the turnover.",
    "turnover_acceptance.warranty_start_date": "Date the warranty begins.",
    "turnover_acceptance.status": "Current status of the turnover acceptance",
    # sales
    "sales_payment.amount": "Amount of the payment.",
    "sales_payment.method": "Method used to pay",
    "sales_payment.reference": "Reference number of the payment, such as a transaction or receipt number.",
    "sales_payment.void_reason": "Reason the payment was voided, if it was cancelled.",
    "sales_record.record_number": "Unique number that identifies the sales record.",
    "sales_record.status": "Current status of the sales record",
    "sales_record.sale_date": "Date of the sale.",
    "sales_record.currency_code": "Three-letter code of the currency used.",
    "sales_record.agreed_total": "Total amount agreed with the client.",
    "sales_record.void_reason": "Reason the sales record was voided, if it was cancelled.",
    "sales_record_line.line_type": "Type of the sold line",
    "sales_record_line.name": "Name of the item or service sold.",
    "sales_record_line.sku": "Stock keeping unit code of the item sold.",
    "sales_record_line.quantity": "Quantity sold.",
    "sales_record_line.unit_price": "Price of one unit.",
    "sales_record_line.line_total": "Total amount of the line.",
    # analytics
    "service_analytics.date": "Date the analytics figures apply to.",
    "service_analytics.total_requests": "Total number of service requests received.",
    "service_analytics.avg_response_time_hours": "Average time, in hours, taken to respond to requests.",
    "service_analytics.avg_completion_time_hours": "Average time, in hours, taken to complete requests.",
    "service_analytics.satisfaction_score": "Average client satisfaction score.",
    "technician_performance.date": "Date the performance figures apply to.",
    "technician_performance.total_work_hours": "Total hours the technician worked.",
    "technician_performance.avg_response_time_hours": "Average time, in hours, the technician took to respond.",
    "technician_performance.avg_completion_time_hours": "Average time, in hours, the technician took to complete jobs.",
    "demand_forecast.forecast_date": "Date the forecast applies to.",
    "demand_forecast.confidence_level": "Confidence level of the forecast.",
    "service_trend.trend_type": "Type of the trend",
    # identity and configuration
    "activity_log.actor_role": "Role of the user at the time the action was performed.",
    "activity_log.actor_display_name": "Display name of the user who performed the action.",
    "activity_log.category": "Category of the logged action",
    "activity_log.action": "Action that was performed",
    "activity_log.message": "Description of what happened.",
    "admin_settings.system_name": "Name of the system shown to users.",
    "admin_settings.support_email": "Email address used for support.",
    "admin_settings.enable_email_notifications": "Indicates whether email notifications are turned on.",
    "admin_settings.overtime_daily_capacity_minutes": "Daily overtime capacity, in minutes, available for scheduling.",
    "admin_settings.default_time_zone": "Default time zone of the system.",
    "admin_settings.business_open_time": "Time the business day starts.",
    "admin_settings.business_close_time": "Time the business day ends.",
    "change_log.content_type_id": "Identifier of the type of record that was changed. It refers to the framework content type table, which is outside this diagram.",
    "change_log.action": "Type of change",
    "change_log.field_name": "Name of the field that was changed.",
    "client_profile.client_type": "Type of the client",
    "client_profile.company_name": "Company name of the client.",
    "client_profile.billing_address": "Billing address of the client.",
    "client_profile.preferred_contact_method": "Contact method preferred by the client",
    "client_profile.account_balance": "Current account balance of the client.",
    "landing_page_asset.original_name": "Original file name of the uploaded asset.",
    "landing_page_asset.content_type": "Content type of the uploaded file.",
    "technician_profile.current_latitude": "Latest latitude of the technician.",
    "technician_profile.current_longitude": "Latest longitude of the technician.",
    "technician_profile.skill_level": "Overall skill level of the technician",
    "user.username": "Unique username used for login.",
    "user.first_name": "First name of the user.",
    "user.last_name": "Last name of the user.",
    "user.email": "Email address of the user.",
    "user.is_active": "Indicates whether the account is active.",
    "user.role": "Defines the user role",
    "user.middle_name": "Middle name of the user.",
    "user.phone": "Contact number of the user.",
    "user_capability_grant.capability_code": "Code of the capability granted to the user.",
}

ROLE_PHRASES = {
    "created_by": "who created the record", "updated_by": "who last updated the record",
    "reopened_by": "who reopened the closure", "location_validation_updated_by": "who last updated the location validation setting",
    "uploaded_by": "who uploaded the file", "assigned_to": "assigned to the case", "assigned_admin": "assigned as the administrator",
    "actor": "who performed the action", "sender": "who sent the message", "receiver": "who received the message",
    "technician": "who acts as the technician", "client": "who is the client", "parent": "that is the parent category",
    "replaces": "that this record replaces", "original_ticket": "from which the project originated",
}

TYPE_NAMES = {
    "bigint": "INTEGER", "integer": "INTEGER", "smallint": "INTEGER", "varchar": "VARCHAR", "text": "TEXT",
    "boolean": "BOOLEAN", "date": "DATE", "time": "TIME", "timestamp": "TIMESTAMP", "decimal": "DECIMAL", "double": "FLOAT",
}


def words(name: str) -> str:
    return name.replace("_", " ")


def title(name: str) -> str:
    return words(name).title()


def join_choices(values: list[str]) -> str:
    if len(values) == 1:
        return values[0]
    if len(values) == 2:
        return f"{values[0]} or {values[1]}"
    return ", ".join(values[:-1]) + f", or {values[-1]}"


def table_order(renames: dict[str, str]) -> list[str]:
    order_in_group = {g: list(t) for g, t in chen.TABLE_ORDER.items()}
    order_in_group["Service Intake, Dispatch and Progress"].insert(3, "services_calendarclosure")
    groups = ["Identity, Access, Configuration and Audit", "Service Intake, Dispatch and Progress",
              "Field Evidence and Documents", "Inventory, Returns and Sales", "After-Sales and Communication", "Analytics"]
    ordered = [renames[t] for g in groups for t in order_in_group[g]]
    return ordered


def main() -> None:
    renames = json.loads((HERE / "table_names.json").read_text(encoding="utf-8"))
    back = {paper: db for db, paper in renames.items()}
    by_db = {m._meta.db_table: m for m in apps.get_models()}
    text = SCHEMA.read_text(encoding="utf-8")
    schema = {}
    for match in re.finditer(r"^Table (\w+) \{\n(.*?)^\}", text, re.S | re.M):
        columns = []
        for line in match.group(2).splitlines():
            part = re.match(r"\s{2}(\w+)\s+(\w+)(?:\([^)]*\))?\s*(?:\[(.*)\])?", line)
            if part:
                columns.append((part.group(1), part.group(2), part.group(3) or ""))
        schema[match.group(1)] = columns
    missing = []
    tables = []
    for number, paper in enumerate(table_order(renames), start=1):
        model = by_db[back[paper]]
        fields = {f.column: f for f in model._meta.local_fields}
        rows = []
        for column, base_type, options in schema[paper]:
            is_pk = "pk" in options
            ref = re.search(r"ref: [<>-] (\w+)\.", options)
            nullable = "not null" not in options and not is_pk
            if is_pk:
                description = f"Primary key and unique identifier of the {words(paper)}."
            elif ref:
                target = words(ref.group(1))
                stem = column[:-3] if column.endswith("_id") else column
                phrase = ROLE_PHRASES.get(stem)
                if phrase:
                    description = f"Foreign key referencing the {target} {phrase}."
                elif words(stem) in target:
                    description = f"Foreign key referencing the {target}."
                else:
                    description = f"Foreign key referencing the {target} ({words(stem)})."
            else:
                base = COLUMN_DESCRIPTIONS.get(f"{paper}.{column}")
                if base is None:
                    missing.append(f"{paper}.{column}")
                    base = f"{words(column).capitalize()} of the {words(paper)}."
                field = fields.get(column if column in fields else None)
                choices = [str(c[0]) for c in field.choices] if field is not None and field.choices else []
                description = f"{base}: {join_choices(choices)}." if choices and not base.endswith(".") else base
            rows.append({
                "field": column, "type": TYPE_NAMES[base_type], "pk": is_pk, "fk": bool(ref), "null": nullable,
                "description": description,
            })
        rows.sort(key=lambda r: not r["pk"])   # primary key first, then the schema order
        tables.append({"number": number, "name": title(paper), "table": paper, "rows": rows,
                       "description": TABLE_DESCRIPTIONS[paper]})
    unused = sorted(set(TABLE_DESCRIPTIONS) ^ {t["table"] for t in tables})
    print("tables", len(tables), "rows", sum(len(t["rows"]) for t in tables))
    print("columns with no written description:", missing)
    print("table description keys out of step with the schema:", unused)
    OUT.write_text(json.dumps(tables, indent=1), encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
