FROM pytorch/pytorch:2.4.1-cuda12.1-cudnn9-runtime

WORKDIR /app

# System deps for healthcheck curl
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
 && rm -rf /var/lib/apt/lists/*

# App deps (torch is already in base image)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/

# HuggingFace model cache → mounted volume
ENV HF_HOME=/models
ENV PORT=5100

EXPOSE 5100

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=5 \
  CMD curl -f http://localhost:5100/health || exit 1

CMD ["python", "app/main.py"]
