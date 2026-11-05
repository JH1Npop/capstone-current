"""Phase C generation adapter with active-template provenance and legacy fallback."""

import hashlib
import io
import re
from zipfile import ZIP_DEFLATED, ZipFile

from django.core.files.base import ContentFile
from django.utils import timezone

from services.document_generation import (
    RENDERABLE_XML_PARTS,
    TEMPLATE_FILENAMES,
    build_context,
    build_common_context,
    canonical_document_type,
    display_name,
    ensure_template_files,
    render_text,
    resolve_template_path,
    ticket_number,
)
from services.document_templates import convert_plain_names
from services.models import DocumentDefinition, DocumentInstance, DocumentOutput, DocumentTemplateVersion, GeneratedDocument

DOCX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'


def _join_split_tokens(xml):
    """Join placeholders Word split across runs while keeping surrounding DOCX XML."""
    pattern = re.compile(r'\{\{.*?\}\}', re.DOTALL)

    def replace(match):
        raw = match.group(0)
        visible = re.sub(r'<[^>]+>', '', raw)
        return visible if re.fullmatch(r'\{\{\s*[#/]?\s*[A-Za-z0-9_.]+\s*\}\}', visible) else raw

    return pattern.sub(replace, xml)


def _normalize_visible_loop_markers(xml):
    """Turn dedicated Word table-row/paragraph loop markers into renderer markers.

    Template authors can put ``{{#rows}}`` and ``{{/rows}}`` in otherwise empty
    table rows or paragraphs. Word wraps that text in XML, while ``render_text``
    intentionally consumes only comment-delimited sections. Normalizing just
    marker-only containers keeps the allowed syntax small and avoids evaluating
    arbitrary template expressions.
    """
    marker = re.compile(r'\s*\{\{\s*([#/])\s*([A-Za-z0-9_.]+)\s*\}\}\s*')

    def normalize_container(match):
        container = match.group(0)
        visible = re.sub(r'<[^>]+>', '', container)
        found = marker.fullmatch(visible)
        if not found:
            return container
        prefix, key = found.groups()
        return f'<!-- {{{{{prefix}{key}}}}} -->'

    # Rows must be handled before their nested paragraphs.
    for tag in ('tr', 'p'):
        container = re.compile(rf'<w:{tag}\b[^>]*>.*?</w:{tag}>', re.DOTALL)
        xml = container.sub(normalize_container, xml)
    return xml


def render_template_bytes(source, context):
    output = io.BytesIO()
    with ZipFile(source, 'r') as template_archive, ZipFile(output, 'w', compression=ZIP_DEFLATED) as rendered:
        for entry in template_archive.infolist():
            content = template_archive.read(entry.filename)
            if entry.filename in RENDERABLE_XML_PARTS or re.fullmatch(r'word/(header|footer)\d+\.xml', entry.filename):
                xml = _join_split_tokens(content.decode('utf-8'))
                # "[Client Name]" written in plain words is filled like "{{ client_name }}" (known fields only).
                xml, _plain_names = convert_plain_names(xml, set(context))
                xml = _normalize_visible_loop_markers(xml)
                content = render_text(xml, context).encode('utf-8')
            rendered.writestr(entry, content)
    return output.getvalue()


def active_template_version(document_type, template_id=None, file_format='docx'):
    queryset = (
        DocumentTemplateVersion.objects
        .select_related('template', 'template__definition')
        .filter(
            template__definition__code=document_type,
            template__definition__is_active=True,
            template__is_enabled=True,
            validation_status='valid',
            publication_status='active',
        )
    )
    if file_format:
        queryset = queryset.filter(file_format=file_format)
    if template_id is not None:
        queryset = queryset.filter(template_id=template_id)
    else:
        queryset = queryset.filter(template__is_default=True)
    return queryset.first()


def render_version_preview(version, ticket, *, report_id=None):
    if version.validation_status != 'valid':
        raise ValueError('Only a validated template version can be test rendered.')
    context = build_context(ticket, version.template.definition.code, report_id=report_id)
    if version.file_format == 'pdf':
        from services.pdf_document_generation import render_pdf_template, resolve_template_field_values
        resolved_values = resolve_template_field_values(version, {}, context)
        return render_pdf_template(version, resolved_values), {**context, 'configured_field_values': resolved_values}
    if version.file_format != 'docx':
        raise ValueError('Only DOCX and configured PDF template versions can be test rendered.')
    with version.file.open('rb') as source:
        return render_template_bytes(source, context), context


def _company_context():
    from users.models import AdminSettings
    settings_row = AdminSettings.objects.order_by('id').first()
    return {
        'company_name': getattr(settings_row, 'company_name', '') or 'AFN Solar Power Engineering Services',
        'company_address': getattr(settings_row, 'company_address', '') or 'Lot2a9, Brgy. Bigo, Pagbilao, Quezon',
        'company_contact': '09171460224 / (042)9111107 | afnsunenergyserv@gmail.com',
        'prepared_by': 'C/ENGR. ARVIN F. NAPENAS',
        'prepared_title': 'General Manager',
    }


