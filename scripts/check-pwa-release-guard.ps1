param(
  [switch]$AllowNativeTask,
  [switch]$SkipAssetCheck
)

$ErrorActionPreference = "Stop"

function Normalize-GitPath {
  param([string]$Path)
  return ($Path -replace "\\", "/").Trim()
}

function Test-AndroidWrapperPath {
  param([string]$Path)

  $p = Normalize-GitPath $Path

  $protectedRoots = @(
    "app/",
    "android/",
    "gradle/",
    ".gradle/"
  )

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

  if ($protectedLeafFiles -contains $leaf) {
    return $true
  }

  if ($p -match "(^|/)gradle-wrapper\.(jar|properties)$") {
    return $true
  }

  return $false
}

function Get-ChangedGitPaths {
  $statusLines = git status --short
  $paths = New-Object System.Collections.Generic.List[string]

  foreach ($line in $statusLines) {
    if ([string]::IsNullOrWhiteSpace($line) -or $line.Length -lt 4) {
      continue
    }

    $pathPart = $line.Substring(3).Trim()
    if ($pathPart.Contains(" -> ")) {
      $parts = $pathPart -split " -> "
      $pathPart = $parts[$parts.Length - 1].Trim()
    }

    if (-not [string]::IsNullOrWhiteSpace($pathPart)) {
      $paths.Add((Normalize-GitPath $pathPart))
    }
  }

  return $paths | Sort-Object -Unique
}

function Get-ServiceWorkerAssetPaths {
  param([string]$ServiceWorkerPath)

  if (-not (Test-Path -LiteralPath $ServiceWorkerPath)) {
    return @()
  }

  $content = Get-Content -LiteralPath $ServiceWorkerPath -Raw
  $match = [regex]::Match(
    $content,
    "const\s+ASSETS_TO_CACHE\s*=\s*\[(?<items>.*?)\]\s*;",
    [System.Text.RegularExpressions.RegexOptions]::Singleline
  )

  if (-not $match.Success) {
    return @()
  }

  $items = $match.Groups["items"].Value
  $assetMatches = [regex]::Matches($items, '["''](?<path>[^"'']+)["'']')
  $assets = New-Object System.Collections.Generic.List[string]

  foreach ($asset in $assetMatches) {
    $assets.Add($asset.Groups["path"].Value)
  }

  return $assets
}

function Resolve-AssetPath {
  param(
    [string]$RepoRoot,
    [string]$AssetPath
  )

  $clean = $AssetPath.Trim()

  if ($clean.StartsWith("/")) {
    $clean = $clean.TrimStart("/")
  }

  if ($clean.StartsWith("./")) {
    $clean = $clean.Substring(2)
  }

  $clean = $clean -replace "/", [System.IO.Path]::DirectorySeparatorChar
  return Join-Path $RepoRoot $clean
}

$repoRoot = (git rev-parse --show-toplevel).Trim()
Set-Location $repoRoot

Write-Host "PWA release guard"
Write-Host "Repository: $repoRoot"

$changedPaths = @(Get-ChangedGitPaths)
$blockedPaths = @($changedPaths | Where-Object { Test-AndroidWrapperPath $_ })

if ($blockedPaths.Count -gt 0) {
  Write-Host ""
  Write-Host "Android wrapper/native build changes detected:" -ForegroundColor Yellow
  $blockedPaths | ForEach-Object { Write-Host " - $_" -ForegroundColor Yellow }

  if (-not $AllowNativeTask) {
    Write-Host ""
    Write-Host "FAILED: This is not marked as an explicit Android native task." -ForegroundColor Red
    Write-Host "Use -AllowNativeTask only when the current phase explicitly allows Android wrapper changes." -ForegroundColor Red
    exit 1
  }

  Write-Host "Allowed because -AllowNativeTask was provided." -ForegroundColor Yellow
}
else {
  Write-Host "Android wrapper/native build changes: none"
}

if (-not $SkipAssetCheck) {
  $serviceWorkerPath = Join-Path $repoRoot "sw.js"
  $assets = @(Get-ServiceWorkerAssetPaths -ServiceWorkerPath $serviceWorkerPath)
  $missingAssets = New-Object System.Collections.Generic.List[string]

  foreach ($asset in $assets) {
    $resolved = Resolve-AssetPath -RepoRoot $repoRoot -AssetPath $asset
    if (-not (Test-Path -LiteralPath $resolved -PathType Leaf)) {
      $missingAssets.Add($asset)
    }
  }

  Write-Host "ASSETS_TO_CACHE entries: $($assets.Count)"
  Write-Host "MISSING entries: $($missingAssets.Count)"

  if ($missingAssets.Count -gt 0) {
    Write-Host ""
    Write-Host "Missing ASSETS_TO_CACHE files:" -ForegroundColor Yellow
    $missingAssets | ForEach-Object { Write-Host " - $_" -ForegroundColor Yellow }
    Write-Host ""
    Write-Host "FAILED: Missing precache files can make service worker install fail." -ForegroundColor Red
    exit 1
  }
}
else {
  Write-Host "ASSETS_TO_CACHE validation skipped."
}

Write-Host "PASSED: PWA release guard completed."
exit 0
