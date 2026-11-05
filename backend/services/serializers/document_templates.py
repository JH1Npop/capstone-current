import hashlib
import io
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path
from zipfile import BadZipFile, ZipFile

from django.db import transaction
from django.db.models import Max
from django.utils.text import slugify
from rest_framework import serializers

from afn_service_management.upload_validation import validate_image_upload
from services.document_templates import (
    CUSTOM_SOURCE_REGISTRY,
    DOCX_MIME,
    build_design_checklist,
    missing_required_activation_components,
    placeholder_catalog,
    placeholder_catalog_details,
    validate_template_upload,
)
from services.models import DocumentAttachment, DocumentDefinition, DocumentFieldDefinition, DocumentInstance, DocumentOutput, DocumentTemplate, DocumentTemplateField, DocumentTemplateVersion


def _unique_definition_code(name):
    base = slugify(name)[:56] or 'custom-document'
    code = base
    suffix = 2
    while DocumentDefinition.objects.filter(code=code).exists():
        code = f'{base[:55 - len(str(suffix))]}-{suffix}'
        suffix += 1
    return code


class DocumentDefinitionSerializer(serializers.ModelSerializer):
    allowed_placeholders = serializers.SerializerMethodField()
    placeholder_details = serializers.SerializerMethodField()

    class Meta:
        model = DocumentDefinition
        fields = ['id', 'code', 'name', 'description', 'category', 'data_source', 'core_workflow_binding', 'access_capabilities', 'is_active', 'display_order', 'allowed_placeholders', 'placeholder_details', 'created_at', 'updated_at']
        read_only_fields = ['code', 'category', 'core_workflow_binding', 'allowed_placeholders', 'placeholder_details', 'created_at', 'updated_at']

    def get_allowed_placeholders(self, obj):
        return placeholder_catalog(obj)

    def get_placeholder_details(self, obj):
        return placeholder_catalog_details(obj)

    def validate_access_capabilities(self, value):
        from users.rbac import get_unknown_capability_codes
        if not isinstance(value, list) or any(not isinstance(item, str) or len(item) > 100 for item in value):
            raise serializers.ValidationError('Access capabilities must be a list of capability codes.')
        unknown = get_unknown_capability_codes(value)
        if unknown:
            raise serializers.ValidationError(f'Unknown capability codes: {", ".join(unknown)}.')
        return sorted(set(value))

    def validate(self, attrs):
        if self.instance and 'data_source' in attrs and attrs['data_source'] != self.instance.data_source:
            if self.instance.field_definitions.exists() or self.instance.instances.exists() or self.instance.templates.exists():
                raise serializers.ValidationError({'data_source': 'The data source cannot change after fields, templates, or instances exist.'})
        if self.instance and attrs.get('is_active') is True:
            has_active_default = DocumentTemplateVersion.objects.filter(
                template__definition=self.instance,
                template__is_default=True,
                template__is_enabled=True,
                validation_status='valid',
                publication_status='active',
            ).exists()
            if not has_active_default:
                raise serializers.ValidationError({'is_active': 'Activate a validated default template version first.'})
        return attrs

    def create(self, validated_data):
        validated_data.update(
            code=_unique_definition_code(validated_data['name']),
            category='custom',
            core_workflow_binding='',
            is_active=False,
            created_by=self.context['request'].user,
        )
        return super().create(validated_data)

    def update(self, instance, validated_data):
        if instance.category != 'custom':
            raise serializers.ValidationError({'detail': 'Core document definitions cannot be reconfigured.'})
        return super().update(instance, validated_data)


