FROM pytorch/pytorch:2.1.0-cuda12.1-cudnn8-runtime

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Patch pm4py (>=2.7.x) container-startup crash: constants.py calls
# psutil.Process(os.getppid()) at import to detect PowerBI Desktop, which
# raises NoSuchProcess when the parent PID is unresolvable inside a container
# (ppid == 0). This is a PowerBI-only graphviz-view heuristic, irrelevant to
# the server — guard it so the first /petri/* call does not crash.
RUN PM4PY_CONST="$(find /opt/conda -path '*/pm4py/util/constants.py' | head -1)" && \
    sed -i 's|    parent_name = str(psutil.Process(parent_pid).name())|    try:\n        parent_name = str(psutil.Process(parent_pid).name())\n    except Exception:\n        parent_name = ""|' "$PM4PY_CONST"

# Copy application code
COPY . .

# Create checkpoints directory
RUN mkdir -p /app/checkpoints

# Expose port
EXPOSE 5000

# Run server
CMD ["python", "run_server.py"]
