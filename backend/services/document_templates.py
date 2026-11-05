"""Bounded validation and placeholder discovery for uploaded DOCX templates."""

import hashlib
import io
import posixpath
import re
from zipfile import BadZipFile, ZipFile

from pypdf import PdfReader
from pypdf.errors import PdfReadError
from rest_framework.exceptions import ValidationError

DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
PDF_MIME = 'application/pdf'
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_ARCHIVE_ENTRIES = 250
MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024
MAX_PART_BYTES = 10 * 1024 * 1024
TOKEN_RE = re.compile(r'\{\{\s*([#/])?\s*([A-Za-z0-9_.]+)\s*\}\}')
ANY_TOKEN_RE = re.compile(r'\{\{.*?\}\}', re.DOTALL)
RENDERABLE_PART_RE = re.compile(r'^word/(document|header\d+|footer\d+)\.xml$')

COMMON = {
    'ticket_number', 'client_name', 'client_address', 'client_contact_number',
    'client_email', 'service_type', 'technician_name', 'location_address',
    'company_name', 'company_address', 'company_contact', 'prepared_by',
    'prepared_title', 'currency', 'payment_method',
}
PLACEHOLDER_REGISTRY = {
    'field_service_report': COMMON | {'service_date', 'before_service_readings', 'after_service_readings', 'service_rows', 'brand_model', 'tr_hp', 'serial_number', 'indoor_temp', 'outdoor_temp', 'ampere', 'others_specify', 'recommendation', 'in_reading', 'out_reading'},
    'quotation_proposal': COMMON | {'quotation_number', 'quotation_date', 'attention', 'subject', 'location', 'validity', 'delivery_timeline', 'payment_terms', 'force_majeure', 'cancellation_terms', 'inclusions', 'exclusions', 'company_signer', 'brand_rows', 'price_rows', 'bom_rows', 'warranty_rows', 'label', 'value', 'description', 'unit', 'total_price', 'item_no', 'qty', 'unit_price', 'amount', 'item', 'brand', 'period'},
    'installation_contract': COMMON | {'contract_date', 'property_address', 'scope_of_work', 'system_description', 'start_date', 'estimated_completion_time', 'total_contract_amount', 'upfront_payment', 'completion_payment', 'final_payment', 'final_inspection_days', 'warranty_period', 'termination_notice_period', 'governing_law_jurisdiction', 'mediation_organization', 'company_signer_name', 'company_signer_title', 'client_signer_name', 'client_signer_title', 'quotation_reference'},
    'technical_data_sheet': COMMON | {'last_name', 'first_name', 'middle_name', 'landline', 'mobile_number', 'email_address', 'premise_type', 'premise_category', 'ownership_type', 'private_or_government_type', 'complete_address', 'primary_electric_supply', 'ac_phase_power_supply', 'solar_panel_installation_location', 'rooftop_type', 'average_monthly_electric_bill', 'electricity_required_hours_per_day', 'frequent_brownouts', 'brownout_frequency', 'battery_preference', 'load_schedule_rows', 'generator_rows', 'purpose_rows', 'attach_electric_bill', 'attach_site_photo', 'client_confirmation_name', 'confirmation_date', 'appliance', 'quantity', 'inverter_type', 'wattage', 'usage_day', 'usage_night', 'remarks', 'generator_brand_name', 'generator_capacity', 'generator_fuel_type', 'generator_date_purchased', 'label', 'mark'},
    'commissioning_checklist': COMMON | {'site_name', 'inverter_type', 'system_designation', 'inverter_serial_number', 'commissioned_date', 'irradiance', 'ambient_temperature', 'checklist_rows', 'reading_rows', 'item_no', 'section', 'description', 'check_status', 'remarks', 'label', 'inverter_display', 'field_measured'},
    'turnover_acceptance': COMMON | {'system_capacity_kwp', 'project_installation_of', 'date_of_completion', 'date_of_turnover', 'client_contact_person', 'system_capacity', 'component_rows', 'performance_rows', 'commissioning_rows', 'documentation_rows', 'warranty_on_inverters', 'system_warranty', 'installer_partner', 'installer_contact_person', 'installer_contact_number', 'installer_date', 'client_signature_date', 'final_confirmation_statement', 'label', 'value_a', 'value_b', 'daily', 'monthly', 'annual', 'date_conducted', 'values', 'results', 'status', 'date'},
}

