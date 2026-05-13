# Tuning Lab - User Guide

## Overview

**Tuning Lab** is an interface for AI-powered parameter optimization of the extraction pipeline in UN ProjectAdvisor. It allows you to automatically find optimal settings for extracting entities and relationships from text.

## Getting Started

### Requirements
- API server running on port 3010
- Frontend dev server running

### Access
1. Open the application in your browser: `http://localhost:5173`
2. Navigate to **Pipeline Lab** (sidebar menu)
3. Select the **Tuning Lab** tab

---

## Workflow

Tuning Lab operates in a step-by-step mode:

```
┌─────────────────────────────────────────────────────────────┐
│  1. TEXT INPUT                                               │
│     Enter or paste text for analysis                        │
│     [Samples] [Upload] [Clear]                               │
│     ┌─────────────────────────────────────────────────────┐ │
│     │ Enter text here...                                   │ │
│     └─────────────────────────────────────────────────────┘ │
│                    [Extract & Evaluate]                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  2. EXTRACTION RESULTS                                       │
│     Entities: 5 found | Relationships: 3 found              │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  3. METRICS & TUNING                                         │
│     [Metrics] [Parameters] [Recommendations] [Chart]        │
│                    [Start Tuning]                            │
└─────────────────────────────────────────────────────────────┘
```

**Steps:**
1. **Text Input** — enter text manually, choose from samples, or upload a file
2. **Extraction** — click "Extract & Evaluate" to extract entities and relationships
3. **Review Results** — view the extracted entities and relationships with confidence scores
4. **Evaluate Metrics** — the system automatically assesses extraction quality
5. **Tuning** (optional) — run automatic parameter optimization

---

## Interface

### 0. Text Input Panel

**Text input field** — the primary element to start working.

**Actions:**
| Button | Description |
|--------|-------------|
| **Samples** | Choose from sample texts (Technical, UN Systems, Work Items) |
| **Upload** | Upload a .txt or .md file |
| **Clear** | Clear the text |
| **Extract & Evaluate** | Run extraction and evaluation |

**Statistics:** displays word count and character count.

---

### 1. Parameters Panel

Contains sliders for adjusting 6 core pipeline parameters:

| Parameter | Range | Description |
|-----------|-------|-------------|
| **Entity Min Confidence** | 0.1 - 0.99 | Minimum confidence threshold for entity extraction |
| **LLM Temperature** | 0 - 1 | LLM creativity (0 = deterministic, 1 = creative) |
| **Co-occurrence Base Confidence** | 0.3 - 0.8 | Base confidence for co-occurrence-based relationships |
| **Pattern Min Confidence** | 0.3 - 0.9 | Minimum confidence for pattern-based relationships |
| **Chunk Max Tokens** | 128 - 2048 | Maximum chunk size in tokens |
| **Chunk Overlap** | 0 - 256 | Overlap between chunks in tokens |

**Usage:**
- Drag sliders to change parameters
- Changes are applied in real time
- Sliders are locked during an active tuning session

---

### 2. Metrics Display

Shows the current pipeline quality metrics:

| Metric | Description |
|--------|-------------|
| **Overall Score** | Overall quality score (0-100%) |
| **Entity Coverage** | Entity extraction completeness (recall) |
| **Entity Precision** | Entity extraction precision |
| **Relationship Quality** | Quality of extracted relationships |
| **Confidence Distribution** | Quality of confidence score distribution |

**Indicators:**
- 🟢 **Running** — tuning session is active
- 🟡 **Paused** — session is paused
- ⚪ **Idle** — no active session
- ✅ **Passed** — current configuration passed validation
- ❌ **Failed** — optimization required

---

### 3. Optimization Chart

Visualizes the optimization history:

- **Overall Score** (blue line) — overall score across iterations
- **F1 Score** (green line) — F1 metric
- **Recall** (yellow dashed) — recall
- **Precision** (red dashed) — precision

**Summary stats below the chart:**
- Iterations — number of iterations
- First Score — initial score
- Last Score — current score
- Improvement — improvement in %

---

### 4. Session Controls

#### Control Buttons:

| Button | Action |
|--------|--------|
| ⚙️ **Settings** | Open tuning settings |
| ▶️ **Start Tuning** | Start automatic optimization |
| ⏹️ **Stop & Apply Best** | Stop and apply the best configuration |
| 🔄 **Reset** | Reset configuration to default values |

#### Tuning Settings (⚙️):

**Max Iterations** (3-50)
- Number of optimization iterations
- Recommended: 10-20 to start

**Optimization Strategy:**
| Strategy | Description | When to Use |
|----------|-------------|-------------|
| **Random Search** | Random search | Quick exploration of parameter space |
| **Grid Search** | Systematic enumeration | Full analysis of all combinations |
| **Bayesian** | Bayesian optimization | Smart search that learns from previous results |

**Target Metric:**
- F1 Score (recommended)
- Entity Recall
- Entity Precision
- Relationship Quality

---

### 5. Recommendations Table

Displays AI-generated recommendations for improvement.

**Recommendation structure:**
- **Parameter** — which parameter to change
- **Current** → **Suggested** — current and recommended value
- **Reason** — justification for the recommendation
- **Expected Impact** — anticipated effect

