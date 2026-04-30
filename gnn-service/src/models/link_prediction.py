"""
Link Prediction models for UN ProjectAdvisor
Predicts missing relationships between entities in the knowledge graph
"""
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch_geometric.nn import GCNConv, SAGEConv, GATConv
from torch_geometric.utils import negative_sampling
from typing import Optional, Tuple

from ..config import CONFIG


class GCNEncoder(nn.Module):
    """
    Graph Convolutional Network encoder for node embeddings
    Used as backbone for link prediction
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

        # First layer
        self.convs.append(GCNConv(in_channels, hidden_channels))
        self.bns.append(nn.BatchNorm1d(hidden_channels))

        # Hidden layers
        for _ in range(num_layers - 2):
            self.convs.append(GCNConv(hidden_channels, hidden_channels))
            self.bns.append(nn.BatchNorm1d(hidden_channels))

        # Last layer
        self.convs.append(GCNConv(hidden_channels, out_channels))

    def forward(self, x: torch.Tensor, edge_index: torch.Tensor) -> torch.Tensor:
        for i, conv in enumerate(self.convs[:-1]):
            x = conv(x, edge_index)
            x = self.bns[i](x)
            x = F.relu(x)
            x = F.dropout(x, p=self.dropout, training=self.training)

        x = self.convs[-1](x, edge_index)
        return x


class SAGEEncoder(nn.Module):
    """
    GraphSAGE encoder - better for inductive learning
    Can handle unseen nodes at inference time
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
        self.dropout = dropout

        self.convs.append(SAGEConv(in_channels, hidden_channels))

        for _ in range(num_layers - 2):
            self.convs.append(SAGEConv(hidden_channels, hidden_channels))

        self.convs.append(SAGEConv(hidden_channels, out_channels))

    def forward(self, x: torch.Tensor, edge_index: torch.Tensor) -> torch.Tensor:
        for conv in self.convs[:-1]:
            x = conv(x, edge_index)
            x = F.relu(x)
            x = F.dropout(x, p=self.dropout, training=self.training)

        x = self.convs[-1](x, edge_index)
        return x


class LinkPredictor(nn.Module):
    """
    MLP-based link predictor
    Takes node embeddings and predicts link probability
    """

    def __init__(
        self,
        in_channels: int,
        hidden_channels: int,
        num_layers: int = 2,
        dropout: float = 0.5
    ):
        super().__init__()

        self.layers = nn.ModuleList()
        self.layers.append(nn.Linear(in_channels * 2, hidden_channels))

        for _ in range(num_layers - 2):
            self.layers.append(nn.Linear(hidden_channels, hidden_channels))

        self.layers.append(nn.Linear(hidden_channels, 1))
        self.dropout = dropout

    def forward(
        self,
        z_src: torch.Tensor,
        z_dst: torch.Tensor
    ) -> torch.Tensor:
        """
        Predict link probability between source and destination nodes

        Args:
            z_src: Source node embeddings [num_edges, embed_dim]
            z_dst: Destination node embeddings [num_edges, embed_dim]

        Returns:
            Link probabilities [num_edges]
        """
        # Concatenate source and destination embeddings
        h = torch.cat([z_src, z_dst], dim=-1)

        for layer in self.layers[:-1]:
            h = layer(h)
            h = F.relu(h)
            h = F.dropout(h, p=self.dropout, training=self.training)

        h = self.layers[-1](h)
        return h.squeeze(-1)


class DotProductPredictor(nn.Module):
    """
    Simple dot product link predictor
    Faster but less expressive than MLP
    """

    def forward(
        self,
        z_src: torch.Tensor,
        z_dst: torch.Tensor
    ) -> torch.Tensor:
        return (z_src * z_dst).sum(dim=-1)


