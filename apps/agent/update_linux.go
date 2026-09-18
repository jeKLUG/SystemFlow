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
	exe := "/usr/local/bin/systemhaus-agent"
	newPath, err := filepath.Abs(newPath)
	if err != nil {
		return err
	}
	scriptPath := filepath.Join(os.TempDir(), "systemhaus-agent-apply-update.sh")
	script := fmt.Sprintf("#!/bin/bash\nset -e\nsleep 2\nsystemctl stop systemhaus-agent || true\nsleep 2\ncp %q %q\nchmod 755 %q\nsystemctl start systemhaus-agent || true\nrm -f %q %q\n",
		newPath, exe, exe, newPath, scriptPath)
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		return err
	}
	cmd := exec.Command("bash", scriptPath)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	return cmd.Start()
}
