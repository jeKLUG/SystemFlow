//go:build windows

package main

import (
	"fmt"
	"sort"
	"strings"

	"github.com/shirou/gopsutil/v4/disk"
	"golang.org/x/sys/windows"
)

const (
	driveRemovable = 2
	driveFixed     = 3
)

func collectDisks() []DiskSnapshot {
	byID := map[string]DiskSnapshot{}

	mask, err := windows.GetLogicalDrives()
	if err == nil && mask != 0 {
		for i := 0; i < 26; i++ {
			if mask&(1<<uint(i)) == 0 {
				continue
			}
			letter := 'A' + rune(i)
			root := fmt.Sprintf("%c:\\", letter)
			id := fmt.Sprintf("%c:", letter)
			addWindowsDisk(byID, id, root)
		}
	}

	if parts, err := disk.Partitions(true); err == nil {
		for _, p := range parts {
			id := windowsDriveID(p.Mountpoint)
			if id == "" {
				id = windowsDriveID(p.Device)
			}
			if id == "" {
				continue
			}
			if _, exists := byID[id]; exists {
				continue
			}
			root := id + `\`
			if p.Mountpoint != "" {
				root = windowsRoot(p.Mountpoint)
			}
			addWindowsDisk(byID, id, root)
		}
	}

	out := make([]DiskSnapshot, 0, len(byID))
	for _, d := range byID {
		out = append(out, d)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

func addWindowsDisk(byID map[string]DiskSnapshot, id, root string) {
	path, err := windows.UTF16PtrFromString(root)
	if err != nil {
		return
	}
	dt := windows.GetDriveType(path)
	if dt != driveFixed && dt != driveRemovable {
		return
	}
	usage, err := disk.Usage(root)
	if err != nil || usage == nil || usage.Total == 0 {
		usage, err = disk.Usage(strings.TrimRight(root, `\`))
		if err != nil || usage == nil || usage.Total == 0 {
			return
		}
	}
	byID[id] = DiskSnapshot{
		ID:         id,
		Name:       id,
		Mount:      root,
		TotalBytes: usage.Total,
		UsedBytes:  usage.Used,
		FreeBytes:  usage.Free,
	}
}

func windowsDriveID(raw string) string {
	s := strings.TrimSpace(raw)
	if len(s) >= 2 && s[1] == ':' {
		c := s[0]
		if c >= 'a' && c <= 'z' {
			c -= 32
		}
		if c >= 'A' && c <= 'Z' {
			return string(c) + ":"
		}
	}
	return ""
}

func windowsRoot(mount string) string {
	id := windowsDriveID(mount)
	if id == "" {
		return mount
	}
	return id + `\`
}