class LinkPredictionModel(nn.Module):
    """
    Complete link prediction model combining encoder and predictor

    This is the main model class for training and inference
    """

    def __init__(
        self,
        in_channels: int,
        hidden_channels: int = 64,
        out_channels: int = 64,
        num_layers: int = 2,
        dropout: float = 0.5,
        encoder_type: str = 'sage',
        predictor_type: str = 'mlp'
    ):
        super().__init__()

        # Select encoder
        if encoder_type == 'gcn':
            self.encoder = GCNEncoder(
                in_channels, hidden_channels, out_channels, num_layers, dropout
            )
        elif encoder_type == 'sage':
            self.encoder = SAGEEncoder(
                in_channels, hidden_channels, out_channels, num_layers, dropout
            )
        else:
            raise ValueError(f"Unknown encoder type: {encoder_type}")

        # Select predictor
        if predictor_type == 'mlp':
            self.predictor = LinkPredictor(
                out_channels, hidden_channels, num_layers=2, dropout=dropout
            )
        elif predictor_type == 'dot':
            self.predictor = DotProductPredictor()
        else:
            raise ValueError(f"Unknown predictor type: {predictor_type}")

        self.encoder_type = encoder_type
        self.predictor_type = predictor_type

    def encode(self, x: torch.Tensor, edge_index: torch.Tensor) -> torch.Tensor:
        """Encode nodes to embeddings"""
        return self.encoder(x, edge_index)

    def decode(
        self,
        z: torch.Tensor,
        edge_index: torch.Tensor
    ) -> torch.Tensor:
        """Decode edges from node embeddings"""
        z_src = z[edge_index[0]]
        z_dst = z[edge_index[1]]
        return self.predictor(z_src, z_dst)

    def forward(
        self,
        x: torch.Tensor,
        edge_index: torch.Tensor,
        edge_label_index: torch.Tensor
    ) -> torch.Tensor:
        """
        Full forward pass: encode nodes and predict links

        Args:
            x: Node features [num_nodes, in_channels]
            edge_index: Graph structure [2, num_edges]
            edge_label_index: Edges to predict [2, num_pred_edges]

        Returns:
            Link predictions [num_pred_edges]
        """
        z = self.encode(x, edge_index)
        return self.decode(z, edge_label_index)

    def predict_new_links(
        self,
        x: torch.Tensor,
        edge_index: torch.Tensor,
        source_nodes: torch.Tensor,
        target_nodes: torch.Tensor,
        top_k: int = 100,
        min_confidence: float = 0.5
    ) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """
        Predict new links between source and target node sets

        Args:
            x: Node features
            edge_index: Current graph structure
            source_nodes: Indices of potential source nodes
            target_nodes: Indices of potential target nodes
            top_k: Return top-k predictions
            min_confidence: Minimum confidence threshold

        Returns:
            sources, targets, scores for predicted links
        """
        self.eval()
        with torch.no_grad():
            z = self.encode(x, edge_index)

            # Create all possible edges between source and target sets
            all_sources = []
            all_targets = []

            for src in source_nodes:
                for tgt in target_nodes:
                    all_sources.append(src.item())
                    all_targets.append(tgt.item())

            if not all_sources:
                return torch.tensor([]), torch.tensor([]), torch.tensor([])

            candidate_edges = torch.tensor(
                [all_sources, all_targets],
                dtype=torch.long,
                device=x.device
            )

            # Predict scores
            scores = torch.sigmoid(self.decode(z, candidate_edges))

            # Filter by confidence
            mask = scores >= min_confidence
            scores = scores[mask]
            candidate_edges = candidate_edges[:, mask]

            # Get top-k
            if len(scores) > top_k:
                top_indices = torch.topk(scores, top_k).indices
                scores = scores[top_indices]
                candidate_edges = candidate_edges[:, top_indices]

            return candidate_edges[0], candidate_edges[1], scores


def create_model(
    in_channels: int,
    config: Optional[dict] = None
) -> LinkPredictionModel:
    """
    Factory function to create link prediction model from config

    Args:
        in_channels: Number of input features
        config: Optional config override

    Returns:
        Initialized LinkPredictionModel
    """
    cfg = config or CONFIG['models']['link_prediction']

    return LinkPredictionModel(
        in_channels=in_channels,
        hidden_channels=cfg.get('hidden_dim', 64),
        out_channels=cfg.get('hidden_dim', 64),
        num_layers=cfg.get('num_layers', 3),
        dropout=cfg.get('dropout', 0.5),
        encoder_type='sage',  # Default to SAGE for inductive capability
        predictor_type='mlp'
    )