class DocumentFieldDefinitionSerializer(serializers.ModelSerializer):
    class Meta:
        model = DocumentFieldDefinition
        fields = ['id', 'definition', 'field_key', 'label', 'field_type', 'is_required', 'default_value', 'validation_config', 'display_order', 'is_active', 'created_at', 'updated_at']
        read_only_fields = ['created_at', 'updated_at']

    def validate(self, attrs):
        definition = attrs.get('definition', getattr(self.instance, 'definition', None))
        field_key = attrs.get('field_key', getattr(self.instance, 'field_key', None))
        field_type = attrs.get('field_type', getattr(self.instance, 'field_type', 'text'))
        config = attrs.get('validation_config', getattr(self.instance, 'validation_config', {})) or {}
        if not definition or definition.category != 'custom':
            raise serializers.ValidationError({'definition': 'Manual fields can only be added to custom documents.'})
        if self.instance and ('definition' in attrs or ('field_key' in attrs and field_key != self.instance.field_key)):
            raise serializers.ValidationError({'field_key': 'A field key cannot change after registration.'})
        if field_key in CUSTOM_SOURCE_REGISTRY.get(definition.data_source, set()):
            raise serializers.ValidationError({'field_key': 'This key is reserved for system-provided data.'})
        if not isinstance(config, dict):
            raise serializers.ValidationError({'validation_config': 'Validation configuration must be an object.'})
        if field_type == 'dropdown':
            options = config.get('options')
            if not isinstance(options, list) or not options or len(options) > 50 or any(not isinstance(item, str) or not item.strip() or len(item) > 100 for item in options):
                raise serializers.ValidationError({'validation_config': 'Dropdown fields require 1 to 50 non-empty text options.'})
        if field_type in {'text', 'multiline'} and 'max_length' in config:
            try:
                max_length = int(config['max_length'])
            except (TypeError, ValueError):
                raise serializers.ValidationError({'validation_config': 'max_length must be a whole number.'})
            if not 1 <= max_length <= 10000:
                raise serializers.ValidationError({'validation_config': 'max_length must be between 1 and 10000.'})
        return attrs


def validate_custom_values(definition, values):
    if not isinstance(values, dict):
        raise serializers.ValidationError('Custom field values must be an object.')
    fields = list(definition.field_definitions.filter(is_active=True))
    known = {field.field_key: field for field in fields}
    unknown = sorted(set(values) - set(known))
    if unknown:
        raise serializers.ValidationError(f'Unknown custom fields: {", ".join(unknown)}.')
    normalized = {}
    errors = {}
    for key, field in known.items():
        value = values.get(key, field.default_value)
        empty = value is None or value == ''
        if field.is_required and empty:
            errors[key] = 'This field is required.'
            continue
        if empty:
            normalized[key] = value
            continue
        config = field.validation_config or {}
        try:
            if field.field_type == 'number':
                number = Decimal(str(value))
                if 'min' in config and number < Decimal(str(config['min'])):
                    raise ValueError(f'Must be at least {config["min"]}.')
                if 'max' in config and number > Decimal(str(config['max'])):
                    raise ValueError(f'Must be at most {config["max"]}.')
                value = str(number)
            elif field.field_type == 'date':
                value = date.fromisoformat(str(value)).isoformat()
            elif field.field_type == 'boolean':
                if not isinstance(value, bool):
                    raise ValueError('Must be true or false.')
            elif field.field_type == 'dropdown':
                if value not in config.get('options', []):
                    raise ValueError('Select one of the approved options.')
            else:
                value = str(value)
                if len(value) > int(config.get('max_length', 10000)):
                    raise ValueError(f'Must be {config.get("max_length", 10000)} characters or fewer.')
        except (InvalidOperation, TypeError, ValueError) as exc:
            errors[key] = str(exc) or 'Enter a valid value.'
            continue
        normalized[key] = value
    if errors:
        raise serializers.ValidationError(errors)
    return normalized


