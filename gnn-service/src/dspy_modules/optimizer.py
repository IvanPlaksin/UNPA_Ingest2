"""
DSPy Prompt Optimizer with MIPROv2

Automatic prompt optimization for knowledge graph extraction modules.
Uses Bayesian optimization to find optimal prompts.
"""

import dspy
from dspy.teleprompt import MIPROv2, BootstrapFewShot, BootstrapFewShotWithRandomSearch
import json
import os
from typing import List, Dict, Any, Optional, Callable
from dataclasses import dataclass, field
from datetime import datetime
import hashlib


# ═══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class OptimizationConfig:
    """Configuration for prompt optimization."""

    # Optimizer settings
    optimizer: str = "miprov2"  # 'miprov2', 'bootstrap', 'bootstrap_random'
    num_candidates: int = 10
    num_threads: int = 4
    max_bootstrapped_demos: int = 4
    max_labeled_demos: int = 8

    # MIPROv2 specific
    num_trials: int = 30
    minibatch_size: int = 25
    minibatch_full_eval_steps: int = 10
    verbose: bool = True

    # Training data
    train_size: int = 50
    val_size: int = 20

    # Model settings
    teacher_model: str = "claude-3-opus-20240229"
    student_model: str = "claude-3-haiku-20240307"

    # Saving
    save_path: str = "./optimized_prompts"
    experiment_name: str = "kg_extraction"

    def to_dict(self) -> Dict:
        return {
            'optimizer': self.optimizer,
            'num_candidates': self.num_candidates,
            'num_trials': self.num_trials,
            'train_size': self.train_size,
            'val_size': self.val_size,
            'teacher_model': self.teacher_model,
            'student_model': self.student_model
        }


# ═══════════════════════════════════════════════════════════════════════════════
# METRICS FOR OPTIMIZATION
# ═══════════════════════════════════════════════════════════════════════════════

def entity_extraction_metric(gold: dspy.Example, pred: dspy.Prediction, trace=None) -> float:
    """
    Metric for entity extraction quality.

    Measures precision, recall, F1 of extracted entities.
    """
    try:
        gold_entities = set()
        pred_entities = set()

        # Parse gold entities
        if hasattr(gold, 'entities'):
            gold_data = json.loads(gold.entities) if isinstance(gold.entities, str) else gold.entities
            for e in gold_data:
                gold_entities.add((e.get('name', '').lower(), e.get('type', '')))

        # Parse predicted entities
        if hasattr(pred, 'parsed_entities'):
            for e in pred.parsed_entities:
                pred_entities.add((e.get('name', '').lower(), e.get('type', '')))
        elif hasattr(pred, 'entities'):
            pred_data = json.loads(pred.entities) if isinstance(pred.entities, str) else pred.entities
            for e in pred_data:
                pred_entities.add((e.get('name', '').lower(), e.get('type', '')))

        if not gold_entities:
            return 1.0 if not pred_entities else 0.0

        # Calculate F1
        true_positives = len(gold_entities & pred_entities)
        precision = true_positives / len(pred_entities) if pred_entities else 0
        recall = true_positives / len(gold_entities) if gold_entities else 0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0

        return f1

    except Exception:
        return 0.0


def relation_extraction_metric(gold: dspy.Example, pred: dspy.Prediction, trace=None) -> float:
    """
    Metric for relation extraction quality.

    Measures precision, recall, F1 of extracted relations.
    """
    try:
        gold_relations = set()
        pred_relations = set()

        # Parse gold relations
        if hasattr(gold, 'relations'):
            gold_data = json.loads(gold.relations) if isinstance(gold.relations, str) else gold.relations
            for r in gold_data:
                gold_relations.add((
                    r.get('source', '').lower(),
                    r.get('target', '').lower(),
                    r.get('relation_type', r.get('type', '')).upper()
                ))

        # Parse predicted relations
        if hasattr(pred, 'parsed_relations'):
            for r in pred.parsed_relations:
                pred_relations.add((
                    r.get('source', '').lower(),
                    r.get('target', '').lower(),
                    r.get('relation_type', r.get('type', '')).upper()
                ))
        elif hasattr(pred, 'relations'):
            pred_data = json.loads(pred.relations) if isinstance(pred.relations, str) else pred.relations
            for r in pred_data:
                pred_relations.add((
                    r.get('source', '').lower(),
                    r.get('target', '').lower(),
                    r.get('relation_type', r.get('type', '')).upper()
                ))

        if not gold_relations:
            return 1.0 if not pred_relations else 0.0

        # Calculate F1
        true_positives = len(gold_relations & pred_relations)
        precision = true_positives / len(pred_relations) if pred_relations else 0
        recall = true_positives / len(gold_relations) if gold_relations else 0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0

        return f1

    except Exception:
        return 0.0