**Actions:**
- 🔄 **Refresh** — get new recommendations
- ✅ **Apply** — apply a specific recommendation

---

## Usage Scenarios

### Scenario 1: Quick Optimization

1. Open Tuning Lab
2. Click **Start Tuning** (default settings are used)
3. Wait for 10 iterations to complete
4. Review results on the chart
5. The best configuration will be applied automatically

### Scenario 2: Fine-Tuning

1. Click ⚙️ **Settings**
2. Select:
   - Max Iterations: 30
   - Strategy: Bayesian
   - Target: F1 Score
3. Click **Start**
4. Monitor progress on the chart
5. If needed, stop early via **Stop & Apply Best**

### Scenario 3: Manual Tuning with Recommendations

1. Click 🔄 **Refresh** in the Recommendations panel
2. Review AI recommendations
3. Apply recommendations one by one by clicking ✅
4. Check metrics after each change
5. Save the optimal configuration

### Scenario 4: A/B Testing Configurations

1. Note the current metrics
2. Change parameters manually via sliders
3. Click **Refresh** to get a new evaluation
4. Compare metrics
5. Use **Reset** if the result is worse

---

## REST API Endpoints

Tuning Lab uses the following API endpoints:

### Sessions
```
POST /api/v1/tuning/start          # Start a session
POST /api/v1/tuning/auto           # Automatic tuning
POST /api/v1/tuning/:id/stop       # Stop a session
POST /api/v1/tuning/:id/pause      # Pause
POST /api/v1/tuning/:id/resume     # Resume
GET  /api/v1/tuning/status         # Status
GET  /api/v1/tuning/:id/history    # Iteration history
GET  /api/v1/tuning/:id/export     # Export results
```

### Configuration
```
GET  /api/v1/tuning/config         # Current configuration
PUT  /api/v1/tuning/config         # Update configuration
POST /api/v1/tuning/config/reset   # Reset to defaults
GET  /api/v1/tuning/parameters     # List parameters
```

### Profiles
```
GET  /api/v1/tuning/profiles              # List profiles
POST /api/v1/tuning/profiles/:name/load   # Load a profile
POST /api/v1/tuning/profiles/:name/save   # Save a profile
```

### Metrics & Evaluation
```
GET  /api/v1/tuning/metrics               # Aggregated metrics
GET  /api/v1/tuning/metrics/:name/trend   # Metric trend
GET  /api/v1/tuning/metrics/best          # Best result
POST /api/v1/tuning/evaluate              # Evaluate a configuration
POST /api/v1/tuning/recommendations       # Get recommendations
POST /api/v1/tuning/compare               # Compare configurations
```

---

## API Request Examples

### Start Automatic Tuning
```bash
curl -X POST http://localhost:3010/api/v1/tuning/auto \
  -H "Content-Type: application/json" \
  -d '{
    "maxIterations": 10,
    "strategy": "bayesian",
    "targetMetric": "f1_score"
  }'
```

### Update a Parameter
```bash
curl -X PUT http://localhost:3010/api/v1/tuning/config \
  -H "Content-Type: application/json" \
  -d '{
    "updates": {
      "entityExtraction": {
        "minConfidence": 0.7
      }
    }
  }'
```

### Get Recommendations
```bash
curl -X POST http://localhost:3010/api/v1/tuning/recommendations \
  -H "Content-Type: application/json" \
  -d '{
    "evaluation": {
      "scores": {
        "entityCoverage": 0.6,
        "relationshipQuality": 0.7
      }
    }
  }'
```

---

## Best Practices

### Optimization

1. **Start with Random Search** for quick exploration
2. **Switch to Bayesian** for precise optimization
3. **Use F1 Score** as the target metric for a balance between precision and recall
4. **10-20 iterations** is sufficient for most cases

### Parameters

1. **Entity Min Confidence**: start at 0.6, increase when there are too many false positives
2. **LLM Temperature**: keep between 0.1-0.3 for consistent results
3. **Chunk Size**: 512-1024 tokens is usually optimal
4. **Chunk Overlap**: 10-20% of chunk size

### Diagnostics

| Problem | Solution |
|---------|----------|
| Low Recall | Decrease minConfidence, increase chunk overlap |
| Low Precision | Increase minConfidence, decrease temperature |
| Slow Processing | Decrease chunk size, decrease iterations |
| Unstable Results | Decrease temperature, use Bayesian |

---

## Troubleshooting

### "Session not found"
- The session expired or was stopped
- Start a new session via **Start Tuning**

### "API Error"
- Verify that the API server is running on port 3010
- Check the browser console for details

### Sliders are locked
- Stop the active tuning session
- Or wait for the current iteration to complete

### Chart is empty
- Start a tuning session to accumulate data
- At least 2 iterations are required to display a line

---

## Related Documents

- [Pipeline Configuration](./PIPELINE_CONFIG.md) — configuration details
- [Entity Extraction](./ENTITY_EXTRACTION.md) — how entity extraction works
- [Golden Dataset](../api/tests/fixtures/golden-dataset.json) — test data

---

*Document created: 2026-01-22*
*Version: 1.0.0*
