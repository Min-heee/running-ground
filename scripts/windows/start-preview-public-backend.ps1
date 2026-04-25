param(
  [ValidateSet('quick-tunnel', 'tailscale-funnel')]
  [string]$Transport = 'quick-tunnel',
  [switch]$UseDirectProcesses
)

$ErrorActionPreference = 'Stop'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$backendRoot = Join-Path $root 'backend'
$backendEnvPath = Join-Path $backendRoot '.env'
$appEnvPath = Join-Path $root '.env'
$backendOutLog = Join-Path $root 'backend-preview.out.log'
$backendErrLog = Join-Path $root 'backend-preview.err.log'
$tunnelOutLog = Join-Path $root 'preview-tunnel.out.log'
$tunnelErrLog = Join-Path $root 'preview-tunnel.err.log'
$previewInfoPath = Join-Path $root 'preview-public-info.json'
$backendPort = 8081
$placeholderUrl = 'https://preview-temp.invalid'
$adminToken = 'preview-admin-' + [guid]::NewGuid().ToString('N')
$nodePath = (Get-Command node -ErrorAction Stop).Source
$backendTaskName = 'RunningGroundPreviewBackend'
$tunnelTaskName = 'RunningGroundPreviewTunnel'
$legacyBackendTaskName = 'RunnigappPreviewBackend'
$legacyTunnelTaskName = 'RunnigappPreviewTunnel'
$backendRunnerPath = Join-Path $root 'scripts\windows\.generated-preview-backend.cmd'
$tunnelRunnerPath = Join-Path $root 'scripts\windows\.generated-preview-tunnel.cmd'
$previewPostgresStartScriptPath = Join-Path $PSScriptRoot 'start-preview-postgres.ps1'

function Read-PreviewInfo {
  if (-not (Test-Path $previewInfoPath)) {
    return $null
  }

  try {
    return Get-Content $previewInfoPath -Raw | ConvertFrom-Json
  } catch {
    return $null
  }
}

