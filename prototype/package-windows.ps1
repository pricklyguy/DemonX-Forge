<#
.SYNOPSIS
  Build a pinned, branded native DemonX Forge Windows package.
.DESCRIPTION
  Builds only from the pinned SolidCraft submodule in a stable isolated clone, applies the
  Forge-owned overlay, and emits a portable package suitable for install-windows.ps1.
  Existing Forge and SolidCraft checkouts are never modified.
#>
[CmdletBinding()]
param(
  [ValidateSet('x64')][string] $Arch = 'x64',
  [string] $OutputDirectory = (Join-Path $PSScriptRoot 'dist-windows'),
  [string] $VsDevCmdPath = 'C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\Tools\VsDevCmd.bat',
  [string] $BuildSource,
  [string] $BuildTargetDirectory
)
$ErrorActionPreference = 'Stop'
$Repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Pinned = '75261cd79733fe47cf898b54f865e6bfaffa1129'
$Submodule = Join-Path $PSScriptRoot 'solidcraft'
$isolatedBuildSource = Join-Path $env:TEMP "DemonXForgeBuild\source-$Pinned"

function Invoke-Checked([string] $Label, [scriptblock] $Command) {
  Write-Host "==> $Label"
  & $Command
  if ($LASTEXITCODE -ne 0) { throw "$Label failed with exit code $LASTEXITCODE" }
}

foreach ($tool in 'git', 'node', 'npm.cmd') {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "Required build tool is missing from PATH: $tool" }
}
$cargoBin = Join-Path $env:USERPROFILE '.cargo\bin'
foreach ($tool in 'cargo.exe', 'rustup.exe') { if (-not (Test-Path (Join-Path $cargoBin $tool))) { throw "Rust toolchain command is missing: $(Join-Path $cargoBin $tool)" } }
$env:PATH = "$cargoBin;$env:PATH"
if (-not (Test-Path $Submodule)) { throw "Pinned source submodule is missing: $Submodule" }
if (-not (Test-Path $VsDevCmdPath)) { throw "Visual Studio MSVC environment script not found: $VsDevCmdPath" }

$sourceHead = (& git -C $Submodule rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $sourceHead -ne $Pinned) { throw "SolidCraft submodule must be at pinned commit $Pinned (found $sourceHead)." }
$shouldPrepareBuildClone = -not $BuildSource
if ($shouldPrepareBuildClone) { $BuildSource = $isolatedBuildSource }
if ($shouldPrepareBuildClone -and -not (Test-Path $BuildSource)) {
  New-Item -ItemType Directory -Force -Path (Split-Path $BuildSource) | Out-Null
  Invoke-Checked 'Create isolated pinned source clone' { git clone --shared --no-checkout $Submodule $BuildSource }
  Invoke-Checked 'Check out pinned SolidCraft source' { git -C $BuildSource checkout --detach $Pinned }
  Invoke-Checked 'Initialize pinned upstream submodules' { git -C $BuildSource submodule update --init --recursive }
}
if (-not (Test-Path $BuildSource)) { throw "Build source does not exist: $BuildSource" }
$BuildSource = (Resolve-Path -LiteralPath $BuildSource).Path
$buildHead = (& git -C $BuildSource rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $buildHead -ne $Pinned) { throw "Build source is not the pinned commit: $BuildSource" }

Invoke-Checked 'Apply DemonX Forge source overlay' { node (Join-Path $PSScriptRoot 'apply-overlay.mjs') $BuildSource }
Invoke-Checked 'Verify branding, theme tokens, app data, and overlay anchors' { node (Join-Path $PSScriptRoot 'verify-overlay.mjs') $BuildSource }

