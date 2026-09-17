//go:build linux

package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

func platformConfigPath() string {
	return "/etc/systemhaus-agent/agent.json"
}

func machineID() string {
	raw, err := os.ReadFile("/etc/machine-id")
	if err != nil {
		return hostnameFallback()
	}
	id := strings.TrimSpace(string(raw))
	if id == "" {
		return hostnameFallback()
	}
	return id
}

var lastUpdates *UpdateSnapshot
var lastUpdatesAt time.Time

func collectUpdates() *UpdateSnapshot {
	if time.Since(lastUpdatesAt) < 30*time.Minute && lastUpdates != nil {
		return lastUpdates
	}
	pending := 0
	if out, err := exec.Command("bash", "-lc", "command -v apt-get >/dev/null && apt-get -s upgrade 2>/dev/null | grep -c '^Inst ' || true").Output(); err == nil {
		pending = atoiSafe(strings.TrimSpace(string(out)))
	} else if out, err := exec.Command("bash", "-lc", "command -v dnf >/dev/null && dnf -q check-update --refresh >/tmp/dnf-check 2>/dev/null; wc -l </tmp/dnf-check || true").Output(); err == nil {
		pending = atoiSafe(strings.TrimSpace(string(out)))
	}
	lastUpdates = &UpdateSnapshot{PendingCount: pending}
	lastUpdatesAt = time.Now()
	return lastUpdates
}

func atoiSafe(s string) int {
	n := 0
	for _, c := range s {
		if c < '0' || c > '9' {
			break
		}
		n = n*10 + int(c-'0')
	}
	return n
}

func collectEvents() []EventSnapshot {
	out, err := exec.Command("journalctl", "-p", "err", "--since", "2 min ago", "-n", "15", "--no-pager", "-o", "short").Output()
	if err != nil {
		return nil
	}
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	var events []EventSnapshot
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "--") {
			continue
		}
		if len(line) > 500 {
			line = line[:500]
		}
		events = append(events, EventSnapshot{Source: "journal", Level: "error", Message: line})
	}
	return events
}

func installService(cfgPath string) error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	exe, err = filepath.Abs(exe)
	if err != nil {
		return err
	}
	unit := fmt.Sprintf(`[Unit]
Description=Systemhaus-Ess Monitoring Agent
After=network-online.target

[Service]
Type=simple
ExecStart=%s run %s
Restart=always
RestartSec=15

[Install]
WantedBy=multi-user.target
`, exe, cfgPath)
	if err := os.WriteFile("/etc/systemd/system/systemhaus-agent.service", []byte(unit), 0o644); err != nil {
		return err
	}
	_ = exec.Command("systemctl", "daemon-reload").Run()
	_ = exec.Command("systemctl", "enable", "--now", "systemhaus-agent").Run()
	return nil
}

func uninstallService() error {
	_ = exec.Command("systemctl", "disable", "--now", "systemhaus-agent").Run()
	_ = os.Remove("/etc/systemd/system/systemhaus-agent.service")
	_ = exec.Command("systemctl", "daemon-reload").Run()
	return nil
}

func maybeRunService(cfgPath string) error {
	return runLoop(cfgPath)
}
