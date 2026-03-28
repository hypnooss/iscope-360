import asyncio
import aio_pika
import os

RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://rabbitmq:5672")

print("Worker booting...", flush=True)

async def process_message(message: aio_pika.IncomingMessage):
    async with message.process():
        print("Received:", message.body.decode(), flush=True)

import asyncio
import aio_pika
import os
import json

RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://rabbitmq:5672")

print("Worker booting...", flush=True)

async def handle_task(payload):
    print(f"⚙️ Processing task: {payload}", flush=True)

    task_type = payload.get("type")

    if task_type == "external_domains_compliance":
        target = payload.get("target")

        print(f"Running domain analysis for: {target}", flush=True)

        # MOCK inicial (depois vira execução real)
        result = {
            "inventory": {
                "domain": target,
                "status": "reachable"
            },
            "findings": []
        }

        print(f"Result: {result}", flush=True)

    else:
        print(f"❓ Unknown task type: {task_type}", flush=True)


async def process_message(message: aio_pika.IncomingMessage):
    async with message.process():
        payload = json.loads(message.body.decode())
        print("Received:", payload, flush=True)

        await handle_task(payload)


async def connect_with_retry():
    while True:
        try:
            print("Connecting to RabbitMQ...", flush=True)
            connection = await aio_pika.connect_robust(RABBITMQ_URL)
            print("Connected to RabbitMQ", flush=True)
            return connection
        except Exception as e:
            print(f"Connection failed: {e}", flush=True)
            print("Retrying in 5 seconds...", flush=True)
            await asyncio.sleep(5)


async def main():
    print("Worker started...", flush=True)

    connection = await connect_with_retry()
    channel = await connection.channel()

    queue = await channel.declare_queue("tasks", durable=True)

    await queue.consume(process_message)

    print("Waiting for messages...", flush=True)
    await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
