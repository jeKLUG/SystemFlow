//go:build darwin

package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
)

func applyAgentUpdate(newPath string) error {
	newPath, err := filepath.Abs(newPath)
	if err != nil {
		return err
	}
	scriptPath := filepath.Join(os.TempDir(), "systemhaus-agent-apply-update.sh")
	script := fmt.Sprintf(`#!/bin/bash
set -e
sleep 2
launchctl bootout system/%s >/dev/null 2>&1 || true
sleep 1
cp %q %q
chmod 755 %q
launchctl bootstrap system %q >/dev/null 2>&1 || launchctl load -w %q >/dev/null 2>&1 || true
rm -f %q %q
`, macPlistLabel, newPath, macBinPath, macBinPath, macPlistPath, macPlistPath, newPath, scriptPath)
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		return err
	}
	cmd := exec.Command("bash", scriptPath)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	return cmd.Start()
}
