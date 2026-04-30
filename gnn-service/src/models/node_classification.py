"""
Node Classification models for UN ProjectAdvisor
Classifies Knowledge Quanta by type based on graph structure and features
"""
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch_geometric.nn import SAGEConv, GATConv, GCNConv, global_mean_pool
from typing import Optional, List, Dict

from ..config import CONFIG


class GraphSAGEClassifier(nn.Module):
    """
    GraphSAGE-based node classifier
    Good for inductive learning - can classify new nodes
    """

    def __init__(
        self,
        in_channels: int,
        hidden_channels: int,
        out_channels: int,
        num_layers: int = 2,
        dropout: float = 0.5
    ):
        super().__init__()

        self.convs = nn.ModuleList()
        self.bns = nn.ModuleList()
        self.dropout = dropout
        self.num_layers = num_layers

        # Input layer
        self.convs.append(SAGEConv(in_channels, hidden_channels))
        self.bns.append(nn.BatchNorm1d(hidden_channels))

        # Hidden layers
        for _ in range(num_layers - 2):
            self.convs.append(SAGEConv(hidden_channels, hidden_channels))
            self.bns.append(nn.BatchNorm1d(hidden_channels))

        # Output layer
        self.convs.append(SAGEConv(hidden_channels, out_channels))

    def forward(
        self,
        x: torch.Tensor,
        edge_index: torch.Tensor
    ) -> torch.Tensor:
        """
        Forward pass

        Args:
            x: Node features [num_nodes, in_channels]
            edge_index: Graph connectivity [2, num_edges]

        Returns:
            Log probabilities [num_nodes, num_classes]
        """
        for i in range(self.num_layers - 1):
            x = self.convs[i](x, edge_index)
            x = self.bns[i](x)
            x = F.relu(x)
            x = F.dropout(x, p=self.dropout, training=self.training)

        x = self.convs[-1](x, edge_index)
        return F.log_softmax(x, dim=1)

    def get_embeddings(
        self,
        x: torch.Tensor,
        edge_index: torch.Tensor
    ) -> torch.Tensor:
        """Get node embeddings before final classification layer"""
        for i in range(self.num_layers - 1):
            x = self.convs[i](x, edge_index)
            x = self.bns[i](x)
            x = F.relu(x)
        return x


class GATClassifier(nn.Module):
    """
    Graph Attention Network classifier
    Uses attention mechanism to weight neighbor importance
    """

    def __init__(
        self,
        in_channels: int,
        hidden_channels: int,
        out_channels: int,
        num_layers: int = 2,
        heads: int = 8,
        dropout: float = 0.6
    ):
        super().__init__()

        self.dropout = dropout
        self.num_layers = num_layers

        self.convs = nn.ModuleList()
        self.bns = nn.ModuleList()

        # First layer with multi-head attention
        self.convs.append(GATConv(
            in_channels,
            hidden_channels,
            heads=heads,
            dropout=dropout
        ))
        self.bns.append(nn.BatchNorm1d(hidden_channels * heads))

        # Hidden layers
        for _ in range(num_layers - 2):
            self.convs.append(GATConv(
                hidden_channels * heads,
                hidden_channels,
                heads=heads,
                dropout=dropout
            ))
            self.bns.append(nn.BatchNorm1d(hidden_channels * heads))

        # Output layer - single head
        self.convs.append(GATConv(
            hidden_channels * heads,
            out_channels,
            heads=1,
            concat=False,
            dropout=dropout
        ))

    def forward(
        self,
        x: torch.Tensor,
        edge_index: torch.Tensor
    ) -> torch.Tensor:
        for i in range(self.num_layers - 1):
            x = self.convs[i](x, edge_index)
            x = self.bns[i](x)
            x = F.elu(x)
            x = F.dropout(x, p=self.dropout, training=self.training)

        x = self.convs[-1](x, edge_index)
        return F.log_softmax(x, dim=1)


class HybridClassifier(nn.Module):
    """
    Hybrid classifier combining GNN embeddings with node features
    Uses both structural and semantic information
    """

    def __init__(
        self,
        in_channels: int,
        hidden_channels: int,
        out_channels: int,
        num_gnn_layers: int = 2,
        dropout: float = 0.5
    ):
        super().__init__()

        self.dropout = dropout

        # GNN encoder
        self.gnn = GraphSAGEClassifier(
            in_channels=in_channels,
            hidden_channels=hidden_channels,
            out_channels=hidden_channels,  # Output embeddings, not classes
            num_layers=num_gnn_layers,
            dropout=dropout
        )

        # MLP classifier on concatenated features
        self.classifier = nn.Sequential(
            nn.Linear(hidden_channels + in_channels, hidden_channels),
            nn.BatchNorm1d(hidden_channels),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_channels, hidden_channels // 2),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_channels // 2, out_channels)
        )

    def forward(
        self,
        x: torch.Tensor,
        edge_index: torch.Tensor
    ) -> torch.Tensor:
        # Get GNN embeddings
        gnn_emb = self.gnn.get_embeddings(x, edge_index)

        # Concatenate with original features
        combined = torch.cat([gnn_emb, x], dim=1)

        # Classify
        out = self.classifier(combined)
        return F.log_softmax(out, dim=1)


class NodeClassificationModel(nn.Module):
    """
    Wrapper model for node classification with multiple architecture options
    """

    def __init__(
        self,
        in_channels: int,
        num_classes: int,
        hidden_channels: int = 128,
        num_layers: int = 2,
        dropout: float = 0.5,
        model_type: str = 'sage'
    ):
        super().__init__()

        self.model_type = model_type
        self.num_classes = num_classes

        if model_type == 'sage':
            self.model = GraphSAGEClassifier(
                in_channels, hidden_channels, num_classes, num_layers, dropout
            )
        elif model_type == 'gat':
            self.model = GATClassifier(
                in_channels, hidden_channels, num_classes, num_layers,
                heads=8, dropout=dropout
            )
        elif model_type == 'hybrid':
            self.model = HybridClassifier(
                in_channels, hidden_channels, num_classes, num_layers, dropout
            )
        else:
            raise ValueError(f"Unknown model type: {model_type}")

    def forward(
        self,
        x: torch.Tensor,
        edge_index: torch.Tensor
    ) -> torch.Tensor:
        return self.model(x, edge_index)

    def predict(
        self,
        x: torch.Tensor,
        edge_index: torch.Tensor
    ) -> torch.Tensor:
        """Get class predictions"""
        self.eval()
        with torch.no_grad():
            logits = self.forward(x, edge_index)
            return logits.argmax(dim=1)

    def predict_proba(
        self,
        x: torch.Tensor,
        edge_index: torch.Tensor
    ) -> torch.Tensor:
        """Get class probabilities"""
        self.eval()
        with torch.no_grad():
            logits = self.forward(x, edge_index)
            return torch.exp(logits)  # Convert log_softmax to probabilities


def create_classifier(
    in_channels: int,
    num_classes: int,
    config: Optional[dict] = None
) -> NodeClassificationModel:
    """
    Factory function to create node classification model

    Args:
        in_channels: Number of input features
        num_classes: Number of output classes
        config: Optional config override

    Returns:
        Initialized NodeClassificationModel
    """
    cfg = config or CONFIG['models'].get('node_classification', {})

    return NodeClassificationModel(
        in_channels=in_channels,
        num_classes=num_classes,
        hidden_channels=cfg.get('hidden_dim', 128),
        num_layers=cfg.get('num_layers', 2),
        dropout=cfg.get('dropout', 0.5),
        model_type=cfg.get('model_type', 'sage')
    )
