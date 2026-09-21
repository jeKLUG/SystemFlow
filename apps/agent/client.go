package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type enrollRequest struct {
	EnrollmentKey string `json:"enrollmentKey"`
	MachineID     string `json:"machineId"`
	Hostname      string `json:"hostname,omitempty"`
	OS            string `json:"os,omitempty"`
	OSVersion     string `json:"osVersion,omitempty"`
	IP            string `json:"ip,omitempty"`
	AgentVersion  string `json:"agentVersion,omitempty"`
}

type enrollResponse struct {
	AgentID  string `json:"agentId"`
	Token    string `json:"token"`
	Assigned bool   `json:"assigned"`
	AssetID  string `json:"assetId"`
}

type latestAgentInfo struct {
	Platform string `json:"platform"`
	Version  string `json:"version"`
	SHA256   string `json:"sha256"`
}

type heartbeatResponse struct {
	OK          bool             `json:"ok"`
	Assigned    bool             `json:"assigned"`
	UpdateNow   bool             `json:"updateNow"`
	Uninstall   bool             `json:"uninstall"`
	LatestAgent *latestAgentInfo `json:"latestAgent"`
	PingTargets []PingTarget     `json:"pingTargets"`
}

type httpError struct {
	status int
	msg    string
}

func (e *httpError) Error() string { return e.msg }

func isUnauthorized(err error) bool {
	he, ok := err.(*httpError)
	return ok && he.status == 401
}

func apiURL(base, path string) string {
	return strings.TrimRight(base, "/") + path
}

func enroll(cfgPath string, cfg *config) error {
	snap, err := collectSnapshot()
	if err != nil {
		snap = AgentSnapshot{Hostname: hostnameFallback(), OS: goosName()}
	}
	body, _ := json.Marshal(enrollRequest{
		EnrollmentKey: cfg.EnrollmentKey,
		MachineID:     machineID(),
		Hostname:      snap.Hostname,
		OS:            snap.OS,
		OSVersion:     snap.OSVersion,
		IP:            snap.IP,
		AgentVersion:  agentVersion,
	})
	req, err := http.NewRequest(http.MethodPost, apiURL(cfg.ServerURL, "/api/monitoring/enroll"), bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	if res.StatusCode >= 300 {
		return &httpError{status: res.StatusCode, msg: fmt.Sprintf("enroll %s: %s", res.Status, raw)}
	}
	var out enrollResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		return err
	}
	cfg.Token = out.Token
	cfg.AgentID = out.AgentID
	return saveConfig(cfgPath, cfg)
}

func heartbeat(cfg *config) (*heartbeatResponse, error) {
	snap, err := collectSnapshot()
	if err != nil {
		return nil, err
	}
	snap.AgentVersion = agentVersion
	snap.Platform = agentPlatformID()
	body, err := json.Marshal(snap)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequest(http.MethodPost, apiURL(cfg.ServerURL, "/api/monitoring/heartbeat"), bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+cfg.Token)
	client := &http.Client{Timeout: 45 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	if res.StatusCode >= 300 {
		return nil, &httpError{status: res.StatusCode, msg: fmt.Sprintf("heartbeat %s: %s", res.Status, raw)}
	}
	var out heartbeatResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		return &heartbeatResponse{OK: true}, nil
	}
	return &out, nil
}
