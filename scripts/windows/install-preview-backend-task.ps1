param(
  [string]$TaskName = 'RunnigappPreviewBackend',
  [switch]$StartNow
)

$ErrorActionPreference = 'Stop'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$backendRoot = Join-Path $root 'backend'
$taskLogPath = Join-Path $backendRoot 'backend.task.log'
$nodePath = (Get-Command node -ErrorAction Stop).Source

if (-not (Test-Path (Join-Path $backendRoot 'src\server.mjs'))) {
  throw "Backend server file was not found: $backendRoot"
}

$quotedBackendRoot = '"' + $backendRoot + '"'
$quotedNodePath = '"' + $nodePath + '"'
$quotedTaskLogPath = '"' + $taskLogPath + '"'
$cmdArguments = "/d /c cd /d $quotedBackendRoot && $quotedNodePath .\src\server.mjs >> $quotedTaskLogPath 2>&1"

$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument $cmdArguments
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Days 30) `
  -MultipleInstances IgnoreNew `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null

Write-Host "Installed scheduled task: $TaskName"
Write-Host "Backend root: $backendRoot"
Write-Host "Task log: $taskLogPath"

if ($StartNow) {
  Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Seconds 1
  Start-ScheduledTask -TaskName $TaskName
  Write-Host "Started scheduled task: $TaskName"
}
