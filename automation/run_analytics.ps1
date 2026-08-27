# Script to run daily analytics generation
# This script is called by Windows Task Scheduler

param(
    [string]$Action = "daily"
)

# Set working directory
$ProjectRoot = "D:\Caps - Copy"
$BackendDir = "$ProjectRoot\backend"
$VenvPython = "$ProjectRoot\venv\Scripts\python.exe"

# Log file
$LogDir = "$ProjectRoot\logs"
$LogFile = "$LogDir\analytics_$(Get-Date -Format 'yyyy-MM-dd').log"

# Create log directory if it doesn't exist
if (!(Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir | Out-Null
}

# Function to log messages
function Log-Message {
    param([string]$Message)
    $Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $LogEntry = "[$Timestamp] $Message"
    Add-Content -Path $LogFile -Value $LogEntry
    Write-Host $LogEntry
}

Log-Message "Starting analytics generation (Action: $Action)"

try {
    # Change to backend directory
    Set-Location $BackendDir
    
    if ($Action -eq "daily") {
        # Daily analytics (yesterday)
        Log-Message "Generating daily analytics..."
        & $VenvPython manage.py generate_daily_analytics
        
        Log-Message "Generating technician performance..."
        & $VenvPython manage.py generate_technician_performance
        
        Log-Message "Analytics generation completed successfully"
    }
    elseif ($Action -eq "backfill") {
        # Backfill last 90 days
        Log-Message "Backfilling last 90 days of analytics..."
        & $VenvPython manage.py generate_daily_analytics --backfill 90
        
        Log-Message "Backfilling last 90 days of technician performance..."
        & $VenvPython manage.py generate_technician_performance --backfill 90
        
        Log-Message "Backfill completed successfully"
    }
    elseif ($Action -eq "force") {
        # Force regenerate yesterday
        Log-Message "Force regenerating yesterday's analytics..."
        & $VenvPython manage.py generate_daily_analytics --force
        
        Log-Message "Force regenerating yesterday's technician performance..."
        & $VenvPython manage.py generate_technician_performance --force
        
        Log-Message "Force regeneration completed successfully"
    }
}
catch {
    Log-Message "ERROR: $_"
    exit 1
}

Set-Location $ProjectRoot
Log-Message "Script completed successfully"
exit 0
