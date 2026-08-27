# One-Click Task Scheduler Setup
# Run this as Administrator in PowerShell
# powershell -ExecutionPolicy Bypass -File "setup_task_scheduler.ps1"

Write-Host "AFN Analytics - Automatic Task Scheduler Setup" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
Write-Host ""

# Check if running as Administrator
$IsAdmin = ([System.Security.Principal.WindowsIdentity]::GetCurrent()).Groups -match "S-1-5-32-544"
if (-not $IsAdmin) {
    Write-Host "ERROR: This script must be run as Administrator!" -ForegroundColor Red
    Write-Host "Please right-click PowerShell and select 'Run as administrator'" -ForegroundColor Yellow
    exit 1
}

Write-Host "✓ Running as Administrator" -ForegroundColor Green
Write-Host ""

# Configuration
$ProjectRoot = "D:\Caps - Copy"
$AutomationDir = "$ProjectRoot\automation"
$ScriptPath = "$AutomationDir\run_analytics.ps1"
$TaskName = "AFN Analytics - Daily Generation"
$TaskDescription = "Automatically generates service analytics and technician performance metrics daily"
$ScheduleTime = "02:00:00"  # 2 AM

# Verify files exist
Write-Host "Checking files..." -ForegroundColor Cyan
if (!(Test-Path $ProjectRoot)) {
    Write-Host "ERROR: Project directory not found: $ProjectRoot" -ForegroundColor Red
    exit 1
}

if (!(Test-Path $ScriptPath)) {
    Write-Host "ERROR: Script not found: $ScriptPath" -ForegroundColor Red
    exit 1
}

Write-Host "✓ All files found" -ForegroundColor Green
Write-Host ""

# Remove existing task if it exists
Write-Host "Checking for existing task..." -ForegroundColor Cyan
try {
    $ExistingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($ExistingTask) {
        Write-Host "Found existing task. Removing..." -ForegroundColor Yellow
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
        Write-Host "✓ Existing task removed" -ForegroundColor Green
    }
}
catch {
    # Task doesn't exist, which is fine
}

Write-Host ""
Write-Host "Creating new task..." -ForegroundColor Cyan

try {
    # Create task action
    $Action = New-ScheduledTaskAction -Execute 'powershell.exe' `
        -Argument "-ExecutionPolicy Bypass -File `"$ScriptPath`" -Action daily"

    # Create task trigger (Daily at 2 AM)
    $Trigger = New-ScheduledTaskTrigger -Daily -At $ScheduleTime

    # Create task settings
    $Settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -RestartCount 3 `
        -RestartInterval (New-TimeSpan -Minutes 10) `
        -ExecutionTimeLimit (New-TimeSpan -Hours 1)

    # Create task
    $Task = New-ScheduledTask `
        -Action $Action `
        -Trigger $Trigger `
        -Settings $Settings `
        -Description $TaskDescription

    # Register task
    Register-ScheduledTask `
        -TaskPath "\" `
        -TaskName $TaskName `
        -InputObject $Task `
        -Force | Out-Null

    Write-Host "✓ Task created successfully!" -ForegroundColor Green
}
catch {
    Write-Host "ERROR: Failed to create task: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Configuring task properties..." -ForegroundColor Cyan

try {
    # Get the task and configure additional properties
    $TaskService = New-Object -ComObject Schedule.Service
    $TaskService.Connect()
    
    $RootFolder = $TaskService.GetFolder("\")
    $Task = $RootFolder.GetTask($TaskName)
    $Definition = $Task.Definition
    
    # Set to run with highest privileges
    $Definition.Principal.RunLevel = 1  # 1 = Highest privileges
    
    # Set to run whether user is logged in or not
    $Definition.Principal.LogonType = 4  # 4 = Service account (runs whether user is logged in)
    
    # Update the task
    $RootFolder.RegisterTaskDefinition($TaskName, $Definition, 6, $null, $null, $Definition.Principal.LogonType) | Out-Null
    
    Write-Host "✓ Task configured with high privileges" -ForegroundColor Green
}
catch {
    Write-Host "WARNING: Could not set advanced properties: $_" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Verifying task creation..." -ForegroundColor Cyan

try {
    $Task = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
    Write-Host "✓ Task verified: $($Task.TaskName)" -ForegroundColor Green
    Write-Host ""
    Write-Host "Task Details:" -ForegroundColor Cyan
    Write-Host "  Name: $($Task.TaskName)"
    Write-Host "  State: $($Task.State)"
    Write-Host "  Enabled: $($Task.Enabled)"
    Write-Host "  Run Time: Daily at $ScheduleTime"
}
catch {
    Write-Host "ERROR: Task verification failed: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Testing task execution..." -ForegroundColor Cyan
Write-Host ""
Write-Host "Starting task (this may take 1-2 minutes)..." -ForegroundColor Yellow

try {
    Start-ScheduledTask -TaskName $TaskName
    Write-Host "✓ Task started!" -ForegroundColor Green
    
    Write-Host ""
    Write-Host "Waiting for task to complete..." -ForegroundColor Yellow
    Start-Sleep -Seconds 3
    
    $Task = Get-ScheduledTask -TaskName $TaskName
    $TaskInfo = Get-ScheduledTaskInfo -TaskName $TaskName
    
    Write-Host "Task Status: $($TaskInfo.LastTaskResult)" -ForegroundColor Cyan
    Write-Host "Last Run Time: $($TaskInfo.LastRunTime)" -ForegroundColor Cyan
}
catch {
    Write-Host "WARNING: Could not start test run: $_" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=============================================" -ForegroundColor Green
Write-Host "✓ SETUP COMPLETE!" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "1. Logs will be saved to: D:\Caps - Copy\logs\"
Write-Host "2. Task runs daily at: $ScheduleTime"
Write-Host "3. View logs: Get-Content 'D:\Caps - Copy\logs\analytics_*.log' -Tail 20"
Write-Host "4. Manually run: Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "5. Disable task: Disable-ScheduledTask -TaskName '$TaskName'"
Write-Host ""
Write-Host "First Run Details:" -ForegroundColor Cyan
Write-Host "Location: Task Scheduler → Task Scheduler Library"
Write-Host "Task Name: $TaskName"
Write-Host ""
Write-Host "For detailed setup info, see: $AutomationDir\TASK_SCHEDULER_SETUP.md" -ForegroundColor Green
Write-Host ""

# Check if logs directory exists
if (!(Test-Path "$ProjectRoot\logs")) {
    Write-Host "Creating logs directory..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path "$ProjectRoot\logs" | Out-Null
    Write-Host "✓ Logs directory created" -ForegroundColor Green
}

Write-Host "Setup finished! Task Scheduler is ready." -ForegroundColor Green