$nodeModules = Join-Path $Repo 'node_modules'
if (-not (Test-Path (Join-Path $nodeModules 'esbuild'))) {
  Invoke-Checked 'Install locked Forge MCP build dependencies' { npm.cmd ci --prefix $Repo }
}
$output = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force -Path $output | Out-Null
$stage = Join-Path $output ('.package-staging-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage | Out-Null

$target = 'x86_64-pc-windows-msvc'
$targetDir = if ($BuildTargetDirectory) { [IO.Path]::GetFullPath($BuildTargetDirectory) } else { Join-Path $BuildSource 'target' }
$releaseDir = Join-Path $targetDir 'release'
$cmdFile = Join-Path $env:TEMP "demonx-forge-build-$([guid]::NewGuid().ToString('N')).cmd"
$logFile = Join-Path $output 'build-windows.log'
$script = @"
@echo off
call "$VsDevCmdPath" -arch=amd64 -host_arch=amd64
if errorlevel 1 exit /b %errorlevel%
set PATH=$cargoBin;%PATH%
set CARGO_TARGET_DIR=$targetDir
set CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_RUSTFLAGS=-C target-feature=+crt-static
cd /d "$BuildSource"
rustc -vV | findstr /c:"host: x86_64-pc-windows-msvc" >nul
if errorlevel 1 (echo This package recipe requires the x86_64-pc-windows-msvc host toolchain. & exit /b 1)
cargo build --release --locked -p solidcraft -p solidcraft-cli
exit /b %errorlevel%
"@
Set-Content -Path $cmdFile -Value $script -Encoding ascii
try {
  Write-Host '==> Build native app and CLI with MSVC'
  & cmd.exe /d /c $cmdFile *> $logFile
  if ($LASTEXITCODE -ne 0) { Get-Content $logFile -Tail 100; throw "Cargo build failed with exit code $LASTEXITCODE. Full log: $logFile" }
} finally { Remove-Item -LiteralPath $cmdFile -ErrorAction SilentlyContinue }

function Get-PeHeader([string] $Path) {
  $bytes = [IO.File]::ReadAllBytes($Path)
  $pe = [BitConverter]::ToInt32($bytes, 0x3C)
  return @{ Machine = [BitConverter]::ToUInt16($bytes, $pe + 4); Subsystem = [BitConverter]::ToUInt16($bytes, $pe + 0x5C) }
}
foreach ($file in 'solidcraft.exe', 'solidcraft-cli.exe', 'solvecraft-cli.exe') {
  $binary = Join-Path $releaseDir $file
  if (-not (Test-Path $binary)) { throw "Cargo did not produce expected package file: $file" }
  $header = Get-PeHeader $binary
  if ($header.Machine -ne 0x8664) { throw "$file is not a Windows x64 binary." }
  $expectedSubsystem = if ($file -eq 'solidcraft.exe') { 2 } else { 3 }
  if ($header.Subsystem -ne $expectedSubsystem) { throw "$file has PE subsystem $($header.Subsystem); expected $expectedSubsystem." }
  Copy-Item -LiteralPath $binary -Destination $stage
}
foreach ($file in 'LICENSE-MIT', 'LICENSE-APACHE', 'NOTICE', 'THIRD-PARTY-LICENSES.txt', 'README.md') { Copy-Item -LiteralPath (Join-Path $BuildSource $file) -Destination $stage }
Copy-Item -LiteralPath (Join-Path $Repo 'LICENSE') -Destination (Join-Path $stage 'LICENSE-GPL-3.0-or-later')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'branding\demonx-forge-wordmark.png') -Destination $stage
Invoke-Checked 'Bundle the existing nine-tool Forge MCP compatibility bridge' {
  Push-Location $Repo
  try { node (Join-Path $PSScriptRoot 'build-mcp-native.mjs') (Join-Path $stage 'forge-mcp-native.mjs') }
  finally { Pop-Location }
}

