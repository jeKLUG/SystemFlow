//go:build windows

package main

import (
	"encoding/json"
	"os/exec"
	"strings"
	"syscall"
	"time"

	"golang.org/x/sys/windows/registry"
)

const extrasPS = `
$ErrorActionPreference = 'SilentlyContinue'
function N([object]$v) {
  if ($null -eq $v) { return $null }
  $s = [string]$v
  $s = $s.Trim()
  if ($s -eq '') { return $null }
  return $s
}
$user = N (Get-CimInstance Win32_ComputerSystem).UserName
$users = @()
$last = $null
try {
  $lines = @(quser 2>$null)
  if ($lines.Count -gt 1) {
    foreach ($line in $lines[1..($lines.Count-1)]) {
      $raw = ($line -replace '^\s*>', '' -replace '\s+', ' ').Trim()
      if (-not $raw) { continue }
      $parts = $raw.Split(' ')
      if ($parts.Length -lt 1) { continue }
      $uname = N $parts[0]
      if ($uname) { $users += $uname }
      if ($parts.Length -ge 6) {
        $stamp = N (($parts[5..($parts.Length-1)]) -join ' ')
        if ($stamp -and -not $last) { $last = $stamp }
      }
    }
  }
} catch {}
if ($user -and ($users -notcontains ($user.Split('\')[-1])) -and ($users -notcontains $user)) {
  $users = @($user) + $users
}
$cfg = Get-NetIPConfiguration | Where-Object { $_.NetAdapter.Status -eq 'Up' -and $_.IPv4DefaultGateway } | Select-Object -First 1
if (-not $cfg) { $cfg = Get-NetIPConfiguration | Where-Object { $_.IPv4Address } | Select-Object -First 1 }
$dhcp = $null
$gateway = $null
$dns = @()
$adapter = $null
if ($cfg) {
  $adapter = N $cfg.InterfaceAlias
  if ($cfg.IPv4DefaultGateway) { $gateway = N $cfg.IPv4DefaultGateway.NextHop }
  if ($cfg.DNSServer) { $dns = @($cfg.DNSServer.ServerAddresses | ForEach-Object { N $_ } | Where-Object { $_ }) }
  try { $dhcp = ($cfg.NetIPv4Interface.Dhcp -eq 'Enabled') } catch { $dhcp = $null }
}
$skip = @('MapsBroker','sppsvc','RemoteRegistry','WMPNetworkSvc','SharedAccess','Fax','PrintNotify','RetailDemo','shpamsvc','gupdate','gupdatem','edgeupdate','edgeupdatem','WbioSrvc')
$services = @()
Get-CimInstance Win32_Service | Where-Object {
  $_.StartMode -eq 'Auto' -and $_.State -ne 'Running' -and $skip -notcontains $_.Name -and $_.Name -notmatch 'update|xbox'
} | Select-Object -First 20 | ForEach-Object {
  $services += @{ name = N $_.Name; display = N $_.DisplayName; state = N $_.State }
}
$defender = $null
try {
  $mp = Get-MpComputerStatus -ErrorAction Stop
  if ($mp) {
    $sigAge = $null
    $sigTime = $null
    if ($mp.AntivirusSignatureLastUpdated) {
      $sigTime = ([datetime]$mp.AntivirusSignatureLastUpdated).ToString('s')
      $sigAge = [int]((Get-Date) - [datetime]$mp.AntivirusSignatureLastUpdated).TotalHours
    }
    $scanAt = $null
    $scans = @($mp.QuickScanEndTime, $mp.FullScanEndTime) | Where-Object { $_ } | Sort-Object -Descending
    if ($scans.Count -gt 0) { $scanAt = ([datetime]$scans[0]).ToString('s') }
    $defender = @{
      product = 'Microsoft Defender'
      realtime = [bool]$mp.RealTimeProtectionEnabled
      antivirus = [bool]$mp.AntivirusEnabled
      signaturesAgeHours = $sigAge
      signaturesUpdated = $sigTime
      lastScan = $scanAt
    }
  }
} catch {}
$fwProfiles = @()
$fwActive = $null
try {
  Get-NetFirewallProfile -ErrorAction Stop | ForEach-Object {
    $fwProfiles += @{ name = N $_.Name; enabled = [bool]$_.Enabled }
  }
  $cat = N (Get-NetConnectionProfile -ErrorAction SilentlyContinue | Select-Object -First 1).NetworkCategory
  if ($cat -eq 'DomainAuthenticated') { $cat = 'Domain' }
  $fwActive = $cat
} catch {}
$crashTime = $null
$crashReason = $null
try {
  $boot = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime
  if ($boot) {
    $from = ([datetime]$boot).AddMinutes(-30)
    $ev = Get-WinEvent -FilterHashtable @{ LogName = 'System'; Id = 6008,41,1001; StartTime = $from } -MaxEvents 5 -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($ev) {
      $crashTime = $ev.TimeCreated.ToString('s')
      if ($ev.Id -eq 6008) { $crashReason = 'Unerwartetes Herunterfahren' }
      elseif ($ev.Id -eq 41) { $crashReason = 'Absturz / Stromverlust' }
      else { $crashReason = 'Bluescreen' }
    }
  }
} catch {}
$crash = $null
if ($crashReason) {
  $crash = @{ unexpected = $true; time = $crashTime; reason = $crashReason }
}
@{
  user = $user
  users = $users
  lastLogon = $last
  adapter = $adapter
  gateway = $gateway
  dns = $dns
  dhcp = $dhcp
  services = $services
  defender = $defender
  firewallActive = $fwActive
  firewallProfiles = $fwProfiles
  crash = $crash
} | ConvertTo-Json -Compress -Depth 6
`