class DocumentInstanceSerializer(serializers.ModelSerializer):
    definition_code = serializers.CharField(source='definition.code', read_only=True)
    definition_name = serializers.CharField(source='definition.name', read_only=True)
    output_count = serializers.IntegerField(source='outputs.count', read_only=True)
    attachment_count = serializers.IntegerField(source='attachments.count', read_only=True)

    class Meta:
        model = DocumentInstance
        fields = ['id', 'definition', 'definition_code', 'definition_name', 'ticket', 'client', 'project', 'selected_template_version', 'custom_field_values', 'status', 'output_count', 'attachment_count', 'created_by', 'created_at', 'updated_at']
        read_only_fields = ['status', 'created_by', 'created_at', 'updated_at']

    def validate(self, attrs):
        definition = attrs.get('definition', getattr(self.instance, 'definition', None))
        if not definition or not definition.is_active:
            raise serializers.ValidationError({'definition': 'Choose an active document definition.'})
        if self.instance and 'definition' in attrs and definition.pk != self.instance.definition_id:
            raise serializers.ValidationError({'definition': 'The document definition cannot change.'})
        ticket = attrs.get('ticket', getattr(self.instance, 'ticket', None))
        client = attrs.get('client', getattr(self.instance, 'client', None))
        project = attrs.get('project', getattr(self.instance, 'project', None))
        if definition.category == 'core' or definition.data_source == 'ticket':
            if not ticket:
                raise serializers.ValidationError({'ticket': 'A service ticket is required for this document.'})
            attrs.update(client=None, project=None)
        elif definition.data_source == 'client':
            if not client and ticket and ticket.request_id:
                client = ticket.request.client
            if not client or client.role != 'client':
                raise serializers.ValidationError({'client': 'A client is required for this document.'})
            attrs.update(ticket=None, client=client, project=None)
        elif definition.data_source == 'project':
            if not project and ticket:
                project = getattr(ticket, 'created_project_profile', None)
                if not project and ticket.request_id:
                    project = getattr(getattr(ticket.request, 'location', None), 'solar_project_profile', None)
            if not project:
                raise serializers.ValidationError({'project': 'A solar project profile is required for this document.'})
            attrs.update(ticket=None, client=None, project=project)
        version = attrs.get('selected_template_version', getattr(self.instance, 'selected_template_version', None))
        if not version:
            version = DocumentTemplateVersion.objects.filter(
                template__definition=definition,
                template__is_default=True,
                template__is_enabled=True,
                validation_status='valid',
                publication_status='active',
            ).first()
            if version:
                attrs['selected_template_version'] = version
        if not version or (version.template.definition_id != definition.id or version.validation_status != 'valid' or version.publication_status != 'active' or not version.template.is_enabled):
            raise serializers.ValidationError({'selected_template_version': 'Choose an active validated version for this document.'})
        values = attrs.get('custom_field_values', getattr(self.instance, 'custom_field_values', {}))
        if not isinstance(values, dict):
            raise serializers.ValidationError({'custom_field_values': 'Document values must be an object.'})
        definition_keys = set(definition.field_definitions.filter(is_active=True).values_list('field_key', flat=True)) if definition.category == 'custom' else set()
        template_fields = {field.field_key: field for field in version.fillable_fields.filter(is_active=True)}
        unknown = sorted(set(values) - definition_keys - set(template_fields))
        if unknown:
            raise serializers.ValidationError({'custom_field_values': f'Unknown document fields: {", ".join(unknown)}.'})
        normalized = validate_custom_values(definition, {key: values[key] for key in definition_keys if key in values}) if definition.category == 'custom' else {}
        for key, field in template_fields.items():
            if field.fill_method == 'system':
                continue
            value = values.get(key, field.default_value)
            if field.is_required and (value is None or value == ''):
                raise serializers.ValidationError({'custom_field_values': {key: 'This field is required.'}})
            normalized[key] = value
        attrs['custom_field_values'] = normalized
        return attrs

    def create(self, validated_data):
        validated_data['created_by'] = self.context['request'].user
        return super().create(validated_data)


