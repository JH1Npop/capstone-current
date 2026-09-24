param(
    [ValidateSet('frequent', 'daily', 'all')]
    [string]$Mode = 'all'
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$BackendDir = Join-Path $ProjectRoot 'backend'
$VenvPython = Join-Path $ProjectRoot 'venv\Scripts\python.exe'
$LogDir = Join-Path $ProjectRoot 'logs'
$LogFile = Join-Path $LogDir "operational_$($Mode)_$(Get-Date -Format 'yyyy-MM-dd').log"

if (-not (Test-Path -LiteralPath $VenvPython)) {
    throw "Virtual-environment Python was not found: $VenvPython"
}
if (-not (Test-Path -LiteralPath $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir | Out-Null
}

function Write-AutomationLog {
    param([string]$Message)
    $entry = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
    Add-Content -LiteralPath $LogFile -Value $entry
    Write-Host $entry
}

Write-AutomationLog "Starting operational automation mode: $Mode"
Push-Location $BackendDir
try {
    & $VenvPython manage.py run_operational_automations --mode $Mode 2>&1 |
        ForEach-Object { Write-AutomationLog $_ }
    if ($LASTEXITCODE -ne 0) {
        throw "Django automation command exited with code $LASTEXITCODE"
    }
    Write-AutomationLog 'Operational automation completed successfully'
}
catch {
    Write-AutomationLog "ERROR: $_"
    exit 1
}
finally {
    Pop-Location
}

exit 0
