# GNN Service Integration Guide

## Overview

This guide describes how to integrate the GNN (Graph Neural Network) service with the UN ProjectAdvisor frontend.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   React SPA     │────▶│  GNN Service    │────▶│    Memgraph     │
│  (Frontend)     │     │  (Python/PyTorch)│     │  (Graph DB)     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │
        │                       ▼
        │               ┌─────────────────┐
        │               │     Qdrant      │
        │               │  (Vector Store) │
        │               └─────────────────┘
        │                       │
        │                       ▼
        │               ┌─────────────────┐
        │               │     Redis       │
        └──────────────▶│    (Cache)      │
                        └─────────────────┘
```

## Quick Start

### 1. Start the GNN Service

```bash
cd gnn-service

# Option A: Docker
docker build -t gnn-service .
docker run -p 5000:5000 gnn-service

# Option B: Local Python
pip install -r requirements.txt
python run_server.py
```

### 2. Configure Frontend

Add to `.env`:

```env
VITE_GNN_URL=http://localhost:5000
```

### 3. Use Components

```jsx
import { GNNControlPanel, GNNInsightsPanel } from './components/GNN';
import { gnnService } from './services/gnn.service';

function MyPage() {
  const [predictions, setPredictions] = useState([]);

  const handlePredictions = (result) => {
    setPredictions(result.predictions);
  };

  return (
    <div>
      <GNNControlPanel onPredictionsReady={handlePredictions} />
      <GNNInsightsPanel predictions={predictions} />
    </div>
  );
}
```

## Components

### GNNControlPanel

Main control panel for GNN operations.

**Props:**
- `onPredictionsReady(result)` - Callback when predictions are ready
- `onError(error)` - Error callback

**Features:**
- Model status display
- Link prediction with configurable parameters
- Node classification
- Training management
- Write predictions to graph

### PredictedLinksOverlay

Overlay component for visualizing predicted links on graph.

**Props:**
- `predictions` - Array of prediction objects
- `visible` - Show/hide overlay
- `onVisibilityChange(visible)` - Visibility toggle callback
- `confidenceThreshold` - Minimum confidence to display
- `onThresholdChange(threshold)` - Threshold change callback
- `selectedPrediction` - Currently selected prediction
- `onSelectPrediction(prediction)` - Selection callback
- `maxDisplay` - Maximum predictions to display

**Utility Function:**
```jsx
import { predictionsToEdges } from './components/GNN';

// Convert predictions to graph edge format
const edges = predictionsToEdges(predictions, {
  color: '#ff9800',
  dashArray: '5,5',
  opacity: 0.7,
  width: 2,
});
```

### GNNInsightsPanel

Analytics panel showing GNN insights.

**Props:**
- `predictions` - Link predictions array
- `classifications` - Node classifications array
- `graphStats` - Graph statistics object
- `nodeTypes` - Available node types
- `onNodeClick(nodeId)` - Node click callback

## API Service

### gnnService Methods

```javascript
import { gnnService } from './services/gnn.service';

// Model Status
await gnnService.getModelStatus();

// Link Prediction
await gnnService.predictLinks('WorkItem', 'Project', {
  topK: 100,
  minConfidence: 0.7,
  excludeExisting: true,
});

// Predict for specific node
await gnnService.predictForNode('WI-123', 'Project', {
  topK: 10,
  minConfidence: 0.5,
});

// Classification
await gnnService.classifyNodes(['node1', 'node2'], 0.5);
await gnnService.classifyAll(0.5, 1000);

// Graph Operations
await gnnService.getGraphStats();
await gnnService.getNodeTypes();
await gnnService.getEdgeTypes();
await gnnService.writePredictions(predictions, 'PREDICTED_LINK');

// Training
const { job_id } = await gnnService.startTraining('link_prediction', 100, 0.001);
await gnnService.getTrainingStatus(job_id);
```

## Integration with Existing Graph Visualization

### Adding Predicted Links to Force Graph

```jsx
import ForceGraph2D from 'react-force-graph-2d';
import { predictionsToEdges } from './components/GNN';

function GraphWithPredictions({ graphData, predictions }) {
  const enhancedData = useMemo(() => {
    const predictedEdges = predictionsToEdges(predictions);

    return {
      nodes: graphData.nodes,
      links: [
        ...graphData.links,
        ...predictedEdges.map(e => ({
          ...e,
          predicted: true,
        })),
      ],
    };
  }, [graphData, predictions]);

  return (
    <ForceGraph2D
      graphData={enhancedData}
      linkColor={link => link.predicted ? '#ff9800' : '#999'}
      linkLineDash={link => link.predicted ? [5, 5] : null}
      linkWidth={link => link.predicted ? 2 : 1}
    />
  );
}
```

### Highlighting Predicted Connections

```jsx
function NodeWithPredictions({ nodeId }) {
  const [predictedLinks, setPredictedLinks] = useState([]);

  useEffect(() => {
    gnnService.predictForNode(nodeId, null, { topK: 5 })
      .then(result => setPredictedLinks(result.predictions))
      .catch(console.error);
  }, [nodeId]);

  return (
    <div>
      <h3>Predicted Connections</h3>
      {predictedLinks.map(link => (
        <div key={link.target_id}>
          {link.target_id} ({(link.confidence * 100).toFixed(1)}%)
        </div>
      ))}
    </div>
  );
}
```

## Best Practices

### 1. Caching Predictions

The GNN service uses Redis for caching. Configure TTL in `gnn_config.yaml`:

```yaml
redis:
  host: localhost
  port: 6379
  prediction_cache_ttl: 3600  # 1 hour
```

### 2. Batch Operations

For large-scale predictions, use batch endpoints:

```javascript
// Instead of individual calls
for (const nodeId of nodeIds) {
  await gnnService.predictForNode(nodeId, 'Project');
}

// Use batch prediction
const result = await gnnService.predictLinks('WorkItem', 'Project', {
  topK: 1000,
});
```

### 3. Confidence Thresholds

- **High confidence (≥0.9)**: Auto-approve for graph updates
- **Medium confidence (0.7-0.9)**: Show as suggestions
- **Low confidence (<0.7)**: Flag for manual review

### 4. Error Handling

```javascript
try {
  const predictions = await gnnService.predictLinks(source, target);
  handleSuccess(predictions);
} catch (error) {
  if (error.message.includes('Model not loaded')) {
    // Attempt to load model
    await gnnService.loadLinkModel('/app/checkpoints/link_model.pt');
    // Retry
    const predictions = await gnnService.predictLinks(source, target);
    handleSuccess(predictions);
  } else {
    handleError(error);
  }
}
```

## Troubleshooting

### Model Not Loading

1. Check if model file exists in checkpoints directory
2. Verify model compatibility with current graph schema
3. Check GPU memory availability

### Low Prediction Quality

1. Ensure sufficient training data
2. Verify embeddings are up-to-date in Qdrant
3. Check for node type imbalance

### Performance Issues

1. Enable Redis caching
2. Reduce batch sizes for predictions
3. Use appropriate `topK` and `limit` parameters

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_GNN_URL` | `http://localhost:5000` | GNN service URL |
| `MEMGRAPH_HOST` | `localhost` | Memgraph host |
| `MEMGRAPH_PORT` | `7687` | Memgraph port |
| `QDRANT_URL` | `http://localhost:6333` | Qdrant URL |
| `REDIS_HOST` | `localhost` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