Add-Type -AssemblyName System.Drawing
$sourceIcon = [System.Drawing.Image]::FromFile((Join-Path $Repo 'web\public\forge-mark.png'))
$iconBitmap = New-Object System.Drawing.Bitmap 64, 64
$iconGraphics = [System.Drawing.Graphics]::FromImage($iconBitmap)
try {
  $iconGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $iconGraphics.DrawImage($sourceIcon, 0, 0, 64, 64)
  $nativeIcon = [System.Drawing.Icon]::FromHandle($iconBitmap.GetHicon())
  $iconStream = [IO.File]::Create((Join-Path $stage 'DemonX Forge.ico'))
  try { $nativeIcon.Save($iconStream) } finally { $iconStream.Dispose(); $nativeIcon.Dispose() }
} finally { $iconGraphics.Dispose(); $iconBitmap.Dispose(); $sourceIcon.Dispose() }

@'
DemonX Forge native Windows package

Install or update from the Forge checkout:
  powershell -ExecutionPolicy Bypass -File prototype\install-windows.ps1 -PackageDirectory <this-folder>

Launch from Start > DemonX Forge, or run C:\DemonX-Forge-Native\DemonX Forge.cmd.
The launch script accepts normal app arguments, including --safe-mode. It starts the authenticated
loopback MCP control listener on a dynamically assigned port; the stable MCP bridge discovers the
private token file and port securely. A caller-supplied --control PORT overrides that default.

Projects are saved as native .solidcraft documents. The app keeps settings in %APPDATA%\DemonX Forge\data
and autosave/recovery/MCP token data in %LOCALAPPDATA%\DemonX Forge. These paths are stable between
version folders. The installer retains prior binaries; run prototype\rollback-windows.ps1 from the
Forge checkout to restore the previous version. Do not delete either user-data folder while designs
need recovery.

The stable `C:\DemonX-Forge-Native\forge-mcp-native.mjs` launcher follows `current.txt` across
upgrades and runs the existing Forge nine-tool compatibility bridge for that version. Configure a
local MCP client with command `C:\Program Files\nodejs\node.exe` and args
`["C:\\DemonX-Forge-Native\\forge-mcp-native.mjs"]`; no port or token environment variable is
needed. The app must be open. The bridge reads only the private per-user token files in Forge's
control directory, authenticates to loopback, and reports a launch instruction if no endpoint is
available. Do not copy the token into client configuration. Filesystem scopes and unsafe-command
refusals are unchanged.

This package preserves SolidCraft MIT/Apache and third-party notices. The Forge bridge is covered
by the included GNU GPL-3.0-or-later license.
'@ | Set-Content -LiteralPath (Join-Path $stage 'INSTALL.txt') -Encoding utf8

$forgeCommit = (& git -C $Repo rev-parse HEAD).Trim()
$forgeCommitTime = (& git -C $Repo show -s --format=%cI $forgeCommit).Trim()
$cargoVersion = [regex]::Match((Get-Content -Raw -LiteralPath (Join-Path $BuildSource 'Cargo.toml')), '(?ms)^\[workspace\.package\].*?^version\s*=\s*"([^"]+)"').Groups[1].Value
$releaseId = "${cargoVersion}-forge-$($forgeCommit.Substring(0,12))-engine-$($Pinned.Substring(0,12))"
$manifest = [ordered]@{
  product = 'DemonX Forge'
  version = $cargoVersion
  releaseId = $releaseId
  architecture = $Arch
  forgeCommit = $forgeCommit
  solidcraftCommit = $Pinned
  sourceCommitTime = $forgeCommitTime
  files = @{}
}
foreach ($file in Get-ChildItem -LiteralPath $stage -File) {
  if ($file.Name -ne 'manifest.json') { $manifest.files[$file.Name] = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
}
$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $stage 'manifest.json') -Encoding utf8
$package = Join-Path $output $releaseId
if (Test-Path $package) { throw "Package already exists; preserve it and choose another output folder: $package" }
Move-Item -LiteralPath $stage -Destination $package
$zip = "$package.zip"
Compress-Archive -Path (Join-Path $package '*') -DestinationPath $zip
Write-Host "Built DemonX Forge $releaseId"
Write-Host "Package: $package"
Write-Host "Archive: $zip"
Write-Host "Build log: $logFile"
