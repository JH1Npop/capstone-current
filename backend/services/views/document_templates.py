import io
import logging

from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import transaction
from django.utils import timezone
from django.http import FileResponse
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from services.dynamic_document_generation import DOCX_CONTENT_TYPE, generate_custom_document, render_custom_version_preview, render_document_instance_preview, render_version_preview
from services.blank_suggestions import apply_blank_suggestions
from services.document_templates import build_design_checklist, build_starter_docx, missing_required_activation_components, placeholder_catalog, register_suggested_fields, revalidate_version
from services.models import DocumentAttachment, DocumentDefinition, DocumentFieldDefinition, DocumentInstance, DocumentOutput, DocumentTemplate, DocumentTemplateField, DocumentTemplateVersion, ServiceTicket
from services.serializers.document_templates import DocumentAttachmentSerializer, DocumentDefinitionSerializer, DocumentFieldDefinitionSerializer, DocumentInstanceSerializer, DocumentOutputSerializer, DocumentTemplateFieldSerializer, DocumentTemplateSerializer, DocumentTemplateVersionSerializer, validate_custom_values
from users.permissions import CanManageDocumentAttachments, CanManageDocumentDefinitions, CanManageDocumentTemplates, CanManageDocuments, CanPublishDocumentTemplates, CanRollbackDocumentTemplates, CanUploadDocumentTemplates, CanViewDocuments
from users.rbac import get_user_capability_codes, user_has_any_capability, DOCUMENT_DEFINITIONS_MANAGE_CAPABILITIES


logger = logging.getLogger(__name__)


def _can_access_definition(user, definition):
    required = set(definition.access_capabilities or [])
    return not required or bool(get_user_capability_codes(user).intersection(required))


def _accessible_definition_ids(user, queryset):
    return [definition.id for definition in queryset if _can_access_definition(user, definition)]


def _enforce_definition_access(user, definition):
    if not _can_access_definition(user, definition):
        raise PermissionDenied('You do not have access to this document definition.')


class DocumentDefinitionViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    serializer_class = DocumentDefinitionSerializer
    pagination_class = None

    def get_permissions(self):
        permission = CanManageDocumentDefinitions if self.action in {'create', 'update', 'partial_update', 'destroy'} else CanViewDocuments
        return [permission()]

    def get_queryset(self):
        queryset = DocumentDefinition.objects.prefetch_related('field_definitions', 'templates__versions')
        can_manage = user_has_any_capability(self.request.user, DOCUMENT_DEFINITIONS_MANAGE_CAPABILITIES)
        if not can_manage:
            queryset = queryset.filter(is_active=True)
        category = self.request.query_params.get('category')
        if category:
            queryset = queryset.filter(category=category)
        active = self.request.query_params.get('is_active')
        if active in {'true', 'false'}:
            queryset = queryset.filter(is_active=(active == 'true'))
        return queryset.filter(id__in=_accessible_definition_ids(self.request.user, queryset))

    def perform_create(self, serializer):
        instance = serializer.save()
        from users.signals import log_activity
        log_activity(actor=self.request.user, category='documents', action='custom_definition_create', target=instance, message=f'Registered custom document {instance.name}.', metadata={'definition_id': instance.id, 'code': instance.code, 'data_source': instance.data_source})

    @action(detail=True, methods=['get'])
    def starter(self, request, pk=None):
        """A blank Word design for a custom document, with every field already written in plain form."""
        definition = self.get_object()
        if definition.category != 'custom':
            return Response({'detail': 'The six core documents have no blank starter. Download their design in use and edit that instead.'}, status=status.HTTP_409_CONFLICT)
        content = build_starter_docx(definition)
        from users.signals import log_activity
        log_activity(actor=request.user, category='documents', action='starter_download', target=definition, message=f'Downloaded the starter design for {definition.name}.', metadata={'definition_id': definition.id})
        return FileResponse(io.BytesIO(content), as_attachment=True, filename=f'{definition.code}-starter.docx', content_type=DOCX_CONTENT_TYPE)

    def destroy(self, request, *args, **kwargs):
        """Delete a custom document type that has never produced anything. Otherwise it can only be switched off."""
        with transaction.atomic():
            definition = self.get_queryset().select_for_update(of=('self',)).get(pk=kwargs['pk'])
            if definition.category != 'custom':
                return Response({'detail': 'The six core documents cannot be deleted.'}, status=status.HTTP_409_CONFLICT)
            if definition.outputs.exists() or definition.instances.exists():
                return Response({'detail': 'This document type has been used to make documents, so it cannot be deleted. Disable it instead; its history is kept.'}, status=status.HTTP_409_CONFLICT)
            versions = DocumentTemplateVersion.objects.filter(template__definition=definition)
            stored_files = [(version.file.storage, version.file.name) for version in versions if version.file and version.file.name]
            name, definition_id = definition.name, definition.id
            versions.delete()
            definition.templates.all().delete()
            definition.delete()

            def remove_stored_files():
                for storage, file_name in stored_files:
                    try:
                        storage.delete(file_name)
                    except Exception:
                        logger.warning('Unable to remove deleted document design file %s', file_name, exc_info=True)

            transaction.on_commit(remove_stored_files)
            from users.signals import log_activity
            log_activity(actor=request.user, category='documents', action='custom_definition_delete', message=f'Deleted unused custom document {name}.', metadata={'definition_id': definition_id})
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['get'], url_path='built-in-design')
    def built_in_design(self, request, pk=None):
        """AFN's own Word design for one of the six core documents, as shipped with the system, to restyle and upload."""
        definition = self.get_object()
        from services.document_generation import TEMPLATE_DIR, TEMPLATE_FILENAMES
        if definition.category != 'core' or definition.code not in TEMPLATE_FILENAMES:
            return Response({'detail': 'Only the six core documents have a built-in design. Use the blank starter file instead.'}, status=status.HTTP_409_CONFLICT)
        # The design with AFN's field markers, not the unmarked scan-like copy kept under document_templates/originals.
        path = TEMPLATE_DIR / TEMPLATE_FILENAMES[definition.code]
        if not path.exists():
            return Response({'detail': 'The built-in design file is missing on the server.'}, status=status.HTTP_409_CONFLICT)
        from users.signals import log_activity
        log_activity(actor=request.user, category='documents', action='built_in_design_download', target=definition, message=f'Downloaded the built-in design for {definition.name}.', metadata={'definition_id': definition.id})
        return FileResponse(open(path, 'rb'), as_attachment=True, filename=TEMPLATE_FILENAMES[definition.code], content_type=DOCX_CONTENT_TYPE)

    def perform_update(self, serializer):
        instance = serializer.save()
        from users.signals import log_activity
        log_activity(actor=self.request.user, category='documents', action='custom_definition_update', target=instance, message=f'Updated custom document {instance.name}.', metadata={'definition_id': instance.id, 'is_active': instance.is_active})


class DocumentFieldDefinitionViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    serializer_class = DocumentFieldDefinitionSerializer
    pagination_class = None

    def get_permissions(self):
        permission = CanManageDocumentDefinitions if self.action in {'create', 'update', 'partial_update'} else CanViewDocuments
        return [permission()]

    def get_queryset(self):
        queryset = DocumentFieldDefinition.objects.select_related('definition')
        definition = self.request.query_params.get('definition')
        if definition:
            queryset = queryset.filter(definition_id=definition)
        return queryset.filter(definition_id__in=_accessible_definition_ids(self.request.user, DocumentDefinition.objects.all()))

    def perform_create(self, serializer):
        _enforce_definition_access(self.request.user, serializer.validated_data['definition'])
        field = serializer.save()
        from users.signals import log_activity
        log_activity(actor=self.request.user, category='documents', action='custom_field_create', target=field, message=f'Added {field.label} to {field.definition.name}.', metadata={'definition_id': field.definition_id, 'field_key': field.field_key})


class DocumentTemplateViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    serializer_class = DocumentTemplateSerializer
    permission_classes = [CanManageDocumentTemplates]
    pagination_class = None

    def get_permissions(self):
        return [CanViewDocuments()] if self.action in {'list', 'retrieve'} else [CanManageDocumentTemplates()]

    def get_queryset(self):
        queryset = DocumentTemplate.objects.select_related('definition').prefetch_related('versions')
        definition = self.request.query_params.get('definition')
        if definition:
            queryset = queryset.filter(definition_id=definition)
        return queryset.filter(definition_id__in=_accessible_definition_ids(self.request.user, DocumentDefinition.objects.all()))

    def perform_create(self, serializer):
        _enforce_definition_access(self.request.user, serializer.validated_data['definition'])
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        with transaction.atomic():
            template = self.get_queryset().select_for_update().get(pk=kwargs['pk'])
            versions = template.versions.select_for_update()
            blockers = []
            if versions.filter(publication_status='active').exists():
                blockers.append('This design has an active version. Activate another design first so existing generation is not interrupted.')
            if versions.filter(outputs__isnull=False).exists():
                blockers.append('Generated document history uses this design.')
            if versions.filter(document_instances__isnull=False).exists():
                blockers.append('A prepared custom document uses this design.')
            if blockers:
                return Response({'detail': ' '.join(blockers)}, status=status.HTTP_409_CONFLICT)

            replacement_default = None
            if template.is_default:
                replacement_default = (
                    DocumentTemplate.objects.select_for_update()
                    .filter(definition_id=template.definition_id)
                    .exclude(pk=template.pk)
                    .order_by('-is_enabled', 'id')
                    .first()
                )
                if replacement_default:
                    template.is_default = False
                    template.save(update_fields=['is_default', 'updated_at'])
                    replacement_default.is_default = True
                    replacement_default.save(update_fields=['is_default', 'updated_at'])

            template_id = template.id
            definition_id = template.definition_id
            template_name = template.name
            stored_files = [
                (version.file.storage, version.file.name)
                for version in versions
                if version.file and version.file.name
            ]
            versions.delete()
            template.delete()

            def remove_stored_files():
                for storage, name in stored_files:
                    try:
                        storage.delete(name)
                    except Exception:
                        logger.warning('Unable to remove deleted document design file %s', name, exc_info=True)

            transaction.on_commit(remove_stored_files)
            from users.signals import log_activity
            log_activity(
                actor=request.user,
                category='documents',
                action='template_delete',
                message=f'Deleted document design {template_name}.',
                metadata={'template_id': template_id, 'definition_id': definition_id, 'replacement_default_id': getattr(replacement_default, 'id', None)},
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class DocumentTemplateVersionViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = DocumentTemplateVersionSerializer
    pagination_class = None

    def get_permissions(self):
        if self.action in {'activate', 'use_design'}:
            permission = CanPublishDocumentTemplates
        elif self.action == 'rollback':
            permission = CanRollbackDocumentTemplates
        elif self.action in {'create', 'fill_blanks'}:
            permission = CanUploadDocumentTemplates
        elif self.action == 'accept_fields':
            permission = CanManageDocumentDefinitions
        elif self.action in {'list', 'retrieve', 'download'}:
            permission = CanViewDocuments
        else:
            permission = CanManageDocumentTemplates
        return [permission()]

    def get_queryset(self):
        queryset = DocumentTemplateVersion.objects.select_related('template', 'template__definition', 'uploaded_by', 'activated_by').prefetch_related('fillable_fields')
        template = self.request.query_params.get('template')
        if template:
            queryset = queryset.filter(template_id=template)
        return queryset.filter(template__definition_id__in=_accessible_definition_ids(self.request.user, DocumentDefinition.objects.all()))

    def perform_create(self, serializer):
        _enforce_definition_access(self.request.user, serializer.validated_data['template'].definition)
        serializer.save()

    def _activate(self, request, pk, rollback=False):
        with transaction.atomic():
            target = self.get_queryset().select_for_update(of=('self',)).get(pk=pk)
            # Competing requests can target different version rows. Lock their
            # shared template so publication changes are serialized per design.
            DocumentTemplate.objects.select_for_update().only('id').get(pk=target.template_id)
            if target.validation_status != 'valid':
                return Response({'detail': 'Only a validated template version can be activated.'}, status=status.HTTP_409_CONFLICT)
            if target.file_format == 'pdf' and target.readiness_status not in {'ready_fill', 'ready_auto'}:
                return Response(
                    {'detail': 'This PDF is safely saved, but it cannot be activated until at least one fillable field is configured.'},
                    status=status.HTTP_409_CONFLICT,
                )
            missing_components = missing_required_activation_components(target)
            grandfathered_rollback = rollback and target.activated_at is not None
            if missing_components and not grandfathered_rollback:
                return Response(
                    {
                        'detail': 'This core design is missing required AFN field connections and cannot be activated.',
                        'missing_components': missing_components,
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            if rollback and not target.template.versions.filter(version_number__gt=target.version_number).exists():
                return Response({'detail': 'Rollback requires an earlier validated version.'}, status=status.HTTP_409_CONFLICT)
            target.template.versions.select_for_update().filter(publication_status='active').exclude(pk=target.pk).update(publication_status='retired')
            target.publication_status = 'active'
            target.activated_by = request.user
            target.activated_at = timezone.now()
            target.save(update_fields=['publication_status', 'activated_by', 'activated_at'])
            from users.signals import log_activity
            log_activity(actor=request.user, category='documents', action='template_rollback' if rollback else 'template_activate', target=target, message=f"{'Rolled back to' if rollback else 'Activated'} {target.template.definition.name} template v{target.version_number}.", metadata={'template_id': target.template_id, 'version_id': target.id, 'version_number': target.version_number})
        return Response(self.get_serializer(target).data)

    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        return self._activate(request, pk)

    @action(detail=True, methods=['post'])
    def rollback(self, request, pk=None):
        return self._activate(request, pk, rollback=True)

    def _check_again(self, version, request, message):
        revalidate_version(version)
        from users.signals import log_activity
        log_activity(actor=request.user, category='documents', action='template_revalidate', target=version, message=message, metadata={'template_id': version.template_id, 'version_id': version.id, 'validation_status': version.validation_status})

    @action(detail=True, methods=['post'])
    def revalidate(self, request, pk=None):
        """Check a draft design again, for example after its custom fields were registered."""
        version = self.get_object()
        if version.publication_status != 'draft':
            return Response({'detail': 'Only a draft design can be checked again.'}, status=status.HTTP_409_CONFLICT)
        with transaction.atomic():
            version = self.get_queryset().select_for_update(of=('self',)).get(pk=version.pk)
            self._check_again(version, request, f'Checked {version.template.definition.name} template v{version.version_number} again.')
        return Response(self.get_serializer(version).data)

    @action(detail=True, methods=['post'], url_path='accept-fields')
    def accept_fields(self, request, pk=None):
        """Register the plain names found in this design as fields of its custom document, then check it again."""
        version = self.get_object()
        definition = version.template.definition
        if definition.category != 'custom':
            return Response({'detail': 'Only custom documents can add fields. The six core documents keep their approved fields.'}, status=status.HTTP_409_CONFLICT)
        if version.publication_status != 'draft':
            return Response({'detail': 'Fields can only be added from a draft design.'}, status=status.HTTP_409_CONFLICT)
        names = request.data.get('names')
        if not isinstance(names, list) or not names or len(names) > 40 or any(not isinstance(item, str) or not item.strip() or len(item) > 60 for item in names):
            return Response({'detail': 'Choose between 1 and 40 field names.'}, status=status.HTTP_400_BAD_REQUEST)
        suggested = set((version.placeholder_manifest or {}).get('possible_fields', []))
        unknown = sorted({item.strip() for item in names} - suggested)
        if unknown:
            return Response({'detail': 'These names are not in this design: ' + ', '.join(unknown) + '.'}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            version = self.get_queryset().select_for_update(of=('self',)).get(pk=version.pk)
            created = register_suggested_fields(definition, [item.strip() for item in names])
            from users.signals import log_activity
            for key in created:
                log_activity(actor=request.user, category='documents', action='custom_field_create', target=definition, message=f'Added {key} to {definition.name} from its design.', metadata={'definition_id': definition.id, 'field_key': key, 'version_id': version.id})
            self._check_again(version, request, f'Checked {definition.name} template v{version.version_number} again after adding {len(created)} field(s).')
        data = dict(self.get_serializer(version).data)
        data['created_fields'] = created
        return Response(data)

    @action(detail=True, methods=['post'], url_path='fill-blanks')
    def fill_blanks(self, request, pk=None):
        """Turn "Client Name: ______" lines of a finished Word design into [Client Name] fields.

        The uploaded file is never edited: the result is saved as a new draft version of the same design.
        """
        version = self.get_object()
        definition = version.template.definition
        if version.file_format != 'docx' or version.publication_status != 'draft':
            return Response({'detail': 'Blanks can only be filled in a draft Word design.'}, status=status.HTTP_409_CONFLICT)
        names = request.data.get('names')
        if not isinstance(names, list) or not names or len(names) > 40 or any(not isinstance(item, str) or not item.strip() or len(item) > 60 for item in names):
            return Response({'detail': 'Choose between 1 and 40 blanks.'}, status=status.HTTP_400_BAD_REQUEST)
        offered = {item['label'] for item in (version.placeholder_manifest or {}).get('blank_suggestions', [])}
        unknown = sorted({item.strip() for item in names} - offered)
        if unknown:
            return Response({'detail': 'These blanks are not in this design: ' + ', '.join(unknown) + '.'}, status=status.HTTP_400_BAD_REQUEST)
        _enforce_definition_access(request.user, definition)
        version.file.open('rb')
        try:
            data = version.file.read()
        finally:
            version.file.close()
        new_bytes, applied = apply_blank_suggestions(data, set(placeholder_catalog(definition)), names)
        if not applied:
            return Response({'detail': 'Nothing in this design could be filled.'}, status=status.HTTP_409_CONFLICT)
        upload = SimpleUploadedFile(version.original_filename, new_bytes, content_type=DOCX_CONTENT_TYPE)
        serializer = DocumentTemplateVersionSerializer(
            data={'template': version.template_id, 'file': upload, 'change_notes': f'Filled blanks from version {version.version_number}: {", ".join(applied)}'},
            context=self.get_serializer_context(),
        )
        serializer.is_valid(raise_exception=True)
        created = serializer.save()
        return Response(self.get_serializer(created).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='place-fields')
    def place_fields(self, request, pk=None):
        """Put an AFN-filled box after each label AFN found on a draft PDF. Staff then check the positions."""
        version = self.get_object()
        definition = version.template.definition
        if version.file_format != 'pdf' or version.publication_status != 'draft':
            return Response({'detail': 'Fields can only be placed on a draft PDF design.'}, status=status.HTTP_409_CONFLICT)
        names = request.data.get('names')
        if not isinstance(names, list) or not names or len(names) > 40 or any(not isinstance(item, str) or not item.strip() for item in names):
            return Response({'detail': 'Choose between 1 and 40 fields.'}, status=status.HTTP_400_BAD_REQUEST)
        offered = {item['label']: item for item in (version.placeholder_manifest or {}).get('field_suggestions', [])}
        unknown = sorted({item.strip() for item in names} - set(offered))
        if unknown:
            return Response({'detail': 'These labels are not in this PDF: ' + ', '.join(unknown) + '.'}, status=status.HTTP_400_BAD_REQUEST)
        allowed = set(placeholder_catalog(definition))
        created = []
        with transaction.atomic():
            version = self.get_queryset().select_for_update(of=('self',)).get(pk=version.pk)
            existing = set(version.fillable_fields.values_list('field_key', flat=True))
            order = version.fillable_fields.count()
            for name in dict.fromkeys(item.strip() for item in names):
                suggestion = offered[name]
                if suggestion['key'] in existing or suggestion['key'] not in allowed:
                    continue
                order += 1
                DocumentTemplateField.objects.create(
                    template_version=version, field_key=suggestion['key'], label=name, field_type='text', fill_method='system',
                    source_key=suggestion['key'], page_number=suggestion['page'], placement=suggestion['placement'], display_order=order,
                )
                created.append(suggestion['key'])
            if created and version.validation_status == 'valid':
                DocumentTemplateVersion.objects.filter(pk=version.pk).update(readiness_status='ready_auto')
            from users.signals import log_activity
            log_activity(actor=request.user, category='documents', action='template_fields_placed', target=version, message=f'Placed {len(created)} suggested field(s) on {definition.name} template v{version.version_number}.', metadata={'version_id': version.id, 'field_keys': created})
        version = self.get_queryset().get(pk=version.pk)
        data = dict(self.get_serializer(version).data)
        data['placed_fields'] = created
        return Response(data)

    @action(detail=True, methods=['post'], url_path='use-design')
    def use_design(self, request, pk=None):
        """One step for staff: check the design again, make it the active design, and switch its document on.

        The same server rules as separate activation apply (a valid design, every required core component, publish
        permission). What it removes is the need to know the order: check, activate, make default, enable.
        """
        version = self.get_object()
        definition = version.template.definition
        if version.publication_status == 'draft':
            with transaction.atomic():
                locked = self.get_queryset().select_for_update(of=('self',)).get(pk=version.pk)
                self._check_again(locked, request, f'Checked {definition.name} template v{locked.version_number} before use.')
        version = self.get_queryset().get(pk=version.pk)
        if version.validation_status != 'valid' or missing_required_activation_components(version):
            return Response(
                {'detail': 'This design needs attention before it can be used.', 'checklist': build_design_checklist(version)},
                status=status.HTTP_409_CONFLICT,
            )
        activated = self._activate(request, pk)
        if activated.status_code != status.HTTP_200_OK:
            return activated
        with transaction.atomic():
            template = DocumentTemplate.objects.select_for_update().get(pk=version.template_id)
            made_default = not (template.is_default and template.is_enabled)
            if made_default:
                DocumentTemplate.objects.filter(definition=definition, is_default=True).exclude(pk=template.pk).update(is_default=False)
                template.is_default = True
                template.is_enabled = True
                template.save(update_fields=['is_default', 'is_enabled', 'updated_at'])
            definition = DocumentDefinition.objects.select_for_update().get(pk=definition.pk)
            switched_on = False
            if definition.category == 'custom' and not definition.is_active and user_has_any_capability(request.user, DOCUMENT_DEFINITIONS_MANAGE_CAPABILITIES):
                definition.is_active = True
                definition.save(update_fields=['is_active', 'updated_at'])
                switched_on = True
        data = dict(self.get_serializer(self.get_queryset().get(pk=version.pk)).data)
        data.update({'made_default': made_default, 'definition_enabled': switched_on or definition.is_active})
        return Response(data)

    @action(detail=True, methods=['post'], url_path='test-render')
    def test_render(self, request, pk=None):
        version = self.get_object()
        ticket_id = request.data.get('ticket_id')
        if not ticket_id:
            return Response({'detail': 'ticket_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        ticket = ServiceTicket.objects.filter(pk=ticket_id).first()
        if not ticket:
            return Response({'detail': 'Ticket was not found.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            if version.template.definition.category == 'custom':
                values = validate_custom_values(version.template.definition, request.data.get('custom_field_values') or {})
                rendered, _context = render_custom_version_preview(version, ticket=ticket, custom_values=values)
            else:
                rendered, _context = render_version_preview(version, ticket, report_id=request.data.get('report_id'))
        except (ValueError, serializers.ValidationError) as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_409_CONFLICT)
        output_format = version.file_format
        content_type = 'application/pdf' if output_format == 'pdf' else DOCX_CONTENT_TYPE
        return FileResponse(
            io.BytesIO(rendered),
            as_attachment=True,
            filename=f'test-{version.template.definition.code}-v{version.version_number}.{output_format}',
            content_type=content_type,
        )

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        version = self.get_object()
        if not version.file or not version.file.name:
            return Response({'detail': 'The original template file is unavailable.'}, status=status.HTTP_409_CONFLICT)
        version.file.open('rb')
        from users.signals import log_activity
        log_activity(
            actor=request.user,
            category='documents',
            action='template_source_download',
            target=version,
            message=f'Downloaded the preserved source for {version.template.definition.name} template v{version.version_number}.',
            metadata={'template_id': version.template_id, 'version_id': version.id, 'file_format': version.file_format},
        )
        return FileResponse(
            version.file,
            as_attachment=True,
            filename=version.original_filename,
            content_type=version.mime_type or 'application/octet-stream',
        )


class DocumentTemplateFieldViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    serializer_class = DocumentTemplateFieldSerializer
    pagination_class = None

    def get_permissions(self):
        return [CanViewDocuments()] if self.action in {'list', 'retrieve'} else [CanManageDocumentTemplates()]

    def get_queryset(self):
        queryset = DocumentTemplateField.objects.select_related('template_version', 'template_version__template', 'template_version__template__definition')
        version = self.request.query_params.get('template_version')
        if version:
            queryset = queryset.filter(template_version_id=version)
        return queryset.filter(template_version__template__definition_id__in=_accessible_definition_ids(self.request.user, DocumentDefinition.objects.all()))

    def _refresh_readiness(self, version):
        active_fields = version.fillable_fields.filter(is_active=True)
        if version.validation_status != 'valid':
            readiness = 'attention'
        elif not active_fields.exists():
            readiness = 'ready_auto' if version.file_format == 'docx' and (version.placeholder_manifest or {}).get('placeholders') else 'saved'
        elif active_fields.filter(fill_method='system').exists():
            readiness = 'ready_auto'
        else:
            readiness = 'ready_fill'
        DocumentTemplateVersion.objects.filter(pk=version.pk).update(readiness_status=readiness)

    def perform_create(self, serializer):
        version = serializer.validated_data['template_version']
        _enforce_definition_access(self.request.user, version.template.definition)
        field = serializer.save()
        self._refresh_readiness(version)
        from users.signals import log_activity
        log_activity(actor=self.request.user, category='documents', action='template_field_create', target=field, message=f'Added {field.label} to template version {version.version_number}.', metadata={'version_id': version.id, 'field_id': field.id})

    def perform_update(self, serializer):
        field = serializer.save()
        self._refresh_readiness(field.template_version)
        from users.signals import log_activity
        log_activity(actor=self.request.user, category='documents', action='template_field_update', target=field, message=f'Updated {field.label} on template version {field.template_version.version_number}.', metadata={'version_id': field.template_version_id, 'field_id': field.id})

    def perform_destroy(self, instance):
        version = instance.template_version
        if version.publication_status != 'draft':
            raise serializers.ValidationError({'template_version': 'Fields can only be removed while the version is a draft.'})
        field_id = instance.id
        field_label = instance.label
        instance.delete()
        self._refresh_readiness(version)
        from users.signals import log_activity
        log_activity(actor=self.request.user, category='documents', action='template_field_delete', target=version, message=f'Removed {field_label} from template version {version.version_number}.', metadata={'version_id': version.id, 'field_id': field_id})


class DocumentInstanceViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    serializer_class = DocumentInstanceSerializer
    pagination_class = None

    def get_permissions(self):
        permission = CanManageDocuments if self.action in {'create', 'update', 'partial_update', 'generate', 'preview'} else CanViewDocuments
        return [permission()]

    def get_queryset(self):
        queryset = DocumentInstance.objects.select_related('definition', 'ticket', 'client', 'project', 'selected_template_version').prefetch_related('outputs', 'attachments')
        definition = self.request.query_params.get('definition')
        context_ticket = self.request.query_params.get('context_ticket')
        ticket = self.request.query_params.get('ticket')
        client = self.request.query_params.get('client')
        project = self.request.query_params.get('project')
        if definition:
            queryset = queryset.filter(definition_id=definition)
        if context_ticket and definition:
            source_definition = DocumentDefinition.objects.filter(pk=definition).first()
            source_ticket = ServiceTicket.objects.select_related('request__client', 'request__location').filter(pk=context_ticket).first()
            if not source_definition or not source_ticket:
                return queryset.none()
            if source_definition.category == 'core' or source_definition.data_source == 'ticket':
                queryset = queryset.filter(ticket=source_ticket)
            elif source_definition.data_source == 'client':
                queryset = queryset.filter(client=source_ticket.request.client)
            else:
                project = getattr(source_ticket, 'created_project_profile', None)
                if not project:
                    project = getattr(getattr(source_ticket.request, 'location', None), 'solar_project_profile', None)
                queryset = queryset.filter(project=project) if project else queryset.none()
        if ticket:
            queryset = queryset.filter(ticket_id=ticket)
        if client:
            queryset = queryset.filter(client_id=client)
        if project:
            queryset = queryset.filter(project_id=project)
        return queryset.filter(definition_id__in=_accessible_definition_ids(self.request.user, DocumentDefinition.objects.all()))

    def perform_create(self, serializer):
        _enforce_definition_access(self.request.user, serializer.validated_data['definition'])
        serializer.save()

    @action(detail=True, methods=['post'])
    def generate(self, request, pk=None):
        instance = self.get_object()
        try:
            output = generate_custom_document(instance, generated_by=request.user, template_id=request.data.get('template_id'))
        except (ValueError, serializers.ValidationError) as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_409_CONFLICT)
        content_type = 'application/pdf' if output.output_format == 'pdf' else DOCX_CONTENT_TYPE
        return FileResponse(output.file.open('rb'), as_attachment=True, filename=output.original_filename, content_type=content_type)

    @action(detail=True, methods=['post'])
    def preview(self, request, pk=None):
        instance = self.get_object()
        try:
            rendered, output_format = render_document_instance_preview(instance, template_id=request.data.get('template_id'))
        except (ValueError, serializers.ValidationError) as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_409_CONFLICT)
        content_type = 'application/pdf' if output_format == 'pdf' else DOCX_CONTENT_TYPE
        extension = 'pdf' if output_format == 'pdf' else 'docx'
        return FileResponse(
            io.BytesIO(rendered),
            as_attachment=output_format != 'pdf',
            filename=f'preview-{instance.definition.code}.{extension}',
            content_type=content_type,
        )


class DocumentAttachmentViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = DocumentAttachmentSerializer
    pagination_class = None

    def get_permissions(self):
        permission = CanManageDocumentAttachments if self.action in {'create', 'download'} else CanViewDocuments
        return [permission()]

    def get_queryset(self):
        queryset = DocumentAttachment.objects.select_related('instance', 'instance__definition', 'uploaded_by')
        instance = self.request.query_params.get('instance')
        if instance:
            queryset = queryset.filter(instance_id=instance)
        return queryset.filter(instance__definition_id__in=_accessible_definition_ids(self.request.user, DocumentDefinition.objects.all()))

    def perform_create(self, serializer):
        _enforce_definition_access(self.request.user, serializer.validated_data['instance'].definition)
        attachment = serializer.save()
        from users.signals import log_activity
        log_activity(actor=self.request.user, category='documents', action='document_attachment_upload', target=attachment, message=f'Uploaded attachment {attachment.original_filename}.', metadata={'attachment_id': attachment.id, 'instance_id': attachment.instance_id, 'sha256': attachment.sha256})

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        attachment = self.get_object()
        from users.signals import log_activity
        log_activity(actor=request.user, category='documents', action='document_attachment_download', target=attachment, message=f'Downloaded attachment {attachment.original_filename}.', metadata={'attachment_id': attachment.id, 'instance_id': attachment.instance_id})
        return FileResponse(attachment.file.open('rb'), as_attachment=True, filename=attachment.original_filename, content_type=attachment.content_type)


class DocumentOutputViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = DocumentOutputSerializer
    permission_classes = [CanViewDocuments]

    def get_queryset(self):
        queryset = DocumentOutput.objects.select_related('definition', 'instance', 'template_version', 'generated_by')
        ticket = self.request.query_params.get('ticket')
        instance = self.request.query_params.get('instance')
        if ticket:
            queryset = queryset.filter(ticket_id=ticket)
        if instance:
            queryset = queryset.filter(instance_id=instance)
        return queryset.filter(definition_id__in=_accessible_definition_ids(self.request.user, DocumentDefinition.objects.all()))

    @action(detail=True, methods=['get'], permission_classes=[CanManageDocuments])
    def download(self, request, pk=None):
        output = self.get_object()
        if output.status != 'ready' or not output.file:
            return Response({'detail': 'This output is not available for download.'}, status=status.HTTP_409_CONFLICT)
        from users.signals import log_activity
        log_activity(actor=request.user, category='documents', action='document_download', target=output, message=f'Downloaded archived document output {output.id}.', metadata={'output_id': output.id, 'ticket_id': output.ticket_id})
        return FileResponse(output.file.open('rb'), as_attachment=True, filename=output.original_filename, content_type=DOCX_CONTENT_TYPE)
