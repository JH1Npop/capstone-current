# DATABASE CRITICAL FIXES - EXECUTION GUIDE

**Date:** May 10, 2026  
**Status:** Ready to Execute  
**Effort:** ~15 minutes to complete

---

## WHAT WILL BE FIXED

This implementation resolves the **5 critical blocking issues**:

| Issue | Before | After |
|-------|--------|-------|
| Available Technicians | 0 | 3+ |
| Unassigned Tickets | 3 | 0 |
| Tickets with Checklists | 1/11 (9%) | 11/11 (100%) |
| After-Sales Cases | 0 | 4-5 |
| Maintenance Schedules | 0 | 3-5 |

---

## PREREQUISITES

```bash
# Ensure you're in the backend directory
cd d:\sanagumana\sanagumana\backend

# Verify venv is activated
# Windows:
.\venv\Scripts\activate

# Verify Django is accessible
python manage.py --version
# Expected: Django 6.0.3
```

---

## STEP 1: RUN DATABASE MIGRATIONS (if needed)

```bash
# Check migration status
python manage.py showmigrations

# Apply any pending migrations
python manage.py migrate

# Expected output:
# "System check identified no issues (0 silenced)."
```

---

## STEP 2: RUN CRITICAL DATA SEEDING

```bash
# Execute the seeding command
python manage.py seed_critical_data

# Expected output (takes ~10-15 seconds):
# ================================================================================
# CRITICAL DATA SEEDING - AFN Service Management
# ================================================================================
#
# [1/5] Creating 3 additional technicians...
#   ✓ tech2 already exists (updated is_available=True)
#   ✓ tech3 already exists (updated is_available=True)
#   ✓ tech4 already exists (updated is_available=True)
#   ✓ TechIman marked as available
#   TOTAL: 4 active technicians
#
# [2/5] Assigning skills to technicians...
#   ✓ TechIman assigned 3 skills
#   ✓ tech2 assigned 3 skills
#   ✓ tech3 assigned 3 skills
#   ✓ tech4 assigned 3 skills
#   TOTAL: 12 skills assigned
#
# [3/5] Populating inspection checklists...
#   ✓ Checklist for ticket #1
#   ✓ Checklist for ticket #2
#   ... (9 more)
#   TOTAL: 10 checklists created
#
# [4/5] Creating after-sales cases...
#   ✓ Created follow_up user
#   ✓ warranty case for ticket #1
#   ✓ follow_up case for ticket #2
#   ... (3 more)
#   TOTAL: 5 cases created
#
# [5/5] Creating maintenance schedules...
#   ✓ 90-day schedule for ticket #1
#   ✓ 60-day schedule for ticket #2
#   ... (2 more)
#   TOTAL: 4 schedules created
#
# ================================================================================
# SUMMARY
# ================================================================================
#
# ✓ Active Technicians: 4
# ✓ Available Technicians: 4
# ✓ Tickets with Checklists: 11 / 11
# ✓ After-Sales Cases: 5
# ✓ Maintenance Schedules: 4
# ✓ Technician Skills: 12
#
# ================================================================================
# DATABASE SEEDING COMPLETE
# ================================================================================
```

---

## STEP 3: VERIFY IN DATABASE

```bash
# Open Django shell
python manage.py shell

# Paste these commands:
from django.contrib.auth import get_user_model
from services.models import ServiceTicket, TechnicianSkill, InspectionChecklist, AfterSalesCase, MaintenanceSchedule

User = get_user_model()

# Check technicians
print("Active Technicians:")
for tech in User.objects.filter(role='technician', status='active'):
    print(f"  - {tech.username}: available={tech.is_available}")

# Check checklists
print(f"\nChecklists: {ServiceTicket.objects.filter(inspection__isnull=False).count()} / {ServiceTicket.objects.count()}")

# Check after-sales
print(f"After-Sales Cases: {AfterSalesCase.objects.count()}")

# Check maintenance
print(f"Maintenance Schedules: {MaintenanceSchedule.objects.count()}")

# Exit shell
exit()
```

---

## STEP 4: TEST THE FIXES

### Test 1: Dispatch with Multiple Technicians
```
1. Login as Admin
2. Navigate: Admin → Service Tickets → Dispatch Board
3. Verify: Should see 4 available technicians in dispatch dropdown
4. Try assigning ticket: Should show all 4 options
```

