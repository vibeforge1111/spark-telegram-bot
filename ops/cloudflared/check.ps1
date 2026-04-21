param(
  [string]$CloudflaredPath = ""
)

$ErrorActionPreference = "Stop"

function Resolve-CloudflaredPath {
  param([string]$RequestedPath)

  if ($RequestedPath -and (Test-Path $RequestedPath)) {
    return $RequestedPath
  }

  $command = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($command -and $command.Source) {
    return $command.Source
  }

  $candidates = @(
    "C:\Users\USER\AppData\Local\Microsoft\WinGet\Packages\Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe\cloudflared.exe",
    "C:\Program Files\cloudflared\cloudflared.exe",
    "C:\ProgramData\chocolatey\bin\cloudflared.exe",
    "C:\Users\USER\AppData\Local\Microsoft\WinGet\Links\cloudflared.exe"
  )

  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  return $null
}

function Write-Check {
  param(
    [bool]$Ok,
    [string]$Label,
    [string]$Detail
  )

  $prefix = if ($Ok) { "[ok]" } else { "[fail]" }
  Write-Output "${prefix} ${Label}: ${Detail}"
}

$cloudflared = Resolve-CloudflaredPath -RequestedPath $CloudflaredPath
if (-not $cloudflared) {
  Write-Check -Ok $false -Label "cloudflared binary" -Detail "not found"
  Write-Output "Next step: install cloudflared or pass -CloudflaredPath explicitly."
  exit 1
}

Write-Check -Ok $true -Label "cloudflared binary" -Detail $cloudflared

$version = & $cloudflared --version 2>$null
Write-Check -Ok $true -Label "cloudflared version" -Detail ($version -join " ")

$certCandidates = @(
  "$HOME\.cloudflared\cert.pem",
  "$HOME\.cloudflare-warp\cert.pem",
  "$HOME\cloudflare-warp\cert.pem"
)

$certPath = $null
foreach ($candidate in $certCandidates) {
  if (Test-Path $candidate) {
    $certPath = $candidate
    break
  }
}

if ($certPath) {
  Write-Check -Ok $true -Label "origin cert" -Detail $certPath
} else {
  Write-Check -Ok $false -Label "origin cert" -Detail "not found"
}

$configPath = Join-Path (Get-Location) "ops\cloudflared\config.example.yml"
if (Test-Path $configPath) {
  Write-Check -Ok $true -Label "repo config template" -Detail $configPath
} else {
  Write-Check -Ok $false -Label "repo config template" -Detail "missing"
}

if (-not $certPath) {
  Write-Output "Named tunnel readiness: BLOCKED"
  Write-Output "Next step: run `"$cloudflared tunnel login`" and complete Cloudflare auth in the browser."
  exit 1
}

Write-Output "Named tunnel readiness: READY"
Write-Output "Next step: create a named tunnel and fill in ops/cloudflared/config.example.yml."
