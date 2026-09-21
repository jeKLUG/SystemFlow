//go:build linux

package main

import (
	"os"
	"os/exec"
	"strings"
)

func collectRebootPending() bool {
	if _, err := os.Stat("/run/reboot-required"); err == nil {
		return true
	}
	if _, err := os.Stat("/var/run/reboot-required"); err == nil {
		return true
	}
	return false
}

func collectSession() *SessionSnapshot {
	out, err := exec.Command("loginctl", "list-sessions", "--no-legend", "--no-pager").Output()
	users := []string{}
	user := ""
	last := ""
	if err == nil {
		for _, line := range strings.Split(string(out), "\n") {
			fields := strings.Fields(line)
			if len(fields) < 3 {
				continue
			}
			name := fields[2]
			if name == "" || name == "root" {
				continue
			}
			users = append(users, name)
			if user == "" {
				user = name
			}
		}
	}
	if len(users) == 0 {
		if who, err := exec.Command("who").Output(); err == nil {
			for _, line := range strings.Split(string(who), "\n") {
				fields := strings.Fields(line)
				if len(fields) < 1 {
					continue
				}
				users = append(users, fields[0])
				if user == "" {
					user = fields[0]
				}
				if last == "" && len(fields) >= 3 {
					last = strings.Join(fields[2:], " ")
				}
			}
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
	if out, err := exec.Command("ip", "-4", "route", "show", "default").Output(); err == nil {
		fields := strings.Fields(string(out))
		for i, f := range fields {
			if f == "via" && i+1 < len(fields) {
				net.Gateway = fields[i+1]
			}
			if f == "dev" && i+1 < len(fields) && net.Adapter == "" {
				net.Adapter = fields[i+1]
			}
		}
	}
	if raw, err := os.ReadFile("/etc/resolv.conf"); err == nil {
		for _, line := range strings.Split(string(raw), "\n") {
			line = strings.TrimSpace(line)
			if !strings.HasPrefix(line, "nameserver") {
				continue
			}
			fields := strings.Fields(line)
			if len(fields) >= 2 {
				net.DNS = append(net.DNS, fields[1])
			}
		}
		net.DNS = uniqueNonEmpty(net.DNS)
	}
	if net.Adapter != "" {
		leaseDir := "/run/systemd/netif/leases"
		if entries, err := os.ReadDir(leaseDir); err == nil && len(entries) > 0 {
			net.Dhcp = boolPtr(true)
		} else if _, err := os.Stat("/var/lib/dhcpcd"); err == nil {
			net.Dhcp = boolPtr(true)
		}
	}
	if net.PublicIP == "" && net.Gateway == "" && len(net.DNS) == 0 && net.Dhcp == nil {
		return nil
	}
	return net
}

func collectFailedServices() []ServiceSnapshot {
	out, err := exec.Command("systemctl", "--failed", "--no-legend", "--plain", "--no-pager").Output()
	if err != nil {
		return nil
	}
	var list []ServiceSnapshot
	for _, line := range strings.Split(string(out), "\n") {
		fields := strings.Fields(line)
		if len(fields) < 1 {
			continue
		}
		name := strings.TrimSuffix(fields[0], ".service")
		state := ""
		if len(fields) >= 3 {
			state = fields[2]
		} else {
			state = "failed"
		}
		list = append(list, ServiceSnapshot{Name: name, Display: fields[0], State: state})
		if len(list) >= 20 {
			break
		}
	}
	return list
}

func collectSoftware() []SoftwareSnapshot {
	if out, err := exec.Command("dpkg-query", "-W", "-f", "${Package}\t${Version}\t${Maintainer}\n").Output(); err == nil {
		return parseLinuxSoftware(string(out), true)
	}
	if out, err := exec.Command("rpm", "-qa", "--qf", "%{NAME}\t%{VERSION}\t%{VENDOR}\n").Output(); err == nil {
		return parseLinuxSoftware(string(out), false)
	}
	return nil
}

func parseLinuxSoftware(raw string, debian bool) []SoftwareSnapshot {
	var list []SoftwareSnapshot
	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, "\t", 3)
		name := strings.TrimSpace(parts[0])
		if name == "" {
			continue
		}
		if debian && (strings.HasPrefix(name, "lib") || strings.HasSuffix(name, "-data") || strings.HasSuffix(name, "-common")) {
			continue
		}
		item := SoftwareSnapshot{Name: name}
		if len(parts) > 1 {
			item.Version = strings.TrimSpace(parts[1])
		}
		if len(parts) > 2 {
			item.Publisher = strings.TrimSpace(parts[2])
		}
		list = append(list, item)
	}
	sortSoftware(list)
	return list
}

func collectDefender() *DefenderSnapshot { return nil }

func collectFirewall() *FirewallSnapshot {
	if out, err := exec.Command("ufw", "status").Output(); err == nil {
		on := strings.Contains(strings.ToLower(string(out)), "status: active")
		return &FirewallSnapshot{
			Active:   "host",
			Profiles: []FirewallProfile{{Name: "ufw", Enabled: on}},
		}
	}
	if out, err := exec.Command("systemctl", "is-active", "firewalld").Output(); err == nil {
		on := strings.TrimSpace(string(out)) == "active"
		return &FirewallSnapshot{
			Active:   "host",
			Profiles: []FirewallProfile{{Name: "firewalld", Enabled: on}},
		}
	}
	return nil
}

func collectCrash() *CrashSnapshot {
	out, err := exec.Command("journalctl", "-b", "-1", "-n", "80", "--no-pager", "-o", "cat").Output()
	if err != nil {
		return nil
	}
	low := strings.ToLower(string(out))
	needles := []string{"kernel panic", "bug: unable to handle", "watchdog: bug", "oops: ", "fatal exception"}
	for _, n := range needles {
		if strings.Contains(low, n) {
			return &CrashSnapshot{Unexpected: true, Reason: "Kernel-Absturz"}
		}
	}
	return nil
}
