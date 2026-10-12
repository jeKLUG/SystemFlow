//go:build darwin

package main

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

const (
	macPlistLabel = "de.systemhaus-ess.agent"
	macPlistPath  = "/Library/LaunchDaemons/de.systemhaus-ess.agent.plist"
	macBinPath    = "/usr/local/bin/systemhaus-agent"
)

func macSupportDir() string {
	return "/Library/Application Support/SystemhausEss"
}

func platformConfigPath() string {
	return filepath.Join(macSupportDir(), "agent.json")
}

func machineID() string {
	out, err := exec.Command("ioreg", "-rd1", "-c", "IOPlatformExpertDevice").Output()
	if err == nil {
		for _, line := range strings.Split(string(out), "\n") {
			if !strings.Contains(line, "IOPlatformUUID") {
				continue
			}
			parts := strings.Split(line, "\"")
			for i, p := range parts {
				if strings.TrimSpace(p) == "IOPlatformUUID" && i+2 < len(parts) {
					id := strings.TrimSpace(parts[i+2])
					if id != "" {
						return id
					}
				}
			}
		}
	}
	return hostnameFallback()
}

var lastUpdates *UpdateSnapshot
var lastUpdatesAt time.Time
var lastUpdatesNeedRestart bool

func collectUpdates() *UpdateSnapshot {
	if time.Since(lastUpdatesAt) < 30*time.Minute && lastUpdates != nil {
		return lastUpdates
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, "softwareupdate", "-l").CombinedOutput()
	if err != nil {
		if lastUpdates != nil {
			return lastUpdates
		}
		return &UpdateSnapshot{}
	}
	pending := 0
	needRestart := false
	for _, line := range strings.Split(string(out), "\n") {
		if strings.Contains(line, "Label:") {
			pending++
		}
		low := strings.ToLower(line)
		if strings.Contains(low, "restart") {
			needRestart = true
		}
	}
	lastUpdatesNeedRestart = needRestart
	lastUpdates = &UpdateSnapshot{PendingCount: pending}
	lastUpdatesAt = time.Now()
	return lastUpdates
}

func collectEvents() []EventSnapshot {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, "log", "show", "--last", "2m", "--style", "compact", "--predicate", "messageType == 16").Output()
	if err != nil {
		return nil
	}
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	var events []EventSnapshot
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "Timestamp") {
			continue
		}
		if len(line) > 500 {
			line = line[:500]
		}
		events = append(events, EventSnapshot{Source: "log", Level: "error", Message: line})
		if len(events) >= 15 {
			break
		}
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
	if err := os.MkdirAll(filepath.Dir(macBinPath), 0o755); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(cfgPath), 0o755); err != nil {
		return err
	}
	if err := copyFile(src, macBinPath); err != nil {
		return err
	}
	if err := os.Chmod(macBinPath, 0o755); err != nil {
		return err
	}
	plist := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>%s</string>
	<key>ProgramArguments</key>
	<array>
		<string>%s</string>
		<string>run</string>
		<string>%s</string>
	</array>
	<key>RunAtLoad</key>
	<true/>
	<key>KeepAlive</key>
	<true/>
	<key>ThrottleInterval</key>
	<integer>10</integer>
	<key>StandardOutPath</key>
	<string>/var/log/systemhaus-agent.log</string>
	<key>StandardErrorPath</key>
	<string>/var/log/systemhaus-agent.log</string>
</dict>
</plist>
`, macPlistLabel, macBinPath, cfgPath)
	if err := os.WriteFile(macPlistPath, []byte(plist), 0o644); err != nil {
		return err
	}
	_ = exec.Command("launchctl", "bootout", "system/"+macPlistLabel).Run()
	if err := exec.Command("launchctl", "bootstrap", "system", macPlistPath).Run(); err != nil {
		_ = exec.Command("launchctl", "load", "-w", macPlistPath).Run()
	}
	return nil
}

func uninstallService() error {
	_ = exec.Command("launchctl", "bootout", "system/"+macPlistLabel).Run()
	_ = exec.Command("launchctl", "unload", "-w", macPlistPath).Run()
	_ = os.Remove(macPlistPath)
	_ = os.Remove(macBinPath)
	_ = os.Remove(platformConfigPath())
	_ = os.Remove(macSupportDir())
	return nil
}

func scheduleUninstall(cfgPath string) error {
	scriptPath := filepath.Join(os.TempDir(), "systemhaus-agent-uninstall.sh")
	script := fmt.Sprintf(`#!/bin/bash
sleep 2
launchctl bootout system/%s >/dev/null 2>&1 || true
launchctl unload -w %q >/dev/null 2>&1 || true
rm -f %q %q %q
rmdir %q >/dev/null 2>&1 || true
rm -f %q
`, macPlistLabel, macPlistPath, macPlistPath, macBinPath, cfgPath, macSupportDir(), scriptPath)
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
