# Auto-split from services/views.py
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import ValidationError

from services.document_generation import generate_document as generate_ticket_document
from services.views.helpers import (
    AFTER_SALES_VIEW_CAPABILITIES,
    ASSIGNABLE_TICKET_STATUSES,
    CanAccessServiceTickets,
    CanAccessDocuments,
    CanViewDocuments,
    CanManageDocuments,
    CanManageServiceTickets,
    CanViewReports,
    CLIENT_RESCHEDULABLE_TICKET_STATUSES,
    CONTACTABLE_TICKET_STATUSES,
    CanViewSupervisorDispatch,
    CanViewSupervisorTickets,
    CanViewTechnicianJobs,
    InspectionChecklist,
    IsAdmin,
    IsAdminOrSupervisor,
    IsAdminOrSupervisorOrTechnician,
    PARTS_REQUEST_TICKET_STATUSES,
    PermissionDenied,
    Q,
    Response,
    ServiceLocation,
    ServiceLocationSerializer,
    ServiceStatusHistory,
    ServiceTicket,
    ServiceTicketSerializer,
    Thread,
    User,
    _calculate_route_async,
    _default_ticket_admin_for_actor,
    _notify_ticket_assignment_recipients,
    _notify_ticket_completion_recipients,
    action,
    apply_schedule_fields,
    apply_ticket_status_change,
    build_ticket_search_query,
    clear_reschedule_request,
    create_notification,
    ensure_ticket_checklist_completed,
    get_eligible_technician_ids_for_service,
    get_technician_service_skill,
    get_technician_ticket_queryset,
    get_ticket_team_member_ids,
    get_visible_service_requests_queryset,
    get_visible_service_tickets_queryset,
    is_admin_workspace_role,
    logger,
    normalize_proof_media_payload,
    normalize_time_slot,
    parse_date,
    parse_technician_id_list,
    parse_time,
    permissions,
    save_uploaded_proof_media,
    score_technician_fit,
    send_notification_email,
    send_user_notification,
    serialize_ticket_crew_members,
    serialize_ticket_inventory,
    status,
    sync_request_status_from_ticket,
    sync_technician_availability,
    sync_ticket_crew_assignments,
    sync_ticket_reservations,
    sync_ticket_team_availability,
    ticket_has_technician_access,
    timezone,
    transaction,
    user_can_manage_service_requests,
    user_has_any_capability,
    validate_technician_daily_capacity,
    validate_ticket_transition,
    viewsets,
)
from services.serializers import (
    GeneratedDocumentSerializer,
    InspectionChecklistSerializer,
    ServiceTicketReportSerializer,
    SolarCommissioningChecklistSerializer,
)
from services.models import GeneratedDocument
from services.sla import evaluate_service_ticket_sla, get_ticket_dispatch_state
from inventory.automation import apply_ticket_equipment_plan, create_pending_reservation
from inventory.models import InventoryItem
from services.user_display import client_technician_label


def _notify_admin_ticket_progress(*, ticket, actor, title, body, notification_type='info'):
    recipients = User.objects.filter(role__in=['superadmin', 'admin'], is_active=True)
    if ticket.assigned_admin_id:
        recipients = recipients | User.objects.filter(pk=ticket.assigned_admin_id)
    if actor and actor.role in {'superadmin', 'admin'}:
        recipients = recipients.exclude(pk=actor.pk)

    for recipient in recipients.distinct():
        send_user_notification(
            user=recipient,
            title=title,
            body=body,
            notification_type=notification_type,
            ticket=ticket,
            request=ticket.request,
            send_email=False,
        )

class ServiceLocationViewSet(viewsets.ModelViewSet):
    queryset = ServiceLocation.objects.select_related('request__client', 'request__service_type')
    serializer_class = ServiceLocationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAdminOrSupervisor()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        visible_requests = get_visible_service_requests_queryset(
            self.request.user,
            include_follow_up=True,
        )
        return self.queryset.filter(request__in=visible_requests)


