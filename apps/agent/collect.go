package main

import (
	"runtime"
	"sort"
	"strings"
	"time"

	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/host"
	"github.com/shirou/gopsutil/v4/mem"
	"github.com/shirou/gopsutil/v4/net"
	"github.com/shirou/gopsutil/v4/process"
)

type DiskSnapshot struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Mount      string `json:"mount,omitempty"`
	TotalBytes uint64 `json:"totalBytes"`
	UsedBytes  uint64 `json:"usedBytes"`
	FreeBytes  uint64 `json:"freeBytes"`
}

type NicSnapshot struct {
	Name      string `json:"name"`
	BytesRecv uint64 `json:"bytesRecv"`
	BytesSent uint64 `json:"bytesSent"`
	Up        bool   `json:"up"`
}

type ProcessSnapshot struct {
	Name       string  `json:"name"`
	PID        int32   `json:"pid,omitempty"`
	CPUPercent float64 `json:"cpuPercent,omitempty"`
	RSSBytes   uint64  `json:"rssBytes,omitempty"`
}

type EventSnapshot struct {
	Source  string `json:"source,omitempty"`
	Level   string `json:"level,omitempty"`
	Time    string `json:"time,omitempty"`
	Message string `json:"message"`
}

type UpdateSnapshot struct {
	PendingCount  int     `json:"pendingCount"`
	LastInstalled *string `json:"lastInstalled"`
	RebootPending bool    `json:"rebootPending,omitempty"`
}

type AgentSnapshot struct {
	Hostname      string             `json:"hostname,omitempty"`
	OS            string             `json:"os,omitempty"`
	OSVersion     string             `json:"osVersion,omitempty"`
	Arch          string             `json:"arch,omitempty"`
	UptimeSec     uint64             `json:"uptimeSec,omitempty"`
	AgentVersion  string             `json:"agentVersion,omitempty"`
	Platform      string             `json:"platform,omitempty"`
	IP            string             `json:"ip,omitempty"`
	IPs           []string           `json:"ips,omitempty"`
	MAC           string             `json:"mac,omitempty"`
	CPUPercent    *float64           `json:"cpuPercent"`
	RAMUsedBytes  *uint64            `json:"ramUsedBytes"`
	RAMTotalBytes *uint64            `json:"ramTotalBytes"`
	Disks         []DiskSnapshot     `json:"disks,omitempty"`
	NICs          []NicSnapshot      `json:"nics,omitempty"`
	Processes     []ProcessSnapshot  `json:"processes,omitempty"`
	Updates       *UpdateSnapshot    `json:"updates,omitempty"`
	Events        []EventSnapshot    `json:"events,omitempty"`
	Hardware      *HardwareInventory `json:"hardware,omitempty"`
	Session       *SessionSnapshot   `json:"session,omitempty"`
	Network       *NetworkSnapshot   `json:"network,omitempty"`
	Services      []ServiceSnapshot  `json:"services,omitempty"`
	Software      []SoftwareSnapshot `json:"software,omitempty"`
	Defender      *DefenderSnapshot  `json:"defender,omitempty"`
	Firewall      *FirewallSnapshot  `json:"firewall,omitempty"`
	Crash         *CrashSnapshot     `json:"crash,omitempty"`
	Pings         []PingResult       `json:"pings,omitempty"`
}

func goosName() string {
	switch runtime.GOOS {
	case "windows":
		return "Windows"
	case "linux":
		return "Linux"
	default:
		return runtime.GOOS
	}
}

func hostnameFallback() string {
	info, err := host.Info()
	if err != nil {
		return ""
	}
	return info.Hostname
}

