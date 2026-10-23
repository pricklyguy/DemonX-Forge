<#
.SYNOPSIS
  Exercise the native immutable Windows updater with locally generated packages.
.DESCRIPTION
  Installs into a unique Temp directory, creates a local package archive from a verified build,
  checks the authenticated startup/pointer switch, then feeds a validly hashed package with a
  deliberately non-GUI executable to exercise health-check rollback. No GitHub release or user
  installation is touched. This tests staging and rollback after the app's release verifier;
  it does not substitute for a release signed by the configured owner minisign key.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string] $PackageDirectory,
  [ValidateRange(10, 300)][int] $HealthTimeoutSeconds = 30
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.IO.Compression.FileSystem
$package = (Resolve-Path -LiteralPath $PackageDirectory).Path
$installScript = Join-Path $PSScriptRoot 'install-windows.ps1'
$root = Join-Path $env:TEMP ('DemonXForgeUpdaterTest-' + [guid]::NewGuid().ToString('N'))
$testData = Join-Path $root 'test-user-data'
$userLocal = Join-Path $testData 'local'
$userRoaming = Join-Path $testData 'roaming'
$archives = Join-Path $root 'test-archives'
New-Item -ItemType Directory -Force -Path $userLocal, $userRoaming, $archives | Out-Null
$env:LOCALAPPDATA = $userLocal
$env:APPDATA = $userRoaming

function Assert([bool] $Condition, [string] $Message) {
  if (-not $Condition) { throw $Message }
}

function New-TestArchive([string] $ReleaseId, [bool] $BreakStartup) {
  $current = (Get-Content -LiteralPath (Join-Path $root 'current.txt') -Raw).Trim()
  $source = Join-Path (Join-Path $root 'versions') $current
  $directory = Join-Path $archives $ReleaseId
  New-Item -ItemType Directory -Path $directory | Out-Null
  Copy-Item -Path (Join-Path $source '*') -Destination $directory -Recurse
  if ($BreakStartup) {
    # This is a real PE executable but not the GUI app; it exits without opening the private
    # authenticated control socket, allowing the health failure/rollback path to be tested.
    Copy-Item -LiteralPath (Join-Path $source 'solidcraft-cli.exe') -Destination (Join-Path $directory 'DemonXForge.exe') -Force
  }
  $manifest = Get-Content -LiteralPath (Join-Path $directory 'manifest.json') -Raw | ConvertFrom-Json
  $manifest.releaseId = $ReleaseId
  $manifest.version = '0.19.0-test'
  $files = [ordered]@{}
  $prefix = [IO.Path]::GetFullPath($directory).TrimEnd('\') + '\'
  foreach ($file in Get-ChildItem -LiteralPath $directory -File -Recurse) {
    if ($file.Name -eq 'manifest.json') { continue }
    $relative = [IO.Path]::GetFullPath($file.FullName).Substring($prefix.Length).Replace('\', '/')
    $files[$relative] = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  }
  $manifest.files = $files
  $manifest | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $directory 'manifest.json') -Encoding utf8
  $archive = Join-Path $archives "$ReleaseId.zip"
  [IO.Compression.ZipFile]::CreateFromDirectory($directory, $archive, [IO.Compression.CompressionLevel]::Optimal, $false)
  return @{ Path = $archive; Sha256 = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() }
}

function Invoke-Updater([string] $Archive, [string] $Sha256, [bool] $NoRelaunch) {
  $current = (Get-Content -LiteralPath (Join-Path $root 'current.txt') -Raw).Trim()
  $helper = Join-Path (Join-Path (Join-Path $root 'versions') $current) 'forge-update-windows.ps1'
  $arguments = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', $helper,
    '-InstallRoot', $root, '-PackageArchive', $Archive, '-ExpectedPackageSha256', $Sha256,
    '-HealthTimeoutSeconds', [string]$HealthTimeoutSeconds)
  if ($NoRelaunch) { $arguments += '-NoRelaunchOnRollback' }
  $process = Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -Wait -PassThru -NoNewWindow
  return $process.ExitCode
}

try {
  & $installScript -PackageDirectory $package -InstallRoot $root -SkipShortcut -SkipAssociations
  $original = (Get-Content -LiteralPath (Join-Path $root 'current.txt') -Raw).Trim()
  $stableLauncher = Join-Path $root 'forge-mcp.exe'
  $stableLauncherHash = (Get-FileHash -LiteralPath $stableLauncher -Algorithm SHA256).Hash
  $nodeHash = (Get-FileHash -LiteralPath (Join-Path $root 'runtime\node.exe') -Algorithm SHA256).Hash
  $scriptSentinel = Join-Path $userLocal 'DemonX Forge\scripts\update-preserves-script.json'
  $settingsSentinel = Join-Path $userRoaming 'DemonX Forge\data\update-preserves-settings.json'
  New-Item -ItemType Directory -Force -Path (Split-Path $scriptSentinel), (Split-Path $settingsSentinel) | Out-Null
  Set-Content -LiteralPath $scriptSentinel -Value '{"preserved":true}' -Encoding utf8
  Set-Content -LiteralPath $settingsSentinel -Value 'preserved' -Encoding utf8

  $good = New-TestArchive ('local-success-' + [guid]::NewGuid().ToString('N')) $false
  $code = Invoke-Updater $good.Path $good.Sha256 $false
  Assert ($code -eq 0) "Locally generated successful update failed with exit code $code."
  $success = (Get-Content -LiteralPath (Join-Path $root 'current.txt') -Raw).Trim()
  Assert ($success -ne $original) 'Successful update did not change current.txt.'
  Assert ((Get-Content -LiteralPath (Join-Path $root 'previous.txt') -Raw).Trim() -eq $original) 'Successful update did not preserve the prior pointer.'
  Assert ((Get-FileHash -LiteralPath $stableLauncher -Algorithm SHA256).Hash -eq $stableLauncherHash) 'Update changed the stable MCP launcher.'
  Assert ((Get-FileHash -LiteralPath (Join-Path $root 'runtime\node.exe') -Algorithm SHA256).Hash -eq $nodeHash) 'Update changed the shared bundled Node runtime.'
  Assert (Test-Path -LiteralPath $scriptSentinel) 'Update lost the user scripts sentinel.'
  Assert (Test-Path -LiteralPath $settingsSentinel) 'Update lost the user settings sentinel.'
  Write-Host "Native updater success acceptance passed. Original: $original; active test release: $success; authenticated health and user-data preservation verified. App remains open for separate stable-MCP acceptance. Test root: $root"
} catch {
  Write-Error "Native updater acceptance failed. Test root retained at $root. $($_.Exception.Message)"
  throw
}
