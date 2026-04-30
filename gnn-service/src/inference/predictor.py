"""
Inference service for GNN predictions
Handles model loading, prediction, and caching
"""
import torch
from torch_geometric.data import Data
from typing import Dict, List, Optional, Tuple
import json
from pathlib import Path

from ..models.link_prediction import LinkPredictionModel, create_model
from ..data.memgraph_loader import get_loader
from ..data.qdrant_features import get_feature_loader
from ..data.dataset import ProjectAdvisorDataset
from ..config import CONFIG

# Try to import redis, but make it optional
try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False


class LinkPredictor:
    """
    Production inference service for link prediction
    """

    def __init__(
        self,
        model_path: Optional[str] = None,
        use_cache: bool = True
    ):
        self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
        self.model: Optional[LinkPredictionModel] = None
        self.dataset: Optional[ProjectAdvisorDataset] = None
        self.data: Optional[Data] = None
        self.node_embeddings: Optional[torch.Tensor] = None

        # Redis cache
        self.use_cache = use_cache and REDIS_AVAILABLE
        self.cache = None
        if self.use_cache:
            try:
                self.cache = redis.from_url(CONFIG['redis']['url'])
                self.cache.ping()
            except Exception as e:
                print(f"Warning: Redis not available, caching disabled: {e}")
                self.cache = None

        if model_path:
            self.load_model(model_path)

    def load_model(self, model_path: str):
        """Load trained model from checkpoint"""
        checkpoint = torch.load(model_path, map_location=self.device)

        # Get input dimension from data
        self._load_data()
        in_channels = self.data.x.shape[1]

        # Create model
        self.model = create_model(in_channels)
        self.model.load_state_dict(checkpoint['model_state_dict'])
        self.model.to(self.device)
        self.model.eval()

        # Pre-compute node embeddings
        self._compute_embeddings()

        print(f"Model loaded from {model_path}")

    def _load_data(self):
        """Load graph data"""
        if self.dataset is None:
            self.dataset = ProjectAdvisorDataset()
            self.dataset.load()
            self.data = self.dataset.get_data()

    def _compute_embeddings(self):
        """Pre-compute node embeddings for fast inference"""
        if self.model is None or self.data is None:
            return

        with torch.no_grad():
            x = self.data.x.to(self.device)
            edge_index = self.data.edge_index.to(self.device)
            self.node_embeddings = self.model.encode(x, edge_index)

    def get_node_embeddings(self, node_ids: List[str]) -> Dict[str, List[float]]:
        """
        Return GNN embeddings for specified external node IDs.

        Args:
            node_ids: List of external node IDs

        Returns:
            Dictionary mapping node_id to embedding vector
        """
        if self.node_embeddings is None:
            raise RuntimeError("Embeddings not computed. Load a model first.")

        id_to_idx = {
            node.get('external_id'): i
            for i, node in enumerate(self.dataset.nodes)
        }

        result = {}
        for nid in node_ids:
            if nid in id_to_idx:
                idx = id_to_idx[nid]
                result[nid] = self.node_embeddings[idx].cpu().tolist()

        return result

    def get_all_embeddings(self) -> Dict[str, List[float]]:
        """Return GNN embeddings for all nodes."""
        if self.node_embeddings is None:
            raise RuntimeError("Embeddings not computed. Load a model first.")

        result = {}
        for i, node in enumerate(self.dataset.nodes):
            ext_id = node.get('external_id')
            if ext_id:
                result[ext_id] = self.node_embeddings[i].cpu().tolist()

        return result

    def get_embedding_dim(self) -> int:
        """Return the GNN embedding dimension."""
        if self.node_embeddings is not None:
            return self.node_embeddings.shape[1]
        return 64  # default

    def predict_links(
        self,
        source_type: str,
        target_type: str,
        top_k: int = 100,
        min_confidence: float = 0.7,
        exclude_existing: bool = True
    ) -> List[Dict]:
        """
        Predict new links between node types

        Args:
            source_type: Type of source nodes (e.g., 'WorkItem')
            target_type: Type of target nodes (e.g., 'File')
            top_k: Maximum number of predictions
            min_confidence: Minimum confidence threshold
            exclude_existing: Whether to exclude existing edges

        Returns:
            List of predicted links with confidence scores
        """
        if self.model is None:
            raise RuntimeError("Model not loaded. Call load_model() first.")

        # Check cache
        cache_key = f"link_pred:{source_type}:{target_type}:{top_k}:{min_confidence}"
        if self.cache:
            cached = self.cache.get(cache_key)
            if cached:
                return json.loads(cached)

        # Get node indices by type
        type_to_idx = {t: i for i, t in enumerate(CONFIG['node_types'])}
        source_type_idx = type_to_idx.get(source_type)
        target_type_idx = type_to_idx.get(target_type)

        if source_type_idx is None or target_type_idx is None:
            raise ValueError(f"Unknown node type: {source_type} or {target_type}")

        source_nodes = (self.data.node_type == source_type_idx).nonzero().squeeze()
        target_nodes = (self.data.node_type == target_type_idx).nonzero().squeeze()

        # Handle single node case
        if source_nodes.dim() == 0:
            source_nodes = source_nodes.unsqueeze(0)
        if target_nodes.dim() == 0:
            target_nodes = target_nodes.unsqueeze(0)

        # Predict
        sources, targets, scores = self.model.predict_new_links(
            x=self.data.x.to(self.device),
            edge_index=self.data.edge_index.to(self.device),
            source_nodes=source_nodes.to(self.device),
            target_nodes=target_nodes.to(self.device),
            top_k=top_k * 2,  # Get more to filter
            min_confidence=min_confidence
        )

        # Build results with external IDs
        results = []
        existing_edges = set()

        if exclude_existing:
            # Build set of existing edges
            edge_index = self.data.edge_index
            for i in range(edge_index.shape[1]):
                src, dst = edge_index[0, i].item(), edge_index[1, i].item()
                existing_edges.add((src, dst))

        for src, tgt, score in zip(sources.tolist(), targets.tolist(), scores.tolist()):
            if exclude_existing and (src, tgt) in existing_edges:
                continue

            results.append({
                'source_id': self.dataset.nodes[src].get('external_id'),
                'target_id': self.dataset.nodes[tgt].get('external_id'),
                'source_type': source_type,
                'target_type': target_type,
                'confidence': round(score, 4),
                'link_type': f"{source_type}_TO_{target_type}"
            })

            if len(results) >= top_k:
                break

        # Cache results
        if self.cache and results:
            self.cache.setex(
                cache_key,
                CONFIG['redis']['cache_ttl'],
                json.dumps(results)
            )

        return results

    def predict_for_node(
        self,
        node_id: str,
        target_type: str,
        top_k: int = 10,
        min_confidence: float = 0.5
    ) -> List[Dict]:
        """
        Predict links for a specific node

        Args:
            node_id: External ID of the node
            target_type: Type of target nodes to predict
            top_k: Maximum predictions
            min_confidence: Minimum confidence

        Returns:
            List of predicted links
        """
        if self.model is None:
            raise RuntimeError("Model not loaded")

        # Find node index
        node_idx = None
        source_type = None
        for i, node in enumerate(self.dataset.nodes):
            if node.get('external_id') == node_id:
                node_idx = i
                source_type = node.get('node_type')
                break

        if node_idx is None:
            raise ValueError(f"Node not found: {node_id}")

        # Get target node indices
        type_to_idx = {t: i for i, t in enumerate(CONFIG['node_types'])}
        target_type_idx = type_to_idx.get(target_type)

        if target_type_idx is None:
            raise ValueError(f"Unknown target type: {target_type}")

        target_nodes = (self.data.node_type == target_type_idx).nonzero().squeeze()

        if target_nodes.dim() == 0:
            target_nodes = target_nodes.unsqueeze(0)

        # Predict
        source_tensor = torch.tensor([node_idx], device=self.device)
        _, targets, scores = self.model.predict_new_links(
            x=self.data.x.to(self.device),
            edge_index=self.data.edge_index.to(self.device),
            source_nodes=source_tensor,
            target_nodes=target_nodes.to(self.device),
            top_k=top_k,
            min_confidence=min_confidence
        )

        results = []
        for tgt, score in zip(targets.tolist(), scores.tolist()):
            results.append({
                'source_id': node_id,
                'source_type': source_type,
                'target_id': self.dataset.nodes[tgt].get('external_id'),
                'target_type': target_type,
                'confidence': round(score, 4)
            })

        return results

    def write_predictions_to_graph(
        self,
        predictions: List[Dict],
        relation_type: str = "PREDICTED_LINK"
    ) -> int:
        """Write predictions back to Memgraph"""
        with get_loader() as loader:
            # Add model metadata
            for pred in predictions:
                pred['model'] = 'link_prediction_v1'

            written = loader.write_predictions(predictions, relation_type)
            return written


