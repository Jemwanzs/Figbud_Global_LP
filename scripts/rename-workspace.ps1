<#
.SYNOPSIS
  Renames the project folder ZiraHR_LP -> FigBud_Global_LP safely.

.DESCRIPTION
  Windows locks a folder while an editor or terminal has it open, so this must
  run with VS Code closed (or from a terminal outside the folder). It refuses to
  overwrite an existing target and moves nothing else.

  Usage (from any PowerShell window, VS Code closed):
    powershell -ExecutionPolicy Bypass -File "C:\Users\James Bright\DeVops\ZiraHR_LP\scripts\rename-workspace.ps1"
#>
$ErrorActionPreference = "Stop"
$parent = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$source = $parent
$target = Join-Path (Split-Path -Parent $parent) "FigBud_Global_LP"

if ((Split-Path -Leaf $source) -ne "ZiraHR_LP") {
  Write-Host "Already renamed (current folder: $source). Nothing to do."
  exit 0
}
if (Test-Path $target) {
  throw "Target already exists: $target. Not overwriting."
}

Set-Location (Split-Path -Parent $source)
docker compose -f (Join-Path $source "infra\docker-compose.yml") stop 2>$null | Out-Null
Rename-Item -LiteralPath $source -NewName "FigBud_Global_LP"
Write-Host "Renamed to $target"
Write-Host "Reopen it with: code `"$target`""
