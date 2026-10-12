//go:build darwin

package main

import (
	"context"
	"os/exec"
	"strings"
	"time"
)

func probeService(name string) ServiceWatchResult {
	if !validServiceName(name) {
		return ServiceWatchResult{Name: name, State: "invalid", Ok: false}
	}
	label := name
	row := launchctlRow(label)
	if row.State == "missing" && !strings.Contains(label, ".") {
		row = launchctlRow("system/" + label)
	}
	row.Name = name
	return row
}

func launchctlRow(label string) ServiceWatchResult {
	printLabel := label
	if !strings.Contains(printLabel, "/") {
		printLabel = "system/" + label
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if out, err := exec.CommandContext(ctx, "launchctl", "print", printLabel).Output(); err == nil {
		return parseLaunchctlPrint(label, string(out))
	}
	listCtx, listCancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer listCancel()
	out, listErr := exec.CommandContext(listCtx, "launchctl", "list", label).Output()
	if listErr != nil {
		return ServiceWatchResult{Name: label, State: "missing", Ok: false}
	}
	return parseLaunchctlList(label, string(out))
}

func parseLaunchctlPrint(label, raw string) ServiceWatchResult {
	low := strings.ToLower(raw)
	if strings.Contains(low, "state = running") || strings.Contains(low, "\tpid =") {
		return ServiceWatchResult{Name: label, State: "running", Ok: true}
	}
	if strings.Contains(low, "state =") {
		return ServiceWatchResult{Name: label, State: "stopped", Ok: false}
	}
	return ServiceWatchResult{Name: label, State: "running", Ok: true}
}

func parseLaunchctlList(label, raw string) ServiceWatchResult {
	for _, line := range strings.Split(raw, "\n") {
		fields := strings.Fields(line)
		if len(fields) < 3 {
			continue
		}
		if fields[2] != label && !strings.HasSuffix(fields[2], label) {
			continue
		}
		pid := fields[0]
		ok := pid != "-"
		state := "stopped"
		if ok {
			state = "running"
		}
		return ServiceWatchResult{Name: label, State: state, Ok: ok}
	}
	if strings.TrimSpace(raw) == "" {
		return ServiceWatchResult{Name: label, State: "running", Ok: true}
	}
	return ServiceWatchResult{Name: label, State: "unknown", Ok: false}
}
