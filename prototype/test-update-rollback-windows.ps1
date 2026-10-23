<# Run the failed-startup rollback half of the native updater acceptance against a Temp test install. #>
[CmdletBinding()]
param([Parameter(Mandatory = $true)][string] $InstallRoot, [ValidateRange(5, 120)][int] $HealthTimeoutSeconds = 15)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root = [IO.Path]::GetFullPath($InstallRoot).TrimEnd('\')
$tempPrefix = [IO.Path]::GetFullPath($env:TEMP).TrimEnd('\') + '\DemonXForgeUpdaterTest-'
if (-not $root.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Rollback acceptance may only run in a DemonXForgeUpdaterTest-* directory under Temp.' }
$currentPath = Join-Path $root 'current.txt'
$previousPath = Join-Path $root 'previous.txt'
$old = (Get-Content -LiteralPath $currentPath -Raw).Trim()
$priorPrevious = if (Test-Path -LiteralPath $previousPath) { (Get-Content -LiteralPath $previousPath -Raw).Trim() } else { '' }
$versionDir = Join-Path (Join-Path $root 'versions') $old
$apps = @(Get-Process -Name 'solidcraft' -ErrorAction SilentlyContinue | Where-Object {
  try { $_.Path -and $_.Path.StartsWith(($root + '\versions\'), [StringComparison]::OrdinalIgnoreCase) } catch { $false }
})
if ($apps.Count) { throw 'Close the temporary Forge window before testing startup rollback.' }
$archives = Join-Path $root 'test-archives'
New-Item -ItemType Directory -Force -Path $archives | Out-Null
$releaseId = 'local-failed-startup-' + [guid]::NewGuid().ToString('N')
$candidate = Join-Path $archives $releaseId
New-Item -ItemType Directory -Path $candidate | Out-Null
Copy-Item -Path (Join-Path $versionDir '*') -Destination $candidate -Recurse
# A valid executable which exits without opening Forge's authenticated control endpoint.
Copy-Item -LiteralPath (Join-Path $versionDir 'solidcraft-cli.exe') -Destination (Join-Path $candidate 'DemonXForge.exe') -Force
$manifest = Get-Content -LiteralPath (Join-Path $candidate 'manifest.json') -Raw | ConvertFrom-Json
$manifest.releaseId = $releaseId
$manifest.version = '0.19.0-test-failed-startup'
$files = [ordered]@{}
$prefix = [IO.Path]::GetFullPath($candidate).TrimEnd('\') + '\'
foreach ($file in Get-ChildItem -LiteralPath $candidate -File -Recurse) {
  if ($file.Name -eq 'manifest.json') { continue }
  $relative = [IO.Path]::GetFullPath($file.FullName).Substring($prefix.Length).Replace('\', '/')
  $files[$relative] = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
}
$manifest.files = $files
$manifest | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $candidate 'manifest.json') -Encoding utf8
$archive = Join-Path $archives "$releaseId.zip"
[IO.Compression.ZipFile]::CreateFromDirectory($candidate, $archive, [IO.Compression.CompressionLevel]::Optimal, $false)
$digest = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
$helper = Join-Path $versionDir 'forge-update-windows.ps1'
$args = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', $helper,
  '-InstallRoot', $root, '-PackageArchive', $archive, '-ExpectedPackageSha256', $digest,
  '-HealthTimeoutSeconds', [string]$HealthTimeoutSeconds, '-NoRelaunchOnRollback')
$wrongArgs = $args.Clone()
$digestIndex = [Array]::IndexOf($wrongArgs, '-ExpectedPackageSha256') + 1
$wrongArgs[$digestIndex] = '0' * 64
$wrongHashProcess = Start-Process -FilePath 'powershell.exe' -ArgumentList $wrongArgs -Wait -PassThru -NoNewWindow
if ($wrongHashProcess.ExitCode -eq 0) { throw 'The updater accepted a staged archive whose SHA-256 differed from the verified digest.' }
if ((Get-Content -LiteralPath $currentPath -Raw).Trim() -ne $old) { throw 'Digest mismatch changed current.txt.' }
$process = Start-Process -FilePath 'powershell.exe' -ArgumentList $args -Wait -PassThru -NoNewWindow
if ($process.ExitCode -eq 0) { throw 'The app without a healthy control endpoint was incorrectly accepted.' }
if ((Get-Content -LiteralPath $currentPath -Raw).Trim() -ne $old) { throw 'Startup failure did not restore current.txt to the prior release.' }
$restoredPrevious = if (Test-Path -LiteralPath $previousPath) { (Get-Content -LiteralPath $previousPath -Raw).Trim() } else { '' }
if ($restoredPrevious -ne $priorPrevious) { throw 'Startup failure did not restore the prior rollback pointer.' }
Write-Host "Digest mismatch was refused and startup health failure correctly rolled back to $old. Failed release retained at $releaseId; test root: $root"
