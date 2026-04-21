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
$nodePath = (Get-Command node).Source
$cloudflaredPath = (Get-Command cloudflared -ErrorAction Stop).Source

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

function Write-BackendEnv([string]$publicUrl, [string]$token) {
  $lines = @(
    'BACKEND_APP_ENV=preview',
    'BACKEND_HOST=0.0.0.0',
    "BACKEND_PORT=$backendPort",
    'BACKEND_CORS_ORIGIN=*',
    "BACKEND_PUBLIC_BASE_URL=$publicUrl",
    'BACKEND_STORE_FILE=backend/data/preview-store.json',
    'BACKEND_STORE_BACKUP_DIRECTORY=backend/data/preview-backups',
    'BACKEND_STORE_BACKUP_ON_SAVE=true',
    'BACKEND_STORE_BACKUP_RETENTION=10',
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

function Stop-ExistingPreviewProcesses {
  $previewInfo = Read-PreviewInfo

  if ($previewInfo) {
    Stop-ProcessById -processId $previewInfo.backendPid -label 'preview backend'
    Stop-ProcessById -processId $previewInfo.tunnelPid -label 'preview tunnel'
  }

  Stop-PortListener -port $backendPort

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

function Wait-ForLocalHealth([int]$timeoutSeconds = 30) {
  $deadline = (Get-Date).AddSeconds($timeoutSeconds)

  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-RestMethod -Uri "http://127.0.0.1:$backendPort/api/health" -TimeoutSec 3

      if ($response.status -eq 'ok') {
        return $response
      }
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }

  throw 'preview backend local health check timed out'
}

function Wait-ForRemoteHealth([string]$publicUrl, [int]$timeoutSeconds = 90) {
  $deadline = (Get-Date).AddSeconds($timeoutSeconds)

  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-RestMethod -Uri "$publicUrl/api/health" -TimeoutSec 5

      if ($response.status -eq 'ok') {
        return $response
      }
    } catch {
      Start-Sleep -Seconds 1
    }
  }

  throw 'preview backend public health check timed out'
}

function Start-BackendProcess {
  Stop-PortListener -port $backendPort
  Remove-Item $backendOutLog, $backendErrLog -ErrorAction SilentlyContinue

  $process = Start-Process -FilePath $nodePath -ArgumentList @('./src/server.mjs') -WorkingDirectory $backendRoot -RedirectStandardOutput $backendOutLog -RedirectStandardError $backendErrLog -WindowStyle Hidden -PassThru
  $null = Wait-ForLocalHealth
  return $process
}

function Start-TunnelProcess {
  Remove-Item $tunnelOutLog, $tunnelErrLog -ErrorAction SilentlyContinue

  return Start-Process -FilePath $cloudflaredPath -ArgumentList @('tunnel', '--url', "http://127.0.0.1:$backendPort", '--no-autoupdate') -RedirectStandardOutput $tunnelOutLog -RedirectStandardError $tunnelErrLog -WindowStyle Hidden -PassThru
}

function Wait-ForTunnelUrl([int]$timeoutSeconds = 40) {
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

function Write-PreviewInfo([string]$publicUrl, [string]$token, [int]$backendPid, [int]$tunnelPid) {
  $payload = [ordered]@{
    startedAt = (Get-Date).ToString('o')
    status = 'running'
    publicUrl = $publicUrl
    apiBaseUrl = "$publicUrl/api"
    adminToken = $token
    backendPid = $backendPid
    tunnelPid = $tunnelPid
    backendEnvPath = $backendEnvPath
    appEnvPath = $appEnvPath
    backendOutLog = $backendOutLog
    backendErrLog = $backendErrLog
    tunnelOutLog = $tunnelOutLog
    tunnelErrLog = $tunnelErrLog
  }

  $payload | ConvertTo-Json | Set-Content -Path $previewInfoPath -Encoding UTF8
}

Write-Host '0. Stopping existing preview backend/tunnel processes...'
Stop-ExistingPreviewProcesses

Write-Host '1. Starting preview backend with temporary public base URL...'
Write-BackendEnv -publicUrl $placeholderUrl -token $adminToken
$backendProcess = Start-BackendProcess

Write-Host '2. Starting Cloudflare Quick Tunnel...'
$tunnelProcess = Start-TunnelProcess
$publicUrl = Wait-ForTunnelUrl

Write-Host "3. Tunnel ready: $publicUrl"
Write-Host '4. Updating backend and app env files to the new public URL...'
Write-BackendEnv -publicUrl $publicUrl -token $adminToken
Write-AppEnv -publicUrl $publicUrl

Write-Host '5. Restarting preview backend with final public base URL...'
$backendProcess = Start-BackendProcess
$localHealth = Wait-ForLocalHealth

Write-Host '6. Waiting for public preview health...'
$remoteHealth = Wait-ForRemoteHealth -publicUrl $publicUrl

Write-PreviewInfo -publicUrl $publicUrl -token $adminToken -backendPid $backendProcess.Id -tunnelPid $tunnelProcess.Id

Write-Host ''
Write-Host 'Preview backend is ready.'
Write-Host "Public URL: $publicUrl"
Write-Host "API base URL: $publicUrl/api"
Write-Host "Admin token: $adminToken"
Write-Host "Backend PID: $($backendProcess.Id)"
Write-Host "Tunnel PID: $($tunnelProcess.Id)"
Write-Host "Info file: $previewInfoPath"
Write-Host "Local status: $($localHealth.status) / Public status: $($remoteHealth.status)"
