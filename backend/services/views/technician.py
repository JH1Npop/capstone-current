# Auto-split from services/views.py
from services.views.helpers import *  # noqa: F401,F403
from services.user_display import client_technician_label

class TechnicianClientsView(viewsets.ViewSet):
    """View for technicians to see their assigned clients with location data"""
    permission_classes = [IsTechnician]

    def list(self, request):
        """Return list of clients assigned to the current technician"""
        technician = request.user

        # Get all tickets assigned to this technician
        tickets = get_technician_ticket_queryset(
            technician,
            base_queryset=ServiceTicket.objects.select_related('request__client', 'request__location')
        )

        # Extract unique clients with their location data
        clients_data = []
        seen_clients = set()

        for ticket in tickets:
            client = ticket.request.client
            if client.id not in seen_clients:
                seen_clients.add(client.id)

                # Get location data (ServiceLocation may not exist for every request)
                try:
                    location = ticket.request.location
                except ServiceLocation.DoesNotExist:
                    location = None

                client_data = {
                    'id': client.id,
                    'name': f"{client.first_name} {client.last_name}".strip() or client.username,
                    'username': client.username,
                    'email': client.email,
                    'phone': getattr(client, 'phone', ''),
                    'address': location.address if location else getattr(client, 'address', ''),
                    'latitude': float(location.latitude) if location and location.latitude else None,
                    'longitude': float(location.longitude) if location and location.longitude else None,
                    'status': ticket.status.lower().replace(' ', '_'),
                    'ticket_id': ticket.id,
                    'scheduled_date': ticket.scheduled_date,
                    'service_type': ticket.request.service_type.name
                }
                clients_data.append(client_data)

        return Response(clients_data)


