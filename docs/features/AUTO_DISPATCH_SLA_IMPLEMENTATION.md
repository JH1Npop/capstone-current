# Auto-Dispatch & SLA Enforcement Implementation Guide

**Date**: April 19, 2026  
**Status**: Complete Implementation  
**Priority**: High  

---

## Overview

This document covers the complete implementation of auto-dispatch and SLA enforcement features for the AFN Service Management System. These features were previously partially implemented and are now fully integrated into the workflow.

---

## What Was Implemented

### 1. Auto-Dispatch System (`services/auto_dispatch.py`)

**Purpose**: Automatically assign the best-fit technician to a service ticket based on skill, location, workload, and availability.

#### Key Functions:

##### `find_best_technician(ticket: ServiceTicket) → Dict`
- Evaluates all available technicians with matching skills
- Scores each technician based on:
  - Skill level (expert = 45 points, professional = 35 points, etc.)
  - Distance from service location (closer = higher score)
  - Current workload (fewer active tickets = higher score)
  - Same-day workload (fewer jobs on same date = higher score)
  - Availability flag (available = 5 point bonus)
- Returns the highest-scoring technician or `None` if no match found

##### `auto_assign_technician(ticket: ServiceTicket) → bool`
- Finds best technician and assigns them to the ticket
- Creates `TicketCrewAssignment` record
- Sets `auto_assigned=True`, `assigned_at`, `smart_assignment_score`, `smart_assignment_summary`
- Sends notifications to technician and supervisor
- Returns `True` if successful, `False` if no suitable technician found

##### `reassign_if_needed(ticket: ServiceTicket) → bool`
- Checks if current assignment is still suitable
- Reassigns if:
  - Current technician becomes unavailable
  - Current technician's workload exceeds MAX_ACTIVE_ASSIGNMENTS_PER_TECH (5)
- Used for dynamic reassignment during ticket lifecycle

##### `should_attempt_auto_dispatch(ticket: ServiceTicket) → bool`
- Determines if auto-dispatch should be attempted
- Returns `False` if:
  - Ticket already has technician assigned
  - Service location is missing
  - Ticket is in terminal state (Completed, Cancelled)

#### Configuration:
```python
MAX_ACTIVE_ASSIGNMENTS_PER_TECH = 5      # Max active jobs per technician
MIN_SCORE_THRESHOLD = 30.0                # Minimum score required for assignment
```

#### Integration Points:

**1. Request Approval Workflow** (`services/views.py`)
```python
@action(detail=True, methods=['post'])
def approve(self, request, pk=None):
    # ... existing code ...
    
    # Attempt auto-dispatch if enabled in AdminSettings
    admin_settings = AdminSettings.objects.first()
    if admin_settings.auto_dispatch_enabled:
        auto_assign_technician(ticket)
```

The auto-dispatch is triggered when a service request is approved, attempting to immediately assign a technician if one is available.

**2. Admin Settings Control** (`users/models.py`)
```python
class AdminSettings(models.Model):
    auto_dispatch_enabled = models.BooleanField(default=False)  # Master toggle
```

Admins can enable/disable auto-dispatch from the admin dashboard without code changes.

---

### 2. SLA Enforcement (`services/sla.py`)

**Purpose**: Monitor service level agreements and take corrective action when breaches occur.

#### SLA Rules Tracked:
1. **Approval Delay**: How long a request waits for approval
   - Warning: 4 hours
   - Breach: 8 hours

2. **Assignment Delay**: How long a ticket waits for technician assignment
   - Warning: 2 hours
   - Breach: 6 hours

3. **Start Delay**: How long after scheduled start time before work begins
   - Warning: 15 minutes
   - Breach: 60 minutes

4. **Execution Delay**: How long work takes vs. estimated duration
   - Warning: 1.5x estimated duration
   - Breach: 2x estimated duration

5. **Reschedule Delay**: How long a reschedule request waits for response
   - Warning: 4 hours
   - Breach: 12 hours

#### Key Functions:

##### `check_and_escalate_sla_breaches(*, now=None) → Dict`
- Scans all active tickets for SLA breaches
- Takes corrective action for each breach type:
  - **Assignment Overdue**: Auto-attempts dispatch or notifies supervisors
  - **Start Overdue**: Escalates ticket priority to "Urgent" and notifies technician
  - **Execution Overdue**: Marks as "Urgent" and escalates for review
  - **Reschedule Overdue**: Notifies admins that action is needed
- Returns count of escalations by type

##### `check_sla_warnings(*, now=None) → Dict`
- Scans for SLA warnings (approaching breaches)
- Helps prevent breaches by giving advance warning
- Returns count of warnings by type

#### Escalation Actions:

**Assignment Overdue**:
```
1. If ticket still unassigned → Attempt auto-dispatch
2. Notify supervisors and admins
3. Alert system for manual review if no technician available
```

**Start Overdue**:
```
1. Escalate ticket priority to "Urgent"
2. Send notification to assigned technician
3. Alert supervisors that work hasn't started
```

**Execution Overdue**:
```
1. Escalate ticket priority to "Urgent"
2. Add system note about escalation
3. Notify supervisors/admins
```

