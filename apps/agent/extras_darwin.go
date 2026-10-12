//go:build darwin

package main

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

func collectRebootPending() bool {
	return lastUpdatesNeedRestart
}

func collectSession() *SessionSnapshot {
	out, err := exec.Command("who").Output()
	if err != nil {
		return nil
	}
	users := []string{}
	user := ""
	last := ""
	for _, line := range strings.Split(string(out), "\n") {
		fields := strings.Fields(line)
		if len(fields) < 1 {
			continue
		}
		name := fields[0]
		if name == "" || name == "root" {
			continue
		}
		users = append(users, name)
		if user == "" {
			user = name
		}
		if last == "" && len(fields) >= 3 {
			last = strings.Join(fields[2:], " ")
		}
	}
	users = uniqueNonEmpty(users)
	if user == "" && len(users) == 0 {
		return nil
	}
	return &SessionSnapshot{User: user, Users: users, LastLogon: last}
}

func collectNetwork() *NetworkSnapshot {
	net := &NetworkSnapshot{PublicIP: collectPublicIP()}
	if out, err := exec.Command("route", "-n", "get", "default").Output(); err == nil {
		for _, line := range strings.Split(string(out), "\n") {
			line = strings.TrimSpace(line)
			if strings.HasPrefix(line, "gateway:") {
				net.Gateway = strings.TrimSpace(strings.TrimPrefix(line, "gateway:"))
			}
			if strings.HasPrefix(line, "interface:") {
				net.Adapter = strings.TrimSpace(strings.TrimPrefix(line, "interface:"))
			}
		}
	}
	if out, err := exec.Command("scutil", "--dns").Output(); err == nil {
		for _, line := range strings.Split(string(out), "\n") {
			line = strings.TrimSpace(line)
			if !strings.HasPrefix(line, "nameserver[") {
				continue
			}
			_, val, ok := strings.Cut(line, ":")
			if !ok {
				continue
			}
			ip := strings.TrimSpace(val)
			if ip != "" {
				net.DNS = append(net.DNS, ip)
			}
			if len(net.DNS) >= 4 {
				break
			}
		}
		net.DNS = uniqueNonEmpty(net.DNS)
	}
	if net.Adapter != "" {
		if out, err := exec.Command("ipconfig", "getpacket", net.Adapter).Output(); err == nil {
			dhcp := strings.Contains(string(out), "yiaddr") || strings.Contains(string(out), "dhcp")
			net.Dhcp = boolPtr(dhcp)
		}
	}
	if net.PublicIP == "" && net.Gateway == "" && len(net.DNS) == 0 && net.Dhcp == nil {
		return nil
	}
	return net
}

func collectFailedServices() []ServiceSnapshot {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, "launchctl", "list").Output()
	if err != nil {
		return nil
	}
	var list []ServiceSnapshot
	for _, line := range strings.Split(string(out), "\n") {
		fields := strings.Fields(line)
		if len(fields) < 3 {
			continue
		}
		pid, status, label := fields[0], fields[1], fields[2]
		if pid == "PID" || pid != "-" || status == "0" || status == "-" {
			continue
		}
		if strings.HasPrefix(label, "com.apple.") {
			continue
		}
		list = append(list, ServiceSnapshot{Name: label, State: "failed"})
		if len(list) >= 20 {
			break
		}
	}
	return list
}

func collectSoftware() []SoftwareSnapshot {
	var list []SoftwareSnapshot
	for _, dir := range []string{"/Applications", "/Applications/Utilities"} {
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		for _, e := range entries {
			name := e.Name()
			if !strings.HasSuffix(name, ".app") {
				continue
			}
			list = append(list, SoftwareSnapshot{Name: strings.TrimSuffix(name, ".app")})
		}
	}
	sortSoftware(list)
	return list
}

func collectDefender() *DefenderSnapshot {
	out := &DefenderSnapshot{Product: "XProtect"}
	if _, err := os.Stat("/Library/Apple/System/Library/CoreServices/XProtect.bundle"); err == nil {
		out.Antivirus = boolPtr(true)
	}
	return out
}

func collectFirewall() *FirewallSnapshot {
	out, err := exec.Command("/usr/libexec/ApplicationFirewall/socketfilterfw", "--getglobalstate").Output()
	if err != nil {
		return nil
	}
	on := strings.Contains(strings.ToLower(string(out)), "enabled")
	return &FirewallSnapshot{
		Active:   "host",
		Profiles: []FirewallProfile{{Name: "Application Firewall", Enabled: on}},
	}
}

func collectCrash() *CrashSnapshot {
	dir := "/Library/Logs/DiagnosticReports"
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	cutoff := time.Now().Add(-24 * time.Hour)
	for _, e := range entries {
		name := strings.ToLower(e.Name())
		if !strings.Contains(name, "panic") {
			continue
		}
		info, err := e.Info()
		if err != nil || info.ModTime().Before(cutoff) {
			continue
		}
		return &CrashSnapshot{Unexpected: true, Time: info.ModTime().Format(time.RFC3339), Reason: filepath.Base(e.Name())}
	}
	return nil
}
