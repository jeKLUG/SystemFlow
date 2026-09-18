package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

const agentVersion = "1.0.2"

type config struct {
	ServerURL     string `json:"serverUrl"`
	EnrollmentKey string `json:"enrollmentKey"`
	Token         string `json:"token,omitempty"`
	AgentID       string `json:"agentId,omitempty"`
}

func defaultConfigPath() string {
	if p := os.Getenv("SYSTEMHAUS_AGENT_CONFIG"); p != "" {
		return p
	}
	return platformConfigPath()
}

func loadConfig(path string) (*config, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var cfg config
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}

func saveConfig(path string, cfg *config) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	raw, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, raw, 0o600)
}

func parseInstallFlags(args []string) (server, key, configPath string, err error) {
	fs := flag.NewFlagSet("install", flag.ContinueOnError)
	fs.StringVar(&server, "server", "", "Systemhaus-Ess Basis-URL, z.B. https://ess.example.de")
	fs.StringVar(&key, "key", "", "Enrollment-Key aus den Einstellungen")
	fs.StringVar(&configPath, "config", defaultConfigPath(), "Pfad zur Config-Datei")
	if err = fs.Parse(args); err != nil {
		return "", "", "", err
	}
	if server == "" || key == "" {
		return "", "", "", fmt.Errorf("bitte --server und --key angeben")
	}
	return server, key, configPath, nil
}

func runLoop(cfgPath string) error {
	cfg, err := loadConfig(cfgPath)
	if err != nil {
		return fmt.Errorf("config: %w", err)
	}
	if cfg.ServerURL == "" || cfg.EnrollmentKey == "" {
		return fmt.Errorf("serverUrl und enrollmentKey in der Config sind Pflicht")
	}

	if cfg.Token == "" {
		if err := enroll(cfgPath, cfg); err != nil {
			return err
		}
		cfg, err = loadConfig(cfgPath)
		if err != nil {
			return err
		}
	}

	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()

	send := func() {
		if err := heartbeat(cfg); err != nil {
			fmt.Fprintf(os.Stderr, "heartbeat: %v\n", err)
			if isUnauthorized(err) {
				cfg.Token = ""
				_ = enroll(cfgPath, cfg)
				if next, e := loadConfig(cfgPath); e == nil {
					*cfg = *next
				}
			}
		}
	}
	send()
	for range ticker.C {
		send()
	}
	return nil
}

func main() {
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "install":
			server, key, cfgPath, err := parseInstallFlags(os.Args[2:])
			if err != nil {
				fmt.Fprintln(os.Stderr, err)
				os.Exit(2)
			}
			cfg := &config{ServerURL: server, EnrollmentKey: key}
			if err := saveConfig(cfgPath, cfg); err != nil {
				fmt.Fprintln(os.Stderr, err)
				os.Exit(1)
			}
			if err := installService(cfgPath); err != nil {
				fmt.Fprintln(os.Stderr, err)
				os.Exit(1)
			}
			fmt.Println("Agent installiert. Config:", cfgPath)
			return
		case "uninstall":
			if err := uninstallService(); err != nil {
				fmt.Fprintln(os.Stderr, err)
				os.Exit(1)
			}
			fmt.Println("Agent deinstalliert.")
			return
		case "run":
			cfgPath := defaultConfigPath()
			if len(os.Args) > 2 {
				cfgPath = os.Args[2]
			}
			if err := runLoop(cfgPath); err != nil {
				fmt.Fprintln(os.Stderr, err)
				os.Exit(1)
			}
			return
		}
	}
	if err := maybeRunService(defaultConfigPath()); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
