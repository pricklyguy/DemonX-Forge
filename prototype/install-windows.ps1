<# Install or upgrade a portable native Forge package without touching project or profile data. #>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string] $PackageDirectory,
  [string] $InstallRoot = 'C:\DemonX-Forge-Native',
  [switch] $SkipShortcut,
  [switch] $SkipAssociations
)
$ErrorActionPreference = 'Stop'
$package = (Resolve-Path -LiteralPath $PackageDirectory).Path
$manifestPath = Join-Path $package 'manifest.json'
if (-not (Test-Path $manifestPath)) { throw "Package manifest missing: $manifestPath" }
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.product -ne 'DemonX Forge' -or $manifest.architecture -ne 'x64' -or -not $manifest.releaseId) { throw 'Package manifest is not a supported DemonX Forge x64 release.' }
foreach ($name in $manifest.files.PSObject.Properties.Name) {
  if ([IO.Path]::IsPathRooted($name) -or $name -match '(^|[\\/])\.\.([\\/]|$)' -or $name -match '^\\') { throw "Unsafe package path in manifest: $name" }
  $file = Join-Path $package ($name.Replace('/', '\'))
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Package file missing: $name" }
  $actual = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $manifest.files.$name) { throw "Package integrity check failed: $name" }
}
foreach ($required in 'DemonXForge.exe', 'solidcraft-cli.exe', 'forge-mcp-native.mjs', 'forge-mcp.exe', 'runtime\node.exe', 'forge-update-windows.ps1', 'DemonX Forge.ico', 'LICENSE-GPL-3.0-or-later', 'LICENSE-MIT', 'LICENSE-APACHE', 'NOTICE', 'ATTRIBUTION.md', 'THIRD-PARTY-LICENSES.txt') {
  $manifestName = $required.Replace('\', '/')
  if ($manifestName -notin @($manifest.files.PSObject.Properties.Name)) { throw "Package is missing required file: $required" }
}

$root = [IO.Path]::GetFullPath($InstallRoot)
$versions = Join-Path $root 'versions'
$final = Join-Path $versions $manifest.releaseId
New-Item -ItemType Directory -Force -Path $versions | Out-Null
if (Test-Path -LiteralPath $final) {
  $installed = Get-Content -LiteralPath (Join-Path $final 'manifest.json') -Raw | ConvertFrom-Json
  if ($installed.forgeCommit -ne $manifest.forgeCommit -or $installed.solidcraftCommit -ne $manifest.solidcraftCommit) { throw "Release id collision: $final" }
} else {
  $staging = Join-Path $versions ('.staging-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $staging | Out-Null
  Copy-Item -Path (Join-Path $package '*') -Destination $staging -Recurse
  Move-Item -LiteralPath $staging -Destination $final
}

$launcher = @'
@echo off
setlocal
set "FORGE_ROOT=%~dp0"
set "DEMONX_FORGE_NATIVE_MANAGED=1"
set /p "FORGE_RELEASE=" < "%FORGE_ROOT%current.txt"
if not defined FORGE_RELEASE (
  echo DemonX Forge has no active release. Run install-windows.ps1 again.
  exit /b 2
)
set "FORGE_EXE=%FORGE_ROOT%versions\%FORGE_RELEASE%\DemonXForge.exe"
if not exist "%FORGE_EXE%" set "FORGE_EXE=%FORGE_ROOT%versions\%FORGE_RELEASE%\solidcraft.exe"
if not exist "%FORGE_EXE%" (
  echo The active DemonX Forge files are incomplete: "%FORGE_EXE%"
  exit /b 2
)
"%FORGE_EXE%" --forge-mcp %*
'@
Set-Content -LiteralPath (Join-Path $root 'DemonX Forge.cmd') -Value $launcher -Encoding ascii

Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'forge-mcp-launcher.mjs') -Destination (Join-Path $root 'forge-mcp-native.mjs')

# Stable MCP client entry point. The runtime is shared across versioned application folders and
# preserved by upgrades; it is installed atomically only when absent.
$runtimeRoot = Join-Path $root 'runtime'
New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
$stableNode = Join-Path $runtimeRoot 'node.exe'
if (-not (Test-Path -LiteralPath $stableNode)) {
  $runtimeStage = Join-Path $runtimeRoot ('.node-' + [guid]::NewGuid().ToString('N') + '.tmp')
  Copy-Item -LiteralPath (Join-Path $package 'runtime\node.exe') -Destination $runtimeStage
  Move-Item -LiteralPath $runtimeStage -Destination $stableNode
  $nodeLicense = Get-ChildItem -LiteralPath (Join-Path $package 'runtime') -Filter 'Node-LICENSE*' -File | Select-Object -First 1
  if ($nodeLicense) { Copy-Item -LiteralPath $nodeLicense.FullName -Destination (Join-Path $runtimeRoot $nodeLicense.Name) }
}
$stableMcpExe = Join-Path $root 'forge-mcp.exe'
$mcpStage = Join-Path $root ('.forge-mcp-' + [guid]::NewGuid().ToString('N') + '.tmp.exe')
Copy-Item -LiteralPath (Join-Path $package 'forge-mcp.exe') -Destination $mcpStage
if (Test-Path -LiteralPath $stableMcpExe) {
  # Replace the stable launcher atomically on upgrades so the version-independent MCP
  # entry point receives compatibility/security fixes with the native application.
  $mcpBackup = Join-Path $root 'forge-mcp.exe.previous'
  try { [IO.File]::Replace($mcpStage, $stableMcpExe, $mcpBackup, $true) }
  catch { Remove-Item -LiteralPath $mcpStage -Force -ErrorAction SilentlyContinue; throw "Could not atomically update the stable Forge MCP launcher: $_" }
} else { [IO.File]::Move($mcpStage, $stableMcpExe) }
$mcpCmd = @'
@echo off
setlocal
set "FORGE_ROOT=%~dp0"
if not exist "%FORGE_ROOT%runtime\node.exe" (
  echo DemonX Forge MCP runtime is missing. Repair the installation with install-windows.ps1.
  exit /b 2
)
"%FORGE_ROOT%runtime\node.exe" "%FORGE_ROOT%forge-mcp-native.mjs"
'@
Set-Content -LiteralPath (Join-Path $root 'forge-mcp.cmd') -Value $mcpCmd -Encoding ascii

function Write-AtomicPointer([string] $Path, [string] $Value) {
  $temp = "$Path.$([guid]::NewGuid().ToString('N')).tmp"
  [IO.File]::WriteAllText($temp, $Value + [Environment]::NewLine, [Text.Encoding]::ASCII)
  if (Test-Path -LiteralPath $Path) {
    $backup = "$Path.previous"
    [IO.File]::Replace($temp, $Path, $backup, $true)
  } else { [IO.File]::Move($temp, $Path) }
}
$currentPath = Join-Path $root 'current.txt'
if (Test-Path -LiteralPath $currentPath) {
  $previous = (Get-Content -LiteralPath $currentPath -Raw).Trim()
  if ($previous -and $previous -ne $manifest.releaseId) { Write-AtomicPointer (Join-Path $root 'previous.txt') $previous }
}
Write-AtomicPointer $currentPath $manifest.releaseId

if (-not $SkipShortcut) {
  $startMenu = Join-Path ([Environment]::GetFolderPath('Programs')) 'DemonX Forge'
  New-Item -ItemType Directory -Force -Path $startMenu | Out-Null
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut((Join-Path $startMenu 'DemonX Forge.lnk'))
  $shortcut.TargetPath = Join-Path $root 'DemonX Forge.cmd'
  $shortcut.WorkingDirectory = $root
  $shortcut.Description = 'DemonX Forge native parametric CAD'
  $shortcut.IconLocation = "$final\DemonX Forge.ico,0"
  $shortcut.Save()
}

if (-not $SkipAssociations) {
  # Register Forge projects for the current Windows user. Preserve any existing default handler
  # for .solidcraft; Forge is offered as an Open With choice for those files.
  $forgeProgId = 'DemonXForge.dxforge'
  $openCommand = '"' + (Join-Path $root 'DemonX Forge.cmd') + '" "%1"'
  $iconCommand = '"' + (Join-Path $final 'DemonX Forge.ico') + '",0'
  $forgeClass = "HKCU:\Software\Classes\$forgeProgId"
  New-Item -Path $forgeClass -Force | Out-Null
  Set-Item -Path $forgeClass -Value 'DemonX Forge Project'
  New-Item -Path (Join-Path $forgeClass 'DefaultIcon') -Force | Out-Null
  Set-Item -Path (Join-Path $forgeClass 'DefaultIcon') -Value $iconCommand
  New-Item -Path (Join-Path $forgeClass 'shell\open\command') -Force | Out-Null
  Set-Item -Path (Join-Path $forgeClass 'shell\open\command') -Value $openCommand
  $dxforgeClass = 'HKCU:\Software\Classes\.dxforge'
  New-Item -Path $dxforgeClass -Force | Out-Null
  Set-Item -Path $dxforgeClass -Value $forgeProgId
  New-Item -Path (Join-Path $dxforgeClass 'OpenWithProgids') -Force | Out-Null
  New-ItemProperty -Path (Join-Path $dxforgeClass 'OpenWithProgids') -Name $forgeProgId -Value '' -PropertyType String -Force | Out-Null
  foreach ($compatibleExtension in '.solidcraft', '.solvecraft') {
    $compatibilityKey = "HKCU:\Software\Classes\$compatibleExtension"
    New-Item -Path $compatibilityKey -Force | Out-Null
    New-Item -Path (Join-Path $compatibilityKey 'OpenWithProgids') -Force | Out-Null
    New-ItemProperty -Path (Join-Path $compatibilityKey 'OpenWithProgids') -Name $forgeProgId -Value '' -PropertyType String -Force | Out-Null
  }
}

Write-Host "Installed DemonX Forge $($manifest.version) in $root"
Write-Host "Launch: $root\DemonX Forge.cmd (or Start menu: DemonX Forge)"
if (-not $SkipAssociations) { Write-Host 'Windows opens .dxforge projects with Forge; .solidcraft and .solvecraft remain available through Open With.' }
Write-Host 'Projects and settings use persistent per-user paths: %APPDATA%\DemonX Forge and %LOCALAPPDATA%\DemonX Forge.'
Write-Host "Previous release retained: $(Join-Path $root 'previous.txt') (if this was an upgrade)."
