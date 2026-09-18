//go:build windows

package main

import (
	"encoding/json"
	"os/exec"
	"strings"
	"syscall"
)

const hardwarePS = `
$ErrorActionPreference = 'SilentlyContinue'
function N([object]$v) {
  if ($null -eq $v) { return $null }
  $s = [string]$v
  $s = $s.Trim()
  if ($s -eq '' -or $s -eq 'None') { return $null }
  return $s
}
function MemType([int]$t) {
  switch ($t) {
    20 { 'DDR' } 21 { 'DDR2' } 24 { 'DDR3' } 26 { 'DDR4' } 34 { 'DDR5' }
    default { if ($t -gt 0) { "Type $t" } else { $null } }
  }
}
$sys = Get-CimInstance Win32_ComputerSystem
$bios = Get-CimInstance Win32_BIOS
$board = Get-CimInstance Win32_BaseBoard
$cpus = @()
Get-CimInstance Win32_Processor | ForEach-Object {
  $cpus += @{
    name = N $_.Name
    cores = [int]$_.NumberOfCores
    threads = [int]$_.NumberOfLogicalProcessors
    mhz = [int]$_.MaxClockSpeed
    socket = N $_.SocketDesignation
  }
}
$mods = @()
Get-CimInstance Win32_PhysicalMemory | ForEach-Object {
  if (-not $_.Capacity) { return }
  $slot = N $_.DeviceLocator
  if (-not $slot) { $slot = N $_.BankLabel }
  $mods += @{
    slot = $slot
    sizeBytes = [int64]$_.Capacity
    speedMhz = [int]$_.Speed
    manufacturer = N $_.Manufacturer
    partNumber = N $_.PartNumber
    serial = N $_.SerialNumber
    type = MemType ([int]$_.SMBIOSMemoryType)
  }
}
$storage = @()
Get-PhysicalDisk | ForEach-Object {
  $storage += @{
    name = N $_.FriendlyName
    model = N $_.FriendlyName
    serial = N $_.SerialNumber
    sizeBytes = [int64]$_.Size
    bus = N $_.BusType
    media = N $_.MediaType
  }
}
if ($storage.Count -eq 0) {
  Get-CimInstance Win32_DiskDrive | ForEach-Object {
    $storage += @{
      name = N $_.Model
      model = N $_.Model
      serial = N $_.SerialNumber
      sizeBytes = [int64]$_.Size
      bus = N $_.InterfaceType
      media = N $_.MediaType
    }
  }
}
$gpus = @()
Get-CimInstance Win32_VideoController | Where-Object { $_.Name } | ForEach-Object {
  $vram = 0
  if ($_.AdapterRAM -and $_.AdapterRAM -gt 0) { $vram = [int64]$_.AdapterRAM }
  $gpus += @{
    name = N $_.Name
    driver = N $_.DriverVersion
    vramBytes = $vram
  }
}
$nics = @()
Get-CimInstance Win32_NetworkAdapter | Where-Object { $_.PhysicalAdapter -eq $true -and $_.MACAddress -and $_.NetEnabled -ne $false } | ForEach-Object {
  $speed = 0
  if ($_.Speed) { $speed = [int]([int64]$_.Speed / 1000000) }
  $nics += @{
    name = N $_.Name
    mac = N $_.MACAddress
    manufacturer = N $_.Manufacturer
    speedMbps = $speed
  }
}
$payload = @{
  system = @{
    manufacturer = N $sys.Manufacturer
    model = N $sys.Model
    sku = N $sys.SystemSKUNumber
  }
  bios = @{
    vendor = N $bios.Manufacturer
    version = N $bios.SMBIOSBIOSVersion
    date = if ($bios.ReleaseDate) { Get-Date $bios.ReleaseDate -Format 'yyyy-MM-dd' } else { $null }
    serial = N $bios.SerialNumber
  }
  board = @{
    manufacturer = N $board.Manufacturer
    product = N $board.Product
    serial = N $board.SerialNumber
  }
  cpus = $cpus
  memoryModules = $mods
  storage = $storage
  gpus = $gpus
  nics = $nics
}
$payload | ConvertTo-Json -Compress -Depth 6
`

type hardwareWire struct {
	System        *HardwareSystem `json:"system"`
	BIOS          *HardwareBIOS   `json:"bios"`
	Board         *HardwareBoard  `json:"board"`
	Cpus          json.RawMessage `json:"cpus"`
	MemoryModules json.RawMessage `json:"memoryModules"`
	Storage       json.RawMessage `json:"storage"`
	Gpus          json.RawMessage `json:"gpus"`
	Nics          json.RawMessage `json:"nics"`
}

func collectHardware() *HardwareInventory {
	cmd := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command", hardwarePS)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	out, err := cmd.Output()
	if err != nil || len(strings.TrimSpace(string(out))) == 0 {
		return &HardwareInventory{}
	}
	var wire hardwareWire
	if json.Unmarshal(out, &wire) != nil {
		return &HardwareInventory{}
	}
	hw := &HardwareInventory{
		System:        cleanSystem(wire.System),
		BIOS:          cleanBIOS(wire.BIOS),
		Board:         cleanBoard(wire.Board),
		Cpus:          parseOneOrMany[HardwareCPU](wire.Cpus),
		MemoryModules: parseOneOrMany[HardwareMemoryModule](wire.MemoryModules),
		Storage:       parseOneOrMany[HardwareStorage](wire.Storage),
		Gpus:          parseOneOrMany[HardwareGPU](wire.Gpus),
		Nics:          parseOneOrMany[HardwareNic](wire.Nics),
	}
	for i := range hw.Cpus {
		hw.Cpus[i].Name = cleanHW(hw.Cpus[i].Name)
		hw.Cpus[i].Socket = cleanHW(hw.Cpus[i].Socket)
	}
	for i := range hw.MemoryModules {
		m := &hw.MemoryModules[i]
		m.Slot = cleanHW(m.Slot)
		m.Manufacturer = cleanHW(m.Manufacturer)
		m.PartNumber = cleanHW(m.PartNumber)
		m.Serial = cleanHW(m.Serial)
		m.Type = cleanHW(m.Type)
	}
	for i := range hw.Storage {
		s := &hw.Storage[i]
		s.Name = cleanHW(s.Name)
		s.Model = cleanHW(s.Model)
		s.Serial = cleanHW(s.Serial)
		s.Bus = cleanHW(s.Bus)
		s.Media = cleanHW(s.Media)
	}
	for i := range hw.Gpus {
		hw.Gpus[i].Name = cleanHW(hw.Gpus[i].Name)
		hw.Gpus[i].Driver = cleanHW(hw.Gpus[i].Driver)
	}
	filtered := hw.Nics[:0]
	for _, n := range hw.Nics {
		n.Name = cleanHW(n.Name)
		n.MAC = cleanHW(n.MAC)
		n.Manufacturer = cleanHW(n.Manufacturer)
		if n.Name == "" || strings.Contains(strings.ToLower(n.Name), "virtual") || strings.Contains(strings.ToLower(n.Name), "loopback") {
			continue
		}
		filtered = append(filtered, n)
	}
	hw.Nics = filtered
	return hw
}
