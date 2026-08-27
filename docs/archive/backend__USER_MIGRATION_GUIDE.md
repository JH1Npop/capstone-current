# User Structure Migration Guide

## Overview
This guide outlines the process to migrate from a single User model to separated user tables:
- **Management** (admin and superadmin roles)
- **Technician** (technician-specific fields)
- **Client** (client-specific fields)
- **FollowUpSpecialist** (service follow-up specialists)
- **Supervisor** (supervisor users)

## Migration Steps

### 1. Backup Your Database
```bash
# Create a backup before starting
python manage.py dumpdata > backup_before_migration.json
# Or backup your SQLite/PostgreSQL database directly
```

### 2. Update Django Settings
Add to `afn_service_management/settings.py`:

```python
# Authentication backends
AUTHENTICATION_BACKENDS = [
    'users.user_utils.MultiModelAuthBackend',
    'django.contrib.auth.backends.ModelBackend',
]

# Custom user model (for admin compatibility)
AUTH_USER_MODEL = 'users.Management'

# Template context processors
TEMPLATES = [
    {
        # ... existing settings
        'OPTIONS': {
            'context_processors': [
                # ... existing processors
                'users.user_utils.user_type_context',
            ],
        },
    },
]
```

### 3. Replace Models Files
1. **Backup existing models**: `cp users/models.py users/models_old.py`
2. **Replace with new structure**: `cp users/models_new.py users/models.py`
3. **Update services models**: `cp services/models_updated.py services/models.py`

### 4. Create Database Migrations
```bash
# Create migrations for the new user structure
python manage.py makemigrations users
python manage.py makemigrations services

# Apply migrations (this will create new tables)
python manage.py migrate
```

### 5. Run Data Migration
```bash
# Execute the data migration script
python manage.py shell < users/migrations_new_user_structure.py
```

### 6. Update Foreign Key References
The following models need manual updates for foreign key references:

#### Services App
- `ServiceRequest.client` → `client_user_type`, `client_user_id`
- `ServiceTicket.technician` → `technician_user_type`, `technician_user_id`
- `ServiceTicket.supervisor` → `supervisor_user_type`, `supervisor_user_id`
- `TicketCrewAssignment.technician` → `technician_user_type`, `technician_user_id`
- `AfterSalesCase.client` → `client_user_type`, `client_user_id`
- `AfterSalesCase.assigned_to` → `assigned_to_user_type`, `assigned_to_user_id`
- `AfterSalesCase.created_by` → `created_by_user_type`, `created_by_user_id`
- `TechnicianSkill.technician` → `technician_user_type`, `technician_user_id`
- `ServiceStatusHistory.changed_by` → `changed_by_user_type`, `changed_by_user_id`

#### Other Apps to Update
- `notifications.Notification.user`
- `messages_app.Message.sender`, `messages_app.Message.receiver`
- `progress.TicketProgress.updated_by`
- `history.ServiceHistory.technician`
- `inventory.InventoryTransaction.technician`, `inventory.InventoryTransaction.performed_by`
- `inventory.InventoryReservation.technician`

### 7. Update Serializers
Update all serializers to use the new user reference pattern:

```python
# Example for ServiceRequestSerializer
class ServiceRequestSerializer(serializers.ModelSerializer):
    client = serializers.SerializerMethodField()
    
    def get_client(self, obj):
        client = obj.get_client()
        if client:
            return {
                'id': client.id,
                'username': client.username,
                'email': client.email,
                'user_type': 'client'
            }
        return None
    
    class Meta:
        model = ServiceRequest
        fields = ['id', 'client', 'service_type', 'description', ...]
```

### 8. Update Views and Controllers
Update views to handle the new user structure:

```python
# Example for assigning technician to ticket
def assign_technician(request, ticket_id):
    ticket = ServiceTicket.objects.get(id=ticket_id)
    technician = Technician.objects.get(id=request.data['technician_id'])
    ticket.set_technician(technician)
    ticket.save()
    return Response({'status': 'assigned'})
```

### 9. Update Frontend
Update frontend to handle new user structure:

```javascript
// Update API calls to handle user references
const assignTechnician = (ticketId, technicianId) => {
    return api.put(`/tickets/${ticketId}/assign/`, {
        technician_user_type: 'technician',
        technician_user_id: technicianId
    });
};

// Update user type detection
const getUserType = (user) => {
    if (user.is_management) return 'management';
    if (user.is_technician) return 'technician';
    if (user.is_client) return 'client';
    if (user.is_followup_specialist) return 'followup';
    if (user.is_supervisor) return 'supervisor';
    return 'unknown';
};
```

### 10. Update RBAC System
Update the RBAC configuration in `frontend/src/rbac.js`:

```javascript
// Update capability checks for new user types
export const canAccessAdminWorkspace = (user) => {
    return user.is_management && ['admin', 'superadmin'].includes(user.role);
};

export const canAccessTechnicianDashboard = (user) => {
    return user.is_technician;
};
```

### 11. Testing
Create comprehensive tests for the new structure:

```python
# Test user authentication
class UserAuthenticationTest(TestCase):
    def test_management_login(self):
        user = Management.objects.create_user(username='admin', password='pass')
        self.client.login(username='admin', password='pass')
        response = self.client.get('/admin/')
        self.assertEqual(response.status_code, 200)

# Test user references
class UserReferenceTest(TestCase):
    def test_ticket_technician_assignment(self):
        technician = Technician.objects.create_user(username='tech', password='pass')
        ticket = ServiceTicket.objects.create(...)
        ticket.set_technician(technician)
        self.assertEqual(ticket.get_technician(), technician)
```

### 12. Cleanup (After Verification)
Once everything is working:

```bash
# Remove old models and migration files
rm users/models_old.py
# Remove old migration files (keep new ones)
find . -name "0*_*.py" -path "*/migrations/*" ! -name "__init__.py" | grep -E "(users|services)" | xargs rm

# Create final migration
python manage.py makemigrations
python manage.py migrate
```

## Benefits of New Structure

1. **Clear Role Separation**: Each user type has its own table with specific fields
2. **Better Performance**: Smaller, more focused tables
3. **Easier Maintenance**: Role-specific logic is isolated
4. **Scalability**: Easy to add new user types
5. **Data Integrity**: Foreign key constraints prevent invalid role assignments

## Rollback Plan

If issues arise:

1. **Restore Database**: Use the backup created in step 1
2. **Revert Models**: Restore `models_old.py` files
3. **Rollback Migrations**: `python manage.py migrate <app> <migration_before_changes>`

## Common Issues and Solutions

### Issue: Authentication fails
**Solution**: Ensure `MultiModelAuthBackend` is first in `AUTHENTICATION_BACKENDS`

### Issue: Admin interface broken
**Solution**: Update `admin.py` files to register new user models

### Issue: Foreign key constraints fail
**Solution**: Run data migration script before applying schema migrations

### Issue: Frontend can't authenticate
**Solution**: Update login endpoints to return user type information

## Support

For issues during migration:
1. Check Django logs for specific error messages
2. Verify data migration completed successfully
3. Test each user type separately
4. Use Django shell to verify user references work correctly
