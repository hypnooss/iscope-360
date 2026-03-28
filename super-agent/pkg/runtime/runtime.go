package runtime

import (
	"fmt"
	"time"
	"github.com/iscope360/agent/pkg/context"
)

// Status da execução do step
const (
	StatusSuccess = "success"
	StatusFailed  = "failed"
	StatusSkipped = "skipped"
)

// Step representa um passo do flow no module.yaml
type Step struct {
	ID         string
	Capability string
	OnFailure  string
	Consumes   []DataRef
	Produces   []DataRef
}

// DataRef representa um item de dado com seu schema
type DataRef struct {
	Name      string
	SchemaRef string
	Required  bool
}

// StepResult contém os detalhes da execução de um step individual.
type StepResult struct {
	ID         string
	Status     string
	DurationMS int64
	Error      string
}

// CapabilityFunc agora retorna um mapa de resultados para suportar múltiplos produces.
type CapabilityFunc func(ctx *context.Context, params map[string]interface{}) (map[string]interface{}, error)

// Engine é o motor de execução baseado em contrato.
type Engine struct {
	registry map[string]CapabilityFunc
}

func NewEngine() *Engine {
	return &Engine{
		registry: make(map[string]CapabilityFunc),
	}
}

// RegisterCapability associa um nome de capability a uma função Go.
func (e *Engine) RegisterCapability(name string, fn CapabilityFunc) {
	e.registry[name] = fn
}

// ExecuteModule interpreta o flow do módulo e executa os steps, retornando o log de execução.
func (e *Engine) ExecuteModule(ctx *context.Context, flow []Step) ([]StepResult, error) {
	var executionLog []StepResult

	for _, step := range flow {
		start := time.Now()
		fmt.Printf("Executing step: %s (Capability: %s)\n", step.ID, step.Capability)

		// 1. Resolve inputs from context (Consumes)
		params := make(map[string]interface{})
		for _, input := range step.Consumes {
			val, err := ctx.Get(input.Name)
			if err != nil && input.Required {
				errStr := fmt.Sprintf("missing required input %s", input.Name)
				executionLog = append(executionLog, StepResult{
					ID:         step.ID,
					Status:     StatusFailed,
					DurationMS: time.Since(start).Milliseconds(),
					Error:      errStr,
				})
				return executionLog, fmt.Errorf("step %s: %s", step.ID, errStr)
			}
			params[input.Name] = val
		}

		// 2. Fetch tool/capability from registry
		fn, ok := e.registry[step.Capability]
		if !ok {
			errStr := fmt.Sprintf("capability %s not found", step.Capability)
			executionLog = append(executionLog, StepResult{
				ID:         step.ID,
				Status:     StatusFailed,
				DurationMS: time.Since(start).Milliseconds(),
				Error:      errStr,
			})
			return executionLog, fmt.Errorf("step %s: %s", step.ID, errStr)
		}

		// 3. RUN
		outputMap, err := fn(ctx, params)
		duration := time.Since(start).Milliseconds()

		if err != nil {
			fmt.Printf("Step %s failed: %v\n", step.ID, err)
			
			executionLog = append(executionLog, StepResult{
				ID:         step.ID,
				Status:     StatusFailed,
				DurationMS: duration,
				Error:      err.Error(),
			})

			if step.OnFailure == "abort" {
				return executionLog, fmt.Errorf("step %s: aborted: %w", step.ID, err)
			}
			continue
		}

		// 4. Store ALL outputs in context (Multiple Produces)
		for _, produce := range step.Produces {
			if val, exists := outputMap[produce.Name]; exists {
				err = ctx.Set(produce.Name, val)
				if err != nil {
					// Erro de quota/memória ao salvar resultado
					executionLog = append(executionLog, StepResult{
						ID:         step.ID,
						Status:     StatusFailed,
						DurationMS: duration,
						Error:      fmt.Sprintf("context store error: %v", err),
					})
					return executionLog, err
				}
			}
		}

		// Success
		executionLog = append(executionLog, StepResult{
			ID:         step.ID,
			Status:     StatusSuccess,
			DurationMS: duration,
		})
	}

	return executionLog, nil
}
