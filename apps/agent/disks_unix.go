//go:build !windows

package main

import (
	"sort"
	"strings"

	"github.com/shirou/gopsutil/v4/disk"
)

var skipFS = map[string]bool{
	"tmpfs": true, "devtmpfs": true, "devfs": true, "overlay": true, "squashfs": true,
	"proc": true, "sysfs": true, "cgroup": true, "cgroup2": true, "nsfs": true,
	"bpf": true, "tracefs": true, "debugfs": true, "securityfs": true, "pstore": true,
	"ramfs": true, "autofs": true, "efivarfs": true, "fusectl": true, "mqueue": true,
	"hugetlbfs": true, "configfs": true, "binfmt_misc": true, "rpc_pipefs": true,
}

func collectDisks() []DiskSnapshot {
	parts, err := disk.Partitions(true)
	if err != nil {
		return nil
	}
	seen := map[string]bool{}
	var out []DiskSnapshot
	for _, p := range parts {
		fs := strings.ToLower(p.Fstype)
		if skipFS[fs] || strings.HasPrefix(fs, "fuse.") {
			continue
		}
		mount := p.Mountpoint
		if mount == "" || seen[mount] {
			continue
		}
		if strings.HasPrefix(mount, "/snap/") || strings.HasPrefix(mount, "/var/lib/docker/") {
			continue
		}
		usage, err := disk.Usage(mount)
		if err != nil || usage == nil || usage.Total < 64*1024*1024 {
			continue
		}
		seen[mount] = true
		id := strings.TrimRight(mount, "/")
		if id == "" {
			id = "/"
		}
		out = append(out, DiskSnapshot{
			ID:         id,
			Name:       id,
			Mount:      mount,
			TotalBytes: usage.Total,
			UsedBytes:  usage.Used,
			FreeBytes:  usage.Free,
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}
