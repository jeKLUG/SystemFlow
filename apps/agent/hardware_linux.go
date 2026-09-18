//go:build linux

package main

import (
	"encoding/json"
	"os"
	"os/exec"
	"strconv"
	"strings"
)

func collectHardware() *HardwareInventory {
	hw := &HardwareInventory{
		System: &HardwareSystem{
			Manufacturer: dmi("sys_vendor"),
			Model:        dmi("product_name"),
			Serial:       dmi("product_serial"),
			Sku:          dmi("product_sku"),
		},
		BIOS: &HardwareBIOS{
			Vendor:  dmi("bios_vendor"),
			Version: dmi("bios_version"),
			Date:    dmi("bios_date"),
		},
		Board: &HardwareBoard{
			Manufacturer: dmi("board_vendor"),
			Product:      dmi("board_name"),
			Serial:       dmi("board_serial"),
		},
	}
	hw.System = cleanSystem(hw.System)
	hw.BIOS = cleanBIOS(hw.BIOS)
	hw.Board = cleanBoard(hw.Board)
	hw.MemoryModules = linuxMemoryModules()
	hw.Storage = linuxStorage()
	hw.Gpus = linuxGPUs()
	hw.Nics = linuxNics()
	return hw
}

func dmi(name string) string {
	raw, err := os.ReadFile("/sys/class/dmi/id/" + name)
	if err != nil {
		return ""
	}
	return cleanHW(string(raw))
}

func linuxMemoryModules() []HardwareMemoryModule {
	out, err := exec.Command("dmidecode", "-t", "17").Output()
	if err != nil {
		return nil
	}
	var mods []HardwareMemoryModule
	var cur HardwareMemoryModule
	inDevice := false
	flush := func() {
		if !inDevice || cur.SizeBytes == 0 {
			cur = HardwareMemoryModule{}
			return
		}
		mods = append(mods, cur)
		cur = HardwareMemoryModule{}
	}
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if line == "Memory Device" {
			flush()
			inDevice = true
			continue
		}
		if !inDevice || !strings.Contains(line, ":") {
			continue
		}
		key, val, _ := strings.Cut(line, ":")
		key = strings.TrimSpace(key)
		val = cleanHW(strings.TrimSpace(val))
		switch key {
		case "Size":
			cur.SizeBytes = parseSizeToBytes(val)
		case "Speed":
			cur.SpeedMhz = parseLeadingInt(val)
		case "Manufacturer":
			cur.Manufacturer = val
		case "Part Number":
			cur.PartNumber = val
		case "Serial Number":
			cur.Serial = val
		case "Locator", "Bank Locator":
			if cur.Slot == "" {
				cur.Slot = val
			}
		case "Type":
			cur.Type = val
		}
	}
	flush()
	return mods
}

func parseSizeToBytes(s string) uint64 {
	low := strings.ToLower(s)
	if low == "" || strings.Contains(low, "no module") || strings.Contains(low, "unknown") {
		return 0
	}
	n := parseLeadingInt(s)
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
		return uint64(n) * 1024 * 1024
	}
}

func parseLeadingInt(s string) int {
	n := 0
	for _, c := range s {
		if c < '0' || c > '9' {
			if n > 0 {
				break
			}
			continue
		}
		n = n*10 + int(c-'0')
	}
	return n
}

func linuxStorage() []HardwareStorage {
	out, err := exec.Command("lsblk", "-d", "-b", "-J", "-o", "NAME,MODEL,SERIAL,SIZE,ROTA,TRAN,TYPE").Output()
	if err != nil {
		return nil
	}
	var parsed struct {
		Blockdevices []struct {
			Name   string `json:"name"`
			Model  string `json:"model"`
			Serial string `json:"serial"`
			Size   any    `json:"size"`
			Rota   any    `json:"rota"`
			Tran   string `json:"tran"`
			Type   string `json:"type"`
		} `json:"blockdevices"`
	}
	if json.Unmarshal(out, &parsed) != nil {
		return nil
	}
	var storage []HardwareStorage
	for _, d := range parsed.Blockdevices {
		if d.Type != "" && d.Type != "disk" {
			continue
		}
		media := "HDD"
		if !truthy(d.Rota) {
			media = "SSD"
		}
		storage = append(storage, HardwareStorage{
			Name:      cleanHW(d.Name),
			Model:     cleanHW(d.Model),
			Serial:    cleanHW(d.Serial),
			SizeBytes: anyToUint(d.Size),
			Bus:       cleanHW(d.Tran),
			Media:     media,
		})
	}
	return storage
}

func linuxGPUs() []HardwareGPU {
	out, err := exec.Command("lspci", "-mm").Output()
	if err != nil {
		return nil
	}
	var gpus []HardwareGPU
	for _, line := range strings.Split(string(out), "\n") {
		low := strings.ToLower(line)
		if !strings.Contains(low, "vga") && !strings.Contains(low, "3d controller") && !strings.Contains(low, "display") {
			continue
		}
		name := strings.TrimSpace(line)
		if i := strings.Index(name, " "); i > 0 {
			name = strings.Trim(name[i+1:], `"`)
		}
		name = strings.ReplaceAll(name, `" "`, " / ")
		name = strings.ReplaceAll(name, `"`, "")
		gpus = append(gpus, HardwareGPU{Name: cleanHW(name)})
	}
	return gpus
}

func linuxNics() []HardwareNic {
	entries, err := os.ReadDir("/sys/class/net")
	if err != nil {
		return nil
	}
	var nics []HardwareNic
	for _, e := range entries {
		name := e.Name()
		if name == "lo" || strings.HasPrefix(name, "docker") || strings.HasPrefix(name, "veth") || strings.HasPrefix(name, "br-") {
			continue
		}
		mac := readTrim("/sys/class/net/" + name + "/address")
		if mac == "" || mac == "00:00:00:00:00:00" {
			continue
		}
		speed := parseLeadingInt(readTrim("/sys/class/net/" + name + "/speed"))
		nics = append(nics, HardwareNic{Name: name, MAC: strings.ToUpper(mac), SpeedMbps: speed})
	}
	return nics
}

func readTrim(path string) string {
	raw, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(raw))
}

func truthy(v any) bool {
	switch t := v.(type) {
	case bool:
		return t
	case float64:
		return t != 0
	case string:
		return t == "1" || strings.EqualFold(t, "true")
	default:
		return false
	}
}

func anyToUint(v any) uint64 {
	switch t := v.(type) {
	case float64:
		if t < 0 {
			return 0
		}
		return uint64(t)
	case string:
		n, _ := strconv.ParseUint(t, 10, 64)
		return n
	default:
		return 0
	}
}
