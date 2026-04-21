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
      publicBaseUrl = $response.publicBaseUrl
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

$previewInfo = Read-PreviewInfo
$envValues = Read-EnvFile
$portListenerPid = Get-PortListenerProcessId -port $backendPort
$backendPid = if ($previewInfo -and $previewInfo.backendPid) { [Nullable[int]]$previewInfo.backendPid } else { $portListenerPid }
$tunnelPid = if ($previewInfo) { [Nullable[int]]$previewInfo.tunnelPid } else { $null }
$publicUrlFromEnv = if ($envValues.ContainsKey('BACKEND_PUBLIC_BASE_URL')) { [string]$envValues.BACKEND_PUBLIC_BASE_URL } else { '' }
$apiBaseUrl = if ($previewInfo -and $previewInfo.apiBaseUrl) { [string]$previewInfo.apiBaseUrl } elseif ($publicUrlFromEnv) { "$publicUrlFromEnv/api" } else { '' }
$publicUrl = if ($previewInfo -and $previewInfo.publicUrl) { [string]$previewInfo.publicUrl } else { $publicUrlFromEnv }
$adminToken = if ($previewInfo -and $previewInfo.adminToken) { [string]$previewInfo.adminToken } elseif ($envValues.ContainsKey('BACKEND_ADMIN_TOKEN')) { [string]$envValues.BACKEND_ADMIN_TOKEN } else { '' }

$backendRunning = Test-ProcessRunning -processId $backendPid
$tunnelRunning = Test-ProcessRunning -processId $tunnelPid
$portListening = Test-PortListening -port $backendPort
$localHealth = Invoke-HealthCheck -url "http://127.0.0.1:$backendPort/api/health"
$publicHealth = if ($apiBaseUrl) { Invoke-HealthCheck -url "$apiBaseUrl/health" } else { [ordered]@{ ok = $false; error = 'Preview API base URL is not set.' } }
$adminStatus = Invoke-AdminStatus -apiBaseUrl $apiBaseUrl -adminToken $adminToken

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
  $nextActions += 'Restart the preview backend with scripts\windows\start-preview-public-backend.cmd.'
}

if (-not $publicHealth.ok) {
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
  }
  admin = $adminStatus
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
  Write-Host "Public URL: $($payload.publicUrl)"
  Write-Host "API base URL: $($payload.apiBaseUrl)"
  Write-Host "Admin token: $($payload.adminToken)"
  Write-Host "Backend PID: $($payload.backend.pid) / running: $($payload.backend.running) / port listening: $($payload.backend.portListening)"
  Write-Host "Tunnel PID: $($payload.tunnel.pid) / running: $($payload.tunnel.running)"
  Write-Host "Local health: $($payload.backend.localHealth.status) / ready: $($payload.backend.localHealth.ready)"
  Write-Host "Public health: $($payload.tunnel.publicHealth.status) / ready: $($payload.tunnel.publicHealth.ready)"
  Write-Host "Store: users=$($payload.tunnel.publicHealth.users), runs=$($payload.tunnel.publicHealth.runs), backups=$($payload.tunnel.publicHealth.backupCount)"
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
