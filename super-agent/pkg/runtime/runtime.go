package runtime

import (
	"errors"
	"fmt"
	"github.com/iscope360/agent/pkg/context"
)

// Status da execução do step
const (
	StatusSuccess = "success"
	StatusFailed  = "failed"
	StatusSkipped = "skipped"
)

// Step represera um passo do flow no module.yaml
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

// CapabilityFunc é a assinatura para a execução de uma capability real.
type CapabilityFunc func(ctx *context.Context, params map[string]interface{}) (interface{}, error)

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

// ExecuteModule interpreta o flow do módulo e executa os steps.
func (e *Engine) ExecuteModule(ctx *context.Context, flow []Step) error {
	for _, step := range flow {
		fmt.Printf("Executing step: %s (Capability: %s)\n", step.ID, step.Capability)

		// 1. Resolve inputs from context (Consumes)
		params := make(map[string]interface{})
		for _, input := range step.Consumes {
			val, err := ctx.Get(input.Name)
			if err != nil && input.Required {
				return fmt.Errorf("step %s: missing required input %s: %w", step.ID, input.Name, err)
			}
			params[input.Name] = val
		}

		// 2. Fetch tool/capability from registry
		fn, ok := e.registry[step.Capability]
		if !ok {
			return fmt.Errorf("step %s: capability %s not found in registry", step.ID, step.Capability)
		}

		// 3. RUN
		output, err := fn(ctx, params)
		if err != nil {
			fmt.Printf("Step %s failed: %v\n", step.ID, err)
			if step.OnFailure == "abort" {
				return fmt.Errorf("step %s: aborted due to failure: %w", step.ID, err)
			}
			// continue
			continue
		}

		// 4. Store output in context (Produces)
		// Assume-se que o output mapeia para o primeiro produces da lista para simplificar. 
		// Em um modelo real, o output poderia ser um map.
		if len(step.Produces) > 0 {
			err = ctx.Set(step.Produces[0].Name, output)
			if err != nil {
				return fmt.Errorf("step %s: failed to store output %s: %w", step.ID, step.Produces[0].Name, err)
			}
		}
	}

	return nil
}
