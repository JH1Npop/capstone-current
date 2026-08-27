$ErrorActionPreference = 'Stop'

$frontendDir = Split-Path -Parent $PSScriptRoot
$backendDir = Resolve-Path (Join-Path $frontendDir '..\backend')
$backendPython = Join-Path (Split-Path -Parent $frontendDir) 'venv\Scripts\python.exe'
$backendVenvCfg = Join-Path (Split-Path -Parent $frontendDir) 'venv\pyvenv.cfg'
$backendManage = Join-Path $backendDir 'manage.py'
$backendLogBase = '.dev-backend'
$backendOutLog = Join-Path $frontendDir "$backendLogBase.log"
$backendErrLog = Join-Path $frontendDir "$backendLogBase.err.log"

function Test-VenvInterpreter {
  param(
    [Parameter(Mandatory = $true)]
    [string] $PythonPath,
    [Parameter(Mandatory = $true)]
    [string] $VenvCfgPath
  )

  if (-not (Test-Path $PythonPath) -or -not (Test-Path $VenvCfgPath)) {
    return $false
  }

  $cfg = Get-Content -LiteralPath $VenvCfgPath -ErrorAction Stop
  $homeLine = $cfg | Where-Object { $_ -like 'home = *' } | Select-Object -First 1
  if (-not $homeLine) {
    return $false
  }

  $homePath = $homeLine.Substring(7).Trim()
  return (Test-Path $homePath)
}

if (-not (Test-Path $backendPython)) {
  throw "Backend Python was not found at '$backendPython'."
}

if (-not (Test-Path $backendManage)) {
  throw "Backend manage.py was not found at '$backendManage'."
}

if (-not (Test-VenvInterpreter -PythonPath $backendPython -VenvCfgPath $backendVenvCfg)) {
  throw @"
The local Python virtual environment is stale.

It still points at a Python install that no longer exists, which is why Django exits
before the frontend starts.

Please recreate the venv from a working Python install, then rerun:
  python -m venv venv
  .\venv\Scripts\activate
  pip install -r backend\requirements.txt
  npm run dev:full
"@
}

function Get-AvailableLogPath {
  param(
    [Parameter(Mandatory = $true)]
    [string] $PreferredPath
  )

  try {
    if (Test-Path $PreferredPath) {
      Remove-Item -LiteralPath $PreferredPath -Force -ErrorAction Stop
    }
    return $PreferredPath
  }
  catch {
    $directory = Split-Path -Parent $PreferredPath
    $fileName = [System.IO.Path]::GetFileNameWithoutExtension($PreferredPath)
    $extension = [System.IO.Path]::GetExtension($PreferredPath)
    $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    return (Join-Path $directory "$fileName.$timestamp$extension")
  }
}

$backendOutLog = Get-AvailableLogPath -PreferredPath $backendOutLog
$backendErrLog = Get-AvailableLogPath -PreferredPath $backendErrLog

$backendPort = $env:BACKEND_PORT
if (-not $backendPort) {
  $backendPort = '8001'
}

$frontendPort = $env:VITE_DEV_SERVER_PORT
if (-not $frontendPort) {
  $frontendPort = '5174'
}

$env:FRONTEND_BASE_URL = "http://localhost:$frontendPort"
$env:VITE_BACKEND_HOST = "http://127.0.0.1:$backendPort"
$env:VITE_DEV_SERVER_PORT = $frontendPort