class DocumentAttachmentSerializer(serializers.ModelSerializer):
    file = serializers.FileField(write_only=True)

    class Meta:
        model = DocumentAttachment
        fields = ['id', 'instance', 'file', 'original_filename', 'content_type', 'file_size', 'sha256', 'description', 'uploaded_by', 'uploaded_at']
        read_only_fields = ['original_filename', 'content_type', 'file_size', 'sha256', 'uploaded_by', 'uploaded_at']

    def validate_file(self, upload):
        extension = Path(upload.name).suffix.lower()
        allowed_extensions = {'.pdf', '.docx', '.png', '.jpg', '.jpeg', '.webp', '.txt'}
        if extension not in allowed_extensions:
            raise serializers.ValidationError('Upload a PDF, DOCX, PNG, JPEG, WebP, or text file.')
        if upload.size <= 0 or upload.size > 15 * 1024 * 1024:
            raise serializers.ValidationError('Attachments must be between 1 byte and 15 MB.')

        declared_type = (upload.content_type or 'application/octet-stream').lower()
        canonical_type = declared_type
        if extension in {'.png', '.jpg', '.jpeg', '.webp'}:
            expected_formats = {
                '.png': {'PNG'},
                '.jpg': {'JPEG'},
                '.jpeg': {'JPEG'},
                '.webp': {'WEBP'},
            }[extension]
            try:
                _format, canonical_type, _safe_extension, _stem = validate_image_upload(
                    upload,
                    max_bytes=15 * 1024 * 1024,
                    allowed_formats=expected_formats,
                    field_name='file',
                )
            except serializers.ValidationError as exc:
                detail = exc.detail.get('file', exc.detail) if isinstance(exc.detail, dict) else exc.detail
                raise serializers.ValidationError(detail) from exc
        else:
            upload.seek(0)
            data = upload.read()
            upload.seek(0)
            if extension == '.pdf':
                if declared_type not in {'application/pdf', 'application/octet-stream'} or not data.startswith(b'%PDF-'):
                    raise serializers.ValidationError('The uploaded file is not a valid PDF document.')
                canonical_type = 'application/pdf'
            elif extension == '.txt':
                if declared_type not in {'text/plain', 'application/octet-stream'} or b'\x00' in data:
                    raise serializers.ValidationError('The uploaded file is not a valid plain-text document.')
                try:
                    data.decode('utf-8')
                except UnicodeDecodeError as exc:
                    raise serializers.ValidationError('Text attachments must use UTF-8 encoding.') from exc
                canonical_type = 'text/plain'
            else:
                if declared_type not in {DOCX_MIME, 'application/octet-stream', 'application/zip'}:
                    raise serializers.ValidationError('The uploaded file is not a valid DOCX document.')
                try:
                    with ZipFile(io.BytesIO(data)) as archive:
                        entries = archive.infolist()
                        names = {entry.filename for entry in entries}
                        if '[Content_Types].xml' not in names or 'word/document.xml' not in names:
                            raise serializers.ValidationError('The uploaded file is not a valid DOCX document.')
                        if len(entries) > 250 or sum(entry.file_size for entry in entries) > 50 * 1024 * 1024:
                            raise serializers.ValidationError('The DOCX attachment expands beyond the permitted safety limit.')
                        if any(entry.flag_bits & 0x1 for entry in entries):
                            raise serializers.ValidationError('Encrypted DOCX attachments are not supported.')
                except BadZipFile as exc:
                    raise serializers.ValidationError('The uploaded file is not a valid DOCX document.') from exc
                canonical_type = DOCX_MIME

        upload._validated_content_type = canonical_type
        return upload

    def create(self, validated_data):
        upload = validated_data['file']
        digest = hashlib.sha256()
        for chunk in upload.chunks():
            digest.update(chunk)
        upload.seek(0)
        validated_data.update(
            original_filename=Path(upload.name).name,
            content_type=getattr(upload, '_validated_content_type', (upload.content_type or 'application/octet-stream').lower()),
            file_size=upload.size,
            sha256=digest.hexdigest(),
            uploaded_by=self.context['request'].user,
        )
        return super().create(validated_data)


