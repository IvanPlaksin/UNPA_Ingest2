"""
Training utilities for GNN models
"""
import torch
import torch.nn.functional as F
from torch.optim import Adam
from torch_geometric.data import Data
from torch_geometric.utils import negative_sampling
from sklearn.metrics import roc_auc_score, average_precision_score
from typing import Dict, Optional, Tuple, List
import time
from pathlib import Path

from ..config import CONFIG


class LinkPredictionTrainer:
    """
    Trainer class for link prediction models
    Handles training loop, evaluation, and checkpointing
    """

    def __init__(
        self,
        model: torch.nn.Module,
        device: str = 'cuda' if torch.cuda.is_available() else 'cpu',
        learning_rate: float = 0.001,
        weight_decay: float = 0.0
    ):
        self.model = model.to(device)
        self.device = device
        self.optimizer = Adam(
            model.parameters(),
            lr=learning_rate,
            weight_decay=weight_decay
        )

        self.train_losses: List[float] = []
        self.val_metrics: List[Dict[str, float]] = []
        self.best_val_auc = 0.0
        self.best_model_state = None

    def train_epoch(
        self,
        data: Data,
        neg_sampling_ratio: float = 1.0
    ) -> float:
        """
        Train for one epoch

        Args:
            data: Training data with edge_index
            neg_sampling_ratio: Ratio of negative samples to positive

        Returns:
            Training loss
        """
        self.model.train()
        self.optimizer.zero_grad()

        # Move data to device
        x = data.x.to(self.device)
        edge_index = data.edge_index.to(self.device)

        # Encode nodes
        z = self.model.encode(x, edge_index)

        # Positive edges (existing edges)
        pos_edge_index = edge_index

        # Sample negative edges
        num_neg = int(pos_edge_index.shape[1] * neg_sampling_ratio)
        neg_edge_index = negative_sampling(
            edge_index=edge_index,
            num_nodes=data.num_nodes,
            num_neg_samples=num_neg,
            method='sparse'
        )

        # Predictions
        pos_pred = self.model.decode(z, pos_edge_index)
        neg_pred = self.model.decode(z, neg_edge_index)

        # Binary cross-entropy loss
        pos_loss = F.binary_cross_entropy_with_logits(
            pos_pred,
            torch.ones_like(pos_pred)
        )
        neg_loss = F.binary_cross_entropy_with_logits(
            neg_pred,
            torch.zeros_like(neg_pred)
        )

        loss = pos_loss + neg_loss

        # Backward pass
        loss.backward()
        self.optimizer.step()

        return loss.item()

    @torch.no_grad()
    def evaluate(self, data: Data) -> Dict[str, float]:
        """
        Evaluate model on validation/test data

        Args:
            data: Data with edge_label_index and edge_label

        Returns:
            Dictionary with AUC and AP metrics
        """
        self.model.eval()

        x = data.x.to(self.device)
        edge_index = data.edge_index.to(self.device)
        edge_label_index = data.edge_label_index.to(self.device)
        edge_label = data.edge_label.to(self.device)

        # Encode and predict
        z = self.model.encode(x, edge_index)
        pred = torch.sigmoid(self.model.decode(z, edge_label_index))

        # Move to CPU for sklearn
        pred_np = pred.cpu().numpy()
        label_np = edge_label.cpu().numpy()

        # Compute metrics
        auc = roc_auc_score(label_np, pred_np)
        ap = average_precision_score(label_np, pred_np)

        return {
            'auc': auc,
            'ap': ap
        }

    def train(
        self,
        train_data: Data,
        val_data: Data,
        epochs: int = 100,
        patience: int = 20,
        neg_sampling_ratio: float = 1.0,
        log_interval: int = 10,
        checkpoint_dir: Optional[str] = None
    ) -> Dict[str, List]:
        """
        Full training loop with early stopping

        Args:
            train_data: Training data
            val_data: Validation data
            epochs: Maximum number of epochs
            patience: Early stopping patience
            neg_sampling_ratio: Negative sampling ratio
            log_interval: How often to log progress
            checkpoint_dir: Directory to save checkpoints

        Returns:
            Training history
        """
        if checkpoint_dir:
            Path(checkpoint_dir).mkdir(parents=True, exist_ok=True)

        no_improve = 0
        start_time = time.time()

        print(f"Training on {self.device}")
        print(f"Train edges: {train_data.edge_index.shape[1]}")
        print(f"Val edges: {val_data.edge_label_index.shape[1]}")
        print("-" * 50)

        for epoch in range(1, epochs + 1):
            # Train
            loss = self.train_epoch(train_data, neg_sampling_ratio)
            self.train_losses.append(loss)

            # Evaluate
            val_metrics = self.evaluate(val_data)
            self.val_metrics.append(val_metrics)

            # Check for improvement
            if val_metrics['auc'] > self.best_val_auc:
                self.best_val_auc = val_metrics['auc']
                self.best_model_state = {
                    k: v.cpu().clone() for k, v in self.model.state_dict().items()
                }
                no_improve = 0

                if checkpoint_dir:
                    self.save_checkpoint(
                        f"{checkpoint_dir}/best_model.pt",
                        epoch,
                        val_metrics
                    )
            else:
                no_improve += 1

            # Log progress
            if epoch % log_interval == 0 or epoch == 1:
                elapsed = time.time() - start_time
                print(
                    f"Epoch {epoch:3d} | "
                    f"Loss: {loss:.4f} | "
                    f"Val AUC: {val_metrics['auc']:.4f} | "
                    f"Val AP: {val_metrics['ap']:.4f} | "
                    f"Time: {elapsed:.1f}s"
                )

            # Early stopping
            if no_improve >= patience:
                print(f"\nEarly stopping at epoch {epoch}")
                break

        # Restore best model
        if self.best_model_state:
            self.model.load_state_dict(self.best_model_state)
            print(f"\nRestored best model with Val AUC: {self.best_val_auc:.4f}")

        return {
            'train_losses': self.train_losses,
            'val_metrics': self.val_metrics,
            'best_val_auc': self.best_val_auc
        }

    def save_checkpoint(
        self,
        path: str,
        epoch: int,
        metrics: Dict[str, float]
    ):
        """Save model checkpoint"""
        torch.save({
            'epoch': epoch,
            'model_state_dict': self.model.state_dict(),
            'optimizer_state_dict': self.optimizer.state_dict(),
            'metrics': metrics,
            'config': {
                'encoder_type': self.model.encoder_type,
                'predictor_type': self.model.predictor_type
            }
        }, path)

    def load_checkpoint(self, path: str):
        """Load model checkpoint"""
        checkpoint = torch.load(path, map_location=self.device)
        self.model.load_state_dict(checkpoint['model_state_dict'])
        self.optimizer.load_state_dict(checkpoint['optimizer_state_dict'])
        return checkpoint['metrics']