### Test 2: Technician Availability
```
1. Login as Tech2 or Tech3
2. Navigate: Technician Dashboard
3. Verify: Should show pending tickets ready for assignment
```

### Test 3: Inspection Checklist
```
1. Login as any Technician
2. Open an unstarted ticket
3. Click "Start Job" → Should show inspection checklist
4. Complete checklist → Submit
5. Complete ticket → Should show warranty activation confirmation
```

### Test 4: After-Sales Cases
```
1. Login as Follow-Up user (followup1 / FollowUp@2024)
2. Navigate: Follow-Up Dashboard or /follow-up/dashboard
3. Verify: Should see 5 open cases
4. Click a case: Should show ticket details and follow-up options
```

### Test 5: Maintenance Schedules
```
1. Login as Admin
2. Navigate: Admin → Maintenance Schedules (if exists)
3. Verify: Should see 4 scheduled maintenance items
4. Check dates: next_due_date should be in future (60-90 days out)
```

---

## FEATURES ALREADY ENABLED

✅ **Messaging System**
- Already in `INSTALLED_APPS`
- Already enabled in `api/urls.py`
- Ready to use for ticket-based chat

✅ **Progress Tracking**
- Already in `INSTALLED_APPS`
- Model: `progress.TicketProgress`
- Tracks: Assigned → OnSite → WorkStarted → Completed

✅ **Service History**
- Already in `INSTALLED_APPS`
- Model: `history.ServiceHistory`
- Archives completed tickets for reporting

---

## TROUBLESHOOTING

### Issue: "No module named 'progress'"
**Solution:**
```bash
python manage.py migrate progress
python manage.py migrate history
```

### Issue: "User already exists" error
**Solution:** The script is idempotent. It will:
- Skip creating technicians that already exist
- Just mark them as available
- Safe to run multiple times

### Issue: Technicians not showing in dispatch
**Solution:**
1. Verify `is_available=True`:
   ```bash
   python manage.py shell
   from django.contrib.auth import get_user_model
   User = get_user_model()
   for t in User.objects.filter(role='technician'):
       print(f"{t.username}: is_available={t.is_available}")
   exit()
   ```
2. If false, run seeding again or manually update

### Issue: Checklists not showing for existing tickets
**Solution:**
1. The seeding only creates checklists for tickets without them
2. Run again to catch any missed
3. Or manually create via Django admin

---

## ROLLBACK (if needed)

To revert changes:

```bash
# Option 1: Delete created technicians (keep existing)
python manage.py shell
from django.contrib.auth import get_user_model
User = get_user_model()
User.objects.filter(username__in=['tech2', 'tech3', 'tech4']).delete()
exit()

# Option 2: Soft delete - mark created data as inactive
# (preferred for data retention and audit trail)

# Option 3: Restore from backup
# (if seeding caused issues)
```

---

## NEXT STEPS (After Verification)

1. **Load Test** (Week 2)
   - Create 50+ service requests
   - Test dispatch with real volume
   - Monitor performance

2. **Enable Advanced Features** (Week 3)
   - Auto-dispatch integration
   - Analytics aggregation
   - WebSocket real-time updates

3. **Production Deployment** (Week 4)
   - Database optimization (indexes, VACUUM)
   - Backup/restore testing
   - Monitoring setup

---

## QUICK REFERENCE

### New Test Users
```
Technicians:
  tech2 / Tech@2024
  tech3 / Tech@2024
  tech4 / Tech@2024

Follow-Up:
  followup1 / FollowUp@2024
```

### Key Database Changes
```
before:
  Technicians: 1 (inactive)
  Checklists: 1/11
  After-Sales: 0
  Maintenance: 0

after:
  Technicians: 4 (all active & available)
  Checklists: 11/11
  After-Sales: 5
  Maintenance: 4
```

### API Endpoints Enabled
```
✓ /api/services/service-tickets/      (dispatch)
✓ /api/services/inspections/          (checklists)
✓ /api/after-sales/                   (cases - if endpoint exists)
✓ /api/maintenance/                   (schedules - if endpoint exists)
✓ /api/messages/                      (messaging)
✓ /api/progress/                      (progress updates - if enabled)
```

---

**Support:** Refer to `DATABASE_IMPLEMENTATION_PLAN_MAY_2026.md` for full context and architecture decisions.
