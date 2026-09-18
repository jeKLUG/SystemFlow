//go:build !windows && !linux

package main

func collectHardware() *HardwareInventory {
	return &HardwareInventory{}
}
