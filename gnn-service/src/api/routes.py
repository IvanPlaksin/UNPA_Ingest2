"""
API routes for GNN Service
"""
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime

from ..inference.predictor import (
    get_predictor, load_predictor,
    get_classifier, load_classifier,
    LinkPredictor, NodeClassifier
)
from ..data.memgraph_loader import get_loader
from ..config import CONFIG

router = APIRouter()


# ============================================================================
# Request/Response Models
# ============================================================================

class LinkPredictionRequest(BaseModel):
    source_type: str = Field(..., description="Source node type (e.g., 'WorkItem')")
    target_type: str = Field(..., description="Target node type (e.g., 'File')")
    top_k: int = Field(100, ge=1, le=1000, description="Maximum number of predictions")
    min_confidence: float = Field(0.7, ge=0, le=1, description="Minimum confidence threshold")
    exclude_existing: bool = Field(True, description="Exclude already existing links")


class NodeLinkRequest(BaseModel):
    node_id: str = Field(..., description="External ID of the source node")
    target_type: str = Field(..., description="Target node type to predict links to")
    top_k: int = Field(10, ge=1, le=100)
    min_confidence: float = Field(0.5, ge=0, le=1)


class ClassificationRequest(BaseModel):
    node_ids: List[str] = Field(..., description="List of node IDs to classify")
    min_confidence: float = Field(0.0, ge=0, le=1)


class BatchClassificationRequest(BaseModel):
    min_confidence: float = Field(0.5, ge=0, le=1)
    limit: int = Field(1000, ge=1, le=10000)


class ModelLoadRequest(BaseModel):
    model_path: str = Field(..., description="Path to model checkpoint")


class TrainingRequest(BaseModel):
    task: str = Field(..., description="Training task: 'link_prediction' or 'classification'")
    epochs: int = Field(100, ge=1, le=1000)
    learning_rate: float = Field(0.001, gt=0)


class PredictionResult(BaseModel):
    source_id: str
    target_id: str
    source_type: str
    target_type: str
    confidence: float
    link_type: Optional[str] = None


class ClassificationResult(BaseModel):
    node_id: str
    predicted_class: str
    confidence: float
    all_probabilities: Dict[str, float]


class EmbedTextRequest(BaseModel):
    text: str = Field(..., description="Text to embed into GNN space")


class EmbedNodesRequest(BaseModel):
    node_ids: List[str] = Field(..., alias="nodeIds", description="Node IDs to get embeddings for")

    class Config:
        populate_by_name = True


class CommunityDetectionRequest(BaseModel):
    namespace: Optional[str] = Field(None, description="Filter by namespace (optional)")
    n_clusters: Optional[int] = Field(None, ge=2, le=100, description="Number of clusters (auto if not set)")
    min_community_size: int = Field(2, ge=1, description="Minimum community size")


class GraphSimilarityRequest(BaseModel):
    """Request for graph-level similarity scoring."""
    source_node_ids: List[str] = Field(..., alias="sourceNodeIds",
        description="Node IDs belonging to the source graph")
    candidate_graphs: List[Dict[str, Any]] = Field(..., alias="candidateGraphs",
        description="List of candidate graphs, each with 'graphId' and 'nodeIds' (list of node IDs)")
    method: str = Field("mean_pool", description="Aggregation: mean_pool or attention")

    class Config:
        populate_by_name = True


class GraphEmbeddingRequest(BaseModel):
    """Request for graph-level embedding via node aggregation."""
    node_ids: List[str] = Field(..., alias="nodeIds",
        description="Node IDs to aggregate into a single graph embedding")
    method: str = Field("mean_pool", description="Aggregation: mean_pool, max_pool, or attention")

    class Config:
        populate_by_name = True


class WriteResultsRequest(BaseModel):
    predictions: List[Dict[str, Any]]
    relation_type: str = Field("PREDICTED_LINK", description="Relation type to create")


# ============================================================================
# Link Prediction Endpoints
# ============================================================================

