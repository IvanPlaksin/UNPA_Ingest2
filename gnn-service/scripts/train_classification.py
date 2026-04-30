#!/usr/bin/env python3
"""
Train node classification model

Usage:
    python scripts/train_classification.py [--epochs 200] [--model-type sage]
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

import argparse
import torch
from datetime import datetime

from src.data.dataset import ProjectAdvisorDataset
from src.models.node_classification import create_classifier
from src.training.trainer import NodeClassificationTrainer
from src.config import CONFIG


def parse_args():
    parser = argparse.ArgumentParser(description='Train node classification model')

    parser.add_argument('--epochs', type=int, default=200)
    parser.add_argument('--patience', type=int, default=30)
    parser.add_argument('--lr', type=float, default=0.01)
    parser.add_argument('--hidden-dim', type=int, default=128)
    parser.add_argument('--num-layers', type=int, default=2)
    parser.add_argument('--model-type', choices=['sage', 'gat', 'hybrid'], default='sage')
    parser.add_argument('--checkpoint-dir', type=str, default='./checkpoints')
    parser.add_argument('--label-field', type=str, default='quantum_type')
    parser.add_argument('--no-qdrant', action='store_true')

    return parser.parse_args()


def main():
    args = parse_args()

    print("=" * 60)
    print("Node Classification Training")
    print("=" * 60)
    print(f"Model type: {args.model_type}")
    print(f"Device: {'cuda' if torch.cuda.is_available() else 'cpu'}")
    print()

    # Load dataset
    print("Loading dataset...")
    dataset = ProjectAdvisorDataset(use_qdrant_features=not args.no_qdrant)
    dataset.load()

    # Create classification split
    print("\nCreating classification split...")
    data = dataset.create_classification_split(label_field=args.label_field)

    # Filter out unlabeled nodes for training
    num_labeled = data.train_mask.sum() + data.val_mask.sum() + data.test_mask.sum()
    print(f"  Total nodes: {data.num_nodes}")
    print(f"  Labeled nodes: {num_labeled}")
    print(f"  Classes: {data.num_classes} - {data.class_names}")

    if num_labeled == 0:
        print("\n  No labeled nodes found!")
        print("Make sure nodes have the label field set in Memgraph.")
        print(f"Looking for field: {args.label_field}")
        return

    # Create model
    print("\nCreating model...")
    model = create_classifier(
        in_channels=data.x.shape[1],
        num_classes=data.num_classes,
        config={
            'hidden_dim': args.hidden_dim,
            'num_layers': args.num_layers,
            'dropout': 0.5,
            'model_type': args.model_type
        }
    )

    print(f"  Parameters: {sum(p.numel() for p in model.parameters()):,}")

    # Train
    trainer = NodeClassificationTrainer(model, learning_rate=args.lr)

    print("\n" + "=" * 60)
    print("Training...")
    print("=" * 60)

    results = trainer.train(
        data=data,
        epochs=args.epochs,
        patience=args.patience
    )

    # Save model
    Path(args.checkpoint_dir).mkdir(parents=True, exist_ok=True)
    save_path = f"{args.checkpoint_dir}/classification_model.pt"

    torch.save({
        'model_state_dict': model.state_dict(),
        'num_classes': data.num_classes,
        'class_names': data.class_names,
        'model_type': args.model_type,
        'metrics': results
    }, save_path)

    print(f"\nModel saved to: {save_path}")
    print(f"Test Accuracy: {results['test_acc']:.4f}")


if __name__ == "__main__":
    main()
