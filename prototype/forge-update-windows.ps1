<#
.SYNOPSIS
  Stage and health-check a previously signature-verified native Forge package.
.DESCRIPTION
  This helper is launched by the app only after the native updater has verified the release's
  SHA256SUMS.txt and minisign signature. It performs manifest validation again after extraction,
  switches immutable version pointers atomically, and restores the previous pointer if the new app
  does not expose its authenticated loopback control endpoint.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string] $InstallRoot,
  [Parameter(Mandatory = $true)][string] $PackageArchive,
  [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-fA-F]{64}$')][string] $ExpectedPackageSha256,
  [ValidateRange(5, 300)][int] $HealthTimeoutSeconds = 60,
  [switch] $NoRelaunchOnRollback
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Write-AtomicText([string] $Path, [string] $Value) {
  $temp = "$Path.$([guid]::NewGuid().ToString('N')).tmp"
  [IO.File]::WriteAllText($temp, $Value + [Environment]::NewLine, [Text.Encoding]::ASCII)
  if (Test-Path -LiteralPath $Path) {
    $backup = "$Path.atomic-backup"
    if (Test-Path -LiteralPath $backup) { Remove-Item -LiteralPath $backup -Force }
    [IO.File]::Replace($temp, $Path, $backup, $true)
    Remove-Item -LiteralPath $backup -Force
  } else {
    [IO.File]::Move($temp, $Path)
  }
}

function Test-ControlHealth([string] $ControlDir, [DateTime] $StartedUtc) {
  if (-not (Test-Path -LiteralPath $ControlDir -PathType Container)) { return $false }
  foreach ($tokenFile in Get-ChildItem -LiteralPath $ControlDir -Filter '*.token' -File -ErrorAction SilentlyContinue) {
    if ($tokenFile.LastWriteTimeUtc -lt $StartedUtc) { continue }
    if ($tokenFile.Name -notmatch '^([0-9]{1,5})\.token$' -or $tokenFile.Length -gt 4096) { continue }
    $port = [int]$Matches[1]
    if ($port -lt 1 -or $port -gt 65535) { continue }
    $token = (Get-Content -LiteralPath $tokenFile.FullName -Raw).Trim()
    if ($token.Length -lt 32) { continue }
    $client = [Net.Sockets.TcpClient]::new()
    try {
      $connect = $client.ConnectAsync('127.0.0.1', $port)
      if (-not $connect.Wait(1000)) { continue }
      $stream = $client.GetStream()
      $stream.ReadTimeout = 1500
      $stream.WriteTimeout = 1500
      $request = @{ id = 1; method = 'ui.inspect'; params = @{}; token = $token } | ConvertTo-Json -Compress
      $bytes = [Text.Encoding]::UTF8.GetBytes($request + "`n")
      $stream.Write($bytes, 0, $bytes.Length)
      $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::UTF8, $false, 1024, $true)
      $reply = $reader.ReadLine() | ConvertFrom-Json
      if ($reply.ok -eq $true -and $reply.id -eq 1) { return $true }
    } catch {
      # A stale token file, another local service, or a startup race is not a healthy app.
    } finally {
      $client.Dispose()
    }
  }
  return $false
}

