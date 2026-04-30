#!/usr/bin/env python3
"""
Train link prediction model

Usage:
    python scripts/train_link_prediction.py [--epochs 100] [--checkpoint-dir ./checkpoints]
"""
import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent))

import argparse
import torch
from datetime import datetime

from src.data.dataset import ProjectAdvisorDataset
from src.models.link_prediction import create_model
from src.training.trainer import LinkPredictionTrainer
from src.config import CONFIG


def parse_args():
    parser = argparse.ArgumentParser(description='Train link prediction model')

    parser.add_argument(
        '--epochs', type=int, default=100,
        help='Number of training epochs'
    )
    parser.add_argument(
        '--patience', type=int, default=20,
        help='Early stopping patience'
    )
    parser.add_argument(
        '--lr', type=float, default=0.001,
        help='Learning rate'
    )
    parser.add_argument(
        '--hidden-dim', type=int, default=64,
        help='Hidden dimension size'
    )
    parser.add_argument(
        '--num-layers', type=int, default=3,
        help='Number of GNN layers'
    )
    parser.add_argument(
        '--checkpoint-dir', type=str, default='./checkpoints',
        help='Directory to save checkpoints'
    )
    parser.add_argument(
        '--val-ratio', type=float, default=0.1,
        help='Validation set ratio'
    )
    parser.add_argument(
        '--test-ratio', type=float, default=0.1,
        help='Test set ratio'
    )
    parser.add_argument(
        '--no-qdrant', action='store_true',
        help='Skip Qdrant features, use one-hot encoding'
    )

    return parser.parse_args()


def main():
    args = parse_args()

    print("=" * 60)
    print("Link Prediction Training")
    print("=" * 60)
    print(f"Start time: {datetime.now().isoformat()}")
    print(f"Device: {'cuda' if torch.cuda.is_available() else 'cpu'}")
    print()

    # Load dataset
    print("Loading dataset...")
    dataset = ProjectAdvisorDataset(
        use_qdrant_features=not args.no_qdrant
    )
    dataset.load()

    # Create train/val/test split
    print("\nCreating data splits...")
    train_data, val_data, test_data = dataset.create_link_prediction_split(
        val_ratio=args.val_ratio,
        test_ratio=args.test_ratio
    )

    print(f"  Train edges: {train_data.edge_index.shape[1]}")
    print(f"  Val edges: {val_data.edge_label_index.shape[1]} (pos+neg)")
    print(f"  Test edges: {test_data.edge_label_index.shape[1]} (pos+neg)")

    # Create model
    print("\nCreating model...")
    in_channels = train_data.x.shape[1]

    model = create_model(
        in_channels=in_channels,
        config={
            'hidden_dim': args.hidden_dim,
            'num_layers': args.num_layers,
            'dropout': 0.5
        }
    )

    print(f"  Input features: {in_channels}")
    print(f"  Hidden dim: {args.hidden_dim}")
    print(f"  Num layers: {args.num_layers}")
    print(f"  Parameters: {sum(p.numel() for p in model.parameters()):,}")

    # Create trainer
    trainer = LinkPredictionTrainer(
        model=model,
        learning_rate=args.lr
    )

    # Train
    print("\n" + "=" * 60)
    print("Starting training...")
    print("=" * 60)

    history = trainer.train(
        train_data=train_data,
        val_data=val_data,
        epochs=args.epochs,
        patience=args.patience,
        checkpoint_dir=args.checkpoint_dir
    )

    # Evaluate on test set
    print("\n" + "=" * 60)
    print("Evaluating on test set...")
    print("=" * 60)

    test_metrics = trainer.evaluate(test_data)
    print(f"  Test AUC: {test_metrics['auc']:.4f}")
    print(f"  Test AP: {test_metrics['ap']:.4f}")

    # Save final model
    final_path = f"{args.checkpoint_dir}/final_model.pt"
    trainer.save_checkpoint(final_path, args.epochs, test_metrics)
    print(f"\nFinal model saved to: {final_path}")

    print("\n" + "=" * 60)
    print("Training complete!")
    print("=" * 60)
    print(f"Best Val AUC: {history['best_val_auc']:.4f}")
    print(f"Test AUC: {test_metrics['auc']:.4f}")
    print(f"Test AP: {test_metrics['ap']:.4f}")


if __name__ == "__main__":
    main()
