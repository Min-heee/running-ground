param(
  [switch]$Json,
  [switch]$RequireHealthy,
  [switch]$ShowSecrets,
  [int]$HealthTimeoutSeconds = 8
)

$ErrorActionPreference = 'Stop'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$previewInfoPath = Join-Path $root 'preview-public-info.json'
$backendEnvPath = Join-Path $root 'backend\.env'
$backendOutLog = Join-Path $root 'backend-preview.out.log'
$backendErrLog = Join-Path $root 'backend-preview.err.log'
$tunnelOutLog = Join-Path $root 'preview-tunnel.out.log'
$tunnelErrLog = Join-Path $root 'preview-tunnel.err.log'
$backendPort = 8081

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

function Read-EnvFile {
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

function Test-ProcessRunning([Nullable[int]]$processId) {
  if (-not $processId) {
    return $false
  }

  return [bool](Get-Process -Id $processId -ErrorAction SilentlyContinue)
}

function Get-PortListenerProcessId([int]$port) {
  try {
    $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop | Select-Object -First 1
    return [Nullable[int]]$listener.OwningProcess
  } catch {
    return $null
  }
}

function Get-QuickTunnelProcessId([int]$port) {
  $process = Get-CimInstance Win32_Process -Filter "name = 'cloudflared.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match "127\.0\.0\.1:$port" } |
    Select-Object -First 1

  if ($process) {
    return [Nullable[int]]$process.ProcessId
  }

  return $null
}

function Test-PortListening([int]$port) {
  try {
    return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop)
  } catch {
    return $false
  }
}

function Invoke-HealthCheck([string]$url) {
  if ([string]::IsNullOrWhiteSpace($url)) {
    return [ordered]@{
      ok = $false
      error = 'URL is not set.'
    }
  }

  try {
    $response = Invoke-RestMethod -Uri $url -TimeoutSec $HealthTimeoutSeconds
    return [ordered]@{
      ok = ($response.status -eq 'ok' -and $response.ready -eq $true)
      status = $response.status
      ready = $response.ready
      startedAt = $response.startedAt
      uptimeSeconds = $response.uptimeSeconds
      storeDriver = $response.storeDriver
      publicBaseUrl = $response.publicBaseUrl
      postgres = $response.config.postgres
      readBridges = $response.readBridges
      requestTimeoutMs = $response.config.requestTimeoutMs
      backupCount = $response.store.backupCount
      users = $response.store.counts.users
      runs = $response.store.counts.runs
    }
  } catch {
    return [ordered]@{
      ok = $false
      error = $_.Exception.Message
    }
  }
}

function Invoke-AdminStatus([string]$apiBaseUrl, [string]$adminToken) {
  if ([string]::IsNullOrWhiteSpace($apiBaseUrl) -or [string]::IsNullOrWhiteSpace($adminToken)) {
    return [ordered]@{
      ok = $false
      error = 'API base URL or admin token is not set.'
    }
  }

  try {
    $response = Invoke-RestMethod -Uri "$apiBaseUrl/admin/status" -Headers @{ 'X-Admin-Token' = $adminToken } -TimeoutSec $HealthTimeoutSeconds
    return [ordered]@{
      ok = ($response.status -eq 'ok')
      status = $response.status
      storeDriver = $response.storeDriver
      postgres = $response.config.postgres
      readBridges = $response.readBridges
      users = $response.counts.users
      runs = $response.counts.runs
      sessions = $response.counts.sessions
      backupCount = $response.store.backupCount
    }
  } catch {
    return [ordered]@{
      ok = $false
      error = $_.Exception.Message
    }
  }
}

function Mask-Secret([string]$value) {
  if ([string]::IsNullOrWhiteSpace($value)) {
    return ''
  }

  if ($value.Length -le 12) {
    return '***'
  }

  return "$($value.Substring(0, 12))..."
}