function Set-ReachableDatabaseAddress {
  $envFile = Join-Path (Split-Path -Parent $frontendDir) '.env'
  if ($env:DB_HOSTADDR -or -not (Test-Path $envFile)) {
    return
  }

  $databaseUrlLine = Get-Content -LiteralPath $envFile |
    Where-Object { $_ -match '^DATABASE_URL=' } |
    Select-Object -First 1
  if (-not $databaseUrlLine) {
    return
  }

  $databaseUrl = $databaseUrlLine.Substring('DATABASE_URL='.Length).Trim()
  if ($databaseUrl -notmatch '@(?<host>[^:/?#]+):(?<port>\d+)') {
    return
  }

  $databaseHost = $Matches.host
  $databasePort = [int] $Matches.port
  if ($databaseHost -notlike '*.aivencloud.com') {
    return
  }

  $addresses = [System.Collections.Generic.HashSet[string]]::new()
  for ($attempt = 0; $attempt -lt 8; $attempt++) {
    try {
      Resolve-DnsName -Name $databaseHost -Type A -DnsOnly -ErrorAction Stop |
        Where-Object { $_.IPAddress } |
        ForEach-Object { [void] $addresses.Add($_.IPAddress) }
    }
    catch {
      # Keep sampling because Aiven's low-TTL records can change between attempts.
    }
    Start-Sleep -Milliseconds 1100
  }

  $originalConnectTimeout = $env:DB_CONNECT_TIMEOUT
  $originalErrorActionPreference = $ErrorActionPreference
  $env:DB_CONNECT_TIMEOUT = '3'
  $ErrorActionPreference = 'Continue'
  try {
    foreach ($address in $addresses) {
      $env:DB_HOSTADDR = $address
      & $backendPython $backendManage showmigrations --plan *> $null
      if ($LASTEXITCODE -eq 0) {
        Write-Host "Using reachable Aiven database route: $address"
        return
      }
    }
  }
  finally {
    $ErrorActionPreference = $originalErrorActionPreference
    if ($null -eq $originalConnectTimeout) {
      Remove-Item Env:DB_CONNECT_TIMEOUT -ErrorAction SilentlyContinue
    }
    else {
      $env:DB_CONNECT_TIMEOUT = $originalConnectTimeout
    }
  }

  Remove-Item Env:DB_HOSTADDR -ErrorAction SilentlyContinue
  throw @"
No reachable Aiven PostgreSQL route was found.

The frontend was not started because Django cannot authenticate users without
the database. Check the Aiven service or use the local PostgreSQL development
database before running npm run dev:full again.
"@
}

Set-ReachableDatabaseAddress

Write-Host "Starting Django backend with project virtualenv..."
$backendProcess = Start-Process `
  -FilePath $backendPython `
  -ArgumentList "`"$backendManage`" runserver 127.0.0.1:$backendPort" `
  -WorkingDirectory $backendDir `
  -RedirectStandardOutput $backendOutLog `
  -RedirectStandardError $backendErrLog `
  -PassThru

$backendReady = $false
for ($attempt = 0; $attempt -lt 15; $attempt++) {
  if ($backendProcess.HasExited) {
    break
  }

  try {
    $healthResponse = Invoke-WebRequest `
      -Uri "http://127.0.0.1:$backendPort/api/health/database/" `
      -UseBasicParsing `
      -TimeoutSec 3 `
      -ErrorAction Stop
    if ($healthResponse.StatusCode -eq 200) {
      $backendReady = $true
      break
    }
  }
  catch {
    # Django may still be starting or the selected database route may have failed.
  }

  Start-Sleep -Seconds 1
}

if (-not $backendReady) {
  if ($backendProcess -and -not $backendProcess.HasExited) {
    Stop-Process -Id $backendProcess.Id -Force
  }
  $stdout = if (Test-Path $backendOutLog) { Get-Content -Path $backendOutLog -Raw } else { '' }
  $stderr = if (Test-Path $backendErrLog) { Get-Content -Path $backendErrLog -Raw } else { '' }
  throw "Backend database health check failed before the frontend started.`n`nSTDOUT:`n$stdout`nSTDERR:`n$stderr"
}

Write-Host "Backend running on http://127.0.0.1:$backendPort"
Write-Host "Backend logs: $backendOutLog"
Write-Host "Starting Vite frontend on http://localhost:$frontendPort..."

try {
  Push-Location $frontendDir
  & npm.cmd run start:frontend
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}
finally {
  Pop-Location
  if ($backendProcess -and -not $backendProcess.HasExited) {
    Write-Host "Stopping Django backend..."
    Stop-Process -Id $backendProcess.Id -Force
  }
}
