"""
Auto-logging signals for the ChangeLog audit trail.

Automatically records create/update/delete operations on critical models:
- ServiceRequest, ServiceTicket, User, AfterSalesCase, MaintenanceSchedule

This ensures previous records are NEVER lost — every change is preserved.
"""

import logging
import threading

from django.contrib.contenttypes.models import ContentType
from django.db.models.signals import post_save, pre_save, pre_delete
from django.dispatch import receiver

logger = logging.getLogger(__name__)

# Thread-local storage for tracking the current request user
_thread_locals = threading.local()


def ensure_user_role_profile(user):
    """Create the role-specific profile row expected by serializers and APIs."""
    from users.models import (
        ClientProfile,
        ManagementProfile,
        TechnicianProfile,
    )

    role_profile_map = {
        'superadmin': ManagementProfile,
        'admin': ManagementProfile,
        'technician': TechnicianProfile,
        'client': ClientProfile,
    }
    profile_model = role_profile_map.get(getattr(user, 'role', None))
    if not profile_model:
        return

    defaults = {}
    if profile_model.__name__ == 'ManagementProfile':
        from users.rbac import get_default_admin_scope_for_role

        defaults['admin_scope'] = get_default_admin_scope_for_role(user.role) or 'general'

    profile_model.objects.get_or_create(user=user, defaults=defaults)


def set_current_user(user):
    """Call this from middleware to set the current request user."""
    _thread_locals.user = user


def set_current_request_meta(request):
    """Store request metadata for activity logs without passing request around."""
    if request is None:
        _thread_locals.request_meta = {}
        return

    forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR', '')
    ip_address = forwarded_for.split(',')[0].strip() if forwarded_for else request.META.get('REMOTE_ADDR')
    _thread_locals.request_meta = {
        'ip_address': ip_address or None,
        'user_agent': request.META.get('HTTP_USER_AGENT', ''),
    }


def get_current_user():
    """Get the user set by middleware, or None."""
    return getattr(_thread_locals, 'user', None)
"""
Auto-logging signals for the ChangeLog audit trail.

Automatically records create/update/delete operations on critical models:
- ServiceRequest, ServiceTicket, User, AfterSalesCase, MaintenanceSchedule

This ensures previous records are NEVER lost — every change is preserved.
"""

import logging
import threading

from django.contrib.contenttypes.models import ContentType
from django.db.models.signals import post_save, pre_save, pre_delete
from django.dispatch import receiver

logger = logging.getLogger(__name__)

# Thread-local storage for tracking the current request user
_thread_locals = threading.local()


def ensure_user_role_profile(user):
    """Create the role-specific profile row expected by serializers and APIs."""
    from users.models import (
        ClientProfile,
        ManagementProfile,
        TechnicianProfile,
    )

    role_profile_map = {
        'superadmin': ManagementProfile,
        'admin': ManagementProfile,
        'technician': TechnicianProfile,
        'client': ClientProfile,
    }
    profile_model = role_profile_map.get(getattr(user, 'role', None))
    if not profile_model:
        return

    defaults = {}
    if profile_model.__name__ == 'ManagementProfile':
        from users.rbac import get_default_admin_scope_for_role

        defaults['admin_scope'] = get_default_admin_scope_for_role(user.role) or 'general'

    profile_model.objects.get_or_create(user=user, defaults=defaults)


def set_current_user(user):
    """Call this from middleware to set the current request user."""
    _thread_locals.user = user


def set_current_request_meta(request):
    """Store request metadata for activity logs without passing request around."""
    if request is None:
        _thread_locals.request_meta = {}
        return

    forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR', '')
    ip_address = forwarded_for.split(',')[0].strip() if forwarded_for else request.META.get('REMOTE_ADDR')
    _thread_locals.request_meta = {
        'ip_address': ip_address or None,
        'user_agent': request.META.get('HTTP_USER_AGENT', ''),
    }


def get_current_user():
    """Get the user set by middleware, or None."""
    return getattr(_thread_locals, 'user', None)


def get_current_request_meta():
    return getattr(_thread_locals, 'request_meta', {}) or {}


