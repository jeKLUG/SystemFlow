package main

import (
	"net"
	"regexp"
	"strings"
	"sync"
	"time"
)

const maxPingTargets = 8

type PingTarget struct {
	ID   string `json:"id"`
	Host string `json:"host"`
}

type PingResult struct {
	ID   string `json:"id"`
	Host string `json:"host"`
	Ok   bool   `json:"ok"`
	Ms   int    `json:"ms,omitempty"`
}

var pingHostnameRe = regexp.MustCompile(`(?i)^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$`)

var (
	activePingMu      sync.Mutex
	activePingTargets []PingTarget
)

func validPingHost(host string) bool {
	host = strings.TrimSpace(host)
	host = strings.TrimPrefix(host, "[")
	host = strings.TrimSuffix(host, "]")
	if host == "" || len(host) > 253 {
		return false
	}
	if strings.ContainsAny(host, " \t\n\r;|&$<>`\\\"'/%") {
		return false
	}
	if ip := net.ParseIP(host); ip != nil {
		return !ip.IsUnspecified() && !ip.IsMulticast()
	}
	return pingHostnameRe.MatchString(host)
}

func sanitizePingTargets(targets []PingTarget) []PingTarget {
	seen := map[string]struct{}{}
	var out []PingTarget
	for _, t := range targets {
		if len(out) >= maxPingTargets {
			break
		}
		id := strings.TrimSpace(t.ID)
		host := strings.TrimSpace(t.Host)
		host = strings.TrimPrefix(host, "[")
		host = strings.TrimSuffix(host, "]")
		if id == "" || !validPingHost(host) {
			continue
		}
		key := strings.ToLower(host)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, PingTarget{ID: id, Host: host})
	}
	return out
}

func pingTargetsEqual(a, b []PingTarget) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i].ID != b[i].ID || a[i].Host != b[i].Host {
			return false
		}
	}
	return true
}

func setActivePingTargets(targets []PingTarget) {
	activePingMu.Lock()
	defer activePingMu.Unlock()
	activePingTargets = append([]PingTarget(nil), targets...)
}

func currentPingTargets() []PingTarget {
	activePingMu.Lock()
	defer activePingMu.Unlock()
	out := make([]PingTarget, len(activePingTargets))
	copy(out, activePingTargets)
	return out
}

// applyPingTargets übernimmt Ping-Ziele aus Config oder Heartbeat und speichert sie lokal.
func applyPingTargets(cfgPath string, cfg *config, targets []PingTarget, persist bool) {
	next := sanitizePingTargets(targets)
	setActivePingTargets(next)
	if !persist || pingTargetsEqual(cfg.PingTargets, next) {
		return
	}
	cfg.PingTargets = next
	_ = saveConfig(cfgPath, cfg)
}

func pingHostTimed(host string) (ok bool, ms int) {
	start := time.Now()
	ok = pingHost(host)
	ms = int(time.Since(start).Milliseconds())
	if ms < 1 {
		ms = 1
	}
	return ok, ms
}

// probePings sendet ICMP an die konfigurierten Ziele (parallel, max. 8).
func probePings(targets []PingTarget) []PingResult {
	if len(targets) == 0 {
		return nil
	}
	out := make([]PingResult, len(targets))
	var wg sync.WaitGroup
	for i, t := range targets {
		wg.Add(1)
		go func(i int, t PingTarget) {
			defer wg.Done()
			ok, ms := pingHostTimed(t.Host)
			out[i] = PingResult{ID: t.ID, Host: t.Host, Ok: ok, Ms: ms}
		}(i, t)
	}
	wg.Wait()
	return out
}
