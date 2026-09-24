# Auto-split from services/views.py
from decimal import Decimal, InvalidOperation

from rest_framework import serializers, viewsets, permissions
from users.permissions import IsAdmin

from services.models import SolarCommissioningChecklist, TurnoverAcceptance, TechnicalDataSheet, InstallationContract
from services.serializers import SolarCommissioningChecklistSerializer, TurnoverAcceptanceSerializer, TechnicalDataSheetSerializer, InstallationContractSerializer
from services.views.helpers import *  # noqa: F401,F403
from services.tracking_config import get_tracking_config

class TechnicianSkillViewSet(viewsets.ModelViewSet):
    queryset = TechnicianSkill.objects.select_related('technician', 'service_type')
    serializer_class = TechnicianSkillSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAdmin()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        if is_admin_workspace_role(user.role):
            return self.queryset
        if user.role == 'technician':
            return self.queryset.filter(technician=user)
        return self.queryset.none()

    def perform_create(self, serializer):
        technician_id = self.request.data.get('technician')
        if not technician_id:
            raise serializers.ValidationError({'technician': 'A technician is required.'})

        try:
            technician = User.objects.get(id=technician_id, role='technician')
        except (TypeError, ValueError, User.DoesNotExist):
            raise serializers.ValidationError({'technician': 'Select a valid technician.'})

        if TechnicianSkill.objects.filter(
            technician=technician,
            service_type=serializer.validated_data['service_type'],
        ).exists():
            raise serializers.ValidationError({
                'service_type': 'This technician already has a skill entry for that service type.',
            })

        serializer.save(technician=technician)

    def perform_update(self, serializer):
        serializer.save()

    def perform_destroy(self, instance):
        instance.delete()


class ServiceStatusHistoryViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ServiceStatusHistory.objects.select_related(
        'ticket__request__client',
        'ticket__request__service_type',
        'changed_by',
    )
    serializer_class = ServiceStatusHistorySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        visible_tickets = get_visible_service_tickets_queryset(self.request.user)
        queryset = self.queryset.filter(ticket__in=visible_tickets)
        ticket_id = self.request.query_params.get('ticket')
        if ticket_id:
            queryset = queryset.filter(ticket_id=ticket_id)
        return queryset.order_by('-timestamp', '-id')


