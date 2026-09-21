package main

import (
	"io"
	"net/http"
	"sort"
	"strings"
	"time"
)

type SessionSnapshot struct {
	User      string   `json:"user,omitempty"`
	Users     []string `json:"users,omitempty"`
	LastLogon string   `json:"lastLogon,omitempty"`
}

type NetworkSnapshot struct {
	PublicIP  string   `json:"publicIp,omitempty"`
	Gateway   string   `json:"gateway,omitempty"`
	GatewayOk *bool    `json:"gatewayOk,omitempty"`
	DNS       []string `json:"dns,omitempty"`
	DnsOk     *bool    `json:"dnsOk,omitempty"`
	DnsFailed []string `json:"dnsFailed,omitempty"`
	Dhcp      *bool    `json:"dhcp,omitempty"`
	Adapter   string   `json:"adapter,omitempty"`
}

type FirewallProfile struct {
	Name    string `json:"name"`
	Enabled bool   `json:"enabled"`
}

type FirewallSnapshot struct {
	Active   string            `json:"active,omitempty"`
	Profiles []FirewallProfile `json:"profiles,omitempty"`
}

type DefenderSnapshot struct {
	Product            string `json:"product,omitempty"`
	Realtime           *bool  `json:"realtime,omitempty"`
	Antivirus          *bool  `json:"antivirus,omitempty"`
	SignaturesAgeHours *int   `json:"signaturesAgeHours,omitempty"`
	SignaturesUpdated  string `json:"signaturesUpdated,omitempty"`
	LastScan           string `json:"lastScan,omitempty"`
}

type CrashSnapshot struct {
	Unexpected bool   `json:"unexpected,omitempty"`
	Time       string `json:"time,omitempty"`
	Reason     string `json:"reason,omitempty"`
}

type ServiceSnapshot struct {
	Name    string `json:"name"`
	Display string `json:"display,omitempty"`
	State   string `json:"state,omitempty"`
}

type SoftwareSnapshot struct {
	Name      string `json:"name"`
	Publisher string `json:"publisher,omitempty"`
	Version   string `json:"version,omitempty"`
}

var lastPublicIP string
var lastPublicIPAt time.Time

var lastSoftware []SoftwareSnapshot
var lastSoftwareAt time.Time

func collectSoftwareCached() []SoftwareSnapshot {
	if time.Since(lastSoftwareAt) < 6*time.Hour && lastSoftware != nil {
		return lastSoftware
	}
	list := collectSoftware()
	if len(list) == 0 {
		return lastSoftware
	}
	if len(list) > 250 {
		list = list[:250]
	}
	lastSoftware = list
	lastSoftwareAt = time.Now()
	return list
}

func collectPublicIP() string {
	if time.Since(lastPublicIPAt) < 15*time.Minute && lastPublicIP != "" {
		return lastPublicIP
	}
	client := &http.Client{Timeout: 2 * time.Second}
	req, err := http.NewRequest(http.MethodGet, "https://api.ipify.org", nil)
	if err != nil {
		return lastPublicIP
	}
	req.Header.Set("User-Agent", "SystemhausAgent/"+agentVersion)
	res, err := client.Do(req)
	if err != nil {
		return lastPublicIP
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return lastPublicIP
	}
	raw, err := io.ReadAll(io.LimitReader(res.Body, 64))
	if err != nil {
		return lastPublicIP
	}
	ip := strings.TrimSpace(string(raw))
	if ip == "" || strings.ContainsAny(ip, " \n<>") {
		return lastPublicIP
	}
	lastPublicIP = ip
	lastPublicIPAt = time.Now()
	return ip
}

func boolPtr(v bool) *bool {
	return &v
}

func uniqueNonEmpty(values []string) []string {
	seen := map[string]struct{}{}
	var out []string
	for _, v := range values {
		v = strings.TrimSpace(v)
		if v == "" {
			continue
		}
		key := strings.ToLower(v)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, v)
	}
	return out
}

func sortSoftware(list []SoftwareSnapshot) {
	sort.Slice(list, func(i, j int) bool {
		return strings.ToLower(list[i].Name) < strings.ToLower(list[j].Name)
	})
}

func skipWindowsService(name string) bool {
	n := strings.ToLower(strings.TrimSpace(name))
	if n == "" {
		return true
	}
	skip := []string{
		"mapsbroker", "sppsvc", "remoteregistry", "wmpnetworksvc", "sharedaccess",
		"tabletinputservice", "fax", "printnotify", "retaildemo", "shpamsvc",
		"gupdate", "gupdatem", "edgeupdate", "edgeupdatem", "googleupdaterinternal",
		"googleupdaterservice", "wbiosrvc", "cdpusersvc", "xbox", "wisvc",
		"diagnosticshub.standardcollector.service", "dmwappushservice",
		"mixedrealityopendevicesetupsvc", "sdppsvc", "staterepository",
	}
	for _, s := range skip {
		if n == s || strings.HasPrefix(n, s) {
			return true
		}
	}
	if strings.Contains(n, "update") || strings.Contains(n, "xbox") {
		return true
	}
	return false
}
