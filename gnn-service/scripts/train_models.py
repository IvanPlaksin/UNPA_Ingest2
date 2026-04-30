#!/usr/bin/env python3
"""
GNN Model Training Script — Phase C1.3

Orchestrates:
  1. Load graph data from Memgraph
  2. Preprocess (edge/node filtering, class aggregation)
  3. Extract features (structural + property + TF-IDF/SVD)
  4. Train Link Prediction model
  5. Train Node Classification model
  6. Register models in registry

Usage:
    python scripts/train_models.py --model all
    python scripts/train_models.py --model link --epochs 50
    python scripts/train_models.py --model classification --hidden-dim 64
"""

import argparse
import asyncio
import json
import sys
import time
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import numpy as np

# Add parent dirs to path
ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / 'src'))

import torch
from torch_geometric.data import Data

from src.data.memgraph_loader import MemgraphLoader
from src.models.link_prediction import LinkPredictionModel
from src.models.node_classification import GraphSAGEClassifier
from src.training.trainer import LinkPredictionTrainer, NodeClassificationTrainer
from src.models.registry import ModelRegistry
from data.feature_config import FEATURE_CONFIG, TRAINING_CONFIG
from data.graph_preprocessor import GraphPreprocessor
from data.feature_engineering import FeatureEngineer

CHECKPOINT_DIR = ROOT / 'checkpoints'
METRICS_DIR = ROOT / 'metrics'


def load_and_preprocess(task: str = 'link_prediction'):
    """
    Load graph from Memgraph, apply preprocessing, extract features.
    Returns a PyG Data object.
    """
    print('Loading graph from Memgraph...')
    loader = MemgraphLoader()
    loader.connect()

    try:
        # Get raw data
        node_counts = loader.get_node_counts()
        edge_counts = loader.get_edge_counts()
        print(f'  Raw graph: {sum(node_counts.values())} nodes, {sum(edge_counts.values())} edges')

        # Export nodes and edges
        data_pyg, nodes, id_mapping = loader.export_graph()

        # Get raw node/edge lists for preprocessing
        excluded_edges = FEATURE_CONFIG['edge_filter']['exclude_types']
        print(f'  Filtering edges: excluding {excluded_edges}')

        # Build edges list from Memgraph
        with loader.driver.session() as session:
            excluded = FEATURE_CONFIG['edge_filter']['exclude_types']
            # Get filtered edges
            result = session.run("""
                MATCH (a)-[r]->(b)
                WHERE NOT type(r) IN $excluded
                  AND id(a) IN $nodeIds
                  AND id(b) IN $nodeIds
                RETURN id(a) AS source, id(b) AS target, type(r) AS type
            """, excluded=excluded, nodeIds=list(id_mapping.keys()))
            edges_raw = [dict(r) for r in result]

        print(f'  Filtered edges: {len(edges_raw)}')

        # Build edge_index from filtered edges
        edge_list = []
        for e in edges_raw:
            src_idx = id_mapping.get(e['source'])
            tgt_idx = id_mapping.get(e['target'])
            if src_idx is not None and tgt_idx is not None:
                edge_list.append([src_idx, tgt_idx])

        if edge_list:
            edge_index = torch.tensor(edge_list, dtype=torch.long).t().contiguous()
        else:
            edge_index = torch.empty((2, 0), dtype=torch.long)

        print(f'  Edge index shape: {edge_index.shape}')

        # --- Feature extraction ---
        print('Extracting features...')
        preprocessor = GraphPreprocessor(FEATURE_CONFIG)
        engineer = FeatureEngineer(FEATURE_CONFIG)

        # Build node dicts for feature engineering
        node_dicts = []
        for node in nodes:
            nd = {
                'id': node['internal_id'],
                'labels': [node.get('node_type', 'Unknown')],
                'name': node.get('title', ''),
                'description': node.get('content', ''),
                'title': node.get('title', ''),
                'type': node.get('quantum_type', ''),
                'entityType': node.get('node_type', ''),
            }
            node_dicts.append(nd)

        # Build edge dicts
        edge_dicts = [{'source': e['source'], 'target': e['target'], 'type': e['type']}
                      for e in edges_raw]

        # Extract features
        features, feat_meta = engineer.extract_all_features(node_dicts, edge_dicts)
        print(f'  Feature matrix: {features.shape} (dim breakdown: {feat_meta["dim_breakdown"]})')

        x = torch.tensor(features, dtype=torch.float32)

        # Build final Data object
        final_data = Data(
            x=x,
            edge_index=edge_index,
            num_nodes=len(nodes),
        )

        # For classification: add labels
        if task == 'node_classification':
            labeled_nodes = loader.get_labeled_nodes('quantum_type')
            class_mapping = preprocessor.build_class_mapping(
                {label: len(ids) for label, ids in labeled_nodes.items()}
            )

            # Map external IDs to internal indices
            ext_to_idx = {}
            for i, node in enumerate(nodes):
                eid = node.get('external_id')
                if eid:
                    ext_to_idx[eid] = i

            # Build aggregated label set
            all_agg_labels = set()
            for label in labeled_nodes.keys():
                all_agg_labels.add(class_mapping.get(label, 'OTHER'))
            label_to_idx = {l: i for i, l in enumerate(sorted(all_agg_labels))}

            labels = torch.full((len(nodes),), -1, dtype=torch.long)
            labeled_indices = []
            for label, node_ids in labeled_nodes.items():
                agg = class_mapping.get(label, 'OTHER')
                idx = label_to_idx[agg]
                for nid in node_ids:
                    node_idx = ext_to_idx.get(nid)
                    if node_idx is not None:
                        labels[node_idx] = idx
                        labeled_indices.append(node_idx)

            # Create masks
            labeled_indices = torch.tensor(labeled_indices)
            n_labeled = len(labeled_indices)
            perm = torch.randperm(n_labeled)

            train_size = int(n_labeled * 0.6)
            val_size = int(n_labeled * 0.2)

            train_mask = torch.zeros(len(nodes), dtype=torch.bool)
            val_mask = torch.zeros(len(nodes), dtype=torch.bool)
            test_mask = torch.zeros(len(nodes), dtype=torch.bool)

            train_mask[labeled_indices[perm[:train_size]]] = True
            val_mask[labeled_indices[perm[train_size:train_size + val_size]]] = True
            test_mask[labeled_indices[perm[train_size + val_size:]]] = True

            final_data.y = labels
            final_data.train_mask = train_mask
            final_data.val_mask = val_mask
            final_data.test_mask = test_mask
            final_data.num_classes = len(label_to_idx)
            final_data.class_names = sorted(label_to_idx.keys())

            print(f'  Classification: {n_labeled} labeled nodes, '
                  f'{final_data.num_classes} classes: {final_data.class_names}')
            print(f'  Split: {train_mask.sum()} train, {val_mask.sum()} val, {test_mask.sum()} test')

        return final_data

    finally:
        loader.close()


