# Node.js API Integration Guide

## Calling the GNN Service from Node.js

### Example Service in Node.js API

```javascript
// api/src/services/gnn.service.js

const axios = require('axios');

const GNN_SERVICE_URL = process.env.GNN_SERVICE_URL || 'http://localhost:5000';

class GNNService {
  constructor() {
    this.client = axios.create({
      baseURL: `${GNN_SERVICE_URL}/api/v1/gnn`,
      timeout: 30000
    });
  }

  /**
   * Predict links between WorkItems and Files
   */
  async predictLinks(sourceType, targetType, options = {}) {
    const response = await this.client.post('/predict-links', {
      source_type: sourceType,
      target_type: targetType,
      top_k: options.topK || 100,
      min_confidence: options.minConfidence || 0.7,
      exclude_existing: options.excludeExisting !== false
    });
    return response.data;
  }

  /**
   * Get link predictions for a specific node
   */
  async predictForNode(nodeId, targetType, options = {}) {
    const response = await this.client.post('/predict-for-node', {
      node_id: nodeId,
      target_type: targetType,
      top_k: options.topK || 10,
      min_confidence: options.minConfidence || 0.5
    });
    return response.data;
  }

  /**
   * Classify nodes by type
   */
  async classifyNodes(nodeIds, minConfidence = 0.5) {
    const response = await this.client.post('/classify-nodes', {
      node_ids: nodeIds,
      min_confidence: minConfidence
    });
    return response.data;
  }

  /**
   * Write predictions to Memgraph
   */
  async writePredictions(predictions, relationType = 'PREDICTED_LINK') {
    const response = await this.client.post('/write-predictions', {
      predictions,
      relation_type: relationType
    });
    return response.data;
  }

  /**
   * Get model status
   */
  async getModelStatus() {
    const response = await this.client.get('/model-status');
    return response.data;
  }

  /**
   * Get graph statistics
   */
  async getGraphStats() {
    const response = await this.client.get('/graph-stats');
    return response.data;
  }

  /**
   * Load model
   */
  async loadModel(modelPath, modelType = 'link') {
    const endpoint = modelType === 'link'
      ? '/load-link-model'
      : '/load-classification-model';

    const response = await this.client.post(endpoint, {
      model_path: modelPath
    });
    return response.data;
  }
}

module.exports = new GNNService();
```

### Example Route in Node.js

```javascript
// api/src/routes/gnn.route.js

const express = require('express');
const router = express.Router();
const gnnService = require('../services/gnn.service');

// Get suggested links for a WorkItem
router.get('/workitem/:id/suggested-links', async (req, res) => {
  try {
    const predictions = await gnnService.predictForNode(
      req.params.id,
      'File',
      { topK: 10, minConfidence: 0.6 }
    );
    res.json({ suggestions: predictions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Batch predict links
router.post('/predict-links', async (req, res) => {
  try {
    const { sourceType, targetType, topK, minConfidence } = req.body;
    const predictions = await gnnService.predictLinks(
      sourceType,
      targetType,
      { topK, minConfidence }
    );
    res.json({ predictions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Classify nodes
router.post('/classify', async (req, res) => {
  try {
    const { nodeIds, minConfidence } = req.body;
    const classifications = await gnnService.classifyNodes(nodeIds, minConfidence);
    res.json({ classifications });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Model status
router.get('/status', async (req, res) => {
  try {
    const status = await gnnService.getModelStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
```

### Adding to index.js

```javascript
// Add to api/src/index.js:
const gnnRoutes = require('./routes/gnn.route');
app.use('/api/v1/gnn', gnnRoutes);
```

### Environment Variables

```bash
# .env
GNN_SERVICE_URL=http://localhost:5000
```

### Docker Compose Integration

```yaml
# docker-compose.yml
services:
  api:
    # ... existing config ...
    environment:
      - GNN_SERVICE_URL=http://gnn-service:5000
    depends_on:
      - gnn-service

  gnn-service:
    build: ./gnn-service
    ports:
      - "5000:5000"
    environment:
      - MEMGRAPH_URI=bolt://memgraph:7687
      - MEMGRAPH_USER=memgraph
      - MEMGRAPH_PASSWORD=${MEMGRAPH_PASSWORD}
      - QDRANT_URL=http://qdrant:6333
      - REDIS_URL=redis://redis:6379
    volumes:
      - ./gnn-service/checkpoints:/app/checkpoints
    depends_on:
      - memgraph
      - qdrant
      - redis
```

## API Endpoints Reference

### Link Prediction

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/predict-links` | POST | Predict links between node types |
| `/predict-for-node` | POST | Predict links for specific node |
| `/write-predictions` | POST | Write predictions to graph |

### Classification

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/classify-nodes` | POST | Classify specific nodes |
| `/classify-all` | POST | Classify all nodes |
| `/write-classifications` | POST | Write classifications to graph |

### Model Management

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/load-link-model` | POST | Load link prediction model |
| `/load-classification-model` | POST | Load classification model |
| `/model-status` | GET | Get status of loaded models |

### Graph Info

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/graph-stats` | GET | Get graph statistics |
| `/node-types` | GET | Get configured node types |
| `/edge-types` | GET | Get configured edge types |
| `/knowledge-types` | GET | Get knowledge types for classification |
