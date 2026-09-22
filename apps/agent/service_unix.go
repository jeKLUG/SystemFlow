//go:build !windows

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
	unit := name
	row := systemctlShow(unit)
	if row.State == "missing" && !strings.Contains(unit, ".") {
		row = systemctlShow(unit + ".service")
	}
	row.Name = name
	return row
}

func systemctlShow(unit string) ServiceWatchResult {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "systemctl", "show", unit, "--no-pager", "-p", "LoadState", "-p", "ActiveState", "-p", "Description")
	out, err := cmd.Output()
	if err != nil {
		return ServiceWatchResult{Name: unit, State: "unknown", Ok: false}
	}
	load := ""
	active := ""
	desc := ""
	for _, line := range strings.Split(string(out), "\n") {
		key, val, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		switch key {
		case "LoadState":
			load = strings.TrimSpace(val)
		case "ActiveState":
			active = strings.TrimSpace(val)
		case "Description":
			desc = strings.TrimSpace(val)
		}
	}
	if load == "not-found" {
		return ServiceWatchResult{Name: unit, State: "missing", Ok: false}
	}
	ok := active == "active"
	state := active
	if state == "" {
		state = "unknown"
	}
	if desc == unit || strings.EqualFold(desc, unit+".service") {
		desc = ""
	}
	return ServiceWatchResult{Name: unit, Display: desc, State: state, Ok: ok}
}
