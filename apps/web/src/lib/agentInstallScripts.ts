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
if (Get-Service SystemhausAgent -ErrorAction SilentlyContinue) {
  Stop-Service SystemhausAgent -Force -ErrorAction SilentlyContinue
}
$Url = "$Server/api/monitoring/agent/download/windows-amd64?key=$([uri]::EscapeDataString($Key))"
Invoke-WebRequest -Uri $Url -OutFile $Exe -UseBasicParsing
Unblock-File -Path $Exe -ErrorAction SilentlyContinue
& $Exe install --server $Server --key $Key
if ($LASTEXITCODE -ne 0) { throw "Installation fehlgeschlagen (Exit $LASTEXITCODE)" }
sc.exe failure SystemhausAgent reset= 86400 actions= restart/5000/restart/15000/restart/60000 | Out-Null
sc.exe failureflag SystemhausAgent 1 | Out-Null
Start-Service SystemhausAgent -ErrorAction SilentlyContinue
Write-Host 'Agent installiert. Startet automatisch beim Hochfahren und nach Absturz.'
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
URL="$SERVER/api/monitoring/agent/download/$PLAT?key=$KEY"
if command -v curl >/dev/null 2>&1; then
  curl -fsSL "$URL" -o "$BIN"
elif command -v wget >/dev/null 2>&1; then
  wget -qO "$BIN" "$URL"
else
  echo "curl oder wget ist erforderlich." >&2
  exit 1
fi
chmod 755 "$BIN"
"$BIN" install --server "$SERVER" --key "$KEY"
echo "Agent installiert (systemd: systemhaus-agent). Startet automatisch beim Hochfahren."
`;
}

function psSingle(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function shSingle(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
