$ErrorActionPreference = 'Stop'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$backendEnvPath = Join-Path $root 'backend\.env'

. (Join-Path $PSScriptRoot 'preview-postgres-common.ps1')

$config = Get-PreviewPostgresConfig -workspaceRoot $root -backendEnvPath $backendEnvPath

if (-not $config.configured -or -not $config.configuredLocal) {
  Write-Host 'Preview PostgreSQL is not configured for localhost. Nothing to stop.'
  exit 0
}

$pgCtlPath = Join-Path $config.binDir 'pg_ctl.exe'

if (-not (Test-Path $pgCtlPath)) {
  throw "pg_ctl.exe was not found: $pgCtlPath"
}

if (Test-Path (Join-Path $config.dataDir 'PG_VERSION')) {
  & $pgCtlPath -D $config.dataDir status *> $null

  if ($LASTEXITCODE -eq 0) {
    & $pgCtlPath -D $config.dataDir stop -m fast | Out-Null
  }
}

Get-Process postgres -ErrorAction SilentlyContinue | Where-Object {
  $_.Path -and $_.Path.ToLowerInvariant().StartsWith($config.binDir.TrimEnd('\').ToLowerInvariant())
} | ForEach-Object {
  try {
    Stop-Process -Id $_.Id -Force -ErrorAction Stop
  } catch {
    # Ignore already-terminated processes.
  }
}

Write-Host 'Preview PostgreSQL stop sequence finished.'
Write-Host "Data directory: $($config.dataDir)"