# Fields to track on each model (only these will be logged on update)
TRACKED_FIELDS = {
    'ServiceType': ['name', 'description', 'estimated_duration', 'estimated_cost', 'max_daily_assignments', 'procedures', 'required_equipment'],
    'ServiceRequest': ['status', 'priority', 'description', 'service_type_id', 'client_id', 'preferred_date', 'preferred_time_slot', 'request_source', 'scheduling_notes'],
    'ServiceTicket': ['status', 'priority', 'technician_id', 'assigned_admin_id', 'scheduled_date', 'scheduled_time', 'scheduled_time_slot', 'auto_assigned', 'reschedule_requested', 'reschedule_reason', 'warranty_status', 'completion_notes', 'client_rating'],
    'User': ['username', 'first_name', 'last_name', 'phone', 'address', 'profile_image', 'role', 'status', 'email', 'pending_email', 'is_active'],
    'TechnicianProfile': ['is_available', 'skill_level', 'max_daily_assignments'],
    'AfterSalesCase': ['status', 'priority', 'case_type', 'assigned_to_id', 'resolution_notes'],
    'MaintenanceSchedule': ['status', 'next_due_date', 'risk_level'],
    'InventoryItem': ['name', 'sku', 'category_id', 'item_type', 'quantity', 'minimum_stock', 'reserved_quantity', 'warehouse_location', 'unit_price', 'status', 'supplier'],
    'InventoryReservation': ['status', 'quantity', 'fulfilled_quantity', 'notes'],
    'InventoryTransaction': ['transaction_type', 'quantity', 'technician_id', 'service_ticket_id', 'notes', 'performed_by_id'],
    'ServiceTypeInventoryRequirement': ['service_type_id', 'item_id', 'quantity', 'auto_reserve', 'notes'],
    'SLARule': ['key', 'warning_minutes', 'overdue_minutes', 'is_active', 'notes'],
    'AdminSettings': [
        'system_name', 'support_email', 'enable_notifications', 'enable_in_app_notifications',
        'enable_email_notifications', 'auto_dispatch_enabled', 'allow_overtime_dispatch',
        'overtime_daily_capacity_minutes', 'default_time_zone', 'max_technician_assignments',
        'business_days', 'business_open_time', 'business_close_time', 'holiday_dates',
        'maintenance_reminder_days', 'company_name', 'company_address', 'document_footer',
        'currency_code', 'quotation_validity_days', 'default_warranty_days', 'external_payment_notice',
        'landing_page_content', 'solar_calculator_settings', 'landing_page_promotions',
        'location_validation_enabled', 'arrival_radius_meters', 'location_validation_disabled_reason',
    ],
    'QuotationRecord': ['total_amount', 'downpayment_amount', 'balance_amount', 'payment_terms', 'validity_days', 'status', 'bill_of_materials'],
    'InstallationContract': ['scope_of_work', 'start_date', 'estimated_completion_days', 'total_contract_amount', 'payment_terms_upfront', 'payment_terms_completion', 'payment_terms_final', 'warranty_period', 'status'],
}


def _get_tracked_fields(instance):
    """Get the fields we should track for this model."""
    model_name = instance.__class__.__name__
    return TRACKED_FIELDS.get(model_name, [])


def _should_track(instance):
    """Check if this model instance should be tracked."""
    return instance.__class__.__name__ in TRACKED_FIELDS


ACTIVITY_CATEGORIES = {
    'User': 'users',
    'TechnicianProfile': 'users',
    'ServiceType': 'settings',
    'ServiceRequest': 'requests',
    'ServiceTicket': 'tickets',
    'AfterSalesCase': 'communication',
    'MaintenanceSchedule': 'tickets',
    'InventoryItem': 'inventory',
    'InventoryReservation': 'inventory',
    'InventoryTransaction': 'inventory',
    'ServiceTypeInventoryRequirement': 'inventory',
    'SLARule': 'sla',
    'AdminSettings': 'settings',
    'QuotationRecord': 'tickets',
    'InstallationContract': 'tickets',
}

IGNORED_ACTIVITY_FIELDS = {
    'TechnicianProfile': {'current_latitude', 'current_longitude', 'last_location_update'},
}

