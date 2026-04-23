param(
  [ValidateSet('keep', 'off', 'session-runs', 'friends-league', 'all')]
  [string]$Preset = 'keep',
  [ValidateSet('keep', 'on', 'off')]
  [string]$SessionReads = 'keep',
  [ValidateSet('keep', 'on', 'off')]
  [string]$RunReads = 'keep',
  [ValidateSet('keep', 'on', 'off')]
  [string]$FriendReads = 'keep',
  [ValidateSet('keep', 'on', 'off')]
  [string]$LeagueReads = 'keep',
  [switch]$RestartPreview,
  [switch]$SkipDatabaseCheck
)

$ErrorActionPreference = 'Stop'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$backendRoot = Join-Path $root 'backend'
$backendEnvPath = Join-Path $backendRoot '.env'
$previewInfoPath = Join-Path $root 'preview-public-info.json'
$nodePath = (Get-Command node -ErrorAction Stop).Source
$startPreviewScriptPath = Join-Path $PSScriptRoot 'start-preview-public-backend.ps1'

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

function Get-BooleanString([hashtable]$values, [string]$key) {
  if (-not $values.ContainsKey($key)) {
    return 'false'
  }

  $value = [string]$values[$key]

  if ([string]::IsNullOrWhiteSpace($value)) {
    return 'false'
  }

  $normalized = $value.Trim().ToLowerInvariant()

  if (@('1', 'true', 'yes', 'on').Contains($normalized)) {
    return 'true'
  }

  if (@('0', 'false', 'no', 'off').Contains($normalized)) {
    return 'false'
  }

  return 'false'
}

function Resolve-FlagState([string]$currentValue, [string]$requestedState) {
  switch ($requestedState) {
    'on' {
      return 'true'
    }
    'off' {
      return 'false'
    }
    default {
      return $currentValue
    }
  }
}

function Set-Or-AppendEnvValue([string[]]$lines, [string]$key, [string]$value) {
  $pattern = "^\s*$([regex]::Escape($key))\s*="
  $updated = $false

  for ($index = 0; $index -lt $lines.Count; $index += 1) {
    if ($lines[$index] -match $pattern) {
      $lines[$index] = "$key=$value"
      $updated = $true
      break
    }
  }

  if (-not $updated) {
    $lines += "$key=$value"
  }

  return $lines
}

function Get-PreviewTransport([object]$previewInfo, [hashtable]$envValues) {
  if ($previewInfo -and -not [string]::IsNullOrWhiteSpace([string]$previewInfo.transport)) {
    return [string]$previewInfo.transport
  }

  if ($envValues.ContainsKey('BACKEND_PUBLIC_BASE_URL') -and [string]$envValues.BACKEND_PUBLIC_BASE_URL -match '\.ts\.net/?$') {
    return 'tailscale-funnel'
  }

  return 'quick-tunnel'
}

function Invoke-NodeScript([string[]]$arguments, [string]$label) {
  Push-Location $backendRoot

  try {
    & $nodePath @arguments

    if ($LASTEXITCODE -ne 0) {
      throw "$label failed with exit code $LASTEXITCODE."
    }
  } finally {
    Pop-Location
  }
}

function Test-AnyReadEnabled([hashtable]$flags) {
  return $flags.session -eq 'true' -or $flags.runs -eq 'true' -or $flags.friends -eq 'true' -or $flags.league -eq 'true'
}

if (-not (Test-Path $backendEnvPath)) {
  throw "backend/.env 파일이 아직 없어. 먼저 scripts\\windows\\start-preview-public-backend.cmd 를 한 번 실행해줘."
}

$originalContent = Get-Content $backendEnvPath -Raw
$originalLines = Get-Content $backendEnvPath
$envValues = Read-EnvFile -path $backendEnvPath
$previewInfo = Read-PreviewInfo
$transport = Get-PreviewTransport -previewInfo $previewInfo -envValues $envValues

$desiredFlags = @{
  session = Get-BooleanString -values $envValues -key 'BACKEND_POSTGRES_ENABLE_SESSION_READS'
  runs = Get-BooleanString -values $envValues -key 'BACKEND_POSTGRES_ENABLE_RUN_READS'
  friends = Get-BooleanString -values $envValues -key 'BACKEND_POSTGRES_ENABLE_FRIEND_READS'
  league = Get-BooleanString -values $envValues -key 'BACKEND_POSTGRES_ENABLE_LEAGUE_READS'
}

