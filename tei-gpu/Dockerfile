# TEI-compatible GPU embeddings server.
# Base image ships PyTorch with CUDA kernels for Pascal (sm_61) .. Hopper,
# so it runs on the Quadro P2000 that the official TEI GPU images reject.
FROM pytorch/pytorch:2.1.0-cuda12.1-cudnn8-runtime

WORKDIR /app

# curl for the compose healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py .

# Serve on port 80 so TEI_URL=http://tei:80 keeps working unchanged.
EXPOSE 80

CMD ["python", "server.py"]