def combined_kg_metric(gold: dspy.Example, pred: dspy.Prediction, trace=None) -> float:
    """Combined metric for full KG extraction."""
    entity_score = entity_extraction_metric(gold, pred, trace)
    relation_score = relation_extraction_metric(gold, pred, trace)

    # Weighted average (entities slightly more important)
    return 0.6 * entity_score + 0.4 * relation_score


def verification_metric(gold: dspy.Example, pred: dspy.Prediction, trace=None) -> float:
    """Metric for verification quality."""
    try:
        gold_score = gold.score if hasattr(gold, 'score') else 0.5
        pred_score = pred.score if hasattr(pred, 'score') else 0.5

        # How close is prediction to gold
        diff = abs(gold_score - pred_score)
        return max(0, 1.0 - diff)

    except Exception:
        return 0.0


# ═══════════════════════════════════════════════════════════════════════════════
# PROMPT OPTIMIZER CLASS
# ═══════════════════════════════════════════════════════════════════════════════

class PromptOptimizer:
    """Optimizes DSPy prompts for KG extraction tasks."""

    def __init__(self, config: Optional[OptimizationConfig] = None):
        """
        Initialize prompt optimizer.

        Args:
            config: Optimization configuration
        """
        self.config = config or OptimizationConfig()
        self.optimized_modules = {}
        self.optimization_history = []

    def optimize_module(
        self,
        module: dspy.Module,
        trainset: List[dspy.Example],
        valset: Optional[List[dspy.Example]] = None,
        metric: Optional[Callable] = None,
        module_name: str = "module"
    ) -> dspy.Module:
        """
        Optimize a DSPy module's prompts.

        Args:
            module: DSPy module to optimize
            trainset: Training examples
            valset: Validation examples (optional, split from train if not provided)
            metric: Evaluation metric function
            module_name: Name for saving/loading

        Returns:
            Optimized DSPy module
        """
        # Split data if no valset
        if valset is None:
            split_idx = int(len(trainset) * 0.8)
            valset = trainset[split_idx:]
            trainset = trainset[:split_idx]

        # Default metric
        if metric is None:
            metric = combined_kg_metric

        # Select optimizer
        optimizer = self._create_optimizer()

        # Run optimization
        print(f"[DSPy Optimizer] Starting {self.config.optimizer} optimization...")
        print(f"[DSPy Optimizer] Train: {len(trainset)}, Val: {len(valset)}")

        start_time = datetime.now()

        optimized = optimizer.compile(
            module,
            trainset=trainset,
            metric=metric,
            num_trials=self.config.num_trials if self.config.optimizer == 'miprov2' else None
        )

        end_time = datetime.now()
        duration = (end_time - start_time).total_seconds()

        # Evaluate on validation set
        val_score = self._evaluate(optimized, valset, metric)

        # Record optimization
        optimization_record = {
            'module_name': module_name,
            'optimizer': self.config.optimizer,
            'train_size': len(trainset),
            'val_size': len(valset),
            'val_score': val_score,
            'duration_seconds': duration,
            'timestamp': datetime.now().isoformat(),
            'config': self.config.to_dict()
        }

        self.optimization_history.append(optimization_record)
        self.optimized_modules[module_name] = optimized

        print(f"[DSPy Optimizer] Optimization complete in {duration:.1f}s")
        print(f"[DSPy Optimizer] Validation score: {val_score:.4f}")

        # Save optimized module
        self._save_module(optimized, module_name, optimization_record)

        return optimized

    def _create_optimizer(self):
        """Create optimizer instance based on config."""
        if self.config.optimizer == 'miprov2':
            return MIPROv2(
                metric=None,  # Set in compile
                num_candidates=self.config.num_candidates,
                num_threads=self.config.num_threads,
                max_bootstrapped_demos=self.config.max_bootstrapped_demos,
                max_labeled_demos=self.config.max_labeled_demos,
                verbose=self.config.verbose
            )
        elif self.config.optimizer == 'bootstrap_random':
            return BootstrapFewShotWithRandomSearch(
                metric=None,
                max_bootstrapped_demos=self.config.max_bootstrapped_demos,
                max_labeled_demos=self.config.max_labeled_demos,
                num_candidate_programs=self.config.num_candidates,
                num_threads=self.config.num_threads
            )
        else:  # bootstrap
            return BootstrapFewShot(
                metric=None,
                max_bootstrapped_demos=self.config.max_bootstrapped_demos,
                max_labeled_demos=self.config.max_labeled_demos
            )

    def _evaluate(
        self,
        module: dspy.Module,
        dataset: List[dspy.Example],
        metric: Callable
    ) -> float:
        """Evaluate module on dataset."""
        scores = []
        for example in dataset:
            try:
                pred = module(text=example.text, context=getattr(example, 'context', ''))
                score = metric(example, pred)
                scores.append(score)
            except Exception:
                scores.append(0.0)

        return sum(scores) / len(scores) if scores else 0.0

    def _save_module(
        self,
        module: dspy.Module,
        module_name: str,
        record: Dict
    ):
        """Save optimized module to disk."""
        save_dir = os.path.join(self.config.save_path, self.config.experiment_name)
        os.makedirs(save_dir, exist_ok=True)

        # Generate unique filename
        hash_suffix = hashlib.md5(datetime.now().isoformat().encode()).hexdigest()[:8]
        filename = f"{module_name}_{hash_suffix}.json"
        filepath = os.path.join(save_dir, filename)

        # Save module state
        module.save(filepath)

        # Save metadata
        meta_filepath = filepath.replace('.json', '_meta.json')
        with open(meta_filepath, 'w') as f:
            json.dump(record, f, indent=2)

        print(f"[DSPy Optimizer] Saved to {filepath}")

    def load_module(
        self,
        module: dspy.Module,
        module_name: str,
        version: str = "latest"
    ) -> dspy.Module:
        """Load optimized module from disk."""
        save_dir = os.path.join(self.config.save_path, self.config.experiment_name)

        if version == "latest":
            # Find latest file
            files = [f for f in os.listdir(save_dir) if f.startswith(module_name) and f.endswith('.json') and '_meta' not in f]
            if not files:
                raise FileNotFoundError(f"No saved module found for {module_name}")
            filepath = os.path.join(save_dir, sorted(files)[-1])
        else:
            filepath = os.path.join(save_dir, version)

        module.load(filepath)
        print(f"[DSPy Optimizer] Loaded from {filepath}")

        return module

    def get_optimization_history(self) -> List[Dict]:
        """Get optimization history."""
        return self.optimization_history


