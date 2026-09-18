//go:build linux

package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
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
	src, err := os.Executable()
	if err != nil {
		return err
	}
	src, err = filepath.Abs(src)
	if err != nil {
		return err
	}
	exe := "/usr/local/bin/systemhaus-agent"
	if err := copyFile(src, exe); err != nil {
		return err
	}
	if err := os.Chmod(exe, 0o755); err != nil {
		return err
	}
	unit := fmt.Sprintf(`[Unit]
Description=Systemhaus-Ess Monitoring Agent
After=network-online.target
StartLimitIntervalSec=0

[Service]
Type=simple
ExecStart=%s run %s
Restart=always
RestartSec=10

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
	_ = os.Remove("/usr/local/bin/systemhaus-agent")
	_ = os.Remove(platformConfigPath())
	_ = os.Remove("/etc/systemhaus-agent")
	return nil
}

func scheduleUninstall(cfgPath string) error {
	scriptPath := filepath.Join(os.TempDir(), "systemhaus-agent-uninstall.sh")
	script := fmt.Sprintf("#!/bin/bash\nsleep 2\nsystemctl disable --now systemhaus-agent >/dev/null 2>&1 || true\nrm -f /etc/systemd/system/systemhaus-agent.service\nsystemctl daemon-reload >/dev/null 2>&1 || true\nrm -f /usr/local/bin/systemhaus-agent %q\nrmdir /etc/systemhaus-agent >/dev/null 2>&1 || true\nrm -f %q\n",
		cfgPath, scriptPath)
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		return err
	}
	cmd := exec.Command("bash", scriptPath)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	return cmd.Start()
}

func maybeRunService(cfgPath string) error {
	return runLoop(cfgPath)
}
