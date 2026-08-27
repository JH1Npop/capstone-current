from django.db import migrations, models


AFTER_SALES_CAPABILITIES = [
    'after_sales.dashboard.view',
    'after_sales.cases.view',
    'after_sales.cases.manage',
]

OPERATIONS_CAPABILITIES = [
    'supervisor.dashboard.view',
    'supervisor.tickets.view',
    'supervisor.dispatch.view',
    'supervisor.tracking.view',
    'users.capabilities.manage_staff',
]


def convert_legacy_management_roles(apps, schema_editor):
    User = apps.get_model('users', 'User')
    UserCapabilityGrant = apps.get_model('users', 'UserCapabilityGrant')
    ManagementProfile = apps.get_model('users', 'ManagementProfile')

    role_capability_map = {
        'follow_up': AFTER_SALES_CAPABILITIES,
        'supervisor': OPERATIONS_CAPABILITIES,
    }
    scope_map = {
        'follow_up': 'service_follow_up',
        'supervisor': 'operations',
    }

    for legacy_role, capabilities in role_capability_map.items():
        for user in User.objects.filter(role=legacy_role):
            user.role = 'admin'
            user.save(update_fields=['role'])

            ManagementProfile.objects.update_or_create(
                user=user,
                defaults={'admin_scope': scope_map[legacy_role]},
            )

            for capability_code in capabilities:
                UserCapabilityGrant.objects.get_or_create(
                    user=user,
                    capability_code=capability_code,
                    defaults={'granted_by': None},
                )


def restore_legacy_management_roles(apps, schema_editor):
    # Role conversion is intentionally one-way. Restoring deleted role-specific
    # profile data is not possible after this migration drops those tables.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0016_restore_staff_role_choices'),
    ]

    operations = [
        migrations.RunPython(convert_legacy_management_roles, restore_legacy_management_roles),
        migrations.AlterField(
            model_name='user',
            name='role',
            field=models.CharField(
                choices=[
                    ('superadmin', 'Superadmin'),
                    ('admin', 'Admin'),
                    ('technician', 'Technician'),
                    ('client', 'Client'),
                ],
                default='client',
                max_length=20,
            ),
        ),
        migrations.DeleteModel(
            name='FollowUpProfile',
        ),
        migrations.DeleteModel(
            name='SupervisorProfile',
        ),
    ]
