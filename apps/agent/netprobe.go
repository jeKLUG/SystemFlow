package main

import (
	"context"
	"net"
	"strings"
	"time"
)

func isApipaAddr(ip string) bool {
	return strings.HasPrefix(strings.TrimSpace(ip), "169.254.")
}

func lookupVia(dnsIP string) bool {
	host := strings.TrimSpace(dnsIP)
	if host == "" {
		return false
	}
	if strings.Contains(host, ":") && !strings.HasPrefix(host, "[") {
		host = "[" + host + "]"
	}
	r := &net.Resolver{
		PreferGo: true,
		Dial: func(ctx context.Context, network, address string) (net.Conn, error) {
			d := net.Dialer{Timeout: 1200 * time.Millisecond}
			return d.DialContext(ctx, "udp", host+":53")
		},
	}
	ctx, cancel := context.WithTimeout(context.Background(), 1500*time.Millisecond)
	defer cancel()
	addrs, err := r.LookupHost(ctx, "example.com")
	return err == nil && len(addrs) > 0
}

/** Ping Gateway und DNS-Auflösung über die gemeldeten Server. */
func probeNetwork(n *NetworkSnapshot) {
	if n == nil {
		return
	}
	if gw := strings.TrimSpace(n.Gateway); gw != "" && !isApipaAddr(gw) {
		ok := pingHost(gw)
		n.GatewayOk = &ok
	}
	if len(n.DNS) == 0 {
		return
	}
	ok := false
	var failed []string
	for i, dns := range n.DNS {
		if i >= 2 {
			break
		}
		dns = strings.TrimSpace(dns)
		if dns == "" {
			continue
		}
		if lookupVia(dns) {
			ok = true
			break
		}
		failed = append(failed, dns)
	}
	n.DnsOk = boolPtr(ok)
	if !ok {
		n.DnsFailed = failed
	}
}
