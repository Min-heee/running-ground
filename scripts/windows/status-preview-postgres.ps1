param(
  [switch]$Json,
  [switch]$RequireReady
)

$ErrorActionPreference = 'Stop'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$backendEnvPath = Join-Path $root 'backend\.env'

. (Join-Path $PSScriptRoot 'preview-postgres-common.ps1')

$payload = Get-PreviewPostgresStatus -workspaceRoot $root -backendEnvPath $backendEnvPath

if ($Json) {
  $payload | ConvertTo-Json -Depth 8
} else {
  if (-not $payload.configured) {
    Write-Host "Preview PostgreSQL: not configured ($($payload.reason))"
  } elseif (-not $payload.configuredLocal) {
    Write-Host "Preview PostgreSQL: remote host ($($payload.host):$($payload.port))"
  } else {
    Write-Host "Preview PostgreSQL ready: $($payload.ready)"
    Write-Host "Listener: $($payload.listener.listening) / PID: $($payload.listener.owningProcess)"
    Write-Host "Root: $($payload.postgresRoot)"
    Write-Host "Data: $($payload.dataDir)"
    Write-Host "Log:  $($payload.logPath)"
    Write-Host "Database: $($payload.databaseName)"
    Write-Host "User: $($payload.username)"
    Write-Host "Processes: $(@($payload.processes).Count)"

    if (-not $payload.ready -and $payload.pgIsReady.output) {
      Write-Host "pg_isready: $($payload.pgIsReady.output)"
    }
  }
}

if ($RequireReady -and $payload.configuredLocal -and -not $payload.ready) {
  exit 1
}
