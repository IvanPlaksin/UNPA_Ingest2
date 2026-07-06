'use strict';

let _mg;
function mg() { if (!_mg) _mg = require('../memgraph.service'); return _mg; }

function toNum(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  return v?.low ?? v?.toNumber?.() ?? 0;
}

const IMPACT_WEIGHTS = {
  DEPENDS_ON:  1.0,
  IMPLEMENTS:  0.9,
  REQUIRES:    0.9,
  EXTENDS:     0.8,
  GOVERNED_BY: 0.8,
  USES:        0.7,
  PART_OF:     0.6,
  REFERENCES:  0.5,
  MENTIONS:    0.3,
  RELATED_TO:  0.2,
};

const DEPENDENCY_TYPES = Object.keys(IMPACT_WEIGHTS);

const ENTITY_CATEGORIES = {
  SYSTEM:       'systems',
  APPLICATION:  'systems',
  SERVICE:      'systems',
  COMPONENT:    'systems',
  DOCUMENT:     'documents',
  POLICY:       'policies',
  INSTRUCTION:  'policies',
  RESOLUTION:   'policies',
  REGULATION:   'policies',
  GUIDELINE:    'policies',
  ORGANIZATION: 'organizations',
  DEPARTMENT:   'organizations',
  BODY:         'organizations',
  PROCESS:      'processes',
  WORKFLOW:     'processes',
  PROCEDURE:    'processes',
};

class ImpactAnalysisService {

  async analyzeImpact(entityId, { maxDepth = 5, includeStructural = true } = {}) {
    // 1. Get target entity
    const entityRows = await mg().runQuery(
      `MATCH (e:ESEntity {id: $id})
       RETURN e.id AS id, e.name AS name, e.type AS type,
              e.namespace AS namespace, e.description AS description`,
      { id: entityId }
    );
    if (!entityRows.length) throw new Error(`Entity not found: ${entityId}`);
    const entity = entityRows[0];

    // 2. Direct dependents (incoming dependency edges)
    const directDependents = await this._getDirectDependents(entityId);

    // 3. Transitive dependents (2+ hops)
    const transitiveDependents = maxDepth >= 2
      ? await this._getTransitiveDependents(entityId, Math.min(maxDepth, 8))
      : [];

    // 4. Categorize by entity type
    const impactByCategory = this._categorizeImpact(directDependents, transitiveDependents);

    // 5. Structural analysis (no MAGE — pure Cypher approximation)
    const structuralAnalysis = includeStructural
      ? await this._analyzeStructural(entityId, directDependents)
      : null;

    // 6. Critical paths through this entity
    const criticalPaths = await this._findCriticalPaths(entityId, directDependents);

    // 7. Risk assessment
    const riskAssessment = this._calculateRisk(
      directDependents, transitiveDependents, structuralAnalysis, criticalPaths
    );

    // 8. Recommendations
    const recommendations = this._generateRecommendations(
      entity, directDependents, riskAssessment, impactByCategory
    );

    return {
      entity,
      directDependents,
      transitiveDependents,
      impactByCategory,
      structuralAnalysis,
      criticalPaths,
      riskAssessment,
      recommendations,
      summary: {
        headline:  this._headline(riskAssessment, entity),
        narrative: null,
      },
    };
  }

