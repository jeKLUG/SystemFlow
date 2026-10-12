//go:build darwin

package main

import (
	"context"
	"os/exec"
	"time"
)

func pingHost(host string) bool {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "ping", "-c", "1", "-W", "2000", host)
	return cmd.Run() == nil
}
