//go:build !windows && !linux && !darwin

package main

func collectHardware() *HardwareInventory {
	return &HardwareInventory{}
}
