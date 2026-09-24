from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver

from .models import ServiceTicket, TicketCrewAssignment


def _sync_technician_ids(technician_ids):
    from users.models import User
    from services.views.helpers import sync_technician_availability

    for technician in User.objects.filter(
        id__in={technician_id for technician_id in technician_ids if technician_id},
        role='technician',
    ):
        sync_technician_availability(technician)


@receiver(pre_save, sender=ServiceTicket)
def remember_previous_ticket_technician(sender, instance, **kwargs):
    if not instance.pk:
        instance._previous_technician_id = None
        return

    instance._previous_technician_id = sender.objects.filter(
        pk=instance.pk,
    ).values_list('technician_id', flat=True).first()


@receiver(post_save, sender=ServiceTicket)
def reconcile_ticket_technician_availability(sender, instance, **kwargs):
    _sync_technician_ids({
        instance.technician_id,
        getattr(instance, '_previous_technician_id', None),
        *instance.crew_assignments.values_list('technician_id', flat=True),
    })


@receiver(post_save, sender=TicketCrewAssignment)
def reconcile_added_crew_availability(sender, instance, **kwargs):
    _sync_technician_ids({instance.technician_id})


@receiver(post_delete, sender=TicketCrewAssignment)
def reconcile_removed_crew_availability(sender, instance, **kwargs):
    _sync_technician_ids({instance.technician_id})
