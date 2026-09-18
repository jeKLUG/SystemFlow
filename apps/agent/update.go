package main

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

var (
	updateMu   sync.Mutex
	updateBusy bool
)

func fileSHA256(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

func currentExeSHA() string {
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	sum, err := fileSHA256(exe)
	if err != nil {
		return ""
	}
	return sum
}

// maybeSelfUpdate lädt bei Bedarf das aktuelle Binary und ersetzt den laufenden Agenten.
// Täglich, wenn die Version älter ist; sofort, wenn der Server updateNow sendet.
func maybeSelfUpdate(cfgPath string, cfg *config, hb *heartbeatResponse) {
	if hb == nil || hb.LatestAgent == nil || cfg.Token == "" {
		return
	}
	latest := hb.LatestAgent
	outdated := compareVersion(agentVersion, latest.Version) < 0
	if !outdated && !hb.UpdateNow {
		return
	}
	if !hb.UpdateNow {
		if last, err := time.Parse(time.RFC3339, cfg.LastUpdateCheck); err == nil && time.Since(last) < 24*time.Hour {
			return
		}
	}
	cfg.LastUpdateCheck = time.Now().UTC().Format(time.RFC3339)
	_ = saveConfig(cfgPath, cfg)

	go func() {
		updateMu.Lock()
		if updateBusy {
			updateMu.Unlock()
			return
		}
		updateBusy = true
		updateMu.Unlock()
		defer func() {
			updateMu.Lock()
			updateBusy = false
			updateMu.Unlock()
		}()
		if err := downloadAndApply(cfg, latest); err != nil {
			fmt.Fprintf(os.Stderr, "self-update: %v\n", err)
		}
	}()
}

func downloadAndApply(cfg *config, latest *latestAgentInfo) error {
	if latest.SHA256 != "" && strings.EqualFold(currentExeSHA(), latest.SHA256) {
		return nil
	}
	platform := latest.Platform
	if platform == "" {
		platform = agentPlatformID()
	}
	url := apiURL(cfg.ServerURL, "/api/monitoring/agent/download/"+platform)
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+cfg.Token)
	client := &http.Client{Timeout: 3 * time.Minute}
	res, err := client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		raw, _ := io.ReadAll(io.LimitReader(res.Body, 2048))
		return fmt.Errorf("download %s: %s", res.Status, raw)
	}
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	dest := exe + ".new"
	out, err := os.OpenFile(dest, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o755)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(out, res.Body)
	closeErr := out.Close()
	if copyErr != nil {
		_ = os.Remove(dest)
		return copyErr
	}
	if closeErr != nil {
		_ = os.Remove(dest)
		return closeErr
	}
	sum, err := fileSHA256(dest)
	if err != nil {
		_ = os.Remove(dest)
		return err
	}
	if latest.SHA256 != "" && !strings.EqualFold(sum, latest.SHA256) {
		_ = os.Remove(dest)
		return fmt.Errorf("sha256 mismatch")
	}
	return applyAgentUpdate(dest)
}
