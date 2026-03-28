FROM python:3.11

WORKDIR /app

COPY worker/requirements.txt ./requirements.txt
RUN pip install -r requirements.txt

COPY . .

CMD ["python", "-u", "worker/worker.py"]