function Read-EnvFile([string]$path) {
  $values = @{}

  if (-not (Test-Path $path)) {
    return $values
  }

  foreach ($line in Get-Content $path) {
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

function Get-PreviewCorsOrigins([string]$publicUrl) {
  $origins = @(
    'http://localhost:8081',
    'http://127.0.0.1:8081',
    'http://localhost:19006',
    'http://127.0.0.1:19006'
  )

  if (-not [string]::IsNullOrWhiteSpace($publicUrl) -and $publicUrl -notmatch 'preview-temp\.invalid') {
    $origins = @($publicUrl) + $origins
  }

  return (($origins | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }) | Select-Object -Unique) -join ','
}

function Write-BackendEnv([string]$publicUrl, [string]$token) {
  $existingEnv = Read-EnvFile -path $backendEnvPath
  $lines = @(
    'BACKEND_APP_ENV=preview',
    'BACKEND_HOST=0.0.0.0',
    "BACKEND_PORT=$backendPort",
    "BACKEND_CORS_ORIGIN=$(Get-PreviewCorsOrigins -publicUrl $publicUrl)",
    "BACKEND_PUBLIC_BASE_URL=$publicUrl",
    'BACKEND_STORE_DRIVER=json',
    'BACKEND_STORE_FILE=backend/data/preview-store.json',
    'BACKEND_STORE_BACKUP_DIRECTORY=backend/data/preview-backups',
    'BACKEND_STORE_BACKUP_ON_SAVE=true',
    'BACKEND_STORE_BACKUP_RETENTION=10',
    "BACKEND_POSTGRES_SSL=$(if ($existingEnv.ContainsKey('BACKEND_POSTGRES_SSL')) { $existingEnv.BACKEND_POSTGRES_SSL } else { 'false' })",
    "BACKEND_POSTGRES_POOL_MAX=$(if ($existingEnv.ContainsKey('BACKEND_POSTGRES_POOL_MAX')) { $existingEnv.BACKEND_POSTGRES_POOL_MAX } else { '10' })",
    "BACKEND_POSTGRES_IDLE_TIMEOUT_MS=$(if ($existingEnv.ContainsKey('BACKEND_POSTGRES_IDLE_TIMEOUT_MS')) { $existingEnv.BACKEND_POSTGRES_IDLE_TIMEOUT_MS } else { '30000' })",
    "BACKEND_POSTGRES_CONNECTION_TIMEOUT_MS=$(if ($existingEnv.ContainsKey('BACKEND_POSTGRES_CONNECTION_TIMEOUT_MS')) { $existingEnv.BACKEND_POSTGRES_CONNECTION_TIMEOUT_MS } else { '10000' })",
    "BACKEND_POSTGRES_APPLICATION_NAME=$(if ($existingEnv.ContainsKey('BACKEND_POSTGRES_APPLICATION_NAME')) { $existingEnv.BACKEND_POSTGRES_APPLICATION_NAME } else { 'runningground-backend-preview' })",
    "BACKEND_POSTGRES_ENABLE_SESSION_READS=$(if ($existingEnv.ContainsKey('BACKEND_POSTGRES_ENABLE_SESSION_READS')) { $existingEnv.BACKEND_POSTGRES_ENABLE_SESSION_READS } else { 'false' })",
    "BACKEND_POSTGRES_ENABLE_RUN_READS=$(if ($existingEnv.ContainsKey('BACKEND_POSTGRES_ENABLE_RUN_READS')) { $existingEnv.BACKEND_POSTGRES_ENABLE_RUN_READS } else { 'false' })",
    "BACKEND_POSTGRES_ENABLE_FRIEND_READS=$(if ($existingEnv.ContainsKey('BACKEND_POSTGRES_ENABLE_FRIEND_READS')) { $existingEnv.BACKEND_POSTGRES_ENABLE_FRIEND_READS } else { 'false' })",
    "BACKEND_POSTGRES_ENABLE_LEAGUE_READS=$(if ($existingEnv.ContainsKey('BACKEND_POSTGRES_ENABLE_LEAGUE_READS')) { $existingEnv.BACKEND_POSTGRES_ENABLE_LEAGUE_READS } else { 'false' })",
    'BACKEND_SESSION_TTL_HOURS=168',
    'BACKEND_MAX_BODY_SIZE_KB=256',
    'BACKEND_REQUEST_TIMEOUT_MS=30000',
    'BACKEND_HEADERS_TIMEOUT_MS=10000',
    'BACKEND_KEEP_ALIVE_TIMEOUT_MS=5000',
    'BACKEND_MAX_REQUESTS_PER_SOCKET=1000',
    'BACKEND_SHUTDOWN_TIMEOUT_MS=10000',
    "BACKEND_ADMIN_TOKEN=$token",
    'BACKEND_ENABLE_ADMIN_STATUS=true',
    'BACKEND_ENABLE_RESET_ENDPOINT=false'
  )

  foreach ($key in @(
    'BACKEND_POSTGRES_DATABASE_URL',
    'DATABASE_URL',
    'POSTGRES_DB',
    'POSTGRES_USER',
    'POSTGRES_PASSWORD',
    'POSTGRES_PORT',
    'PREVIEW_POSTGRES_ROOT',
    'PREVIEW_POSTGRES_BIN_DIR',
    'PREVIEW_POSTGRES_DATA_DIR',
    'PREVIEW_POSTGRES_LOG_PATH',
    'PREVIEW_POSTGRES_SUPERUSER',
    'PREVIEW_POSTGRES_SUPERUSER_PASSWORD'
  )) {
    if ($existingEnv.ContainsKey($key) -and -not [string]::IsNullOrWhiteSpace([string]$existingEnv[$key])) {
      $lines += "$key=$($existingEnv[$key])"
    }
  }

  Set-Content -Path $backendEnvPath -Value $lines -Encoding UTF8
}

function Write-AppEnv([string]$publicUrl) {
  $lines = @(
    'EXPO_PUBLIC_USE_MOCK_API=false',
    "EXPO_PUBLIC_API_BASE_URL=$publicUrl/api",
    'EXPO_PUBLIC_API_TIMEOUT_MS=10000',
    'EAS_PROJECT_ID=d57b0e4f-f084-4000-8ec7-188ee2561c52'
  )

  Set-Content -Path $appEnvPath -Value $lines -Encoding UTF8
}

function Stop-PortListener([int]$port) {
  try {
    $listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop

    foreach ($listener in $listeners) {
      Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
    }
  } catch {
    # No active listener.
  }
}

function Stop-ScheduledTaskSafe([string]$taskName) {
  try {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  } catch {
    # The task may not exist yet.
  }
}

function Stop-ProcessById([Nullable[int]]$processId, [string]$label) {
  if (-not $processId) {
    return
  }

  try {
    $process = Get-Process -Id $processId -ErrorAction Stop
    Stop-Process -Id $process.Id -Force -ErrorAction Stop
    Write-Host "Stopped $label process ($processId)."
  } catch {
    # The process is already gone.
  }
}

function Get-BackendProcessId {
  try {
    $listener = Get-NetTCPConnection -LocalPort $backendPort -State Listen -ErrorAction Stop | Select-Object -First 1

    if ($listener) {
      return [Nullable[int]]$listener.OwningProcess
    }
  } catch {
    # Fall back to command-line inspection below.
  }

  $process = Get-CimInstance Win32_Process -Filter "name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'server\.mjs' -and $_.CommandLine -match '(runningground|runnigapp)' } |
    Select-Object -First 1

  if ($process) {
    return [Nullable[int]]$process.ProcessId
  }

  return $null
}

function Get-QuickTunnelProcessId {
  $process = Get-CimInstance Win32_Process -Filter "name = 'cloudflared.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match "127\.0\.0\.1:$backendPort" } |
    Select-Object -First 1

  if ($process) {
    return [Nullable[int]]$process.ProcessId
  }

  return $null
}

function Stop-CloudflaredProcesses {
  $cloudflaredProcesses = Get-Process cloudflared -ErrorAction SilentlyContinue

  foreach ($process in $cloudflaredProcesses) {
    try {
      Stop-Process -Id $process.Id -Force -ErrorAction Stop
      Write-Host "Stopped leftover cloudflared process ($($process.Id))."
    } catch {
      # Ignore already-terminated processes.
    }
  }
}

function Get-TailscaleDnsName {
  try {
    $statusRaw = tailscale status --json | Out-String
    $match = [regex]::Match($statusRaw, '"DNSName"\s*:\s*"([^"]+)"')

    if (-not $match.Success) {
      throw 'Tailscale DNS name is empty.'
    }

    $dnsName = [string]$match.Groups[1].Value

    if ([string]::IsNullOrWhiteSpace($dnsName)) {
      throw 'Tailscale DNS name is empty.'
    }

    return $dnsName.TrimEnd('.')
  } catch {
    throw "Unable to read Tailscale DNS name: $($_.Exception.Message)"
  }
}

function Get-TailscaleNodeId {
  try {
    $statusRaw = tailscale status --json | Out-String
    $match = [regex]::Match($statusRaw, '"ID"\s*:\s*"([^"]+)"')

    if (-not $match.Success) {
      throw 'Tailscale node ID is empty.'
    }

    $nodeId = [string]$match.Groups[1].Value

    if ([string]::IsNullOrWhiteSpace($nodeId)) {
      throw 'Tailscale node ID is empty.'
    }

    return $nodeId
  } catch {
    throw "Unable to read Tailscale node ID: $($_.Exception.Message)"
  }
}

function Get-TailscalePublicUrl {
  $dnsName = Get-TailscaleDnsName
  return "https://$dnsName"
}

function Get-TailscaleFunnelState {
  try {
    $raw = tailscale funnel status --json | Out-String
    $trimmed = $raw.Trim()

    if ([string]::IsNullOrWhiteSpace($trimmed) -or $trimmed -eq '{}') {
      return [ordered]@{
        configured = $false
        raw = $trimmed
      }
    }

    return [ordered]@{
      configured = $true
      raw = $trimmed
    }
  } catch {
    return [ordered]@{
      configured = $false
      error = $_.Exception.Message
    }
  }
}

function Reset-TailscaleFunnel {
  try {
    tailscale funnel reset | Out-Null
  } catch {
    # Ignore when no funnel config exists yet.
  }
}

function Stop-ExistingPreviewProcesses {
  $previewInfo = Read-PreviewInfo

  Stop-ScheduledTaskSafe -taskName $backendTaskName
  Stop-ScheduledTaskSafe -taskName $tunnelTaskName
  Stop-ScheduledTaskSafe -taskName $legacyBackendTaskName
  Stop-ScheduledTaskSafe -taskName $legacyTunnelTaskName

  if ($previewInfo) {
    Stop-ProcessById -processId $previewInfo.backendPid -label 'preview backend'
    Stop-ProcessById -processId $previewInfo.tunnelPid -label 'preview tunnel'
  }

  Stop-PortListener -port $backendPort
  Stop-CloudflaredProcesses
  Reset-TailscaleFunnel
}

function Wait-ForLocalHealth([int]$timeoutSeconds = 30, [string]$expectedPublicUrl = '') {
  $deadline = (Get-Date).AddSeconds($timeoutSeconds)

  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-RestMethod -Uri "http://127.0.0.1:$backendPort/api/health" -TimeoutSec 3

      if ($response.status -eq 'ok' -and ([string]::IsNullOrWhiteSpace($expectedPublicUrl) -or $response.publicBaseUrl -eq $expectedPublicUrl)) {
        return $response
      }
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }

  throw 'preview backend local health check timed out'
}

