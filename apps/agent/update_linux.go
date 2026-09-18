//go:build linux

package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
)

func applyAgentUpdate(newPath string) error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	exe, err = filepath.Abs(exe)
	if err != nil {
		return err
	}
	newPath, err = filepath.Abs(newPath)
	if err != nil {
		return err
	}
	scriptPath := filepath.Join(os.TempDir(), "systemhaus-agent-apply-update.sh")
	script := fmt.Sprintf("#!/bin/bash\nset -e\nsleep 2\nsystemctl stop systemhaus-agent || true\ncp %q %q\nchmod 755 %q\nsystemctl start systemhaus-agent\nrm -f %q %q\n",
		newPath, exe, exe, newPath, scriptPath)
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		return err
	}
	cmd := exec.Command("bash", scriptPath)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	return cmd.Start()
}