def _client_context(client):
    profile = getattr(client, 'client_profile', None)
    return {
        **_company_context(),
        'client_name': display_name(client),
        'client_first_name': getattr(client, 'first_name', '') or '',
        'client_middle_name': getattr(client, 'middle_name', '') or '',
        'client_last_name': getattr(client, 'last_name', '') or '',
        'client_address': getattr(profile, 'billing_address', '') or getattr(client, 'address', '') or '',
        'client_contact_number': getattr(client, 'phone', '') or '',
        'client_landline': getattr(client, 'landline', '') or '',
        'client_email': getattr(client, 'email', '') or '',
        'client_company_name': getattr(profile, 'company_name', '') or '',
    }


def build_custom_context(definition, *, ticket=None, client=None, project=None, custom_values=None):
    if definition.category != 'custom':
        raise ValueError('Custom context is only available for custom document definitions.')
    if definition.data_source == 'ticket':
        if not ticket:
            raise ValueError('A ticket is required for this custom document.')
        context = build_common_context(ticket)
    elif definition.data_source == 'client':
        if not client and ticket and ticket.request_id:
            client = ticket.request.client
        if not client:
            raise ValueError('A client is required for this custom document.')
        context = _client_context(client)
    elif definition.data_source == 'project':
        if not project and ticket:
            project = getattr(ticket, 'created_project_profile', None)
            if not project and ticket.request_id:
                project = getattr(getattr(ticket.request, 'location', None), 'solar_project_profile', None)
        if not project:
            raise ValueError('A project is required for this custom document.')
        location = project.location
        project_ticket = project.original_ticket
        context = build_common_context(project_ticket) if project_ticket else _client_context(location.request.client)
        context.update({
            'project_id': project.pk,
            'system_capacity': project.system_capacity or '',
            'panel_brand': project.panel_brand or '',
            'number_of_panels': project.number_of_panels or '',
            'inverter_brand': project.inverter_brand or '',
            'number_of_inverters': project.number_of_inverters or '',
            'battery_brand': project.battery_brand or '',
            'mounting_structure': project.mounting_structure or '',
            'location_address': location.address or '',
            'location_city': location.city or '',
            'location_province': location.province or '',
        })
    else:
        raise ValueError('Unsupported custom document data source.')
    context.update(custom_values or {})
    return context


def render_custom_version_preview(version, *, ticket=None, client=None, project=None, custom_values=None):
    if version.file_format != 'docx':
        raise ValueError('Only DOCX template versions can use the Word renderer.')
    if version.validation_status != 'valid':
        raise ValueError('Only a validated template version can be test rendered.')
    context = build_custom_context(
        version.template.definition,
        ticket=ticket,
        client=client,
        project=project,
        custom_values=custom_values,
    )
    with version.file.open('rb') as source:
        return render_template_bytes(source, context), context


def generate_custom_document(instance, *, generated_by=None, template_id=None):
    if not instance.definition.is_active:
        raise ValueError('Only active document definitions can be generated.')
    version = instance.selected_template_version
    if template_id is not None:
        version = active_template_version(instance.definition.code, template_id=template_id, file_format=None)
    elif version is None:
        version = active_template_version(instance.definition.code, file_format=None)
    if not version or version.template.definition_id != instance.definition_id:
        raise ValueError('This custom document has no active validated template version.')
    context = (
        build_custom_context(
            instance.definition,
            ticket=instance.ticket,
            client=instance.client,
            project=instance.project,
            custom_values=instance.custom_field_values,
        )
        if instance.definition.category == 'custom'
        else build_context(instance.ticket, instance.definition.code)
    )
    if version.file_format == 'pdf':
        from services.pdf_document_generation import archive_pdf_output, resolve_template_field_values
        resolved_values = resolve_template_field_values(version, instance.custom_field_values, context)
        output = archive_pdf_output(instance, version, context, resolved_values, generated_by=generated_by)
        DocumentInstance.objects.filter(pk=instance.pk).update(status='generated', selected_template_version=version)
        from users.signals import log_activity
        log_activity(actor=generated_by, category='documents', action='document_generate', target=output, message=f'Generated {instance.definition.name} instance {instance.pk}.', metadata={'output_id': output.id, 'instance_id': instance.id, 'template_version_id': version.id, 'sha256': output.sha256, 'output_format': 'pdf'})
        return output
    try:
        with version.file.open('rb') as source:
            rendered = render_template_bytes(source, context)
    except Exception as exc:
        DocumentOutput.objects.create(
            definition=instance.definition,
            instance=instance,
            ticket=instance.ticket,
            template_version=version,
            output_format='docx',
            renderer_source='dynamic',
            original_filename='',
            source_snapshot=context,
            status='failed',
            error_summary=str(exc)[:1000],
            generated_by=generated_by,
        )
        raise
    filename = f'{instance.definition.code}_DOC-{instance.pk:04d}_{timezone.now().strftime("%Y%m%d%H%M%S")}.docx'
    output = DocumentOutput(
        definition=instance.definition,
        instance=instance,
        ticket=instance.ticket,
        template_version=version,
        output_format='docx',
        renderer_source='dynamic',
        original_filename=filename,
        file_size=len(rendered),
        sha256=hashlib.sha256(rendered).hexdigest(),
        source_snapshot=context,
        status='ready',
        generated_by=generated_by,
    )
    output.file.save(filename, ContentFile(rendered), save=False)
    try:
        output.save()
        DocumentInstance.objects.filter(pk=instance.pk).update(status='generated', selected_template_version=version)
    except Exception:
        output.file.storage.delete(output.file.name)
        raise
    from users.signals import log_activity
    log_activity(actor=generated_by, category='documents', action='custom_document_generate', target=output, message=f'Generated {instance.definition.name} instance {instance.pk}.', metadata={'output_id': output.id, 'instance_id': instance.id, 'template_version_id': version.id, 'sha256': output.sha256})
    return output


