param(
    [string]$DatabaseUrl = $env:DATABASE_URL,
    [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\backups')
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
    throw 'Provide -DatabaseUrl or set DATABASE_URL.'
}
if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue)) {
    throw 'pg_dump is required and was not found on PATH.'
}

$resolvedOutput = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $resolvedOutput -Force | Out-Null
$timestamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')
$backupPath = Join-Path $resolvedOutput "afn-postgres-$timestamp.dump"

& pg_dump --format=custom --no-owner --no-privileges --file=$backupPath --dbname=$DatabaseUrl
if ($LASTEXITCODE -ne 0) {
    throw "pg_dump failed with exit code $LASTEXITCODE."
}

$hash = (Get-FileHash -LiteralPath $backupPath -Algorithm SHA256).Hash.ToLowerInvariant()
$hashPath = "$backupPath.sha256"
Set-Content -LiteralPath $hashPath -Value "$hash  $([System.IO.Path]::GetFileName($backupPath))" -Encoding ascii
Write-Output "Backup created: $backupPath"
Write-Output "Checksum created: $hashPath"
