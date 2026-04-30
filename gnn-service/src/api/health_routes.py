"""
Comprehensive health check endpoints — Phase C3.4

Provides health checks for all GNN service components:
- Model status (loaded/degraded/not loaded)
- Memgraph connectivity
- Redis connectivity
- GPU availability
- System resource metrics
- Kubernetes readiness/liveness probes
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Optional
from datetime import datetime
import time
import os

router = APIRouter(tags=["health"])


class ComponentHealth(BaseModel):
    status: str  # healthy, degraded, unhealthy
    message: Optional[str] = None
    latency_ms: Optional[float] = None
    details: Optional[Dict] = None


class SystemMetrics(BaseModel):
    cpu_percent: float
    memory_percent: float
    memory_used_gb: float
    gpu_available: bool
    gpu_memory_percent: Optional[float] = None


class HealthResponse(BaseModel):
    status: str  # healthy, degraded, unhealthy
    timestamp: str
    version: str
    uptime_seconds: float
    components: Dict[str, ComponentHealth]
    system: SystemMetrics


# Track service start time
_start_time = time.time()
_version = os.getenv("GNN_SERVICE_VERSION", "1.0.0")


@router.get("/health", response_model=HealthResponse)
async def comprehensive_health():
    """Comprehensive health check for all GNN service components."""
    components = {}

    components['models'] = _check_models()
    components['memgraph'] = await _check_memgraph()
    components['redis'] = _check_redis()
    components['gpu'] = _check_gpu()

    # Determine overall status
    statuses = [c.status for c in components.values()]
    if all(s == 'healthy' for s in statuses):
        overall = 'healthy'
    elif any(s == 'unhealthy' for s in statuses):
        overall = 'unhealthy'
    else:
        overall = 'degraded'

    return HealthResponse(
        status=overall,
        timestamp=datetime.now().isoformat(),
        version=_version,
        uptime_seconds=round(time.time() - _start_time, 1),
        components=components,
        system=_get_system_metrics()
    )


@router.get("/health/ready")
async def readiness():
    """Kubernetes readiness probe. Ready if service can accept requests."""
    health = await comprehensive_health()

    # Ready if at least core service is up (models can be degraded)
    if health.status == 'unhealthy':
        raise HTTPException(503, {"ready": False, "status": health.status})

    return {"ready": True, "status": health.status}


@router.get("/health/live")
async def liveness():
    """Kubernetes liveness probe. Alive if process is running."""
    return {"alive": True, "timestamp": datetime.now().isoformat()}


@router.get("/health/models")
async def models_health():
    """Detailed model health status."""
    from ..models.registry import ModelRegistry

    registry = ModelRegistry("checkpoints")

    model_status = {}
    for model_type in ['link_prediction', 'node_classification']:
        active = registry.get_active_model(model_type)
        versions = registry.list_models(model_type)

        model_status[model_type] = {
            'active_version': active.get('version') if active else None,
            'total_versions': len(versions),
            'latest_metrics': active.get('metrics', {}).get('test', {}) if active else {},
            'status': 'loaded' if active else 'not_loaded'
        }

    return model_status


# ═══ COMPONENT CHECKS ═══

def _check_models() -> ComponentHealth:
    """Check if models are registered."""
    try:
        from ..models.registry import ModelRegistry
        registry = ModelRegistry("checkpoints")

        link = registry.get_active_model('link_prediction')
        classification = registry.get_active_model('node_classification')

        if not link and not classification:
            return ComponentHealth(
                status='degraded',
                message='No models loaded (fallback mode active)',
                details={'link_prediction': False, 'node_classification': False}
            )

        loaded = []
        if link:
            loaded.append(f"link_prediction:v{link['version']}")
        if classification:
            loaded.append(f"node_classification:v{classification['version']}")

        return ComponentHealth(
            status='healthy',
            message=f"Models: {', '.join(loaded)}",
            details={
                'link_prediction': bool(link),
                'node_classification': bool(classification)
            }
        )

    except Exception as e:
        return ComponentHealth(status='degraded', message=f'Registry error: {str(e)[:60]}')


async def _check_memgraph() -> ComponentHealth:
    """Check Memgraph connectivity."""
    try:
        from neo4j import GraphDatabase

        start = time.time()
        uri = os.getenv('MEMGRAPH_URI', 'bolt://localhost:7687')
        user = os.getenv('MEMGRAPH_USER', os.getenv('NEO4J_USERNAME', 'memgraph'))
        password = os.getenv('MEMGRAPH_PASSWORD', os.getenv('NEO4J_PASSWORD', ''))

        driver = GraphDatabase.driver(uri, auth=(user, password))
        with driver.session() as session:
            session.run("RETURN 1")
        driver.close()

        latency = (time.time() - start) * 1000

        return ComponentHealth(
            status='healthy',
            latency_ms=round(latency, 2)
        )

    except Exception as e:
        return ComponentHealth(status='unhealthy', message=f'Memgraph: {str(e)[:60]}')


def _check_redis() -> ComponentHealth:
    """Check Redis connectivity."""
    try:
        import redis as redis_lib
        from ..config import CONFIG

        start = time.time()
        client = redis_lib.from_url(CONFIG['redis']['url'], socket_timeout=2)

        client.ping()
        latency = (time.time() - start) * 1000

        return ComponentHealth(
            status='healthy',
            latency_ms=round(latency, 2)
        )

    except Exception as e:
        return ComponentHealth(
            status='degraded',
            message=f'Redis unavailable (caching disabled): {str(e)[:30]}'
        )


def _check_gpu() -> ComponentHealth:
    """Check GPU availability."""
    try:
        import torch

        if not torch.cuda.is_available():
            return ComponentHealth(
                status='degraded',
                message='CUDA not available, using CPU'
            )

        device_name = torch.cuda.get_device_name(0)
        total = torch.cuda.get_device_properties(0).total_memory
        allocated = torch.cuda.memory_allocated(0)
        utilization = allocated / total if total > 0 else 0

        return ComponentHealth(
            status='healthy' if utilization < 0.9 else 'degraded',
            message=f'{device_name}',
            details={
                'memory_utilization': f'{utilization:.1%}',
                'total_memory_gb': round(total / 1e9, 2)
            }
        )

    except ImportError:
        return ComponentHealth(status='degraded', message='PyTorch not available')
    except Exception as e:
        return ComponentHealth(status='unhealthy', message=str(e)[:60])


def _get_system_metrics() -> SystemMetrics:
    """Get system resource metrics."""
    try:
        import psutil
        memory = psutil.virtual_memory()
        cpu = psutil.cpu_percent()
    except ImportError:
        # psutil not available — return defaults
        return SystemMetrics(
            cpu_percent=0,
            memory_percent=0,
            memory_used_gb=0,
            gpu_available=False
        )

    gpu_available = False
    gpu_memory = None

    try:
        import torch
        if torch.cuda.is_available():
            gpu_available = True
            total = torch.cuda.get_device_properties(0).total_memory
            allocated = torch.cuda.memory_allocated(0)
            gpu_memory = (allocated / total) * 100 if total > 0 else 0
    except Exception:
        pass

    return SystemMetrics(
        cpu_percent=cpu,
        memory_percent=memory.percent,
        memory_used_gb=round(memory.used / 1e9, 2),
        gpu_available=gpu_available,
        gpu_memory_percent=round(gpu_memory, 1) if gpu_memory is not None else None
    )