type extrasWire struct {
	User             string          `json:"user"`
	Users            json.RawMessage `json:"users"`
	LastLogon        string          `json:"lastLogon"`
	Adapter          string          `json:"adapter"`
	Gateway          string          `json:"gateway"`
	DNS              json.RawMessage `json:"dns"`
	Dhcp             *bool           `json:"dhcp"`
	Services         json.RawMessage `json:"services"`
	Defender         json.RawMessage `json:"defender"`
	FirewallActive   string          `json:"firewallActive"`
	FirewallProfiles json.RawMessage `json:"firewallProfiles"`
	Crash            json.RawMessage `json:"crash"`
}

func runHiddenPS(script string) ([]byte, error) {
	cmd := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command", script)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	return cmd.Output()
}

func collectLiveExtras() extrasWire {
	out, err := runHiddenPS(extrasPS)
	if err != nil || len(strings.TrimSpace(string(out))) == 0 {
		return extrasWire{}
	}
	var wire extrasWire
	if json.Unmarshal(out, &wire) != nil {
		return extrasWire{}
	}
	return wire
}

func collectSession() *SessionSnapshot {
	wire := collectLiveExtrasCached()
	users := uniqueNonEmpty(append(parseOneOrMany[string](wire.Users), wire.User))
	user := strings.TrimSpace(wire.User)
	if user == "" && len(users) > 0 {
		user = users[0]
	}
	if user == "" && len(users) == 0 && strings.TrimSpace(wire.LastLogon) == "" {
		return nil
	}
	return &SessionSnapshot{User: user, Users: users, LastLogon: strings.TrimSpace(wire.LastLogon)}
}

func collectNetwork() *NetworkSnapshot {
	wire := collectLiveExtrasCached()
	dns := uniqueNonEmpty(parseOneOrMany[string](wire.DNS))
	net := &NetworkSnapshot{
		PublicIP: collectPublicIP(),
		Gateway:  strings.TrimSpace(wire.Gateway),
		DNS:      dns,
		Dhcp:     wire.Dhcp,
		Adapter:  strings.TrimSpace(wire.Adapter),
	}
	if net.PublicIP == "" && net.Gateway == "" && len(net.DNS) == 0 && net.Dhcp == nil && net.Adapter == "" {
		return nil
	}
	return net
}

func collectFailedServices() []ServiceSnapshot {
	wire := collectLiveExtrasCached()
	rows := parseOneOrMany[ServiceSnapshot](wire.Services)
	out := make([]ServiceSnapshot, 0, len(rows))
	for _, s := range rows {
		s.Name = strings.TrimSpace(s.Name)
		s.Display = strings.TrimSpace(s.Display)
		s.State = strings.TrimSpace(s.State)
		if s.Name == "" || skipWindowsService(s.Name) {
			continue
		}
		out = append(out, s)
		if len(out) >= 20 {
			break
		}
	}
	return out
}