class DocumentTemplateSerializer(serializers.ModelSerializer):
    active_version = serializers.SerializerMethodField()

    class Meta:
        model = DocumentTemplate
        fields = ['id', 'definition', 'name', 'description', 'is_default', 'is_enabled', 'active_version', 'created_at', 'updated_at']
        read_only_fields = ['created_at', 'updated_at', 'active_version']
        # DRF treats the conditional one-default constraint as an unconditional
        # unique-definition validator on PATCH. Default switching is handled
        # transactionally below; preserve the separate definition/name rule in
        # validate() instead.
        validators = []

    def validate(self, attrs):
        definition = attrs.get('definition', getattr(self.instance, 'definition', None))
        name = attrs.get('name', getattr(self.instance, 'name', None))
        if definition and name:
            duplicates = DocumentTemplate.objects.filter(definition=definition, name=name)
            if self.instance:
                duplicates = duplicates.exclude(pk=self.instance.pk)
            if duplicates.exists():
                raise serializers.ValidationError({'name': 'A design with this name already exists for the document type.'})
        return attrs

    def get_active_version(self, obj):
        version = obj.versions.filter(publication_status='active').first()
        return {
            'id': version.id,
            'version_number': version.version_number,
            'file_format': version.file_format,
            'readiness_status': version.readiness_status,
        } if version else None

    def create(self, validated_data):
        validated_data['created_by'] = self.context['request'].user
        with transaction.atomic():
            if validated_data.get('is_default'):
                DocumentTemplate.objects.filter(definition=validated_data['definition'], is_default=True).update(is_default=False)
            return super().create(validated_data)

    def update(self, instance, validated_data):
        with transaction.atomic():
            if validated_data.get('is_default'):
                DocumentTemplate.objects.filter(definition=instance.definition, is_default=True).exclude(pk=instance.pk).update(is_default=False)
            return super().update(instance, validated_data)


class DocumentTemplateVersionSerializer(serializers.ModelSerializer):
    file = serializers.FileField(write_only=True)
    activation_missing_components = serializers.SerializerMethodField()
    checklist = serializers.SerializerMethodField()

    class Meta:
        model = DocumentTemplateVersion
        fields = ['id', 'template', 'version_number', 'original_filename', 'file', 'file_format', 'mime_type', 'file_size', 'sha256', 'placeholder_manifest', 'validation_report', 'validation_status', 'readiness_status', 'publication_status', 'activation_missing_components', 'checklist', 'uploaded_at', 'activated_at', 'change_notes']
        read_only_fields = ['version_number', 'original_filename', 'file_format', 'mime_type', 'file_size', 'sha256', 'placeholder_manifest', 'validation_report', 'validation_status', 'readiness_status', 'publication_status', 'activation_missing_components', 'uploaded_at', 'activated_at']

    def get_activation_missing_components(self, obj):
        return missing_required_activation_components(obj)

    def get_checklist(self, obj):
        return build_design_checklist(obj)

    def create(self, validated_data):
        upload = validated_data['file']
        template_id = validated_data['template'].pk
        result = validate_template_upload(upload, validated_data['template'].definition)
        with transaction.atomic():
            template = DocumentTemplate.objects.select_for_update().select_related('definition').get(pk=template_id)
            next_version = (template.versions.aggregate(value=Max('version_number'))['value'] or 0) + 1
            version = DocumentTemplateVersion.objects.create(
                template=template,
                version_number=next_version,
                original_filename=Path(upload.name).name,
                file=upload,
                file_format=result['file_format'],
                mime_type=result['mime_type'],
                file_size=result['size'],
                sha256=result['sha256'],
                placeholder_manifest=result['manifest'],
                validation_report=result['report'],
                validation_status=result['status'],
                readiness_status=result['readiness'],
                publication_status='draft',
                uploaded_by=self.context['request'].user,
                change_notes=validated_data.get('change_notes', ''),
            )
            from users.signals import log_activity
            log_activity(actor=self.context['request'].user, category='documents', action='template_upload', target=version, message=f'Uploaded {template.definition.name} template v{next_version}.', metadata={'template_id': template.id, 'version_id': version.id, 'validation_status': version.validation_status, 'sha256': version.sha256})
            return version