class InspectionChecklistViewSet(viewsets.ModelViewSet):
    queryset = InspectionChecklist.objects.select_related(
        'ticket__request__client',
        'ticket__request__service_type',
        'ticket__technician',
        'completed_by',
    )
    serializer_class = InspectionChecklistSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.request.user.role == 'technician' and self.action in ['list', 'retrieve', 'create', 'update', 'partial_update', 'complete']:
            return [CanViewTechnicianChecklist()]
        if self.action in ['create', 'update', 'partial_update', 'complete']:
            return [IsAdminOrSupervisorOrTechnician()]
        if self.action == 'destroy':
            return [IsAdminOrSupervisor()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        visible_tickets = get_visible_service_tickets_queryset(self.request.user)
        qs = self.queryset.filter(ticket__in=visible_tickets)
        
        ticket_id = self.request.query_params.get('ticket')
        if ticket_id:
            qs = qs.filter(ticket_id=ticket_id)
            
        return qs.order_by('-created_at', '-id')

    def perform_create(self, serializer):
        ticket = serializer.validated_data['ticket']
        if self.request.user.role == 'technician' and not ticket_has_technician_access(ticket, self.request.user):
            raise PermissionDenied('You can only create inspection checklists for tickets assigned to you or your crew.')
        checklist = serializer.save(submitted_by=self.request.user, submitted_at=timezone.now())
        self._sync_inspection_completion_status(checklist)
        sync_ticket_maintenance_schedule(checklist.ticket)
        # Create notification for technician
        for assigned_technician in get_ticket_team_members(checklist.ticket):
            create_notification(
                assigned_technician,
                f"New inspection checklist created for ticket #{checklist.ticket.id}",
                'info'
            )

    def perform_update(self, serializer):
        checklist = serializer.save(submitted_by=self.request.user, submitted_at=timezone.now())
        self._sync_inspection_completion_status(checklist)
        sync_ticket_maintenance_schedule(checklist.ticket)

    def _sync_inspection_completion_status(self, checklist):
        ticket = checklist.ticket
        if not checklist.is_completed:
            return
        was_dispatched_for_inspection = ServiceStatusHistory.objects.filter(
            ticket=ticket,
            status='For Inspection',
        ).exists()
        if ticket.status not in {'For Inspection', 'In Progress'} or not was_dispatched_for_inspection:
            return
        try:
            apply_ticket_status_change(
                ticket,
                'Inspection Completed',
                changed_by=self.request.user,
                notes='Technician submitted the site inspection report.',
            )
        except ValueError:
            logger.exception('Unable to mark ticket %s inspection completed', ticket.id)

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def complete(self, request, pk=None):
        """Mark inspection as completed"""
        checklist = self.get_queryset().select_for_update().get(pk=pk)
        if checklist.is_completed:
            return Response({'status': 'Inspection completed'})
        checklist.is_completed = True
        checklist.completed_at = timezone.now()
        checklist.completed_by = request.user
        checklist.save()
        self._sync_inspection_completion_status(checklist)
        sync_ticket_maintenance_schedule(checklist.ticket)

        create_notification(
            checklist.ticket.request.client,
            f"Inspection completed for ticket #{checklist.ticket.id}",
            'info'
        )
        technician_name = _display_name(request.user) or 'Technician'
        service_name = (
            checklist.ticket.request.service_type.name
            if checklist.ticket.request and checklist.ticket.request.service_type
            else 'service'
        )
        client_name = _display_name(checklist.ticket.request.client) if checklist.ticket.request else 'the client'
        _notify_admin_superadmin(
            message=(
                f"{technician_name} completed the checklist for ticket #{checklist.ticket.id} "
                f"for {service_name} requested by {client_name}."
            ),
            notification_type='success',
            include_user=checklist.ticket.assigned_admin if checklist.ticket.assigned_admin_id else None,
        )

        return Response({'status': 'Inspection completed'})

    @action(detail=True, methods=['get'])
    def proof_media(self, request, pk=None):
        """
        Secure inspection proof media access with role-based permissions.

        Accessible by:
        - Client: Only their own inspection checklists
        - Admin/Superadmin: All inspection checklists
        - Supervisor: All inspection checklists
        - Technician: Their assigned inspections
        """
        checklist = self.get_object()
        user = request.user
        user_role = str(user.role).strip().lower()

        # Check access permissions
        can_access = False

        # Admins and Superadmins can see all
        if user_role in ['admin', 'superadmin']:
            can_access = True
        # Technicians can see their assigned tickets' inspections
        elif user_role == 'technician':
            ticket = checklist.ticket
            if ticket.technician == user or ticket.crew_assignments.filter(technician=user).exists():
                can_access = True
        # Clients can only see their own inspections
        elif user_role == 'client':
            if checklist.ticket.request and checklist.ticket.request.client == user:
                can_access = True

        if not can_access:
            raise PermissionDenied('You do not have permission to view media for this inspection.')

        # Return proof media
        proof_media = checklist.proof_media or []

        return Response({
            'checklist_id': checklist.id,
            'ticket_id': checklist.ticket.id,
            'client': str(checklist.ticket.request.client) if checklist.ticket.request else None,
            'service_type': str(checklist.ticket.request.service_type.name) if checklist.ticket.request else None,
            'proof_media': proof_media,
            'has_proof_media': len(proof_media) > 0,
            'media_count': len(proof_media),
        })


class SolarCommissioningChecklistViewSet(viewsets.ModelViewSet):
    queryset = SolarCommissioningChecklist.objects.select_related(
        'ticket__request__client',
        'ticket__request__location',
        'ticket__request__service_type',
        'ticket__technician',
        'completed_by',
    )
    serializer_class = SolarCommissioningChecklistSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.request.user.role == 'technician' and self.action in ['list', 'retrieve', 'create', 'update', 'partial_update', 'complete']:
            return [CanViewTechnicianChecklist()]
        if self.action in ['create', 'update', 'partial_update', 'complete']:
            return [CanManageDocuments()]
        if self.action == 'destroy':
            return [CanManageDocuments()]
        return [CanAccessDocuments()]

    def get_queryset(self):
        visible_tickets = get_visible_service_tickets_queryset(self.request.user)
        qs = self.queryset.filter(ticket__in=visible_tickets)

        ticket_id = self.request.query_params.get('ticket')
        if ticket_id:
            qs = qs.filter(ticket_id=ticket_id)

        return qs

    def perform_create(self, serializer):
        ticket = serializer.validated_data['ticket']
        if self.request.user.role == 'technician' and not ticket_has_technician_access(ticket, self.request.user):
            raise PermissionDenied('You can only create commissioning checklists for tickets assigned to you or your crew.')

        completed_by = self.request.user if serializer.validated_data.get('status') in {'completed', 'finalized'} else None
        serializer.save(completed_by=completed_by)

    def perform_update(self, serializer):
        completed_by = None
        if serializer.validated_data.get('status', getattr(serializer.instance, 'status', 'draft')) in {'completed', 'finalized'}:
            completed_by = self.request.user
        serializer.save(completed_by=completed_by or serializer.instance.completed_by)

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def complete(self, request, pk=None):
        checklist = self.get_queryset().select_for_update().get(pk=pk)
        if checklist.status == 'finalized':
            return Response(
                {'error': 'Finalized commissioning checklists are immutable.'},
                status=status.HTTP_409_CONFLICT,
            )
        if checklist.status == 'completed':
            return Response({'status': 'completed'})
        checklist.status = 'completed'
        checklist.completed_by = request.user
        checklist.save(update_fields=['status', 'completed_by', 'updated_at'])
        return Response({'status': 'completed'})


class TurnoverAcceptanceViewSet(viewsets.ModelViewSet):
    queryset = TurnoverAcceptance.objects.select_related(
        'ticket__request__client',
        'ticket__request__location',
        'ticket__request__service_type',
        'ticket__technician',
        'finalized_by',
        'generated_document'
    )
    serializer_class = TurnoverAcceptanceSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.request.user.role == 'technician' and self.action in ['list', 'retrieve', 'create', 'update', 'partial_update']:
            return [CanViewTechnicianChecklist()]
        if self.action in ['create', 'update', 'partial_update', 'finalize']:
            return [CanManageDocuments()]
        if self.action == 'destroy':
            return [CanManageDocuments()]
        return [CanAccessDocuments()]

    def get_queryset(self):
        visible_tickets = get_visible_service_tickets_queryset(self.request.user)
        qs = self.queryset.filter(ticket__in=visible_tickets)
        ticket_id = self.request.query_params.get('ticket')
        if ticket_id:
            qs = qs.filter(ticket_id=ticket_id)
        return qs

    def perform_create(self, serializer):
        ticket = serializer.validated_data['ticket']
        if self.request.user.role == 'technician' and not ticket_has_technician_access(ticket, self.request.user):
            raise PermissionDenied('You can only create turnover acceptances for tickets assigned to you.')
        turnover = serializer.save()
        if turnover.status in {'finalized', 'accepted'}:
            sync_ticket_maintenance_schedule(ticket)

    def perform_update(self, serializer):
        turnover = serializer.save()
        if turnover.status in {'finalized', 'accepted'}:
            sync_ticket_maintenance_schedule(turnover.ticket)

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def finalize(self, request, pk=None):
        turnover = self.get_queryset().select_for_update().select_related('ticket').get(pk=pk)
        if turnover.status in {'finalized', 'accepted'}:
            return Response(
                {'error': 'This turnover acceptance has already been finalized.'},
                status=status.HTTP_409_CONFLICT,
            )

        ticket = ServiceTicket.objects.select_for_update().get(pk=turnover.ticket_id)
        if ticket.status != 'Completed':
            return Response(
                {'error': 'The service ticket must be completed before turnover can be finalized.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        allowed_fields = {
            'turnover_date',
            'accepted_by_client_name',
            'accepted_by_client_contact',
            'warranty_start_date',
        }
        payload = {key: value for key, value in request.data.items() if key in allowed_fields}
        serializer = self.get_serializer(turnover, data=payload, partial=True)
        serializer.is_valid(raise_exception=True)
        turnover = serializer.save()
        turnover.status = 'finalized'
        turnover.finalized_by = request.user
        turnover.finalized_at = timezone.now()
        turnover.save(update_fields=['status', 'finalized_by', 'finalized_at', 'updated_at'])

        # Update Ticket Status and Warranty
        warranty_update_fields = []
        if turnover.warranty_start_date:
            ticket.warranty_start_date = turnover.warranty_start_date
            ticket.warranty_status = 'active'
            warranty_update_fields.extend(['warranty_start_date', 'warranty_status'])
            
            # Optionally calculate end date if period is known
            if ticket.warranty_period_days:
                ticket.warranty_end_date = turnover.warranty_start_date + timezone.timedelta(days=ticket.warranty_period_days)
                warranty_update_fields.append('warranty_end_date')

        try:
            apply_ticket_status_change(
                ticket,
                'Turned Over / Accepted',
                changed_by=request.user,
                notes='Turnover acceptance finalized.',
                extra_update_fields=warranty_update_fields,
            )
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        sync_ticket_maintenance_schedule(ticket)

        return Response({'status': 'finalized', 'ticket_status': ticket.status})


class TechnicalDataSheetViewSet(viewsets.ModelViewSet):
    queryset = TechnicalDataSheet.objects.select_related(
        'ticket__request__client',
        'ticket__request__location',
        'ticket__request__service_type',
        'ticket__technician',
        'prepared_by',
        'reviewed_by'
    )
    serializer_class = TechnicalDataSheetSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.request.user.role == 'technician' and self.action in ['list', 'retrieve', 'create', 'update', 'partial_update', 'submit']:
            return [CanViewTechnicianChecklist()]
        if self.action in ['create', 'update', 'partial_update', 'submit', 'review']:
            return [CanManageDocuments()]
        if self.action == 'destroy':
            return [CanManageDocuments()]
        return [CanAccessDocuments()]

    def get_queryset(self):
        visible_tickets = get_visible_service_tickets_queryset(self.request.user)
        qs = self.queryset.filter(ticket__in=visible_tickets)
        ticket_id = self.request.query_params.get('ticket')
        if ticket_id:
            qs = qs.filter(ticket_id=ticket_id)
        return qs

    def perform_create(self, serializer):
        ticket = serializer.validated_data['ticket']
        if self.request.user.role == 'technician' and not ticket_has_technician_access(ticket, self.request.user):
            raise PermissionDenied('You can only create technical data sheets for tickets assigned to you.')
        serializer.save(prepared_by=self.request.user)

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def submit(self, request, pk=None):
        tds = self.get_queryset().select_for_update().get(pk=pk)
        if tds.status != 'draft':
            return Response(
                {'error': f'Only draft technical data sheets can be submitted; this sheet is {tds.status}.'},
                status=status.HTTP_409_CONFLICT,
            )
        tds.status = 'submitted'
        tds.submitted_at = timezone.now()
        tds.save(update_fields=['status', 'submitted_at'])
        return Response({'status': 'submitted'})

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def review(self, request, pk=None):
        tds = self.get_queryset().select_for_update().get(pk=pk)
        if not is_admin_workspace_role(request.user.role):
            raise PermissionDenied("Only admins can review the TDS.")
        if tds.status != 'submitted':
            return Response(
                {'error': 'Only submitted technical data sheets can be reviewed.'},
                status=status.HTTP_409_CONFLICT,
            )
        tds.status = 'reviewed'
        tds.reviewed_by = request.user
        tds.reviewed_at = timezone.now()
        tds.save(update_fields=['status', 'reviewed_by', 'reviewed_at'])
        return Response({'status': 'reviewed'})


class TechnicianLocationHistoryViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = TechnicianLocationHistory.objects.select_related('technician').order_by('-timestamp', '-id')
    serializer_class = TechnicianLocationHistorySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.action == 'update_location':
            return [IsTechnician()]
        if self.action == 'policy':
            if self.request.user.role == 'technician':
                return [IsTechnician()]
            if is_admin_workspace_role(self.request.user.role):
                return [CanViewSupervisorTracking()]
            return [permissions.IsAuthenticated()]
        if self.action in ['list', 'retrieve']:
            if self.request.user.role == 'technician':
                return [IsTechnician()]
            return [CanViewSupervisorTracking()]
        if self.action in ['nearby_technicians', 'all_technicians_locations']:
            return [CanViewSupervisorTracking()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        if is_admin_workspace_role(user.role):
            queryset = self.queryset
            technician_id = self.request.query_params.get('technician')
            if technician_id and str(technician_id).isdigit():
                queryset = queryset.filter(technician_id=int(technician_id))
        elif user.role == 'technician':
            queryset = self.queryset.filter(technician=user)
        else:
            return self.queryset.none()

        raw_minutes = self.request.query_params.get('minutes')
        if raw_minutes and str(raw_minutes).isdigit():
            minutes = max(1, min(int(raw_minutes), 480))
            queryset = queryset.filter(timestamp__gte=timezone.now() - timezone.timedelta(minutes=minutes))
        return queryset

    @action(detail=False, methods=['get'])
    def policy(self, request):
        if request.user.role not in ('superadmin', 'admin', 'technician'):
            return Response(
                {'error': 'Location policy is available only to field staff and authorized supervisors.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return Response(get_tracking_config())

    @action(detail=False, methods=['post'])
    def update_location(self, request):
        """Update technician's current location"""
        technician = request.user

        if technician.role != 'technician':
            return Response({'error': 'Only technicians can update location'}, status=status.HTTP_403_FORBIDDEN)

        raw_latitude = request.data.get('latitude')
        raw_longitude = request.data.get('longitude')
        raw_accuracy = request.data.get('accuracy', 0)

        if raw_latitude in (None, '') or raw_longitude in (None, ''):
            return Response({'error': 'Latitude and longitude required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            latitude = Decimal(str(raw_latitude)).quantize(Decimal('0.000001'))
            longitude = Decimal(str(raw_longitude)).quantize(Decimal('0.000001'))
        except (InvalidOperation, TypeError, ValueError):
            return Response({'error': 'Latitude and longitude must be valid numbers'}, status=status.HTTP_400_BAD_REQUEST)

        if not Decimal('-90') <= latitude <= Decimal('90'):
            return Response({'error': 'Latitude must be between -90 and 90'}, status=status.HTTP_400_BAD_REQUEST)
        if not Decimal('-180') <= longitude <= Decimal('180'):
            return Response({'error': 'Longitude must be between -180 and 180'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            accuracy = float(raw_accuracy or 0)
        except (TypeError, ValueError):
            accuracy = 0

        updated_at = timezone.now()
        profile = technician._get_or_create_technician_profile()
        profile.current_latitude = latitude
        profile.current_longitude = longitude
        profile.last_location_update = updated_at
        profile.save(update_fields=['current_latitude', 'current_longitude', 'last_location_update', 'updated_at'])

        # Save to history
        TechnicianLocationHistory.objects.create(
            technician=technician,
            latitude=latitude,
            longitude=longitude,
            accuracy=accuracy
        )

        return Response({
            'status': 'Location updated',
            'latitude': float(latitude),
            'longitude': float(longitude),
            'accuracy': accuracy,
            'last_update': updated_at,
        })

    @action(detail=False, methods=['get'])
    def nearby_technicians(self, request):
        """Get all technicians near a location"""
        latitude = request.query_params.get('latitude')
        longitude = request.query_params.get('longitude')
        radius_km = float(request.query_params.get('radius', 10))

        if not latitude or not longitude:
            return Response({'error': 'Latitude and longitude required'}, status=status.HTTP_400_BAD_REQUEST)

        technicians = User.objects.filter(
            role='technician',
            is_available=True,
            status='active'
        )

        nearby = []
        for tech in technicians:
            if tech.current_latitude and tech.current_longitude:
                distance = calculate_distance(
                    float(latitude), float(longitude),
                    tech.current_latitude, tech.current_longitude
                )
                if distance <= radius_km:
                    nearby.append({
                        'id': tech.id,
                        'username': tech.username,
                        'latitude': tech.current_latitude,
                        'longitude': tech.current_longitude,
                        'distance_km': round(distance, 2)
                    })

        return Response(nearby)

    @action(detail=False, methods=['get'])
    def all_technicians_locations(self, request):
        """Get all technicians current locations (for admin map)"""
        technicians = User.objects.filter(
            role='technician',
            status='active',
            technician_profile__is_available=True
        ).select_related('technician_profile').values(
            'id', 'username',
            'technician_profile__current_latitude',
            'technician_profile__current_longitude',
            'technician_profile__is_available'
        )

        # Transform the data to match expected format
        result = []
        for tech in technicians:
            result.append({
                'id': tech['id'],
                'username': tech['username'],
                'current_latitude': tech['technician_profile__current_latitude'],
                'current_longitude': tech['technician_profile__current_longitude'],
                'is_available': tech['technician_profile__is_available']
            })

        return Response(result)


class InstallationContractViewSet(viewsets.ModelViewSet):
    queryset = InstallationContract.objects.all()
    serializer_class = InstallationContractSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [CanManageDocuments()]
        return [CanAccessDocuments()]

    def get_queryset(self):
        user = self.request.user
        queryset = InstallationContract.objects.filter(
            ticket__in=get_visible_service_tickets_queryset(self.request.user)
        )
        
        ticket_id = self.request.query_params.get('ticket', None)
        if ticket_id is not None:
            queryset = queryset.filter(ticket_id=ticket_id)
            
        if is_admin_workspace_role(user.role):
            return queryset
            
        # Clients can see their own contracts
        if user.role == 'client':
            return queryset.filter(ticket__request__client=user)
            
        return queryset.none()


# GIS Dashboard View