function Wait-ForRemoteHealth([string]$publicUrl, [int]$timeoutSeconds = 180, [string]$expectedPublicUrl = '') {
  $deadline = (Get-Date).AddSeconds($timeoutSeconds)

  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-RestMethod -Uri "$publicUrl/api/health" -TimeoutSec 8

      if ($response.status -eq 'ok' -and ([string]::IsNullOrWhiteSpace($expectedPublicUrl) -or $response.publicBaseUrl -eq $expectedPublicUrl)) {
        return $response
      }
    } catch {
      Start-Sleep -Seconds 1
    }
  }

  throw 'preview backend public health check timed out'
}

function Write-TaskRunnerScripts {
  $backendRunner = @"
@echo off
setlocal
cd /d "$backendRoot"
"$nodePath" .\src\server.mjs > "$backendOutLog" 2> "$backendErrLog"
"@

  Set-Content -Path $backendRunnerPath -Value $backendRunner -Encoding ASCII
}

function Get-ConfiguredPostgresUrl {
  $envValues = Read-EnvFile -path $backendEnvPath

  if ($envValues.ContainsKey('BACKEND_POSTGRES_DATABASE_URL')) {
    return [string]$envValues.BACKEND_POSTGRES_DATABASE_URL
  }

  if ($envValues.ContainsKey('DATABASE_URL')) {
    return [string]$envValues.DATABASE_URL
  }

  return ''
}

