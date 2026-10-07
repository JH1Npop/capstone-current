param(
    [Parameter(Mandatory = $true)][string]$BackupFile,
    [Parameter(Mandatory = $true)][string]$TargetDatabaseUrl,
    [Parameter(Mandatory = $true)][ValidateSet('RESTORE')][string]$ConfirmRestore
)

$ErrorActionPreference = 'Stop'
if (-not (Get-Command pg_restore -ErrorAction SilentlyContinue)) {
    throw 'pg_restore is required and was not found on PATH.'
}
$resolvedBackup = (Resolve-Path -LiteralPath $BackupFile).Path
$targetUri = [Uri]$TargetDatabaseUrl
$databaseName = [Uri]::UnescapeDataString($targetUri.AbsolutePath.Trim('/'))
if ($targetUri.Scheme -notin @('postgres', 'postgresql')) {
    throw 'TargetDatabaseUrl must be a PostgreSQL URL.'
}
if ($databaseName -notmatch '^test_[A-Za-z0-9_-]+$') {
    throw "Restore refused: target database '$databaseName' must start with test_."
}

$expectedHashFile = "$resolvedBackup.sha256"
if (Test-Path -LiteralPath $expectedHashFile) {
    $expectedHash = ((Get-Content -LiteralPath $expectedHashFile -Raw).Trim() -split '\s+')[0]
    $actualHash = (Get-FileHash -LiteralPath $resolvedBackup -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -ne $expectedHash.ToLowerInvariant()) {
        throw 'Backup checksum mismatch; restore refused.'
    }
}

Write-Output "Restoring into guarded disposable database: $databaseName"
& pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error --dbname=$TargetDatabaseUrl $resolvedBackup
if ($LASTEXITCODE -ne 0) {
    throw "pg_restore failed with exit code $LASTEXITCODE."
}
Write-Output 'Restore completed. Run Django checks and representative read queries before deleting the disposable database.'