def render_document_instance_preview(instance, *, template_id=None):
    """Render current instance values without creating an archive record."""
    version = instance.selected_template_version
    if template_id is not None:
        version = active_template_version(instance.definition.code, template_id=template_id, file_format=None)
    elif version is None:
        version = active_template_version(instance.definition.code, file_format=None)
    if not version or version.template.definition_id != instance.definition_id:
        raise ValueError('This document has no active validated template version.')
    context = (
        build_custom_context(
            instance.definition,
            ticket=instance.ticket,
            client=instance.client,
            project=instance.project,
            custom_values=instance.custom_field_values,
        )
        if instance.definition.category == 'custom'
        else build_context(instance.ticket, instance.definition.code)
    )
    if version.file_format == 'pdf':
        from services.pdf_document_generation import render_pdf_template, resolve_template_field_values
        values = resolve_template_field_values(version, instance.custom_field_values, context)
        return render_pdf_template(version, values), 'pdf'
    with version.file.open('rb') as source:
        return render_template_bytes(source, context), 'docx'


def generate_archived_document(ticket, document_type, *, generated_by=None, report_id=None, template_id=None):
    canonical_type = canonical_document_type(document_type)
    if canonical_type not in TEMPLATE_FILENAMES:
        raise ValueError(f'Unsupported document type: {document_type}')
    definition = DocumentDefinition.objects.get(code=canonical_type, category='core', is_active=True)
    context = build_context(ticket, canonical_type, report_id=report_id)
    version = active_template_version(canonical_type, template_id=template_id, file_format=None)
    if template_id is not None and version is None:
        raise ValueError('The selected template has no active validated version for this document type.')

    renderer_source = 'dynamic' if version else 'legacy'
    output_format = version.file_format if version else 'docx'
    try:
        if version and version.file_format == 'pdf':
            from services.pdf_document_generation import render_pdf_template, resolve_template_field_values
            resolved_values = resolve_template_field_values(version, {}, context)
            rendered = render_pdf_template(version, resolved_values)
            context = {**context, 'configured_field_values': resolved_values}
        elif version:
            with version.file.open('rb') as source:
                rendered = render_template_bytes(source, context)
        else:
            ensure_template_files()
            template_path = resolve_template_path(canonical_type)
            if not template_path.exists():
                raise FileNotFoundError(f'Missing document template: {template_path}')
            rendered = render_template_bytes(template_path, context)
    except Exception as exc:
        DocumentOutput.objects.create(
            definition=definition, ticket=ticket, template_version=version,
            output_format=output_format, renderer_source=renderer_source,
            original_filename='', source_snapshot=context, status='failed',
            error_summary=str(exc)[:1000], generated_by=generated_by,
        )
        raise

    filename = f'{canonical_type}_{ticket_number(ticket)}_{timezone.now().strftime("%Y%m%d%H%M%S")}.{output_format}'
    generated_snapshot = GeneratedDocument.objects.filter(ticket=ticket, document_type=canonical_type).first()
    output = DocumentOutput(
        definition=definition,
        ticket=ticket,
        template_version=version,
        generated_document=generated_snapshot,
        output_format=output_format,
        renderer_source=renderer_source,
        original_filename=filename,
        file_size=len(rendered),
        sha256=hashlib.sha256(rendered).hexdigest(),
        source_snapshot=context,
        status='ready',
        generated_by=generated_by,
    )
    output.file.save(filename, ContentFile(rendered), save=False)
    try:
        output.save()
    except Exception:
        output.file.storage.delete(output.file.name)
        raise
    from users.signals import log_activity
    log_activity(actor=generated_by, category='documents', action='document_generate', target=output, message=f'Generated {definition.name} for {ticket_number(ticket)}.', metadata={'output_id': output.id, 'template_version_id': output.template_version_id, 'renderer_source': output.renderer_source, 'sha256': output.sha256})
    return output