function Test-LocalPreviewPostgresUrl([string]$databaseUrl) {
  if ([string]::IsNullOrWhiteSpace($databaseUrl)) {
    return $false
  }

  try {
    $uri = [Uri]$databaseUrl
    return $uri.Host -in @('127.0.0.1', 'localhost')
  } catch {
    return $false
  }
}

function Ensure-PreviewPostgresReady {
  $databaseUrl = Get-ConfiguredPostgresUrl

  if (-not (Test-LocalPreviewPostgresUrl -databaseUrl $databaseUrl)) {
    return
  }

  if (-not (Test-Path $previewPostgresStartScriptPath)) {
    throw "Preview PostgreSQL start script was not found: $previewPostgresStartScriptPath"
  }

  Write-Host 'Ensuring local preview PostgreSQL is ready...'
  & $previewPostgresStartScriptPath -RequireReady | Out-Null
}

function Write-QuickTunnelRunnerScript {
  $cloudflaredPath = (Get-Command cloudflared -ErrorAction Stop).Source
  $tunnelRunner = @"
@echo off
setlocal
"$cloudflaredPath" tunnel --no-autoupdate --protocol http2 --url http://127.0.0.1:$backendPort > "$tunnelOutLog" 2> "$tunnelErrLog"
"@

  Set-Content -Path $tunnelRunnerPath -Value $tunnelRunner -Encoding ASCII
}

function Register-PreviewTask([string]$taskName, [string]$runnerPath) {
  $action = New-ScheduledTaskAction -Execute $runnerPath
  $trigger = New-ScheduledTaskTrigger -AtLogOn
  $settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Days 30) `
    -MultipleInstances IgnoreNew `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
}

