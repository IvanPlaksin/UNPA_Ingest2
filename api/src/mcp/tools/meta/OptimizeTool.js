const { BaseTool } = require('../primitives/BaseTool.js');

class OptimizeTool extends BaseTool {
  getDefinition() {
    return {
      id: 'meta.optimize',
      name: 'Optimize Pipeline',
      version: '1.0.0',
      level: 4,
      category: 'meta',
      description: 'Analyze and optimize tool pipelines for performance',
      inputSchema: {
        type: 'object',
        required: ['pipeline'],
        properties: {
          pipeline: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                tool: { type: 'string' },
                inputs: { type: 'array', items: { type: 'string' } },
                args: { type: 'object' }
              }
            },
            description: 'Pipeline stages to optimize'
          },
          optimizations: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['parallelize', 'dedupe', 'cache', 'batch', 'prune', 'reorder']
            },
            default: ['parallelize', 'dedupe'],
            description: 'Optimizations to apply'
          },
          constraints: {
            type: 'object',
            properties: {
              maxParallel: { type: 'integer', default: 10 },
              preserveOrder: { type: 'boolean', default: false },
              cacheTTL: { type: 'integer', default: 300000 }
            }
          },
          dryRun: { type: 'boolean', default: true, description: 'Only analyze, do not modify' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          original: { type: 'object' },
          optimized: { type: 'object' },
          analysis: { type: 'object' },
          improvements: { type: 'array' },
          estimatedSpeedup: { type: 'number' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: [],
      resourceEstimate: { maxDurationMs: 5000, maxMemoryMb: 50 }
    };
  }

  async execute(args, context, server) {
    const {
      pipeline,
      optimizations = ['parallelize', 'dedupe'],
      constraints = {},
      dryRun = true
    } = args;

    const { maxParallel = 10, preserveOrder = false, cacheTTL = 300000 } = constraints;

    // Analyze original pipeline
    const analysis = this.analyzePipeline(pipeline, server);

    // Apply optimizations
    let optimizedPipeline = [...pipeline];
    const improvements = [];

    for (const optimization of optimizations) {
      const result = this.applyOptimization(
        optimizedPipeline,
        optimization,
        { maxParallel, preserveOrder, cacheTTL },
        server
      );

      if (result.applied) {
        optimizedPipeline = result.pipeline;
        improvements.push({
          type: optimization,
          description: result.description,
          impactEstimate: result.impact
        });
      }
    }

    // Analyze optimized pipeline
    const optimizedAnalysis = this.analyzePipeline(optimizedPipeline, server);

    // Estimate speedup
    const estimatedSpeedup = this.estimateSpeedup(analysis, optimizedAnalysis, improvements);

    return this.success({
      original: {
        stages: pipeline.length,
        analysis
      },
      optimized: dryRun ? {
        stages: optimizedPipeline.length,
        pipeline: optimizedPipeline,
        analysis: optimizedAnalysis
      } : null,
      analysis,
      improvements,
      estimatedSpeedup
    });
  }

  analyzePipeline(pipeline, server) {
    const stages = pipeline.length;
    const dependencies = this.buildDependencyGraph(pipeline);
    const parallelGroups = this.findParallelGroups(pipeline, dependencies);
    const criticalPath = this.findCriticalPath(pipeline, dependencies, server);

    // Detect potential issues
    const issues = [];

    // Check for duplicate operations
    const toolCounts = {};
    for (const stage of pipeline) {
      toolCounts[stage.tool] = (toolCounts[stage.tool] || 0) + 1;
    }
    const duplicates = Object.entries(toolCounts)
      .filter(([, count]) => count > 1)
      .map(([tool]) => tool);

    if (duplicates.length > 0) {
      issues.push({
        type: 'duplicate_tools',
        message: `Duplicate tool usage: ${duplicates.join(', ')}`,
        severity: 'warning'
      });
    }

    // Check for long sequential chains
    if (parallelGroups.length === stages && stages > 5) {
      issues.push({
        type: 'no_parallelism',
        message: 'Pipeline has no parallelism opportunities',
        severity: 'info'
      });
    }

    // Estimate resources
    let totalDuration = 0;
    let totalMemory = 0;
    for (const stage of pipeline) {
      const tool = server?.registry?.getTool(stage.tool);
      if (tool) {
        const def = tool.getDefinition();
        totalDuration += def.resourceEstimate?.maxDurationMs || 1000;
        totalMemory = Math.max(totalMemory, def.resourceEstimate?.maxMemoryMb || 10);
      }
    }

    return {
      stages,
      parallelGroups: parallelGroups.length,
      maxParallelism: Math.max(...parallelGroups.map(g => g.length)),
      criticalPathLength: criticalPath.length,
      estimatedDuration: totalDuration,
      estimatedMemory: totalMemory,
      issues,
      dependencies
    };
  }

  buildDependencyGraph(pipeline) {
    const graph = new Map();

    for (const stage of pipeline) {
      const deps = stage.inputs || [];
      graph.set(stage.id || stage.tool, deps);
    }

    return Object.fromEntries(graph);
  }

  findParallelGroups(pipeline, dependencies) {
    const groups = [];
    const executed = new Set();

    while (executed.size < pipeline.length) {
      const ready = pipeline.filter(stage => {
        const id = stage.id || stage.tool;
        if (executed.has(id)) return false;
        const deps = dependencies[id] || [];
        return deps.every(d => executed.has(d));
      });

      if (ready.length === 0) break;

      groups.push(ready.map(s => s.id || s.tool));
      ready.forEach(s => executed.add(s.id || s.tool));
    }

    return groups;
  }

  findCriticalPath(pipeline, dependencies, server) {
    // Simple critical path: longest chain
    const stageIds = pipeline.map(s => s.id || s.tool);
    let longestPath = [];

    const findPath = (id, path = []) => {
      path = [...path, id];
      const deps = dependencies[id] || [];

      if (deps.length === 0) {
        if (path.length > longestPath.length) {
          longestPath = path;
        }
        return;
      }

      for (const dep of deps) {
        if (stageIds.includes(dep)) {
          findPath(dep, path);
        }
      }
    };

    for (const stage of pipeline) {
      findPath(stage.id || stage.tool);
    }

    return longestPath.reverse();
  }

  applyOptimization(pipeline, optimization, constraints, server) {
    switch (optimization) {
      case 'parallelize':
        return this.optimizeParallelize(pipeline, constraints);
      case 'dedupe':
        return this.optimizeDedupe(pipeline);
      case 'cache':
        return this.optimizeCache(pipeline, constraints);
      case 'batch':
        return this.optimizeBatch(pipeline, server);
      case 'prune':
        return this.optimizePrune(pipeline);
      case 'reorder':
        return this.optimizeReorder(pipeline, constraints);
      default:
        return { applied: false, pipeline };
    }
  }

  optimizeParallelize(pipeline, constraints) {
    // Mark independent stages for parallel execution
    const dependencies = this.buildDependencyGraph(pipeline);
    const parallelGroups = this.findParallelGroups(pipeline, dependencies);

    if (parallelGroups.some(g => g.length > 1)) {
      // Add parallel execution hints
      const optimized = pipeline.map(stage => {
        const id = stage.id || stage.tool;
        const group = parallelGroups.findIndex(g => g.includes(id));
        return {
          ...stage,
          _parallelGroup: group,
          _canParallelize: parallelGroups[group]?.length > 1
        };
      });

      return {
        applied: true,
        pipeline: optimized,
        description: `Found ${parallelGroups.filter(g => g.length > 1).length} parallel groups`,
        impact: 'high'
      };
    }

    return { applied: false, pipeline };
  }

  optimizeDedupe(pipeline) {
    // Remove duplicate stages with same tool and args
    const seen = new Map();
    const optimized = [];
    let removed = 0;

    for (const stage of pipeline) {
      const key = JSON.stringify({ tool: stage.tool, args: stage.args });
      if (!seen.has(key)) {
        seen.set(key, stage.id || stage.tool);
        optimized.push(stage);
      } else {
        removed++;
        // Update references to point to original
        const originalId = seen.get(key);
        optimized.forEach(s => {
          if (s.inputs?.includes(stage.id || stage.tool)) {
            s.inputs = s.inputs.map(i =>
              i === (stage.id || stage.tool) ? originalId : i
            );
          }
        });
      }
    }

    if (removed > 0) {
      return {
        applied: true,
        pipeline: optimized,
        description: `Removed ${removed} duplicate stages`,
        impact: 'medium'
      };
    }

    return { applied: false, pipeline };
  }

  optimizeCache(pipeline, constraints) {
    // Add caching wrapper for expensive operations
    const optimized = pipeline.map(stage => {
      // Heuristic: cache AI and vector operations
      if (stage.tool.startsWith('ai.') || stage.tool.startsWith('vector.')) {
        return {
          ...stage,
          _cache: {
            enabled: true,
            ttl: constraints.cacheTTL
          }
        };
      }
      return stage;
    });

    const cachedCount = optimized.filter(s => s._cache?.enabled).length;
    if (cachedCount > 0) {
      return {
        applied: true,
        pipeline: optimized,
        description: `Added caching to ${cachedCount} stages`,
        impact: 'high'
      };
    }

    return { applied: false, pipeline };
  }

  optimizeBatch(pipeline, server) {
    // Group consecutive same-tool operations for batching
    // This is a placeholder for actual batch optimization
    return { applied: false, pipeline };
  }

  optimizePrune(pipeline) {
    // Remove stages whose outputs are never used
    const usedOutputs = new Set();

    // Find all used inputs
    for (const stage of pipeline) {
      (stage.inputs || []).forEach(i => usedOutputs.add(i));
    }

    // Last stage output is always used
    const lastId = pipeline[pipeline.length - 1]?.id || pipeline[pipeline.length - 1]?.tool;
    usedOutputs.add(lastId);

    const optimized = pipeline.filter((stage, i) => {
      const id = stage.id || stage.tool;
      return usedOutputs.has(id) || i === pipeline.length - 1;
    });

    if (optimized.length < pipeline.length) {
      return {
        applied: true,
        pipeline: optimized,
        description: `Pruned ${pipeline.length - optimized.length} unused stages`,
        impact: 'medium'
      };
    }

    return { applied: false, pipeline };
  }

  optimizeReorder(pipeline, constraints) {
    if (constraints.preserveOrder) {
      return { applied: false, pipeline };
    }

    // Reorder to maximize early parallelism
    const dependencies = this.buildDependencyGraph(pipeline);
    const reordered = [];
    const executed = new Set();

    while (executed.size < pipeline.length) {
      const ready = pipeline.filter(stage => {
        const id = stage.id || stage.tool;
        if (executed.has(id)) return false;
        const deps = dependencies[id] || [];
        return deps.every(d => executed.has(d));
      });

      // Sort ready stages by number of dependents (more dependents first)
      ready.sort((a, b) => {
        const aId = a.id || a.tool;
        const bId = b.id || b.tool;
        const aDeps = pipeline.filter(s => (s.inputs || []).includes(aId)).length;
        const bDeps = pipeline.filter(s => (s.inputs || []).includes(bId)).length;
        return bDeps - aDeps;
      });

      reordered.push(...ready);
      ready.forEach(s => executed.add(s.id || s.tool));
    }

    return {
      applied: true,
      pipeline: reordered,
      description: 'Reordered for optimal parallelism',
      impact: 'low'
    };
  }

  estimateSpeedup(original, optimized, improvements) {
    let speedup = 1.0;

    for (const imp of improvements) {
      switch (imp.impactEstimate) {
        case 'high': speedup *= 1.5; break;
        case 'medium': speedup *= 1.2; break;
        case 'low': speedup *= 1.05; break;
      }
    }

    // Factor in parallelism improvement
    if (optimized.maxParallelism > original.maxParallelism) {
      speedup *= (1 + (optimized.maxParallelism - original.maxParallelism) * 0.1);
    }

    return Math.round(speedup * 100) / 100;
  }
}

module.exports = { OptimizeTool };
