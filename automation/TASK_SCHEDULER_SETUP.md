# Windows Task Scheduler Setup for Daily Analytics

## OPTION 1: Using PowerShell Script (Recommended)

### Step 1: Create Task Scheduler Task

Open **Task Scheduler** (Press `Win + R`, type `taskschd.msc`, press Enter)

### Step 2: Create New Task

1. Click **"Create Basic Task"** in the right sidebar
2. **Name:** `AFN Analytics - Daily Generation`
3. **Description:** `Automatically generates service analytics and technician performance metrics daily`
4. Click **Next**

### Step 3: Set Schedule

1. Select **"Daily"**
2. Click **Next**
3. Set **Start date:** Today
4. Set **Recur every:** 1 day
5. **Time:** 2:00 AM (when system is less busy)
6. Click **Next**

### Step 4: Set Action

1. Select **"Start a program"**
2. Click **Next**

### Step 5: Configure Program

**Program/script:**
```
powershell.exe
```

**Add arguments:**
```
-ExecutionPolicy Bypass -File "D:\Caps - Copy\automation\run_analytics.ps1" -Action daily
```

**Start in:**
```
D:\Caps - Copy\automation
```

Click **Next**

### Step 6: Finish

1. Check **"Open the Properties dialog for this task when I click Finish"**
2. Click **Finish**

### Step 7: Configure Properties

In the Properties dialog:

**General Tab:**
- ✓ Check "Run whether user is logged in or not"
- ✓ Check "Run with highest privileges"

**Triggers Tab:**
- Edit the trigger and set additional options if needed

**Actions Tab:**
- Should show your PowerShell command

**Settings Tab:**
- ✓ Allow task to be run on demand
- ✓ If the task fails, restart every: 10 minutes
- Retry count: 3
- ✓ Stop the task if it runs longer than: 1 hour

Click **OK**

---

## OPTION 2: Using Batch Script

### Step 1-4: Same as above

### Step 5: Configure Program

**Program/script:**
```
D:\Caps - Copy\automation\run_analytics.bat
```

**Add arguments:**
```
daily
```

**Start in:**
```
D:\Caps - Copy\automation
```

### Step 6-7: Same as above

---

## OPTION 3: Using Command Line (PowerShell)

Run PowerShell as Administrator and execute:

```powershell
# Create task for daily analytics at 2 AM
$Action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument '-ExecutionPolicy Bypass -File "D:\Caps - Copy\automation\run_analytics.ps1" -Action daily'

$Trigger = New-ScheduledTaskTrigger -Daily -At 2am

$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 10)

$Task = New-ScheduledTask -Action $Action -Trigger $Trigger -Settings $Settings `
    -Description "AFN Analytics - Daily Generation"

Register-ScheduledTask -TaskPath "\" -TaskName "AFN Analytics - Daily Generation" -InputObject $Task -Force
```

---

## VERIFY THE TASK

### Check if task was created:

1. Open **Task Scheduler**
2. Look for **"AFN Analytics - Daily Generation"** in the task list
3. Right-click → **Run** to test immediately

### Check logs:

Navigate to: `D:\Caps - Copy\logs\`

You should see daily log files like:
- `analytics_2026-04-18.log`
- `analytics_2026-04-19.log`

View logs with:
```
notepad D:\Caps - Copy\logs\analytics_2026-04-18.log
```

---

## ADDITIONAL TASKS (Optional)

### Backfill Historical Data (Run Once)

Create another task to backfill data:

1. **Name:** `AFN Analytics - Backfill Historical Data`
2. **Action:** Run once, not recurring
3. **Program:** `powershell.exe`
4. **Arguments:** 
   ```
   -ExecutionPolicy Bypass -File "D:\Caps - Copy\automation\run_analytics.ps1" -Action backfill
   ```
5. **Trigger:** Manual (Run once to fill last 90 days)

Then right-click and Run to execute:
```powershell
& "D:\Caps - Copy\automation\run_analytics.ps1" -Action backfill
```

### Force Regenerate (Optional)

For regenerating yesterday's data if it failed:

```powershell
& "D:\Caps - Copy\automation\run_analytics.ps1" -Action force
```

---

## TROUBLESHOOTING

### Task Not Running?

1. **Check Event Viewer:**
   - Press `Win + R`
   - Type `eventvwr.msc`
   - Navigate to: Windows Logs → Application
   - Look for errors with source "Task Scheduler"

2. **Permissions Issue:**
   - Right-click task → Properties
   - General → Check "Run with highest privileges"

3. **Python Not Found:**
   - Verify path exists: `D:\Caps - Copy\venv\Scripts\python.exe`
   - Check in File Explorer

### Logs Not Being Created?

1. Verify logs directory exists: `D:\Caps - Copy\logs\`
2. Check disk space
3. Verify write permissions to the logs directory

### Manual Test:

Open PowerShell as Administrator and run:

```powershell
cd "D:\Caps - Copy\backend"
..\venv\Scripts\python.exe manage.py generate_daily_analytics
```

---

## SCHEDULE RECOMMENDATIONS

**Daily Analytics:** 2:00 AM - When system is idle
**Weekly Report:** Every Monday at 8:00 AM
**Monthly Backfill:** First day of month (optional, for cleanup)

---

## MONITORING

Check logs regularly to ensure tasks are running:

```powershell
# View latest log
Get-Content "D:\Caps - Copy\logs\analytics_$(Get-Date -Format 'yyyy-MM-dd').log" -Tail 20

# Count successful runs this month
(Get-ChildItem "D:\Caps - Copy\logs\*.log" | Measure-Object).Count
```

---

## DISABLE/REMOVE TASK

```powershell
# Disable task
Disable-ScheduledTask -TaskName "AFN Analytics - Daily Generation"

# Remove task
Unregister-ScheduledTask -TaskName "AFN Analytics - Daily Generation" -Confirm:$false
```