func collectSnapshot() (AgentSnapshot, error) {
	var snap AgentSnapshot
	snap.Arch = runtime.GOARCH
	snap.OS = goosName()
	snap.AgentVersion = agentVersion
	snap.Platform = agentPlatformID()

	if info, err := host.Info(); err == nil {
		snap.Hostname = info.Hostname
		snap.OSVersion = strings.TrimSpace(info.Platform + " " + info.PlatformVersion)
		snap.UptimeSec = info.Uptime
	}

	if pcts, err := cpu.Percent(800*time.Millisecond, false); err == nil && len(pcts) > 0 {
		v := pcts[0]
		snap.CPUPercent = &v
	}

	if vm, err := mem.VirtualMemory(); err == nil {
		used := vm.Used
		total := vm.Total
		snap.RAMUsedBytes = &used
		snap.RAMTotalBytes = &total
	}

	snap.Disks = collectDisks()

	if nics, err := net.IOCounters(true); err == nil {
		for _, n := range nics {
			if n.Name == "lo" || strings.HasPrefix(n.Name, "Loopback") {
				continue
			}
			snap.NICs = append(snap.NICs, NicSnapshot{
				Name:      n.Name,
				BytesRecv: n.BytesRecv,
				BytesSent: n.BytesSent,
				Up:        true,
			})
		}
	}

	if ifaces, err := net.Interfaces(); err == nil {
		var ips []string
		for _, iface := range ifaces {
			for _, addr := range iface.Addrs {
				ip := strings.SplitN(addr.Addr, "/", 2)[0]
				if ip == "" || ip == "127.0.0.1" || ip == "::1" || strings.HasPrefix(ip, "fe80:") {
					continue
				}
				ips = append(ips, ip)
				if snap.IP == "" {
					snap.IP = ip
				}
			}
			if snap.MAC == "" && iface.HardwareAddr != "" {
				snap.MAC = iface.HardwareAddr
			}
		}
		snap.IPs = ips
	}

	snap.Processes = collectProcesses()
	updates := collectUpdates()
	if updates == nil {
		updates = &UpdateSnapshot{}
	} else {
		cp := *updates
		updates = &cp
	}
	updates.RebootPending = collectRebootPending()
	snap.Updates = updates
	snap.Events = collectEvents()
	snap.Hardware = collectHardwareCached()
	snap.Session = collectSession()
	snap.Network = collectNetwork()
	probeNetwork(snap.Network)
	snap.Services = collectFailedServices()
	snap.Software = collectSoftwareCached()
	snap.Defender = collectDefender()
	snap.Firewall = collectFirewall()
	snap.Crash = collectCrash()
	snap.Pings = probePings(currentPingTargets())
	return snap, nil
}

const processKeep = 60
const processTop = 40

func collectProcesses() []ProcessSnapshot {
	procs, err := process.Processes()
	if err != nil {
		return nil
	}
	for _, pr := range procs {
		_, _ = pr.CPUPercent()
	}
	time.Sleep(220 * time.Millisecond)

	type row struct {
		p   ProcessSnapshot
		cpu float64
		rss uint64
	}
	var rows []row
	for _, pr := range procs {
		name, err := pr.Name()
		if err != nil || name == "" {
			continue
		}
		cpuPct, _ := pr.CPUPercent()
		if cpuPct < 0 {
			cpuPct = 0
		}
		var rss uint64
		if mi, err := pr.MemoryInfo(); err == nil && mi != nil {
			rss = mi.RSS
		}
		rows = append(rows, row{
			p:   ProcessSnapshot{Name: name, PID: pr.Pid, CPUPercent: cpuPct, RSSBytes: rss},
			cpu: cpuPct,
			rss: rss,
		})
	}
	if len(rows) == 0 {
		return nil
	}

	byCPU := append([]row(nil), rows...)
	sort.Slice(byCPU, func(i, j int) bool { return byCPU[i].cpu > byCPU[j].cpu })
	byRSS := append([]row(nil), rows...)
	sort.Slice(byRSS, func(i, j int) bool { return byRSS[i].rss > byRSS[j].rss })

	seen := map[int32]struct{}{}
	out := make([]ProcessSnapshot, 0, processKeep)
	take := func(list []row, n int) {
		for _, r := range list {
			if len(out) >= processKeep || n <= 0 {
				return
			}
			pid := r.p.PID
			if pid != 0 {
				if _, ok := seen[pid]; ok {
					continue
				}
				seen[pid] = struct{}{}
			}
			out = append(out, r.p)
			n--
		}
	}
	take(byCPU, processTop)
	take(byRSS, processTop)
	return out
}
