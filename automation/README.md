# Analytics Automation Setup - Quick Start

## 🚀 EASIEST WAY: One-Click Setup (Recommended)

### Step 1: Open PowerShell as Administrator

1. Press `Win + R`
2. Type `powershell`
3. Press `Ctrl + Shift + Enter` (to run as Administrator)
4. Click "Yes" when prompted

### Step 2: Run the Setup Script

Paste and press Enter:

```powershell
powershell -ExecutionPolicy Bypass -File "D:\Caps - Copy\automation\setup_task_scheduler.ps1"
```

**That's it!** The script will:
- ✅ Create the scheduled task
- ✅ Configure it to run daily at 2 AM
- ✅ Set it to run with admin privileges
- ✅ Test the task
- ✅ Create logs directory

---

## 📋 WHAT GETS AUTOMATED

The task runs **every day at 2:00 AM** and:

```
1. Generates yesterday's ServiceAnalytics
   - Response time, completion time, utilization, satisfaction

2. Generates yesterday's TechnicianPerformance
   - Per-technician metrics, leaderboard data

3. Saves logs to: D:\Caps - Copy\logs\analytics_YYYY-MM-DD.log
```

---

## ✅ VERIFY IT'S WORKING

### Check Task Scheduler:

1. Press `Win + R`
2. Type `taskschd.msc`
3. Press Enter
4. Look for: **"AFN Analytics - Daily Generation"**

Expected status: **Ready** ✓

### Check Logs:

Open File Explorer and navigate to:
```
D:\Caps - Copy\logs\
```

You should see:
- `analytics_2026-04-18.log`
- `analytics_2026-04-19.log`

### View Latest Log:

PowerShell:
```powershell
Get-Content "D:\Caps - Copy\logs\analytics_$(Get-Date -Format 'yyyy-MM-dd').log" -Tail 20
```

---

## 🧪 MANUAL TESTING

### Test the task right now:

PowerShell (as Administrator):
```powershell
Start-ScheduledTask -TaskName "AFN Analytics - Daily Generation"
```

Wait 10-30 seconds, then check:
```powershell
Get-ScheduledTaskInfo -TaskName "AFN Analytics - Daily Generation"
```

Look for `LastRunTime` and `LastTaskResult` (0 = success)

### Manual run (without scheduler):

```powershell
cd "D:\Caps - Copy\backend"
..\venv\Scripts\python.exe manage.py generate_daily_analytics
..\venv\Scripts\python.exe manage.py generate_technician_performance
```

---

## 🔧 ADDITIONAL COMMANDS

### Backfill historical data (one-time):

```powershell
powershell -ExecutionPolicy Bypass -File "D:\Caps - Copy\automation\run_analytics.ps1" -Action backfill
```

This generates 90 days of historical analytics.

### Force regenerate yesterday:

```powershell
powershell -ExecutionPolicy Bypass -File "D:\Caps - Copy\automation\run_analytics.ps1" -Action force
```

### Disable the scheduled task:

```powershell
Disable-ScheduledTask -TaskName "AFN Analytics - Daily Generation"
```

### Remove the task:

```powershell
Unregister-ScheduledTask -TaskName "AFN Analytics - Daily Generation" -Confirm:$false
```

---

## 📊 VERIFY ANALYTICS IN YOUR SYSTEM

### Check the database:

Open `db.sqlite3` with SQLite Browser and query:

```sql
SELECT date, total_requests, avg_response_time_hours, satisfaction_score 
FROM services_serviceanalytics 
ORDER BY date DESC 
LIMIT 5;
```

### Check the API:

Start your server:
```powershell
cd "D:\Caps - Copy\backend"
..\venv\Scripts\python.exe manage.py runserver
```

Visit: `http://localhost:8000/api/services/analytics/dashboard_metrics/`

You'll see REAL analytics data in JSON format.

---

## 📁 FILES CREATED

```
D:\Caps - Copy\automation\
├── run_analytics.ps1              # PowerShell script (can run standalone)
├── run_analytics.bat              # Batch script (alternative)
├── setup_task_scheduler.ps1       # One-click setup script
├── TASK_SCHEDULER_SETUP.md        # Detailed manual setup guide
└── README.md                       # This file
```

---

## 🛑 TROUBLESHOOTING

### Task is not running?

1. **Check if Windows is blocking PowerShell:**
   ```powershell
   Get-ExecutionPolicy
   ```
   Should show: `Bypass` or `RemoteSigned`

2. **Check Task Scheduler logs:**
   - Open Event Viewer: `Win + R` → `eventvwr.msc`
   - Go to: Windows Logs → Application
   - Look for errors with source "Task Scheduler"

3. **Verify Python works:**
   ```powershell
   cd "D:\Caps - Copy\backend"
   ..\venv\Scripts\python.exe --version
   ```

4. **Check permissions:**
   - Logs directory must be writable
   - Database file must be writable
   - Verify: `icacls "D:\Caps - Copy\logs"`

### Logs are not being created?

1. Check logs directory exists:
   ```powershell
   Test-Path "D:\Caps - Copy\logs"
   ```

2. Create if missing:
   ```powershell
   New-Item -ItemType Directory -Path "D:\Caps - Copy\logs" -Force
   ```

3. Check permissions:
   ```powershell
   icacls "D:\Caps - Copy\logs"
   ```

---

## 🔄 MONITORING

### Check if task ran today:

```powershell
$Task = Get-ScheduledTaskInfo -TaskName "AFN Analytics - Daily Generation"
$Task | Select-Object LastRunTime, LastTaskResult, NextRunTime
```

### See task statistics:

```powershell
Get-ScheduledTask -TaskName "AFN Analytics - Daily Generation" | Select-Object *
```

### Get all runs this month:

```powershell
Get-ChildItem "D:\Caps - Copy\logs\analytics_*.log" | Measure-Object
```

---

## 📞 SUPPORT

If something goes wrong:

1. **Check logs:** `D:\Caps - Copy\logs\`
2. **Run manually:** Test the script directly with the commands above
3. **Check database:** Verify DB has new records
4. **Verify API:** Check if endpoint returns data

---

## ✨ NEXT STEPS

Now that analytics are automated:

1. **Dashboard:** Create frontend dashboard to visualize analytics
2. **Alerts:** Set up alerts when metrics drop below thresholds
3. **Reports:** Generate monthly PDF reports
4. **Forecasting:** Implement demand forecasting
5. **Optimization:** Use analytics to improve technician allocation

---

**Setup Complete!** 🎉 Your analytics will run automatically every day at 2 AM.
