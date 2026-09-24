$ErrorActionPreference = 'Stop'

$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object System.Security.Principal.WindowsPrincipal($identity)
$adminRole = [System.Security.Principal.WindowsBuiltInRole]::Administrator
if (-not $principal.IsInRole($adminRole)) {
    throw 'Run this setup script from an administrator PowerShell.'
}

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ScriptPath = Join-Path $PSScriptRoot 'run_operational_automations.ps1'
$LogDir = Join-Path $ProjectRoot 'logs'
if (-not (Test-Path -LiteralPath $ScriptPath)) {
    throw "Automation runner was not found: $ScriptPath"
}
if (-not (Test-Path -LiteralPath $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir | Out-Null
}

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 10) `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1)
$taskPrincipal = New-ScheduledTaskPrincipal `
    -UserId $identity.Name `
    -LogonType Interactive `
    -RunLevel Highest

function Register-AfnAutomationTask {
    param(
        [string]$TaskName,
        [string]$Mode,
        $Trigger,
        [string]$Description
    )

    $argument = "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`" -Mode $Mode"
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $argument
    $task = New-ScheduledTask `
        -Action $action `
        -Trigger $Trigger `
        -Settings $settings `
        -Principal $taskPrincipal `
        -Description $Description
    Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force | Out-Null
    Write-Host "Registered: $TaskName" -ForegroundColor Green
}

$dailyTrigger = New-ScheduledTaskTrigger -Daily -At '02:00'
$frequentTrigger = New-ScheduledTaskTrigger `
    -Once `
    -At ((Get-Date).AddMinutes(5)) `
    -RepetitionInterval (New-TimeSpan -Minutes 30) `
    -RepetitionDuration (New-TimeSpan -Days 3650)

Register-AfnAutomationTask `
    -TaskName 'AFN Analytics - Daily Generation' `
    -Mode 'daily' `
    -Trigger $dailyTrigger `
    -Description 'Runs maintenance alerts and daily service analytics.'
Register-AfnAutomationTask `
    -TaskName 'AFN Operations - Frequent' `
    -Mode 'frequent' `
    -Trigger $frequentTrigger `
    -Description 'Runs SLA checks and pending-ticket auto-dispatch every 30 minutes.'

Write-Host "Logs: $LogDir" -ForegroundColor Cyan
Write-Host 'Review both tasks in Task Scheduler and run each once after verifying the deployment database target.' -ForegroundColor Yellow
