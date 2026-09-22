package main

import (
	"regexp"
	"strings"
	"sync"
)

const maxServiceWatches = 8

type ServiceWatch struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type ServiceWatchResult struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Display string `json:"display,omitempty"`
	State   string `json:"state,omitempty"`
	Ok      bool   `json:"ok"`
}

var serviceNameRe = regexp.MustCompile(`(?i)^[a-z0-9][a-z0-9._@$-]{0,127}$`)

var (
	activeWatchMu        sync.Mutex
	activeServiceWatches []ServiceWatch
)

func validServiceName(name string) bool {
	name = strings.TrimSpace(name)
	if name == "" || len(name) > 128 {
		return false
	}
	if strings.ContainsAny(name, " \t\n\r;|&<>`\\\"'/%") {
		return false
	}
	return serviceNameRe.MatchString(name)
}

func sanitizeServiceWatches(targets []ServiceWatch) []ServiceWatch {
	seen := map[string]struct{}{}
	var out []ServiceWatch
	for _, t := range targets {
		if len(out) >= maxServiceWatches {
			break
		}
		id := strings.TrimSpace(t.ID)
		name := strings.TrimSpace(t.Name)
		if id == "" || !validServiceName(name) {
			continue
		}
		key := strings.ToLower(name)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, ServiceWatch{ID: id, Name: name})
	}
	return out
}

func serviceWatchesEqual(a, b []ServiceWatch) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i].ID != b[i].ID || !strings.EqualFold(a[i].Name, b[i].Name) {
			return false
		}
	}
	return true
}

func setActiveServiceWatches(targets []ServiceWatch) {
	activeWatchMu.Lock()
	defer activeWatchMu.Unlock()
	activeServiceWatches = append([]ServiceWatch(nil), targets...)
}

func currentServiceWatches() []ServiceWatch {
	activeWatchMu.Lock()
	defer activeWatchMu.Unlock()
	out := make([]ServiceWatch, len(activeServiceWatches))
	copy(out, activeServiceWatches)
	return out
}

// applyServiceWatches übernimmt Dienst-Wächter aus Config oder Heartbeat.
func applyServiceWatches(cfgPath string, cfg *config, targets []ServiceWatch, persist bool) {
	next := sanitizeServiceWatches(targets)
	setActiveServiceWatches(next)
	if !persist || serviceWatchesEqual(cfg.ServiceWatches, next) {
		return
	}
	cfg.ServiceWatches = next
	_ = saveConfig(cfgPath, cfg)
}

// probeWatchedServices prüft konfigurierte Dienste parallel (max. 8).
func probeWatchedServices(targets []ServiceWatch) []ServiceWatchResult {
	if len(targets) == 0 {
		return nil
	}
	out := make([]ServiceWatchResult, len(targets))
	var wg sync.WaitGroup
	for i, t := range targets {
		wg.Add(1)
		go func(i int, t ServiceWatch) {
			defer wg.Done()
			row := probeService(t.Name)
			row.ID = t.ID
			row.Name = t.Name
			out[i] = row
		}(i, t)
	}
	wg.Wait()
	return out
}
