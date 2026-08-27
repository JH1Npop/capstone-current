from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import (
    User, TechnicianProfile, ClientProfile, ManagementProfile,
    UserCapabilityGrant, AdminSettings, ActivityLog, ChangeLog
)


class TechnicianProfileInline(admin.StackedInline):
    model = TechnicianProfile
    extra = 0
    can_delete = False
    fk_name = 'user'
    fields = (
        'is_available',
        'skill_level',
        'max_daily_assignments',
        'current_latitude',
        'current_longitude',
        'last_location_update',
        'preferred_work_areas',
        'updated_at',
    )
    readonly_fields = ('updated_at',)


class ClientProfileInline(admin.StackedInline):
    model = ClientProfile
    extra = 0
    can_delete = False
    fk_name = 'user'
    fields = (
        'client_type',
        'company_name',
        'company_registration',
        'billing_address',
        'preferred_contact_method',
        'credit_limit',
        'account_balance',
        'updated_at',
    )
    readonly_fields = ('updated_at',)


class ManagementProfileInline(admin.StackedInline):
    model = ManagementProfile
    extra = 0
    can_delete = False
    fk_name = 'user'
    fields = ('admin_scope', 'updated_at')
    readonly_fields = ('updated_at',)


class UserCapabilityGrantInline(admin.TabularInline):
    model = UserCapabilityGrant
    extra = 0
    fk_name = 'user'
    raw_id_fields = ('granted_by',)
    readonly_fields = ('granted_at',)
    fields = ('capability_code', 'granted_by', 'granted_at')


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ['id', 'username', 'email', 'role', 'status', 'is_staff', 'profile_summary']
    list_filter = ['role', 'status', 'is_staff', 'is_active']
    search_fields = ['username', 'email', 'first_name', 'last_name']
    list_select_related = ()
    fieldsets = BaseUserAdmin.fieldsets + (
        ('User Info', {'fields': ('role', 'phone', 'address', 'status')}),
    )
    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        ('User Info', {'fields': ('role',)}),
    )
    readonly_fields = ('last_login', 'date_joined')

    def get_actions(self, request):
        actions = super().get_actions(request)
        # Only allow delete action for superadmin
        if not request.user.is_authenticated or request.user.role != 'superadmin':
            if 'delete_selected' in actions:
                del actions['delete_selected']
        return actions

    def has_delete_permission(self, request, obj=None):
        # Only superadmin can delete users
        return request.user.is_authenticated and request.user.role == 'superadmin'

    def get_inline_instances(self, request, obj=None):
        if obj is None:
            return []
        return super().get_inline_instances(request, obj)

    def get_inlines(self, request, obj):
        if obj is None:
            return []

        inlines = [UserCapabilityGrantInline]
        if obj.role == 'technician':
            inlines.insert(0, TechnicianProfileInline)
        elif obj.role == 'client':
            inlines.insert(0, ClientProfileInline)
        elif obj.role in ['admin', 'superadmin']:
            inlines.insert(0, ManagementProfileInline)
        return inlines

    @admin.display(description='Profile')
    def profile_summary(self, obj):
        if obj.role == 'technician':
            profile = getattr(obj, 'technician_profile', None)
            if not profile:
                return 'Missing technician profile'
            availability = 'Available' if profile.is_available else 'Busy'
            return f'{profile.skill_level.title()} | {availability}'
        if obj.role == 'client':
            profile = getattr(obj, 'client_profile', None)
            if not profile:
                return 'Missing client profile'
            return profile.company_name or profile.client_type.title()
        if obj.role in ['admin', 'superadmin']:
            profile = getattr(obj, 'management_profile', None)
            if not profile:
                return 'Missing management profile'
            return profile.admin_scope.replace('_', ' ').title()
        return '-'


@admin.register(TechnicianProfile)
class TechnicianProfileAdmin(admin.ModelAdmin):
    list_display = ['id', 'user', 'skill_level', 'is_available', 'max_daily_assignments', 'updated_at']
    list_filter = ['skill_level', 'is_available']
    search_fields = ['user__username', 'user__email']
    raw_id_fields = ['user']
    readonly_fields = ['updated_at']


@admin.register(ClientProfile)
class ClientProfileAdmin(admin.ModelAdmin):
    list_display = ['id', 'user', 'client_type', 'company_name', 'credit_limit', 'account_balance', 'updated_at']
    list_filter = ['client_type']
    search_fields = ['user__username', 'user__email', 'company_name']
    raw_id_fields = ['user']
    readonly_fields = ['updated_at']


@admin.register(ManagementProfile)
class ManagementProfileAdmin(admin.ModelAdmin):
    list_display = ['id', 'user', 'admin_scope', 'updated_at']
    list_filter = ['admin_scope']
    search_fields = ['user__username', 'user__email']
    raw_id_fields = ['user']
    readonly_fields = ['updated_at']






@admin.register(UserCapabilityGrant)
class UserCapabilityGrantAdmin(admin.ModelAdmin):
    list_display = ['id', 'user', 'capability_code', 'granted_by', 'granted_at']
    list_filter = ['capability_code']
    search_fields = ['user__username', 'capability_code', 'granted_by__username']
    raw_id_fields = ['user', 'granted_by']
    readonly_fields = ['granted_at']


@admin.register(AdminSettings)
class AdminSettingsAdmin(admin.ModelAdmin):
    list_display = ['id', 'system_name', 'auto_dispatch_enabled', 'enable_notifications', 'updated_at']
    readonly_fields = ['updated_at']
    raw_id_fields = ['updated_by']


@admin.register(ChangeLog)
class ChangeLogAdmin(admin.ModelAdmin):
    list_display = ['id', 'content_type', 'object_id', 'action', 'field_name', 'changed_by', 'changed_at']
    list_filter = ['action', 'content_type']
    search_fields = ['object_id', 'field_name', 'summary', 'changed_by__username']
    readonly_fields = ['changed_at', 'summary', 'content_type', 'object_id', 'action', 'field_name', 'old_value', 'new_value', 'changed_by']
    raw_id_fields = ['changed_by']
    date_hierarchy = 'changed_at'

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(ActivityLog)
class ActivityLogAdmin(admin.ModelAdmin):
    list_display = ['id', 'category', 'action', 'actor', 'target_model', 'target_id', 'created_at']
    list_filter = ['category', 'action', 'target_model']
    search_fields = ['message', 'target_label', 'actor__username', 'actor__first_name', 'actor__last_name']
    readonly_fields = [
        'actor',
        'actor_role',
        'category',
        'action',
        'target_app_label',
        'target_model',
        'target_id',
        'target_label',
        'message',
        'metadata',
        'ip_address',
        'user_agent',
        'created_at',
    ]
    raw_id_fields = ['actor']
    date_hierarchy = 'created_at'

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
