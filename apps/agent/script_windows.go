//go:build windows

package main

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"syscall"
	"time"
)

func runScriptJob(job *ScriptJob) *ScriptResult {
	out := &ScriptResult{JobID: job.ID}
	timeout := time.Duration(job.TimeoutSec) * time.Second
	if job.TimeoutSec < 10 {
		timeout = 60 * time.Second
	}
	if job.TimeoutSec > 120 {
		timeout = 120 * time.Second
	}

	dir := programDataDir()
	if err := os.MkdirAll(dir, 0o700); err != nil {
		out.Error = fmt.Sprintf("Arbeitsverzeichnis: %v", err)
		return out
	}
	ps1 := filepath.Join(dir, "script-job.ps1")
	body := append([]byte{0xEF, 0xBB, 0xBF}, []byte(job.Script)...)
	if err := os.WriteFile(ps1, body, 0o600); err != nil {
		out.Error = fmt.Sprintf("Skript schreiben: %v", err)
		return out
	}
	defer os.Remove(ps1)

	exe, err := exec.LookPath("powershell.exe")
	if err != nil {
		exe, err = exec.LookPath("powershell")
	}
	if err != nil {
		out.Error = "powershell.exe nicht gefunden"
		return out
	}

	cmd := exec.Command(exe, "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", ps1)
	cmd.Dir = dir
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Start(); err != nil {
		out.Error = fmt.Sprintf("Start: %v", err)
		return out
	}
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()

	var waitErr error
	select {
	case waitErr = <-done:
	case <-time.After(timeout):
		if cmd.Process != nil {
			_ = exec.Command("taskkill", "/F", "/T", "/PID", strconv.Itoa(cmd.Process.Pid)).Run()
			_ = cmd.Process.Kill()
		}
		<-done
		out.TimedOut = true
		out.Error = "Zeitüberschreitung"
	}

	code := 0
	if waitErr != nil {
		if ee, ok := waitErr.(*exec.ExitError); ok {
			code = ee.ExitCode()
		} else if !out.TimedOut {
			out.Error = waitErr.Error()
		}
	}
	if cmd.ProcessState != nil {
		code = cmd.ProcessState.ExitCode()
	}
	out.ExitCode = &code
	out.Stdout = clipScriptOutput(stdout.String())
	out.Stderr = clipScriptOutput(stderr.String())
	return out
}
