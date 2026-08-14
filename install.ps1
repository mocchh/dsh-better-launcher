# dsh-better-launcher one-line installer (Windows PowerShell 5.1+ / pwsh)
#
#   irm https://raw.githubusercontent.com/mocchh/dsh-better-launcher/main/install.ps1 | iex
#
# Overrides (mirrors / intranet):
#   $env:DSH_LAUNCHER_VERSION  package version, default 1.0.0
#   $env:DSH_LAUNCHER_BASE     base URL hosting the tarball
$ErrorActionPreference = 'Stop'

$Version = if ($env:DSH_LAUNCHER_VERSION) { $env:DSH_LAUNCHER_VERSION } else { '1.0.0' }
$Base    = if ($env:DSH_LAUNCHER_BASE) { $env:DSH_LAUNCHER_BASE.TrimEnd('/') } else { 'https://raw.githubusercontent.com/mocchh/dsh-better-launcher/main' }

function Info($m) { Write-Host "dsh: $m" }
function Fail($m) { Write-Host "dsh: error: $m" -ForegroundColor Red; throw $m }

# Enable TLS 1.2 for Windows PowerShell 5.1
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { }

# Node.js >= 18
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Fail 'Node.js not found. Install Node.js >= 18 first: https://nodejs.org/' }
try {
  $maj = [int](node -p "process.versions.node.split('.')[0]")
  if ($maj -lt 18) { Fail "Node.js >= 18 required (found $(node --version))" }
} catch { Fail "cannot run node: $($_.Exception.Message)" }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Fail 'npm not found' }

# Download tarball
$tmp = Join-Path $env:TEMP "dsh-better-launcher-$Version.tgz"
Info "downloading dsh-better-launcher $Version ..."
try {
  Invoke-WebRequest -Uri "$Base/dsh-better-launcher-$Version.tgz" -OutFile $tmp -UseBasicParsing
} catch {
  Fail "download failed: $($_.Exception.Message)"
}

# Install globally
Info 'installing (npm install -g) ...'
npm install -g $tmp
if ($LASTEXITCODE -ne 0) {
  Remove-Item $tmp -Force -ErrorAction SilentlyContinue
  Fail 'npm install -g failed'
}
Remove-Item $tmp -Force -ErrorAction SilentlyContinue

# Report where the command landed
$dsh = Get-Command dsh -ErrorAction SilentlyContinue
Info 'done.'
Info "try: dsh status"
if ($dsh) { Info "command: $($dsh.Source)" } else { Info 'note: run in a new terminal if dsh is not on the current PATH' }
