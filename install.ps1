# dsh-better-launcher one-line installer (Windows PowerShell 5.1+ / pwsh)
#
#   irm https://raw.githubusercontent.com/mocchh/dsh-better-launcher/main/install.ps1 | iex
#
# Overrides:
#   $env:DSH_LAUNCHER_VERSION  git ref (tag/branch/sha); default is the default branch
#   $env:DSH_LAUNCHER_REPO     GitHub repo, default mocchh/dsh-better-launcher
#   $env:DSH_LAUNCHER_BASE     if set, download dsh-better-launcher-<ver>.tgz from this URL
#   $env:DSH_LAUNCHER_SHA256   required for integrity when DSH_LAUNCHER_BASE is used
$ErrorActionPreference = 'Stop'

$Version = $env:DSH_LAUNCHER_VERSION
$Base    = if ($env:DSH_LAUNCHER_BASE) { $env:DSH_LAUNCHER_BASE.TrimEnd('/') } else { '' }
$Repo    = if ($env:DSH_LAUNCHER_REPO) { $env:DSH_LAUNCHER_REPO } else { 'mocchh/dsh-better-launcher' }

function Info($m) { Write-Host "dsh: $m" }
function Fail($m) { Write-Host "dsh: error: $m" -ForegroundColor Red; throw $m }

function Invoke-Npm {
  param([string[]]$NpmArgs)
  $npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if ($npmCmd) { & npm.cmd @NpmArgs } else { & npm @NpmArgs }
  return $LASTEXITCODE
}

try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { }

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Fail 'Node.js not found. Install Node.js ^22.19.0 or >=24 first: https://nodejs.org/' }
& node -e "const v=process.versions.node.split('.').map(Number); if(!(v[0]>=24||(v[0]===22&&v[1]>=19))) process.exit(1)"
if ($LASTEXITCODE -ne 0) { Fail "Node.js ^22.19.0 || >=24.0.0 required (found $(node --version))" }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Fail 'npm not found' }

if ($Base) {
  $vername = if ($Version) { $Version } else { '1.0.1' }
  $tmp = Join-Path $env:TEMP "dsh-better-launcher-$vername.tgz"
  $url = "$Base/dsh-better-launcher-$vername.tgz"
  Info "downloading $url ..."
  try {
    Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing
  } catch {
    Fail "download failed: $($_.Exception.Message)"
  }
  if (-not $env:DSH_LAUNCHER_SHA256) {
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    Fail 'DSH_LAUNCHER_BASE requires DSH_LAUNCHER_SHA256 to verify the tarball'
  }
  $actual = (Get-FileHash $tmp -Algorithm SHA256).Hash.ToLowerInvariant()
  $expected = $env:DSH_LAUNCHER_SHA256.ToLowerInvariant()
  if ($actual -ne $expected) {
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    Fail "sha256 mismatch (got $actual)"
  }
  Info 'installing (npm install -g) ...'
  $code = Invoke-Npm @('install', '-g', $tmp)
  Remove-Item $tmp -Force -ErrorAction SilentlyContinue
  if ($code -ne 0) { Fail 'npm install -g failed' }
} else {
  $spec = if ($Version) { "$Repo#$Version" } else { $Repo }
  Info "installing $spec (npm install -g) ..."
  $code = Invoke-Npm @('install', '-g', $spec)
  if ($code -ne 0) { Fail 'npm install -g failed' }
}

$dsh = Get-Command dsh -ErrorAction SilentlyContinue
Info 'done.'
Info 'try: dsh status'
if ($dsh) { Info "command: $($dsh.Source)" } else { Info 'note: run in a new terminal if dsh is not on the current PATH' }
