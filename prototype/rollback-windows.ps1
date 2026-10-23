<# Restore the previous native release pointer. Version folders and user data are retained. #>
[CmdletBinding()]
param([string] $InstallRoot = 'C:\DemonX-Forge-Native')
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath($InstallRoot)
$currentPath = Join-Path $root 'current.txt'
$previousPath = Join-Path $root 'previous.txt'
if (-not (Test-Path -LiteralPath $currentPath) -or -not (Test-Path -LiteralPath $previousPath)) { throw 'No rollback release is recorded.' }
$current = (Get-Content -LiteralPath $currentPath -Raw).Trim()
$previous = (Get-Content -LiteralPath $previousPath -Raw).Trim()
if (-not $previous) { throw 'Previous release is missing or incomplete.' }
$previousDirectory = Join-Path (Join-Path $root 'versions') $previous
if (-not (Test-Path -LiteralPath (Join-Path $previousDirectory 'DemonXForge.exe')) -and -not (Test-Path -LiteralPath (Join-Path $previousDirectory 'solidcraft.exe'))) { throw "Previous release is missing or incomplete: $previous" }
$temp = "$currentPath.$([guid]::NewGuid().ToString('N')).tmp"
[IO.File]::WriteAllText($temp, $previous + [Environment]::NewLine, [Text.Encoding]::ASCII)
[IO.File]::Replace($temp, $currentPath, "$currentPath.rollback", $true)
[IO.File]::WriteAllText($previousPath, $current + [Environment]::NewLine, [Text.Encoding]::ASCII)
Write-Host "Rolled back DemonX Forge from $current to $previous. Projects and settings were not changed."
