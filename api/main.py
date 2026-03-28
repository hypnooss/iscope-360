from fastapi import FastAPI, Body
import os
import aio_pika
import asyncio
import json
import uuid
from datetime import datetime

app = FastAPI()

RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://rabbitmq:5672")

@app.get("/")
def root():
    return {"status": "iScope360 API running"}

@app.get("/health")
def health():
    return {"status": "ok"}

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
            "timestamp": datetime.utcnow().isoformat()
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
