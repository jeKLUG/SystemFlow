package main

import "strings"

// Remote-PowerShell-Auftrag aus der Heartbeat-Antwort.
type ScriptJob struct {
	ID         string `json:"id"`
	TimeoutSec int    `json:"timeoutSec"`
	Script     string `json:"script"`
}

// Ergebnis, das der Agent im nächsten Heartbeat zurückgibt.
type ScriptResult struct {
	JobID    string `json:"jobId"`
	ExitCode *int   `json:"exitCode,omitempty"`
	Stdout   string `json:"stdout,omitempty"`
	Stderr   string `json:"stderr,omitempty"`
	TimedOut bool   `json:"timedOut,omitempty"`
	Error    string `json:"error,omitempty"`
}

const scriptOutputMax = 64 * 1024

var pendingScriptResult *ScriptResult

func clipScriptOutput(s string) string {
	if len(s) <= scriptOutputMax {
		return s
	}
	return s[:scriptOutputMax] + "\n… (Ausgabe gekürzt)"
}

func maybeRunScriptJob(hb *heartbeatResponse) {
	if hb == nil || hb.Uninstall || hb.ScriptJob == nil {
		return
	}
	if pendingScriptResult != nil {
		return
	}
	job := hb.ScriptJob
	if strings.TrimSpace(job.ID) == "" || strings.TrimSpace(job.Script) == "" {
		return
	}
	pendingScriptResult = runScriptJob(job)
}
