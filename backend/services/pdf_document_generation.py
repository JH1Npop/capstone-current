"""Coordinate-based filling for preserved PDF template versions."""

import hashlib
import io
from decimal import Decimal, InvalidOperation

from django.core.files.base import ContentFile
from django.utils import timezone
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from rest_framework import serializers

from services.models import DocumentOutput, DocumentTemplateField


def _normalized_value(field, value):
    if value is None:
        return ''
    if field.field_type == 'checkbox':
        if isinstance(value, bool):
            return value
        if str(value).lower() in {'true', '1', 'yes', 'on'}:
            return True
        if str(value).lower() in {'false', '0', 'no', 'off', ''}:
            return False
        raise serializers.ValidationError({field.field_key: 'Choose yes or no.'})
    if field.field_type in {'number', 'currency'}:
        try:
            number = Decimal(str(value))
        except (InvalidOperation, TypeError, ValueError) as exc:
            raise serializers.ValidationError({field.field_key: 'Enter a valid number.'}) from exc
        return f'{number:,.2f}' if field.field_type == 'currency' else str(number)
    if field.field_type == 'dropdown' and value not in (field.options or []):
        raise serializers.ValidationError({field.field_key: 'Choose one of the configured options.'})
    return str(value)


def resolve_template_field_values(version, supplied_values, source_context):
    supplied_values = supplied_values or {}
    resolved = {}
    errors = {}
    for field in version.fillable_fields.filter(is_active=True):
        raw = source_context.get(field.source_key, '') if field.fill_method == 'system' else supplied_values.get(field.field_key, field.default_value)
        if field.is_required and (raw is None or raw == ''):
            errors[field.field_key] = 'This field is required.'
            continue
        try:
            resolved[field.field_key] = _normalized_value(field, raw)
        except serializers.ValidationError as exc:
            detail = exc.detail
            errors[field.field_key] = detail.get(field.field_key, detail) if isinstance(detail, dict) else detail
    if errors:
        raise serializers.ValidationError(errors)
    return resolved


def _draw_field(pdf_canvas, field, value, page_width, page_height):
    placement = field.placement or {}
    x = float(placement['x']) * page_width
    box_height = float(placement['height']) * page_height
    width = float(placement['width']) * page_width
    y = page_height - (float(placement['y']) * page_height) - box_height
    font_size = max(7, min(14, box_height * 0.58))
    pdf_canvas.setFillColorRGB(0, 0, 0)
    pdf_canvas.setFont('Helvetica', font_size)
    if field.field_type == 'checkbox':
        side = min(width, box_height)
        pdf_canvas.rect(x, y, side, side, stroke=1, fill=0)
        if value:
            pdf_canvas.setLineWidth(max(1, side * 0.08))
            pdf_canvas.line(x + side * 0.2, y + side * 0.5, x + side * 0.43, y + side * 0.22)
            pdf_canvas.line(x + side * 0.43, y + side * 0.22, x + side * 0.82, y + side * 0.8)
        return
    text = str(value or '')
    if field.field_type == 'multiline':
        text_object = pdf_canvas.beginText(x, y + box_height - font_size)
        text_object.setFont('Helvetica', font_size)
        max_chars = max(1, int(width / (font_size * 0.55)))
        lines = []
        for paragraph in text.splitlines() or ['']:
            words = paragraph.split()
            current = ''
            for word in words:
                candidate = f'{current} {word}'.strip()
                if len(candidate) <= max_chars:
                    current = candidate
                else:
                    if current:
                        lines.append(current)
                    current = word
            lines.append(current)
        for line in lines[:max(1, int(box_height / (font_size * 1.2)))]:
            text_object.textLine(line)
        pdf_canvas.drawText(text_object)
        return
    while font_size > 7 and pdf_canvas.stringWidth(text, 'Helvetica', font_size) > width:
        font_size -= 0.5
        pdf_canvas.setFont('Helvetica', font_size)
    pdf_canvas.drawString(x, y + max(1, (box_height - font_size) / 2), text)


def render_pdf_template(version, resolved_values):
    if version.file_format != 'pdf' or version.validation_status != 'valid':
        raise ValueError('Only a validated PDF template can use the PDF renderer.')
    with version.file.open('rb') as source:
        source_bytes = source.read()
    reader = PdfReader(io.BytesIO(source_bytes), strict=False)
    if reader.is_encrypted:
        raise ValueError('Encrypted PDF templates are not supported.')
    writer = PdfWriter()
    fields_by_page = {}
    for field in version.fillable_fields.filter(is_active=True):
        fields_by_page.setdefault(field.page_number, []).append(field)
    for page_number, source_page in enumerate(reader.pages, start=1):
        if source_page.rotation:
            source_page.transfer_rotation_to_content()
        width = float(source_page.mediabox.width)
        height = float(source_page.mediabox.height)
        page_fields = fields_by_page.get(page_number, [])
        if page_fields:
            overlay_buffer = io.BytesIO()
            overlay_canvas = canvas.Canvas(overlay_buffer, pagesize=(width, height), pageCompression=1)
            for field in page_fields:
                _draw_field(overlay_canvas, field, resolved_values.get(field.field_key, ''), width, height)
            overlay_canvas.save()
            overlay_buffer.seek(0)
            source_page.merge_page(PdfReader(overlay_buffer).pages[0])
        writer.add_page(source_page)
    output = io.BytesIO()
    writer.write(output)
    return output.getvalue()


def archive_pdf_output(instance, version, source_context, resolved_values, generated_by=None):
    rendered = render_pdf_template(version, resolved_values)
    filename = f'{instance.definition.code}_DOC-{instance.pk:04d}_{timezone.now().strftime("%Y%m%d%H%M%S")}.pdf'
    snapshot = {**source_context, 'configured_field_values': resolved_values}
    output = DocumentOutput(
        definition=instance.definition,
        instance=instance,
        ticket=instance.ticket,
        template_version=version,
        output_format='pdf',
        renderer_source='dynamic',
        original_filename=filename,
        file_size=len(rendered),
        sha256=hashlib.sha256(rendered).hexdigest(),
        source_snapshot=snapshot,
        status='ready',
        generated_by=generated_by,
    )
    output.file.save(filename, ContentFile(rendered), save=False)
    try:
        output.save()
    except Exception:
        output.file.storage.delete(output.file.name)
        raise
    return output