CUSTOM_SOURCE_REGISTRY = {
    'ticket': COMMON | {'service_date', 'location_city', 'location_province'},
    'client': {
        'client_name', 'client_first_name', 'client_middle_name', 'client_last_name',
        'client_address', 'client_contact_number', 'client_landline', 'client_email',
        'client_company_name', 'company_name', 'company_address', 'company_contact',
        'prepared_by', 'prepared_title',
    },
    'project': COMMON | {
        'project_id', 'system_capacity', 'panel_brand', 'number_of_panels',
        'inverter_brand', 'number_of_inverters', 'battery_brand',
        'mounting_structure', 'location_city', 'location_province',
    },
}

COLLECTION_PLACEHOLDERS = {
    'service_rows', 'brand_rows', 'price_rows', 'bom_rows', 'warranty_rows',
    'load_schedule_rows', 'generator_rows', 'purpose_rows', 'checklist_rows',
    'reading_rows', 'component_rows', 'performance_rows', 'commissioning_rows',
    'documentation_rows', 'before_service_readings', 'after_service_readings',
}
DATE_PLACEHOLDERS = {
    'service_date', 'quotation_date', 'contract_date', 'start_date',
    'commissioned_date', 'date_of_completion', 'date_of_turnover',
    'installer_date', 'client_signature_date', 'confirmation_date',
    'generator_date_purchased', 'date_conducted', 'date',
}
CURRENCY_PLACEHOLDERS = {
    'quotation_total', 'deposit_required', 'total_price', 'unit_price', 'amount',
    'total_contract_amount', 'upfront_payment', 'completion_payment',
    'final_payment', 'average_monthly_electric_bill',
}
NUMBER_PLACEHOLDERS = {
    'qty', 'quantity', 'wattage', 'usage_day', 'usage_night', 'item_no',
    'system_capacity_kwp', 'system_capacity', 'number_of_panels',
    'number_of_inverters', 'irradiance', 'ambient_temperature',
}

# Core templates need these data connections before first publication. Scalar
# connections are enforceable for DOCX and PDF. Repeating regions are enforced
# for DOCX, where balanced markers are part of the rendering contract; a fixed
# PDF can contain a visually authored table that cannot be inferred safely.
REQUIRED_ACTIVATION_COMPONENTS = {
    'field_service_report': {
        'all': {'ticket_number', 'client_name', 'service_type'},
        'docx': {'service_rows'},
    },
    'quotation_proposal': {
        'all': {'client_name'},
        'docx': {'price_rows', 'bom_rows'},
    },
    'installation_contract': {
        'all': {'client_name', 'scope_of_work', 'total_contract_amount'},
        'docx': set(),
    },
    'technical_data_sheet': {
        'all': {'client_name'},
        'docx': {'load_schedule_rows'},
    },
    'commissioning_checklist': {
        'all': {'client_name'},
        'docx': {'checklist_rows'},
    },
    'turnover_acceptance': {
        'all': {'client_name', 'date_of_turnover'},
        'docx': {'component_rows'},
    },
}

REQUIRED_COMPONENT_ALIASES = {
    'quotation_proposal': {'client_name': {'client_name', 'attention'}},
    # AFN's own Technical Data Sheet asks for the client's name in separate last, first and middle name boxes.
    'technical_data_sheet': {'client_name': {'client_name', 'last_name', 'first_name'}},
    # AFN's own Commissioning Checklist identifies the job by its site (the service address), not by the client's name.
    'commissioning_checklist': {'client_name': {'client_name', 'site_name'}},
}