$root = [IO.Path]::GetFullPath($InstallRoot).TrimEnd('\')
$archive = (Resolve-Path -LiteralPath $PackageArchive).Path
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $ExpectedPackageSha256) { throw 'Staged native update package no longer matches the verified SHA-256 digest.' }
$versions = Join-Path $root 'versions'
$currentFile = Join-Path $root 'current.txt'
$previousFile = Join-Path $root 'previous.txt'
if (-not (Test-Path -LiteralPath $currentFile -PathType Leaf)) { throw 'No current native Forge release pointer exists.' }
$runningApps = @(Get-Process -Name @('DemonXForge', 'solidcraft') -ErrorAction SilentlyContinue | Where-Object {
  try { $_.Path -and $_.Path.StartsWith(($root.TrimEnd('\') + '\versions\'), [StringComparison]::OrdinalIgnoreCase) } catch { $false }
})
if ($runningApps.Count -gt 0) { throw 'Close every DemonX Forge window before applying the staged update.' }
$oldRelease = (Get-Content -LiteralPath $currentFile -Raw).Trim()
$originalPrevious = if (Test-Path -LiteralPath $previousFile -PathType Leaf) { (Get-Content -LiteralPath $previousFile -Raw).Trim() } else { '' }
if ($oldRelease -notmatch '^[A-Za-z0-9._-]{1,120}$') { throw 'Current release pointer contains an invalid version id.' }
$oldDirectory = Join-Path $versions $oldRelease
$oldExe = Join-Path $oldDirectory 'DemonXForge.exe'
if (-not (Test-Path -LiteralPath $oldExe -PathType Leaf)) { $oldExe = Join-Path $oldDirectory 'solidcraft.exe' }
if (-not (Test-Path -LiteralPath $oldExe -PathType Leaf)) { throw "Current release is incomplete: $oldRelease" }

$staging = Join-Path $versions ('.staging-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $staging | Out-Null
$zip = [IO.Compression.ZipFile]::OpenRead($archive)
$extractedFiles = [Collections.Generic.List[string]]::new()
try {
  $total = [int64]0
  foreach ($entry in $zip.Entries) {
    $name = $entry.FullName.Replace('\', '/')
    if (-not $name -or $name.StartsWith('/') -or $name.Contains(':') -or $name -match '^[A-Za-z]:' -or $name -match '(^|/)\.\.(/|$)' -or $name.Contains([char]0)) {
      throw "Unsafe path in native Forge archive: $($entry.FullName)"
    }
    if (($entry.ExternalAttributes -band 0xF000) -eq 0xA000) { throw "Symbolic links are not allowed in native packages: $name" }
    if ($entry.Length -gt 1GB) { throw "Package entry is too large: $name" }
    $total += $entry.Length
    if ($total -gt 3GB) { throw 'Native package expands beyond the 3 GiB safety limit.' }
    $target = [IO.Path]::GetFullPath((Join-Path $staging ($name.Replace('/', '\'))))
    $prefix = $staging.TrimEnd('\') + '\'
    if (-not $target.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw "Package path escaped staging directory: $name" }
    if ($name.EndsWith('/')) {
      New-Item -ItemType Directory -Force -Path $target | Out-Null
      continue
    }
    $extractedFiles.Add($name)
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
    [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $false)
  }
} finally { $zip.Dispose() }

$manifestPath = Join-Path $staging 'manifest.json'
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw 'Native package manifest is missing.' }
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.product -ne 'DemonX Forge' -or $manifest.architecture -ne 'x64' -or $manifest.releaseId -notmatch '^[A-Za-z0-9._-]{1,120}$') {
  throw 'Native package manifest has an unsupported product, architecture, or release id.'
}
if ($manifest.releaseId -eq $oldRelease) { throw "Native package is already installed: $oldRelease" }
foreach ($property in $manifest.files.PSObject.Properties) {
  $relative = $property.Name.Replace('/', '\')
  if ([IO.Path]::IsPathRooted($relative) -or $relative.Contains(':') -or $relative -match '(^|[\\/])\.\.([\\/]|$)' -or $relative -match '^[A-Za-z]:') { throw "Unsafe manifest path: $($property.Name)" }
  $file = Join-Path $staging $relative
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Package manifest file is missing: $($property.Name)" }
  $actual = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne [string]$property.Value) { throw "Extracted package integrity check failed: $($property.Name)" }
}
$expectedFiles = @($manifest.files.PSObject.Properties.Name) + 'manifest.json'
$expectedFiles = @($expectedFiles | ForEach-Object { $_.Replace('\', '/') } | Sort-Object -Unique)
$actualFiles = @($extractedFiles | Sort-Object -Unique)
if (Compare-Object -ReferenceObject $expectedFiles -DifferenceObject $actualFiles) { throw 'The archive contains files that are missing from or absent in its package manifest.' }
foreach ($required in 'DemonXForge.exe', 'forge-mcp-native.mjs', 'forge-mcp.exe', 'runtime\node.exe') {
  if ($required.Replace('\', '/') -notin @($manifest.files.PSObject.Properties.Name)) { throw "Native package is missing required file: $required" }
}

$releaseDirectory = Join-Path $versions $manifest.releaseId
if (Test-Path -LiteralPath $releaseDirectory) { throw "Immutable release directory already exists: $($manifest.releaseId)" }
Move-Item -LiteralPath $staging -Destination $releaseDirectory
$newPointerWritten = $false
$previousPointerWritten = $false
$newProcess = $null
try {
  Write-AtomicText $previousFile $oldRelease
  $previousPointerWritten = $true
  Write-AtomicText $currentFile $manifest.releaseId
  $newPointerWritten = $true
  $env:DEMONX_FORGE_NATIVE_MANAGED = '1'
  $newExe = Join-Path $releaseDirectory 'DemonXForge.exe'
  $healthStartedUtc = [DateTime]::UtcNow
  $newProcess = Start-Process -FilePath $newExe -ArgumentList @('--forge-mcp') -WorkingDirectory $releaseDirectory -PassThru
  $controlDir = Join-Path $env:LOCALAPPDATA 'DemonX Forge\control'
  $deadline = [DateTime]::UtcNow.AddSeconds($HealthTimeoutSeconds)
  $healthy = $false
  while ([DateTime]::UtcNow -lt $deadline) {
    if ($newProcess.HasExited) { break }
    if (Test-ControlHealth $controlDir $healthStartedUtc) { $healthy = $true; break }
    Start-Sleep -Milliseconds 250
    $newProcess.Refresh()
  }
  if (-not $healthy) { throw 'The updated Forge process did not pass its authenticated control-channel startup check.' }
  if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
  Write-Host "Updated DemonX Forge to $($manifest.version). Previous release $oldRelease remains available for rollback."
} catch {
  if ($newProcess -and -not $newProcess.HasExited) { Stop-Process -Id $newProcess.Id -Force -ErrorAction SilentlyContinue }
  if ($newPointerWritten) {
    Write-AtomicText $currentFile $oldRelease
  }
  if ($previousPointerWritten) {
    if ($originalPrevious) { Write-AtomicText $previousFile $originalPrevious }
    elseif (Test-Path -LiteralPath $previousFile) { Remove-Item -LiteralPath $previousFile -Force }
  }
  if (-not $NoRelaunchOnRollback) {
    $env:DEMONX_FORGE_NATIVE_MANAGED = '1'
    Start-Process -FilePath $oldExe -ArgumentList @('--forge-mcp') -WorkingDirectory $oldDirectory | Out-Null
  }
  throw "Native update rolled back to ${oldRelease}: $($_.Exception.Message)"
} finally {
  if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
}
