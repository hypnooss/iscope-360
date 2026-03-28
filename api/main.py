from fastapi import FastAPI, Body, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import os
import aio_pika
import asyncio
import json
import uuid
from datetime import datetime, timezone

app = FastAPI()

# Configuração de CORS para permitir acesso do Frontend Dashbaord
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Em produção, especificar as URLs reais (ex: localhost:3000, iscope360.com)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://rabbitmq:5672")

# Gerenciador de Agentes Online (In-memory para esta fase)
class AgentManager:
    def __init__(self):
        self.active_connections: dict[str, WebSocket] = {}
        self.agent_metadata: dict[str, dict] = {}

    async def connect(self, agent_id: str, websocket: WebSocket, metadata: dict):
        await websocket.accept()
        self.active_connections[agent_id] = websocket
        self.agent_metadata[agent_id] = metadata
        print(f"Agent {agent_id} is now ONLINE (Capabilities: {metadata.get('capabilities')})")

    def disconnect(self, agent_id: str):
        if agent_id in self.active_connections:
            del self.active_connections[agent_id]
            del self.agent_metadata[agent_id]
            print(f"Agent {agent_id} is now OFFLINE")

agent_manager = AgentManager()

@app.get("/")
def root():
    return {"status": "iScope360 API running"}

@app.get("/health")
def health():
    return {
        "status": "ok",
        "online_agents": list(agent_manager.active_connections.keys())
    }

@app.websocket("/ws/agent")
async def websocket_endpoint(websocket: WebSocket):
    agent_id = None
    try:
        # 1. Aguarda o Handshake inicial do agente (v1.4)
        data = await websocket.receive_json()
        if data.get("type") != "handshake":
            await websocket.close(code=1008) # Policy Violation
            return

        agent_id = data.get("agent_id")
        metadata = {
            "version": data.get("version"),
            "capabilities": data.get("capabilities"),
            "hostname": data.get("hostname")
        }

        await agent_manager.connect(agent_id, websocket, metadata)

        # 2. Loop de vida (Heartbeat / Eventos)
        while True:
            msg = await websocket.receive_json()
            if msg.get("type") == "heartbeat":
                # Responde ao heartbeat para confirmar latência
                await websocket.send_json({"type": "heartbeat_ack", "timestamp": datetime.now(timezone.utc).isoformat()})
            
    except WebSocketDisconnect:
        if agent_id:
            agent_manager.disconnect(agent_id)
    except Exception as e:
        print(f"Error in WebSocket: {e}")
        if agent_id:
            agent_manager.disconnect(agent_id)

@app.post("/task")
async def send_task(params: dict = Body({})):
    """
    Cria uma nova task seguindo o contrato v1.4.
    O dispatcher (WSS Bridge) consumirá da fila 'tasks' e enviará para o Super Agent.
    """
    connection = await aio_pika.connect_robust(RABBITMQ_URL)
    channel = await connection.channel()

    # Garantir que a fila existe
    queue = await channel.declare_queue("tasks", durable=True)

    # Construção da Task v1.4
    task_id = str(uuid.uuid4())
    correlation_id = str(uuid.uuid4())
    
    task_payload = {
        "task_id": task_id,
        "correlation_id": correlation_id,
        "tenant_id": "default-tenant",
        
        "module": {
            "name": "external_domains_compliance",
            "version": "1.4.0"
        },
        
        "action": "execute",
        
        "execution_requirements": {
            "mode": "pool",
            "pool": {
                "required_agent_type": "super_agent",
                "required_capabilities": ["dns.resolve", "http.probe"]
            }
        },
        
        "payload": {
            "params": params or {"target_domain": "example.com"},
            "limits": {
                "timeout": 300,
                "cpu": "medium",
                "rate": "safe"
            }
        },
        
        "metadata": {
            "created_by": "api-system",
            "source": "api",
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    }

    await channel.default_exchange.publish(
        aio_pika.Message(
            body=json.dumps(task_payload).encode(),
            delivery_mode=aio_pika.DeliveryMode.PERSISTENT
        ),
        routing_key="tasks"
    )

    return {
        "status": "task dispatched",
        "task_id": task_id,
        "correlation_id": correlation_id,
        "payload": task_payload
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
