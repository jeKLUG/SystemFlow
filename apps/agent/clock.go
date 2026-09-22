package main

import (
	"encoding/binary"
	"io"
	"net"
	"net/http"
	"strings"
	"time"
)

const clockWarnSec = 30

type ClockSnapshot struct {
	OffsetSec *int   `json:"offsetSec,omitempty"`
	Source    string `json:"source,omitempty"`
	Ok        *bool  `json:"ok,omitempty"`
}

var ntpHosts = []string{"time.cloudflare.com", "pool.ntp.org", "time.windows.com"}

// collectClock ermittelt die Abweichung der lokalen Uhr zu NTP (Fallback: HTTP Date).
func collectClock() *ClockSnapshot {
	type attempt struct {
		offset time.Duration
		source string
		err    error
	}
	ch := make(chan attempt, len(ntpHosts))
	for _, host := range ntpHosts {
		go func(host string) {
			offset, err := ntpOffset(host, 1500*time.Millisecond)
			ch <- attempt{offset: offset, source: "ntp:" + host, err: err}
		}(host)
	}
	for range ntpHosts {
		row := <-ch
		if row.err == nil {
			return clockFromOffset(row.offset, row.source)
		}
	}
	offset, err := httpDateOffset("https://api.ipify.org")
	if err != nil {
		return nil
	}
	return clockFromOffset(offset, "http:date")
}

func clockFromOffset(offset time.Duration, source string) *ClockSnapshot {
	sec := int(offset.Round(time.Second).Seconds())
	ok := absInt(sec) < clockWarnSec
	return &ClockSnapshot{OffsetSec: &sec, Source: source, Ok: boolPtr(ok)}
}

func absInt(n int) int {
	if n < 0 {
		return -n
	}
	return n
}

func ntpOffset(host string, timeout time.Duration) (time.Duration, error) {
	conn, err := net.DialTimeout("udp", net.JoinHostPort(host, "123"), timeout)
	if err != nil {
		return 0, err
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(timeout))
	var req [48]byte
	req[0] = 0x23 // VN=4, Mode=3 (Client)
	t1 := time.Now()
	if _, err := conn.Write(req[:]); err != nil {
		return 0, err
	}
	var resp [48]byte
	n, err := conn.Read(resp[:])
	t4 := time.Now()
	if err != nil {
		return 0, err
	}
	if n < 48 || resp[0]&0x07 == 0 {
		return 0, io.ErrUnexpectedEOF
	}
	t2 := ntpStamp(resp[32:40])
	t3 := ntpStamp(resp[40:48])
	adjust := (t2.Sub(t1) + t3.Sub(t4)) / 2
	return -adjust, nil
}

func ntpStamp(b []byte) time.Time {
	sec := binary.BigEndian.Uint32(b[0:4])
	frac := binary.BigEndian.Uint32(b[4:8])
	unix := int64(sec) - 2208988800
	nsec := int64(frac) * 1e9 >> 32
	return time.Unix(unix, nsec)
}

func httpDateOffset(url string) (time.Duration, error) {
	client := &http.Client{Timeout: 3 * time.Second}
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return 0, err
	}
	req.Header.Set("User-Agent", "SystemhausAgent/"+agentVersion)
	t1 := time.Now()
	res, err := client.Do(req)
	t4 := time.Now()
	if err != nil {
		return 0, err
	}
	defer res.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(res.Body, 256))
	raw := strings.TrimSpace(res.Header.Get("Date"))
	if raw == "" {
		return 0, io.ErrUnexpectedEOF
	}
	server, err := http.ParseTime(raw)
	if err != nil {
		return 0, err
	}
	mid := t1.Add(t4.Sub(t1) / 2)
	return mid.Sub(server), nil
}
