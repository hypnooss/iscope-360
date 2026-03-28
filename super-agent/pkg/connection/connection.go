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
	TaskChannel chan interface{} // Task payload
}

func NewClient(addr string, agentID string, token string) *WSSClient {
	u := url.URL{Scheme: "wss", Host: addr, Path: "/ws/agent"}
	return &WSSClient{
		url:         u,
		agentID:     agentID,
		token:       token,
		interrupt:   make(chan struct{}),
		TaskChannel: make(chan interface{}),
	}
}

// Connect inicia a conexão WSS com a plataforma (outbound-only).
func (c *WSSClient) Connect() error {
	log.Printf("Connecting to %s...", c.url.String())

	// TODO: Configurar TLS mTLS aqui.
	conn, _, err := websocket.DefaultDialer.Dial(c.url.String(), nil)
	if err != nil {
		return fmt.Errorf("dial: %w", err)
	}

	c.mu.Lock()
	c.conn = conn
	c.mu.Unlock()

	// Handshake / Auth
	authMsg := map[string]string{
		"type":     "auth",
		"agent_id": c.agentID,
		"token":    c.token,
	}
	err = c.conn.WriteJSON(authMsg)
	if err != nil {
		return fmt.Errorf("auth: %w", err)
	}

	go c.listenLoop()
	return nil
}

// listenLoop escuta mensagens vindas da plataforma (PUSH model).
func (c *WSSClient) listenLoop() {
	defer c.conn.Close()
	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			log.Printf("Read error: %v", err)
			close(c.TaskChannel)
			return
		}

		log.Printf("Received message: %s", message)
		
		var task interface{}
		err = json.Unmarshal(message, &task)
		if err != nil {
			log.Printf("Unmarshal error: %v", err)
			continue
		}

		c.TaskChannel <- task
	}
}

// SendResult envia o resultado da execução de volta pelo mesmo túnel WSS.
func (c *WSSClient) SendResult(result interface{}) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.conn == nil {
		return fmt.Errorf("connection not alive")
	}
	return c.conn.WriteJSON(result)
}