# ---- Plain-name fields -----------------------------------------------------------------------------------------
# Staff can write a field the way they would say it, e.g. "[Client Name]", instead of the technical "{{ client_name }}".
# A plain name is only treated as a field when it resolves to a field the document is allowed to use, so ordinary
# bracketed text such as "[1]" or "[Signature]" is left exactly as it was typed.
PLAIN_NAME_RE = re.compile(r"\[\s*([A-Za-z][A-Za-z0-9 '/&_-]{1,58}?)\s*\]")
# The same thing on raw Word XML: Word may split "[Client Name]" across several runs, so the span may contain tags,
# but it never crosses a paragraph.
RAW_PLAIN_NAME_RE = re.compile(r'\[(?:(?!</w:p>)(?:[^\[\]<]|<[^>]*>)){2,900}\]')
# Everyday wording that means one of the approved fields. Only used when the field is allowed for that document.
FRIENDLY_ALIASES = {
    'customer': ['client_name'], 'customer_name': ['client_name'], 'client': ['client_name'],
    'client_full_name': ['client_name'], 'full_name': ['client_name'], 'name_of_client': ['client_name'],
    'address': ['client_address', 'complete_address'], 'customer_address': ['client_address'],
    'contact_number': ['client_contact_number', 'mobile_number'], 'phone': ['client_contact_number', 'mobile_number'],
    'phone_number': ['client_contact_number', 'mobile_number'], 'mobile': ['client_contact_number', 'mobile_number'],
    'contact': ['client_contact_number'],
    'email': ['client_email', 'email_address'], 'customer_email': ['client_email'],
    'ticket': ['ticket_number'], 'ticket_no': ['ticket_number'], 'reference': ['ticket_number'],
    'reference_number': ['ticket_number'], 'reference_no': ['ticket_number'],
    'technician': ['technician_name'], 'assigned_technician': ['technician_name'], 'service_personnel': ['technician_name'],
    'service': ['service_type'], 'type_of_service': ['service_type'],
    'site_address': ['location_address', 'property_address', 'location'], 'service_location': ['location_address', 'location'],
    'project_location': ['location_address', 'location'], 'location': ['location_address', 'location'],
    'company': ['company_name'], 'company_phone': ['company_contact'],
    'date': ['service_date', 'quotation_date', 'contract_date', 'date_of_turnover', 'commissioned_date', 'confirmation_date'],
    'prepared_by_name': ['prepared_by'], 'position': ['prepared_title'], 'designation': ['prepared_title'],
    'total': ['total_contract_amount'], 'total_amount': ['total_contract_amount'], 'contract_amount': ['total_contract_amount'],
}
# Bracketed words that are normal text in a document and should not be offered as new fields.
NOT_FIELD_NAMES = {
    'optional', 'required', 'signature', 'sign_here', 'n_a', 'na', 'sic', 'tbd', 'tba', 'and', 'or',
    'citation_needed', 'insert_here', 'remove', 'delete', 'end',
}


def plain_key(name):
    """'Client Name' -> 'client_name' (the same key the technical placeholder would use)."""
    return re.sub(r'[^a-z0-9]+', '_', str(name).lower()).strip('_')


def resolve_plain_name(name, allowed):
    """The approved field key a plain name stands for, or None when it is not a known field."""
    key = plain_key(name)
    if key in allowed and key not in COLLECTION_PLACEHOLDERS:
        return key
    for candidate in FRIENDLY_ALIASES.get(key, ()):
        if candidate in allowed and candidate not in COLLECTION_PLACEHOLDERS:
            return candidate
    return None


def looks_like_field_name(name):
    key = plain_key(name)
    return len(key) >= 3 and key not in NOT_FIELD_NAMES and len(str(name).split()) <= 6


def convert_plain_names(xml, allowed):
    """Rewrite known "[Client Name]" text in Word XML as the matching {{client_name}} placeholder.

    Returns (xml, {plain name: field key}). Unknown names are left untouched.
    """
    found = {}

    def replace(match):
        raw = match.group(0)
        inner = PLAIN_NAME_RE.fullmatch(re.sub(r'<[^>]+>', '', raw))
        if not inner:
            return raw
        key = resolve_plain_name(inner.group(1), allowed)
        if not key:
            return raw
        found[inner.group(1).strip()] = key
        return '{{' + key + '}}'

    return RAW_PLAIN_NAME_RE.sub(replace, xml), found


def required_activation_components(document_code, file_format):
    requirements = REQUIRED_ACTIVATION_COMPONENTS.get(document_code, {})
    required = set(requirements.get('all', set()))
    if file_format == 'docx':
        required.update(requirements.get('docx', set()))
    return sorted(required)


def missing_required_activation_components(version):
    definition = version.template.definition
    if definition.category != 'core':
        return []
    required = set(required_activation_components(definition.code, version.file_format))
    if version.file_format == 'docx':
        placeholders = {
            str(key).split('.')[0]
            for key in (version.placeholder_manifest or {}).get('placeholders', [])
        }
        loops = set((version.placeholder_manifest or {}).get('loops', []))
        mapped = {
            key for key in placeholders
            if key not in COLLECTION_PLACEHOLDERS or key in loops
        }
    else:
        mapped = {
            field.source_key
            for field in version.fillable_fields.all()
            if field.is_active and field.fill_method == 'system' and field.source_key
        }
    aliases = REQUIRED_COMPONENT_ALIASES.get(definition.code, {})
    return sorted(
        key for key in required
        if not mapped.intersection(aliases.get(key, {key}))
    )


