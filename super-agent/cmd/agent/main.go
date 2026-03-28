package main

import (
	"log"
	"os"
	"time"

	"github.com/iscope360/agent/pkg/connection"
	"github.com/iscope360/agent/pkg/context"
	"github.com/iscope360/agent/pkg/runtime"
)

const AgentVersion = "1.0.0"

func main() {
	log.Printf("iScope360 Super Agent v%s bootstrapping...\n", AgentVersion)

	// 1. Initialize Runtime Engine
	engine := runtime.NewEngine()

	// 2. Register Capabilities (Mocking multiple outputs)
	engine.RegisterCapability("dns.resolve", func(ctx *context.Context, params map[string]interface{}) (map[string]interface{}, error) {
		log.Println("Capability [dns.resolve] executing...")
		target, _ := params["target_domain"].(string)
		log.Printf("Resolving domain: %s\n", target)
		
		// Return multiple named artifacts
		return map[string]interface{}{
			"resolved_ips": []string{"192.168.1.1", "10.0.0.5"},
			"dns_metadata": map[string]interface{}{"TTL": 3600, "Provider": "Cloudflare"},
		}, nil
	})

	engine.RegisterCapability("http.probe", func(ctx *context.Context, params map[string]interface{}) (map[string]interface{}, error) {
		log.Println("Capability [http.probe] executing...")
		ips, _ := params["resolved_ips"].([]string)
		log.Printf("Probing IPs: %v\n", ips)
		
		return map[string]interface{}{
			"http_metadata": map[string]interface{}{"server": "nginx", "status": 200},
		}, nil
	})

	// 3. Initialize WSS Client
	platformURL := os.Getenv("PLATFORM_URL")
	if platformURL == "" {
		platformURL = "127.0.0.1:8000"
	}
	client := connection.NewClient(platformURL, "agent-01", "super-secret-token")
	
	// Define local capabilities for handshake
	localCapabilities := []string{"dns.resolve", "http.probe"}

	err := client.Connect(AgentVersion, localCapabilities)
	if err != nil {
		log.Fatalf("Error connecting: %v", err)
	}

	log.Println("Super Agent connected and waiting for tasks (PUSH model)...")

	// 4. Main Event Loop
	for taskPayload := range client.TaskChannel {
		log.Printf("Processing Task: %v", taskPayload)

		// 4.1. Version Validation (Contract Alignment)
		// Mocking min_agent_version extraction for this demonstration
		minVersion := "1.0.0" 
		if AgentVersion < minVersion {
			log.Printf("CRITICAL: Agent version %s is incompatible with required version %s\n", AgentVersion, minVersion)
			// Return error result immediately
			continue
		}

		// Create fresh Execution Context for the task (quota: 50MB)
		taskCtx := context.New(50 * 1024 * 1024)

		// Mock flow using multiple produces
		flow := []runtime.Step{
			{
				ID:         "resolve_dns",
				Capability: "dns.resolve",
				OnFailure:  "abort",
				Consumes:   []runtime.DataRef{{Name: "target_domain", Required: true}},
				Produces:   []runtime.DataRef{{Name: "resolved_ips"}, {Name: "dns_metadata"}},
			},
			{
				ID:         "scan_http",
				Capability: "http.probe",
				OnFailure:  "continue",
				Consumes:   []runtime.DataRef{{Name: "resolved_ips", Required: false}},
				Produces:   []runtime.DataRef{{Name: "http_metadata"}},
			},
		}

		// Pre-populate context with task params
		taskCtx.Set("target_domain", "example.com")

		// EXECUTE
		start := time.Now()
		executionLog, err := engine.ExecuteModule(taskCtx, flow)
		duration := time.Since(start).Milliseconds()

		// 5. Build and Send Result v1.4 (Status Partial Logic)
		globalStatus := calculateGlobalStatus(err, executionLog)

		// Map executionLog to Result Schema
		stepsReport := make([]map[string]interface{}, 0)
		for _, step := range executionLog {
			sReport := map[string]interface{}{
				"id":          step.ID,
				"status":      step.Status,
				"duration_ms": step.DurationMS,
			}
			if step.Error != "" {
				sReport["error"] = map[string]interface{}{
					"code":    500,
					"message": step.Error,
				}
			}
			stepsReport = append(stepsReport, sReport)
		}

		result := map[string]interface{}{
			"metadata": map[string]interface{}{
				"task_id": "uuid-from-task", 
				"correlation_id": "corr-uuid",
				"agent_id": "agent-01",
				"module": map[string]interface{}{
					"name": "external_domains_compliance",
					"version": "1.4.0",
				},
				"timestamp": time.Now().Format(time.RFC3339),
			},
			"status": globalStatus,
			"execution": map[string]interface{}{
				"duration_ms": duration,
				"retries":     0,
				"steps":       stepsReport,
			},
			"data": map[string]interface{}{
				"raw_data":        nil,
				"normalized_data": nil,
				"inventory":       []string{"example.com"},
				"findings":        nil,
			},
		}

		if err != nil {
			result["error"] = map[string]interface{}{
				"code":    500,
				"message": err.Error(),
				"step_id": "runtime-execution",
			}
		}

		client.SendResult(result)
		log.Printf("Result [%s] sent back to platform.\n", globalStatus)
	}
}

// calculateGlobalStatus decide o status final baseado nos erros do runtime e logs de steps.
func calculateGlobalStatus(err error, log []runtime.StepResult) string {
	if err != nil {
		return "failed"
	}

	for _, step := range log {
		if step.Status == runtime.StatusFailed {
			return "partial"
		}
	}

	return "success"
}
