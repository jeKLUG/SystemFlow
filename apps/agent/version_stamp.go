package main

// Unique marker in the compiled binary so uploads can read the real version.
const agentVersionStamp = "SYSFLW_AGENT_VERSION=1.0.8"

func init() {
	_ = agentVersionStamp
}