MODEL_LABELS = {
    'TechnicianProfile': 'technician profile',
    'ServiceRequest': 'service request',
    'ServiceTicket': 'service ticket',
    'ServiceType': 'service type',
    'InventoryItem': 'inventory item',
    'InventoryReservation': 'inventory reservation',
    'InventoryTransaction': 'inventory transaction',
    'ServiceTypeInventoryRequirement': 'service inventory requirement',
    'AfterSalesCase': 'after-sales case',
    'MaintenanceSchedule': 'maintenance schedule',
    'User': 'user account',
    'SLARule': 'SLA rule',
    'AdminSettings': 'admin settings',
    'QuotationRecord': 'quotation record',
    'InstallationContract': 'installation contract',
}

FIELD_LABELS = {
    'is_available': 'availability',
    'skill_level': 'skill level',
    'max_daily_assignments': 'daily assignment limit',
    'assigned_admin_id': 'assigned admin',
    'technician_id': 'technician',
    'service_type_id': 'service type',
    'client_id': 'client',
    'first_name': 'first name',
    'last_name': 'last name',
    'phone': 'phone number',
    'profile_image': 'profile image',
    'pending_email': 'pending email',
    'warning_minutes': 'warning threshold (minutes)',
    'overdue_minutes': 'overdue threshold (minutes)',
    'is_active': 'active status',
    'auto_dispatch_enabled': 'automatic technician dispatch',
    'allow_overtime_dispatch': 'overtime technician dispatch',
    'overtime_daily_capacity_minutes': 'overtime daily capacity (minutes)',
    'default_time_zone': 'default time zone',
    'max_technician_assignments': 'maximum technician assignments',
    'business_days': 'operating business days',
    'business_open_time': 'business opening time',
    'business_close_time': 'business closing time',
    'holiday_dates': 'holiday calendar',
    'maintenance_reminder_days': 'maintenance reminder lead time (days)',
    'quotation_validity_days': 'quotation validity period (days)',
    'default_warranty_days': 'default warranty duration (days)',
    'location_validation_enabled': 'GPS arrival radius validation',
    'arrival_radius_meters': 'technician check-in radius (meters)',
    'total_amount': 'total quotation amount',
    'downpayment_amount': 'downpayment amount',
    'balance_amount': 'balance amount',
    'payment_terms': 'payment terms',
    'validity_days': 'validity days',
    'bill_of_materials': 'bill of materials',
    'scope_of_work': 'scope of work',
    'start_date': 'start date',
    'estimated_completion_days': 'estimated completion days',
    'total_contract_amount': 'total contract amount',
    'payment_terms_upfront': 'upfront payment terms',
    'payment_terms_completion': 'completion payment terms',
    'payment_terms_final': 'final payment terms',
    'warranty_period': 'warranty period',
}


ACTION_LABELS = {
    'create': 'created',
    'update': 'updated',
    'delete': 'deleted',
    'assign': 'assigned',
    'reschedule': 'rescheduled',
    'complete': 'completed',
    'cancel': 'cancelled',
}

ASSIGNMENT_ACTIVITY_FIELDS = {'assigned_admin_id', 'technician_id'}
SCHEDULE_ACTIVITY_FIELDS = {
    'scheduled_date',
    'scheduled_time',
    'scheduled_time_slot',
    'reschedule_requested',
    'reschedule_reason',
}


def _field_label(field_name):
    return FIELD_LABELS.get(field_name, field_name.replace('_', ' '))


def _model_label(model_name):
    return MODEL_LABELS.get(model_name, model_name)


def _should_log_activity_field(instance, field_name):
    ignored_fields = IGNORED_ACTIVITY_FIELDS.get(instance.__class__.__name__, set())
    return field_name not in ignored_fields


def _actor_label(user):
    if not user:
        return 'System'
    return user.get_full_name().strip() or user.username


def _full_name_or_username(user):
    if not user:
        return ''
    return user.get_full_name().strip() or user.username


