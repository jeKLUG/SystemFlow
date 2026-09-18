//go:build !windows && !linux

package main

func collectRebootPending() bool { return false }

func collectSession() *SessionSnapshot { return nil }

func collectNetwork() *NetworkSnapshot {
	ip := collectPublicIP()
	if ip == "" {
		return nil
	}
	return &NetworkSnapshot{PublicIP: ip}
}

func collectFailedServices() []ServiceSnapshot { return nil }

func collectSoftware() []SoftwareSnapshot { return nil }