class DocumentTemplateFieldSerializer(serializers.ModelSerializer):
    class Meta:
        model = DocumentTemplateField
        fields = [
            'id', 'template_version', 'field_key', 'label', 'field_type',
            'fill_method', 'source_key', 'is_required', 'default_value',
            'options', 'page_number', 'placement', 'display_order', 'is_active',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']

    def validate(self, attrs):
        version = attrs.get('template_version', getattr(self.instance, 'template_version', None))
        if not version:
            raise serializers.ValidationError({'template_version': 'Choose a template version.'})
        if self.instance and 'template_version' in attrs and version.pk != self.instance.template_version_id:
            raise serializers.ValidationError({'template_version': 'The template version cannot change.'})
        if version.publication_status != 'draft':
            raise serializers.ValidationError({'template_version': 'Fields can only be configured while the version is a draft.'})

        field_type = attrs.get('field_type', getattr(self.instance, 'field_type', 'text'))
        options = attrs.get('options', getattr(self.instance, 'options', [])) or []
        if field_type == 'dropdown':
            if not isinstance(options, list) or not 1 <= len(options) <= 50 or any(not isinstance(item, str) or not item.strip() or len(item) > 100 for item in options):
                raise serializers.ValidationError({'options': 'Dropdown fields require 1 to 50 non-empty options.'})
            attrs['options'] = [item.strip() for item in options]
        else:
            attrs['options'] = []

        fill_method = attrs.get('fill_method', getattr(self.instance, 'fill_method', 'manual'))
        source_key = (attrs.get('source_key', getattr(self.instance, 'source_key', '')) or '').strip()
        if fill_method == 'system':
            allowed = set(placeholder_catalog(version.template.definition))
            if source_key not in allowed:
                raise serializers.ValidationError({'source_key': 'Choose an approved AFN data source for this document type.'})
        else:
            source_key = ''
        attrs['source_key'] = source_key

        if version.file_format == 'pdf':
            page_number = attrs.get('page_number', getattr(self.instance, 'page_number', None))
            placement = attrs.get('placement', getattr(self.instance, 'placement', {})) or {}
            if not page_number or page_number < 1:
                raise serializers.ValidationError({'page_number': 'Choose the PDF page for this field.'})
            required_coordinates = {'x', 'y', 'width', 'height'}
            if not isinstance(placement, dict) or not required_coordinates.issubset(placement):
                raise serializers.ValidationError({'placement': 'PDF fields require x, y, width, and height coordinates.'})
            normalized = {}
            for key in required_coordinates:
                try:
                    normalized[key] = float(placement[key])
                except (TypeError, ValueError) as exc:
                    raise serializers.ValidationError({'placement': f'{key} must be a number.'}) from exc
            if not (0 <= normalized['x'] < 1 and 0 <= normalized['y'] < 1):
                raise serializers.ValidationError({'placement': 'Field position must stay on the page.'})
            if not (0 < normalized['width'] <= 1 and 0 < normalized['height'] <= 1):
                raise serializers.ValidationError({'placement': 'Field width and height must be greater than zero.'})
            if normalized['x'] + normalized['width'] > 1 or normalized['y'] + normalized['height'] > 1:
                raise serializers.ValidationError({'placement': 'The complete field must stay inside the page.'})
            attrs['placement'] = normalized
        else:
            attrs['page_number'] = None
            attrs['placement'] = {}
        return attrs


class DocumentOutputSerializer(serializers.ModelSerializer):
    definition_code = serializers.CharField(source='definition.code', read_only=True)
    template_version_number = serializers.IntegerField(source='template_version.version_number', read_only=True, allow_null=True)

    class Meta:
        model = DocumentOutput
        fields = ['id', 'ticket', 'instance', 'definition', 'definition_code', 'template_version', 'template_version_number', 'generated_document', 'output_format', 'renderer_source', 'original_filename', 'file_size', 'sha256', 'status', 'error_summary', 'generated_by', 'generated_at']
        read_only_fields = fields