def train_link_prediction(data: Data, config: Dict) -> Dict:
    """Train link prediction model."""
    from src.data.dataset import ProjectAdvisorDataset

    print(f'\nData: {data.num_nodes} nodes, {data.edge_index.size(1)} edges, '
          f'{data.x.size(1)} features')

    # Create dataset wrapper for splitting
    dataset = ProjectAdvisorDataset(use_qdrant_features=False)
    dataset.data = data
    dataset.nodes = [{}] * data.num_nodes  # placeholder

    train_data, val_data, test_data = dataset.create_link_prediction_split(
        val_ratio=config.get('val_ratio', 0.15),
        test_ratio=config.get('test_ratio', 0.15),
    )

    # Create model
    from src.models.link_prediction import create_model
    model = create_model(data.x.size(1), config)

    # Create trainer
    trainer = LinkPredictionTrainer(
        model=model,
        device='cuda' if torch.cuda.is_available() else 'cpu',
        learning_rate=config.get('lr', 0.001),
    )

    # Train
    history = trainer.train(
        train_data=train_data,
        val_data=val_data,
        epochs=config.get('epochs', 100),
        patience=config.get('patience', 15),
        checkpoint_dir=str(CHECKPOINT_DIR),
    )

    # Evaluate on test
    test_metrics = trainer.evaluate(test_data)

    return {
        'test': test_metrics,
        'best_val_auc': history['best_val_auc'],
        'epochs_trained': len(history['train_losses']),
    }


