# Script to run daily analytics generation
# This script is called by Windows Task Scheduler

param(
    [string]$Action = "daily"
)

# Resolve paths from this repository instead of depending on one workstation.
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$BackendDir = Join-Path $ProjectRoot 'backend'
$VenvPython = Join-Path $ProjectRoot 'venv\Scripts\python.exe'

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

function Invoke-ManagementCommand {
    param([string[]]$Arguments)
    & $VenvPython manage.py @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Management command failed with exit code ${LASTEXITCODE}: $($Arguments -join ' ')"
    }
}

Log-Message "Starting analytics generation (Action: $Action)"

try {
    # Change to backend directory
    Set-Location $BackendDir
    
    if ($Action -eq "daily") {
        # Daily analytics (yesterday)
        Log-Message "Generating daily analytics..."
        Invoke-ManagementCommand @('generate_daily_analytics')
        
        Log-Message "Generating technician performance..."
        Invoke-ManagementCommand @('generate_technician_performance')

        Log-Message "Validating and refreshing demand forecasts..."
        Invoke-ManagementCommand @('generate_demand_forecasts')
        
        Log-Message "Analytics generation completed successfully"
    }
    elseif ($Action -eq "backfill") {
        # Backfill last 90 days
        Log-Message "Backfilling last 90 days of analytics..."
        Invoke-ManagementCommand @('generate_daily_analytics', '--backfill', '90')
        
        Log-Message "Backfilling last 90 days of technician performance..."
        Invoke-ManagementCommand @('generate_technician_performance', '--backfill', '90')

        Log-Message "Validating demand forecasts after backfill..."
        Invoke-ManagementCommand @('generate_demand_forecasts')
        
        Log-Message "Backfill completed successfully"
    }
    elseif ($Action -eq "force") {
        # Force regenerate yesterday
        Log-Message "Force regenerating yesterday's analytics..."
        Invoke-ManagementCommand @('generate_daily_analytics', '--force')
        
        Log-Message "Force regenerating yesterday's technician performance..."
        Invoke-ManagementCommand @('generate_technician_performance', '--force')

        Log-Message "Revalidating demand forecasts..."
        Invoke-ManagementCommand @('generate_demand_forecasts')
        
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
