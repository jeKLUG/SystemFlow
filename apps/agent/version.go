package main

import (
	"runtime"
	"strconv"
	"strings"
)

func agentPlatformID() string {
	return runtime.GOOS + "-" + runtime.GOARCH
}

func versionParts(v string) []int {
	raw := strings.FieldsFunc(v, func(r rune) bool {
		return r < '0' || r > '9'
	})
	out := make([]int, 0, len(raw))
	for _, p := range raw {
		n, err := strconv.Atoi(p)
		if err != nil {
			n = 0
		}
		out = append(out, n)
	}
	return out
}

// compareVersion gibt -1 zurück, wenn a < b.
func compareVersion(a, b string) int {
	pa := versionParts(a)
	pb := versionParts(b)
	n := len(pa)
	if len(pb) > n {
		n = len(pb)
	}
	for i := 0; i < n; i++ {
		da, db := 0, 0
		if i < len(pa) {
			da = pa[i]
		}
		if i < len(pb) {
			db = pb[i]
		}
		if da < db {
			return -1
		}
		if da > db {
			return 1
		}
	}
	return 0
}
