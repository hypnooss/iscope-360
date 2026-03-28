from fastapi import FastAPI
import os
import aio_pika
import asyncio
import json

app = FastAPI()

RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://rabbitmq:5672")

@app.get("/")
def root():
    return {"status": "iScope360 API running"}

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/task")
async def send_task():
    connection = await aio_pika.connect_robust(RABBITMQ_URL)
    channel = await connection.channel()

    queue = await channel.declare_queue("tasks", durable=True)

    payload = {
        "type": "external_domains_compliance",
        "target": "example.com"
    }

    await channel.default_exchange.publish(
        aio_pika.Message(
            body=json.dumps(payload).encode(),
            delivery_mode=aio_pika.DeliveryMode.PERSISTENT
        ),
        routing_key="tasks"
    )

    return {"status": "task sent", "payload": payload}