@router.post("/predict-links", response_model=List[PredictionResult])
async def predict_links(request: LinkPredictionRequest):
    """
    Predict missing links between node types

    Returns top-k most likely links between source and target node types.
    """
    try:
        predictor = get_predictor()

        if predictor.model is None:
            raise HTTPException(
                status_code=400,
                detail="Link prediction model not loaded. Call /load-model first."
            )

        predictions = predictor.predict_links(
            source_type=request.source_type,
            target_type=request.target_type,
            top_k=request.top_k,
            min_confidence=request.min_confidence,
            exclude_existing=request.exclude_existing
        )

        return predictions

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")


@router.post("/predict-for-node", response_model=List[PredictionResult])
async def predict_for_node(request: NodeLinkRequest):
    """
    Predict links for a specific node

    Given a node ID, predict the most likely connections to nodes of the target type.
    """
    try:
        predictor = get_predictor()

        if predictor.model is None:
            raise HTTPException(status_code=400, detail="Model not loaded")

        predictions = predictor.predict_for_node(
            node_id=request.node_id,
            target_type=request.target_type,
            top_k=request.top_k,
            min_confidence=request.min_confidence
        )

        return predictions

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")


# ============================================================================
# Node Classification Endpoints
# ============================================================================

@router.post("/classify-nodes", response_model=List[ClassificationResult])
async def classify_nodes(request: ClassificationRequest):
    """
    Classify specific nodes by their IDs
    """
    try:
        classifier = get_classifier()

        if classifier.model is None:
            raise HTTPException(status_code=400, detail="Classification model not loaded")

        results = classifier.classify_nodes(
            node_ids=request.node_ids,
            min_confidence=request.min_confidence
        )

        return results

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Classification failed: {str(e)}")


@router.post("/classify-all", response_model=List[ClassificationResult])
async def classify_all_nodes(request: BatchClassificationRequest):
    """
    Classify all nodes in the graph
    """
    try:
        classifier = get_classifier()

        if classifier.model is None:
            raise HTTPException(status_code=400, detail="Classification model not loaded")

        results = classifier.classify_all(min_confidence=request.min_confidence)

        # Apply limit
        if len(results) > request.limit:
            results = sorted(results, key=lambda x: -x['confidence'])[:request.limit]

        return results

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Classification failed: {str(e)}")


# ============================================================================
# Model Management Endpoints
# ============================================================================

@router.post("/load-link-model")
async def load_link_model(request: ModelLoadRequest):
    """Load link prediction model from checkpoint"""
    try:
        load_predictor(request.model_path)
        return {"status": "success", "message": f"Model loaded from {request.model_path}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load model: {str(e)}")


@router.post("/load-classification-model")
async def load_classification_model(request: ModelLoadRequest):
    """Load classification model from checkpoint"""
    try:
        load_classifier(request.model_path)
        return {"status": "success", "message": f"Model loaded from {request.model_path}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load model: {str(e)}")


@router.get("/model-status")
async def get_model_status():
    """Get status of loaded models"""
    predictor = get_predictor()
    classifier = get_classifier()

    return {
        "link_prediction": {
            "loaded": predictor.model is not None,
            "device": predictor.device if predictor.model else None
        },
        "classification": {
            "loaded": classifier.model is not None,
            "classes": classifier.class_names if classifier.model else None,
            "device": classifier.device if classifier.model else None
        }
    }


# ============================================================================
# Embedding Endpoints
# ============================================================================

@router.post("/embed/nodes")
async def embed_nodes(request: EmbedNodesRequest):
    """
    Get GNN node embeddings for specified node IDs.

    Returns pre-computed embeddings from the loaded link prediction model.
    The GNN encoder captures structural information that text embeddings miss.
    """
    try:
        predictor = get_predictor()

        if predictor.node_embeddings is None:
            raise HTTPException(
                status_code=400,
                detail="Model not loaded or embeddings not computed. Call /load-link-model first."
            )

        embeddings = predictor.get_node_embeddings(request.node_ids)
        return {"embeddings": embeddings}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Embedding retrieval failed: {str(e)}")


