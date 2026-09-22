/**
 * Kopierbare Installationsskripte mit Server-URL und Enrollment-Key.
 */
export function windowsAgentInstallScript(origin: string, key: string): string {
  const server = origin.replace(/\/$/, "");
  const psServer = psSingle(server);
  const psKey = psSingle(key);
  return `# Systemhaus-Ess Agent – PowerShell als Administrator
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}
$admin = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $admin.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Error 'Bitte PowerShell als Administrator starten.'
  exit 1
}
$Server = ${psServer}
$Key = ${psKey}
$Dir = Join-Path $env:ProgramData 'SystemhausEss'
New-Item -ItemType Directory -Force -Path $Dir | Out-Null
$Exe = Join-Path $Dir 'systemhaus-agent.exe'
$svc = Get-Service SystemhausAgent -ErrorAction SilentlyContinue
if ($svc) {
  Stop-Service SystemhausAgent -Force -ErrorAction SilentlyContinue
  sc.exe stop SystemhausAgent | Out-Null
  for ($i = 0; $i -lt 20; $i++) {
    $svc.Refresh()
    if ($svc.Status -eq 'Stopped') { break }
    Start-Sleep -Seconds 1
  }
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -eq 'systemhaus-agent.exe' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 1
}
$EscKey = [uri]::EscapeDataString($Key)
$Stamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$Meta = Invoke-RestMethod -Uri "$Server/api/monitoring/agent/latest?platform=windows-amd64&key=$EscKey" -UseBasicParsing
Write-Host "Lade Agent $($Meta.version) ..."
# Nicht %TEMP%: 8.3-Pfade (C:\\Users\\XXXX~1\\…) zerlegen Move-Item an der Tilde.
$Tmp = Join-Path $Dir ("systemhaus-agent-" + [guid]::NewGuid().ToString('N') + ".download")
try {
  Invoke-WebRequest -Uri "$Server/api/monitoring/agent/download/windows-amd64?key=$EscKey&t=$Stamp" -OutFile $Tmp -UseBasicParsing
  if (-not (Test-Path -LiteralPath $Tmp) -or (Get-Item -LiteralPath $Tmp).Length -lt 100000) { throw 'Download unvollständig.' }
  if ($Meta.sha256) {
    $hash = (Get-FileHash -LiteralPath $Tmp -Algorithm SHA256).Hash.ToLower()
    if ($hash -ne ([string]$Meta.sha256).ToLower()) { throw 'Download beschädigt (SHA-256 stimmt nicht).' }
  }
  $Bak = "$Exe.bak"
  if (Test-Path -LiteralPath $Exe) {
    Remove-Item -LiteralPath $Bak -Force -ErrorAction SilentlyContinue
    Rename-Item -LiteralPath $Exe -NewName 'systemhaus-agent.exe.bak'
  }
  [System.IO.File]::Move($Tmp, $Exe)
  $Tmp = $null
  Unblock-File -LiteralPath $Exe -ErrorAction SilentlyContinue
  & $Exe install --server $Server --key $Key
  if ($LASTEXITCODE -ne 0) { throw "Installation fehlgeschlagen (Exit $LASTEXITCODE). Windows Defender kann die unsignierte EXE blockieren – Ausnahme für $Dir setzen und Skript erneut ausführen." }
  sc.exe failure SystemhausAgent reset= 86400 actions= restart/5000/restart/15000/restart/60000 | Out-Null
  sc.exe failureflag SystemhausAgent 1 | Out-Null
  Start-Service SystemhausAgent -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $Bak -Force -ErrorAction SilentlyContinue
  Write-Host "Agent $($Meta.version) installiert. Startet automatisch beim Hochfahren und nach Absturz."
} finally {
  if ($Tmp -and (Test-Path -LiteralPath $Tmp)) { Remove-Item -LiteralPath $Tmp -Force -ErrorAction SilentlyContinue }
}
`;
}

/**
 * Bash-Skript für Linux amd64/arm64 (root).
 */
export function linuxAgentInstallScript(origin: string, key: string): string {
  const server = shSingle(origin.replace(/\/$/, ""));
  const enr = shSingle(key);
  return `#!/usr/bin/env bash
# Systemhaus-Ess Agent – als root: sudo bash
set -euo pipefail
if [[ \${EUID:-$(id -u)} -ne 0 ]]; then
  echo "Bitte als root ausführen (sudo bash)." >&2
  exit 1
fi
SERVER=${server}
KEY=${enr}
case "$(uname -m)" in
  x86_64|amd64) PLAT=linux-amd64 ;;
  aarch64|arm64) PLAT=linux-arm64 ;;
  *) echo "Nicht unterstützte Architektur: $(uname -m)" >&2; exit 1 ;;
esac
BIN=/usr/local/bin/systemhaus-agent
systemctl stop systemhaus-agent >/dev/null 2>&1 || true
sleep 1
META_URL="$SERVER/api/monitoring/agent/latest?platform=$PLAT&key=$KEY"
if command -v curl >/dev/null 2>&1; then
  META=$(curl -fsSL "$META_URL")
elif command -v wget >/dev/null 2>&1; then
  META=$(wget -qO- "$META_URL")
else
  echo "curl oder wget ist erforderlich." >&2
  exit 1
fi
VER=$( { printf '%s' "$META" | tr -d ' ' | grep -o '"version":"[^"]*"' | head -1 | cut -d'"' -f4; } || true)
echo "Lade Agent \${VER:-unbekannt} ..."
TMP=$(mktemp)
URL="$SERVER/api/monitoring/agent/download/$PLAT?key=$KEY&t=$(date +%s)"
if command -v curl >/dev/null 2>&1; then
  curl -fsSL "$URL" -o "$TMP"
else
  wget -qO "$TMP" "$URL"
fi
if [[ ! -s "$TMP" ]]; then
  echo "Download unvollständig." >&2
  exit 1
fi
install -m 755 "$TMP" "$BIN"
rm -f "$TMP"
"$BIN" install --server "$SERVER" --key "$KEY"
echo "Agent \${VER:-} installiert (systemd: systemhaus-agent). Startet automatisch beim Hochfahren."
`;
}

function psSingle(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function shSingle(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