class ServiceTicketViewSet(viewsets.ModelViewSet):
    DOCUMENT_TITLES = {
        'field_service_report': 'Field Service Report',
        'turnover_acceptance': 'Turnover / Acceptance Form',
        'commissioning_checklist': 'PV Solar Site Commissioning Checklist',
        'technical_data_sheet': 'TDS - Technical Data Sheet',
        'installation_contract': 'Solar Installation Contract',
        'quotation_proposal': 'Quotation Proposal',
    }

    queryset = ServiceTicket.objects.all()
    serializer_class = ServiceTicketSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action in ['assign', 'auto_assign']:
            return [CanViewSupervisorDispatch()]
        if self.action == 'document_draft':
            return [CanManageDocuments()] if self.request.method == 'POST' else [CanViewDocuments()]
        if self.action == 'document_prefill':
            return [CanViewDocuments()]
        if self.action in ['generate_document', 'update_project_details']:
            return [CanManageDocuments()]
        if self.action in ['create', 'update', 'partial_update', 'destroy', 'update_status', 'reschedule', 'inspection_decision']:
            return [CanManageServiceTickets()]
        elif self.action in ['start_work', 'complete_work', 'add_progress', 'add_notes', 'upload_photos', 'request_parts', 'contact_client']:
            return [CanViewTechnicianJobs()]
        elif self.action in ['request_reschedule', 'submit_feedback']:
            return [permissions.IsAuthenticated()]
        elif self.action == 'report':
            return [CanViewReports()]
        return [CanAccessServiceTickets()]

    def perform_update(self, serializer):
        requested_status = serializer.validated_data.get('status')
        if requested_status and requested_status != serializer.instance.status:
            raise ValidationError({
                'status': 'Use the update-status action to change ticket status.'
            })
        serializer.save()

    def get_locked_ticket(self):
        """Lock one ticket before assignment or workflow-state mutation."""
        queryset = self.filter_queryset(self.get_queryset()).select_for_update()
        ticket = get_object_or_404(queryset, pk=self.kwargs.get(self.lookup_field))
        self.check_object_permissions(self.request, ticket)
        return ticket

    def get_queryset(self):
        """Filter queryset based on user role with optimized queries"""
        # Optimize by selecting all related objects at once to avoid N+1 queries
        base_queryset = ServiceTicket.objects.select_related(
            'technician',
            'assigned_admin',
            'request',
            'request__service_type',
            'request__client',
            'request__location',
            'inspection',
            'maintenance_schedule'
        ).prefetch_related(
            'crew_assignments__technician',
            'inventory_reservations__item',
            'inventory_reservations__technician',
            'status_history__changed_by',
            'after_sales_cases',
            'installed_equipment',
            'field_service_reports',
        )

        workspace = str(self.request.query_params.get('workspace') or '').strip()
        queue_param = str(self.request.query_params.get('queue') or '').strip()

        if (
            workspace == 'after_sales' and
            (
                is_admin_workspace_role(self.request.user.role) or
                user_has_any_capability(self.request.user, AFTER_SALES_VIEW_CAPABILITIES)
            )
        ):
            return base_queryset.filter(status='Completed').order_by('-completed_date', '-id')

        qs = get_visible_service_tickets_queryset(self.request.user, base_queryset=base_queryset)
        
        search_query = self.request.query_params.get('search')
        if search_query:
            qs = qs.filter(build_ticket_search_query(search_query))

        if queue_param == 'active':
            qs = qs.exclude(status__in=['Completed', 'Cancelled'])
            
        return qs

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """Return stable ticket counts for cards that must not depend on paginated rows."""
        queryset = self.get_queryset()
        tickets = list(queryset)
        active_tickets = [
            ticket for ticket in tickets
            if ticket.status not in ['Completed', 'Cancelled']
        ]
        dispatchable_tickets = [
            ticket for ticket in active_tickets
            if ticket.technician_id is None and ticket.status in ['Not Started', 'For Inspection', 'Ready for Service', 'Awaiting Materials', 'On Hold']
        ]
        assigned_active_tickets = [
            ticket for ticket in active_tickets
            if ticket.technician_id is not None
        ]

        missed_dispatch_count = 0
        warning_count = 0
        overdue_count = 0

        now = timezone.now()
        for ticket in active_tickets:
            try:
                if get_ticket_dispatch_state(ticket).get('is_missed_dispatch'):
                    missed_dispatch_count += 1
            except Exception:
                logger.exception('Failed to evaluate dispatch state for ticket %s', ticket.id)

            try:
                sla_state = evaluate_service_ticket_sla(ticket, now=now).get('state')
                if sla_state == 'warning':
                    warning_count += 1
                elif sla_state == 'overdue':
                    overdue_count += 1
            except Exception:
                logger.exception('Failed to evaluate SLA state for ticket %s', ticket.id)

        return Response({
            'total_tickets': len(tickets),
            'active_queue': len(active_tickets),
            'completed': sum(1 for ticket in tickets if ticket.status == 'Completed'),
            'cancelled': sum(1 for ticket in tickets if ticket.status == 'Cancelled'),
            'unassigned_active': sum(1 for ticket in active_tickets if ticket.technician_id is None),
            'dispatchable': len(dispatchable_tickets),
            'assigned_active': len(assigned_active_tickets),
            'missed_dispatch': missed_dispatch_count,
            'sla_warning': warning_count,
            'sla_overdue': overdue_count,
            'sla_risk': warning_count + overdue_count,
        })

    def _build_document_defaults(self):
        return {
            'company_name': 'AFN Solar Power Engineering Services',
            'company_address': 'Lot2a9, Brgy. Bigo, Pagbilao, Quezon',
            'company_contact': '09171480224 / (042)9111107 | afnsunenergyserv@gmail.com',
            'prepared_by': 'C/ENGR. ARVIN F. NAPENAS',
            'prepared_title': 'General Manager',
            'currency': 'Philippine Peso',
            'payment_method': 'bank transfer',
            'governing_law_jurisdiction': 'Republic of the Philippines',
            'termination_notice_period': '30',
        }

    def _build_missing_fields(self, *, ticket, request_details, location, inspection, solar_commissioning):
        missing = {
            'field_service_report': [],
            'quotation_proposal': [],
            'installation_contract': [],
            'technical_data_sheet': [],
            'commissioning_checklist': [],
            'turnover_acceptance': [],
        }

        client = ticket.request.client if ticket.request_id and ticket.request else None

        if not request_details.get('client_phone') and not getattr(client, 'phone', None):
            missing['field_service_report'].append('contact_number')
            missing['turnover_acceptance'].append('contact_number')
            missing['technical_data_sheet'].append('mobile_number')

        if not location.get('address'):
            missing['field_service_report'].append('address')
            missing['quotation_proposal'].append('location')
            missing['installation_contract'].append('property_address')
            missing['technical_data_sheet'].append('complete_site_address')
            missing['turnover_acceptance'].append('location_address')

        if not request_details.get('client_email'):
            missing['technical_data_sheet'].append('email_address')


        return {
            template: sorted(set(values))
            for template, values in missing.items()
        }

    @action(detail=True, methods=['get'], url_path='document-prefill')
    def document_prefill(self, request, pk=None):
        ticket = self.get_object()
        ticket_data = ServiceTicketSerializer(ticket, context={'request': request}).data
        request_details = ticket_data.get('request_details') or {}
        location = request_details.get('location') or {}

        try:
            inspection_obj = ticket.inspection
            inspection = InspectionChecklistSerializer(inspection_obj, context={'request': request}).data
        except InspectionChecklist.DoesNotExist:
            inspection = None

        try:
            solar_obj = ticket.solar_commissioning_checklist
            solar_commissioning = SolarCommissioningChecklistSerializer(solar_obj, context={'request': request}).data
        except Exception:
            solar_commissioning = None

        try:
            turnover_obj = ticket.turnover_acceptance
            from services.serializers import TurnoverAcceptanceSerializer
            turnover_acceptance = TurnoverAcceptanceSerializer(turnover_obj, context={'request': request}).data
        except Exception:
            turnover_acceptance = None

        try:
            tds_obj = ticket.technical_data_sheet
            from services.serializers import TechnicalDataSheetSerializer
            technical_data_sheet = TechnicalDataSheetSerializer(tds_obj, context={'request': request}).data
        except Exception:
            technical_data_sheet = None

        try:
            fsr_objs = ticket.field_service_reports.all()
            from services.serializers import FieldServiceReportSerializer
            field_service_reports = FieldServiceReportSerializer(fsr_objs, many=True, context={'request': request}).data
        except Exception:
            field_service_reports = []
        latest_field_service_report = field_service_reports[-1] if field_service_reports else None

        try:
            quotation_obj = ticket.quotation
            from services.serializers import QuotationRecordSerializer
            quotation_record = QuotationRecordSerializer(quotation_obj, context={'request': request}).data
        except Exception:
            quotation_record = None

        try:
            contract_obj = ticket.installation_contract
            from services.serializers import InstallationContractSerializer
            installation_contract = InstallationContractSerializer(contract_obj, context={'request': request}).data
        except Exception:
            installation_contract = None

        try:
            solar_project_profile_obj = getattr(ticket.request.location, 'solar_project_profile', None) if ticket.request_id and ticket.request and ticket.request.location_id else None
            from services.serializers import SolarProjectProfileSerializer
            solar_project_profile = (
                SolarProjectProfileSerializer(solar_project_profile_obj, context={'request': request}).data
                if solar_project_profile_obj else None
            )
        except Exception:
            solar_project_profile = None

        client = ticket.request.client if ticket.request_id and ticket.request else None
        technician = ticket.technician if ticket.technician_id else None

        client_payload = {
            'id': getattr(client, 'id', None),
            'first_name': getattr(client, 'first_name', '') or '',
            'middle_name': getattr(client, 'middle_name', '') or '',
            'last_name': getattr(client, 'last_name', '') or '',
            'full_name': request_details.get('client_fullname') or request_details.get('client_name') or '',
            'email': request_details.get('client_email') or '',
            'phone': request_details.get('client_phone') or '',
            'landline': getattr(client, 'landline', '') or '',
            'company_name': getattr(getattr(client, 'client_profile', None), 'company_name', '') or '',
            'address': request_details.get('client_address') or '',
        }

        technician_payload = {
            'id': getattr(technician, 'id', None),
            'name': client_technician_label(technician) or '',
            'username': getattr(technician, 'username', '') or '',
            'phone': getattr(technician, 'phone', '') or '',
        }

        service_request_payload = {
            'id': request_details.get('id'),
            'service_type_id': request_details.get('service_type'),
            'service_type_name': request_details.get('service_type_name') or ticket_data.get('service') or '',
            'service_summary': request_details.get('service_summary') or ticket_data.get('service') or '',
            'description': request_details.get('description') or '',
            'preferred_date': request_details.get('preferred_date'),
            'preferred_time_slot': request_details.get('preferred_time_slot') or '',
            'scheduling_notes': request_details.get('scheduling_notes') or '',
            'request_source': request_details.get('request_source') or '',
        }

        service_location_payload = {
            'address': location.get('address') or '',
            'city': location.get('city') or '',
            'province': location.get('province') or '',
            'latitude': location.get('latitude'),
            'longitude': location.get('longitude'),
        }

        completion_payload = {
            'completed_date': ticket.completed_date,
            'completion_notes': ticket.completion_notes or '',
            'completion_proof_images': ticket.completion_proof_images or [],
        }

        warranty_payload = {
            'status': ticket.warranty_status,
            'period_days': ticket.warranty_period_days,
            'start_date': ticket.warranty_start_date,
            'end_date': ticket.warranty_end_date,
            'notes': ticket.warranty_notes or '',
            'inspection_warranty_provided': inspection.get('warranty_provided') if inspection else False,
            'inspection_warranty_period_days': inspection.get('warranty_period_days') if inspection else None,
        }

        payload = {
            'ticket': {
                'id': ticket.id,
                'ticket_code': ticket_data.get('ticket_code'),
                'status': ticket.status,
                'priority': ticket.priority,
                'scheduled_date': ticket.scheduled_date,
                'scheduled_time': ticket.scheduled_time,
                'scheduled_time_slot': ticket.scheduled_time_slot,
                'completed_date': ticket.completed_date,
                'service': ticket_data.get('service') or '',
                'technician_fullname': ticket_data.get('technician_fullname') or '',
                'project_details': ticket.project_details or {},
            },
            'client': client_payload,
            'service_request': service_request_payload,
            'service_location': service_location_payload,
            'technician': technician_payload,
            'inspection': inspection,
            'solar_commissioning': solar_commissioning,
            'solar_project_profile': solar_project_profile,
            'quotation_record': quotation_record,
            'turnover_acceptance': turnover_acceptance,
            'technical_data_sheet': technical_data_sheet,
            'installation_contract': installation_contract,
            'completion': completion_payload,
            'inventory': serialize_ticket_inventory(ticket),
            'warranty': warranty_payload,
            'after_sales': ticket_data.get('after_sales_cases') or [],
            'maintenance': ticket_data.get('maintenance_schedule'),
            'field_service_reports': field_service_reports,
            'latest_field_service_report': latest_field_service_report,
            'document_defaults': self._build_document_defaults(),
            'missing_fields': self._build_missing_fields(
                ticket=ticket,
                request_details=request_details,
                location=service_location_payload,
                inspection=inspection,
                solar_commissioning=solar_commissioning,
            ),
        }

        return Response(payload)

    @action(detail=True, methods=['get', 'post'], url_path='document-draft')
    def document_draft(self, request, pk=None):
        ticket = self.get_object()
        allowed_document_types = set(self.DOCUMENT_TITLES)

        if request.method.lower() == 'get':
            document_type = str(request.query_params.get('document_type') or '').strip()
            if not document_type:
                return Response(
                    {'detail': 'document_type is required.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if document_type not in allowed_document_types:
                return Response(
                    {'detail': 'Invalid document type.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            document = (
                ticket.generated_documents
                .filter(document_type=document_type)
                .select_related('generated_by')
                .first()
            )

            return Response({
                'document': GeneratedDocumentSerializer(document, context={'request': request}).data
                if document else None
            })

        document_type = str(request.data.get('document_type') or '').strip()
        if not document_type:
            return Response(
                {'detail': 'document_type is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if document_type not in allowed_document_types:
            return Response(
                {'detail': 'Invalid document type.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        data_json = request.data.get('data_json')
        if data_json is None:
            data_json = {}
        if not isinstance(data_json, dict):
            return Response(
                {'detail': 'data_json must be an object.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        source_snapshot_json = request.data.get('source_snapshot_json')
        if source_snapshot_json is None:
            source_snapshot_json = {}
        if not isinstance(source_snapshot_json, dict):
            return Response(
                {'detail': 'source_snapshot_json must be an object.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        status_value = str(request.data.get('status') or 'draft').strip() or 'draft'
        allowed_statuses = {choice[0] for choice in GeneratedDocument.STATUS_CHOICES}
        if status_value not in allowed_statuses:
            return Response(
                {'detail': 'Invalid document status.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        defaults = {
            'title': str(request.data.get('title') or self.DOCUMENT_TITLES.get(document_type, document_type)).strip(),
            'status': status_value,
            'data_json': data_json,
            'source_snapshot_json': source_snapshot_json,
            'generated_by': request.user,
        }
        document, _ = GeneratedDocument.objects.update_or_create(
            ticket=ticket,
            document_type=document_type,
            defaults=defaults,
        )

        serializer = GeneratedDocumentSerializer(document, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='update-project-details')
    def update_project_details(self, request, pk=None):
        ticket = self.get_object()
        project_details = request.data.get('project_details')
        if not isinstance(project_details, dict):
            return Response({'detail': 'project_details must be an object.'}, status=status.HTTP_400_BAD_REQUEST)

        existing_details = ticket.project_details or {}
        existing_details.update(project_details)
        ticket.project_details = existing_details
        ticket.save(update_fields=['project_details'])
        
        return Response({'status': 'Project details updated.', 'project_details': ticket.project_details})

    @action(detail=True, methods=['post'], url_path='generate-document')
    def generate_document(self, request, pk=None):
        ticket = self.get_object()
        document_type = str(request.data.get('document_type') or 'field_service_report').strip()
        report_id = request.data.get('report_id')
        if report_id in (None, ''):
            report_id = request.query_params.get('report_id')

        if report_id not in (None, ''):
            try:
                report_id = int(report_id)
            except (TypeError, ValueError):
                return Response(
                    {'error': 'report_id must be a valid integer.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            report_id = None

        try:
            output_path = generate_ticket_document(
                ticket,
                document_type,
                report_id=report_id,
            )
        except FileNotFoundError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except ValueError as exc:
            return Response(
                {'error': str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return FileResponse(
            output_path.open('rb'),
            as_attachment=True,
            filename=output_path.name,
            content_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        )

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def assign(self, request, pk=None):
        """
        Unified assignment endpoint - replaces assign_technician and old assign.
        Accepts: technician_id (required), auto_assign (bool), calculate_route (bool)
        """
        ticket = self.get_object()
        technician_id = request.data.get('technician_id')
        dispatch_stage = str(request.data.get('dispatch_stage') or 'service').strip().lower()
        crew_ids_value = (
            request.data.getlist('crew_ids')
            if hasattr(request.data, 'getlist') and request.data.getlist('crew_ids')
            else request.data.get('crew_ids')
        )

        if ticket.status not in ASSIGNABLE_TICKET_STATUSES:
            return Response(
                {'error': f'Only tickets in {" or ".join(sorted(ASSIGNABLE_TICKET_STATUSES))} can be assigned.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if dispatch_stage not in {'service', 'inspection'}:
            return Response(
                {'error': 'dispatch_stage must be either service or inspection.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        requires_inspection = bool(ticket.request.service_type.requires_site_inspection)
        if dispatch_stage == 'inspection' and not requires_inspection:
            return Response(
                {'error': 'This service does not require a site inspection.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if (
            dispatch_stage == 'service'
            and requires_inspection
            and ticket.status not in {'Inspection Completed', 'Ready for Service'}
        ):
            return Response(
                {'error': 'This service requires a site inspection before service dispatch.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not technician_id:
            return Response({'error': 'technician_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            crew_ids = parse_technician_id_list(crew_ids_value)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        try:
            try:
                primary_technician_id = int(technician_id)
            except (TypeError, ValueError):
                raise User.DoesNotExist

            locked_technicians = {
                team_member.id: team_member
                for team_member in User.objects.select_for_update().filter(
                    id__in=sorted(set(crew_ids + [primary_technician_id])),
                    role='technician',
                ).order_by('id')
            }
            technician = locked_technicians.get(primary_technician_id)
            if technician is None:
                raise User.DoesNotExist
            if technician.status != 'active':
                return Response({'error': 'Technician must be active before assignment.'}, status=status.HTTP_400_BAD_REQUEST)

            scheduled_date = None
            if request.data.get('scheduled_date'):
                scheduled_date = parse_date(str(request.data.get('scheduled_date')))
                if scheduled_date is None:
                    return Response({'error': 'scheduled_date must be a valid date'}, status=status.HTTP_400_BAD_REQUEST)

            scheduled_time = None
            if request.data.get('scheduled_time'):
                scheduled_time = parse_time(str(request.data.get('scheduled_time')))
                if scheduled_time is None:
                    return Response({'error': 'scheduled_time must be a valid time'}, status=status.HTTP_400_BAD_REQUEST)

            requested_time_slot = request.data.get('scheduled_time_slot')
            if requested_time_slot not in [None, ''] and normalize_time_slot(requested_time_slot) is None:
                return Response({'error': 'scheduled_time_slot must be a supported time slot'}, status=status.HTTP_400_BAD_REQUEST)

            effective_scheduled_date = scheduled_date or ticket.scheduled_date

            # Enforce daily assignment limit per service type
            service_type = ticket.request.service_type
            if not get_technician_service_skill(technician, service_type):
                return Response(
                    {
                        'error': (
                            f'{technician.username} is not assigned to "{service_type.name}". '
                            'Add this service skill or General Services to the technician before dispatching the ticket.'
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            daily_count = get_technician_ticket_queryset(technician).filter(
                scheduled_date=effective_scheduled_date,
                request__service_type=service_type,
            ).exclude(pk=ticket.pk).exclude(status='Cancelled').count()
            if daily_count >= service_type.max_daily_assignments:
                return Response(
                    {'error': f'{technician.username} already has {daily_count} "{service_type.name}" job(s) on {effective_scheduled_date}. '
                              f'Limit is {service_type.max_daily_assignments}/day.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                validate_technician_daily_capacity(technician, effective_scheduled_date, ticket)
            except ValueError as exc:
                return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

            crew_ids = [crew_id for crew_id in crew_ids if crew_id != technician.id]
            crew_lookup = {
                crew_id: locked_technicians[crew_id]
                for crew_id in crew_ids
                if crew_id in locked_technicians
            }
            missing_crew_ids = [crew_id for crew_id in crew_ids if crew_id not in crew_lookup]
            if missing_crew_ids:
                return Response(
                    {'error': 'One or more crew members were not found.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            inactive_crew_members = [
                crew_member.username
                for crew_member in crew_lookup.values()
                if crew_member.status != 'active'
            ]
            if inactive_crew_members:
                return Response(
                    {
                        'error': (
                            'Crew members must be active before assignment: '
                            + ', '.join(inactive_crew_members)
                            + '.'
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            crew_members = [crew_lookup[crew_id] for crew_id in crew_ids]
            for crew_member in crew_members:
                try:
                    validate_technician_daily_capacity(crew_member, effective_scheduled_date, ticket)
                except ValueError as exc:
                    return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

            previous_team_ids = get_ticket_team_member_ids(ticket)
            if ticket.assigned_admin_id is None:
                ticket.assigned_admin = _default_ticket_admin_for_actor(request.user)
            ticket.technician = technician
            ticket.assigned_at = timezone.now()
            apply_schedule_fields(
                ticket,
                scheduled_date=scheduled_date,
                scheduled_time=scheduled_time,
                scheduled_time_slot=requested_time_slot,
            )
            ticket.smart_assignment_score = None
            ticket.smart_assignment_summary = None
            ticket.save()
            sync_ticket_crew_assignments(ticket, crew_members)
            sync_ticket_team_availability(ticket, extra_technicians=previous_team_ids)
            assignment_status = None
            if dispatch_stage == 'inspection' and ticket.status != 'For Inspection':
                assignment_status = 'For Inspection'
            elif dispatch_stage == 'service' and ticket.status in {'Awaiting Materials', 'On Hold'}:
                assignment_status = 'Ready for Service'

            if assignment_status:
                try:
                    apply_ticket_status_change(
                        ticket,
                        assignment_status,
                        changed_by=request.user,
                        notes=(
                            'Dispatched for site inspection'
                            if assignment_status == 'For Inspection'
                            else 'Materials ready; dispatched for service'
                        ),
                    )
                except ValueError as exc:
                    return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

            inventory_summary = sync_ticket_reservations(ticket, performed_by=request.user)
            equipment_plan = request.data.get('equipment_reservations', None)
            if equipment_plan is not None:
                try:
                    inventory_summary = apply_ticket_equipment_plan(
                        ticket,
                        equipment_plan,
                        performed_by=request.user,
                    )
                except (InventoryItem.DoesNotExist, TypeError, ValueError) as exc:
                    return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

            # Calculate routing information if coordinates available
            try:
                loc = ticket.request.location
                if loc.latitude and loc.longitude and technician.current_latitude and technician.current_longitude:
                    from services.ors_utils import get_route
                    route = get_route(
                        (float(loc.longitude), float(loc.latitude)),
                        (float(technician.current_longitude), float(technician.current_latitude))
                    )
                    if route and 'features' in route and route['features']:
                        geom = route['features'][0].get('geometry')
                        props = route['features'][0].get('properties', {}).get('segments', [{}])[0]
                        ticket.route_geometry = geom
                        ticket.route_distance = props.get('distance')
                        ticket.route_duration = props.get('duration')
                        ticket.save()
            except Exception as e:
                logger.warning(f"Route calculation failed for ticket {ticket.id}: {e}")

            crew_note = f" with crew: {', '.join(member.username for member in crew_members)}" if crew_members else ''

            # Create status history
            ServiceStatusHistory.objects.create(
                ticket=ticket,
                status=ticket.status,
                changed_by=request.user,
                notes=f"Technician {technician.username} assigned{crew_note}"
            )

            _notify_ticket_assignment_recipients(
                ticket=ticket,
                technician=technician,
                acting_user=request.user,
                crew_members=crew_members,
                auto_assigned=False,
            )
            send_user_notification(
                user=ticket.request.client,
                title=f"Technician Assigned for Ticket #{ticket.id}",
                body=(
                    f"Your service ticket #{ticket.id} is now assigned to {technician.username}"
                    f"{f' with {len(crew_members)} additional technician(s)' if crew_members else ''}"
                    f"{f' for {ticket.scheduled_date}' if ticket.scheduled_date else ''}."
                ),
                notification_type='info',
                ticket=ticket,
                request=ticket.request,
            )

            return Response({
                'success': True,
                'message': 'Technician assigned' if not crew_members else 'Technician and crew assigned',
                'ticket_id': ticket.id,
                'technician': {
                    'id': technician.id,
                    'username': technician.username
                },
                'crew_members': serialize_ticket_crew_members(ticket),
                'route_distance': ticket.route_distance,
                'route_duration': ticket.route_duration,
                'inventory_summary': inventory_summary,
                'status': ticket.status,
            })
        except User.DoesNotExist:
            return Response(
                {'error': 'Technician not found', 'success': False},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def inspection_decision(self, request, pk=None):
        ticket = self.get_locked_ticket()
        decision = str(request.data.get('decision') or '').strip().lower()
        notes = str(request.data.get('notes') or '').strip()
        scheduled_date = str(request.data.get('scheduled_date') or '').strip()

        decision_map = {
            'approve_service': ('Ready for Service', 'Inspection approved. Ticket is ready for service.'),
            'ready_for_service': ('Ready for Service', 'Inspection approved. Ticket is ready for service.'),
            'awaiting_materials': ('Awaiting Materials', 'Inspection reviewed. Ticket is awaiting materials.'),
            'cancel': ('Cancelled', 'Inspection reviewed. Ticket was cancelled.'),
            'reject': ('Cancelled', 'Inspection reviewed. Ticket was rejected.'),
        }
        if decision not in decision_map:
            return Response(
                {'error': 'Choose approve_service, awaiting_materials, or cancel.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        target_status, default_note = decision_map[decision]

        if decision in ['cancel', 'reject'] and not notes:
            return Response(
                {'error': 'A reason (notes) is required when cancelling or rejecting a ticket after inspection.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        is_approval = decision in ['approve_service', 'ready_for_service']

        if ticket.status != 'Inspection Completed':
            return Response(
                {'error': 'Inspection decisions can only be made after inspection is completed.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            if target_status in ['Ready for Service', 'Awaiting Materials']:
                ticket.technician = None
                ticket.ticket_type = 'installation'
                ticket.start_time = None
                ticket.route_distance = None
                ticket.route_duration = None
                ticket.route_geometry = None
                ticket.assigned_at = None
                sync_ticket_crew_assignments(ticket, [])

                try:
                    checklist = ticket.inspection
                    checklist.is_completed = False
                    checklist.completed_at = None
                    checklist.completed_by = None
                    checklist.save(update_fields=['is_completed', 'completed_at', 'completed_by'])
                except InspectionChecklist.DoesNotExist:
                    pass

            ticket._activity_reason = notes or default_note
            resolved_status = apply_ticket_status_change(
                ticket,
                target_status,
                changed_by=request.user,
                notes=notes or default_note,
            )
            # Make sure it saves
            ticket.save()
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        if is_approval:
            if scheduled_date:
                ticket.scheduled_date = scheduled_date
                ticket.save()
                from datetime import datetime
                try:
                    dt = datetime.strptime(scheduled_date, '%Y-%m-%d')
                    formatted_date = dt.strftime('%B %d, %Y').replace(' 0', ' ')
                except ValueError:
                    formatted_date = scheduled_date
                client_title = f"Service Approved"
                client_body = f"Inspection is complete. Your installation has been scheduled for {formatted_date}."
            else:
                client_title = f"Service Approved"
                client_body = f"Inspection is complete. Ticket #{ticket.id} is ready for service."
            notification_type = 'success'

        elif target_status == 'Awaiting Materials':
            client_title = f"Ticket #{ticket.id} Awaiting Materials"
            client_body = f"Inspection is complete. Ticket #{ticket.id} is waiting for required materials."
            notification_type = 'warning'
        else:
            client_title = f"Ticket #{ticket.id} Cancelled"
            client_body = f"After inspection review, ticket #{ticket.id} was cancelled."
            notification_type = 'warning'

        send_user_notification(
            user=ticket.request.client,
            title=client_title,
            body=client_body,
            notification_type=notification_type,
            ticket=ticket,
            request=ticket.request,
        )
        if ticket.technician:
            send_user_notification(
                user=ticket.technician,
                title=f"Inspection Decision for Ticket #{ticket.id}",
                body=f"Admin decision: {resolved_status}.",
                notification_type='info',
                ticket=ticket,
                request=ticket.request,
            )

        return Response({
            'success': True,
            'ticket_id': ticket.id,
            'status': resolved_status,
            'message': default_note,
        })

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def auto_assign(self, request, pk=None):
        """Auto-assign the best available technician using skill, distance, and workload."""
        ticket = self.get_locked_ticket()
        service_type = ticket.request.service_type
        current_tech_id = ticket.technician_id  # Remember current technician for comparison

        if ticket.status not in ASSIGNABLE_TICKET_STATUSES:
            return Response(
                {'error': f'Only tickets in {" or ".join(sorted(ASSIGNABLE_TICKET_STATUSES))} can be auto-assigned.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Get location of the service request
        try:
            location = ticket.request.location
            request_lat = location.latitude
            request_lon = location.longitude
        except ServiceLocation.DoesNotExist:
            return Response({'error': 'Service location not found'}, status=status.HTTP_400_BAD_REQUEST)

        # Find technicians with the exact service skill, or General Services as fallback.
        skilled_technicians = get_eligible_technician_ids_for_service(service_type)

        # Get available technicians with required skills
        # Exclude the CURRENT technician from this query to allow reassignment
        available_technicians = User.objects.filter(
            id__in=skilled_technicians,
            role='technician',
            status='active',
            technician_profile__is_available=True
        ).exclude(
            id=current_tech_id  # Exclude ONLY the current technician
        ).exclude(
            # Exclude technicians already deeply overloaded (3+ active tickets)
            assigned_tickets__status__in=['Not Started', 'In Progress']
        ).distinct()

        # If no one else available, allow current technician to stay
        if not available_technicians:
            if current_tech_id:
                available_technicians = User.objects.filter(id=current_tech_id)
            else:
                return Response(
                    {'error': 'No available technicians with required skills', 'success': False},
                    status=status.HTTP_409_CONFLICT
                )

        ranked_candidates = []
        for tech in available_technicians:
            # Set default location if missing
            if not tech.current_latitude or not tech.current_longitude:
                tech.current_latitude = 14.5995
                tech.current_longitude = 120.9842
                tech.save()

            candidate = score_technician_fit(ticket, tech, request_lat, request_lon)
            if candidate is not None:
                candidate['technician'] = tech
                ranked_candidates.append(candidate)

        if not ranked_candidates:
            return Response(
                {'error': 'No technicians have enough routing and skill data for smart assignment', 'success': False},
                status=status.HTTP_409_CONFLICT
            )

        ranked_candidates.sort(
            key=lambda item: (
                item.get('daily_assigned_minutes', 0),
                -item['score'],
            )
        )
        best_candidate = ranked_candidates[0]
        selected_technician = User.objects.select_for_update().get(
            pk=best_candidate['technician'].pk,
            role='technician',
        )
        if selected_technician.status != 'active' or not selected_technician.is_available:
            return Response(
                {'error': 'The selected technician is no longer available. Refresh and try again.', 'success': False},
                status=status.HTTP_409_CONFLICT,
            )

        if selected_technician:
            previous_team_ids = get_ticket_team_member_ids(ticket)
            if ticket.assigned_admin_id is None:
                ticket.assigned_admin = _default_ticket_admin_for_actor(request.user)
            ticket.technician = selected_technician
            ticket.auto_assigned = True
            ticket.assigned_at = timezone.now()
            ticket.smart_assignment_score = best_candidate['score']
            ticket.smart_assignment_summary = best_candidate['summary']
            ticket.save()
            sync_ticket_crew_assignments(ticket, [])

            sync_ticket_team_availability(ticket, extra_technicians=previous_team_ids)
            
            assignment_status = None
            if ticket.ticket_type == 'inspection' and ticket.status != 'For Inspection':
                assignment_status = 'For Inspection'
            elif ticket.ticket_type == 'service' and ticket.status in {'Awaiting Materials', 'On Hold', 'Not Started'}:
                assignment_status = 'Ready for Service'

            if assignment_status:
                try:
                    apply_ticket_status_change(
                        ticket,
                        assignment_status,
                        changed_by=request.user,
                        notes=(
                            'Dispatched for site inspection'
                            if assignment_status == 'For Inspection'
                            else 'Materials ready; dispatched for service'
                        ),
                    )
                except ValueError as exc:
                    return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

            inventory_summary = sync_ticket_reservations(ticket, performed_by=request.user)

            # compute route details asynchronously to avoid blocking response
            loc = ticket.request.location
            if loc.latitude and loc.longitude and selected_technician.current_latitude and selected_technician.current_longitude:
                start_coords = (float(loc.longitude), float(loc.latitude))
                end_coords = (float(selected_technician.current_longitude), float(selected_technician.current_latitude))
                # Start route calculation in background thread
                route_thread = Thread(
                    target=_calculate_route_async,
                    args=(ticket.id, start_coords, end_coords),
                    daemon=True
                )
                route_thread.start()

            # Create status history
            action = "re-assigned" if current_tech_id and current_tech_id != selected_technician.id else "auto-assigned"
            ServiceStatusHistory.objects.create(
                ticket=ticket,
                status=ticket.status,
                changed_by=request.user,
                notes=(
                    f"Smart-{action} to {selected_technician.username} "
                    f"(score {best_candidate['score']}, distance {best_candidate['distance_km']:.2f} km, "
                    f"{best_candidate['summary']})"
                )
            )

            _notify_ticket_assignment_recipients(
                ticket=ticket,
                technician=selected_technician,
                acting_user=request.user,
                crew_members=[],
                auto_assigned=True,
            )
            send_user_notification(
                user=ticket.request.client,
                title=f"Technician Assigned for Ticket #{ticket.id}",
                body=(
                    f"Your service ticket #{ticket.id} was auto-assigned to "
                    f"{client_technician_label(selected_technician) or selected_technician.username}."
                ),
                notification_type='info',
                ticket=ticket,
                request=ticket.request,
            )

            return Response({
                'success': True,
                'message': f'Technician auto-{action}',
                'ticket_id': ticket.id,
                'technician': {
                    'id': selected_technician.id,
                    'username': selected_technician.username
                },
                'crew_members': [],
                'distance_km': best_candidate['distance_km'],
                'assignment_score': best_candidate['score'],
                'assignment_summary': best_candidate['summary'],
                'candidate_ranking': [
                    {
                        'technician_id': item['technician'].id,
                        'technician_name': (
                            client_technician_label(item['technician']) or item['technician'].username
                        ),
                        'score': item['score'],
                        'distance_km': item['distance_km'],
                        'skill_level': item['skill_level'],
                    }
                    for item in ranked_candidates[:3]
                ],
                'route_distance': ticket.route_distance,
                'route_duration': ticket.route_duration,
                'inventory_summary': inventory_summary,
            })

        return Response(
            {'error': 'Could not find suitable technician', 'success': False},
            status=status.HTTP_409_CONFLICT
        )

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def update_status(self, request, pk=None):
        """Update ticket status with history tracking"""
        ticket = self.get_locked_ticket()
        new_status = request.data.get('status')
        notes = request.data.get('notes', '')

        if not new_status:
            return Response({'error': 'status is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            resolved_status = apply_ticket_status_change(
                ticket,
                new_status,
                changed_by=request.user,
                notes=notes or f'Status updated to {new_status}',
            )
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        send_user_notification(
            user=ticket.request.client,
            title=f"Service Ticket #{ticket.id} Status Updated",
            body=f"Service status updated to {resolved_status} for ticket #{ticket.id}.",
            notification_type='info',
            ticket=ticket,
            request=ticket.request,
        )
        if ticket.technician and ticket.technician != request.user:
            send_user_notification(
                user=ticket.technician,
                title=f"Ticket #{ticket.id} Status Updated",
                body=f"Ticket #{ticket.id} status was updated to {resolved_status}.",
                notification_type='info',
                ticket=ticket,
                request=ticket.request,
            )

        return Response({
            'success': True,
            'message': 'Status updated',
            'ticket_id': ticket.id,
            'status': resolved_status
        })

    def get_technician_active_job(self, technician):
        """Get the active job for a technician (if they have one)"""
        return ServiceTicket.objects.filter(
            Q(technician=technician) | Q(crew_assignments__technician=technician),
            status__in=['Navigating', 'Arrived on Site', 'In Progress', 'On Hold']
        ).select_related('technician', 'request__client', 'request__service_type').first()

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def start_work(self, request, pk=None):
        """Mark ticket as started - only if technician has no other active jobs"""
        ticket = self.get_locked_ticket()
        User.objects.select_for_update().get(pk=request.user.pk)
        if not ticket_has_technician_access(ticket, request.user):
            raise PermissionDenied('You can only start tickets assigned to you or your crew.')

        # Check if technician already has an active job
        active_job = self.get_technician_active_job(request.user)
        if active_job and active_job.id != ticket.id:
            return Response({
                'error': f'You already have an active job (Ticket #{active_job.id}). '
                         f'Please complete or hold it before starting a new one.',
                'active_job': {
                    'id': active_job.id,
                    'client': active_job.request.client.username,
                    'service': active_job.request.service_type.name,
                    'status': active_job.status,
                }
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            resolved_status = apply_ticket_status_change(
                ticket,
                'In Progress',
                changed_by=request.user,
                notes='Work started',
            )
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        send_user_notification(
            user=ticket.request.client,
            title=f"Work Started for Ticket #{ticket.id}",
            body=f"Work has started for ticket #{ticket.id}.",
            notification_type='info',
            ticket=ticket,
            request=ticket.request,
        )
        _notify_admin_ticket_progress(
            ticket=ticket,
            actor=request.user,
            title=f"Ticket #{ticket.id} In Progress",
            body=f"{client_technician_label(request.user) or request.user.username} started work on ticket #{ticket.id}.",
            notification_type='info',
        )

        return Response({'status': resolved_status, 'start_time': ticket.start_time})

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def complete_work(self, request, pk=None):
        """Mark ticket as completed with optional proof images"""
        ticket = self.get_locked_ticket()
        if not ticket_has_technician_access(ticket, request.user):
            raise PermissionDenied('You can only complete tickets assigned to you or your crew.')
        if ticket.technician_id != request.user.id:
            raise PermissionDenied('Only the lead technician can complete this ticket.')

        proof_images = request.data.get('completion_proof_images', [])
        if proof_images is None:
            proof_images = []
        elif not isinstance(proof_images, list):
            proof_images = [proof_images]

        completion_notes = request.data.get('completion_notes') or ''
        ticket.completion_proof_images = proof_images
        ticket.completion_notes = completion_notes
        extra_update_fields = ['completion_proof_images', 'completion_notes']
        status_notes = completion_notes or 'Completed via complete_work.'

        try:
            validate_ticket_transition(ticket, 'Completed')
            ensure_ticket_checklist_completed(ticket)
            resolved_status = apply_ticket_status_change(
                ticket,
                'Completed',
                changed_by=request.user,
                notes=status_notes,
                extra_update_fields=extra_update_fields,
                inventory_usage=request.data.get('inventory_usage'),
            )
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        if resolved_status == 'Completed':
            from .helpers import record_arrival_validation_log, sync_ticket_maintenance_schedule
            from ..maintenance import sync_completion_follow_up_case
            record_arrival_validation_log(
                ticket=ticket,
                technician=request.user,
                performed_by=request.user,
                action='job_completed',
                validation_result='not_required',
                remarks=status_notes,
            )
            sync_ticket_maintenance_schedule(ticket)
            sync_completion_follow_up_case(ticket)
            send_user_notification(
                user=ticket.request.client,
                title=f"Ticket #{ticket.id} Completed",
                body=f"Your service ticket #{ticket.id} has been completed.",
                notification_type='success',
                ticket=ticket,
                request=ticket.request,
            )
            _notify_ticket_completion_recipients(ticket=ticket, technician=request.user)

        return Response({
            'status': resolved_status,
            'ticket_id': ticket.id,
            'completion_proof_images': ticket.completion_proof_images,
            'completion_notes': ticket.completion_notes,
        })

    @action(detail=True, methods=['post'])
    def submit_feedback(self, request, pk=None):
        """Allow clients to rate and provide feedback for completed tickets"""
        ticket = self.get_object()
        if request.user.role != 'client' or ticket.request.client_id != request.user.id:
            raise PermissionDenied('You can only rate your own completed tickets.')
        if ticket.status != 'Completed':
            return Response({'error': 'Feedback can only be submitted for completed tickets'}, status=status.HTTP_400_BAD_REQUEST)

        rating = request.data.get('rating', request.data.get('client_rating'))
        feedback = str(request.data.get('feedback', request.data.get('client_feedback', ''))).strip()

        try:
            rating = int(rating)
        except (TypeError, ValueError):
            return Response({'error': 'rating must be a number from 1 to 5'}, status=status.HTTP_400_BAD_REQUEST)

        if rating < 1 or rating > 5:
            return Response({'error': 'rating must be between 1 and 5'}, status=status.HTTP_400_BAD_REQUEST)

        ticket.client_rating = rating
        ticket.client_feedback = feedback or None
        ticket.save(update_fields=['client_rating', 'client_feedback', 'updated_at'])

        if ticket.technician:
            send_user_notification(
                user=ticket.technician,
                title=f"Feedback Received for Ticket #{ticket.id}",
                body=f"Client feedback received for ticket #{ticket.id}: {rating}/5.",
                notification_type='info',
                ticket=ticket,
                request=ticket.request,
            )

        return Response({
            'status': 'Feedback submitted',
            'client_rating': ticket.client_rating,
            'client_feedback': ticket.client_feedback,
        })

    @action(detail=True, methods=['post'])
    def upload_photos(self, request, pk=None):
        ticket = self.get_object()
        photos = request.data.get('photos', []) or []
        videos = request.data.get('videos', []) or []
        media = request.data.get('media', []) or []
        uploaded_media = []
        if hasattr(request.FILES, 'getlist'):
            uploaded_media.extend(
                save_uploaded_proof_media(
                    ticket=ticket,
                    uploaded_files=request.FILES.getlist('photo_files'),
                    request=request,
                    media_type='photo',
                )
            )
            uploaded_media.extend(
                save_uploaded_proof_media(
                    ticket=ticket,
                    uploaded_files=request.FILES.getlist('video_files'),
                    request=request,
                    media_type='video',
                )
            )

        proof_media = normalize_proof_media_payload(photos=photos, videos=videos, media=media) + uploaded_media
        if not proof_media:
            return Response({'error': 'At least one photo or video proof entry is required'}, status=status.HTTP_400_BAD_REQUEST)

        checklist, _ = InspectionChecklist.objects.get_or_create(ticket=ticket)
        checklist.proof_media = list(checklist.proof_media or []) + proof_media
        checklist.save(update_fields=['proof_media'])

        photo_count = sum(1 for item in proof_media if item['type'] == 'photo')
        video_count = sum(1 for item in proof_media if item['type'] == 'video')
        ServiceStatusHistory.objects.create(
            ticket=ticket,
            status=ticket.status,
            changed_by=request.user,
            notes=f"Proof uploaded: {photo_count} photo(s), {video_count} video(s)"
        )

        return Response({
            'status': 'Proof uploaded',
            'photos': [item for item in proof_media if item['type'] == 'photo'],
            'videos': [item for item in proof_media if item['type'] == 'video'],
            'media': proof_media,
        })

    @action(detail=True, methods=['post'])
    def request_parts(self, request, pk=None):
        ticket = self.get_object()
        if request.user.role == 'technician' and not ticket_has_technician_access(ticket, request.user):
            return Response({'error': 'You can only request equipment for assigned tickets.'}, status=status.HTTP_403_FORBIDDEN)

        notes = str(request.data.get('notes') or '').strip()
        requested_parts = str(request.data.get('parts') or '').strip()
        item_requests = request.data.get('items') or request.data.get('equipment') or []
        if not isinstance(item_requests, list):
            return Response({'error': 'Equipment items must be a list.'}, status=status.HTTP_400_BAD_REQUEST)
        item_requests = list(item_requests)

        item_id = request.data.get('item_id') or request.data.get('itemId')
        if item_id:
            item_requests.append({
                'item_id': item_id,
                'quantity': request.data.get('quantity', 1),
            })

        requested_items = []
        if item_requests:
            item_quantities = {}
            for entry in item_requests:
                entry_item_id = entry.get('item_id') or entry.get('itemId') or entry.get('id')
                quantity_value = entry.get('quantity', 1)
                if not entry_item_id:
                    return Response({'error': 'Each equipment item must include an item_id.'}, status=status.HTTP_400_BAD_REQUEST)
                try:
                    normalized_item_id = int(entry_item_id)
                    quantity = int(quantity_value)
                except (TypeError, ValueError):
                    return Response({'error': 'Equipment item and quantity must be valid numbers.'}, status=status.HTTP_400_BAD_REQUEST)
                if quantity <= 0:
                    return Response({'error': 'Quantity must be greater than zero.'}, status=status.HTTP_400_BAD_REQUEST)
                item_quantities[normalized_item_id] = item_quantities.get(normalized_item_id, 0) + quantity

            inventory_items = {
                item.id: item
                for item in InventoryItem.objects.filter(id__in=item_quantities.keys())
            }
            missing_item_ids = [item_id for item_id in item_quantities.keys() if item_id not in inventory_items]
            if missing_item_ids:
                return Response({'error': 'One or more equipment items were not found.'}, status=status.HTTP_404_NOT_FOUND)

            for entry_item_id, quantity in item_quantities.items():
                item = inventory_items[entry_item_id]
                if quantity > item.available_quantity:
                    return Response(
                        {'error': f'Only {item.available_quantity} unit(s) are available for {item.name}.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                requested_items.append({'item': item, 'quantity': quantity})

            requested_parts = ', '.join(
                f"{entry['item'].name} x{entry['quantity']}" for entry in requested_items
            )

        if not requested_parts:
            return Response({'error': 'Requested equipment must be provided'}, status=status.HTTP_400_BAD_REQUEST)
        if ticket.status not in PARTS_REQUEST_TICKET_STATUSES:
            return Response(
                {'error': 'Additional equipment can only be requested for active or inspected tickets.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        reservations = []
        try:
            with transaction.atomic():
                for entry in requested_items:
                    item = entry['item']
                    quantity = entry['quantity']
                    reservation_notes = f'Additional equipment requested by {request.user.username}'
                    if notes:
                        reservation_notes = f'{reservation_notes}: {notes}'
                    reservation = create_pending_reservation(
                        item=item,
                        quantity=quantity,
                        technician=request.user,
                        required_date=ticket.scheduled_date or timezone.localdate(),
                        service_ticket=ticket,
                        performed_by=request.user,
                        notes=reservation_notes,
                    )
                    if reservation:
                        reservations.append(reservation)

                status_notes = f"Additional equipment requested: {requested_parts}"
                if notes:
                    status_notes = f'{status_notes} - {notes}'
                if ticket.status in {'In Progress', 'Inspection Completed', 'Ready for Service'}:
                    apply_ticket_status_change(
                        ticket,
                        'Awaiting Materials',
                        changed_by=request.user,
                        notes=status_notes,
                    )
                else:
                    ServiceStatusHistory.objects.create(
                        ticket=ticket,
                        status=ticket.status,
                        changed_by=request.user,
                        notes=status_notes,
                    )
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        # Notify admin workspace users that equipment is requested
        admins = User.objects.filter(role__in=['superadmin', 'admin'])
        for u in list(admins):
            send_user_notification(
                user=u,
                title=f"Equipment Requested for Ticket #{ticket.id}",
                body=f"Additional equipment requested for ticket #{ticket.id}: {requested_parts}",
                notification_type='warning',
                ticket=ticket,
                request=ticket.request,
            )
        client_message = (
                f"Ticket #{ticket.id} is temporarily on hold while additional equipment is being arranged."
                if ticket.status == 'On Hold'
                else f"Additional equipment is being arranged for ticket #{ticket.id}."
        )
        send_user_notification(
            user=ticket.request.client,
            title=f"Equipment Update for Ticket #{ticket.id}",
            body=client_message,
            notification_type='info',
            ticket=ticket,
            request=ticket.request,
        )

        response_payload = {'status': 'Additional equipment requested', 'parts': requested_parts}
        if reservations:
            response_payload['reservations'] = [
                {
                'id': reservation.id,
                'item_id': reservation.item_id,
                'item_name': reservation.item.name,
                'item_sku': reservation.item.sku,
                'quantity': reservation.quantity,
                'status': reservation.status,
                'required_date': reservation.required_date,
                'technician_id': reservation.technician_id,
                'technician_name': reservation.technician.username,
                'notes': reservation.notes,
                }
                for reservation in reservations
            ]
            response_payload['reservation'] = response_payload['reservations'][0]
            response_payload['inventory_reservations'] = serialize_ticket_inventory(ticket)
        return Response(response_payload)

    @action(detail=True, methods=['post'])
    def contact_client(self, request, pk=None):
        ticket = self.get_object()
        if ticket.status not in CONTACTABLE_TICKET_STATUSES:
            return Response(
                {'error': 'Clients can only be contacted while the ticket is active.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        method = request.data.get('method', 'phone')
        message = request.data.get('message', 'Technician needs to contact you regarding the service ticket.')

        # Notify client in-app and via email where available
        client = ticket.request.client
        send_user_notification(
            user=client,
            title='Technician Contact',
            body=f"{request.user.username} ({method}) says: {message}",
            notification_type='info',
            ticket=ticket,
            request=ticket.request,
        )

        ServiceStatusHistory.objects.create(
            ticket=ticket,
            status=ticket.status,
            changed_by=request.user,
            notes=f"Contact client via {method}: {message}"
        )

        return Response({'status': 'Client contacted', 'method': method})

    @action(detail=True, methods=['post'])
    def request_reschedule(self, request, pk=None):
        """Allow client to request rescheduling of their ticket"""
        with transaction.atomic():
            ticket = self.get_object()
            if request.user.role != 'client' or ticket.request.client_id != request.user.id:
                raise PermissionDenied('Only the client can request a reschedule.')

            if ticket.status in ['In Progress', 'Completed', 'Cancelled'] or ticket.start_time:
                return Response(
                    {'error': 'Reschedule can only be requested before work has started.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            preferred_date = request.data.get('preferred_date')
            preferred_time_slot = request.data.get('preferred_time_slot')
            reason = str(request.data.get('reason') or '').strip()

            if not reason:
                return Response(
                    {'error': 'Please provide a reason for rescheduling.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            ticket.reschedule_requested = True
            ticket.reschedule_reason = reason
            ticket.reschedule_requested_at = timezone.now()
            ticket.save(update_fields=['reschedule_requested', 'reschedule_reason', 'reschedule_requested_at', 'updated_at'])

            if preferred_date or preferred_time_slot:
                if preferred_date:
                    ticket.request.preferred_date = preferred_date
                if preferred_time_slot:
                    ticket.request.preferred_time_slot = preferred_time_slot
                ticket.request.save(update_fields=['preferred_date', 'preferred_time_slot', 'updated_at'])

            admins = User.objects.filter(role__in=['superadmin', 'admin'])
            for admin in admins:
                send_user_notification(
                    user=admin,
                    title=f"Reschedule Requested for Ticket #{ticket.id}",
                    body=f"Client requested reschedule: {reason}",
                    notification_type='warning',
                    ticket=ticket,
                    request=ticket.request,
                )

            return Response({
                'status': 'Reschedule requested',
                'reschedule_requested': True,
                'reschedule_reason': reason,
            })

    @action(detail=True, methods=['post'])
    def reschedule(self, request, pk=None):
        """Allow staff/admin to confirm rescheduling of a ticket"""
        with transaction.atomic():
            ticket = self.get_object()
            if not user_can_manage_service_requests(request.user) and not CanManageServiceTickets().has_permission(request, self):
                raise PermissionDenied('You do not have permission to reschedule tickets.')

            scheduled_date = request.data.get('scheduled_date')
            scheduled_time_slot = request.data.get('scheduled_time_slot')
            scheduled_time = request.data.get('scheduled_time')
            notes = str(request.data.get('notes') or '').strip()

            update_fields = ['updated_at']
            if scheduled_date:
                ticket.scheduled_date = parse_date(scheduled_date) if isinstance(scheduled_date, str) else scheduled_date
                update_fields.append('scheduled_date')
            if scheduled_time_slot:
                ticket.scheduled_time_slot = normalize_time_slot(scheduled_time_slot)
                update_fields.append('scheduled_time_slot')

            if scheduled_time:
                from datetime import datetime as dt
                if isinstance(scheduled_time, str):
                    ticket.scheduled_time = dt.strptime(scheduled_time, '%H:%M').time()
                else:
                    ticket.scheduled_time = scheduled_time
                update_fields.append('scheduled_time')
            elif ticket.scheduled_time_slot and not ticket.scheduled_time:
                slot_times = {'morning': '09:00', 'afternoon': '15:00', 'evening': '18:00'}
                time_str = slot_times.get(ticket.scheduled_time_slot, '09:00')
                from datetime import datetime as dt
                ticket.scheduled_time = dt.strptime(time_str, '%H:%M').time()
                update_fields.append('scheduled_time')
            elif ticket.scheduled_time_slot and scheduled_date:
                slot_times = {'morning': '09:00', 'afternoon': '15:00', 'evening': '18:00'}
                time_str = slot_times.get(ticket.scheduled_time_slot, '09:00')
                from datetime import datetime as dt
                ticket.scheduled_time = dt.strptime(time_str, '%H:%M').time()
                update_fields.append('scheduled_time')

            clear_reschedule_request(ticket)
            update_fields.extend(['reschedule_requested', 'reschedule_reason', 'reschedule_requested_at'])

            if notes:
                ticket._activity_reason = notes

            ticket.save(update_fields=list(dict.fromkeys(update_fields)))
            sync_ticket_team_availability(ticket)

            ServiceStatusHistory.objects.create(
                ticket=ticket,
                status=ticket.status,
                changed_by=request.user,
                notes=notes or f"Ticket rescheduled to {ticket.scheduled_date} ({ticket.scheduled_time_slot})."
            )

            send_user_notification(
                user=ticket.request.client,
                title=f"Ticket #{ticket.id} Rescheduled",
                body=f"Your ticket has been rescheduled to {ticket.scheduled_date} ({ticket.scheduled_time_slot}).",
                notification_type='info',
                ticket=ticket,
                request=ticket.request,
            )
            if ticket.technician:
                send_user_notification(
                    user=ticket.technician,
                    title=f"Ticket #{ticket.id} Rescheduled",
                    body=f"Ticket #{ticket.id} scheduled for {ticket.scheduled_date} ({ticket.scheduled_time_slot}).",
                    notification_type='info',
                    ticket=ticket,
                    request=ticket.request,
                )

            return Response({
                'status': 'Rescheduled',
                'scheduled_date': ticket.scheduled_date,
                'scheduled_time_slot': ticket.scheduled_time_slot,
            })

    @action(detail=True, methods=['get'])
    def inventory_summary(self, request, pk=None):
        ticket = self.get_object()
        return Response({
            'ticket_id': ticket.id,
            'inventory_reservations': serialize_ticket_inventory(ticket),
        })

    @action(detail=True, methods=['get'])
    def proof_images(self, request, pk=None):
        """
        Secure proof image access with role-based permissions.

        Accessible by:
        - Client: Only their own service tickets
        - Admin/Superadmin: All tickets
        - Technician: Their assigned tickets
        """
        ticket = self.get_object()
        user = request.user
        user_role = str(user.role).strip().lower()

        # Check access permissions
        can_access = False

        # Admins and Superadmins can see all
        if user_role in ['admin', 'superadmin']:
            can_access = True
        # Technicians can see their assigned tickets
        elif user_role == 'technician':
            if ticket.technician == user or ticket.crew_assignments.filter(technician=user).exists():
                can_access = True
        # Clients can only see their own service tickets
        elif user_role == 'client':
            if ticket.request and ticket.request.client == user:
                can_access = True

        if not can_access:
            raise PermissionDenied('You do not have permission to view images for this ticket.')
        # Return proof images
        proof_images = ticket.completion_proof_images or []

        return Response({
            'ticket_id': ticket.id,
            'client': str(ticket.request.client) if ticket.request else None,
            'service_type': str(ticket.request.service_type.name) if ticket.request else None,
            'completion_proof_images': proof_images,
            'has_proof_images': len(proof_images) > 0,
            'image_count': len(proof_images),
        })

    @action(detail=False, methods=['get'])
    def report(self, request):
        """Service Ticket Report endpoint with proper field formatting"""
        # Use the report serializer for proper field names
        queryset = self.get_queryset().select_related(
            'request__client',
            'request__service_type',
            'technician'
        ).order_by('-created_at')

        serializer = ServiceTicketReportSerializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='promote-to-project-profile')
    def promote_to_project_profile(self, request, pk=None):
        ticket = self.get_object()
        from services.models import SolarEstimate
        from services.models.documents import SolarProjectProfile
        from services.serializers import SolarProjectProfileSerializer

        location = getattr(ticket.request, 'location', None)
        if not location:
            return Response({'detail': 'A service location is required to create a project profile.'}, status=status.HTTP_400_BAD_REQUEST)

        estimate = SolarEstimate.objects.filter(service_request=ticket.request).first()
        if not estimate and ticket.request.client_id:
            estimate = SolarEstimate.objects.filter(client_id=ticket.request.client_id, status='converted').order_by('-converted_at').first()

        snapshot = (estimate.result_snapshot or {}) if estimate else {}
        promo = (estimate.selected_promotion or {}) if estimate else {}

        number_of_panels = int(snapshot.get('panelCount') or getattr(estimate, 'panelCount', 0) or 0)
        panel_brand = promo.get('panelBrand') or 'Standard High-Efficiency PV'
        inverter_brand = promo.get('inverterBrand') or 'Grid-Tie Inverter'
        number_of_inverters = int(snapshot.get('inverterCount') or 1)
        battery_brand = promo.get('batteryBrand') or ''
        mounting_structure = 'Rooftop / Standard Flush Mount'

        cap = snapshot.get('installedCapacity')
        if cap is not None:
            system_capacity = f"{float(cap):.2f} kWp"
        elif estimate and getattr(estimate, 'panel_wattage', None) and number_of_panels:
            system_capacity = f"{(number_of_panels * estimate.panel_wattage) / 1000:.2f} kWp"
        else:
            system_capacity = "3.50 kWp"

        if hasattr(ticket, 'technical_data_sheet') and ticket.technical_data_sheet:
            tds = ticket.technical_data_sheet
            if tds.rooftop_type:
                mounting_structure = tds.rooftop_type

        profile, created = SolarProjectProfile.objects.update_or_create(
            location=location,
            defaults={
                'original_ticket': ticket,
                'system_capacity': system_capacity,
                'panel_brand': panel_brand,
                'number_of_panels': number_of_panels,
                'inverter_brand': inverter_brand,
                'number_of_inverters': number_of_inverters,
                'battery_brand': battery_brand,
                'mounting_structure': mounting_structure,
            }
        )
        return Response(SolarProjectProfileSerializer(profile).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

class InstalledEquipmentViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    from services.models import InstalledEquipment
    from services.serializers import InstalledEquipmentSerializer
    queryset = InstalledEquipment.objects.all()
    serializer_class = InstalledEquipmentSerializer

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [CanManageDocuments()]
        return [CanAccessDocuments()]

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if user.role == 'client':
            queryset = queryset.filter(client=user)
        elif user.role == 'technician':
            visible_tickets = get_visible_service_tickets_queryset(user)
            queryset = queryset.filter(ticket__in=visible_tickets)
        elif not is_admin_workspace_role(user.role):
            queryset = queryset.none()
        client_id = self.request.query_params.get('client_id')
        if client_id:
            client_id = str(client_id).strip()
            if client_id.isdigit():
                queryset = queryset.filter(client_id=int(client_id))
            else:
                queryset = queryset.none()
        return queryset

    def perform_create(self, serializer):
        serializer.save()

class QuotationRecordViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    from services.models import QuotationRecord
    from services.serializers import QuotationRecordSerializer
    queryset = QuotationRecord.objects.all()
    serializer_class = QuotationRecordSerializer

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [CanManageDocuments()]
        return [CanAccessDocuments()]

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if user.role == 'client':
            queryset = queryset.filter(client=user)
        elif user.role == 'technician':
            queryset = queryset.filter(ticket__in=get_visible_service_tickets_queryset(user))
        elif not is_admin_workspace_role(user.role):
            queryset = queryset.none()
        ticket_id = self.request.query_params.get('ticket_id')
        if ticket_id:
            queryset = queryset.filter(ticket_id=ticket_id)
        return queryset

    def perform_create(self, serializer):
        serializer.save()



class SolarProjectProfileViewSet(viewsets.ModelViewSet):
    from services.models.documents import SolarProjectProfile
    queryset = SolarProjectProfile.objects.all()
    from services.serializers import SolarProjectProfileSerializer
    serializer_class = SolarProjectProfileSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [CanManageDocuments()]
        return [CanAccessDocuments()]

    def get_queryset(self):
        queryset = self.queryset
        user = self.request.user
        if user.role == 'client':
            queryset = queryset.filter(original_ticket__request__client=user)
        elif user.role == 'technician':
            queryset = queryset.filter(original_ticket__in=get_visible_service_tickets_queryset(user))
        elif not is_admin_workspace_role(user.role):
            queryset = queryset.none()

        location_id = self.request.query_params.get('location')
        if location_id:
            queryset = queryset.filter(location_id=location_id)
        return queryset

    @action(detail=False, methods=['post'], url_path='promote-estimate')
    def promote_estimate(self, request):
        from services.models import ServiceTicket, SolarEstimate
        from services.models.documents import SolarProjectProfile

        ticket_id = request.data.get('ticket_id') or request.data.get('ticket')
        estimate_id = request.data.get('estimate_id') or request.data.get('estimate')

        ticket = None
        estimate = None
        location = None

        if ticket_id:
            try:
                ticket = ServiceTicket.objects.select_related('request__location').get(pk=ticket_id)
                location = getattr(ticket.request, 'location', None)
            except ServiceTicket.DoesNotExist:
                return Response({'detail': 'Service ticket not found.'}, status=status.HTTP_404_NOT_FOUND)

        if estimate_id:
            try:
                estimate = SolarEstimate.objects.select_related('service_request__location').get(pk=estimate_id)
                if not location and getattr(estimate, 'service_request', None):
                    location = getattr(estimate.service_request, 'location', None)
            except SolarEstimate.DoesNotExist:
                return Response({'detail': 'Solar estimate not found.'}, status=status.HTTP_404_NOT_FOUND)

        if not estimate and ticket:
            estimate = SolarEstimate.objects.filter(service_request=ticket.request).first()
            if not estimate and ticket.request.client_id:
                estimate = SolarEstimate.objects.filter(client_id=ticket.request.client_id, status='converted').order_by('-converted_at').first()

        if not location:
            return Response({'detail': 'A service location is required to promote into SolarProjectProfile.'}, status=status.HTTP_400_BAD_REQUEST)

        snapshot = (estimate.result_snapshot or {}) if estimate else {}
        promo = (estimate.selected_promotion or {}) if estimate else {}

        number_of_panels = int(snapshot.get('panelCount') or getattr(estimate, 'panelCount', 0) or 0)
        panel_brand = promo.get('panelBrand') or 'Standard High-Efficiency PV'
        inverter_brand = promo.get('inverterBrand') or 'Grid-Tie Inverter'
        number_of_inverters = int(snapshot.get('inverterCount') or 1)
        battery_brand = promo.get('batteryBrand') or ''
        mounting_structure = 'Rooftop / Standard Flush Mount'

        cap = snapshot.get('installedCapacity')
        if cap is not None:
            system_capacity = f"{float(cap):.2f} kWp"
        elif estimate and getattr(estimate, 'panel_wattage', None) and number_of_panels:
            system_capacity = f"{(number_of_panels * estimate.panel_wattage) / 1000:.2f} kWp"
        else:
            system_capacity = "3.50 kWp"

        if ticket and hasattr(ticket, 'technical_data_sheet') and ticket.technical_data_sheet:
            tds = ticket.technical_data_sheet
            if tds.rooftop_type:
                mounting_structure = tds.rooftop_type

        profile, created = SolarProjectProfile.objects.update_or_create(
            location=location,
            defaults={
                'original_ticket': ticket or getattr(location.request, 'ticket', None),
                'system_capacity': system_capacity,
                'panel_brand': panel_brand,
                'number_of_panels': number_of_panels,
                'inverter_brand': inverter_brand,
                'number_of_inverters': number_of_inverters,
                'battery_brand': battery_brand,
                'mounting_structure': mounting_structure,
            }
        )
        return Response(self.get_serializer(profile).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

class FieldServiceReportViewSet(viewsets.ModelViewSet):
    from services.models.documents import FieldServiceReport
    queryset = FieldServiceReport.objects.all()
    from services.serializers import FieldServiceReportSerializer
    serializer_class = FieldServiceReportSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.request.user.role == 'technician' and self.action in ['list', 'retrieve', 'create', 'update', 'partial_update']:
            return [CanViewTechnicianChecklist()]
        if self.action in ['create', 'update', 'partial_update']:
            return [CanManageDocuments()]
        if self.action == 'destroy':
            return [CanManageDocuments()]
        return [CanAccessDocuments()]

    def get_queryset(self):
        queryset = self.queryset.order_by('created_at', 'id')
        user = self.request.user
        if user.role == 'client':
            queryset = queryset.filter(ticket__request__client=user)
        elif user.role == 'technician':
            queryset = queryset.filter(ticket__in=get_visible_service_tickets_queryset(user))
        elif not is_admin_workspace_role(user.role):
            queryset = queryset.none()

        ticket_id = self.request.query_params.get('ticket')
        if ticket_id:
            queryset = queryset.filter(ticket_id=ticket_id)
        return queryset

    def perform_create(self, serializer):
        ticket = serializer.validated_data['ticket']
        if self.request.user.role == 'technician' and not ticket_has_technician_access(ticket, self.request.user):
            raise PermissionDenied('You can only create reports for tickets assigned to you.')
        serializer.save()