class NodeClassificationTrainer:
    """
    Trainer for node classification models
    """

    def __init__(
        self,
        model: torch.nn.Module,
        device: str = 'cuda' if torch.cuda.is_available() else 'cpu',
        learning_rate: float = 0.01,
        weight_decay: float = 5e-4
    ):
        self.model = model.to(device)
        self.device = device
        self.optimizer = Adam(
            model.parameters(),
            lr=learning_rate,
            weight_decay=weight_decay
        )

    def train_epoch(self, data: Data) -> float:
        """Train for one epoch"""
        self.model.train()
        self.optimizer.zero_grad()

        x = data.x.to(self.device)
        edge_index = data.edge_index.to(self.device)
        y = data.y.to(self.device)
        train_mask = data.train_mask.to(self.device)

        out = self.model(x, edge_index)
        loss = F.cross_entropy(out[train_mask], y[train_mask])

        loss.backward()
        self.optimizer.step()

        return loss.item()

    @torch.no_grad()
    def evaluate(self, data: Data, mask_name: str = 'val_mask') -> Dict[str, float]:
        """Evaluate on validation or test set"""
        self.model.eval()

        x = data.x.to(self.device)
        edge_index = data.edge_index.to(self.device)
        y = data.y.to(self.device)
        mask = getattr(data, mask_name).to(self.device)

        out = self.model(x, edge_index)
        pred = out.argmax(dim=1)

        correct = (pred[mask] == y[mask]).sum().item()
        total = mask.sum().item()

        return {
            'accuracy': correct / total if total > 0 else 0,
            'correct': correct,
            'total': total
        }

    def train(
        self,
        data: Data,
        epochs: int = 200,
        patience: int = 30,
        log_interval: int = 20
    ) -> Dict:
        """Full training loop"""

        best_val_acc = 0
        no_improve = 0
        best_state = None

        for epoch in range(1, epochs + 1):
            loss = self.train_epoch(data)

            if epoch % log_interval == 0:
                train_metrics = self.evaluate(data, 'train_mask')
                val_metrics = self.evaluate(data, 'val_mask')

                print(
                    f"Epoch {epoch:3d} | "
                    f"Loss: {loss:.4f} | "
                    f"Train Acc: {train_metrics['accuracy']:.4f} | "
                    f"Val Acc: {val_metrics['accuracy']:.4f}"
                )

                if val_metrics['accuracy'] > best_val_acc:
                    best_val_acc = val_metrics['accuracy']
                    best_state = {
                        k: v.cpu().clone()
                        for k, v in self.model.state_dict().items()
                    }
                    no_improve = 0
                else:
                    no_improve += 1

                if no_improve >= patience // log_interval:
                    print(f"Early stopping at epoch {epoch}")
                    break

        if best_state:
            self.model.load_state_dict(best_state)

        test_metrics = self.evaluate(data, 'test_mask')
        print(f"\nFinal Test Accuracy: {test_metrics['accuracy']:.4f}")

        return {
            'best_val_acc': best_val_acc,
            'test_acc': test_metrics['accuracy']
        }
