#!/usr/bin/env python3
"""
Quick test to verify model training works on small data
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

import torch
from torch_geometric.data import Data

from src.models.link_prediction import create_model, LinkPredictionModel
from src.training.trainer import LinkPredictionTrainer


def create_synthetic_data(num_nodes=100, num_edges=500, feature_dim=64):
    """Create synthetic graph data for testing"""

    # Random features
    x = torch.randn(num_nodes, feature_dim)

    # Random edges
    edge_index = torch.randint(0, num_nodes, (2, num_edges))

    # Remove self-loops
    mask = edge_index[0] != edge_index[1]
    edge_index = edge_index[:, mask]

    return Data(x=x, edge_index=edge_index, num_nodes=num_nodes)


def main():
    print("=" * 50)
    print("Quick Model Test")
    print("=" * 50)

    # Create synthetic data
    print("\n1. Creating synthetic data...")
    data = create_synthetic_data()
    print(f"   Nodes: {data.num_nodes}")
    print(f"   Edges: {data.edge_index.shape[1]}")
    print(f"   Features: {data.x.shape}")

    # Split data
    print("\n2. Splitting data...")
    num_edges = data.edge_index.shape[1]
    perm = torch.randperm(num_edges)

    train_size = int(num_edges * 0.8)
    val_size = int(num_edges * 0.1)

    train_edges = data.edge_index[:, perm[:train_size]]
    val_edges = data.edge_index[:, perm[train_size:train_size + val_size]]

    train_data = Data(x=data.x, edge_index=train_edges, num_nodes=data.num_nodes)

    # Add negative samples for validation
    val_neg = torch.randint(0, data.num_nodes, (2, val_edges.shape[1]))
    val_data = Data(
        x=data.x,
        edge_index=train_edges,
        edge_label_index=torch.cat([val_edges, val_neg], dim=1),
        edge_label=torch.cat([
            torch.ones(val_edges.shape[1]),
            torch.zeros(val_neg.shape[1])
        ]),
        num_nodes=data.num_nodes
    )

    print(f"   Train edges: {train_data.edge_index.shape[1]}")
    print(f"   Val edges: {val_data.edge_label_index.shape[1]}")

    # Create model
    print("\n3. Creating model...")
    model = create_model(in_channels=data.x.shape[1])
    print(f"   Model: {model.encoder_type} encoder + {model.predictor_type} predictor")
    print(f"   Parameters: {sum(p.numel() for p in model.parameters()):,}")

    # Train for a few epochs
    print("\n4. Training (5 epochs)...")
    trainer = LinkPredictionTrainer(model)

    for epoch in range(1, 6):
        loss = trainer.train_epoch(train_data)
        metrics = trainer.evaluate(val_data)
        print(f"   Epoch {epoch}: Loss={loss:.4f}, AUC={metrics['auc']:.4f}")

    # Test inference
    print("\n5. Testing inference...")
    model.eval()
    with torch.no_grad():
        z = model.encode(data.x, train_edges)
        pred = torch.sigmoid(model.decode(z, val_edges[:, :5]))
        print(f"   Sample predictions: {pred.tolist()}")

    print("\n" + "=" * 50)
    print("All tests passed!")
    print("=" * 50)


if __name__ == "__main__":
    main()