def _placeholder_value_type(key):
    if key in COLLECTION_PLACEHOLDERS:
        return 'collection'
    if key in DATE_PLACEHOLDERS:
        return 'date'
    if key in CURRENCY_PLACEHOLDERS:
        return 'currency'
    if key in NUMBER_PLACEHOLDERS:
        return 'number'
    return 'text'


def _placeholder_formatting(key):
    value_type = _placeholder_value_type(key)
    return {
        'collection': 'Use as a balanced repeating section with {{#key}} and {{/key}} markers.',
        'date': 'Rendered as the approved display date from the canonical context.',
        'currency': 'Rendered from the canonical financial record; templates must not recalculate it.',
        'number': 'Rendered as a canonical or approved numeric display value.',
        'text': 'Rendered as escaped plain text while preserving the surrounding Word formatting.',
    }[value_type].replace('key', key)


def placeholder_catalog_details(document):
    if hasattr(document, 'code'):
        definition = document
    else:
        from services.models import DocumentDefinition
        definition = DocumentDefinition.objects.filter(code=document).first()
    code = definition.code if definition else str(document)
    custom_fields = {}
    if definition and definition.category == 'custom':
        custom_fields = {field.field_key: field for field in definition.field_definitions.filter(is_active=True)}

    details = []
    for key in placeholder_catalog(definition or document):
        custom_field = custom_fields.get(key)
        if custom_field:
            value_type = custom_field.field_type
            details.append({
                'key': key,
                'label': custom_field.label,
                'description': f'Administrator-defined value stored separately for {definition.name}.',
                'source_field': f'custom_field_values.{key}',
                'value_type': value_type,
                'formatting_rules': 'Validated against the registered custom-field type before rendering.',
                'applicable_document_types': [code],
                'is_required': custom_field.is_required,
                'is_collection': False,
            })
            continue
        applicable = (
            [code]
            if definition and definition.category == 'custom'
            else sorted(document_code for document_code, keys in PLACEHOLDER_REGISTRY.items() if key in keys)
        )
        value_type = _placeholder_value_type(key)
        label = key.replace('_', ' ').title()
        details.append({
            'key': key,
            'label': label,
            'description': f'Approved {label.lower()} value supplied by the AFN document context.',
            'source_field': f'canonical_document_context.{key}',
            'value_type': value_type,
            'formatting_rules': _placeholder_formatting(key),
            'applicable_document_types': applicable,
            'is_required': False,
            'is_collection': key in COLLECTION_PLACEHOLDERS,
        })
    return details


def placeholder_catalog(document):
    if hasattr(document, 'code'):
        definition = document
    else:
        from services.models import DocumentDefinition
        definition = DocumentDefinition.objects.filter(code=document).first()
    if definition and definition.category == 'custom':
        fields = definition.field_definitions.filter(is_active=True).values_list('field_key', flat=True)
        return sorted(set(CUSTOM_SOURCE_REGISTRY.get(definition.data_source, set())) | set(fields))
    code = definition.code if definition else document
    return sorted(PLACEHOLDER_REGISTRY.get(code, COMMON))


def _normalized_xml(xml):
    # Word may split a visible token across text runs. Remove markup only while
    # discovering tokens; the original archive remains untouched.
    return re.sub(r'<(?!\!--)[^>]+>', '', xml)


