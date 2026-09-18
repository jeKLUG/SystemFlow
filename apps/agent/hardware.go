package main

import (
	"bytes"
	"encoding/json"
	"strings"
	"time"

	"github.com/shirou/gopsutil/v4/cpu"
)

type HardwareSystem struct {
	Manufacturer string `json:"manufacturer,omitempty"`
	Model        string `json:"model,omitempty"`
	Serial       string `json:"serial,omitempty"`
	Sku          string `json:"sku,omitempty"`
}

type HardwareBIOS struct {
	Vendor  string `json:"vendor,omitempty"`
	Version string `json:"version,omitempty"`
	Date    string `json:"date,omitempty"`
	Serial  string `json:"serial,omitempty"`
}

type HardwareBoard struct {
	Manufacturer string `json:"manufacturer,omitempty"`
	Product      string `json:"product,omitempty"`
	Serial       string `json:"serial,omitempty"`
}

type HardwareCPU struct {
	Name     string `json:"name,omitempty"`
	Cores    int    `json:"cores,omitempty"`
	Threads  int    `json:"threads,omitempty"`
	Mhz      int    `json:"mhz,omitempty"`
	Socket   string `json:"socket,omitempty"`
}

type HardwareMemoryModule struct {
	Slot         string `json:"slot,omitempty"`
	SizeBytes    uint64 `json:"sizeBytes,omitempty"`
	SpeedMhz     int    `json:"speedMhz,omitempty"`
	Manufacturer string `json:"manufacturer,omitempty"`
	PartNumber   string `json:"partNumber,omitempty"`
	Serial       string `json:"serial,omitempty"`
	Type         string `json:"type,omitempty"`
}

type HardwareStorage struct {
	Name   string `json:"name,omitempty"`
	Model  string `json:"model,omitempty"`
	Serial string `json:"serial,omitempty"`
	SizeBytes uint64 `json:"sizeBytes,omitempty"`
	Bus    string `json:"bus,omitempty"`
	Media  string `json:"media,omitempty"`
}

type HardwareGPU struct {
	Name       string `json:"name,omitempty"`
	Driver     string `json:"driver,omitempty"`
	VramBytes  uint64 `json:"vramBytes,omitempty"`
}

type HardwareNic struct {
	Name         string `json:"name,omitempty"`
	MAC          string `json:"mac,omitempty"`
	Manufacturer string `json:"manufacturer,omitempty"`
	SpeedMbps    int    `json:"speedMbps,omitempty"`
}

type HardwareInventory struct {
	System         *HardwareSystem          `json:"system,omitempty"`
	BIOS           *HardwareBIOS            `json:"bios,omitempty"`
	Board          *HardwareBoard           `json:"board,omitempty"`
	Cpus           []HardwareCPU            `json:"cpus,omitempty"`
	MemoryModules  []HardwareMemoryModule   `json:"memoryModules,omitempty"`
	Storage        []HardwareStorage        `json:"storage,omitempty"`
	Gpus           []HardwareGPU            `json:"gpus,omitempty"`
	Nics           []HardwareNic            `json:"nics,omitempty"`
}

var lastHardware *HardwareInventory
var lastHardwareAt time.Time

func collectHardwareCached() *HardwareInventory {
	if time.Since(lastHardwareAt) < 6*time.Hour && lastHardware != nil {
		return lastHardware
	}
	hw := collectHardware()
	enrichHardwareFromGopsutil(hw)
	if hardwareEmpty(hw) {
		return lastHardware
	}
	lastHardware = hw
	lastHardwareAt = time.Now()
	return hw
}

func hardwareEmpty(hw *HardwareInventory) bool {
	if hw == nil {
		return true
	}
	return hw.System == nil && hw.BIOS == nil && hw.Board == nil &&
		len(hw.Cpus) == 0 && len(hw.MemoryModules) == 0 &&
		len(hw.Storage) == 0 && len(hw.Gpus) == 0 && len(hw.Nics) == 0
}

func enrichHardwareFromGopsutil(hw *HardwareInventory) {
	if hw == nil {
		return
	}
	if len(hw.Cpus) > 0 {
		return
	}
	info, err := cpu.Info()
	if err != nil || len(info) == 0 {
		return
	}
	c0 := info[0]
	hw.Cpus = []HardwareCPU{{
		Name:    strings.TrimSpace(c0.ModelName),
		Cores:   int(c0.Cores),
		Threads: len(info),
		Mhz:     int(c0.Mhz),
	}}
}

func cleanHW(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	low := strings.ToLower(s)
	switch {
	case strings.Contains(low, "to be filled"),
		strings.Contains(low, "default string"),
		strings.Contains(low, "o.e.m."),
		low == "none",
		low == "n/a",
		low == "unknown",
		low == "null",
		low == "system serial number",
		low == "system product name",
		low == "system manufacturer":
		return ""
	}
	return s
}

func parseOneOrMany[T any](raw json.RawMessage) []T {
	raw = bytes.TrimSpace(raw)
	if len(raw) == 0 || bytes.Equal(raw, []byte("null")) {
		return nil
	}
	if raw[0] == '[' {
		var xs []T
		if json.Unmarshal(raw, &xs) != nil {
			return nil
		}
		return xs
	}
	var one T
	if json.Unmarshal(raw, &one) != nil {
		return nil
	}
	return []T{one}
}

func cleanSystem(s *HardwareSystem) *HardwareSystem {
	if s == nil {
		return nil
	}
	s.Manufacturer = cleanHW(s.Manufacturer)
	s.Model = cleanHW(s.Model)
	s.Serial = cleanHW(s.Serial)
	s.Sku = cleanHW(s.Sku)
	if s.Manufacturer == "" && s.Model == "" && s.Serial == "" && s.Sku == "" {
		return nil
	}
	return s
}

func cleanBIOS(s *HardwareBIOS) *HardwareBIOS {
	if s == nil {
		return nil
	}
	s.Vendor = cleanHW(s.Vendor)
	s.Version = cleanHW(s.Version)
	s.Date = cleanHW(s.Date)
	s.Serial = cleanHW(s.Serial)
	if s.Vendor == "" && s.Version == "" && s.Date == "" && s.Serial == "" {
		return nil
	}
	return s
}

func cleanBoard(s *HardwareBoard) *HardwareBoard {
	if s == nil {
		return nil
	}
	s.Manufacturer = cleanHW(s.Manufacturer)
	s.Product = cleanHW(s.Product)
	s.Serial = cleanHW(s.Serial)
	if s.Manufacturer == "" && s.Product == "" && s.Serial == "" {
		return nil
	}
	return s
}
