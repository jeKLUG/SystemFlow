//go:build windows

package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
)

func applyAgentUpdate(newPath string) error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	exe, err = filepath.Abs(exe)
	if err != nil {
		return err
	}
	newPath, err = filepath.Abs(newPath)
	if err != nil {
		return err
	}
	dir := filepath.Dir(exe)
	bat := filepath.Join(dir, "apply-update.cmd")
	script := fmt.Sprintf("@echo off\r\n"+
		"timeout /t 3 /nobreak >nul\r\n"+
		"net stop %s\r\n"+
		"copy /Y \"%s\" \"%s\"\r\n"+
		"net start %s\r\n"+
		"del \"%s\"\r\n"+
		"del \"%%~f0\"\r\n",
		serviceName, newPath, exe, serviceName, newPath)
	if err := os.WriteFile(bat, []byte(script), 0o755); err != nil {
		return err
	}
	cmd := exec.Command("cmd.exe", "/C", "start", "/MIN", "", bat)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	return cmd.Start()
}
