# Clan Hall installer — no AI needed after this.
# Right-click → Run with PowerShell
# or:  irm https://raw.githubusercontent.com/AIWander/sister-clan-rs3-tracker/main/install.ps1 | iex

$ErrorActionPreference = "Stop"
$zipUrl = "https://github.com/AIWander/sister-clan-rs3-tracker/archive/refs/heads/main.zip"
$dest = Join-Path $env:USERPROFILE "Documents\sister-clan-rs3-tracker"

Write-Host ""
Write-Host "Clan Hall — sister-clan-rs3-tracker"
Write-Host "Not an official Jagex product. Officers still rank in-game by hand."
Write-Host ""

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Host "Node.js is not installed."
  Write-Host "1. Open https://nodejs.org"
  Write-Host "2. Download the LTS installer (big green button)."
  Write-Host "3. Install it, then run this script again."
  Start-Process "https://nodejs.org"
  Read-Host "Press Enter to close"
  exit 1
}

Write-Host "Downloading from GitHub..."
$tmp = Join-Path $env:TEMP "sister-clan-rs3-tracker.zip"
$extract = Join-Path $env:TEMP "sister-clan-rs3-tracker-extract"
Invoke-WebRequest -Uri $zipUrl -OutFile $tmp -UseBasicParsing
if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
Expand-Archive -Path $tmp -DestinationPath $extract -Force

$inner = Get-ChildItem $extract -Directory | Select-Object -First 1
if (-not $inner) { throw "Zip was empty." }

New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item -Path (Join-Path $inner.FullName "*") -Destination $dest -Recurse -Force

Write-Host "Installed to $dest"
Write-Host ""
Write-Host "Next: create the Discord application (see START-HERE.txt),"
Write-Host "then double-click setup.bat in that folder."
Write-Host ""

Start-Process notepad (Join-Path $dest "START-HERE.txt")
Start-Process explorer $dest
Read-Host "Press Enter to close"