function Start-RunnerDirectly([string]$runnerPath) {
  Start-Process `
    -FilePath 'cmd.exe' `
    -ArgumentList '/d', '/c', "`"$runnerPath`"" `
    -WorkingDirectory $root `
    -WindowStyle Hidden | Out-Null
}

function Start-BackendProcess([string]$expectedPublicUrl, [switch]$UseDirectProcesses) {
  Stop-ScheduledTaskSafe -taskName $backendTaskName
  Stop-ScheduledTaskSafe -taskName $legacyBackendTaskName
  Stop-PortListener -port $backendPort
  Remove-Item $backendOutLog, $backendErrLog -ErrorAction SilentlyContinue

  if ($UseDirectProcesses) {
    Start-RunnerDirectly -runnerPath $backendRunnerPath
  } else {
    Register-PreviewTask -taskName $backendTaskName -runnerPath $backendRunnerPath
    Start-ScheduledTask -TaskName $backendTaskName
  }

  $null = Wait-ForLocalHealth -expectedPublicUrl $expectedPublicUrl
  return Get-BackendProcessId
}

function Start-QuickTunnelProcess([switch]$UseDirectProcesses) {
  Stop-ScheduledTaskSafe -taskName $tunnelTaskName
  Stop-ScheduledTaskSafe -taskName $legacyTunnelTaskName
  Remove-Item $tunnelOutLog, $tunnelErrLog -ErrorAction SilentlyContinue
  Write-QuickTunnelRunnerScript

  if ($UseDirectProcesses) {
    Start-RunnerDirectly -runnerPath $tunnelRunnerPath
  } else {
    Register-PreviewTask -taskName $tunnelTaskName -runnerPath $tunnelRunnerPath
    Start-ScheduledTask -TaskName $tunnelTaskName
  }
}

function Wait-ForQuickTunnelUrl([int]$timeoutSeconds = 40) {
  $deadline = (Get-Date).AddSeconds($timeoutSeconds)

  while ((Get-Date) -lt $deadline) {
    foreach ($logPath in @($tunnelOutLog, $tunnelErrLog)) {
      if (-not (Test-Path $logPath)) {
        continue
      }

      $content = Get-Content $logPath -Raw
      if ([string]::IsNullOrWhiteSpace($content)) {
        continue
      }

      $match = [regex]::Match($content, 'https://[-a-z0-9]+\.trycloudflare\.com')

      if ($match.Success) {
        return $match.Value
      }
    }

    Start-Sleep -Seconds 1
  }

  throw 'quick tunnel url was not found in the log'
}

function Start-TailscaleFunnel {
  Remove-Item $tunnelOutLog, $tunnelErrLog -ErrorAction SilentlyContinue
  Reset-TailscaleFunnel

  $tailscalePath = (Get-Command tailscale -ErrorAction Stop).Source
  $process = Start-Process `
    -FilePath $tailscalePath `
    -ArgumentList 'funnel', '--bg', '--yes', "http://127.0.0.1:$backendPort" `
    -RedirectStandardOutput $tunnelOutLog `
    -RedirectStandardError $tunnelErrLog `
    -PassThru

  try {
    Wait-Process -Id $process.Id -Timeout 10 -ErrorAction SilentlyContinue
  } catch {
    # We'll inspect the resulting funnel state below.
  }

  if (-not $process.HasExited) {
    try {
      Stop-Process -Id $process.Id -Force -ErrorAction Stop
    } catch {
      # Ignore if it already exited.
    }
  }

  Start-Sleep -Seconds 2
  $funnelState = Get-TailscaleFunnelState

  if ($funnelState.configured) {
    return
  }

  $approvalUrl = "https://login.tailscale.com/f/funnel?node=$(Get-TailscaleNodeId)"
  throw "Tailscale Funnel needs one-time approval: $approvalUrl"
}

function Write-PreviewInfo([string]$publicUrl, [string]$token, [Nullable[int]]$backendPid, [Nullable[int]]$tunnelPid, [string]$transport) {
  $payload = [ordered]@{
    startedAt = (Get-Date).ToString('o')
    status = 'running'
    transport = $transport
    publicUrl = $publicUrl
    apiBaseUrl = "$publicUrl/api"
    adminToken = $token
    backendPid = $backendPid
    tunnelPid = $tunnelPid
    backendTaskName = $backendTaskName
    tunnelTaskName = $tunnelTaskName
    backendEnvPath = $backendEnvPath
    appEnvPath = $appEnvPath
    backendOutLog = $backendOutLog
    backendErrLog = $backendErrLog
    tunnelOutLog = $tunnelOutLog
    tunnelErrLog = $tunnelErrLog
  }

  $payload | ConvertTo-Json | Set-Content -Path $previewInfoPath -Encoding UTF8
}

