//go:build windows

package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"golang.org/x/sys/windows/registry"
	"golang.org/x/sys/windows/svc"
	"golang.org/x/sys/windows/svc/mgr"
)

const serviceName = "SystemhausAgent"

func platformConfigPath() string {
	base := os.Getenv("PROGRAMDATA")
	if base == "" {
		base = `C:\ProgramData`
	}
	return filepath.Join(base, "SystemhausEss", "agent.json")
}

func machineID() string {
	k, err := registry.OpenKey(registry.LOCAL_MACHINE, `SOFTWARE\Microsoft\Cryptography`, registry.QUERY_VALUE|registry.WOW64_64KEY)
	if err != nil {
		return hostnameFallback()
	}
	defer k.Close()
	id, _, err := k.GetStringValue("MachineGuid")
	if err != nil || id == "" {
		return hostnameFallback()
	}
	return id
}

var lastUpdates *UpdateSnapshot
var lastUpdatesAt time.Time
var lastEvents []EventSnapshot
var lastEventsAt time.Time

func collectUpdates() *UpdateSnapshot {
	if time.Since(lastUpdatesAt) < 30*time.Minute && lastUpdates != nil {
		return lastUpdates
	}
	cmd := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command", `
$ErrorActionPreference='SilentlyContinue'
$count = 0
try {
  $s = New-Object -ComObject Microsoft.Update.Session
  $r = $s.CreateUpdateSearcher().Search('IsInstalled=0 and IsHidden=0')
  $count = $r.Updates.Count
} catch {}
$last = $null
try { $last = (Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object -First 1).InstalledOn.ToString('yyyy-MM-dd') } catch {}
Write-Output ("{0}|{1}" -f $count, $last)
`)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	out, err := cmd.Output()
	if err != nil {
		return lastUpdates
	}
	parts := strings.SplitN(strings.TrimSpace(string(out)), "|", 2)
	pending := 0
	if len(parts) > 0 {
		fmtS := strings.TrimSpace(parts[0])
		for _, c := range fmtS {
			if c < '0' || c > '9' {
				fmtS = "0"
				break
			}
		}
		for _, c := range fmtS {
			pending = pending*10 + int(c-'0')
		}
	}
	var last *string
	if len(parts) > 1 {
		v := strings.TrimSpace(parts[1])
		if v != "" && !strings.EqualFold(v, "null") {
			last = &v
		}
	}
	lastUpdates = &UpdateSnapshot{PendingCount: pending, LastInstalled: last}
	lastUpdatesAt = time.Now()
	return lastUpdates
}

func collectEvents() []EventSnapshot {
	if time.Since(lastEventsAt) < 50*time.Second && lastEvents != nil {
		return lastEvents
	}
	cmd := exec.Command("wevtutil", "qe", "System", "/q:*[System[(Level=2) and TimeCreated[timediff(@SystemTime) <= 120000]]]", "/c:15", "/rd:true", "/f:text")
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	out, err := cmd.Output()
	if err != nil {
		return lastEvents
	}
	var events []EventSnapshot
	blocks := strings.Split(string(out), "Event[")
	for _, b := range blocks {
		b = strings.TrimSpace(b)
		if b == "" {
			continue
		}
		msg := strings.TrimSpace(b)
		if len(msg) > 500 {
			msg = msg[:500]
		}
		events = append(events, EventSnapshot{Source: "System", Level: "error", Message: msg})
	}
	lastEvents = events
	lastEventsAt = time.Now()
	return events
}

func installBinaryPath() (string, error) {
	src, err := os.Executable()
	if err != nil {
		return "", err
	}
	src, err = filepath.Abs(src)
	if err != nil {
		return "", err
	}
	base := os.Getenv("PROGRAMDATA")
	if base == "" {
		base = `C:\ProgramData`
	}
	dest := filepath.Join(base, "SystemhausEss", "systemhaus-agent.exe")
	if err := copyFile(src, dest); err != nil {
		if samePath(src, dest) {
			return dest, nil
		}
		return "", err
	}
	return dest, nil
}

func configureServiceRecovery() {
	cmd := exec.Command("sc.exe", "failure", serviceName, "reset=", "86400", "actions=", "restart/5000/restart/15000/restart/60000")
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	_ = cmd.Run()
	flag := exec.Command("sc.exe", "failureflag", serviceName, "1")
	flag.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	_ = flag.Run()
}

func installService(cfgPath string) error {
	exe, err := installBinaryPath()
	if err != nil {
		return err
	}
	m, err := mgr.Connect()
	if err != nil {
		return err
	}
	defer m.Disconnect()
	s, err := m.OpenService(serviceName)
	if err != nil {
		s, err = m.CreateService(serviceName, exe, mgr.Config{
			DisplayName: "Systemhaus-Ess Monitoring",
			StartType:   mgr.StartAutomatic,
			Description: "Sendet Systemdaten an Systemhaus-Ess",
		})
		if err != nil {
			return err
		}
	} else {
		cfg, cfgErr := s.Config()
		if cfgErr == nil {
			cfg.StartType = mgr.StartAutomatic
			cfg.BinaryPathName = `"` + exe + `"`
			cfg.DisplayName = "Systemhaus-Ess Monitoring"
			_ = s.UpdateConfig(cfg)
		}
	}
	defer s.Close()
	configureServiceRecovery()
	_ = s.Start()
	return nil
}

func uninstallService() error {
	m, err := mgr.Connect()
	if err != nil {
		return err
	}
	defer m.Disconnect()
	s, err := m.OpenService(serviceName)
	if err != nil {
		return nil
	}
	defer s.Close()
	_, _ = s.Control(svc.Stop)
	return s.Delete()
}

type agentService struct {
	cfgPath string
}

func (a *agentService) Execute(args []string, r <-chan svc.ChangeRequest, changes chan<- svc.Status) (bool, uint32) {
	const cmds = svc.AcceptStop | svc.AcceptShutdown
	changes <- svc.Status{State: svc.StartPending}
	changes <- svc.Status{State: svc.Running, Accepts: cmds}
	done := make(chan struct{})
	go func() {
		_ = runLoop(a.cfgPath)
		close(done)
	}()
	for {
		select {
		case <-done:
			changes <- svc.Status{State: svc.StopPending}
			return false, 0
		case c := <-r:
			switch c.Cmd {
			case svc.Interrogate:
				changes <- c.CurrentStatus
			case svc.Stop, svc.Shutdown:
				changes <- svc.Status{State: svc.StopPending}
				return false, 0
			}
		}
	}
}

func maybeRunService(cfgPath string) error {
	isSvc, err := svc.IsWindowsService()
	if err == nil && isSvc {
		return svc.Run(serviceName, &agentService{cfgPath: cfgPath})
	}
	return runLoop(cfgPath)
}
