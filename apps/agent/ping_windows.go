//go:build windows

package main

import (
	"context"
	"os/exec"
	"syscall"
	"time"
)

func pingHost(host string) bool {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "ping", "-n", "1", "-w", "1000", host)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	return cmd.Run() == nil
}
