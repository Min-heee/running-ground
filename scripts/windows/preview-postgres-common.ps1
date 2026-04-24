$ErrorActionPreference = 'Stop'

function Read-PreviewBackendEnv([string]$backendEnvPath) {
  $values = @{}

  if (-not (Test-Path $backendEnvPath)) {
    return $values
  }

  foreach ($line in Get-Content $backendEnvPath) {
    $trimmed = $line.Trim()

    if (-not $trimmed -or $trimmed.StartsWith('#')) {
      continue
    }

    $separatorIndex = $trimmed.IndexOf('=')

    if ($separatorIndex -le 0) {
      continue
    }

    $key = $trimmed.Substring(0, $separatorIndex).Trim()
    $value = $trimmed.Substring($separatorIndex + 1).Trim().Trim('"').Trim("'")
    $values[$key] = $value
  }

  return $values
}

function Get-ConfiguredPostgresUrl([hashtable]$envValues) {
  if ($envValues.ContainsKey('BACKEND_POSTGRES_DATABASE_URL')) {
    return [string]$envValues.BACKEND_POSTGRES_DATABASE_URL
  }

  if ($envValues.ContainsKey('DATABASE_URL')) {
    return [string]$envValues.DATABASE_URL
  }

  return ''
}

function ConvertFrom-PostgresUrl([string]$databaseUrl) {
  if ([string]::IsNullOrWhiteSpace($databaseUrl)) {
    return $null
  }

  try {
    $uri = [Uri]$databaseUrl
  } catch {
    return $null
  }

  if ($uri.Scheme -notin @('postgres', 'postgresql')) {
    return $null
  }

  $username = ''
  $password = ''

  if (-not [string]::IsNullOrWhiteSpace($uri.UserInfo)) {
    $separatorIndex = $uri.UserInfo.IndexOf(':')

    if ($separatorIndex -ge 0) {
      $username = [Uri]::UnescapeDataString($uri.UserInfo.Substring(0, $separatorIndex))
      $password = [Uri]::UnescapeDataString($uri.UserInfo.Substring($separatorIndex + 1))
    } else {
      $username = [Uri]::UnescapeDataString($uri.UserInfo)
    }
  }

  $databaseName = $uri.AbsolutePath.Trim('/')
  $port = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }

  return [ordered]@{
    databaseUrl = $databaseUrl
    host = $uri.Host
    port = $port
    databaseName = $databaseName
    username = $username
    password = $password
  }
}

function Resolve-PreviewPath([string]$workspaceRoot, [string]$pathValue) {
  if ([string]::IsNullOrWhiteSpace($pathValue)) {
    return ''
  }

  if ([System.IO.Path]::IsPathRooted($pathValue)) {
    return $pathValue
  }

  return (Join-Path $workspaceRoot $pathValue)
}

function Resolve-PreviewPostgresRoot([string]$workspaceRoot, [hashtable]$envValues) {
  $candidates = New-Object System.Collections.ArrayList

  if ($envValues.ContainsKey('PREVIEW_POSTGRES_ROOT')) {
    [void]$candidates.Add([string]$envValues.PREVIEW_POSTGRES_ROOT)
  }

  $workspaceParent = Split-Path $workspaceRoot -Parent
  $portableParent = Join-Path $workspaceParent 'PostgreSQL'

  if (Test-Path $portableParent) {
    $portableChildren = Get-ChildItem -Path $portableParent -Directory -ErrorAction SilentlyContinue |
      Where-Object { Test-Path (Join-Path $_.FullName 'pgsql\bin\pg_ctl.exe') }

    $sortedChildren = $portableChildren | Sort-Object -Property @{
      Expression = {
        try {
          [version]$_.Name
        } catch {
          [version]'0.0'
        }
      }
      Descending = $true
    }

    foreach ($child in $sortedChildren) {
      [void]$candidates.Add($child.FullName)
    }
  }

  foreach ($candidate in $candidates) {
    if ([string]::IsNullOrWhiteSpace([string]$candidate)) {
      continue
    }

    $resolvedCandidate = Resolve-PreviewPath -workspaceRoot $workspaceRoot -pathValue ([string]$candidate)

    if (Test-Path (Join-Path $resolvedCandidate 'pgsql\bin\pg_ctl.exe')) {
      return $resolvedCandidate
    }
  }

  return ''
}

