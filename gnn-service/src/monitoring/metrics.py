"""
Prometheus metrics for GNN service monitoring — Phase C3.3

Defines counters, histograms, and gauges for tracking:
- Prediction requests and latency
- Training runs and duration
- Model accuracy and version info
- Graph size metrics
- Cache effectiveness
"""

from functools import wraps
import time

try:
    from prometheus_client import Counter, Histogram, Gauge, Info
    PROMETHEUS_AVAILABLE = True
except ImportError:
    PROMETHEUS_AVAILABLE = False

# ═══ STUB CLASSES (when prometheus_client not installed) ═══

class _StubMetric:
    """No-op metric when prometheus_client is not available."""
    def labels(self, **kwargs):
        return self
    def inc(self, amount=1):
        pass
    def observe(self, value):
        pass
    def set(self, value):
        pass
    def info(self, val):
        pass


def _make(factory, *args, **kwargs):
    if PROMETHEUS_AVAILABLE:
        return factory(*args, **kwargs)
    return _StubMetric()


# ═══ COUNTERS ═══

PREDICTIONS_TOTAL = _make(
    Counter if PROMETHEUS_AVAILABLE else None,
    'gnn_predictions_total',
    'Total predictions made',
    ['model_type', 'status', 'fallback']
) if PROMETHEUS_AVAILABLE else _StubMetric()

TRAINING_RUNS_TOTAL = _make(
    Counter if PROMETHEUS_AVAILABLE else None,
    'gnn_training_runs_total',
    'Total training runs',
    ['model_type', 'trigger', 'status']
) if PROMETHEUS_AVAILABLE else _StubMetric()


# ═══ HISTOGRAMS ═══

PREDICTION_LATENCY = _make(
    Histogram if PROMETHEUS_AVAILABLE else None,
    'gnn_prediction_latency_seconds',
    'Prediction latency',
    ['model_type'],
    buckets=[0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0]
) if PROMETHEUS_AVAILABLE else _StubMetric()

EMBEDDING_LATENCY = _make(
    Histogram if PROMETHEUS_AVAILABLE else None,
    'gnn_embedding_latency_seconds',
    'Embedding computation latency',
    ['operation'],
    buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1.0]
) if PROMETHEUS_AVAILABLE else _StubMetric()

TRAINING_DURATION = _make(
    Histogram if PROMETHEUS_AVAILABLE else None,
    'gnn_training_duration_seconds',
    'Training duration',
    ['model_type'],
    buckets=[60, 300, 600, 1800, 3600, 7200]
) if PROMETHEUS_AVAILABLE else _StubMetric()


# ═══ GAUGES ═══

MODEL_ACCURACY = _make(
    Gauge if PROMETHEUS_AVAILABLE else None,
    'gnn_model_accuracy',
    'Current model accuracy/AUC',
    ['model_type', 'metric']
) if PROMETHEUS_AVAILABLE else _StubMetric()

CACHE_HIT_RATE = _make(
    Gauge if PROMETHEUS_AVAILABLE else None,
    'gnn_cache_hit_rate',
    'Cache hit rate for predictions',
    ['model_type']
) if PROMETHEUS_AVAILABLE else _StubMetric()

GRAPH_NODES_TOTAL = _make(
    Gauge if PROMETHEUS_AVAILABLE else None,
    'gnn_graph_nodes_total',
    'Total nodes in training graph'
) if PROMETHEUS_AVAILABLE else _StubMetric()

GRAPH_EDGES_TOTAL = _make(
    Gauge if PROMETHEUS_AVAILABLE else None,
    'gnn_graph_edges_total',
    'Total edges in training graph'
) if PROMETHEUS_AVAILABLE else _StubMetric()


# ═══ DECORATORS ═══

def track_prediction(model_type: str):
    """Decorator to track prediction metrics."""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            start = time.time()
            fallback = 'false'
            status = 'success'

            try:
                result = await func(*args, **kwargs)
                if isinstance(result, dict):
                    fallback = 'true' if result.get('fallback') else 'false'
                return result
            except Exception:
                status = 'error'
                raise
            finally:
                duration = time.time() - start
                PREDICTIONS_TOTAL.labels(
                    model_type=model_type,
                    status=status,
                    fallback=fallback
                ).inc()
                PREDICTION_LATENCY.labels(model_type=model_type).observe(duration)

        return wrapper
    return decorator


def track_embedding(operation: str):
    """Decorator to track embedding computation."""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            start = time.time()
            try:
                return await func(*args, **kwargs)
            finally:
                EMBEDDING_LATENCY.labels(operation=operation).observe(time.time() - start)
        return wrapper
    return decorator


# ═══ UPDATE FUNCTIONS ═══

def update_model_metrics(model_type: str, metrics: dict):
    """Update model performance gauges."""
    for metric_name, value in metrics.items():
        if isinstance(value, (int, float)):
            MODEL_ACCURACY.labels(model_type=model_type, metric=metric_name).set(value)


def update_graph_stats(nodes: int, edges: int):
    """Update graph size metrics."""
    GRAPH_NODES_TOTAL.set(nodes)
    GRAPH_EDGES_TOTAL.set(edges)