def _target_label(instance):
    model_name = instance.__class__.__name__
    if model_name == 'User':
        user_name = _full_name_or_username(instance)
        role = getattr(instance, 'role', '')
        return f'{user_name} ({role})' if role else user_name

    if model_name == 'ServiceRequest':
        service_type = getattr(instance, 'service_type', None)
        client_name = _full_name_or_username(getattr(instance, 'client', None))
        service_name = getattr(service_type, 'name', 'Service')
        return f'{service_name} request by {client_name}' if client_name else f'{service_name} request'

    if model_name == 'ServiceTicket':
        request = getattr(instance, 'request', None)
        if request:
            return f'Ticket {instance.pk} for {_target_label(request)}'
        return f'Ticket {instance.pk}'

    try:
        return str(instance)
    except Exception:
        return f'{instance.__class__.__name__} #{instance.pk}'


def _related_user_label(instance, attr_name, fallback_pk=None):
    user = getattr(instance, attr_name, None)
    if user:
        return _actor_label(user)

    if fallback_pk:
        try:
            from users.models import User

            user = User.objects.filter(pk=fallback_pk).first()
            if user:
                return _actor_label(user)
        except Exception:
            pass

    return ''


def _display_change_value(instance, field_name, value):
    if value in (None, '', 'None'):
        return value

    model_name = instance.__class__.__name__
    if model_name == 'ServiceTicket' and field_name in {'assigned_admin_id', 'technician_id'}:
        try:
            from users.models import User

            user = User.objects.filter(pk=value).first()
            if user:
                return _actor_label(user)
        except Exception:
            pass

    return value


def _friendly_update_message(instance, actor_name, field_name, new_value):
    model_name = instance.__class__.__name__
    model_label = _model_label(model_name)
    target_label = _target_label(instance)
    field_label = _field_label(field_name)

    if field_name == 'status' and str(new_value).lower() == 'cancelled':
        reason = str(getattr(instance, '_activity_reason', '') or '').strip()
        if reason:
            return f'{actor_name} cancelled {target_label}. Reason: {reason}'
        return f'{actor_name} cancelled {target_label}.'

    if model_name == 'AdminSettings':
        return f'{actor_name} updated {field_label} in Admin Settings.'

    if model_name == 'SLARule':
        return f'{actor_name} updated {field_label} for {target_label}.'

    if model_name in {'QuotationRecord', 'InstallationContract'}:
        if field_name == 'status':
            return f'{actor_name} updated {model_label} status for Ticket #{getattr(instance, "ticket_id", "")} to {new_value}.'
        return f'{actor_name} updated {field_label} on {model_label} for Ticket #{getattr(instance, "ticket_id", "")}.'

    if model_name == 'ServiceTicket':
        if field_name == 'assigned_admin_id':
            admin_name = _related_user_label(instance, 'assigned_admin', new_value)
            if admin_name:
                return f'{actor_name} assigned {target_label} to admin owner {admin_name}.'
            return f'{actor_name} updated the admin owner for {target_label}.'

        if field_name == 'technician_id':
            technician_name = _related_user_label(instance, 'technician', new_value)
            if technician_name:
                return f'{actor_name} assigned {target_label} to technician {technician_name}.'
            return f'{actor_name} updated the assigned technician for {target_label}.'

        if field_name == 'status':
            return f'{actor_name} changed {target_label} status to {new_value}.'

        if field_name == 'priority':
            return f'{actor_name} changed {target_label} priority to {new_value}.'

        if field_name in {'scheduled_date', 'scheduled_time', 'scheduled_time_slot'}:
            return f'{actor_name} updated the schedule for {target_label}.'

        if field_name == 'reschedule_requested':
            return f'{actor_name} updated the reschedule request for {target_label}.'

        if field_name == 'completion_notes':
            return f'{actor_name} updated completion notes for {target_label}.'

    return f'{actor_name} updated the {field_label} for {model_label} {target_label}.'


