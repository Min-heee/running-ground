param(
  [string]$TaskName = 'RunningGroundPreviewBootstrap',
  [ValidateSet('quick-tunnel', 'tailscale-funnel')]
  [string]$Transport = 'tailscale-funnel',
  [switch]$StartNow
)

$ErrorActionPreference = 'Stop'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$taskLogPath = Join-Path $root 'preview-bootstrap.task.log'
$startScriptPath = Join-Path $PSScriptRoot 'start-preview-public-backend.cmd'

if (-not (Test-Path $startScriptPath)) {
  throw "Preview public backend start script was not found: $startScriptPath"
}

$quotedRoot = '"' + $root + '"'
$quotedStartScriptPath = '"' + $startScriptPath + '"'
$quotedTaskLogPath = '"' + $taskLogPath + '"'
$cmdArguments = "/d /c cd /d $quotedRoot && $quotedStartScriptPath -Transport $Transport -UseDirectProcesses >> $quotedTaskLogPath 2>&1"

$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument $cmdArguments
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Days 30) `
  -MultipleInstances IgnoreNew `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1)

foreach ($legacyTaskName in @('RunnigappPreviewBootstrap')) {
  if ($legacyTaskName -eq $TaskName) {
    continue
  }

  try {
    Unregister-ScheduledTask -TaskName $legacyTaskName -Confirm:$false -ErrorAction SilentlyContinue
  } catch {
    # Ignore if the legacy task is not installed.
  }
}

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null

Write-Host "Installed scheduled task: $TaskName"
Write-Host "Workspace root: $root"
Write-Host "Transport: $Transport"
Write-Host "Start script: $startScriptPath"
Write-Host "Task log: $taskLogPath"
Write-Host 'This bootstrap task replays the full preview startup flow on Windows logon.'

if ($StartNow) {
  Start-ScheduledTask -TaskName $TaskName
  Write-Host "Started scheduled task: $TaskName"
}
