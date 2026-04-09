/**
 * Graph Metrics Module
 *
 * Exports all metrics-related functionality:
 * - Text2KGBench metrics for extraction quality evaluation
 * - Ontology schema for conformance checking
 *
 * @module services/graph/metrics
 */

'use strict';

const {
    Text2KGMetrics,
    createText2KGMetrics,
    text2kgMetrics,
    METRIC_WEIGHTS,
    GRADE_THRESHOLDS
} = require('./text2kg-metrics');

const {
    AOPEG_ONTOLOGY,
    validateTriple,
    validateEntity,
    getValidRelations,
    getValidSubjectTypes,
    getValidObjectTypes,
    isValidRelation,
    getOntologyStats,
    createCustomOntology
} = require('./ontology-schema');

const {
    HallucinationDetector,
    createHallucinationDetector,
    hallucinationDetector,
    DEFAULT_CONFIG: HALLUCINATION_CONFIG
} = require('./hallucination-detector');

const {
    GraphVerifier,
    createGraphVerifier,
    graphVerifier,
    DEFAULT_CONFIG: VERIFIER_CONFIG
} = require('./graph-verifier');

const {
    IterativeRefinementPipeline,
    createIterativeRefinementPipeline
} = require('./iterative-refinement');

const {
    OntologyConformanceChecker,
    createOntologyConformanceChecker,
    ontologyConformanceChecker,
    CARDINALITY_CONSTRAINTS,
    TRANSITIVE_RELATIONS,
    DEFAULT_CONFIG: CONFORMANCE_CONFIG
} = require('./ontology-conformance-checker');

module.exports = {
    // Text2KGBench Metrics
    Text2KGMetrics,
    createText2KGMetrics,
    text2kgMetrics,
    METRIC_WEIGHTS,
    GRADE_THRESHOLDS,

    // Ontology Schema
    AOPEG_ONTOLOGY,
    validateTriple,
    validateEntity,
    getValidRelations,
    getValidSubjectTypes,
    getValidObjectTypes,
    isValidRelation,
    getOntologyStats,
    createCustomOntology,

    // Hallucination Detection
    HallucinationDetector,
    createHallucinationDetector,
    hallucinationDetector,
    HALLUCINATION_CONFIG,

    // Graph Verifier (PiVe-pattern)
    GraphVerifier,
    createGraphVerifier,
    graphVerifier,
    VERIFIER_CONFIG,

    // Iterative Refinement Pipeline
    IterativeRefinementPipeline,
    createIterativeRefinementPipeline,

    // Ontology Conformance Checker
    OntologyConformanceChecker,
    createOntologyConformanceChecker,
    ontologyConformanceChecker,
    CARDINALITY_CONSTRAINTS,
    TRANSITIVE_RELATIONS,
    CONFORMANCE_CONFIG
};