@router.post("/embed/text")
async def embed_text(request: EmbedTextRequest):
    """
    Create a text embedding comparable to GNN node embeddings.

    Uses a hash-based projection into the GNN embedding space.
    For best results, use this alongside /embed/nodes for hybrid scoring.
    """
    try:
        predictor = get_predictor()
        dim = predictor.get_embedding_dim()

        # Hash-based embedding: deterministic projection of text into GNN space
        import hashlib
        words = request.text.lower().split()
        embedding = [0.0] * dim

        for word in words:
            word_hash = int(hashlib.md5(word.encode()).hexdigest(), 16)
            idx = word_hash % dim
            embedding[idx] += 1.0

        # L2 normalize
        norm = sum(x * x for x in embedding) ** 0.5
        if norm > 0:
            embedding = [x / norm for x in embedding]

        return {"embedding": embedding, "dim": dim, "method": "hash_projection"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Text embedding failed: {str(e)}")


# ============================================================================
# Community Detection Endpoint
# ============================================================================

@router.post("/detect-communities")
async def detect_communities(request: CommunityDetectionRequest):
    """
    Detect communities using GNN node embeddings + KMeans clustering.

    When a GNN model is loaded, uses learned structural embeddings for clustering.
    Falls back to graph statistics based detection when no model is available.
    """
    try:
        predictor = get_predictor()

        if predictor.node_embeddings is not None:
            # GNN-based community detection using KMeans on embeddings
            import numpy as np

            embeddings = predictor.node_embeddings.cpu().numpy()
            nodes = predictor.dataset.nodes
            num_nodes = len(nodes)

            # Filter by namespace if specified
            if request.namespace:
                indices = []
                for i, node in enumerate(nodes):
                    if node.get('namespace') == request.namespace or not node.get('namespace'):
                        indices.append(i)
                if not indices:
                    return {"method": "gnn_kmeans", "clusters": [], "totalCommunities": 0}
                embeddings = embeddings[indices]
                filtered_nodes = [nodes[i] for i in indices]
            else:
                filtered_nodes = nodes
                indices = list(range(num_nodes))

            # Determine number of clusters
            n_clusters = request.n_clusters
            if n_clusters is None:
                # Heuristic: sqrt(n/2) clusters, clamped to [2, 20]
                n_clusters = max(2, min(20, int((len(indices) / 2) ** 0.5)))

            n_clusters = min(n_clusters, len(indices))

            # KMeans clustering on GNN embeddings
            from sklearn.cluster import KMeans
            kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
            labels = kmeans.fit_predict(embeddings)

            # Group nodes by cluster
            clusters_map = {}
            for i, label in enumerate(labels):
                label = int(label)
                if label not in clusters_map:
                    clusters_map[label] = []
                clusters_map[label].append({
                    "id": filtered_nodes[i].get('external_id'),
                    "name": filtered_nodes[i].get('title') or filtered_nodes[i].get('external_id'),
                    "label": filtered_nodes[i].get('node_type', 'Unknown'),
                })

            # Filter by min size and format
            clusters = []
            for cid, members in sorted(clusters_map.items(), key=lambda x: -len(x[1])):
                if len(members) >= request.min_community_size:
                    clusters.append({
                        "strategy": "community",
                        "communityId": cid,
                        "nodes": [m["id"] for m in members],
                        "nodeDetails": members,
                        "nodeCount": len(members),
                    })

            return {
                "method": "gnn_kmeans",
                "clusters": clusters,
                "totalCommunities": len(clusters_map),
                "filteredCommunities": len(clusters),
                "modularity": None,
                "inertia": float(kmeans.inertia_),
            }

        else:
            # No model loaded - return error with guidance
            raise HTTPException(
                status_code=400,
                detail="GNN model not loaded. Load a link prediction model first via /load-link-model, "
                       "or use the Node.js CommunityDetector (Label Propagation) as fallback."
            )

    except HTTPException:
        raise
    except ImportError as e:
        raise HTTPException(status_code=500, detail=f"Missing dependency: {str(e)}. Install scikit-learn.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Community detection failed: {str(e)}")


# ============================================================================
# Graph Integration Endpoints
# ============================================================================

@router.post("/write-predictions")
async def write_predictions_to_graph(request: WriteResultsRequest):
    """
    Write predictions back to Memgraph

    Creates relationships in the graph based on GNN predictions.
    """
    try:
        predictor = get_predictor()
        written = predictor.write_predictions_to_graph(
            predictions=request.predictions,
            relation_type=request.relation_type
        )
        return {"status": "success", "written": written}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Write failed: {str(e)}")


@router.post("/write-classifications")
async def write_classifications_to_graph(
    classifications: List[Dict[str, Any]]
):
    """Write classification results to node properties in Memgraph"""
    try:
        classifier = get_classifier()
        updated = classifier.write_classifications_to_graph(classifications)
        return {"status": "success", "updated": updated}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Write failed: {str(e)}")


# ============================================================================
# Graph Statistics Endpoints
# ============================================================================

@router.get("/graph-stats")
async def get_graph_statistics():
    """Get graph statistics from Memgraph"""
    try:
        with get_loader() as loader:
            node_counts = loader.get_node_counts()
            edge_counts = loader.get_edge_counts()

        return {
            "nodes": node_counts,
            "edges": edge_counts,
            "total_nodes": sum(node_counts.values()),
            "total_edges": sum(edge_counts.values())
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get stats: {str(e)}")


@router.get("/node-types")
async def get_node_types():
    """Get configured node types"""
    return {"node_types": CONFIG['node_types']}


@router.get("/edge-types")
async def get_edge_types():
    """Get configured edge types"""
    return {"edge_types": CONFIG['edge_types']}


@router.get("/knowledge-types")
async def get_knowledge_types():
    """Get configured knowledge types for classification"""
    return {"knowledge_types": CONFIG['knowledge_types']}


# ============================================================================
# Graph-Level Similarity Endpoints
# ============================================================================

@router.post("/graph-embedding")
async def get_graph_embedding(request: GraphEmbeddingRequest):
    """
    Compute a graph-level embedding by aggregating GNN node embeddings.

    Aggregates embeddings of specified nodes into a single vector representing
    the graph's structural fingerprint. Useful for comparing entire graphs.
    """
    try:
        predictor = get_predictor()

        if predictor.node_embeddings is None:
            # Fallback: hash-based embedding when no model loaded
            import hashlib
            combined = '|'.join(sorted(request.node_ids))
            hash_bytes = hashlib.sha256(combined.encode()).digest()
            dim = 64
            embedding = [float(b) / 255.0 for b in hash_bytes[:dim]]
            return {
                "embedding": embedding,
                "dim": dim,
                "method": "hash_fallback",
                "nodeCount": len(request.node_ids),
                "fallback": True
            }

        node_embeddings = predictor.get_node_embeddings(request.node_ids)
        if not node_embeddings:
            raise HTTPException(status_code=404, detail="No matching nodes found in graph")

        import numpy as np
        vectors = np.array(list(node_embeddings.values()))

        if request.method == "max_pool":
            graph_emb = vectors.max(axis=0)
        else:  # mean_pool (default)
            graph_emb = vectors.mean(axis=0)

        return {
            "embedding": graph_emb.tolist(),
            "dim": len(graph_emb),
            "method": request.method,
            "nodeCount": len(node_embeddings),
            "fallback": False
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Graph embedding failed: {str(e)}")


@router.post("/graph-similarity")
async def compute_graph_similarity(request: GraphSimilarityRequest):
    """
    Compute similarity between a source graph and candidate graphs.

    Uses GNN node embeddings aggregated to graph level, then computes
    cosine similarity. Falls back to Jaccard similarity on node IDs
    when GNN model is not loaded.
    """
    try:
        predictor = get_predictor()
        import numpy as np

        use_gnn = predictor.node_embeddings is not None

        if use_gnn:
            # GNN-based: aggregate node embeddings to graph level
            source_embs = predictor.get_node_embeddings(request.source_node_ids)
            if not source_embs:
                raise HTTPException(status_code=404, detail="Source nodes not found in graph")

            source_vectors = np.array(list(source_embs.values()))
            source_graph_emb = source_vectors.mean(axis=0)

            # Compute similarity for each candidate
            results = []
            for candidate in request.candidate_graphs:
                cand_id = candidate.get('graphId', 'unknown')
                cand_node_ids = candidate.get('nodeIds', [])

                if not cand_node_ids:
                    results.append({
                        "graphId": cand_id,
                        "similarity": 0.0,
                        "method": "gnn_cosine",
                        "matchedNodes": 0
                    })
                    continue

                cand_embs = predictor.get_node_embeddings(cand_node_ids)
                if not cand_embs:
                    results.append({
                        "graphId": cand_id,
                        "similarity": 0.0,
                        "method": "gnn_cosine",
                        "matchedNodes": 0
                    })
                    continue

                cand_vectors = np.array(list(cand_embs.values()))
                cand_graph_emb = cand_vectors.mean(axis=0)

                # Cosine similarity
                dot = np.dot(source_graph_emb, cand_graph_emb)
                norm_s = np.linalg.norm(source_graph_emb)
                norm_c = np.linalg.norm(cand_graph_emb)
                similarity = float(dot / (norm_s * norm_c + 1e-8))

                results.append({
                    "graphId": cand_id,
                    "similarity": round(similarity, 4),
                    "method": "gnn_cosine",
                    "matchedNodes": len(cand_embs)
                })

            results.sort(key=lambda x: -x['similarity'])
            return {"results": results, "method": "gnn_cosine", "fallback": False}

        else:
            # Fallback: Jaccard similarity on node IDs
            source_set = set(request.source_node_ids)
            results = []

            for candidate in request.candidate_graphs:
                cand_id = candidate.get('graphId', 'unknown')
                cand_set = set(candidate.get('nodeIds', []))

                if not cand_set:
                    results.append({
                        "graphId": cand_id,
                        "similarity": 0.0,
                        "method": "jaccard_fallback",
                        "matchedNodes": 0
                    })
                    continue

                intersection = len(source_set & cand_set)
                union = len(source_set | cand_set)
                similarity = intersection / union if union > 0 else 0.0

                results.append({
                    "graphId": cand_id,
                    "similarity": round(similarity, 4),
                    "method": "jaccard_fallback",
                    "matchedNodes": intersection
                })

            results.sort(key=lambda x: -x['similarity'])
            return {"results": results, "method": "jaccard_fallback", "fallback": True}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Graph similarity failed: {str(e)}")


# ============================================================================
# Training Endpoints (Background Tasks)
# ============================================================================

# Store for training job status
_training_jobs: Dict[str, Dict] = {}


@router.post("/train")
async def trigger_training(
    request: TrainingRequest,
    background_tasks: BackgroundTasks
):
    """
    Trigger model training as a background task
    """
    job_id = f"train-{request.task}-{datetime.now().strftime('%Y%m%d-%H%M%S')}"

    _training_jobs[job_id] = {
        "status": "queued",
        "task": request.task,
        "started_at": datetime.now().isoformat(),
        "progress": 0
    }

    background_tasks.add_task(
        run_training_job,
        job_id,
        request.task,
        request.epochs,
        request.learning_rate
    )

    return {"job_id": job_id, "status": "queued"}


@router.get("/train/{job_id}")
async def get_training_status(job_id: str):
    """Get status of a training job"""
    if job_id not in _training_jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return _training_jobs[job_id]


async def run_training_job(
    job_id: str,
    task: str,
    epochs: int,
    learning_rate: float
):
    """Background training job"""
    try:
        _training_jobs[job_id]["status"] = "running"

        # Import training modules
        from ..data.dataset import ProjectAdvisorDataset
        from ..training.trainer import LinkPredictionTrainer, NodeClassificationTrainer

        dataset = ProjectAdvisorDataset()
        dataset.load()

        if task == "link_prediction":
            from ..models.link_prediction import create_model

            train_data, val_data, test_data = dataset.create_link_prediction_split()
            model = create_model(train_data.x.shape[1])
            trainer = LinkPredictionTrainer(model, learning_rate=learning_rate)

            history = trainer.train(
                train_data=train_data,
                val_data=val_data,
                epochs=epochs,
                checkpoint_dir="./checkpoints"
            )

            _training_jobs[job_id]["metrics"] = {
                "best_val_auc": history["best_val_auc"]
            }

        elif task == "classification":
            from ..models.node_classification import create_classifier

            data = dataset.create_classification_split()
            model = create_classifier(data.x.shape[1], data.num_classes)
            trainer = NodeClassificationTrainer(model, learning_rate=learning_rate)

            results = trainer.train(data=data, epochs=epochs)

            _training_jobs[job_id]["metrics"] = results

        _training_jobs[job_id]["status"] = "completed"
        _training_jobs[job_id]["completed_at"] = datetime.now().isoformat()

    except Exception as e:
        _training_jobs[job_id]["status"] = "failed"
        _training_jobs[job_id]["error"] = str(e)
