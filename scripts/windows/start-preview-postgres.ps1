param(
  [switch]$Json,
  [switch]$RequireReady
)

$ErrorActionPreference = 'Stop'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$backendEnvPath = Join-Path $root 'backend\.env'

. (Join-Path $PSScriptRoot 'preview-postgres-common.ps1')

function Ensure-PortablePostgresFiles([hashtable]$config) {
  foreach ($requiredPath in @(
      (Join-Path $config.binDir 'initdb.exe'),
      (Join-Path $config.binDir 'pg_ctl.exe'),
      (Join-Path $config.binDir 'psql.exe'),
      (Join-Path $config.binDir 'createdb.exe'),
      (Join-Path $config.binDir 'pg_isready.exe')
    )) {
    if (-not (Test-Path $requiredPath)) {
      throw "Preview PostgreSQL file was not found: $requiredPath"
    }
  }
}

function Initialize-PortablePostgres([hashtable]$config) {
  if (Test-Path (Join-Path $config.dataDir 'PG_VERSION')) {
    return $false
  }

  if ([string]::IsNullOrWhiteSpace($config.superuserPassword)) {
    throw 'Preview PostgreSQL bootstrap requires PREVIEW_POSTGRES_SUPERUSER_PASSWORD or a password in BACKEND_POSTGRES_DATABASE_URL.'
  }

  New-Item -ItemType Directory -Force -Path $config.dataDir | Out-Null
  $passwordFilePath = Join-Path $config.postgresRoot 'preview-postgres-superuser-password.txt'
  Set-Content -Path $passwordFilePath -Value $config.superuserPassword -Encoding ASCII -NoNewline

  try {
    & (Join-Path $config.binDir 'initdb.exe') `
      -D $config.dataDir `
      -U $config.superuser `
      -A scram-sha-256 `
      --pwfile=$passwordFilePath `
      --encoding=UTF8 | Out-Null
  } finally {
    Remove-Item $passwordFilePath -ErrorAction SilentlyContinue
  }

  return $true
}

function Update-PortablePostgresConfig([hashtable]$config) {
  $configPath = Join-Path $config.dataDir 'postgresql.conf'

  if (-not (Test-Path $configPath)) {
    throw "postgresql.conf was not found: $configPath"
  }

  $filteredLines = @(Get-Content $configPath | Where-Object {
      $_ -notmatch '^\s*#?\s*listen_addresses\s*=' -and $_ -notmatch '^\s*#?\s*port\s*='
    })

  $filteredLines += "listen_addresses = '127.0.0.1'"
  $filteredLines += "port = $($config.port)"

  Set-Content -Path $configPath -Value $filteredLines -Encoding ASCII
}

function Start-PortablePostgres([hashtable]$config) {
  & (Join-Path $config.binDir 'pg_ctl.exe') -D $config.dataDir status *> $null

  if ($LASTEXITCODE -eq 0) {
    return $false
  }

  New-Item -ItemType Directory -Force -Path (Split-Path $config.logPath -Parent) | Out-Null
  & (Join-Path $config.binDir 'pg_ctl.exe') -D $config.dataDir -l $config.logPath -o "-p $($config.port)" start | Out-Null

  if ($LASTEXITCODE -ne 0) {
    $stderr = if (Test-Path $config.logPath) { (Get-Content $config.logPath -Tail 20 | Out-String).Trim() } else { '' }
    throw "Preview PostgreSQL failed to start. $stderr".Trim()
  }

  return $true
}

function Ensure-PreviewRoleAndDatabase([hashtable]$config) {
  if ([string]::IsNullOrWhiteSpace($config.password)) {
    return
  }

  $env:PGPASSWORD = $config.superuserPassword
  $psqlPath = Join-Path $config.binDir 'psql.exe'
  $createdbPath = Join-Path $config.binDir 'createdb.exe'
  $escapedPassword = $config.password.Replace("'", "''")
  $escapedUsername = $config.username.Replace("'", "''")
  $escapedDatabaseName = $config.databaseName.Replace("'", "''")

  $roleExists = ((& $psqlPath -h $config.host -p $config.port -U $config.superuser -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='$escapedUsername';" 2>&1 | Out-String)).Trim()

  if ($roleExists -ne '1') {
    & $psqlPath -h $config.host -p $config.port -U $config.superuser -d postgres -v ON_ERROR_STOP=1 -c "CREATE ROLE $($config.username) LOGIN PASSWORD '$escapedPassword';" | Out-Null
  } else {
    & $psqlPath -h $config.host -p $config.port -U $config.superuser -d postgres -v ON_ERROR_STOP=1 -c "ALTER ROLE $($config.username) WITH LOGIN PASSWORD '$escapedPassword';" | Out-Null
  }

  $databaseExists = ((& $psqlPath -h $config.host -p $config.port -U $config.superuser -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$escapedDatabaseName';" 2>&1 | Out-String)).Trim()

  if ($databaseExists -ne '1') {
    & $createdbPath -h $config.host -p $config.port -U $config.superuser -O $config.username $config.databaseName | Out-Null
  }
}

$config = Get-PreviewPostgresConfig -workspaceRoot $root -backendEnvPath $backendEnvPath

if (-not $config.configured) {
  $payload = [ordered]@{
    ok = $true
    configured = $false
    configuredLocal = $false
    ready = $false
    reason = $config.reason
  }
} elseif (-not $config.configuredLocal) {
  $payload = [ordered]@{
    ok = $true
    configured = $true
    configuredLocal = $false
    ready = $false
    reason = 'Preview PostgreSQL is configured for a non-local host, so no local bootstrap/start is needed.'
    databaseUrl = $config.databaseUrl
    host = $config.host
    port = $config.port
  }
} else {
  Ensure-PortablePostgresFiles -config $config
  $bootstrapped = Initialize-PortablePostgres -config $config
  Update-PortablePostgresConfig -config $config
  $started = Start-PortablePostgres -config $config
  $readyProbe = Invoke-PreviewPgIsReady -config $config -timeoutSeconds 20

  if (-not $readyProbe.ready) {
    throw 'Preview PostgreSQL did not become ready in time.'
  }

  Ensure-PreviewRoleAndDatabase -config $config
  $status = Get-PreviewPostgresStatus -workspaceRoot $root -backendEnvPath $backendEnvPath
  $status.bootstrapped = $bootstrapped
  $status.started = $started
  $payload = $status
}

if ($Json) {
  $payload | ConvertTo-Json -Depth 8
} else {
  if (-not $payload.configured) {
    Write-Host "Preview PostgreSQL: not configured ($($payload.reason))"
  } elseif (-not $payload.configuredLocal) {
    Write-Host "Preview PostgreSQL: remote host ($($payload.host):$($payload.port))"
  } else {
    Write-Host "Preview PostgreSQL ready: $($payload.ready)"
    Write-Host "Root: $($payload.postgresRoot)"
    Write-Host "Data: $($payload.dataDir)"
    Write-Host "Log:  $($payload.logPath)"
    Write-Host "Port: $($payload.port)"
    Write-Host "Database: $($payload.databaseName)"
    Write-Host "User: $($payload.username)"
    Write-Host "Processes: $(@($payload.processes).Count)"

    if ($payload.PSObject.Properties.Name -contains 'bootstrapped') {
      Write-Host "Bootstrapped: $($payload.bootstrapped)"
    }

    if ($payload.PSObject.Properties.Name -contains 'started') {
      Write-Host "Started now: $($payload.started)"
    }
  }
}

if ($RequireReady -and $payload.configuredLocal -and -not $payload.ready) {
  exit 1
}

exit 0