**Reschedule Overdue**:
```
1. Notify admins that reschedule request needs response
2. Alert system for manual intervention
```

---

### 3. Notification System (`notifications/sla_notifications.py`)

Created specialized notification handlers for SLA escalations:

#### Functions:
- `notify_admins_sla_breach()` - Alert admins about SLA violations
- `notify_supervisors_ticket_escalation()` - Escalate to supervisors
- `notify_admins_ticket_escalation()` - Escalate to admins

All notifications include:
- What rule was breached/approaching
- Minutes to breach / overdue
- Required action
- Ticket/request details

---

### 4. Management Commands

#### `python manage.py check_sla_violations`
Checks for and escalates SLA violations.

**Options**:
```bash
--warnings-only      # Only check for warnings, don't escalate
--escalations-only   # Only escalate breaches, don't check warnings
--verbose            # Show detailed output
```

**Example Usage**:
```bash
# Check for all violations
python manage.py check_sla_violations --verbose

# Only check for warnings
python manage.py check_sla_violations --warnings-only

# Only escalate breaches
python manage.py check_sla_violations --escalations-only
```

**Recommended Setup**: Run this every 30-60 minutes via cron/task scheduler.

#### `python manage.py auto_assign_tickets`
Performs manual auto-assignment of technicians.

**Options**:
```bash
--verbose         # Show detailed output
--dry-run         # Show what would happen without making changes
--reassign        # Attempt to reassign already-assigned tickets
--ticket-ids      # Comma-separated list of specific ticket IDs to process
```

**Example Usage**:
```bash
# Auto-assign all unassigned tickets
python manage.py auto_assign_tickets --verbose

# Test without making changes
python manage.py auto_assign_tickets --dry-run

# Reassign if conditions warrant
python manage.py auto_assign_tickets --reassign --verbose

# Process specific tickets
python manage.py auto_assign_tickets --ticket-ids 1,5,12
```

**Recommended Setup**: Run daily or on-demand as needed. Can be triggered manually from admin dashboard or scheduled.

---

## How to Use

### Enable Auto-Dispatch

1. **Via Admin Dashboard**:
   - Go to Admin Settings
   - Check "Enable Auto-Dispatch"
   - Save

2. **Via Django Shell**:
```python
from users.models import AdminSettings
settings, created = AdminSettings.objects.get_or_create(pk=1)
settings.auto_dispatch_enabled = True
settings.save()
```

### Monitor SLA Violations

**Option 1: Manual Check**
```bash
python manage.py check_sla_violations --verbose
```

**Option 2: Scheduled Task** (Recommended)

**Windows Task Scheduler**:
```powershell
# In Caps - Copy\automation\
# Add to schedule_task.ps1:

$taskAction = New-ScheduledTaskAction -Execute 'C:\path\to\python.exe' `
    -Argument 'manage.py check_sla_violations' `
    -WorkingDirectory 'D:\Caps - Copy'

Register-ScheduledTask -TaskName "Check SLA Violations" `
    -Action $taskAction `
    -Trigger (New-ScheduledTaskTrigger -RepetitionInterval (New-TimeSpan -Minutes 30) -RepetitionDuration (New-TimeSpan -Days 365)) `
    -Principal (New-ScheduledTaskPrincipal -UserID $env:USERNAME -LogonType Interactive)
```

**Linux Cron**:
```bash
# Every 30 minutes
*/30 * * * * cd /path/to/Caps && source venv/bin/activate && python backend/manage.py check_sla_violations

# Twice daily
0 9,17 * * * cd /path/to/Caps && source venv/bin/activate && python backend/manage.py check_sla_violations
```

### Manual Assignment (When Auto-Dispatch is Disabled)

```bash
# Assign all unassigned tickets
python manage.py auto_assign_tickets --verbose

# Test first with dry-run
python manage.py auto_assign_tickets --dry-run --verbose

# Reassign if needed
python manage.py auto_assign_tickets --reassign
```

---

## Testing

Comprehensive test suite included in `services/test_auto_dispatch_and_sla.py`:

### Run Tests
```bash
# All tests
python manage.py test services.test_auto_dispatch_and_sla

# Specific test class
python manage.py test services.test_auto_dispatch_and_sla.AutoDispatchTests

# Specific test method
python manage.py test services.test_auto_dispatch_and_sla.AutoDispatchTests.test_auto_assign_technician_success

