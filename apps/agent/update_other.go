//go:build !windows && !linux && !darwin

package main

import "fmt"

func applyAgentUpdate(newPath string) error {
	_ = newPath
	return fmt.Errorf("self-update auf dieser Plattform nicht unterstützt")
}