def validate_docx(upload, document):
    name = getattr(upload, 'name', '') or ''
    if not name.lower().endswith('.docx'):
        raise ValidationError({'file': 'Only macro-free .docx files are accepted.'})
    content_type = (getattr(upload, 'content_type', '') or '').lower()
    if content_type not in {'', DOCX_MIME, 'application/octet-stream', 'application/zip'}:
        raise ValidationError({'file': 'The uploaded MIME type is not a DOCX document.'})
    data = upload.read()
    upload.seek(0)
    if not data or len(data) > MAX_UPLOAD_BYTES:
        raise ValidationError({'file': f'DOCX must be between 1 byte and {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.'})

    try:
        archive = ZipFile(io.BytesIO(data))
    except BadZipFile as exc:
        raise ValidationError({'file': 'The uploaded file is not a valid DOCX archive.'}) from exc

    with archive:
        entries = archive.infolist()
        names = {entry.filename for entry in entries}
        if len(entries) > MAX_ARCHIVE_ENTRIES:
            raise ValidationError({'file': 'DOCX contains too many archive entries.'})
        if '[Content_Types].xml' not in names or 'word/document.xml' not in names:
            raise ValidationError({'file': 'DOCX is missing required Word document parts.'})
        total = 0
        for entry in entries:
            raw_name = entry.filename.replace('\\', '/')
            comparable_name = raw_name.rstrip('/')
            normalized = posixpath.normpath(comparable_name)
            if normalized.startswith('../') or normalized.startswith('/') or normalized != comparable_name:
                raise ValidationError({'file': 'DOCX contains an unsafe archive path.'})
            if entry.flag_bits & 0x1:
                raise ValidationError({'file': 'Encrypted DOCX archive entries are not supported.'})
            total += entry.file_size
            if entry.file_size > MAX_PART_BYTES or total > MAX_UNCOMPRESSED_BYTES:
                raise ValidationError({'file': 'DOCX expands beyond the permitted safety limit.'})
            lower = entry.filename.lower()
            if 'vbaproject' in lower or lower.startswith('word/embeddings/'):
                raise ValidationError({'file': 'Macros and embedded OLE/package objects are not allowed.'})

        external_relationships = []
        for name_in_zip in names:
            if name_in_zip.endswith('.rels'):
                rel_text = archive.read(name_in_zip).decode('utf-8', errors='ignore')
                if re.search(r'TargetMode\s*=\s*["\']External["\']', rel_text, re.I):
                    external_relationships.append(name_in_zip)
        if external_relationships:
            raise ValidationError({'file': 'External links or relationships are not allowed in templates.'})

        tokens, loops, unsupported, parts, loop_errors = set(), set(), set(), [], []
        catalog = set(placeholder_catalog(document))
        plain_found, possible_fields = {}, set()
        blank_suggestions = []
        for name_in_zip in sorted(names):
            if not RENDERABLE_PART_RE.match(name_in_zip):
                continue
            parts.append(name_in_zip)
            raw_xml = archive.read(name_in_zip).decode('utf-8', errors='strict')
            if name_in_zip == 'word/document.xml':
                from services.blank_suggestions import find_blank_suggestions
                blank_suggestions = find_blank_suggestions(raw_xml, catalog)
            text = _normalized_xml(raw_xml)
            matched_spans = set()
            loop_stack = []
            for match in TOKEN_RE.finditer(text):
                matched_spans.add(match.span())
                tokens.add(match.group(2))
                marker, key = match.group(1), match.group(2)
                if marker == '#':
                    loops.add(key)
                    loop_stack.append(key)
                elif marker == '/' and (not loop_stack or loop_stack.pop() != key):
                    loop_errors.append(f'Unbalanced loop marker: {key}')
            if loop_stack:
                loop_errors.extend(f'Unclosed loop marker: {key}' for key in loop_stack)
            for match in ANY_TOKEN_RE.finditer(text):
                if match.span() not in matched_spans:
                    unsupported.add(match.group(0)[:120])
            # Plain names such as "[Client Name]": known fields count as connected, other bracketed words that look
            # like fields are only suggested, never treated as an error.
            for match in PLAIN_NAME_RE.finditer(text):
                plain_name = match.group(1).strip()
                field_key = resolve_plain_name(plain_name, catalog)
                if field_key:
                    plain_found[plain_name] = field_key
                    tokens.add(field_key)
                elif looks_like_field_name(plain_name):
                    possible_fields.add(plain_name)

    allowed = set(placeholder_catalog(document))
    unknown = sorted(token for token in tokens if token.split('.')[0] not in allowed and token not in allowed)
    errors = []
    if unknown:
        errors.append({'code': 'unknown_placeholders', 'message': 'Template contains placeholders outside the approved registry.', 'items': unknown})
    if unsupported:
        errors.append({'code': 'unsupported_expressions', 'message': 'Only approved scalar and loop tokens are supported.', 'items': sorted(unsupported)})
    if loop_errors:
        errors.append({'code': 'invalid_loops', 'message': 'Repeating-section markers must be balanced and correctly nested.', 'items': loop_errors})
    warnings = []
    if possible_fields:
        warnings.append({
            'code': 'possible_fields',
            'message': 'These look like fields but are not connected to anything yet.',
            'items': sorted(possible_fields),
        })
    status = 'invalid' if errors else 'valid'
    return {
        'file_format': 'docx',
        'mime_type': DOCX_MIME,
        'sha256': hashlib.sha256(data).hexdigest(),
        'size': len(data),
        'manifest': {
            'placeholders': sorted(tokens), 'loops': sorted(loops), 'parts': parts,
            'plain_names': dict(sorted(plain_found.items())), 'possible_fields': sorted(possible_fields),
            'blank_suggestions': blank_suggestions,
        },
        'report': {'status': status, 'errors': errors, 'warnings': warnings},
        'status': status,
        'readiness': 'attention' if status == 'invalid' else ('ready_auto' if tokens else 'saved'),
    }


