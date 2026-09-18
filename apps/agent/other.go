//go:build !windows && !linux

package main

import (
	"os"
	"path/filepath"
	"runtime"
)

func platformConfigPath() string {
	home, _ := os.UserHomeDir()
	if home == "" {
		home = "."
	}
	return filepath.Join(home, ".systemhaus-agent", "agent.json")
}

func machineID() string {
	if runtime.GOOS == "darwin" {
		return hostnameFallback()
	}
	return hostnameFallback()
}

func collectUpdates() *UpdateSnapshot { return nil }

func collectEvents() []EventSnapshot { return nil }

func installService(cfgPath string) error {
	return runLoop(cfgPath)
}

func uninstallService() error {
	_ = os.Remove(platformConfigPath())
	return nil
}

func scheduleUninstall(cfgPath string) error {
	_ = os.Remove(cfgPath)
	return nil
}

func maybeRunService(cfgPath string) error {
	return runLoop(cfgPath)
}