def log_activity(*, actor=None, category='system', action='system', target=None, message='', metadata=None):
    """Create a readable operational log row for admin/superadmin activity feeds."""
    from users.models import ActivityLog

    request_meta = get_current_request_meta()
    actor = actor or get_current_user()
    target_model = ''
    target_app_label = ''
    target_id = None
    target_label = ''

    if target is not None:
        meta = target._meta
        target_model = meta.model_name
        target_app_label = meta.app_label
        target_id = target.pk
        target_label = _target_label(target)

    metadata_dict = metadata or {}
    ActivityLog.objects.create(
        actor=actor if getattr(actor, 'is_authenticated', False) else None,
        actor_role=getattr(actor, 'role', '') if actor else '',
        actor_display_name=_actor_label(actor),
        category=category,
        action=action,
        target_app_label=target_app_label,
        target_model=target_model,
        target_id=target_id,
        target_label=target_label,
        message=message[:255],
        metadata=metadata_dict,
        ip_address=metadata_dict.get('ip_address') or request_meta.get('ip_address'),
        user_agent=metadata_dict.get('user_agent') or request_meta.get('user_agent', ''),
    )


def notify_admin_security_alert(*, title, message, metadata=None, notification_type='urgent'):
    """Send an immediate administrator notification for security and throttling alerts."""
    try:
        from django.contrib.auth import get_user_model
        from notifications.models import Notification
        from notifications.notification_utils import notifications_enabled

        if not notifications_enabled():
            return

        User = get_user_model()
        admins = User.objects.filter(role__in=['admin', 'superadmin'], is_active=True).distinct()
        for admin in admins:
            Notification.objects.create(
                user=admin,
                title=title[:255],
                message=message,
                type=notification_type,
            )
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("Failed to send security alert to admins: %s", exc)



def _write_activity_from_change(instance, action, *, field_name='', old_value=None, new_value=None):
    actor = get_current_user()
    model_name = instance.__class__.__name__
    category = ACTIVITY_CATEGORIES.get(model_name, 'system')
    actor_name = _actor_label(actor)
    target_label = _target_label(instance)
    activity_action = action

    if field_name and not _should_log_activity_field(instance, field_name):
        return

    if action == 'update':
        normalized_status = str(new_value).lower()
        if field_name == 'status':
            if normalized_status == 'cancelled':
                activity_action = 'cancel'
            elif normalized_status == 'completed':
                activity_action = 'complete'
        elif field_name in ASSIGNMENT_ACTIVITY_FIELDS:
            activity_action = 'assign'
        elif field_name in SCHEDULE_ACTIVITY_FIELDS:
            activity_action = 'reschedule'

    if action == 'update' and field_name:
        message = _friendly_update_message(instance, actor_name, field_name, new_value)
    else:
        action_label = ACTION_LABELS.get(activity_action, ACTION_LABELS.get(action, action))
        reason = str(getattr(instance, '_activity_reason', '') or '').strip()
        if action == 'delete' and model_name == 'User' and actor_name == 'System' and reason:
            message = f'System removed expired unverified account {target_label}. Reason: {reason}'
        else:
            message = f'{actor_name} {action_label} {target_label}'

    try:
        log_activity(
            actor=actor,
            category=category,
            action=activity_action,
            target=instance,
            message=message,
            metadata={
                'field_name': field_name,
                'old_value': old_value,
                'new_value': new_value,
                'old_display_value': _display_change_value(instance, field_name, old_value),
                'new_display_value': _display_change_value(instance, field_name, new_value),
                **(
                    {'reason': str(getattr(instance, '_activity_reason', '') or '').strip()}
                    if str(getattr(instance, '_activity_reason', '') or '').strip()
                    else {}
                ),
            },
        )
    except Exception as e:
        logger.warning(f'ActivityLog {action} failed: {e}')


# ── Pre-save: capture old values ──────────────────────────────────────
@receiver(pre_save)
def changelog_pre_save(sender, instance, **kwargs):
    if not _should_track(instance):
        return

    if instance.pk:
        try:
            old_instance = sender.objects.get(pk=instance.pk)
            update_fields = kwargs.get('update_fields')
            instance._changelog_old_values = {
                field: str(getattr(old_instance, field, ''))
                for field in _get_tracked_fields(instance)
                if update_fields is None or field in update_fields
            }
            instance._changelog_is_new = False
        except sender.DoesNotExist:
            instance._changelog_is_new = True
    else:
        instance._changelog_is_new = True