  // Return quick counts without full analysis (for Profile badge)
  async quickSummary(entityId) {
    const directRows = await mg().runQuery(
      `MATCH (dep:ESEntity)-[r:ES_RELATED_TO]->(t:ESEntity {id: $id})
       WHERE r.relType IN $types
       RETURN count(dep) AS cnt`,
      { id: entityId, types: DEPENDENCY_TYPES }
    );
    const directCount = toNum(directRows[0]?.cnt) || 0;

    const transitiveRows = await mg().runQuery(
      `MATCH (dep:ESEntity)-[:ES_RELATED_TO*2..4]->(t:ESEntity {id: $id})
       WHERE dep.id <> $id
       RETURN count(DISTINCT dep) AS cnt`,
      { id: entityId }
    );
    const transitiveCount = toNum(transitiveRows[0]?.cnt) || 0;

    const total = directCount + transitiveCount;
    const riskLevel = total >= 30 ? 'critical' : total >= 15 ? 'high' : total >= 5 ? 'medium' : 'low';

    return { directCount, transitiveCount, total, riskLevel };
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  async _getDirectDependents(entityId) {
    const rows = await mg().runQuery(
      `MATCH (dep:ESEntity)-[r:ES_RELATED_TO]->(t:ESEntity {id: $id})
       WHERE r.relType IN $types
       RETURN dep.id AS entityId, dep.name AS name, dep.type AS type,
              r.relType AS relType, r.context AS context, r.confidence AS confidence
       ORDER BY r.relType, dep.name`,
      { id: entityId, types: DEPENDENCY_TYPES }
    );
    return rows.map(r => ({
      entityId:     r.entityId,
      name:         r.name,
      type:         r.type,
      relType:      r.relType,
      context:      r.context    || null,
      confidence:   typeof r.confidence === 'number' ? r.confidence : (r.confidence?.low ?? null),
      impactWeight: IMPACT_WEIGHTS[r.relType] || 0.2,
    }));
  }

  async _getTransitiveDependents(entityId, maxDepth) {
    const rows = await mg().runQuery(
      `MATCH (dep:ESEntity)-[rels:ES_RELATED_TO*2..${maxDepth}]->(t:ESEntity {id: $id})
       WHERE dep.id <> $id
       AND ALL(r IN rels WHERE r.relType IN $types)
       WITH dep.id AS entityId, dep.name AS name, dep.type AS type,
            min(size(rels)) AS distance
       RETURN entityId, name, type, distance
       ORDER BY distance, name
       LIMIT 100`,
      { id: entityId, types: DEPENDENCY_TYPES }
    );
    return rows.map(r => ({
      entityId:         r.entityId,
      name:             r.name,
      type:             r.type,
      distance:         toNum(r.distance) || 2,
      cumulativeWeight: Math.pow(0.65, (toNum(r.distance) || 2) - 1),
    }));
  }

  async _analyzeStructural(entityId, directDependents) {
    // Degree counts
    const degRows = await mg().runQuery(
      `MATCH (e:ESEntity {id: $id})
       OPTIONAL MATCH (in_dep:ESEntity)-[r1:ES_RELATED_TO]->(e)
       OPTIONAL MATCH (e)-[r2:ES_RELATED_TO]->(out_dep:ESEntity)
       RETURN count(DISTINCT r1) AS inDegree, count(DISTINCT r2) AS outDegree`,
      { id: entityId }
    );
    const inDegree  = toNum(degRows[0]?.inDegree)  || 0;
    const outDegree = toNum(degRows[0]?.outDegree) || 0;

    // Estimate articulation: check if pairs of dependents have alt paths not through target
    const deps = directDependents.slice(0, 5);
    let criticalPairCount = 0;
    for (let i = 0; i + 1 < deps.length; i++) {
      try {
        const altRows = await mg().runQuery(
          `OPTIONAL MATCH altPath = shortestPath((a:ESEntity {id: $aId})-[:ES_RELATED_TO*1..6]-(b:ESEntity {id: $bId}))
           WHERE NONE(n IN nodes(altPath) WHERE n.id = $tid)
           RETURN altPath IS NOT NULL AS hasAlt`,
          { aId: deps[i].entityId, bId: deps[i + 1].entityId, tid: entityId }
        );
        if (!altRows[0]?.hasAlt) criticalPairCount++;
      } catch { /* skip */ }
    }

    const isArticulationPoint = deps.length >= 2 && criticalPairCount >= Math.ceil(deps.length / 2);
    const articulationScore   = deps.length >= 2
      ? Math.round(criticalPairCount / Math.max(deps.length - 1, 1) * 100) / 100
      : 0;

    return {
      isArticulationPoint,
      articulationScore,
      inDegree,
      outDegree,
      bridgeEdges:              [],
      componentsThatWouldSplit: isArticulationPoint ? 2 : 1,
      betweennessCentrality:    null,
    };
  }

  async _findCriticalPaths(entityId, directDependents) {
    const results = [];
    const deps = directDependents.slice(0, 4);
    for (const dep of deps) {
      try {
        const altRows = await mg().runQuery(
          `OPTIONAL MATCH altPath = shortestPath((dep:ESEntity {id: $depId})-[:ES_RELATED_TO*2..6]-(other:ESEntity {id: $tid}))
           WHERE NONE(n IN nodes(altPath) WHERE n.id = $depId OR n.id = $tid)
           RETURN altPath IS NOT NULL AS hasAlt`,
          { depId: dep.entityId, tid: entityId }
        );
        if (!altRows[0]?.hasAlt) {
          results.push({
            from:              { entityId: dep.entityId, name: dep.name },
            to:                { entityId, name: '' },
            pathThroughTarget: true,
            alternativePaths:  0,
          });
        }
      } catch { /* skip */ }
    }
    return results;
  }

  _categorizeImpact(direct, transitive) {
    const cats = { systems: [], documents: [], policies: [], organizations: [], processes: [], other: [] };
    const seen  = new Set();
    const all   = [
      ...direct.map(d => ({ ...d, distance: 1, impactWeight: d.impactWeight })),
      ...transitive,
    ];
    for (const d of all) {
      if (seen.has(d.entityId)) continue;
      seen.add(d.entityId);
      const cat = ENTITY_CATEGORIES[(d.type || '').toUpperCase()] || 'other';
      cats[cat].push({
        entityId:     d.entityId,
        name:         d.name,
        distance:     d.distance || 1,
        impactWeight: d.impactWeight || d.cumulativeWeight || 0.5,
      });
    }
    for (const cat of Object.keys(cats)) {
      cats[cat].sort((a, b) => b.impactWeight - a.impactWeight);
    }
    return cats;
  }

  _calculateRisk(direct, transitive, structural, criticalPaths) {
    const directCount    = direct.length;
    const transitiveCount= transitive.length;
    const totalCount     = directCount + transitiveCount;
    const maxDepth       = transitive.length > 0
      ? Math.max(...transitive.map(d => toNum(d.distance) || 2))
      : (directCount > 0 ? 1 : 0);
    const weightedScore  = direct.reduce((s, d) => s + d.impactWeight, 0)
      + transitive.reduce((s, d) => s + (d.cumulativeWeight || 0), 0);
    const criticalPCount = criticalPaths.filter(p => p.alternativePaths === 0).length;
    const isArticulation = structural?.isArticulationPoint || false;

    const riskFactors = [];
    let score = 0;

    if (directCount >= 10)       { score += 2; riskFactors.push(`${directCount} direct dependents`); }
    else if (directCount >= 5)   { score += 1; riskFactors.push(`${directCount} direct dependents`); }

    if (totalCount >= 30)        { score += 2; riskFactors.push(`${totalCount} total entities affected`); }
    else if (totalCount >= 15)   { score += 1; }

    if (isArticulation)          { score += 2; riskFactors.push('Articulation point — removal may disconnect graph'); }

    if (criticalPCount >= 3)     { score += 2; riskFactors.push(`${criticalPCount} paths with no alternative`); }
    else if (criticalPCount >= 1){ score += 1; riskFactors.push(`${criticalPCount} critical path`); }

    if (weightedScore >= 10)     { score += 1; riskFactors.push('High weighted impact score'); }

    const riskLevel = score >= 6 ? 'critical' : score >= 4 ? 'high' : score >= 2 ? 'medium' : 'low';

    return {
      directImpactCount:    directCount,
      transitiveImpactCount: transitiveCount,
      totalImpactCount:     totalCount,
      maxDepth,
      weightedImpactScore:  Math.round(weightedScore * 100) / 100,
      criticalPathCount:    criticalPCount,
      riskLevel,
      riskFactors,
    };
  }

  _generateRecommendations(entity, direct, risk, cats) {
    const recs     = [];
    const critDeps = direct.filter(d => d.impactWeight >= 0.8);

    if (critDeps.length) {
      recs.push({ type: 'review', priority: 'high',
        message: `Review ${critDeps.length} entities with critical dependencies before making changes`,
        affectedEntities: critDeps.map(d => d.entityId),
      });
    }
    if (cats.policies?.length) {
      recs.push({ type: 'notify', priority: 'high',
        message: `${cats.policies.length} policy document(s) reference this entity and may need updating`,
        affectedEntities: cats.policies.map(d => d.entityId),
      });
    }
    if (cats.systems?.length >= 3) {
      recs.push({ type: 'review', priority: 'medium',
        message: `${cats.systems.length} systems depend on this entity — coordinate with technical teams`,
        affectedEntities: cats.systems.map(d => d.entityId),
      });
    }
    if (risk.riskLevel === 'critical') {
      recs.push({ type: 'defer', priority: 'high',
        message: 'Consider deferring changes — conduct a formal impact review first',
        affectedEntities: [],
      });
    }
    return recs;
  }

  _headline(risk, entity) {
    const emoji = { low: '🟢', medium: '🟡', high: '🟠', critical: '🔴' };
    return `${emoji[risk.riskLevel]} ${risk.riskLevel.toUpperCase()} impact: ${risk.totalImpactCount} entities depend on "${entity.name}"`;
  }
}

const impactAnalysisService = new ImpactAnalysisService();
module.exports = { impactAnalysisService, ImpactAnalysisService };