Write-Host '0. Stopping existing preview backend/public processes...'
Stop-ExistingPreviewProcesses
Write-TaskRunnerScripts

if ($Transport -eq 'tailscale-funnel') {
  $publicUrl = Get-TailscalePublicUrl

  Write-Host "1. Starting preview backend with Tailscale public base URL ($publicUrl)..."
  Write-BackendEnv -publicUrl $publicUrl -token $adminToken
  Write-AppEnv -publicUrl $publicUrl
  Ensure-PreviewPostgresReady
  $backendPid = Start-BackendProcess -expectedPublicUrl $publicUrl -UseDirectProcesses:$UseDirectProcesses

  Write-Host '2. Starting Tailscale Funnel in background mode...'
  Start-TailscaleFunnel

  Write-Host '3. Waiting for public preview health...'
  $remoteHealth = $null

  try {
    $remoteHealth = Wait-ForRemoteHealth -publicUrl $publicUrl -expectedPublicUrl $publicUrl
  } catch {
    Write-Warning "Public preview health could not be verified yet: $($_.Exception.Message)"
    Write-Warning 'The backend is configured for the stable Tailscale URL. Check funnel approval and retry if needed.'
  }

  $localHealth = Wait-ForLocalHealth -expectedPublicUrl $publicUrl
  Write-PreviewInfo -publicUrl $publicUrl -token $adminToken -backendPid $backendPid -tunnelPid $null -transport $Transport

  Write-Host ''
  Write-Host 'Preview backend is ready.'
  Write-Host "Transport: $Transport"
  Write-Host "Public URL: $publicUrl"
  Write-Host "API base URL: $publicUrl/api"
  Write-Host "Admin token: $adminToken"
  exit 0
}

Write-Host '1. Starting preview backend with temporary public base URL...'
Write-BackendEnv -publicUrl $placeholderUrl -token $adminToken
Ensure-PreviewPostgresReady
$backendPid = Start-BackendProcess -expectedPublicUrl $placeholderUrl -UseDirectProcesses:$UseDirectProcesses

Write-Host '2. Starting Cloudflare Quick Tunnel with http2...'
Start-QuickTunnelProcess -UseDirectProcesses:$UseDirectProcesses
$publicUrl = Wait-ForQuickTunnelUrl
$tunnelPid = Get-QuickTunnelProcessId

Write-Host "3. Tunnel ready: $publicUrl"
Write-Host '4. Updating backend and app env files to the new public URL...'
Write-BackendEnv -publicUrl $publicUrl -token $adminToken
Write-AppEnv -publicUrl $publicUrl

Write-Host '5. Restarting preview backend with final public base URL...'
$backendPid = Start-BackendProcess -expectedPublicUrl $publicUrl -UseDirectProcesses:$UseDirectProcesses
$localHealth = Wait-ForLocalHealth -expectedPublicUrl $publicUrl

Write-Host '6. Waiting for public preview health...'
$remoteHealth = $null

try {
  $remoteHealth = Wait-ForRemoteHealth -publicUrl $publicUrl -expectedPublicUrl $publicUrl
} catch {
  Write-Warning "Public preview health could not be verified from this Windows host: $($_.Exception.Message)"
  Write-Warning 'The tunnel URL was created and local backend health passed. Verify the public API from the Mac or phone network.'
}

$tunnelPid = Get-QuickTunnelProcessId
Write-PreviewInfo -publicUrl $publicUrl -token $adminToken -backendPid $backendPid -tunnelPid $tunnelPid -transport $Transport

Write-Host ''
Write-Host 'Preview backend is ready.'
Write-Host "Transport: $Transport"
Write-Host "Public URL: $publicUrl"
Write-Host "API base URL: $publicUrl/api"
Write-Host "Admin token: $adminToken"
