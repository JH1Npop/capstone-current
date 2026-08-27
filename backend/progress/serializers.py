from rest_framework import serializers
from .models import TicketProgress

class TicketProgressReportSerializer(serializers.ModelSerializer):
    """Serializer for Operations Ticket Report with proper display names"""
    client = serializers.SerializerMethodField()
    client_fullname = serializers.SerializerMethodField()
    service = serializers.SerializerMethodField()
    priority = serializers.CharField(source='ticket.priority', read_only=True)
    status = serializers.CharField(source='ticket.status', read_only=True)
    sla = serializers.SerializerMethodField()
    technician_id = serializers.SerializerMethodField()
    technician_fullname = serializers.SerializerMethodField()
    next_step = serializers.CharField(source='progress_status', read_only=True)

    def get_client(self, obj):
        """Return client username/ID"""
        return obj.ticket.request.client.username if obj.ticket and obj.ticket.request and obj.ticket.request.client else "—"

    def get_client_fullname(self, obj):
        """Return client's full name"""
        if obj.ticket and obj.ticket.request and obj.ticket.request.client:
            client = obj.ticket.request.client
            full_name = f"{client.first_name or ''} {client.last_name or ''}".strip()
            return full_name or client.username
        return "—"

    def get_sla(self, obj):
        """Return SLA status"""
        try:
            from services.sla import evaluate_service_ticket_sla, serialize_sla_evaluation
            sla_evaluation = evaluate_service_ticket_sla(obj.ticket)
            return serialize_sla_evaluation(sla_evaluation)
        except:
            return {"status": "unknown"}

    def get_service(self, obj):
        """Return all services grouped under the ticket."""
        if not obj.ticket or not obj.ticket.request:
            return 'Unknown'
        request = obj.ticket.request
        items = list(request.service_items.select_related('service_type').order_by('sort_order', 'id'))
        names = [item.service_type.name for item in items if item.service_type_id]
        return ', '.join(names) or (request.service_type.name if request.service_type_id else 'Unknown')

    def get_technician_id(self, obj):
        """Return technician ID"""
        return obj.ticket.technician.id if obj.ticket and obj.ticket.technician else None

    def get_technician_fullname(self, obj):
        """Return technician's full name or — if null"""
        if obj.ticket and obj.ticket.technician:
            technician = obj.ticket.technician
            full_name = f"{technician.first_name or ''} {technician.last_name or ''}".strip()
            return full_name or technician.username
        return "—"

    class Meta:
        model = TicketProgress
        fields = ['id', 'updated_at', 'client', 'client_fullname', 'service', 'priority', 'status', 'sla', 'technician_id', 'technician_fullname', 'next_step']


class TicketProgressSerializer(serializers.ModelSerializer):
    class Meta:
        model = TicketProgress
        fields = '__all__'
