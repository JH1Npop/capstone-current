import re
from pathlib import Path
from xml.sax.saxutils import escape
from zipfile import ZIP_DEFLATED, ZipFile

from django.conf import settings
from django.utils import timezone

from services.models import (
    FieldServiceReport,
    GeneratedDocument,
    InstalledEquipment,
    QuotationRecord,
    SolarProjectProfile,
)


TEMPLATE_DIR = Path(settings.BASE_DIR) / 'document_templates'
CUSTOM_TEMPLATE_DIR = TEMPLATE_DIR / 'originals'
GENERATED_DIR = Path(settings.MEDIA_ROOT) / 'generated_documents'

DOCUMENT_TYPE_ALIASES = {
    'quotation_proposal': 'quotation_proposal',
    'installation_contract': 'installation_contract',
    'solar_installation_contract': 'installation_contract',
    'technical_data_sheet': 'technical_data_sheet',
    'commissioning_checklist': 'commissioning_checklist',
    'pv_solar_commissioning_checklist': 'commissioning_checklist',
    'turnover_acceptance': 'turnover_acceptance',
    'turnover_acceptance_form': 'turnover_acceptance',
    'field_service_report': 'field_service_report',
}

TEMPLATE_FILENAMES = {
    'quotation_proposal': 'quotation_proposal.docx',
    'installation_contract': 'solar_installation_contract.docx',
    'technical_data_sheet': 'technical_data_sheet.docx',
    'commissioning_checklist': 'pv_solar_commissioning_checklist.docx',
    'turnover_acceptance': 'turnover_acceptance_form.docx',
    'field_service_report': 'field_service_report.docx',
}

LOOP_PATTERN = re.compile(
    r'<!--\s*\{\{#(?P<name>[a-zA-Z0-9_\.]+)\}\}\s*-->(?P<body>.*?)<!--\s*\{\{/(?P=name)\}\}\s*-->',
    re.DOTALL,
)
PLACEHOLDER_PATTERN = re.compile(r'\{\{\s*([a-zA-Z0-9_\.]+)\s*\}\}')

CONTENT_TYPES_XML = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>
"""

PACKAGE_RELS_XML = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>
"""