# Singleton instance for API
_predictor_instance: Optional[LinkPredictor] = None


def get_predictor() -> LinkPredictor:
    """Get or create predictor instance"""
    global _predictor_instance
    if _predictor_instance is None:
        _predictor_instance = LinkPredictor()
    return _predictor_instance


def load_predictor(model_path: str) -> LinkPredictor:
    """Load predictor with model"""
    global _predictor_instance
    _predictor_instance = LinkPredictor(model_path)
    return _predictor_instance


# =============================================================================
# Node Classification Inference
# =============================================================================

class NodeClassifier:
    """
    Production inference service for node classification
    """

    def __init__(
        self,
        model_path: Optional[str] = None,
        use_cache: bool = True
    ):
        self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
        self.model = None
        self.dataset: Optional[ProjectAdvisorDataset] = None
        self.data: Optional[Data] = None
        self.class_names: Optional[List[str]] = None

        # Redis cache
        self.use_cache = use_cache and REDIS_AVAILABLE
        self.cache = None
        if self.use_cache:
            try:
                self.cache = redis.from_url(CONFIG['redis']['url'])
                self.cache.ping()
            except Exception:
                self.cache = None

        if model_path:
            self.load_model(model_path)

    def load_model(self, model_path: str):
        """Load trained classification model"""
        checkpoint = torch.load(model_path, map_location=self.device)

        # Load data
        self._load_data()

        in_channels = self.data.x.shape[1]
        num_classes = checkpoint.get('num_classes', len(CONFIG['knowledge_types']))
        self.class_names = checkpoint.get('class_names', CONFIG['knowledge_types'])

        # Import here to avoid circular dependency
        from ..models.node_classification import create_classifier

        self.model = create_classifier(in_channels, num_classes)
        self.model.load_state_dict(checkpoint['model_state_dict'])
        self.model.to(self.device)
        self.model.eval()

        print(f"Classification model loaded from {model_path}")
        print(f"Classes: {self.class_names}")

    def _load_data(self):
        """Load graph data"""
        if self.dataset is None:
            self.dataset = ProjectAdvisorDataset()
            self.dataset.load()
            self.data = self.dataset.get_data()

    def classify_all(
        self,
        min_confidence: float = 0.5
    ) -> List[Dict]:
        """
        Classify all nodes in the graph

        Args:
            min_confidence: Minimum confidence to include in results

        Returns:
            List of classification results
        """
        if self.model is None:
            raise RuntimeError("Model not loaded")

        x = self.data.x.to(self.device)
        edge_index = self.data.edge_index.to(self.device)

        # Get predictions
        probs = self.model.predict_proba(x, edge_index)
        preds = probs.argmax(dim=1)
        confidences = probs.max(dim=1).values

        results = []
        for i in range(len(self.dataset.nodes)):
            conf = confidences[i].item()
            if conf >= min_confidence:
                results.append({
                    'node_id': self.dataset.nodes[i].get('external_id'),
                    'node_type': self.dataset.nodes[i].get('node_type'),
                    'predicted_class': self.class_names[preds[i].item()],
                    'confidence': round(conf, 4),
                    'all_probabilities': {
                        name: round(probs[i, j].item(), 4)
                        for j, name in enumerate(self.class_names)
                    }
                })

        return results

    def classify_nodes(
        self,
        node_ids: List[str],
        min_confidence: float = 0.0
    ) -> List[Dict]:
        """
        Classify specific nodes by their external IDs

        Args:
            node_ids: List of external node IDs
            min_confidence: Minimum confidence threshold

        Returns:
            Classification results for requested nodes
        """
        if self.model is None:
            raise RuntimeError("Model not loaded")

        # Check cache
        cache_key = f"node_class:{':'.join(sorted(node_ids))}"
        if self.cache:
            cached = self.cache.get(cache_key)
            if cached:
                return json.loads(cached)

        # Build ID to index mapping
        id_to_idx = {
            node.get('external_id'): i
            for i, node in enumerate(self.dataset.nodes)
        }

        # Get indices for requested nodes
        indices = []
        valid_ids = []
        for nid in node_ids:
            if nid in id_to_idx:
                indices.append(id_to_idx[nid])
                valid_ids.append(nid)

        if not indices:
            return []

        x = self.data.x.to(self.device)
        edge_index = self.data.edge_index.to(self.device)

        # Get predictions for all nodes (GNN needs full graph context)
        probs = self.model.predict_proba(x, edge_index)

        results = []
        for nid, idx in zip(valid_ids, indices):
            conf = probs[idx].max().item()
            pred_class = probs[idx].argmax().item()

            if conf >= min_confidence:
                results.append({
                    'node_id': nid,
                    'predicted_class': self.class_names[pred_class],
                    'confidence': round(conf, 4),
                    'all_probabilities': {
                        name: round(probs[idx, j].item(), 4)
                        for j, name in enumerate(self.class_names)
                    }
                })

        # Cache results
        if self.cache and results:
            self.cache.setex(
                cache_key,
                CONFIG['redis']['cache_ttl'],
                json.dumps(results)
            )

        return results

    def write_classifications_to_graph(
        self,
        classifications: List[Dict]
    ) -> int:
        """Write classification results to Memgraph node properties"""
        with get_loader() as loader:
            with loader.driver.session() as session:
                query = """
                    UNWIND $classifications as c
                    MATCH (n {id: c.node_id})
                    SET n.gnn_class = c.predicted_class,
                        n.gnn_confidence = c.confidence,
                        n.gnn_classified_at = datetime()
                    RETURN count(*) as updated
                """
                result = session.run(query, classifications=classifications)
                return result.single()['updated']


# Singleton management for classifier
_classifier_instance: Optional[NodeClassifier] = None


def get_classifier() -> NodeClassifier:
    """Get or create classifier instance"""
    global _classifier_instance
    if _classifier_instance is None:
        _classifier_instance = NodeClassifier()
    return _classifier_instance


def load_classifier(model_path: str) -> NodeClassifier:
    """Load classifier with model"""
    global _classifier_instance
    _classifier_instance = NodeClassifier(model_path)
    return _classifier_instance
