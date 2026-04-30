"""
Model Registry — Phase C1.4

Manages GNN model versions, checkpoints, and activation.
Stores metadata in a JSON registry file alongside checkpoints.
"""

import json
from pathlib import Path
from typing import Dict, List, Optional
from datetime import datetime

import torch


class ModelRegistry:
    """Manages model versions and checkpoints."""

    def __init__(self, checkpoint_dir: str = 'checkpoints'):
        self.checkpoint_dir = Path(checkpoint_dir)
        self.checkpoint_dir.mkdir(parents=True, exist_ok=True)
        self.registry_file = self.checkpoint_dir / 'registry.json'
        self._load_registry()

    def _load_registry(self):
        if self.registry_file.exists():
            with open(self.registry_file) as f:
                self.registry = json.load(f)
        else:
            self.registry = {'models': {}, 'active': {}}

    def _save_registry(self):
        with open(self.registry_file, 'w') as f:
            json.dump(self.registry, f, indent=2)

    def register_model(
        self,
        model_type: str,
        version: str,
        checkpoint_path: str,
        metrics: Dict,
        config: Dict,
    ) -> str:
        """Register a new model version."""
        if model_type not in self.registry['models']:
            self.registry['models'][model_type] = []

        entry = {
            'version': version,
            'checkpoint': checkpoint_path,
            'metrics': self._serialize_metrics(metrics),
            'config': config,
            'registered_at': datetime.now().isoformat(),
            'status': 'registered',
        }

        self.registry['models'][model_type].append(entry)
        self._save_registry()
        return version

    def activate_model(self, model_type: str, version: str) -> bool:
        """Set a model version as active for inference."""
        models = self.registry['models'].get(model_type, [])
        for model in models:
            if model['version'] == version:
                self.registry['active'][model_type] = version
                self._save_registry()
                return True
        return False

    def get_active_model(self, model_type: str) -> Optional[Dict]:
        """Get the currently active model for a type."""
        active_version = self.registry['active'].get(model_type)
        if not active_version:
            return None
        models = self.registry['models'].get(model_type, [])
        for model in models:
            if model['version'] == active_version:
                return model
        return None

    def list_models(self, model_type: str) -> List[Dict]:
        """List all versions of a model type."""
        return self.registry['models'].get(model_type, [])

    def get_best_model(self, model_type: str, metric: str = 'auc') -> Optional[Dict]:
        """Get the best performing model by a metric."""
        models = self.registry['models'].get(model_type, [])
        if not models:
            return None

        def _get_metric(m):
            test = m.get('metrics', {}).get('test', {})
            return test.get(metric, 0)

        return max(models, key=_get_metric)

    def compare_versions(
        self, model_type: str, version_a: str, version_b: str
    ) -> Dict:
        """Compare metrics between two versions."""
        models = self.registry['models'].get(model_type, [])
        a = next((m for m in models if m['version'] == version_a), None)
        b = next((m for m in models if m['version'] == version_b), None)
        if not a or not b:
            raise ValueError('One or both versions not found')

        comparison = {'version_a': version_a, 'version_b': version_b, 'diff': {}}
        test_a = a.get('metrics', {}).get('test', {})
        test_b = b.get('metrics', {}).get('test', {})
        for metric in set(list(test_a.keys()) + list(test_b.keys())):
            va = test_a.get(metric, 0)
            vb = test_b.get(metric, 0)
            if isinstance(va, (int, float)) and isinstance(vb, (int, float)):
                comparison['diff'][metric] = {
                    'a': va, 'b': vb,
                    'delta': vb - va,
                    'improved': vb > va,
                }
        return comparison

    def delete_model(self, model_type: str, version: str) -> bool:
        """Delete a model version from registry (not checkpoint file)."""
        models = self.registry['models'].get(model_type, [])
        before = len(models)
        self.registry['models'][model_type] = [
            m for m in models if m['version'] != version
        ]
        if len(self.registry['models'][model_type]) < before:
            self._save_registry()
            return True
        return False

    def load_checkpoint(self, model_type: str, version: Optional[str] = None):
        """Load model checkpoint from disk."""
        if version:
            models = self.registry['models'].get(model_type, [])
            info = next((m for m in models if m['version'] == version), None)
        else:
            info = self.get_active_model(model_type)

        if not info:
            raise ValueError(f'Model not found: {model_type} v{version}')

        return torch.load(info['checkpoint'], map_location='cpu')

    @staticmethod
    def _serialize_metrics(metrics: Dict) -> Dict:
        """Make metrics JSON-serializable (strip numpy/torch types)."""
        result = {}
        for k, v in metrics.items():
            if isinstance(v, dict):
                result[k] = ModelRegistry._serialize_metrics(v)
            elif isinstance(v, (list, tuple)):
                result[k] = [
                    float(x) if hasattr(x, 'item') else x for x in v
                ]
            elif hasattr(v, 'item'):
                result[k] = v.item()
            elif isinstance(v, float) and v != v:  # NaN
                result[k] = 0.0
            else:
                result[k] = v
        return result
