$ErrorActionPreference = 'Stop'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$previewInfoPath = Join-Path $root 'preview-public-info.json'
$backendPort = 8081

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

$previewInfo = $null

if (Test-Path $previewInfoPath) {
  try {
    $previewInfo = Get-Content $previewInfoPath -Raw | ConvertFrom-Json
  } catch {
    $previewInfo = $null
  }
}

if ($previewInfo) {
  Stop-ProcessById -processId $previewInfo.backendPid -label 'preview backend'
  Stop-ProcessById -processId $previewInfo.tunnelPid -label 'preview tunnel'
}

Stop-PortListener -port $backendPort

if ($previewInfo) {
  $previewInfo.status = 'stopped'
  $previewInfo | Add-Member -NotePropertyName stoppedAt -NotePropertyValue ((Get-Date).ToString('o')) -Force
  $previewInfo | ConvertTo-Json | Set-Content -Path $previewInfoPath -Encoding UTF8
}

Write-Host 'Preview backend/tunnel stop sequence finished.'
Write-Host "Info file: $previewInfoPath"