class TechnicianDashboardView(viewsets.ViewSet):
    """Technician dashboard with real data from database"""
    permission_classes = [CanViewTechnicianDashboard]

    @action(detail=False, methods=['get'])
    def dashboard(self, request):
        """Get technician dashboard data - consistent field naming"""
        technician = request.user

        # Get technician's assigned tickets
        assigned_tickets = get_technician_ticket_queryset(
            technician,
            base_queryset=ServiceTicket.objects.select_related(
                'request__service_type', 'request__client', 'request__location', 'technician'
            ).prefetch_related('crew_assignments__technician', 'inventory_reservations__item', 'inventory_reservations__technician')
        )

        # Upcoming schedule
        today = timezone.now().date()
        todays_tickets = assigned_tickets.filter(scheduled_date__gte=today).exclude(status='Cancelled').order_by('scheduled_date', 'scheduled_time')

        # Active tickets (not completed)
        active_tickets = assigned_tickets.filter(
            status__in=['Not Started', 'Navigating', 'Arrived on Site', 'In Progress', 'On Hold', 'For Inspection']
        )

        # Recent activity (last 7 days)
        week_ago = timezone.now().date() - timezone.timedelta(days=7)
        recent_tickets = assigned_tickets.filter(
            Q(request__request_date__date__gte=week_ago) | Q(assigned_at__date__gte=week_ago)
        ).order_by('-assigned_at')[:10]

        # Calculate stats
        total_assigned = assigned_tickets.count()
        completed_today = assigned_tickets.filter(
            status='Completed',
            completed_date__date=today
        ).count()
        pending_count = active_tickets.count()

        # Current location and availability are stored on the technician profile
        technician_profile = None
        if hasattr(technician, 'technician_profile'):
            technician_profile = technician.technician_profile

        current_location = None
        if (
            technician_profile is not None
            and technician_profile.current_latitude is not None
            and technician_profile.current_longitude is not None
        ):
            current_location = {
                'latitude': technician_profile.current_latitude,
                'longitude': technician_profile.current_longitude,
                'last_update': technician_profile.last_location_update
            }

        return Response({
            'technician': {
                'id': technician.id,
                'username': technician.username,
                'full_name': f"{technician.first_name} {technician.last_name}".strip() or technician.username,
                'is_available': bool(getattr(technician_profile, 'is_available', False)),
                'current_location': current_location
            },
            'stats': {
                'total_assigned': total_assigned,
                'completed_today': completed_today,
                'pending_jobs': pending_count,
                'active_jobs': active_tickets.count()
            },
            'todays_schedule': [self._serialize_ticket_for_dashboard(ticket, technician) for ticket in todays_tickets],
            'active_jobs': [self._serialize_ticket_for_dashboard(ticket, technician) for ticket in active_tickets],
            'recent_activity': [self._serialize_recent_ticket(ticket, technician) for ticket in recent_tickets]
        })

    def _serialize_ticket_for_dashboard(self, ticket, technician):
        """Serialize ticket for dashboard with client id and full name"""
        client = ticket.request.client
        try:
            location = ticket.request.location
            latitude = float(location.latitude) if location and location.latitude is not None else None
            longitude = float(location.longitude) if location and location.longitude is not None else None
        except ServiceLocation.DoesNotExist:
            latitude = None
            longitude = None

        try:
            checklist = ticket.inspection
            checklist_completed = bool(checklist.is_completed)
        except InspectionChecklist.DoesNotExist:
            checklist_completed = False

        return {
            'id': ticket.id,
            'ticket_id': f'TKT-{ticket.id:04d}',
            'ticket_type': ticket.ticket_type,
            'service_type': ticket.request.service_type.name,
            'client': {
                'id': client.id,
                'full_name': f"{client.first_name} {client.last_name}".strip() or client.username
            },
            'location': _get_request_address(ticket.request),
            'latitude': latitude,
            'longitude': longitude,
            'scheduled_date': ticket.scheduled_date,
            'scheduled_time': str(ticket.scheduled_time) if ticket.scheduled_time else None,
            'scheduled_time_slot': ticket.scheduled_time_slot,
            'status': ticket.status,
            'priority': ticket.request.priority,
            'notes': ticket.notes,
            'assigned_at': ticket.assigned_at,
            'assignment_role': 'lead' if ticket.technician_id == technician.id else 'crew',
            'crew_members': serialize_ticket_crew_members(ticket),
            'inventory_reservations': serialize_ticket_inventory(ticket),
            'required_equipment': ticket.request.service_type.required_equipment if ticket.request.service_type else [],
            'checklist_completed': checklist_completed,
        }

    def _serialize_recent_ticket(self, ticket, technician):
        """Serialize recent ticket with client id and full name"""
        client = ticket.request.client
        return {
            'id': ticket.id,
            'ticket_id': f'TKT-{ticket.id:04d}',
            'service_type': ticket.request.service_type.name,
            'client': {
                'id': client.id,
                'full_name': f"{client.first_name} {client.last_name}".strip() or client.username
            },
            'location': _get_request_address(ticket.request),
            'status': ticket.status,
            'assigned_at': ticket.assigned_at,
            'created_at': ticket.request.request_date,
            'assignment_role': 'lead' if ticket.technician_id == technician.id else 'crew',
        }


