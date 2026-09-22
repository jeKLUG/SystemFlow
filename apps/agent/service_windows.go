//go:build windows

package main

import (
	"context"
	"os/exec"
	"regexp"
	"strings"
	"syscall"
	"time"
)

var scStateRe = regexp.MustCompile(`(?i)(?:STATE|STATUS)\s*:\s*(\d+)`)

func probeService(name string) ServiceWatchResult {
	if !validServiceName(name) {
		return ServiceWatchResult{Name: name, State: "invalid", Ok: false}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "sc", "query", name)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	out, err := cmd.CombinedOutput()
	raw := string(out)
	if err != nil && !strings.Contains(raw, "STATE") && !strings.Contains(raw, "STATUS") {
		if strings.Contains(raw, "1060") || strings.Contains(strings.ToLower(raw), "does not exist") {
			return ServiceWatchResult{Name: name, State: "missing", Ok: false}
		}
		return ServiceWatchResult{Name: name, State: "unknown", Ok: false}
	}
	m := scStateRe.FindStringSubmatch(raw)
	if len(m) < 2 {
		return ServiceWatchResult{Name: name, State: "missing", Ok: false}
	}
	state := "stopped"
	ok := false
	switch m[1] {
	case "4":
		state = "running"
		ok = true
	case "2":
		state = "start-pending"
	case "3":
		state = "stop-pending"
	case "1":
		state = "stopped"
	default:
		state = "state-" + m[1]
	}
	display := windowsServiceDisplay(name)
	return ServiceWatchResult{Name: name, Display: display, State: state, Ok: ok}
}

func windowsServiceDisplay(name string) string {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "sc", "qc", name)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(strings.ToUpper(line), "DISPLAY_NAME") {
			continue
		}
		_, rest, ok := strings.Cut(line, ":")
		if !ok {
			return ""
		}
		return strings.TrimSpace(rest)
	}
	return ""
}
