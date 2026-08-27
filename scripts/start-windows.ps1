param(
  [switch]$SkipFirewall,
  [switch]$FirewallConfigured
)

$ErrorActionPreference = "Stop"

# Resolve paths from the repository root so the launcher works from any directory.
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Ensure-Dependencies {
  if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
    throw "Node.js is required. Install Node.js 18+ and run this launcher again."
  }
  if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    throw "npm is required but was not found. Reinstall Node.js and run this launcher again."
  }
  if (-not (Test-Path (Join-Path $projectRoot "package-lock.json"))) {
    throw "package-lock.json was not found in $projectRoot."
  }
  $vitePackage = Join-Path $projectRoot "node_modules\vite\package.json"
  $viteShim = Join-Path $projectRoot "node_modules\.bin\vite.cmd"
  if (-not (Test-Path $vitePackage) -or -not (Test-Path $viteShim)) {
    Write-Host "Dependencies are not installed. Running npm ci (first run)..."
    & npm.cmd ci --prefix $projectRoot
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed with exit code $LASTEXITCODE." }
    Write-Host "Dependencies installed."
  }
}

function Ensure-PhoneTwinFirewall {
  if ($SkipFirewall) {
    Write-Host "Skipping Windows Defender Firewall configuration."
    return
  }

  if (-not (Test-IsAdministrator) -and -not $FirewallConfigured) {
    Write-Host "Administrator permission is required once to allow LAN connections."
    Write-Host "A Windows UAC prompt will appear. Approve it, then this launcher will continue."
    $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -FirewallConfigured"
    $elevated = Start-Process powershell.exe -Verb RunAs -ArgumentList $arguments -Wait -PassThru
    if ($elevated.ExitCode -ne 0) {
      Write-Warning "Firewall setup was not completed (UAC cancelled or setup failed)."
      Write-Host "You can run with -SkipFirewall, but iPhone LAN connections may be blocked."
    }
    return
  }

  $ruleName = "PhoneTwin Studio LAN"
  try {
    $existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
    if (-not $existing) {
      New-NetFirewallRule -DisplayName $ruleName `
        -Direction Inbound -Action Allow -Protocol TCP `
        -LocalPort 5173,8787,8788 -Profile Private | Out-Null
      Write-Host "Windows Defender Firewall: allowed TCP 5173, 8787, 8788 on Private networks."
    } else {
      Write-Host "Windows Defender Firewall: PhoneTwin Studio LAN rule already exists."
    }
  } catch {
    Write-Warning "Unable to configure Windows Defender Firewall: $($_.Exception.Message)"
    Write-Host "Continue without the rule; iPhone LAN access may require manual firewall approval."
  }
}

Write-Host "PhoneTwin Studio Windows launcher"
Ensure-Dependencies
Ensure-PhoneTwinFirewall

$env:PHONETWIN_HTTP = "1"
$lanIp = Get-NetIPAddress -AddressFamily IPv4 -PrefixOrigin Dhcp -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
  Select-Object -First 1 -ExpandProperty IPAddress
if (-not $lanIp) { $lanIp = "<WINDOWS_IP>" }

Write-Host ""
Write-Host "Open the workbench at: http://localhost:5173"
Write-Host "Set iPhone Sender endpoint to: ws://$lanIp`:8788/native"
Write-Host "Firewall scope: Private networks only (TCP 5173, 8787, 8788)."
Write-Host ""

$viteCommand = Join-Path $projectRoot "node_modules\.bin\vite.cmd"
if (Test-Path $viteCommand) {
  & $viteCommand --host 0.0.0.0 --port 5173
} else {
  $viteEntry = Join-Path $projectRoot "node_modules\vite\bin\vite.js"
  if (-not (Test-Path $viteEntry)) {
    throw "Vite is not installed. Run 'npm ci' from $projectRoot first."
  }
  Write-Host "Local Vite shim not found; starting Vite through its bundled CLI."
  & node.exe $viteEntry --host 0.0.0.0 --port 5173
}