switch ($Preset) {
  'off' {
    $desiredFlags.session = 'false'
    $desiredFlags.runs = 'false'
    $desiredFlags.friends = 'false'
    $desiredFlags.league = 'false'
  }
  'session-runs' {
    $desiredFlags.session = 'true'
    $desiredFlags.runs = 'true'
    $desiredFlags.friends = 'false'
    $desiredFlags.league = 'false'
  }
  'friends-league' {
    $desiredFlags.session = 'false'
    $desiredFlags.runs = 'false'
    $desiredFlags.friends = 'true'
    $desiredFlags.league = 'true'
  }
  'all' {
    $desiredFlags.session = 'true'
    $desiredFlags.runs = 'true'
    $desiredFlags.friends = 'true'
    $desiredFlags.league = 'true'
  }
}

$desiredFlags.session = Resolve-FlagState -currentValue $desiredFlags.session -requestedState $SessionReads
$desiredFlags.runs = Resolve-FlagState -currentValue $desiredFlags.runs -requestedState $RunReads
$desiredFlags.friends = Resolve-FlagState -currentValue $desiredFlags.friends -requestedState $FriendReads
$desiredFlags.league = Resolve-FlagState -currentValue $desiredFlags.league -requestedState $LeagueReads

$databaseUrl = if ($envValues.ContainsKey('BACKEND_POSTGRES_DATABASE_URL')) {
  [string]$envValues.BACKEND_POSTGRES_DATABASE_URL
} elseif ($envValues.ContainsKey('DATABASE_URL')) {
  [string]$envValues.DATABASE_URL
} else {
  ''
}

if (Test-AnyReadEnabled -flags $desiredFlags) {
  if ([string]::IsNullOrWhiteSpace($databaseUrl)) {
    throw 'PostgreSQL read 플래그를 켜려면 backend/.env 에 BACKEND_POSTGRES_DATABASE_URL 또는 DATABASE_URL 이 먼저 있어야 해.'
  }
}

$updatedLines = $originalLines
$updatedLines = Set-Or-AppendEnvValue -lines $updatedLines -key 'BACKEND_POSTGRES_ENABLE_SESSION_READS' -value $desiredFlags.session
$updatedLines = Set-Or-AppendEnvValue -lines $updatedLines -key 'BACKEND_POSTGRES_ENABLE_RUN_READS' -value $desiredFlags.runs
$updatedLines = Set-Or-AppendEnvValue -lines $updatedLines -key 'BACKEND_POSTGRES_ENABLE_FRIEND_READS' -value $desiredFlags.friends
$updatedLines = Set-Or-AppendEnvValue -lines $updatedLines -key 'BACKEND_POSTGRES_ENABLE_LEAGUE_READS' -value $desiredFlags.league

try {
  Set-Content -Path $backendEnvPath -Value $updatedLines -Encoding UTF8
  Invoke-NodeScript -arguments @('.\scripts\validate-env.mjs', '--env-file', '.env', '--env', 'preview') -label 'Preview env validation'

  if (-not $SkipDatabaseCheck -and (Test-AnyReadEnabled -flags $desiredFlags)) {
    Invoke-NodeScript -arguments @('.\scripts\check-postgres.mjs') -label 'PostgreSQL connection check'
  }
} catch {
  Set-Content -Path $backendEnvPath -Value $originalContent -Encoding UTF8
  throw
}

Write-Host 'Preview PostgreSQL read flags updated.'
Write-Host "  session reads: $($desiredFlags.session)"
Write-Host "  run reads: $($desiredFlags.runs)"
Write-Host "  friend reads: $($desiredFlags.friends)"
Write-Host "  league reads: $($desiredFlags.league)"

if ($RestartPreview) {
  if ($transport -eq 'quick-tunnel') {
    Write-Warning 'quick-tunnel transport 는 재시작 시 공개 URL이 바뀔 수 있어. 필요하면 preview:sync-eas-env 도 다시 맞춰줘.'
  }

  Write-Host "Restarting preview backend with transport: $transport"
  & $startPreviewScriptPath -Transport $transport
  exit 0
}

Write-Host ''
Write-Host 'Next actions:'

if ($previewInfo -and [string]$previewInfo.status -eq 'running') {
  if ($transport -eq 'quick-tunnel') {
    Write-Host '  - Restart preview backend when ready: scripts\windows\start-preview-public-backend.cmd'
    Write-Host '  - If the public URL changes, run npm run preview:sync-eas-env on the Mac.'
  } else {
    Write-Host '  - Apply the flags on the live preview server: scripts\windows\start-preview-public-backend.cmd -Transport tailscale-funnel'
  }
} else {
  Write-Host '  - Start preview backend: scripts\windows\start-preview-public-backend.cmd -Transport tailscale-funnel'
}

Write-Host '  - Verify bridge state: scripts\windows\status-preview-public-backend.cmd'