def _pdf_suggestions(data, document):
    if document is None:
        return []
    from services.pdf_suggestions import find_pdf_field_suggestions

    return find_pdf_field_suggestions(data, set(placeholder_catalog(document)))


def validate_pdf(upload, _document=None):
    """Validate and preserve a PDF source without claiming fill/render support.

    Phase 1 deliberately accepts ordinary PDFs as safely stored templates while
    keeping them in the user-facing Saved state. Field discovery, overlays, and
    completed-PDF generation are separate capabilities and must not be inferred
    from a structurally acceptable upload.
    """
    name = getattr(upload, 'name', '') or ''
    if not name.lower().endswith('.pdf'):
        raise ValidationError({'file': 'Upload a .docx or .pdf template.'})
    content_type = (getattr(upload, 'content_type', '') or '').lower()
    if content_type not in {'', PDF_MIME, 'application/octet-stream'}:
        raise ValidationError({'file': 'The uploaded MIME type is not a PDF document.'})
    data = upload.read()
    upload.seek(0)
    if not data or len(data) > MAX_UPLOAD_BYTES:
        raise ValidationError({'file': f'PDF must be between 1 byte and {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.'})
    if not data.startswith(b'%PDF-') or b'%%EOF' not in data[-2048:]:
        raise ValidationError({'file': 'The uploaded file is not a complete PDF document.'})

    # These constructs can execute actions, launch external content, or carry
    # embedded payloads. Reject them until a full PDF sanitizer is introduced.
    forbidden = {
        b'/Encrypt': 'Encrypted PDFs are not supported.',
        b'/JavaScript': 'PDF JavaScript is not allowed.',
        b'/JS': 'PDF JavaScript is not allowed.',
        b'/Launch': 'PDF launch actions are not allowed.',
        b'/EmbeddedFile': 'Embedded PDF files are not allowed.',
        b'/RichMedia': 'Rich media in PDFs is not allowed.',
    }
    for marker, message in forbidden.items():
        if re.search(re.escape(marker) + rb'(?=[\s/<\[\(])', data):
            raise ValidationError({'file': message})

    try:
        reader = PdfReader(io.BytesIO(data), strict=False)
        if reader.is_encrypted:
            raise ValidationError({'file': 'Encrypted PDFs are not supported.'})
        page_count = len(reader.pages)
        if page_count < 1 or page_count > 100:
            raise ValidationError({'file': 'PDF templates must contain between 1 and 100 pages.'})
        root = reader.trailer.get('/Root') or {}
        has_acroform = bool(root.get('/AcroForm'))
    except (PdfReadError, ValueError, TypeError) as exc:
        raise ValidationError({'file': 'The uploaded file is not a readable PDF document.'}) from exc
    warnings = [{
        'code': 'field_setup_required',
        'message': 'The original PDF is saved. Set up supported fields before using it as a fillable template.',
    }]
    return {
        'file_format': 'pdf',
        'mime_type': PDF_MIME,
        'sha256': hashlib.sha256(data).hexdigest(),
        'size': len(data),
        'manifest': {
            'page_count_hint': page_count or None,
            'has_acroform_hint': has_acroform,
            'field_suggestions': _pdf_suggestions(data, _document),
            'placeholders': [],
            'parts': [],
        },
        'report': {'status': 'valid', 'errors': [], 'warnings': warnings},
        'status': 'valid',
        'readiness': 'saved',
    }


def validate_template_upload(upload, document):
    suffix = (getattr(upload, 'name', '') or '').lower()
    if suffix.endswith('.docx'):
        return validate_docx(upload, document)
    if suffix.endswith('.pdf'):
        return validate_pdf(upload, document)
    raise ValidationError({'file': 'Upload a DOCX or PDF template.'})


MULTILINE_HINTS = ('note', 'notes', 'description', 'remark', 'remarks', 'summary', 'comment', 'comments', 'scope', 'details')