class TechnicianJobsView(viewsets.ViewSet):
    """View for technician jobs and schedule - uses consistent field naming with ServiceTicketViewSet"""
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.action == 'retrieve':
            return [CanViewTechnicianJobDetails()]
        if self.action in ['list', 'update_status', 'start_navigation', 'arrive']:
            return [CanViewTechnicianJobs()]
        return [permissions.IsAuthenticated()]

    def get_locked_job(self, user, pk):
        return get_technician_ticket_queryset(user).select_for_update().select_related(
            'request__client',
            'request__location',
            'request__service_type',
            'assigned_admin',
            'technician__technician_profile',
        ).get(pk=pk)

    def _serialize_job(self, ticket, technician=None):
        try:
            location = ticket.request.location
            location_address = location.address if location else None
            latitude = float(location.latitude) if location and location.latitude is not None else None
            longitude = float(location.longitude) if location and location.longitude is not None else None
        except ServiceLocation.DoesNotExist:
            location_address = None
            latitude = None
            longitude = None

        service_name = ticket.request.service_type.name if ticket.request.service_type else 'Service'
        assignment_role = None
        if technician is not None:
            assignment_role = 'lead' if ticket.technician_id == technician.id else 'crew'

        try:
            checklist = ticket.inspection
            checklist_completed = bool(checklist.is_completed)
            checklist_completed_at = checklist.completed_at
        except InspectionChecklist.DoesNotExist:
            checklist_completed = False
            checklist_completed_at = None

        return {
            'id': ticket.id,
            'ticket_id': f'TKT-{ticket.id:04d}',
            'ticket_type': ticket.ticket_type,
            'service': service_name,
            'service_type': service_name,
            'client': {
                'id': ticket.request.client.id,
                'full_name': f"{ticket.request.client.first_name} {ticket.request.client.last_name}".strip() or ticket.request.client.username
            },
            'address': location_address or '',
            'location': location_address or '',
            'latitude': latitude,
            'longitude': longitude,
            'status': ticket.status,
            'priority': ticket.request.priority,
            'request_source': ticket.request.request_source,
            'request_source_label': ticket.request.get_request_source_display(),
            'scheduled_date': ticket.scheduled_date,
            'scheduled_time': str(ticket.scheduled_time) if ticket.scheduled_time else None,
            'scheduled_time_slot': ticket.scheduled_time_slot,
            'notes': ticket.notes or '',
            'technician': ticket.technician.username if ticket.technician else None,
            'lead_technician': ticket.technician.username if ticket.technician else None,
            'crew_members': serialize_ticket_crew_members(ticket),
            'inventory_reservations': serialize_ticket_inventory(ticket),
            'assignment_role': assignment_role,
            'checklist_completed': checklist_completed,
            'checklist_completed_at': checklist_completed_at,
            'created_at': ticket.request.request_date
        }

    def list(self, request):
        """Get technician's assigned jobs"""
        technician = request.user

        tickets = get_technician_ticket_queryset(
            technician,
            base_queryset=ServiceTicket.objects.select_related(
                'request__service_type', 'request__client', 'request__location', 'technician'
            ).prefetch_related('crew_assignments__technician', 'inventory_reservations__item', 'inventory_reservations__technician')
        ).order_by('-scheduled_date')

        jobs = [self._serialize_job(ticket, technician=technician) for ticket in tickets]
        return Response(jobs)

    def retrieve(self, request, pk=None):
        """Get a single assigned job with coordinates for map/checklist flows."""
        try:
            ticket = get_technician_ticket_queryset(
                request.user,
                base_queryset=ServiceTicket.objects.select_related(
                    'request__service_type', 'request__client', 'request__location', 'technician'
                ).prefetch_related('crew_assignments__technician', 'inventory_reservations__item', 'inventory_reservations__technician')
            ).get(pk=pk)
        except ServiceTicket.DoesNotExist:
            return Response({'error': 'Job not found'}, status=status.HTTP_404_NOT_FOUND)

        return Response(self._serialize_job(ticket, technician=request.user))

    @action(detail=True, methods=['post'], url_path='start-navigation')
    @transaction.atomic
    def start_navigation(self, request, pk=None):
        """Record the first time a technician starts navigation to the job site."""
        try:
            ticket = self.get_locked_job(request.user, pk)
        except ServiceTicket.DoesNotExist:
            return Response({'error': 'Job not found'}, status=status.HTTP_404_NOT_FOUND)

        if ticket.status in ['Navigating', 'Arrived on Site', 'In Progress', 'Completed']:
            return Response({'status': 'already_notified', 'ticket_id': ticket.id})

        technician_name = request.user.get_full_name().strip() or request.user.username
        try:
            apply_ticket_status_change(
                ticket,
                'Navigating',
                changed_by=request.user,
                notes=f'{technician_name} started navigation to the job site.',
            )
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        ServiceStatusHistory.objects.create(
            ticket=ticket,
            status='Navigation Started',
            changed_by=request.user,
            notes=f'{technician_name} started navigation to the job site.',
        )

        record_arrival_validation_log(
            ticket=ticket,
            technician=request.user,
            performed_by=request.user,
            action='navigate',
            validation_result='not_required',
            validation_enabled=True,
            radius_meters=30,
            remarks=f'{technician_name} started navigation to the job site.',
        )

        create_notification(
            ticket.request.client,
            f"{technician_name} is on the way to your service location for ticket #{ticket.id}.",
            'info'
        )

        admin_message = f"{technician_name} started navigation to ticket #{ticket.id}."
        admin_recipients = User.objects.filter(role__in=['admin', 'superadmin'], is_active=True)
        if ticket.assigned_admin_id:
            admin_recipients = admin_recipients | User.objects.filter(pk=ticket.assigned_admin_id)
        for recipient in admin_recipients.distinct():
            create_notification(recipient, admin_message, 'info')

        return Response({'status': 'notified', 'ticket_id': ticket.id})

    @action(detail=True, methods=['post'], url_path='arrive')
    @transaction.atomic
    def arrive(self, request, pk=None):
        """Validate technician proximity and mark the ticket as arrived on site."""
        try:
            ticket = self.get_locked_job(request.user, pk)
        except ServiceTicket.DoesNotExist:
            return Response({'error': 'Job not found'}, status=status.HTTP_404_NOT_FOUND)

        if ticket.status != 'Navigating':
            return Response({
                'error': 'Start navigation before marking arrival.',
                'status': ticket.status,
            }, status=status.HTTP_400_BAD_REQUEST)

        technician_latitude = request.data.get('latitude')
        technician_longitude = request.data.get('longitude')

        if technician_latitude in [None, ''] or technician_longitude in [None, '']:
            profile = getattr(request.user, 'technician_profile', None)
            technician_latitude = getattr(profile, 'current_latitude', None)
            technician_longitude = getattr(profile, 'current_longitude', None)

        try:
            validation = compute_arrival_validation_result(
                ticket,
                float(technician_latitude),
                float(technician_longitude),
            )
        except (TypeError, ValueError) as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        technician_name = request.user.get_full_name().strip() or request.user.username
        service_latitude = validation['service_latitude']
        service_longitude = validation['service_longitude']
        distance_meters = validation['distance_meters']
        validation_enabled = validation['validation_enabled']
        radius_meters = validation['radius_meters']

        record_arrival_validation_log(
            ticket=ticket,
            technician=request.user,
            performed_by=request.user,
            action='arrival_attempt',
            validation_result='failed' if validation['blocked'] else ('bypassed' if not validation_enabled else 'passed'),
            technician_latitude=technician_latitude,
            technician_longitude=technician_longitude,
            service_latitude=service_latitude,
            service_longitude=service_longitude,
            distance_meters=distance_meters,
            validation_enabled=validation_enabled,
            radius_meters=radius_meters,
            remarks='Technician attempted to mark arrival.',
        )

        if validation['blocked']:
            record_arrival_validation_log(
                ticket=ticket,
                technician=request.user,
                performed_by=request.user,
                action='arrival_blocked',
                validation_result='failed',
                technician_latitude=technician_latitude,
                technician_longitude=technician_longitude,
                service_latitude=service_latitude,
                service_longitude=service_longitude,
                distance_meters=distance_meters,
                validation_enabled=True,
                radius_meters=radius_meters,
                remarks=(
                    f'Arrival blocked because technician was {distance_meters:.1f} meters away '
                    f'and the allowed radius is {radius_meters} meters.'
                ),
            )

            admin_message = (
                f"{technician_name} attempted to mark arrival outside the allowed {radius_meters}-meter range "
                f"for ticket #{ticket.id}."
            )
            admin_recipients = User.objects.filter(role__in=['admin', 'superadmin'], is_active=True)
            if ticket.assigned_admin_id:
                admin_recipients = admin_recipients | User.objects.filter(pk=ticket.assigned_admin_id)
            for recipient in admin_recipients.distinct():
                create_notification(recipient, admin_message, 'warning')

            return Response({
                'error': 'You are outside the allowed arrival range.',
                'distance_meters': round(distance_meters, 1),
                'radius_meters': radius_meters,
                'validation_enabled': True,
                'status': ticket.status,
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            resolved_status = apply_ticket_status_change(
                ticket,
                'Arrived on Site',
                changed_by=request.user,
                notes='Technician arrived on site.',
            )
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        record_arrival_validation_log(
            ticket=ticket,
            technician=request.user,
            performed_by=request.user,
            action='arrival_bypassed' if not validation_enabled else 'arrival_success',
            validation_result='bypassed' if not validation_enabled else 'passed',
            technician_latitude=technician_latitude,
            technician_longitude=technician_longitude,
            service_latitude=service_latitude,
            service_longitude=service_longitude,
            distance_meters=distance_meters,
            validation_enabled=validation_enabled,
            radius_meters=radius_meters,
            remarks=(
                'Location validation was disabled by superadmin.'
                if not validation_enabled
                else 'Technician arrived within the allowed range.'
            ),
        )

        create_notification(
            ticket.request.client,
            f"{technician_name} has arrived at your service location for ticket #{ticket.id}.",
            'info'
        )

        admin_message = (
            f"{technician_name} marked arrival for ticket #{ticket.id}."
            if validation_enabled
            else f"{technician_name} marked arrival while location validation was disabled for ticket #{ticket.id}."
        )
        admin_recipients = User.objects.filter(role__in=['admin', 'superadmin'], is_active=True)
        if ticket.assigned_admin_id:
            admin_recipients = admin_recipients | User.objects.filter(pk=ticket.assigned_admin_id)
        for recipient in admin_recipients.distinct():
            create_notification(recipient, admin_message, 'info')

        return Response({
            'status': resolved_status,
            'ticket_id': ticket.id,
            'validation_enabled': validation_enabled,
            'validation_result': 'bypassed' if not validation_enabled else 'passed',
            'distance_meters': round(distance_meters, 1),
            'radius_meters': radius_meters,
        })

    @transaction.atomic
    def update_status(self, request, pk=None):
        """Update a technician job status using the ticket workflow"""
        try:
            ticket = self.get_locked_job(request.user, pk)
            User.objects.select_for_update().get(pk=request.user.pk)
        except ServiceTicket.DoesNotExist:
            return Response({'error': 'Job not found'}, status=status.HTTP_404_NOT_FOUND)

        requested_status = str(request.data.get('status', '')).strip().lower()
        status_map = {
            'accepted': 'Not Started',
            'in_progress': 'In Progress',
            'completed': 'Completed'
        }
        new_status = status_map.get(requested_status)
        if not new_status:
            return Response({'error': 'Unsupported status'}, status=status.HTTP_400_BAD_REQUEST)
        if new_status == 'In Progress' and ticket.status != 'Arrived on Site':
            return Response({
                'error': 'You must mark arrival on site before starting the job.',
                'status': ticket.status,
            }, status=status.HTTP_400_BAD_REQUEST)
        if new_status == 'In Progress':
            active_job = get_technician_ticket_queryset(request.user).filter(
                status__in=['Navigating', 'Arrived on Site', 'In Progress', 'On Hold']
            ).exclude(pk=ticket.pk).first()
            if active_job:
                return Response({
                    'error': f'Complete or hold ticket #{active_job.id} before starting another job.',
                    'active_job': active_job.id,
                }, status=status.HTTP_409_CONFLICT)
        if new_status == 'Completed' and ticket.status != 'In Progress':
            return Response({
                'error': 'You must start the job before completing it.',
                'status': ticket.status,
            }, status=status.HTTP_400_BAD_REQUEST)
        if new_status == 'Completed' and ticket.technician_id != request.user.id:
            return Response({
                'error': 'Only the lead technician can complete this ticket.',
                'status': ticket.status,
            }, status=status.HTTP_403_FORBIDDEN)
        if new_status == 'Completed' and ticket.status == 'In Progress':
            try:
                ensure_ticket_checklist_completed(ticket)
            except ValueError as exc:
                return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        if requested_status == 'accepted' and ticket.status == 'Not Started':
            ServiceStatusHistory.objects.create(
                ticket=ticket,
                status='Not Started',
                changed_by=request.user,
                notes='Technician acknowledged assignment'
            )
            return Response({'status': 'Not Started', 'ticket_id': ticket.id})

        extra_update_fields = None
        status_notes = f'Technician updated job status to {new_status}'
        if new_status == 'Completed':
            proof_images = request.data.get('completion_proof_images', [])
            if proof_images is None:
                proof_images = []
            elif not isinstance(proof_images, list):
                proof_images = [proof_images]

            completion_notes = request.data.get('completion_notes') or ''
            ticket.completion_proof_images = proof_images
            ticket.completion_notes = completion_notes
            extra_update_fields = ['completion_proof_images', 'completion_notes']
            status_notes = completion_notes or 'Technician completed the job.'

        try:
            resolved_status = apply_ticket_status_change(
                ticket,
                new_status,
                changed_by=request.user,
                notes=status_notes,
                extra_update_fields=extra_update_fields,
                inventory_usage=request.data.get('inventory_usage') if new_status == 'Completed' else None,
            )
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        if resolved_status == 'Completed':
            record_arrival_validation_log(
                ticket=ticket,
                technician=request.user,
                performed_by=request.user,
                action='job_completed',
                validation_result='not_required',
                remarks=status_notes,
            )
            create_notification(
                ticket.request.client,
                f"Your service ticket #{ticket.id} has been completed!",
                'success'
            )
            _notify_ticket_completion_recipients(ticket=ticket, technician=request.user)
        elif resolved_status == 'In Progress':
            record_arrival_validation_log(
                ticket=ticket,
                technician=request.user,
                performed_by=request.user,
                action='job_started',
                validation_result='not_required',
                remarks=status_notes,
            )
            create_notification(
                ticket.request.client,
                f"Work has started for ticket #{ticket.id}.",
                'info'
            )
            technician_name = (
                request.user.get_full_name().strip()
                or request.user.username
            )
            admin_message = (
                f"{technician_name} arrived at the site and started work on ticket #{ticket.id}."
            )
            admin_recipients = User.objects.filter(role__in=['admin', 'superadmin'], is_active=True)
            if ticket.assigned_admin_id:
                admin_recipients = admin_recipients | User.objects.filter(pk=ticket.assigned_admin_id)
            for recipient in admin_recipients.distinct():
                create_notification(recipient, admin_message, 'info')
        response_data = {'status': resolved_status, 'ticket_id': ticket.id}
        if resolved_status == 'Completed':
            response_data.update({
                'completion_notes': ticket.completion_notes,
                'completion_proof_images': ticket.completion_proof_images,
            })
        return Response(response_data)


class TechnicianScheduleView(viewsets.ViewSet):
    """View for technician schedule - uses consistent field naming"""
    permission_classes = [CanViewTechnicianSchedule]

    def list(self, request):
        """Get technician's schedule"""
        technician = request.user

        today = timezone.localdate()
        start_date = parse_date(str(request.query_params.get('start') or '')) or today
        end_date = parse_date(str(request.query_params.get('end') or '')) or (start_date + timezone.timedelta(days=62))
        if end_date < start_date:
            return Response({'error': 'end must be on or after start.'}, status=400)

        show_completed = str(request.query_params.get('show_completed') or '').lower() in {'1', 'true', 'yes', 'all'}
        tickets = get_technician_ticket_queryset(
            technician,
            base_queryset=ServiceTicket.objects.select_related(
                'request__service_type', 'request__client', 'request__location', 'technician'
            ).prefetch_related('crew_assignments__technician')
        ).filter(
            scheduled_date__gte=start_date,
            scheduled_date__lte=end_date,
        ).exclude(
            status='Cancelled'
        ).order_by('scheduled_date')
        if not show_completed:
            tickets = tickets.exclude(status__in=['Completed', 'Turned Over / Accepted'])

        schedule = []
        for ticket in tickets:
            try:
                location = ticket.request.location
                location_address = location.address if location else None
            except ServiceLocation.DoesNotExist:
                location_address = None

            schedule.append({
                'id': ticket.id,
                'ticket_id': f'TKT-{ticket.id:04d}',
                'ticket_type': ticket.ticket_type,
                'service_type': ticket.request.service_type.name,
                'client': ticket.request.client.username,
                'location': location_address,
                'status': ticket.status,  # Keep original status
                'priority': ticket.request.priority,
                'scheduled_date': ticket.scheduled_date,
                'scheduled_time': str(ticket.scheduled_time) if ticket.scheduled_time else None,
                'scheduled_time_slot': ticket.scheduled_time_slot,
                'notes': ticket.notes or '',
                'assignment_role': 'lead' if ticket.technician_id == technician.id else 'crew',
                'crew_members': serialize_ticket_crew_members(ticket),
            })

        return Response(schedule)


class TechnicianProfileView(viewsets.ViewSet):
    permission_classes = [CanViewTechnicianProfile]

    def list(self, request):
        technician = request.user
        completed_tickets = get_technician_ticket_queryset(technician).filter(status='Completed')
        avg_rating = completed_tickets.exclude(client_rating__isnull=True).aggregate(avg=Avg('client_rating')).get('avg')
        thirty_days_ago = timezone.now() - timezone.timedelta(days=29)
        completed_last_30_days = completed_tickets.filter(completed_date__gte=thirty_days_ago)
        avg_rating_last_30_days = (
            completed_last_30_days
            .exclude(client_rating__isnull=True)
            .aggregate(avg=Avg('client_rating'))
            .get('avg')
        )
        skills = TechnicianSkill.objects.filter(technician=technician).select_related('service_type')

        # Serialize skills with all details
        skills_data = [
            {
                'id': skill.id,
                'service_type': skill.service_type.id,
                'service_type_name': skill.service_type.name,
                'skill_level': skill.skill_level,
                'technician_name': client_technician_label(technician) or technician.username
            }
            for skill in skills
        ]

        return Response({
            'phone': technician.phone or '',
            'email': technician.email or '',
            'skills': skills_data,
            'totalCompleted': completed_tickets.count(),
            'completedLast30Days': completed_last_30_days.count(),
            'avgCompletionTime': '',
            'rating': float(avg_rating) if avg_rating is not None else 0,
            'ratingLast30Days': float(avg_rating_last_30_days) if avg_rating_last_30_days is not None else 0,
            'status': 'Available' if technician.is_available and technician.status == 'active' else technician.status.title()
        })

    def update(self, request, pk=None):
        serializer = SelfUserUpdateSerializer(request.user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return self.list(request)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class TechnicianHistoryView(viewsets.ViewSet):
    permission_classes = [CanViewTechnicianHistory]

    def _inspection_summary(self, ticket):
        try:
            inspection = ticket.inspection
        except InspectionChecklist.DoesNotExist:
            return None

        return {
            'is_completed': inspection.is_completed,
            'completed_at': inspection.completed_at,
            'completed_by': (
                client_technician_label(inspection.completed_by)
                if inspection.completed_by_id
                else None
            ),
            'maintenance_required': inspection.maintenance_required,
            'maintenance_profile': inspection.maintenance_profile,
            'maintenance_interval_days': inspection.maintenance_interval_days,
            'maintenance_notes': inspection.maintenance_notes,
            'warranty_provided': inspection.warranty_provided,
            'warranty_period_days': inspection.warranty_period_days,
            'warranty_notes': inspection.warranty_notes,
            'follow_up_required': inspection.follow_up_required,
            'follow_up_case_type': inspection.follow_up_case_type,
            'follow_up_due_date': inspection.follow_up_due_date,
            'follow_up_summary': inspection.follow_up_summary,
            'follow_up_details': inspection.follow_up_details,
            'procedure_source': inspection.procedure_source,
            'service_type_label': inspection.service_type_label,
            'checklist_items': inspection.checklist_items or [],
            'required_equipment_snapshot': inspection.required_equipment_snapshot or [],
            'proof_media': inspection.proof_media or [],
            'additional_notes': inspection.additional_notes,
        }

    def _maintenance_summary(self, ticket):
        try:
            schedule = ticket.maintenance_schedule
        except Exception:
            return None

        return {
            'id': schedule.id,
            'maintenance_profile': schedule.maintenance_profile,
            'interval_days': schedule.interval_days,
            'next_due_date': schedule.next_due_date,
            'notify_on_date': schedule.notify_on_date,
            'status': schedule.status,
            'maintenance_notes': schedule.maintenance_notes,
            'risk_level': schedule.risk_level,
        }

    def list(self, request):
        tickets = get_technician_ticket_queryset(
            request.user,
            base_queryset=ServiceTicket.objects.select_related(
                'request__service_type', 'request__client', 'request__location',
                'technician', 'inspection', 'maintenance_schedule'
            ).prefetch_related(
                'crew_assignments__technician',
                'after_sales_cases',
                'inventory_reservations__item',
                'inventory_reservations__technician',
            )
        ).filter(
            status__in=['Completed', 'Inspection Completed']
        ).order_by('-completed_date', '-updated_at')

        history = []
        for ticket in tickets:
            try:
                location = ticket.request.location
                address = location.address if location else ''
            except ServiceLocation.DoesNotExist:
                address = ''

            history.append({
                'id': ticket.id,
                'service': ticket.request.service_type.name if ticket.request.service_type else 'Service',
                'client': {
                    'id': ticket.request.client_id,
                    'full_name': (
                        ticket.request.client.get_full_name().strip()
                        or ticket.request.client.username
                    ) if ticket.request.client else 'Unknown',
                },
                'ticketId': ticket.id,
                'scheduledDate': ticket.completed_date or ticket.scheduled_date,
                'completed_date': ticket.completed_date,
                'priority': ticket.request.priority if ticket.request else '',
                'notes': ticket.notes or '',
                'completion_notes': ticket.completion_notes or '',
                'completion_proof_images': ticket.completion_proof_images or [],
                'address': address,
                'assignmentRole': 'lead' if ticket.technician_id == request.user.id else 'crew',
                'lead_technician': client_technician_label(ticket.technician) if ticket.technician_id else '',
                'crew_members': serialize_ticket_crew_members(ticket),
                'inventory_reservations': serialize_ticket_inventory(ticket),
                'client_rating': ticket.client_rating,
                'client_feedback': ticket.client_feedback,
                'warranty_status': ticket.warranty_status,
                'warranty_start_date': ticket.warranty_start_date,
                'warranty_end_date': ticket.warranty_end_date,
                'warranty_notes': ticket.warranty_notes,
                'inspection': self._inspection_summary(ticket),
                'maintenance_schedule': self._maintenance_summary(ticket),
                'after_sales_cases': [
                    {
                        'id': case.id,
                        'case_type': case.case_type,
                        'status': case.status,
                        'priority': case.priority,
                        'summary': case.summary,
                        'due_date': case.due_date,
                    }
                    for case in ticket.after_sales_cases.all()[:5]
                ],
            })
        return Response(history)