# With verbose output
python manage.py test services.test_auto_dispatch_and_sla --verbosity=2
```

### Test Coverage

**AutoDispatchTests** (8 tests):
- Finding best technician
- Skipping unavailable technicians
- Skipping wrong skills
- Successful assignment
- Already assigned skip
- Crew assignment creation
- Auto-dispatch eligibility checks

**SLAEvaluationTests** (4 tests):
- Request SLA pending
- Request SLA completed
- Ticket SLA unassigned
- Ticket SLA in-progress

**SLAEscalationTests** (2 tests):
- Detecting overdue breaches
- Detecting approaching breaches

**AdminSettingsAutoDispatchTests** (1 test):
- Auto-dispatch respects admin settings flag

---

## Database Models Used

### ServiceTicket
- `auto_assigned` (Boolean) - Was this auto-assigned?
- `assigned_at` (DateTime) - When was it assigned?
- `smart_assignment_score` (Float) - Assignment score
- `smart_assignment_summary` (Text) - Why this technician was chosen
- `technician` (FK) - Assigned technician
- `status` - Ticket status

### TicketCrewAssignment
- `ticket` (FK) - Service ticket
- `technician` (FK) - Crew member
- `created_at` (DateTime) - When assigned

### AdminSettings
- `auto_dispatch_enabled` (Boolean) - Master toggle for auto-dispatch

### User (Technician)
- `is_available` (Boolean) - Technician available for assignment
- `current_latitude` / `current_longitude` - Location for distance calculation
- `status` - User status (active/inactive)

---

## Configuration & Customization

### Adjust Assignment Weights

In `services/auto_dispatch.py`:
```python
MAX_ACTIVE_ASSIGNMENTS_PER_TECH = 5      # Change max jobs per tech
MIN_SCORE_THRESHOLD = 30.0                # Change minimum score
```

In `services/views.py`:
```python
SKILL_LEVEL_WEIGHTS = {
    'expert': 1.0,
    'professional': 0.8,
    'intermediate': 0.6,
    'beginner': 0.4,
}
```

### Adjust SLA Thresholds

In `services/sla.py`:
```python
APPROVAL_WARNING_AFTER = timedelta(hours=4)        # Change warning time
APPROVAL_OVERDUE_AFTER = timedelta(hours=8)        # Change breach time
ASSIGNMENT_WARNING_AFTER = timedelta(hours=2)
ASSIGNMENT_OVERDUE_AFTER = timedelta(hours=6)
START_WARNING_AFTER = timedelta(minutes=15)
START_OVERDUE_AFTER = timedelta(minutes=60)
EXECUTION_WARNING_MULTIPLIER = 1.5                 # 1.5x estimated duration = warning
EXECUTION_OVERDUE_MULTIPLIER = 2                   # 2x estimated duration = breach
RESCHEDULE_WARNING_AFTER = timedelta(hours=4)
RESCHEDULE_OVERDUE_AFTER = timedelta(hours=12)
```

---

## API Endpoints Affected

### Service Request Approval
```http
POST /api/services/service-requests/{id}/approve/
```
- Triggers auto-dispatch (if enabled)
- Sets request status to "Approved"
- Notifies client

### Ticket Assignment (Existing)
```http
POST /api/services/service-tickets/{id}/assign/
```
- Still works for manual assignment
- No change to existing behavior

---

## Future Enhancements

1. **Machine Learning Scoring**
   - Track assignment success rates
   - Adjust weights based on historical data
   - Predict job completion time

2. **Dynamic SLA Adjustment**
   - Adjust SLA thresholds based on technician availability
   - Service complexity factors
   - Seasonal demand patterns

3. **Predictive Assignment**
   - Assign before request is approved
   - Reduce time between approval and assignment

4. **Advanced Reassignment**
   - Detect technician conflicts
   - Proactive reassignment before failure
   - Load balancing across shift times

5. **SLA Dashboard**
   - Real-time SLA status visualization
   - Historical SLA breach analysis
   - Technician SLA performance metrics

---

## Troubleshooting

### Auto-Dispatch Not Working

1. **Check if enabled**:
```python
from users.models import AdminSettings
settings = AdminSettings.objects.first()
print(f"Auto-dispatch enabled: {settings.auto_dispatch_enabled}")
```

2. **Check if technicians have skills**:
```python
from services.models import TechnicianSkill
TechnicianSkill.objects.filter(service_type_id=1)
```

3. **Check technician location**:
```python
from django.contrib.auth import get_user_model
User = get_user_model()
tech = User.objects.get(username='tech')
print(f"Location: ({tech.current_latitude}, {tech.current_longitude})")
```

### SLA Checks Not Running

1. **Verify management command**:
```bash
python manage.py help check_sla_violations
```

2. **Run manually**:
```bash
python manage.py check_sla_violations --verbose
```

3. **Check logs**:
```bash
tail -f backend/logs/django.log | grep SLA
```

### Notifications Not Sending

1. **Check notification settings**:
```python
from django.conf import settings
print(f"Email backend: {settings.EMAIL_BACKEND}")
print(f"Default from email: {settings.DEFAULT_FROM_EMAIL}")
```

2. **Check admin user notifications enabled**:
```python
from django.contrib.auth import get_user_model
User = get_user_model()
admins = User.objects.filter(role='admin')
print(f"Admins: {[a.username for a in admins]}")
```

---

## Related Documentation

- [UNIFIED_DASHBOARD_IMPLEMENTATION_SUMMARY.md](../UNIFIED_DASHBOARD_IMPLEMENTATION_SUMMARY.md) - Shared dashboard features
- [COMPREHENSIVE_BACKEND_ASSESSMENT.md](../COMPREHENSIVE_BACKEND_ASSESSMENT.md) - Backend architecture overview
- [FUNCTIONALITY_STATUS.md](../FUNCTIONALITY_STATUS.md) - Feature completion status