# ═══════════════════════════════════════════════════════════════════════════════
# TRAINING DATA GENERATORS
# ═══════════════════════════════════════════════════════════════════════════════

def create_entity_examples(data: List[Dict]) -> List[dspy.Example]:
    """
    Create DSPy examples for entity extraction training.

    Args:
        data: List of {text, entities} dicts

    Returns:
        List of dspy.Example objects
    """
    examples = []
    for item in data:
        examples.append(dspy.Example(
            text=item['text'],
            context=item.get('context', ''),
            entities=json.dumps(item['entities']) if isinstance(item['entities'], list) else item['entities']
        ).with_inputs('text', 'context'))

    return examples


def create_relation_examples(data: List[Dict]) -> List[dspy.Example]:
    """
    Create DSPy examples for relation extraction training.

    Args:
        data: List of {text, entities, relations} dicts

    Returns:
        List of dspy.Example objects
    """
    examples = []
    for item in data:
        examples.append(dspy.Example(
            text=item['text'],
            entities=json.dumps(item['entities']) if isinstance(item['entities'], list) else item['entities'],
            relations=json.dumps(item['relations']) if isinstance(item['relations'], list) else item['relations']
        ).with_inputs('text', 'entities'))

    return examples


def create_kg_examples(data: List[Dict]) -> List[dspy.Example]:
    """
    Create DSPy examples for full KG extraction training.

    Args:
        data: List of {text, entities, relations} dicts

    Returns:
        List of dspy.Example objects
    """
    examples = []
    for item in data:
        examples.append(dspy.Example(
            text=item['text'],
            context=item.get('context', ''),
            entities=json.dumps(item['entities']) if isinstance(item['entities'], list) else item['entities'],
            relations=json.dumps(item['relations']) if isinstance(item['relations'], list) else item['relations']
        ).with_inputs('text', 'context'))

    return examples


# ═══════════════════════════════════════════════════════════════════════════════
# FACTORY FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════

def create_optimizer(
    optimizer_type: str = "miprov2",
    **kwargs
) -> PromptOptimizer:
    """
    Create prompt optimizer with specified type.

    Args:
        optimizer_type: 'miprov2', 'bootstrap', 'bootstrap_random'
        **kwargs: Additional config options

    Returns:
        Configured PromptOptimizer
    """
    config = OptimizationConfig(optimizer=optimizer_type, **kwargs)
    return PromptOptimizer(config)


def quick_optimize(
    module: dspy.Module,
    trainset: List[dspy.Example],
    metric: Optional[Callable] = None
) -> dspy.Module:
    """
    Quick optimization with minimal configuration.

    Args:
        module: Module to optimize
        trainset: Training examples
        metric: Evaluation metric

    Returns:
        Optimized module
    """
    config = OptimizationConfig(
        optimizer='bootstrap',
        num_candidates=5,
        max_bootstrapped_demos=2
    )
    optimizer = PromptOptimizer(config)
    return optimizer.optimize_module(module, trainset, metric=metric)