def train_node_classification(data: Data, config: Dict) -> Dict:
    """Train node classification model."""
    from src.models.node_classification import GraphSAGEClassifier

    print(f'\nData: {data.num_nodes} nodes, {data.edge_index.size(1)} edges, '
          f'{data.x.size(1)} features, {data.num_classes} classes')

    # Create model
    model = GraphSAGEClassifier(
        in_channels=data.x.size(1),
        hidden_channels=config.get('hidden_dim', 128),
        out_channels=data.num_classes,
        num_layers=config.get('num_layers', 3),
        dropout=config.get('dropout', 0.4),
    )

    # Create trainer
    trainer = NodeClassificationTrainer(
        model=model,
        device='cuda' if torch.cuda.is_available() else 'cpu',
        learning_rate=config.get('lr', 0.001),
        weight_decay=config.get('weight_decay', 5e-4),
    )

    # Train
    result = trainer.train(
        data=data,
        epochs=config.get('epochs', 150),
        patience=config.get('patience', 20),
    )

    return {
        'test': {'accuracy': result['test_acc']},
        'best_val_accuracy': result['best_val_acc'],
    }


def main():
    parser = argparse.ArgumentParser(description='Train GNN models')
    parser.add_argument('--model', choices=['link', 'classification', 'all'],
                        default='all')
    parser.add_argument('--epochs', type=int, default=None)
    parser.add_argument('--hidden-dim', type=int, default=None)
    parser.add_argument('--lr', type=float, default=None)
    args = parser.parse_args()

    CHECKPOINT_DIR.mkdir(parents=True, exist_ok=True)
    METRICS_DIR.mkdir(parents=True, exist_ok=True)

    registry = ModelRegistry(str(CHECKPOINT_DIR))
    version = datetime.now().strftime('%Y%m%d_%H%M%S')
    results = {}

    # === LINK PREDICTION ===
    if args.model in ('link', 'all'):
        print('\n' + '=' * 60)
        print('TRAINING: Link Prediction')
        print('=' * 60)

        data = load_and_preprocess('link_prediction')

        config = TRAINING_CONFIG['link_prediction'].copy()
        if args.epochs:
            config['epochs'] = args.epochs
        if args.hidden_dim:
            config['hidden_dim'] = args.hidden_dim
        if args.lr:
            config['lr'] = args.lr

        metrics = train_link_prediction(data, config)
        results['link_prediction'] = metrics

        registry.register_model(
            model_type='link_prediction',
            version=version,
            checkpoint_path=str(CHECKPOINT_DIR / 'best_model.pt'),
            metrics=metrics,
            config=config,
        )
        registry.activate_model('link_prediction', version)

        print(f'\n  Test AUC: {metrics["test"]["auc"]:.4f}')
        print(f'  Test AP:  {metrics["test"]["ap"]:.4f}')

    # === NODE CLASSIFICATION ===
    if args.model in ('classification', 'all'):
        print('\n' + '=' * 60)
        print('TRAINING: Node Classification')
        print('=' * 60)

        data = load_and_preprocess('node_classification')

        config = TRAINING_CONFIG['node_classification'].copy()
        if args.epochs:
            config['epochs'] = args.epochs
        if args.hidden_dim:
            config['hidden_dim'] = args.hidden_dim
        if args.lr:
            config['lr'] = args.lr

        metrics = train_node_classification(data, config)
        results['node_classification'] = metrics

        registry.register_model(
            model_type='node_classification',
            version=version,
            checkpoint_path=str(CHECKPOINT_DIR / 'best_model.pt'),
            metrics=metrics,
            config=config,
        )
        registry.activate_model('node_classification', version)

        print(f'\n  Test Accuracy: {metrics["test"]["accuracy"]:.4f}')

    # === SAVE REPORT ===
    report_path = METRICS_DIR / f'training_report_{version}.json'
    with open(report_path, 'w') as f:
        json.dump(results, f, indent=2, default=str)

    print(f'\nTraining report: {report_path}')
    print(f'Checkpoints: {CHECKPOINT_DIR}')
    print(f'Registry: {CHECKPOINT_DIR / "registry.json"}')


if __name__ == '__main__':
    main()