DOCUMENT_RELS_XML = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>
"""

RENDERABLE_XML_PARTS = {
    'word/document.xml',
}


def display_name(user):
    if not user:
        return ''
    return user.get_full_name().strip() or user.username


def format_date(value):
    if not value:
        return ''
    if hasattr(value, 'strftime'):
        return value.strftime('%B %d, %Y')
    return str(value)


def format_input_date(value):
    if not value:
        return ''
    value = str(value)
    return value[:10] if 'T' in value else value


def ticket_number(ticket):
    return f'TKT-{ticket.id:04d}'


def safe_text(value):
    if value is None:
        return ''
    if isinstance(value, bool):
        return 'Yes' if value else 'No'
    return str(value)


def normalize_whitespace(value):
    return safe_text(value).replace('\r\n', '\n').replace('\r', '\n')


def resolve_path(value, path):
    current = value
    for part in path.split('.'):
        if isinstance(current, dict):
            current = current.get(part)
        else:
            current = getattr(current, part, None)
        if current is None:
            return ''
    return current


def render_text(template, context):
    previous = None
    rendered = template
    while previous != rendered:
        previous = rendered

        def loop_replacer(match):
            loop_name = match.group('name')
            loop_value = resolve_path(context, loop_name)
            if not isinstance(loop_value, list):
                return ''

            body = match.group('body')
            parts = []
            for item in loop_value:
                if isinstance(item, dict):
                    merged = {**context, **item}
                else:
                    merged = {**context, 'value': item}
                parts.append(render_text(body, merged))
            return ''.join(parts)

        rendered = LOOP_PATTERN.sub(loop_replacer, rendered)

    def placeholder_replacer(match):
        key = match.group(1)
        value = resolve_path(context, key)
        if isinstance(value, (list, dict)):
            return escape('')
        return escape(normalize_whitespace(value))

    return PLACEHOLDER_PATTERN.sub(placeholder_replacer, rendered)


def cell(text, *, bold=False):
    bold_xml = '<w:b/>' if bold else ''
    return (
        '<w:tc>'
        '<w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr>'
        '<w:p><w:r><w:rPr>'
        f'{bold_xml}'
        '</w:rPr><w:t xml:space="preserve">'
        f'{escape(text)}'
        '</w:t></w:r></w:p>'
        '</w:tc>'
    )


def row(cells):
    return '<w:tr>' + ''.join(cells) + '</w:tr>'


def table(headers, row_markup):
    header_row = row([cell(header, bold=True) for header in headers])
    return (
        '<w:tbl>'
        '<w:tblPr>'
        '<w:tblW w:w="0" w:type="auto"/>'
        '<w:tblBorders>'
        '<w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/>'
        '<w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/>'
        '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>'
        '<w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/>'
        '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/>'
        '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>'
        '</w:tblBorders>'
        '</w:tblPr>'
        f'{header_row}{row_markup}'
        '</w:tbl>'
    )


def paragraph(text, *, bold=False, center=False):
    justify = '<w:jc w:val="center"/>' if center else ''
    bold_xml = '<w:b/>' if bold else ''
    return (
        '<w:p><w:pPr>'
        f'{justify}'
        '</w:pPr><w:r><w:rPr>'
        f'{bold_xml}'
        '</w:rPr><w:t xml:space="preserve">'
        f'{escape(text)}'
        '</w:t></w:r></w:p>'
    )


def document_xml(body_markup):
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        '<w:body>'
        f'{body_markup}'
        '<w:sectPr>'
        '<w:pgSz w:w="12240" w:h="15840"/>'
        '<w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="708" w:footer="708" w:gutter="0"/>'
        '</w:sectPr>'
        '</w:body>'
        '</w:document>'
    )


def fsr_row_markup():
    return (
        '<!-- {{#service_rows}} -->'
        + row([
            cell('{{ brand_model }}'),
            cell('{{ tr_hp }}'),
            cell('{{ serial_number }}'),
            cell('{{ indoor_temp }}'),
            cell('{{ outdoor_temp }}'),
            cell('{{ ampere }}'),
            cell('{{ others_specify }}'),
            cell('{{ recommendation }}'),
            cell('{{ in_reading }}'),
            cell('{{ out_reading }}'),
        ])
        + '<!-- {{/service_rows}} -->'
    )


def quotation_bom_row_markup():
    return (
        '<!-- {{#bom_rows}} -->'
        + row([
            cell('{{ item_no }}'),
            cell('{{ description }}'),
            cell('{{ unit }}'),
            cell('{{ qty }}'),
            cell('{{ unit_price }}'),
            cell('{{ amount }}'),
        ])
        + '<!-- {{/bom_rows}} -->'
    )


def key_value_table(loop_name, columns):
    row_markup = f'<!-- {{{{#{loop_name}}}}} -->' + row([cell(f'{{{{ {column} }}}}') for column in columns]) + f'<!-- {{{{/{loop_name}}}}} -->'
    return table(columns, row_markup)


def build_template_definitions():
    templates = {}

    templates['field_service_report'] = document_xml(
        paragraph('AFN Solar Power Engineering Services', bold=True, center=True)
        + paragraph('Field Service Report', bold=True, center=True)
        + paragraph('Ticket Number: {{ ticket_number }}')
        + paragraph('Client: {{ client_name }}')
        + paragraph('Address: {{ client_address }}')
        + paragraph('Contact Number: {{ client_contact_number }}')
        + paragraph('Technician: {{ technician_name }}')
        + paragraph('Date: {{ service_date }}')
        + table(
            ['Brand / Model', 'TR/HP', 'Serial #', 'Indoor Temp', 'Outdoor Temp', 'Ampere', 'Others Specify', 'Recommendation', 'In Reading', 'Out Reading'],
            fsr_row_markup(),
        )
        + paragraph('Signature of Client: ______________________________')
        + paragraph('Signature of Technician: __________________________')
    )

    templates['quotation_proposal'] = document_xml(
        paragraph('AFN Solar Power Engineering Services', bold=True, center=True)
        + paragraph('Quotation Proposal', bold=True, center=True)
        + paragraph('Quotation No: {{ quotation_number }}')
        + paragraph('Quotation Date: {{ quotation_date }}')
        + paragraph('Attention: {{ attention }}')
        + paragraph('Subject: {{ subject }}')
        + paragraph('Location: {{ location }}')
        + paragraph('Validity: {{ validity }}')
        + paragraph('Delivery / System Installation Completion: {{ delivery_timeline }}')
        + paragraph('Mode of Payment: {{ payment_method }}')
        + paragraph('Terms of Payment: {{ payment_terms }}')
        + paragraph('Force Majeure: {{ force_majeure }}')
        + paragraph('Cancellation of Order: {{ cancellation_terms }}')
        + paragraph('Inclusion: {{ inclusions }}')
        + paragraph('Exclusion: {{ exclusions }}')
        + paragraph('System Specifications & Bill of Materials', bold=True)
        + key_value_table('brand_rows', ['label', 'value'])
        + table(['Description', 'Unit', 'Total Price'], '<!-- {{#price_rows}} -->' + row([cell('{{ description }}'), cell('{{ unit }}'), cell('{{ total_price }}')]) + '<!-- {{/price_rows}} -->')
        + table(['Item No', 'Item Description', 'Unit', 'Quantity', 'Unit Price', 'Amount'], quotation_bom_row_markup())
        + table(['Warranty Item', 'Warranty Brand', 'Warranty Period'], '<!-- {{#warranty_rows}} -->' + row([cell('{{ item }}'), cell('{{ brand }}'), cell('{{ period }}')]) + '<!-- {{/warranty_rows}} -->')
        + paragraph('Prepared By: {{ prepared_by }}')
        + paragraph('Title: {{ prepared_title }}')
        + paragraph('Company Signer: {{ company_signer }}')
    )

    templates['installation_contract'] = document_xml(
        paragraph('AFN Solar Power Engineering Services', bold=True, center=True)
        + paragraph('Solar Installation Contract', bold=True, center=True)
        + paragraph('Contract Date: {{ contract_date }}')
        + paragraph('Client Name: {{ client_name }}')
        + paragraph('Client Address: {{ client_address }}')
        + paragraph('Property Address: {{ property_address }}')
        + paragraph('Scope of Work: {{ scope_of_work }}')
        + paragraph('System Description: {{ system_description }}')
        + paragraph('Start Date: {{ start_date }}')
        + paragraph('Estimated Completion Time: {{ estimated_completion_time }}')
        + paragraph('Total Contract Amount: {{ total_contract_amount }}')
        + paragraph('Upfront Deposit: {{ upfront_payment }}')
        + paragraph('Completion Payment: {{ completion_payment }}')
        + paragraph('Remaining Balance: {{ final_payment }}')
        + paragraph('Days After Final Inspection: {{ final_inspection_days }}')
        + paragraph('Currency: {{ currency }}')
        + paragraph('Payment Method: {{ payment_method }}')
        + paragraph('Warranty Period: {{ warranty_period }}')
        + paragraph('Termination Notice Period: {{ termination_notice_period }}')
        + paragraph('Governing Law Jurisdiction: {{ governing_law_jurisdiction }}')
        + paragraph('Mediation / Arbitration Organization: {{ mediation_organization }}')
        + paragraph('Company Name: {{ company_name }}')
        + paragraph('Company Signer Name: {{ company_signer_name }}')
        + paragraph('Company Signer Title: {{ company_signer_title }}')
        + paragraph('Client Signer Name: {{ client_signer_name }}')
        + paragraph('Client Signer Title: {{ client_signer_title }}')
        + paragraph('Related Quotation / Appendix A: {{ quotation_reference }}')
    )

    templates['technical_data_sheet'] = document_xml(
        paragraph('AFN Solar Power Engineering Services', bold=True, center=True)
        + paragraph('Technical Data Sheet', bold=True, center=True)
        + paragraph('Last Name: {{ last_name }}')
        + paragraph('First Name: {{ first_name }}')
        + paragraph('Middle Name: {{ middle_name }}')
        + paragraph('Landline: {{ landline }}')
        + paragraph('Mobile: {{ mobile_number }}')
        + paragraph('Email Address: {{ email_address }}')
        + paragraph('Type of Premise / Establishment: {{ premise_type }}')
        + paragraph('Premise Category: {{ premise_category }}')
        + paragraph('Ownership Type: {{ ownership_type }}')
        + paragraph('Private / Government: {{ private_or_government_type }}')
        + paragraph('Complete Address or Coordinates: {{ complete_address }}')
        + paragraph('Primary Source of Electric Supply: {{ primary_electric_supply }}')
        + paragraph('AC Phase Power Supply: {{ ac_phase_power_supply }}')
        + paragraph('Solar Panel Installation Location: {{ solar_panel_installation_location }}')
        + paragraph('Rooftop Type: {{ rooftop_type }}')
        + paragraph('Average / Maximum Electricity Bill per Month: {{ average_monthly_electric_bill }}')
        + paragraph('Required Electricity Hours per Day: {{ electricity_required_hours_per_day }}')
        + paragraph('Frequent Brownouts: {{ frequent_brownouts }}')
        + paragraph('Brownouts per Week: {{ brownout_frequency }}')
        + paragraph('Battery Preference: {{ battery_preference }}')
        + table(['Appliance / Equipment', 'Number of Units', 'Inverter or Non-Inverter', 'Wattage', 'Using More at Day', 'Using More at Night', 'Other Remarks'],
                '<!-- {{#load_schedule_rows}} -->' + row([
                    cell('{{ appliance }}'),
                    cell('{{ quantity }}'),
                    cell('{{ inverter_type }}'),
                    cell('{{ wattage }}'),
                    cell('{{ usage_day }}'),
                    cell('{{ usage_night }}'),
                    cell('{{ remarks }}'),
                ]) + '<!-- {{/load_schedule_rows}} -->')
        + table(['Generator Brand Name', 'Generator kVA', 'Fuel Type', 'Date Purchased'],
                '<!-- {{#generator_rows}} -->' + row([
                    cell('{{ generator_brand_name }}'),
                    cell('{{ generator_capacity }}'),
                    cell('{{ generator_fuel_type }}'),
                    cell('{{ generator_date_purchased }}'),
                ]) + '<!-- {{/generator_rows}} -->')
        + table(['Purpose of Going Solar', 'Mark'], '<!-- {{#purpose_rows}} -->' + row([cell('{{ label }}'), cell('{{ mark }}')]) + '<!-- {{/purpose_rows}} -->')
        + paragraph('Electric Bill Attachment: {{ attach_electric_bill }}')
        + paragraph('Project Site Rooftop / Ground Photo Attachment: {{ attach_site_photo }}')
        + paragraph('Client Confirmation Name: {{ client_confirmation_name }}')
        + paragraph('Confirmation Date: {{ confirmation_date }}')
        + paragraph('Client Signature: ______________________________')
    )

    templates['commissioning_checklist'] = document_xml(
        paragraph('AFN Solar Power Engineering Services', bold=True, center=True)
        + paragraph('PV Solar Site Commissioning Checklist', bold=True, center=True)
        + paragraph('Site Name: {{ site_name }}')
        + paragraph('Inverter Type: {{ inverter_type }}')
        + paragraph('System Designation: {{ system_designation }}')
        + paragraph('Inverter SN: {{ inverter_serial_number }}')
        + paragraph('Commissioned Date: {{ commissioned_date }}')
        + paragraph('Irradiance: {{ irradiance }}')
        + paragraph('Ambient Temperature: {{ ambient_temperature }}')
        + table(['Item No', 'Section', 'Description', 'Check Status', 'Remarks'],
                '<!-- {{#checklist_rows}} -->' + row([
                    cell('{{ item_no }}'),
                    cell('{{ section }}'),
                    cell('{{ description }}'),
                    cell('{{ check_status }}'),
                    cell('{{ remarks }}'),
                ]) + '<!-- {{/checklist_rows}} -->')
        + table(['Reading', 'Inverter Display', 'Field Measured'],
                '<!-- {{#reading_rows}} -->' + row([
                    cell('{{ label }}'),
                    cell('{{ inverter_display }}'),
                    cell('{{ field_measured }}'),
                ]) + '<!-- {{/reading_rows}} -->')
    )

    templates['turnover_acceptance'] = document_xml(
        paragraph('AFN Solar Power Engineering Services', bold=True, center=True)
        + paragraph('Turnover / Acceptance Form', bold=True, center=True)
        + paragraph('kWp Solar PV System: {{ system_capacity_kwp }}')
        + paragraph('Project Installation of Solar Photovoltaic System: {{ project_installation_of }}')
        + paragraph('Location Address: {{ location_address }}')
        + paragraph('Date of Completion: {{ date_of_completion }}')
        + paragraph('Date of Turnover: {{ date_of_turnover }}')
        + paragraph('Client Name: {{ client_name }}')
        + paragraph('Contact Person: {{ client_contact_person }}')
        + paragraph('Contact Number: {{ client_contact_number }}')
        + paragraph('Total System Capacity in Watts-peak: {{ system_capacity }}')
        + table(['Component', 'Value A', 'Value B'],
                '<!-- {{#component_rows}} -->' + row([
                    cell('{{ label }}'),
                    cell('{{ value_a }}'),
                    cell('{{ value_b }}'),
                ]) + '<!-- {{/component_rows}} -->')
        + table(['Performance Item', 'Daily', 'Monthly', 'Annual'],
                '<!-- {{#performance_rows}} -->' + row([
                    cell('{{ label }}'),
                    cell('{{ daily }}'),
                    cell('{{ monthly }}'),
                    cell('{{ annual }}'),
                ]) + '<!-- {{/performance_rows}} -->')
        + table(['Commissioning Test', 'Date Conducted', 'Values', 'Results'],
                '<!-- {{#commissioning_rows}} -->' + row([
                    cell('{{ label }}'),
                    cell('{{ date_conducted }}'),
                    cell('{{ values }}'),
                    cell('{{ results }}'),
                ]) + '<!-- {{/commissioning_rows}} -->')
        + table(['Document', 'Status', 'Date'],
                '<!-- {{#documentation_rows}} -->' + row([
                    cell('{{ label }}'),
                    cell('{{ status }}'),
                    cell('{{ date }}'),
                ]) + '<!-- {{/documentation_rows}} -->')
        + paragraph('Warranty on Inverters: {{ warranty_on_inverters }}')
        + paragraph('System Warranty: {{ system_warranty }}')
        + paragraph('Installation Partner: {{ installer_partner }}')
        + paragraph('Installer Contact Person: {{ installer_contact_person }}')
        + paragraph('Installer Contact Number: {{ installer_contact_number }}')
        + paragraph('Installer Signature: ______________________________')
        + paragraph('Installer Date: {{ installer_date }}')
        + paragraph('Client Signature: ______________________________')
        + paragraph('Client Date: {{ client_signature_date }}')
        + paragraph('Final Confirmation Statement: {{ final_confirmation_statement }}')
    )

    return templates


TEMPLATE_DEFINITIONS = build_template_definitions()


def create_docx_file(path, document_xml_markup):
    path.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(path, 'w', compression=ZIP_DEFLATED) as archive:
        archive.writestr('[Content_Types].xml', CONTENT_TYPES_XML)
        archive.writestr('_rels/.rels', PACKAGE_RELS_XML)
        archive.writestr('word/document.xml', document_xml_markup)
        archive.writestr('word/_rels/document.xml.rels', DOCUMENT_RELS_XML)


def ensure_template_files(overwrite=False):
    TEMPLATE_DIR.mkdir(parents=True, exist_ok=True)
    CUSTOM_TEMPLATE_DIR.mkdir(parents=True, exist_ok=True)
    for document_type, filename in TEMPLATE_FILENAMES.items():
        template_path = TEMPLATE_DIR / filename
        if overwrite or not template_path.exists():
            create_docx_file(template_path, TEMPLATE_DEFINITIONS[document_type])


def resolve_template_path(document_type):
    filename = TEMPLATE_FILENAMES[document_type]
    custom_template_path = CUSTOM_TEMPLATE_DIR / filename
    if custom_template_path.exists():
        return custom_template_path
    return TEMPLATE_DIR / filename


def canonical_document_type(document_type):
    key = str(document_type or '').strip().lower()
    return DOCUMENT_TYPE_ALIASES.get(key, key)


def get_generated_document_data(ticket, document_type):
    document = (
        ticket.generated_documents
        .filter(document_type=document_type)
        .order_by('-updated_at', '-id')
        .first()
    )
    if not document or not isinstance(document.data_json, dict):
        return {}
    return document.data_json


def project_detail(ticket, *keys):
    details = ticket.project_details or {}
    for key in keys:
        value = details.get(key)
        if value not in (None, '', [], {}):
            return value
    return ''


def get_latest_field_service_report(ticket, report_id=None):
    queryset = ticket.field_service_reports.order_by('created_at', 'id')
    if report_id:
        return queryset.filter(id=report_id).first()
    return queryset.last()


def normalize_rows(rows, mapping):
    normalized = []
    for row_data in rows or []:
        normalized.append({target: safe_text(resolve_path(row_data, source)) for target, source in mapping.items()})
    return normalized


def build_common_context(ticket):
    request_obj = ticket.request
    client = request_obj.client if request_obj else None
    location = getattr(request_obj, 'location', None)
    technician = ticket.technician

    try:
        from users.models import AdminSettings
        admin_settings = AdminSettings.objects.order_by('id').first()
    except Exception:
        admin_settings = None

    return {
        'ticket_number': ticket_number(ticket),
        'client_name': display_name(client),
        'client_first_name': getattr(client, 'first_name', '') or '',
        'client_middle_name': getattr(client, 'middle_name', '') or '',
        'client_last_name': getattr(client, 'last_name', '') or '',
        'client_address': location.address if location else (getattr(client, 'address', '') or ''),
        'client_contact_number': getattr(client, 'phone', '') or '',
        'client_landline': getattr(client, 'landline', '') or '',
        'client_email': getattr(client, 'email', '') or '',
        'technician_name': display_name(technician),
        'service_date': format_date(ticket.scheduled_date or request_obj.preferred_date if request_obj else ''),
        'service_type': ', '.join(
            item.service_type.name
            for item in request_obj.service_items.select_related('service_type').order_by('sort_order', 'id')
            if item.service_type_id
        ) if request_obj else '',
        'location_address': location.address if location else '',
        'location_city': location.city if location else '',
        'location_province': location.province if location else '',
        'company_name': getattr(admin_settings, 'company_name', '') or 'AFN Solar Power Engineering Services',
        'company_address': getattr(admin_settings, 'company_address', '') or 'Lot2a9, Brgy. Bigo, Pagbilao, Quezon',
        'company_contact': '09171460224 / (042)9111107 | afnsunenergyserv@gmail.com',
        'prepared_by': 'C/ENGR. ARVIN F. NAPENAS',
        'prepared_title': 'General Manager',
        'payment_method': 'Paid externally',
        'currency': getattr(admin_settings, 'currency_code', '') or 'PHP',
        'external_payment_notice': getattr(admin_settings, 'external_payment_notice', '') or 'Payment is completed outside this system.',
        'quotation_validity_days': getattr(admin_settings, 'quotation_validity_days', 30),
        'default_warranty_days': getattr(admin_settings, 'default_warranty_days', 365),
        'document_footer': getattr(admin_settings, 'document_footer', '') or '',
        'governing_law_jurisdiction': 'Republic of the Philippines',
        'termination_notice_period': '30',
    }


def build_field_service_report_context(ticket, report_id=None):
    context = build_common_context(ticket)
    draft = get_generated_document_data(ticket, 'field_service_report')
    latest_report = get_latest_field_service_report(ticket, report_id=report_id)
    installed_equipment = list(InstalledEquipment.objects.filter(ticket=ticket).order_by('created_at', 'id'))

    service_rows = normalize_rows(draft.get('rows') or [], {
        'brand_model': 'brandModel',
        'tr_hp': 'trHp',
        'serial_number': 'serialNumber',
        'indoor_temp': 'indoorTemp',
        'outdoor_temp': 'outdoorTemp',
        'ampere': 'ampere',
        'others_specify': 'others',
        'recommendation': 'recommendation',
        'in_reading': 'inReading',
        'out_reading': 'outReading',
    })
    if service_rows and not any(
        any(safe_text(value).strip() for value in row.values())
        for row in service_rows
    ):
        service_rows = []

    if not service_rows:
        equipment = installed_equipment[0] if installed_equipment else None
        service_rows = [{
            'brand_model': safe_text(getattr(latest_report, 'brand_model', '') or getattr(equipment, 'brand_model', '')),
            'tr_hp': safe_text(getattr(equipment, 'capacity', '')),
            'serial_number': safe_text(getattr(latest_report, 'serial_number', '') or getattr(equipment, 'serial_number', '')),
            'indoor_temp': safe_text(getattr(latest_report, 'indoor_temp', '')),
            'outdoor_temp': safe_text(getattr(latest_report, 'outdoor_temp', '')),
            'ampere': safe_text(getattr(latest_report, 'ampere_reading', '')),
            'others_specify': safe_text(getattr(latest_report, 'voltage_reading', '')),
            'recommendation': safe_text(getattr(latest_report, 'recommendation', '')),
            'in_reading': safe_text(getattr(latest_report, 'before_service_readings', '')),
            'out_reading': safe_text(getattr(latest_report, 'after_service_readings', '')),
        }]

    context.update({
        'service_rows': service_rows,
        'client_name': draft.get('clientName') or context['client_name'],
        'client_address': draft.get('address') or context['client_address'],
        'client_contact_number': draft.get('contactNumber') or context['client_contact_number'],
        'technician_name': draft.get('technician') or context['technician_name'],
        'service_date': format_date(draft.get('documentDate') or ticket.scheduled_date),
        'before_service_readings': safe_text(getattr(latest_report, 'before_service_readings', '')),
        'after_service_readings': safe_text(getattr(latest_report, 'after_service_readings', '')),
    })
    if service_rows:
        context.update(service_rows[0])
    return context


def build_quotation_context(ticket):
    context = build_common_context(ticket)
    draft = get_generated_document_data(ticket, 'quotation_proposal')
    quotation = QuotationRecord.objects.filter(ticket=ticket).first()

    price_rows = normalize_rows(draft.get('priceRows') or [], {
        'description': 'description',
        'unit': 'unit',
        'total_price': 'totalPrice',
    }) or [{
        'description': 'SUPPLY, INSTALLATION AND COMMISSIONING OF SOLAR PV SYSTEM',
        'unit': '1 lot',
        'total_price': safe_text(getattr(quotation, 'total_amount', '') or project_detail(ticket, 'total_amount')),
    }]

    context.update({
        'quotation_number': draft.get('quotationNumber') or f'QUO-{ticket.id:04d}',
        'quotation_date': format_date(draft.get('quotationDate') or ticket.scheduled_date),
        'attention': draft.get('attention') or context['client_name'],
        'subject': draft.get('subject') or f"{context['service_type'] or 'Solar PV System'} Proposal",
        'location': draft.get('location') or context['location_address'],
        'validity': draft.get('validity') or f"{getattr(quotation, 'validity_days', 30)} days",
        'delivery_timeline': draft.get('deliveryTimeline') or '',
        'payment_terms': draft.get('paymentTerms') or safe_text(getattr(quotation, 'payment_terms', '')),
        'force_majeure': draft.get('forceMajeure') or '',
        'cancellation_terms': draft.get('cancellationTerms') or '',
        'inclusions': draft.get('inclusions') or '',
        'exclusions': draft.get('exclusions') or '',
        'prepared_by': draft.get('preparedBy') or context['prepared_by'],
        'prepared_title': draft.get('preparedTitle') or context['prepared_title'],
        'company_signer': draft.get('preparedBy') or context['prepared_by'],
        'brand_rows': normalize_rows(draft.get('brandRows') or [], {'label': 'label', 'value': 'value'}),
        'price_rows': price_rows,
        'bom_rows': normalize_rows(draft.get('bomRows') or getattr(quotation, 'bill_of_materials', []) or project_detail(ticket, 'bill_of_materials'), {
            'item_no': 'itemNo',
            'description': 'description',
            'unit': 'unit',
            'qty': 'qty',
            'unit_price': 'unitPrice',
            'amount': 'amount',
        }),
        'warranty_rows': normalize_rows(draft.get('warrantyRows') or [], {'item': 'item', 'brand': 'brand', 'period': 'period'}),
    })
    return context


def build_installation_contract_context(ticket):
    context = build_common_context(ticket)
    draft = get_generated_document_data(ticket, 'installation_contract')
    contract = getattr(ticket, 'installation_contract', None)
    quotation = QuotationRecord.objects.filter(ticket=ticket).first()

    context.update({
        'contract_date': format_date(draft.get('contractDate') or getattr(contract, 'start_date', None) or ticket.scheduled_date),
        'client_name': draft.get('clientName') or context['client_name'],
        'client_address': draft.get('clientAddress') or context['client_address'],
        'property_address': draft.get('propertyAddress') or context['location_address'],
        'scope_of_work': draft.get('scopeNotes') or safe_text(getattr(contract, 'scope_of_work', '')),
        'system_description': draft.get('systemDescription') or context['service_type'],
        'start_date': format_date(draft.get('startDate') or getattr(contract, 'start_date', None)),
        'estimated_completion_time': draft.get('estimatedCompletionTime') or safe_text(getattr(contract, 'estimated_completion_days', '')),
        'total_contract_amount': draft.get('totalContractAmount') or safe_text(getattr(contract, 'total_contract_amount', '') or getattr(quotation, 'total_amount', '')),
        'upfront_payment': draft.get('upfrontPayment') or safe_text(getattr(contract, 'payment_terms_upfront', '') or getattr(quotation, 'downpayment_amount', '')),
        'completion_payment': draft.get('completionPayment') or safe_text(getattr(contract, 'payment_terms_completion', '')),
        'final_payment': draft.get('finalPayment') or safe_text(getattr(contract, 'payment_terms_final', '') or getattr(quotation, 'balance_amount', '')),
        'final_inspection_days': draft.get('finalInspectionDays') or '',
        'currency': draft.get('currency') or context['currency'],
        'payment_method': draft.get('paymentMethod') or context['payment_method'],
        'warranty_period': draft.get('warrantyPeriod') or safe_text(getattr(contract, 'warranty_period', '')),
        'termination_notice_period': draft.get('terminationNoticePeriod') or context['termination_notice_period'],
        'governing_law_jurisdiction': draft.get('governingLawJurisdiction') or context['governing_law_jurisdiction'],
        'mediation_organization': draft.get('mediationOrganization') or '',
        'company_name': draft.get('companyName') or context['company_name'],
        'company_signer_name': draft.get('authorizedPerson') or context['prepared_by'],
        'company_signer_title': draft.get('authorizedTitle') or context['prepared_title'],
        'client_signer_name': draft.get('clientRepresentative') or context['client_name'],
        'client_signer_title': draft.get('clientRepresentativeTitle') or '',
        'quotation_reference': draft.get('quotationReference') or f'Appendix A / Quotation #{ticket.id:04d}',
    })
    return context


def build_tds_context(ticket):
    context = build_common_context(ticket)
    draft = get_generated_document_data(ticket, 'technical_data_sheet')
    tds = getattr(ticket, 'technical_data_sheet', None)

    generator_details = getattr(tds, 'generator_details_json', {}) or {}
    attachments = getattr(tds, 'attachments_json', {}) or {}
    purpose_value = draft.get('purposeRows') or getattr(tds, 'purpose_of_going_solar', []) or []
    if isinstance(purpose_value, str):
        purpose_rows = [{'label': purpose_value, 'mark': 'X'}]
    else:
        purpose_rows = normalize_rows(purpose_value, {'label': 'label', 'mark': 'mark'})

    context.update({
        'last_name': draft.get('lastName') or context['client_last_name'],
        'first_name': draft.get('firstName') or context['client_first_name'],
        'middle_name': draft.get('middleName') or context['client_middle_name'],
        'landline': draft.get('contactLandline') or context['client_landline'],
        'mobile_number': draft.get('mobileNumber') or context['client_contact_number'],
        'email_address': draft.get('emailAddress') or context['client_email'],
        'premise_type': draft.get('sitePremisePlan') or getattr(tds, 'premise_type', ''),
        'premise_category': draft.get('sitePremiseCategory') or getattr(tds, 'premise_category', ''),
        'ownership_type': draft.get('ownershipStatus') or getattr(tds, 'ownership_type', ''),
        'private_or_government_type': draft.get('privateOrGovernmentType') or getattr(tds, 'private_or_government_type', ''),
        'complete_address': draft.get('completeAddress') or context['location_address'],
        'primary_electric_supply': draft.get('primaryElectricSupply') or getattr(tds, 'primary_electric_supply', ''),
        'ac_phase_power_supply': draft.get('acSupplyType') or getattr(tds, 'ac_phase_power_supply', ''),
        'solar_panel_installation_location': draft.get('solarInstallLocation') or getattr(tds, 'solar_panel_installation_location', ''),
        'rooftop_type': draft.get('rooftopType') or getattr(tds, 'rooftop_type', ''),
        'average_monthly_electric_bill': draft.get('averageMonthlyBill') or getattr(tds, 'average_monthly_electric_bill', ''),
        'electricity_required_hours_per_day': draft.get('electricityHoursPerDay') or getattr(tds, 'electricity_required_hours_per_day', ''),
        'frequent_brownouts': draft.get('frequentBrownouts') or '',
        'brownout_frequency': draft.get('brownoutFrequencyPerWeek') or getattr(tds, 'brownout_frequency', ''),
        'battery_preference': draft.get('batteryPreference') or getattr(tds, 'battery_preference', ''),
        'load_schedule_rows': normalize_rows(draft.get('loadRows') or getattr(tds, 'load_schedule_json', []), {
            'appliance': 'appliance',
            'quantity': 'quantity',
            'inverter_type': 'inverterType',
            'wattage': 'wattage',
            'usage_day': 'usageDay',
            'usage_night': 'usageNight',
            'remarks': 'remarks',
        }),
        'generator_rows': [{
            'generator_brand_name': draft.get('generatorBrandName') or generator_details.get('brand_name', ''),
            'generator_capacity': draft.get('generatorCapacity') or generator_details.get('capacity', ''),
            'generator_fuel_type': draft.get('generatorFuelType') or generator_details.get('fuel_type', ''),
            'generator_date_purchased': draft.get('generatorDatePurchased') or generator_details.get('date_purchased', ''),
        }],
        'purpose_rows': purpose_rows,
        'attach_electric_bill': draft.get('attachElectricBill') or attachments.get('electric_bill', ''),
        'attach_site_photo': draft.get('attachSitePhoto') or attachments.get('site_photo', ''),
        'client_confirmation_name': draft.get('clientConfirmationName') or getattr(tds, 'client_confirmed_name', ''),
        'confirmation_date': format_date(draft.get('confirmationDate') or getattr(tds, 'client_confirmation_date', None)),
    })
    return context


def build_commissioning_context(ticket):
    context = build_common_context(ticket)
    draft = get_generated_document_data(ticket, 'commissioning_checklist')
    checklist = getattr(ticket, 'solar_commissioning_checklist', None)
    items = draft.get('checklist_items_json') or getattr(checklist, 'checklist_items_json', []) or []
    readings = draft.get('readings_json') or getattr(checklist, 'readings_json', {}) or {}
    inverter_display = readings.get('inverter_display', {})
    field_measured = readings.get('field_measured', {})

    context.update({
        'site_name': draft.get('site_name') or getattr(checklist, 'site_name', '') or context['location_address'],
        'inverter_type': draft.get('inverter_type') or getattr(checklist, 'inverter_type', ''),
        'system_designation': draft.get('system_designation') or getattr(checklist, 'system_designation', ''),
        'inverter_serial_number': draft.get('inverter_serial_number') or getattr(checklist, 'inverter_serial_number', ''),
        'commissioned_date': format_date(draft.get('commissioned_date') or getattr(checklist, 'commissioned_date', None)),
        'irradiance': draft.get('irradiance') or getattr(checklist, 'irradiance', ''),
        'ambient_temperature': draft.get('ambient_temperature') or getattr(checklist, 'ambient_temperature', ''),
        'checklist_rows': normalize_rows(items, {
            'item_no': 'item_no',
            'section': 'section',
            'description': 'description',
            'check_status': 'check_status',
            'remarks': 'remarks',
        }),
        'reading_rows': [
            {'label': 'AC Line Voltage Phase A to Ground', 'inverter_display': inverter_display.get('phase_a_voltage', ''), 'field_measured': field_measured.get('phase_a_voltage', '')},
            {'label': 'AC Line Voltage Phase B to Ground', 'inverter_display': inverter_display.get('phase_b_voltage', ''), 'field_measured': field_measured.get('phase_b_voltage', '')},
            {'label': 'AC Line Voltage Phase C to Ground', 'inverter_display': inverter_display.get('phase_c_voltage', ''), 'field_measured': field_measured.get('phase_c_voltage', '')},
            {'label': 'AC Line Current Phase A', 'inverter_display': inverter_display.get('phase_a_current', ''), 'field_measured': field_measured.get('phase_a_current', '')},
            {'label': 'AC Line Current Phase B', 'inverter_display': inverter_display.get('phase_b_current', ''), 'field_measured': field_measured.get('phase_b_current', '')},
            {'label': 'AC Line Current Phase C', 'inverter_display': inverter_display.get('phase_c_current', ''), 'field_measured': field_measured.get('phase_c_current', '')},
        ],
    })
    return context


def build_turnover_context(ticket):
    context = build_common_context(ticket)
    draft = get_generated_document_data(ticket, 'turnover_acceptance')
    turnover = getattr(ticket, 'turnover_acceptance', None)

    context.update({
        'system_capacity_kwp': draft.get('systemCapacity') or project_detail(ticket, 'system_capacity_kwp', 'system_capacity'),
        'project_installation_of': draft.get('projectInstallationOf') or context['service_type'],
        'location_address': draft.get('locationAddress') or context['location_address'],
        'date_of_completion': format_date(draft.get('dateOfCompletion') or ticket.completed_date or ticket.scheduled_date),
        'date_of_turnover': format_date(draft.get('dateOfTurnover') or getattr(turnover, 'turnover_date', None)),
        'client_name': draft.get('clientName') or getattr(turnover, 'accepted_by_client_name', '') or context['client_name'],
        'client_contact_person': draft.get('clientContactPerson') or getattr(turnover, 'accepted_by_client_name', '') or context['client_name'],
        'client_contact_number': draft.get('clientContactNumber') or getattr(turnover, 'accepted_by_client_contact', '') or context['client_contact_number'],
        'system_capacity': draft.get('systemCapacity') or project_detail(ticket, 'system_capacity_kwp', 'system_capacity'),
        'component_rows': normalize_rows(draft.get('componentsRows') or [], {'label': 'label', 'value_a': 'valueA', 'value_b': 'valueB'}),
        'performance_rows': normalize_rows(draft.get('performanceRows') or [], {'label': 'label', 'daily': 'daily', 'monthly': 'monthly', 'annual': 'annual'}),
        'commissioning_rows': normalize_rows(draft.get('commissioningRows') or [], {'label': 'label', 'date_conducted': 'dateConducted', 'values': 'values', 'results': 'results'}),
        'documentation_rows': normalize_rows(draft.get('documentsRows') or [], {'label': 'label', 'status': 'status', 'date': 'date'}),
        'warranty_on_inverters': draft.get('warrantyOnInverters') or '',
        'system_warranty': draft.get('systemWarranty') or '',
        'installer_partner': draft.get('installerPartner') or context['company_name'],
        'installer_contact_person': draft.get('installerContactPerson') or context['technician_name'],
        'installer_contact_number': draft.get('installerContactNumber') or context['company_contact'],
        'installer_date': format_date(draft.get('installerDate') or ticket.completed_date or ticket.scheduled_date),
        'client_signature_date': format_date(draft.get('clientSignatureDate') or getattr(turnover, 'turnover_date', None)),
        'final_confirmation_statement': draft.get('confirmationSystemName') or '',
    })
    return context


def build_context(ticket, document_type, *, report_id=None):
    if document_type == 'field_service_report':
        return build_field_service_report_context(ticket, report_id=report_id)
    if document_type == 'quotation_proposal':
        return build_quotation_context(ticket)
    if document_type == 'installation_contract':
        return build_installation_contract_context(ticket)
    if document_type == 'technical_data_sheet':
        return build_tds_context(ticket)
    if document_type == 'commissioning_checklist':
        return build_commissioning_context(ticket)
    if document_type == 'turnover_acceptance':
        return build_turnover_context(ticket)
    raise ValueError(f'Unsupported document type: {document_type}')


def render_docx_template(document_type, context, *, output_path):
    ensure_template_files()
    template_path = resolve_template_path(document_type)
    if not template_path.exists():
        raise FileNotFoundError(f'Missing document template: {template_path}')

    rendered_entries = {}
    with ZipFile(template_path, 'r') as template_archive:
        for entry in template_archive.infolist():
            content = template_archive.read(entry.filename)
            is_renderable_xml = (
                entry.filename in RENDERABLE_XML_PARTS
                or re.fullmatch(r'word/header\d+\.xml', entry.filename)
                or re.fullmatch(r'word/footer\d+\.xml', entry.filename)
            )
            if is_renderable_xml:
                content = render_text(content.decode('utf-8'), context).encode('utf-8')
            rendered_entries[entry.filename] = content

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(output_path, 'w', compression=ZIP_DEFLATED) as output_archive:
        for filename, content in rendered_entries.items():
            output_archive.writestr(filename, content)


def generate_document(ticket, document_type, *, report_id=None):
    canonical_type = canonical_document_type(document_type)
    if canonical_type not in TEMPLATE_FILENAMES:
        raise ValueError(f'Unsupported document type: {document_type}')

    context = build_context(ticket, canonical_type, report_id=report_id)
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    output_name = f'{canonical_type}_{ticket_number(ticket)}_{timezone.now().strftime("%Y%m%d%H%M%S")}.docx'
    output_path = GENERATED_DIR / output_name
    render_docx_template(canonical_type, context, output_path=output_path)
    return output_path
