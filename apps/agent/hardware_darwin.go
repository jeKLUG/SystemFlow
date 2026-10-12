//go:build darwin

package main

import (
	"context"
	"encoding/json"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

func collectHardware() *HardwareInventory {
	hw := &HardwareInventory{}
	ctx, cancel := context.WithTimeout(context.Background(), 18*time.Second)
	defer cancel()
	raw, err := exec.CommandContext(ctx, "system_profiler", "SPHardwareDataType", "SPMemoryDataType", "SPDisplaysDataType", "SPStorageDataType", "SPNetworkDataType", "-json").Output()
	if err != nil {
		return hw
	}
	var doc map[string]json.RawMessage
	if json.Unmarshal(raw, &doc) != nil {
		return hw
	}
	hw.System, hw.BIOS = macHardwareSystem(doc["SPHardwareDataType"])
	hw.MemoryModules = macMemory(doc["SPMemoryDataType"])
	hw.Gpus = macGPUs(doc["SPDisplaysDataType"])
	hw.Storage = macStorage(doc["SPStorageDataType"])
	hw.Nics = macNics(doc["SPNetworkDataType"])
	hw.System = cleanSystem(hw.System)
	hw.BIOS = cleanBIOS(hw.BIOS)
	return hw
}

func macHardwareSystem(raw json.RawMessage) (*HardwareSystem, *HardwareBIOS) {
	type row struct {
		MachineName     string `json:"machine_name"`
		MachineModel    string `json:"machine_model"`
		SerialNumber    string `json:"serial_number"`
		CPUType         string `json:"cpu_type"`
		ChipType        string `json:"chip_type"`
		BootROMVersion  string `json:"boot_rom_version"`
		PhysicalMemory  string `json:"physical_memory"`
	}
	items := parseOneOrMany[row](raw)
	if len(items) == 0 {
		return nil, nil
	}
	r := items[0]
	sys := &HardwareSystem{
		Manufacturer: "Apple",
		Model:        firstNonEmpty(r.MachineName, r.MachineModel),
		Serial:       r.SerialNumber,
		Sku:          r.MachineModel,
	}
	bios := &HardwareBIOS{
		Vendor:  "Apple",
		Version: firstNonEmpty(r.ChipType, r.CPUType, r.BootROMVersion),
	}
	return sys, bios
}

func macMemory(raw json.RawMessage) []HardwareMemoryModule {
	type memNode struct {
		Name         string    `json:"_name"`
		PartNumber   string    `json:"dimm_part_number"`
		Manufacturer string    `json:"dimm_manufacturer"`
		Size         string    `json:"dimm_size"`
		Speed        string    `json:"dimm_speed"`
		Type         string    `json:"dimm_type"`
		Serial       string    `json:"dimm_serial_number"`
		Items        []memNode `json:"_items"`
	}
	nodes := parseOneOrMany[memNode](raw)
	var mods []HardwareMemoryModule
	var walk func([]memNode)
	walk = func(xs []memNode) {
		for _, d := range xs {
			low := strings.ToLower(d.Size)
			if d.Size != "" && low != "empty" && low != "not installed" {
				size := parseSizeToBytesMac(d.Size)
				if size > 0 {
					mods = append(mods, HardwareMemoryModule{
						Slot:         d.Name,
						SizeBytes:    size,
						SpeedMhz:     parseLeadingIntMac(d.Speed),
						Manufacturer: d.Manufacturer,
						PartNumber:   d.PartNumber,
						Serial:       d.Serial,
						Type:         d.Type,
					})
				}
			}
			if len(d.Items) > 0 {
				walk(d.Items)
			}
		}
	}
	walk(nodes)
	return mods
}

func macGPUs(raw json.RawMessage) []HardwareGPU {
	type gpu struct {
		Title string `json:"_name"`
		Name  string `json:"sppci_model"`
		Vram  string `json:"sppci_vram"`
		Chip  string `json:"sppci_cores"`
	}
	items := parseOneOrMany[gpu](raw)
	var list []HardwareGPU
	for _, g := range items {
		name := firstNonEmpty(g.Name, g.Title, g.Chip)
		if name == "" {
			continue
		}
		list = append(list, HardwareGPU{Name: name, VramBytes: parseSizeToBytesMac(g.Vram)})
	}
	return list
}

func macStorage(raw json.RawMessage) []HardwareStorage {
	type disk struct {
		Name     string          `json:"_name"`
		Size     json.RawMessage `json:"size_in_bytes"`
		Medium   string          `json:"spsata_medium_type"`
		Protocol string          `json:"spsata_protocol"`
		Smart    string          `json:"smart_status"`
		BSD      string          `json:"bsd_name"`
	}
	items := parseOneOrMany[disk](raw)
	var list []HardwareStorage
	for _, d := range items {
		size := jsonToUintMac(d.Size)
		if size == 0 {
			continue
		}
		health := ""
		switch strings.ToLower(d.Smart) {
		case "verified":
			health = "ok"
		case "failing", "failed":
			health = "fail"
		}
		list = append(list, HardwareStorage{
			Name:      firstNonEmpty(d.Name, d.BSD),
			SizeBytes: size,
			Bus:       d.Protocol,
			Media:     d.Medium,
			Health:    health,
		})
	}
	return list
}

func macNics(raw json.RawMessage) []HardwareNic {
	type iface struct {
		Name       string `json:"_name"`
		Interface  string `json:"interface"`
		MAC        string `json:"EthernetAddress"`
		Speed      string `json:"spnetwork_linkspeed"`
		Ethernet   *struct {
			MAC string `json:"MAC Address"`
		} `json:"Ethernet"`
		Interfaces []iface `json:"_items"`
	}
	items := parseOneOrMany[iface](raw)
	var list []HardwareNic
	var walk func([]iface)
	walk = func(xs []iface) {
		for _, n := range xs {
			mac := n.MAC
			if mac == "" && n.Ethernet != nil {
				mac = n.Ethernet.MAC
			}
			name := firstNonEmpty(n.Interface, n.Name)
			low := strings.ToLower(name)
			if low == "lo" || strings.HasPrefix(low, "lo0") || strings.HasPrefix(low, "utun") || strings.HasPrefix(low, "awdl") || strings.HasPrefix(low, "llw") {
				if len(n.Interfaces) > 0 {
					walk(n.Interfaces)
				}
				continue
			}
			if mac != "" || n.Speed != "" {
				list = append(list, HardwareNic{
					Name:      name,
					MAC:       mac,
					SpeedMbps: parseLeadingIntMac(n.Speed),
				})
			}
			if len(n.Interfaces) > 0 {
				walk(n.Interfaces)
			}
		}
	}
	walk(items)
	return list
}

func jsonToUintMac(raw json.RawMessage) uint64 {
	s := strings.TrimSpace(string(raw))
	s = strings.Trim(s, `"`)
	if s == "" || s == "null" {
		return 0
	}
	n, err := strconv.ParseUint(s, 10, 64)
	if err == nil {
		return n
	}
	return parseSizeToBytesMac(s)
}

func parseSizeToBytesMac(s string) uint64 {
	low := strings.ToLower(strings.TrimSpace(s))
	if low == "" {
		return 0
	}
	n := parseLeadingIntMac(s)
	if n <= 0 {
		return 0
	}
	switch {
	case strings.Contains(low, "tb"):
		return uint64(n) * 1024 * 1024 * 1024 * 1024
	case strings.Contains(low, "gb"):
		return uint64(n) * 1024 * 1024 * 1024
	case strings.Contains(low, "mb"):
		return uint64(n) * 1024 * 1024
	default:
		return uint64(n)
	}
}

func parseLeadingIntMac(s string) int {
	n := 0
	found := false
	for _, c := range s {
		if c >= '0' && c <= '9' {
			found = true
			n = n*10 + int(c-'0')
			continue
		}
		if found {
			break
		}
	}
	return n
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		v = strings.TrimSpace(v)
		if v != "" {
			return v
		}
	}
	return ""
}
