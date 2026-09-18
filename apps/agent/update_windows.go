//go:build windows

package main

import (
	"fmt"
	"os"
	"path/filepath"
)

func applyAgentUpdate(newPath string) error {
	exe := installedExePath()
	newPath, err := filepath.Abs(newPath)
	if err != nil {
		return err
	}
	bat := filepath.Join(os.TempDir(), "systemhaus-agent-apply-update.cmd")
	script := fmt.Sprintf("@echo off\r\n"+
		"timeout /t 4 /nobreak >nul\r\n"+
		"sc stop %s >nul 2>&1\r\n"+
		"timeout /t 4 /nobreak >nul\r\n"+
		"copy /Y \"%s\" \"%s\" >nul\r\n"+
		"if errorlevel 1 ping -n 4 127.0.0.1 >nul & copy /Y \"%s\" \"%s\" >nul\r\n"+
		"sc start %s >nul 2>&1\r\n"+
		"del /f /q \"%s\" >nul 2>&1\r\n"+
		"del /f /q \"%%~f0\" >nul 2>&1\r\n",
		serviceName, newPath, exe, newPath, exe, serviceName, newPath)
	if err := os.WriteFile(bat, []byte(script), 0o755); err != nil {
		return err
	}
	return startDetached(bat)
}
