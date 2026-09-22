//go:build !windows

package main

func runScriptJob(job *ScriptJob) *ScriptResult {
	return &ScriptResult{
		JobID: job.ID,
		Error: "PowerShell-Aufträge gibt es nur unter Windows.",
	}
}