def revalidate_version(version):
    """Check a stored DOCX design again against today's approved and registered fields.

    The stored file is never changed; only its validation report, manifest, and readiness are refreshed. This is what
    lets a design that was uploaded before its custom fields existed become valid without uploading it again.
    """
    if version.file_format != 'docx':
        return version
    from django.core.files.uploadedfile import SimpleUploadedFile

    version.file.open('rb')
    try:
        data = version.file.read()
    finally:
        version.file.close()
    result = validate_template_upload(
        SimpleUploadedFile(version.original_filename, data, content_type=version.mime_type or DOCX_MIME),
        version.template.definition,
    )
    version.placeholder_manifest = result['manifest']
    version.validation_report = result['report']
    version.validation_status = result['status']
    version.readiness_status = result['readiness']
    version.save(update_fields=['placeholder_manifest', 'validation_report', 'validation_status', 'readiness_status'])
    return version


def register_suggested_fields(definition, names):
    """Register plain names found in a design (for example "Site Name") as text fields of a custom document.

    Returns the field keys that were created. Names that already exist are skipped. The caller decides which names
    are acceptable (only names the design really contains).
    """
    from services.models import DocumentFieldDefinition

    taken = set(definition.field_definitions.values_list('field_key', flat=True))
    reserved = set(CUSTOM_SOURCE_REGISTRY.get(definition.data_source, set())) | COLLECTION_PLACEHOLDERS
    order = (definition.field_definitions.order_by('-display_order').values_list('display_order', flat=True).first() or 0)
    created = []
    for name in names:
        label = str(name).strip()
        key = plain_key(label)
        if not key or len(key) > 64 or key in taken or key in reserved:
            continue
        order += 1
        field_type = 'date' if key.endswith('date') else 'multiline' if key in MULTILINE_HINTS else 'text'
        DocumentFieldDefinition.objects.create(
            definition=definition, field_key=key, label=label[:150], field_type=field_type, display_order=order,
        )
        taken.add(key)
        created.append(key)
    return created


# ---- Plain-language checklist ------------------------------------------------------------------------------------
REQUIRED_LABELS = {
    'client_name': 'Client name', 'ticket_number': 'Ticket number', 'service_type': 'Service type',
    'scope_of_work': 'Scope of work', 'total_contract_amount': 'Total contract amount', 'date_of_turnover': 'Turnover date',
    'service_rows': 'Equipment readings table', 'price_rows': 'Price table', 'bom_rows': 'Equipment and materials table',
    'load_schedule_rows': 'Load schedule table', 'checklist_rows': 'Commissioning checklist table',
    'component_rows': 'System components table',
}
ERROR_WORDING = {
    'unknown_placeholders': ('Some field names are not recognised', 'Use a name from the field list, or write it in plain words, for example [Client Name].'),
    'unsupported_expressions': ('Some field markers are not supported', 'Only simple fields and repeating tables are supported. Start from AFN\'s design to keep them correct.'),
    'invalid_loops': ('A repeating table is not set up correctly', 'Each repeating table needs both its start and its end marker. Start from AFN\'s design to keep them.'),
}


def _field_label(key):
    return REQUIRED_LABELS.get(key) or str(key).replace('_', ' ').capitalize()