function Get-PreviewPostgresConfig([string]$workspaceRoot, [string]$backendEnvPath) {
  $envValues = Read-PreviewBackendEnv -backendEnvPath $backendEnvPath
  $databaseUrl = Get-ConfiguredPostgresUrl -envValues $envValues
  $connection = ConvertFrom-PostgresUrl -databaseUrl $databaseUrl

  if (-not $connection) {
    return [ordered]@{
      configured = $false
      configuredLocal = $false
      envValues = $envValues
      reason = 'PostgreSQL connection URL is not configured.'
    }
  }

  $isLocalHost = $connection.host -in @('127.0.0.1', 'localhost')
  $postgresRoot = Resolve-PreviewPostgresRoot -workspaceRoot $workspaceRoot -envValues $envValues
  $binDir = if ($envValues.ContainsKey('PREVIEW_POSTGRES_BIN_DIR')) {
    Resolve-PreviewPath -workspaceRoot $workspaceRoot -pathValue ([string]$envValues.PREVIEW_POSTGRES_BIN_DIR)
  } elseif ($postgresRoot) {
    Join-Path $postgresRoot 'pgsql\bin'
  } else {
    ''
  }
  $dataDir = if ($envValues.ContainsKey('PREVIEW_POSTGRES_DATA_DIR')) {
    Resolve-PreviewPath -workspaceRoot $workspaceRoot -pathValue ([string]$envValues.PREVIEW_POSTGRES_DATA_DIR)
  } elseif ($postgresRoot) {
    Join-Path $postgresRoot 'data'
  } else {
    ''
  }
  $logPath = if ($envValues.ContainsKey('PREVIEW_POSTGRES_LOG_PATH')) {
    Resolve-PreviewPath -workspaceRoot $workspaceRoot -pathValue ([string]$envValues.PREVIEW_POSTGRES_LOG_PATH)
  } elseif ($postgresRoot) {
    Join-Path $postgresRoot 'postgres.log'
  } else {
    ''
  }
  $superuser = if ($envValues.ContainsKey('PREVIEW_POSTGRES_SUPERUSER') -and -not [string]::IsNullOrWhiteSpace([string]$envValues.PREVIEW_POSTGRES_SUPERUSER)) {
    [string]$envValues.PREVIEW_POSTGRES_SUPERUSER
  } else {
    'postgres'
  }
  $superuserPassword = if ($envValues.ContainsKey('PREVIEW_POSTGRES_SUPERUSER_PASSWORD') -and -not [string]::IsNullOrWhiteSpace([string]$envValues.PREVIEW_POSTGRES_SUPERUSER_PASSWORD)) {
    [string]$envValues.PREVIEW_POSTGRES_SUPERUSER_PASSWORD
  } else {
    [string]$connection.password
  }

  return [ordered]@{
    configured = $true
    configuredLocal = $isLocalHost
    envValues = $envValues
    databaseUrl = $databaseUrl
    host = [string]$connection.host
    port = [int]$connection.port
    databaseName = [string]$connection.databaseName
    username = [string]$connection.username
    password = [string]$connection.password
    postgresRoot = $postgresRoot
    binDir = $binDir
    dataDir = $dataDir
    logPath = $logPath
    superuser = $superuser
    superuserPassword = $superuserPassword
  }
}

function Get-PreviewPostgresListener([int]$port) {
  try {
    $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop | Select-Object -First 1

    if ($listener) {
      return [ordered]@{
        listening = $true
        localAddress = $listener.LocalAddress
        localPort = $listener.LocalPort
        owningProcess = $listener.OwningProcess
      }
    }
  } catch {
    # No active listener.
  }

  return [ordered]@{
    listening = $false
    localAddress = ''
    localPort = $port
    owningProcess = $null
  }
}

function Get-PreviewPostgresProcesses([string]$binDir) {
  if ([string]::IsNullOrWhiteSpace($binDir) -or -not (Test-Path $binDir)) {
    return @()
  }

  $normalizedBinDir = $binDir.TrimEnd('\').ToLowerInvariant()

  return @(Get-Process postgres -ErrorAction SilentlyContinue | Where-Object {
      $_.Path -and $_.Path.ToLowerInvariant().StartsWith($normalizedBinDir)
    } | Sort-Object Id | ForEach-Object {
      [ordered]@{
        id = $_.Id
        path = $_.Path
        startTime = if ($_.StartTime) { $_.StartTime.ToString('o') } else { '' }
      }
    })
}

function Invoke-PreviewPgIsReady([hashtable]$config, [int]$timeoutSeconds = 5) {
  if (-not $config.configuredLocal) {
    return [ordered]@{
      ready = $false
      error = 'Preview PostgreSQL is not configured for localhost.'
    }
  }

  $pgIsReadyPath = Join-Path $config.binDir 'pg_isready.exe'

  if (-not (Test-Path $pgIsReadyPath)) {
    return [ordered]@{
      ready = $false
      error = "pg_isready.exe was not found: $pgIsReadyPath"
    }
  }

  $deadline = (Get-Date).AddSeconds($timeoutSeconds)

  while ((Get-Date) -lt $deadline) {
    $output = (& $pgIsReadyPath -h $config.host -p $config.port -U $config.superuser 2>&1 | Out-String).Trim()

    if ($LASTEXITCODE -eq 0) {
      return [ordered]@{
        ready = $true
        output = $output
      }
    }

    Start-Sleep -Milliseconds 500
  }

  return [ordered]@{
    ready = $false
    output = $output
  }
}

function Get-PreviewPostgresStatus([string]$workspaceRoot, [string]$backendEnvPath) {
  $config = Get-PreviewPostgresConfig -workspaceRoot $workspaceRoot -backendEnvPath $backendEnvPath

  if (-not $config.configured) {
    return [ordered]@{
      ok = $true
      configured = $false
      configuredLocal = $false
      ready = $false
      reason = $config.reason
    }
  }

  $listener = Get-PreviewPostgresListener -port $config.port
  $processes = Get-PreviewPostgresProcesses -binDir $config.binDir
  $pgIsReady = if ($config.configuredLocal) {
    Invoke-PreviewPgIsReady -config $config
  } else {
    [ordered]@{
      ready = $false
      error = 'Preview PostgreSQL is configured for a non-local host.'
    }
  }

  return [ordered]@{
    ok = $true
    configured = $config.configured
    configuredLocal = $config.configuredLocal
    ready = ($listener.listening -and $pgIsReady.ready)
    databaseUrl = $config.databaseUrl
    host = $config.host
    port = $config.port
    databaseName = $config.databaseName
    username = $config.username
    postgresRoot = $config.postgresRoot
    binDir = $config.binDir
    dataDir = $config.dataDir
    logPath = $config.logPath
    listener = $listener
    pgIsReady = $pgIsReady
    processes = $processes
  }
}
