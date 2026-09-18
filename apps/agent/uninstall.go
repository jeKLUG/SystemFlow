package main

import "fmt"

// maybeRemoteUninstall startet die Deinstallation, wenn der Server das im Heartbeat anfordert.
// Gibt true zurück, wenn der Agent beendet werden soll (nicht aus dem Dienst heraus sc stop aufrufen).
func maybeRemoteUninstall(cfgPath string, hb *heartbeatResponse) bool {
	if hb == nil || !hb.Uninstall {
		return false
	}
	fmt.Println("Deinstallation vom Server angefordert.")
	if err := scheduleUninstall(cfgPath); err != nil {
		fmt.Fprintf(os.Stderr, "uninstall: %v\n", err)
	}
	return true
}