def build_design_checklist(version):
    """What a person needs to know about a design, in plain words.

    Each item is {status: ok | problem | note, label, detail, hint}. A "problem" blocks use of the design; a "note"
    is only worth reading. The same facts drive the activation rules, so the list never promises more than the server
    will accept.
    """
    definition = version.template.definition
    report = version.validation_report or {}
    manifest = version.placeholder_manifest or {}
    items = []
    for error in report.get('errors', []):
        label, hint = ERROR_WORDING.get(error.get('code'), (error.get('message') or 'This file has a problem', ''))
        items.append({'status': 'problem', 'label': label, 'detail': ', '.join(str(i) for i in error.get('items', [])), 'hint': hint})

    if definition.category == 'core':
        required = required_activation_components(definition.code, version.file_format)
        missing = set(missing_required_activation_components(version))
        for key in required:
            label = _field_label(key)
            is_table = key.endswith('_rows')
            if key in missing:
                if version.file_format == 'pdf':
                    hint = f'Click on the PDF where {label.lower()} should appear.'
                elif is_table:
                    hint = f'Keep the {label.lower()} from AFN\'s design. Download the current design, change its look in Word, and leave this table in place.'
                else:
                    hint = f'Type [{label}] in the design where it should appear.'
                items.append({'status': 'problem', 'label': f'{label}: not found', 'detail': '', 'hint': hint})
            else:
                items.append({'status': 'ok', 'label': f'{label}: found', 'detail': '', 'hint': ''})
        possible = manifest.get('possible_fields') or []
        if possible:
            items.append({
                'status': 'note', 'label': 'Words in brackets that AFN does not fill',
                'detail': ', '.join(possible),
                'hint': 'They will print exactly as typed. If one should be filled, use a name from the field list.',
            })
    elif version.file_format == 'docx':
        plain = manifest.get('plain_names') or {}
        used = sorted({*manifest.get('placeholders', [])})
        if used:
            items.append({'status': 'ok', 'label': f'{len(used)} field(s) found', 'detail': ', '.join(sorted(plain) or used), 'hint': ''})
        else:
            items.append({'status': 'note', 'label': 'No fields found', 'detail': '', 'hint': 'The document will print exactly as designed. Type a field such as [Client Name] where information should be filled in.'})
        possible = manifest.get('possible_fields') or []
        if possible:
            items.append({
                'status': 'note', 'label': 'New fields to add', 'detail': ', '.join(possible),
                'hint': 'These look like fields. Choose "Add as fields" to make them fill-in boxes, or leave them to print exactly as typed.',
                'action': 'add_fields', 'names': list(possible),
            })
    elif version.file_format == 'pdf':
        count = version.fillable_fields.filter(is_active=True).count()
        items.append({
            'status': 'ok' if count else 'problem',
            'label': f'{count} field(s) placed on the PDF' if count else 'No fields placed on the PDF yet',
            'detail': '', 'hint': '' if count else 'Click on the PDF where each piece of information should appear.',
        })
    blanks = manifest.get('blank_suggestions') or []
    if version.file_format == 'docx' and blanks and version.publication_status == 'draft':
        items.append({
            'status': 'note', 'label': 'Blanks that can become fields',
            'detail': ', '.join(item['label'] for item in blanks),
            'hint': 'These lines look like "Name: ______". Choose "Fill these blanks" to turn them into fields. Your uploaded file is kept, and the result is saved as a new version.',
            'action': 'fill_blanks', 'names': [item['label'] for item in blanks],
        })
    offers = []
    if version.file_format == 'pdf' and manifest.get('field_suggestions'):
        placed = set(version.fillable_fields.filter(is_active=True).values_list('field_key', flat=True))
        offers = [item for item in manifest['field_suggestions'] if item['key'] not in placed]
    if version.file_format == 'pdf' and offers and version.publication_status == 'draft':
        items.append({
            'status': 'note', 'label': 'Fields AFN can place for you',
            'detail': ', '.join(item['label'] for item in offers),
            'hint': 'AFN found these labels on the PDF. Choose "Place these fields" to put a box after each one, then check the positions in Set up fields. Boxes are estimates and can be moved.',
            'action': 'place_fields', 'names': [item['label'] for item in offers],
        })
    return items


# ---- Starter file and plain field list ---------------------------------------------------------------------------

def plain_field_list(definition):
    """The fields a design can use, written the way staff type them: [{'name': 'Client Name', 'marker': '[Client Name]', 'label', 'description', 'kind'}].

    Repeating tables are listed separately with `kind == 'table'`; they keep AFN's technical markers because a table needs a
    start and an end.
    """
    items = []
    for detail in placeholder_catalog_details(definition):
        key = detail['key']
        if detail.get('is_collection') or key in COLLECTION_PLACEHOLDERS:
            items.append({'key': key, 'name': key.replace('_', ' ').title(), 'marker': '{{#%s}} ... {{/%s}}' % (key, key), 'label': detail.get('label') or key, 'description': detail.get('description', ''), 'kind': 'table'})
        else:
            name = key.replace('_', ' ').title()
            items.append({'key': key, 'name': name, 'marker': '[%s]' % name, 'label': detail.get('label') or name, 'description': detail.get('description', ''), 'kind': 'field'})
    return items


def build_starter_docx(definition):
    """A blank Word design for a custom document: a title and one labelled line per field, ready to restyle.

    Every marker is written in plain-name form, so uploading the file unchanged gives a design that passes the check.
    """
    from docx import Document

    document = Document()
    document.add_heading(definition.name, level=1)
    document.add_paragraph('Restyle this page any way you like: fonts, logo, colours, layout. Keep each [Field Name] exactly as written wherever you want that information to appear. Delete the lines you do not need.')
    for item in plain_field_list(definition):
        if item['kind'] != 'field':
            continue
        paragraph = document.add_paragraph()
        paragraph.add_run('%s: ' % item['label']).bold = True
        paragraph.add_run(item['marker'])
    output = io.BytesIO()
    document.save(output)
    return output.getvalue()