function Get-Transport([object]$previewInfo, [string]$publicUrl) {
  if ($previewInfo -and -not [string]::IsNullOrWhiteSpace([string]$previewInfo.transport)) {
    return [string]$previewInfo.transport
  }

  if ($publicUrl -match '\.ts\.net/?$') {
    return 'tailscale-funnel'
  }

  return 'quick-tunnel'
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

function Get-TailscaleNodeId {
  try {
    $statusRaw = tailscale status --json | Out-String
    $match = [regex]::Match($statusRaw, '"ID"\s*:\s*"([^"]+)"')

    if ($match.Success) {
      return [string]$match.Groups[1].Value
    }
  } catch {
    # Ignore and fall back to log parsing.
  }

  return ''
}

function Get-FunnelApprovalUrlFromLogs {
  foreach ($logPath in @($tunnelOutLog, $tunnelErrLog)) {
    if (-not (Test-Path $logPath)) {
      continue
    }

    $content = Get-Content $logPath -Raw
    if ([string]::IsNullOrWhiteSpace($content)) {
      continue
    }
    $match = [regex]::Match($content, 'https://login\.tailscale\.com/f/funnel\?node=[A-Za-z0-9]+')

    if ($match.Success) {
      return $match.Value
    }
  }

  $nodeId = Get-TailscaleNodeId

  if ($nodeId) {
    return "https://login.tailscale.com/f/funnel?node=$nodeId"
  }

  return ''
}

$previewInfo = Read-PreviewInfo
$envValues = Read-EnvFile
$portListenerPid = Get-PortListenerProcessId -port $backendPort
$backendPid = if ($portListenerPid) { $portListenerPid } elseif ($previewInfo -and $previewInfo.backendPid) { [Nullable[int]]$previewInfo.backendPid } else { $null }
$publicUrlFromEnv = if ($envValues.ContainsKey('BACKEND_PUBLIC_BASE_URL')) { [string]$envValues.BACKEND_PUBLIC_BASE_URL } else { '' }
$publicUrl = if ($publicUrlFromEnv) { $publicUrlFromEnv } elseif ($previewInfo -and $previewInfo.publicUrl) { [string]$previewInfo.publicUrl } else { '' }
$apiBaseUrl = if ($publicUrl) { "$publicUrl/api" } elseif ($previewInfo -and $previewInfo.apiBaseUrl) { [string]$previewInfo.apiBaseUrl } else { '' }
$adminToken = if ($previewInfo -and $previewInfo.adminToken) { [string]$previewInfo.adminToken } elseif ($envValues.ContainsKey('BACKEND_ADMIN_TOKEN')) { [string]$envValues.BACKEND_ADMIN_TOKEN } else { '' }
$transport = Get-Transport -previewInfo $previewInfo -publicUrl $publicUrl

$backendRunning = Test-ProcessRunning -processId $backendPid
$portListening = Test-PortListening -port $backendPort
$localHealth = Invoke-HealthCheck -url "http://127.0.0.1:$backendPort/api/health"
$publicHealth = if ($apiBaseUrl) { Invoke-HealthCheck -url "$apiBaseUrl/health" } else { [ordered]@{ ok = $false; error = 'Preview API base URL is not set.' } }
$adminStatus = Invoke-AdminStatus -apiBaseUrl $apiBaseUrl -adminToken $adminToken
$postgresConfig = if ($publicHealth.postgres) { $publicHealth.postgres } elseif ($localHealth.postgres) { $localHealth.postgres } elseif ($adminStatus.postgres) { $adminStatus.postgres } else { $null }
$readBridges = if ($publicHealth.readBridges) { $publicHealth.readBridges } elseif ($localHealth.readBridges) { $localHealth.readBridges } elseif ($adminStatus.readBridges) { $adminStatus.readBridges } else { $null }

$quickTunnelPid = $null
$funnelState = $null

if ($transport -eq 'tailscale-funnel') {
  $funnelState = Get-TailscaleFunnelState
  $tunnelPid = $null
  $tunnelRunning = [bool]$funnelState.configured
} else {
  $quickTunnelPid = Get-QuickTunnelProcessId -port $backendPort
  $tunnelPid = if ($quickTunnelPid) { $quickTunnelPid } elseif ($previewInfo) { [Nullable[int]]$previewInfo.tunnelPid } else { $null }
  $tunnelRunning = Test-ProcessRunning -processId $tunnelPid
}

$healthy = $backendRunning -and $portListening -and $localHealth.ok -and $publicHealth.ok
$status = if ($healthy) {
  'healthy'
} elseif ($backendRunning -or $tunnelRunning -or $portListening -or $localHealth.ok -or $publicHealth.ok) {
  'degraded'
} else {
  'stopped'
}

$nextActions = @()

if (-not $previewInfo -and -not $publicUrl) {
  $nextActions += 'Run scripts\windows\start-preview-public-backend.cmd first.'
}

if (-not $backendRunning -or -not $portListening -or -not $localHealth.ok) {
  if ($transport -eq 'tailscale-funnel') {
    $nextActions += 'Restart the preview backend with scripts\windows\start-preview-public-backend.cmd -Transport tailscale-funnel.'
  } else {
    $nextActions += 'Restart the preview backend with scripts\windows\start-preview-public-backend.cmd.'
  }
}

if ($transport -eq 'tailscale-funnel') {
  $approvalUrl = Get-FunnelApprovalUrlFromLogs

  if (-not $tunnelRunning) {
    if ($approvalUrl) {
      $nextActions += "Approve Tailscale Funnel once: $approvalUrl"
    } else {
      $nextActions += 'Tailscale Funnel is not configured. Run the start script with -Transport tailscale-funnel.'
    }
  }
} elseif (-not $publicHealth.ok) {
  $nextActions += 'The quick tunnel is not healthy. Restarting preview backend will create a new public URL.'
} elseif (-not $tunnelRunning) {
  $nextActions += 'Public API is healthy, but the tunnel PID is not tracked on this machine.'
}

if ($publicHealth.ok -and -not $adminStatus.ok) {
  $nextActions += 'Public API works, but admin status failed. Check the admin token in preview-public-info.json.'
}

if ($nextActions.Count -eq 0) {
  $nextActions += 'No action needed.'
}

$payload = [ordered]@{
  status = $status
  healthy = $healthy
  transport = $transport
  checkedAt = (Get-Date).ToString('o')
  infoFile = $previewInfoPath
  publicUrl = $publicUrl
  apiBaseUrl = $apiBaseUrl
  adminToken = if ($ShowSecrets) { $adminToken } else { Mask-Secret -value $adminToken }
  backend = [ordered]@{
    pid = $backendPid
    running = $backendRunning
    port = $backendPort
    portListening = $portListening
    localHealth = $localHealth
  }
  tunnel = [ordered]@{
    pid = $tunnelPid
    running = $tunnelRunning
    publicHealth = $publicHealth
    approvalUrl = if ($transport -eq 'tailscale-funnel') { Get-FunnelApprovalUrlFromLogs } else { '' }
    rawStatus = if ($transport -eq 'tailscale-funnel') { $funnelState.raw } else { '' }
    error = if ($transport -eq 'tailscale-funnel') { $funnelState.error } else { '' }
  }
  admin = $adminStatus
  postgres = $postgresConfig
  readBridges = $readBridges
  logs = [ordered]@{
    backendOut = if ($previewInfo -and $previewInfo.backendOutLog) { $previewInfo.backendOutLog } else { $backendOutLog }
    backendErr = if ($previewInfo -and $previewInfo.backendErrLog) { $previewInfo.backendErrLog } else { $backendErrLog }
    tunnelOut = if ($previewInfo -and $previewInfo.tunnelOutLog) { $previewInfo.tunnelOutLog } else { $tunnelOutLog }
    tunnelErr = if ($previewInfo -and $previewInfo.tunnelErrLog) { $previewInfo.tunnelErrLog } else { $tunnelErrLog }
  }
  nextActions = $nextActions
}

if ($Json) {
  $payload | ConvertTo-Json -Depth 8
} else {
  Write-Host "Preview backend status: $($payload.status)"
  Write-Host "Transport: $($payload.transport)"
  Write-Host "Public URL: $($payload.publicUrl)"
  Write-Host "API base URL: $($payload.apiBaseUrl)"
  Write-Host "Admin token: $($payload.adminToken)"
  Write-Host "Backend PID: $($payload.backend.pid) / running: $($payload.backend.running) / port listening: $($payload.backend.portListening)"
  Write-Host "Tunnel PID: $($payload.tunnel.pid) / running: $($payload.tunnel.running)"
  Write-Host "Local health: $($payload.backend.localHealth.status) / ready: $($payload.backend.localHealth.ready)"
  Write-Host "Public health: $($payload.tunnel.publicHealth.status) / ready: $($payload.tunnel.publicHealth.ready)"
  Write-Host "Store: users=$($payload.tunnel.publicHealth.users), runs=$($payload.tunnel.publicHealth.runs), backups=$($payload.tunnel.publicHealth.backupCount)"
  Write-Host "Postgres: configured=$($payload.postgres.configured) / session=$($payload.postgres.enableSessionReads) / runs=$($payload.postgres.enableRunReads) / friends=$($payload.postgres.enableFriendReads) / league=$($payload.postgres.enableLeagueReads)"
  Write-Host "Bridge session/runs: session=$($payload.readBridges.sessionRuns.sessionReadsEnabled) / runs=$($payload.readBridges.sessionRuns.runReadsEnabled) / postgres=$($payload.readBridges.sessionRuns.postgresConfigured)"
  Write-Host "Bridge friends/league: friends=$($payload.readBridges.friendsLeague.friendReadsEnabled) / league=$($payload.readBridges.friendsLeague.leagueReadsEnabled) / postgresFriends=$($payload.readBridges.friendsLeague.postgresFriendsConfigured) / postgresLeague=$($payload.readBridges.friendsLeague.postgresLeagueConfigured)"
  Write-Host "Logs:"
  Write-Host "  backend out: $($payload.logs.backendOut)"
  Write-Host "  backend err: $($payload.logs.backendErr)"
  Write-Host "  tunnel out:  $($payload.logs.tunnelOut)"
  Write-Host "  tunnel err:  $($payload.logs.tunnelErr)"
  Write-Host "Next actions:"

  foreach ($action in $payload.nextActions) {
    Write-Host "  - $action"
  }
}

if ($RequireHealthy -and -not $healthy) {
  exit 1
}
