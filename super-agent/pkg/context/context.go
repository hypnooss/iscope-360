package context

import (
	"errors"
	"fmt"
	"sync"
)

var (
	ErrFullContext = errors.New("execution context quota exceeded")
	ErrKeyNotFound = errors.New("key not found in context")
)

// Context representa o Execution Context (KV Store) da task.
type Context struct {
	mu           sync.RWMutex
	store        map[string]interface{}
	maxSizeBytes int64
	currentSize  int64
}

// New cria um novo contexto com um limite de tamanho em bytes.
func New(maxSize int64) *Context {
	return &Context{
		store:        make(map[string]interface{}),
		maxSizeBytes: maxSize,
	}
}

// Set insere um dado no contexto. 
// Para simplificar esta primeira versão, estimamos o tamanho do dado de forma conservadora.
func (c *Context) Set(key string, value interface{}) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	// TODO: Implementar estimação de tamanho real (ex: json.Marshal)
	// mock size check
	if c.currentSize > c.maxSizeBytes {
		return ErrFullContext
	}

	c.store[key] = value
	return nil
}

// Get recupera um dado do contexto.
func (c *Context) Get(key string) (interface{}, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	val, ok := c.store[key]
	if !ok {
		return nil, fmt.Errorf("%w: %s", ErrKeyNotFound, key)
	}
	return val, nil
}

// Clear limpa o contexto.
func (c *Context) Clear() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.store = make(map[string]interface{})
	c.currentSize = 0
}
