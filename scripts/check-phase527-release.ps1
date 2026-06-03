param(
  [string]$ExpectedCacheName = "baby-life-log-v5-27-release",
  [string]$ExpectedAppVersion = "5.27"
)

$ErrorActionPreference = "Stop"

$repoRoot = (git rev-parse --show-toplevel).Trim()
Set-Location $repoRoot

function Fail {
  param([string]$Message)
  Write-Host "FAILED: $Message" -ForegroundColor Red
  exit 1
}

function Read-Text {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    Fail "Missing required file: $Path"
  }
  return Get-Content -LiteralPath $Path -Raw
}

function Get-AssetsToCache {
  param([string]$ServiceWorkerContent)
  $match = [regex]::Match(
    $ServiceWorkerContent,
    "const\s+ASSETS_TO_CACHE\s*=\s*\[(?<items>.*?)\]\s*;",
    [System.Text.RegularExpressions.RegexOptions]::Singleline
  )
  if (-not $match.Success) {
    Fail "ASSETS_TO_CACHE was not found in sw.js"
  }

  $assetMatches = [regex]::Matches($match.Groups["items"].Value, '["''](?<path>[^"'']+)["'']')
  $assets = New-Object System.Collections.Generic.List[string]
  foreach ($asset in $assetMatches) {
    $assets.Add($asset.Groups["path"].Value)
  }
  return $assets
}

function Resolve-PrecacheAsset {
  param([string]$Asset)
  $clean = $Asset.Trim()
  if ($clean.StartsWith("/")) {
    $clean = $clean.TrimStart("/")
  }
  if ($clean.StartsWith("./")) {
    $clean = $clean.Substring(2)
  }
  $clean = $clean -replace "/", [System.IO.Path]::DirectorySeparatorChar
  return Join-Path $repoRoot $clean
}

function Test-AndroidWrapperPath {
  param([string]$Path)
  $p = ($Path -replace "\\", "/").Trim()
  $protectedRoots = @("app/", "android/", "gradle/", ".gradle/")
  foreach ($root in $protectedRoots) {
    if ($p.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
      return $true
    }
  }

  $leaf = Split-Path -Leaf $p
  $protectedLeafFiles = @(
    "build.gradle",
    "build.gradle.kts",
    "settings.gradle",
    "settings.gradle.kts",
    "gradle.properties",
    "local.properties",
    "AndroidManifest.xml",
    "MainActivity.kt",
    "MainActivity.java"
  )
  return $protectedLeafFiles -contains $leaf
}

$index = Read-Text "index.html"
$sw = Read-Text "sw.js"
$manifest = Read-Text "manifest.json"

if ($index -notmatch [regex]::Escape("const APP_VERSION = `"$ExpectedAppVersion`";")) {
  Fail "index.html APP_VERSION is not $ExpectedAppVersion"
}
if ($index -notmatch [regex]::Escape("const SERVICE_WORKER_CACHE_NAME = `"$ExpectedCacheName`";")) {
  Fail "index.html SERVICE_WORKER_CACHE_NAME is not $ExpectedCacheName"
}
if ($sw -notmatch [regex]::Escape("const CACHE_NAME = `"$ExpectedCacheName`";")) {
  Fail "sw.js CACHE_NAME is not $ExpectedCacheName"
}
if ($manifest -notmatch [regex]::Escape('"version": "5.27"')) {
  Fail "manifest.json version is not 5.27"
}

$assets = @(Get-AssetsToCache $sw)
$missing = New-Object System.Collections.Generic.List[string]
foreach ($asset in $assets) {
  $resolved = Resolve-PrecacheAsset $asset
  if (-not (Test-Path -LiteralPath $resolved -PathType Leaf)) {
    $missing.Add($asset)
  }
}
if ($missing.Count -gt 0) {
  $missing | ForEach-Object { Write-Host "Missing asset: $_" -ForegroundColor Yellow }
  Fail "ASSETS_TO_CACHE contains missing files"
}

$statusLines = @(git status --short)
$changedPaths = @()
foreach ($line in $statusLines) {
  if ([string]::IsNullOrWhiteSpace($line) -or $line.Length -lt 4) {
    continue
  }
  $pathPart = $line.Substring(3).Trim()
  if ($pathPart.Contains(" -> ")) {
    $parts = $pathPart -split " -> "
    $pathPart = $parts[$parts.Length - 1].Trim()
  }
  $changedPaths += $pathPart
}

$blocked = @($changedPaths | Where-Object { Test-AndroidWrapperPath $_ })
if ($blocked.Count -gt 0) {
  $blocked | ForEach-Object { Write-Host "Protected path changed: $_" -ForegroundColor Yellow }
  Fail "Android wrapper/native paths changed"
}

Write-Host "PASSED: Phase 5.27 release guard"
Write-Host "APP_VERSION: $ExpectedAppVersion"
Write-Host "CACHE_NAME: $ExpectedCacheName"
Write-Host "ASSETS_TO_CACHE entries: $($assets.Count)"
Write-Host "MISSING entries: 0"
Write-Host "Android wrapper/native changed paths: 0"
exit 0
