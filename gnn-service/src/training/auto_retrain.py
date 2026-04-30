"""
Automated Model Retraining Scheduler — Phase C3.2

Supports multiple trigger types:
- SCHEDULED: periodic retraining on interval
- DRIFT: performance degradation detection
- MANUAL: API-triggered retraining
- DATA_CHANGE: graph structure change detection
- THRESHOLD: performance below minimum thresholds

State is persisted to disk so the scheduler survives restarts.
"""

import asyncio
import json
import logging
from datetime import datetime, timedelta
from typing import Dict, Optional, List
from pathlib import Path
from enum import Enum

logger = logging.getLogger(__name__)


class RetrainTrigger(str, Enum):
    SCHEDULED = "scheduled"
    DRIFT = "drift"
    MANUAL = "manual"
    DATA_CHANGE = "data_change"
    THRESHOLD = "threshold"


class RetrainStatus(str, Enum):
    IDLE = "idle"
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class AutoRetrainScheduler:
    """
    Manages automated model retraining based on configurable triggers.

    Usage:
        scheduler = get_scheduler()
        await scheduler.start()           # Start background loop
        await scheduler.trigger_retrain(  # Manual trigger
            'link_prediction', 'Manual trigger'
        )
        scheduler.get_status()            # Check status
        await scheduler.stop()            # Stop background loop
    """

    def __init__(self, config: Dict = None):
        self.config = config or self._default_config()
        self.status = RetrainStatus.IDLE
        self.last_retrain: Dict[str, datetime] = {}
        self.metrics_baseline: Dict[str, Dict] = {}
        self.pending_jobs: List[Dict] = []
        self._running = False
        self._task: Optional[asyncio.Task] = None

        # State persistence
        self.state_file = Path(self.config.get('state_file', 'checkpoints/retrain_state.json'))
        self._load_state()

    @staticmethod
    def _default_config() -> Dict:
        return {
            'check_interval_minutes': 60,
            'min_retrain_interval_hours': 24,

            # Drift detection
            'drift_threshold': 0.1,
            'drift_window_hours': 6,

            # Data change detection
            'node_change_threshold': 0.1,
            'edge_change_threshold': 0.15,

            # Performance thresholds
            'min_link_auc': 0.65,
            'min_classification_f1': 0.45,

            # Training config
            'training_config': {
                'epochs': 100,
                'patience': 15,
                'hidden_dim': 128,
                'lr': 0.001,
            },

            'state_file': 'checkpoints/retrain_state.json'
        }

    def _load_state(self):
        """Load persisted state from disk."""
        if self.state_file.exists():
            try:
                with open(self.state_file) as f:
                    state = json.load(f)
                    self.last_retrain = {
                        k: datetime.fromisoformat(v)
                        for k, v in state.get('last_retrain', {}).items()
                    }
                    self.metrics_baseline = state.get('metrics_baseline', {})
                    logger.info(f"Loaded retrain state: last_retrain={list(self.last_retrain.keys())}")
            except Exception as e:
                logger.warning(f"Failed to load retrain state: {e}")

    def _save_state(self):
        """Persist state to disk."""
        try:
            self.state_file.parent.mkdir(parents=True, exist_ok=True)
            state = {
                'last_retrain': {k: v.isoformat() for k, v in self.last_retrain.items()},
                'metrics_baseline': self.metrics_baseline,
                'updated_at': datetime.now().isoformat()
            }
            with open(self.state_file, 'w') as f:
                json.dump(state, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save retrain state: {e}")

    # ═══ LIFECYCLE ═══

    async def start(self):
        """Start the scheduler background task."""
        if self._running:
            logger.warning("Scheduler already running")
            return
        self._running = True
        self._task = asyncio.create_task(self._run_loop())
        logger.info("Auto-retrain scheduler started")

    async def stop(self):
        """Stop the scheduler."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("Auto-retrain scheduler stopped")

    async def _run_loop(self):
        """Main scheduler loop — checks triggers at configured interval."""
        interval = self.config['check_interval_minutes'] * 60

        while self._running:
            try:
                await self._check_triggers()
                await self._process_pending_jobs()
            except Exception as e:
                logger.error(f"Scheduler loop error: {e}")

            await asyncio.sleep(interval)

    # ═══ TRIGGER CHECKS ═══

    async def _check_triggers(self):
        """Check all retrain triggers and queue jobs as needed."""
        triggers_fired = []

        drift_result = await self._check_drift()
        if drift_result.get('triggered'):
            triggers_fired.append(('drift', drift_result))

        data_result = await self._check_data_changes()
        if data_result.get('triggered'):
            triggers_fired.append(('data_change', data_result))

        threshold_result = await self._check_thresholds()
        if threshold_result.get('triggered'):
            triggers_fired.append(('threshold', threshold_result))

        for trigger_type, result in triggers_fired:
            for model_type in result.get('models', ['link_prediction', 'node_classification']):
                await self._queue_retrain(
                    model_type,
                    RetrainTrigger(trigger_type),
                    result.get('reason', '')
                )

    async def _check_drift(self) -> Dict:
        """Check for performance drift vs baseline."""
        try:
            threshold = self.config['drift_threshold']
            drifted = []
            reasons = []

            for model_type in ['link_prediction', 'node_classification']:
                baseline = self.metrics_baseline.get(model_type, {})
                if not baseline:
                    continue

                recent_metrics = await self._get_recent_metrics(model_type)
                if not recent_metrics:
                    continue

                baseline_score = baseline.get('auc', baseline.get('f1_macro', 0))
                recent_score = recent_metrics.get('auc', recent_metrics.get('f1_macro', 0))

                if baseline_score > 0:
                    drift = (baseline_score - recent_score) / baseline_score
                    if drift > threshold:
                        drifted.append(model_type)
                        reasons.append(f"{model_type}: {drift:.1%} performance drop")

            return {
                'triggered': len(drifted) > 0,
                'models': drifted,
                'reason': '; '.join(reasons)
            }

        except Exception as e:
            logger.error(f"Drift check failed: {e}")
            return {'triggered': False}

    async def _check_data_changes(self) -> Dict:
        """Check if graph structure changed significantly since last training."""
        try:
            current_stats = await self._get_graph_stats()
            if not current_stats.get('nodes'):
                return {'triggered': False}

            baseline_stats = self.metrics_baseline.get('graph_stats', {})
            if not baseline_stats:
                self.metrics_baseline['graph_stats'] = current_stats
                self._save_state()
                return {'triggered': False}

            base_nodes = max(baseline_stats.get('nodes', 1), 1)
            base_edges = max(baseline_stats.get('edges', 1), 1)

            node_change = abs(current_stats['nodes'] - base_nodes) / base_nodes
            edge_change = abs(current_stats['edges'] - base_edges) / base_edges

            triggered = (
                node_change > self.config['node_change_threshold'] or
                edge_change > self.config['edge_change_threshold']
            )

            if triggered:
                return {
                    'triggered': True,
                    'models': ['link_prediction', 'node_classification'],
                    'reason': f"Graph changed: nodes {node_change:.1%}, edges {edge_change:.1%}"
                }

            return {'triggered': False}

        except Exception as e:
            logger.error(f"Data change check failed: {e}")
            return {'triggered': False}

    async def _check_thresholds(self) -> Dict:
        """Check if model metrics are below minimum thresholds."""
        try:
            from ..models.registry import ModelRegistry
            registry = ModelRegistry()

            below = []
            reasons = []

            link_model = registry.get_active_model('link_prediction')
            if link_model:
                auc = link_model.get('metrics', {}).get('test', {}).get('auc', 1.0)
                if auc < self.config['min_link_auc']:
                    below.append('link_prediction')
                    reasons.append(f"link AUC {auc:.3f} < {self.config['min_link_auc']}")

            class_model = registry.get_active_model('node_classification')
            if class_model:
                f1 = class_model.get('metrics', {}).get('test', {}).get('f1_macro', 1.0)
                if f1 < self.config['min_classification_f1']:
                    below.append('node_classification')
                    reasons.append(f"classification F1 {f1:.3f} < {self.config['min_classification_f1']}")

            return {
                'triggered': len(below) > 0,
                'models': below,
                'reason': '; '.join(reasons)
            }

        except Exception as e:
            logger.error(f"Threshold check failed: {e}")
            return {'triggered': False}

    # ═══ JOB MANAGEMENT ═══

    async def _queue_retrain(self, model_type: str, trigger: RetrainTrigger, reason: str):
        """Queue a retraining job with cooldown enforcement."""
        last = self.last_retrain.get(model_type)
        min_interval = timedelta(hours=self.config['min_retrain_interval_hours'])

        if last and datetime.now() - last < min_interval:
            logger.info(f"Skipping {model_type} retrain: cooldown active (last: {last.isoformat()})")
            return

        if any(j['model_type'] == model_type and j['status'] == 'queued' for j in self.pending_jobs):
            logger.info(f"Skipping {model_type} retrain: already queued")
            return

        job = {
            'id': f"{model_type}_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            'model_type': model_type,
            'trigger': trigger.value,
            'reason': reason,
            'status': 'queued',
            'queued_at': datetime.now().isoformat()
        }

        self.pending_jobs.append(job)
        logger.info(f"Queued retrain: {job['id']} ({trigger.value}: {reason})")

    async def _process_pending_jobs(self):
        """Process the next queued job if not already running."""
        if self.status == RetrainStatus.RUNNING:
            return

        queued = [j for j in self.pending_jobs if j['status'] == 'queued']
        if not queued:
            return

        await self._execute_retrain(queued[0])

    async def _execute_retrain(self, job: Dict):
        """Execute a single retraining job."""
        self.status = RetrainStatus.RUNNING
        job['status'] = 'running'
        job['started_at'] = datetime.now().isoformat()

        logger.info(f"Starting retrain: {job['id']}")

        try:
            # Import training module
            from ..data.dataset import ProjectAdvisorDataset
            from ..training.trainer import LinkPredictionTrainer, NodeClassificationTrainer
            from ..models.registry import ModelRegistry

            import torch

            registry = ModelRegistry()
            version = datetime.now().strftime('%Y%m%d_%H%M%S')
            config = self.config['training_config']

            dataset = ProjectAdvisorDataset()
            dataset.load()

            if job['model_type'] == 'link_prediction':
                from ..models.link_prediction import create_model

                train_data, val_data, test_data = dataset.create_link_prediction_split()
                model = create_model(train_data.x.shape[1], config)
                device = 'cuda' if torch.cuda.is_available() else 'cpu'

                trainer = LinkPredictionTrainer(
                    model=model,
                    device=device,
                    learning_rate=config.get('lr', 0.001),
                )

                history = trainer.train(
                    train_data=train_data,
                    val_data=val_data,
                    epochs=config.get('epochs', 100),
                    patience=config.get('patience', 15),
                    checkpoint_dir='checkpoints',
                )

                test_metrics = trainer.evaluate(test_data)
                metrics = {'test': test_metrics, 'best_val_auc': history['best_val_auc']}

            elif job['model_type'] == 'node_classification':
                from ..models.node_classification import GraphSAGEClassifier

                data = dataset.create_classification_split()
                model = GraphSAGEClassifier(
                    in_channels=data.x.size(1),
                    hidden_channels=config.get('hidden_dim', 128),
                    out_channels=data.num_classes,
                    num_layers=config.get('num_layers', 3),
                    dropout=config.get('dropout', 0.4),
                )

                device = 'cuda' if torch.cuda.is_available() else 'cpu'
                trainer = NodeClassificationTrainer(
                    model=model,
                    device=device,
                    learning_rate=config.get('lr', 0.001),
                )

                result = trainer.train(
                    data=data,
                    epochs=config.get('epochs', 150),
                    patience=config.get('patience', 20),
                )

                metrics = {'test': {'accuracy': result['test_acc']}}

            else:
                raise ValueError(f"Unknown model type: {job['model_type']}")

            # Register and activate
            registry.register_model(
                model_type=job['model_type'],
                version=version,
                checkpoint_path=f'checkpoints/best_model.pt',
                metrics=metrics,
                config=config,
            )
            registry.activate_model(job['model_type'], version)

            job['status'] = 'completed'
            job['completed_at'] = datetime.now().isoformat()
            job['metrics'] = metrics.get('test', {})
            job['version'] = version

            self.metrics_baseline[job['model_type']] = metrics.get('test', {})
            self.last_retrain[job['model_type']] = datetime.now()
            self._save_state()

            logger.info(f"Retrain completed: {job['id']} v{version}")

            # Update monitoring
            try:
                from ..monitoring.metrics import TRAINING_RUNS_TOTAL, update_model_metrics
                TRAINING_RUNS_TOTAL.labels(
                    model_type=job['model_type'], trigger=job['trigger'], status='success'
                ).inc()
                update_model_metrics(job['model_type'], metrics.get('test', {}))
            except Exception:
                pass

        except Exception as e:
            job['status'] = 'failed'
            job['error'] = str(e)[:200]
            job['failed_at'] = datetime.now().isoformat()
            logger.error(f"Retrain failed: {job['id']} — {e}")

            try:
                from ..monitoring.metrics import TRAINING_RUNS_TOTAL
                TRAINING_RUNS_TOTAL.labels(
                    model_type=job['model_type'], trigger=job['trigger'], status='failed'
                ).inc()
            except Exception:
                pass

        finally:
            self.status = RetrainStatus.IDLE

    # ═══ PUBLIC API ═══

    async def trigger_retrain(self, model_type: str, reason: str = "Manual trigger") -> Dict:
        """Manually trigger retraining for a model type."""
        await self._queue_retrain(model_type, RetrainTrigger.MANUAL, reason)
        return {
            'queued': True,
            'model_type': model_type,
            'reason': reason,
            'pending': len([j for j in self.pending_jobs if j['status'] == 'queued'])
        }

    def get_status(self) -> Dict:
        """Get full scheduler status."""
        return {
            'status': self.status.value,
            'running': self._running,
            'last_retrain': {k: v.isoformat() for k, v in self.last_retrain.items()},
            'pending_jobs': len([j for j in self.pending_jobs if j['status'] == 'queued']),
            'recent_jobs': self.pending_jobs[-10:],
            'config': {
                'check_interval_minutes': self.config['check_interval_minutes'],
                'min_retrain_interval_hours': self.config['min_retrain_interval_hours'],
                'drift_threshold': self.config['drift_threshold'],
                'node_change_threshold': self.config['node_change_threshold'],
                'min_link_auc': self.config['min_link_auc'],
                'min_classification_f1': self.config['min_classification_f1'],
            }
        }

    # ═══ HELPERS ═══

    async def _get_recent_metrics(self, model_type: str) -> Optional[Dict]:
        """Get recent prediction performance metrics.

        TODO: Implement metrics storage and retrieval via Redis/time-series.
        Currently returns None, effectively disabling drift detection
        until a metrics collection pipeline is set up.
        """
        return None

    async def _get_graph_stats(self) -> Dict:
        """Get current graph node/edge counts from Memgraph."""
        try:
            from neo4j import GraphDatabase
            import os

            uri = os.getenv('MEMGRAPH_URI', 'bolt://localhost:7687')
            user = os.getenv('MEMGRAPH_USER', os.getenv('NEO4J_USERNAME', 'memgraph'))
            password = os.getenv('MEMGRAPH_PASSWORD', os.getenv('NEO4J_PASSWORD', ''))

            driver = GraphDatabase.driver(uri, auth=(user, password))
            with driver.session() as session:
                result = session.run(
                    "MATCH (n) WITH count(n) AS nodes "
                    "MATCH ()-[r]->() RETURN nodes, count(r) AS edges"
                )
                record = result.single()
            driver.close()

            return {
                'nodes': record['nodes'] if record else 0,
                'edges': record['edges'] if record else 0,
                'timestamp': datetime.now().isoformat()
            }

        except Exception as e:
            logger.error(f"Failed to get graph stats: {e}")
            return {'nodes': 0, 'edges': 0}


# ═══ SINGLETON ═══

_scheduler: Optional[AutoRetrainScheduler] = None


def get_scheduler(config: Dict = None) -> AutoRetrainScheduler:
    """Get or create scheduler singleton."""
    global _scheduler
    if _scheduler is None:
        _scheduler = AutoRetrainScheduler(config)
    return _scheduler