# ── Post-save: write ChangeLog entries ────────────────────────────────
@receiver(post_save)
def changelog_post_save(sender, instance, created, **kwargs):
    if not _should_track(instance):
        return

    # Import here to avoid circular imports
    from users.models import ChangeLog

    ct = ContentType.objects.get_for_model(sender)
    user = get_current_user()

    if created or getattr(instance, '_changelog_is_new', True):
        # Record creation
        try:
            ChangeLog.objects.create(
                content_type=ct,
                object_id=instance.pk,
                action='create',
                field_name='',
                old_value=None,
                new_value=str(instance),
                changed_by=user,
                summary=f'Created {sender.__name__} #{instance.pk}',
            )
            _write_activity_from_change(instance, 'create', new_value=str(instance))
        except Exception as e:
            logger.warning(f'ChangeLog create failed: {e}')
    else:
        # Record field-level updates
        old_values = getattr(instance, '_changelog_old_values', {})
        update_fields = kwargs.get('update_fields')
        for field in _get_tracked_fields(instance):
            if update_fields is not None and field not in update_fields:
                continue
            old_val = old_values.get(field, '')
            new_val = str(getattr(instance, field, ''))
            if old_val != new_val:
                try:
                    summary_str = f'{sender.__name__} #{instance.pk}: {field} changed from "{old_val}" to "{new_val}"'
                    reason = str(getattr(instance, '_activity_reason', '') or getattr(instance, 'reschedule_reason', '') or '').strip()
                    if reason and (field in ['status', 'reschedule_requested', 'reschedule_reason']):
                        if len(summary_str) + len(reason) + 11 <= 255:
                            summary_str = f'{summary_str} (Reason: {reason})'
                        else:
                            summary_str = f'{summary_str[:240 - len(reason)]} (Reason: {reason})'

                    ChangeLog.objects.create(
                        content_type=ct,
                        object_id=instance.pk,
                        action='update',
                        field_name=field,
                        old_value=old_val,
                        new_value=new_val,
                        changed_by=user,
                        summary=summary_str,
                    )
                    _write_activity_from_change(
                        instance,
                        'update',
                        field_name=field,
                        old_value=old_val,
                        new_value=new_val,
                    )
                except Exception as e:
                    logger.warning(f'ChangeLog update failed: {e}')

    if sender.__name__ == 'User':
        # Revoke active sessions when role or status changes.
        old_values = getattr(instance, '_changelog_old_values', {})
        role_changed = old_values.get('role', '') != str(getattr(instance, 'role', ''))
        status_changed = old_values.get('status', '') != str(getattr(instance, 'status', ''))
        is_active_changed = old_values.get('is_active', '') != str(getattr(instance, 'is_active', ''))

        if not created and (role_changed or status_changed or is_active_changed):
            try:
                from rest_framework.authtoken.models import Token
                deleted_count, _ = Token.objects.filter(user=instance).delete()
                if deleted_count:
                    logger.info(
                        'Revoked %d auth token(s) for user %s after privilege change '
                        '(role_changed=%s, status_changed=%s)',
                        deleted_count, instance.pk, role_changed, status_changed,
                    )
            except Exception as e:
                logger.warning('Token revocation failed for user %s: %s', instance.pk, e)

        try:
            ensure_user_role_profile(instance)
        except Exception as e:
            logger.warning(f'User profile sync failed for user {instance.pk}: {e}')


# ── Pre-delete: record deletion ───────────────────────────────────────
@receiver(pre_delete)
def changelog_pre_delete(sender, instance, **kwargs):
    if not _should_track(instance):
        return

    from users.models import ChangeLog

    ct = ContentType.objects.get_for_model(sender)
    user = get_current_user()

    try:
        ChangeLog.objects.create(
            content_type=ct,
            object_id=instance.pk,
            action='delete',
            field_name='',
            old_value=str(instance),
            new_value=None,
            changed_by=user,
            summary=f'Deleted {sender.__name__} #{instance.pk}: {instance}',
        )
        _write_activity_from_change(instance, 'delete', old_value=str(instance))
    except Exception as e:
        logger.warning(f'ChangeLog delete failed: {e}')
