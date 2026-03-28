package connection

import (
	"encoding/json"
	"fmt"
	"github.com/gorilla/websocket"
	"log"
	"net/url"
	"sync"
	"time"
)

// WSSClient gerencia a conexão persistente com a plataforma.
type WSSClient struct {
	mu          sync.Mutex
	conn        *websocket.Conn
	url         url.URL
	agentID     string
	token       string
	interrupt   chan struct{}
	TaskChannel chan interface{}
}

func NewClient(addr string, agentID string, token string) *WSSClient {
	// Usamos ws:// para testes locais sem SSL, wss:// em prod.
	u := url.URL{Scheme: "ws", Host: addr, Path: "/ws/agent"}
	return &WSSClient{
		url:         u,
		agentID:     agentID,
		token:       token,
		interrupt:   make(chan struct{}),
		TaskChannel: make(chan interface{}),
	}
}

// Connect inicia a conexão WSS e realiza o Handshake v1.4.
func (c *WSSClient) Connect(version string, capabilities []string) error {
	log.Printf("Connecting to %s...", c.url.String())

	conn, _, err := websocket.DefaultDialer.Dial(c.url.String(), nil)
	if err != nil {
		return fmt.Errorf("dial: %w", err)
	}

	c.mu.Lock()
	c.conn = conn
	c.mu.Unlock()

	// 1. Envia Handshake de Presença
	handshake := map[string]interface{}{
		"type":         "handshake",
		"agent_id":     c.agentID,
		"version":      version,
		"capabilities": capabilities,
		"hostname":     "agent-local",
	}
	
	err = c.conn.WriteJSON(handshake)
	if err != nil {
		return fmt.Errorf("handshake: %w", err)
	}

	// 2. Inicia Corrotina de Escuta e Heartbeat
	go c.listenLoop()
	go c.heartbeatLoop()
	
	return nil
}

// listenLoop escuta mensagens vindas da plataforma.
func (c *WSSClient) listenLoop() {
	defer c.conn.Close()
	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			log.Printf("Connection closed: %v", err)
			close(c.TaskChannel)
			return
		}

		var msg map[string]interface{}
		err = json.Unmarshal(message, &msg)
		if err != nil {
			log.Printf("Unmarshal error: %v", err)
			continue
		}

		// Filtra heartbeats acks e roteia tasks
		if msg["type"] == "heartbeat_ack" {
			continue
		}

		c.TaskChannel <- msg
	}
}

// heartbeatLoop envia um sinal de vida a cada 30 segundos.
func (c *WSSClient) heartbeatLoop() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			c.mu.Lock()
			if c.conn == nil {
				c.mu.Unlock()
				return
			}
			err := c.conn.WriteJSON(map[string]interface{}{
				"type": "heartbeat",
				"timestamp": time.Now().Format(time.RFC3339),
			})
			c.mu.Unlock()
			if err != nil {
				log.Printf("Heartbeat failed: %v", err)
				return
			}
		case <-c.interrupt:
			return
		}
	}
}

// SendResult envia dados de volta para a plataforma.
func (c *WSSClient) SendResult(result interface{}) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.conn == nil {
		return fmt.Errorf("connection not alive")
	}
	return c.conn.WriteJSON(result)
}