func collectDefender() *DefenderSnapshot {
	raw := collectLiveExtrasCached().Defender
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	var row struct {
		Product            string   `json:"product"`
		Realtime           *bool    `json:"realtime"`
		Antivirus          *bool    `json:"antivirus"`
		SignaturesAgeHours *float64 `json:"signaturesAgeHours"`
		SignaturesUpdated  string   `json:"signaturesUpdated"`
		LastScan           string   `json:"lastScan"`
	}
	if json.Unmarshal(raw, &row) != nil {
		return nil
	}
	snap := &DefenderSnapshot{
		Product:           strings.TrimSpace(row.Product),
		Realtime:          row.Realtime,
		Antivirus:         row.Antivirus,
		SignaturesUpdated: strings.TrimSpace(row.SignaturesUpdated),
		LastScan:          strings.TrimSpace(row.LastScan),
	}
	if row.SignaturesAgeHours != nil {
		h := int(*row.SignaturesAgeHours)
		if h < 0 {
			h = 0
		}
		snap.SignaturesAgeHours = &h
	}
	if snap.Product == "" && snap.Realtime == nil && snap.Antivirus == nil {
		return nil
	}
	return snap
}

func collectFirewall() *FirewallSnapshot {
	wire := collectLiveExtrasCached()
	profiles := parseOneOrMany[FirewallProfile](wire.FirewallProfiles)
	active := strings.TrimSpace(wire.FirewallActive)
	if len(profiles) == 0 && active == "" {
		return nil
	}
	return &FirewallSnapshot{Active: active, Profiles: profiles}
}

func collectCrash() *CrashSnapshot {
	raw := collectLiveExtrasCached().Crash
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	var row CrashSnapshot
	if json.Unmarshal(raw, &row) != nil || !row.Unexpected {
		return nil
	}
	row.Reason = strings.TrimSpace(row.Reason)
	row.Time = strings.TrimSpace(row.Time)
	return &row
}

var lastExtras extrasWire
var lastExtrasAt time.Time
var lastExtrasOK bool

func collectLiveExtrasCached() extrasWire {
	if lastExtrasOK && time.Since(lastExtrasAt) < 50*time.Second {
		return lastExtras
	}
	wire := collectLiveExtras()
	lastExtras = wire
	lastExtrasAt = time.Now()
	lastExtrasOK = true
	return wire
}

func collectRebootPending() bool {
	keys := []string{
		`SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired`,
		`SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending`,
	}
	for _, path := range keys {
		k, err := registry.OpenKey(registry.LOCAL_MACHINE, path, registry.QUERY_VALUE)
		if err == nil {
			k.Close()
			return true
		}
	}
	sm, err := registry.OpenKey(registry.LOCAL_MACHINE, `SYSTEM\CurrentControlSet\Control\Session Manager`, registry.QUERY_VALUE)
	if err != nil {
		return false
	}
	defer sm.Close()
	vals, _, err := sm.GetStringsValue("PendingFileRenameOperations")
	return err == nil && len(vals) > 0
}

func collectSoftware() []SoftwareSnapshot {
	var list []SoftwareSnapshot
	seen := map[string]struct{}{}
	roots := []struct {
		key  registry.Key
		path string
	}{
		{registry.LOCAL_MACHINE, `SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall`},
		{registry.LOCAL_MACHINE, `SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall`},
	}
	for _, root := range roots {
		k, err := registry.OpenKey(root.key, root.path, registry.ENUMERATE_SUB_KEYS|registry.QUERY_VALUE)
		if err != nil {
			continue
		}
		names, _ := k.ReadSubKeyNames(-1)
		for _, name := range names {
			sk, err := registry.OpenKey(k, name, registry.QUERY_VALUE)
			if err != nil {
				continue
			}
			display, _, _ := sk.GetStringValue("DisplayName")
			display = strings.TrimSpace(display)
			sysComp, _, _ := sk.GetIntegerValue("SystemComponent")
			release, _, _ := sk.GetStringValue("ReleaseType")
			parent, _, _ := sk.GetStringValue("ParentKeyName")
			pub, _, _ := sk.GetStringValue("Publisher")
			ver, _, _ := sk.GetStringValue("DisplayVersion")
			sk.Close()
			if display == "" || sysComp == 1 || strings.TrimSpace(parent) != "" {
				continue
			}
			if strings.Contains(strings.ToLower(display), "kb") && strings.Contains(strings.ToLower(display), "hotfix") {
				continue
			}
			if strings.EqualFold(strings.TrimSpace(release), "Hotfix") || strings.EqualFold(strings.TrimSpace(release), "Security Update") {
				continue
			}
			key := strings.ToLower(display)
			if _, ok := seen[key]; ok {
				continue
			}
			seen[key] = struct{}{}
			list = append(list, SoftwareSnapshot{Name: display, Publisher: strings.TrimSpace(pub), Version: strings.TrimSpace(ver)})
		}
		k.Close()
	}
	sortSoftware(list)
	return list
}
