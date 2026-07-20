/**
 * UGP manifest build / parse / validate.
 *
 * The manifest is the package's self-description: selection criteria, boundary &
 * vector policies, per-collection selection (the ratified per-group checkbox
 * model), counts, embedding-model fingerprint and the identity-map version.
 */
const { UGP_VERSION, BOUNDARY_POLICY, VECTOR_POLICY } = require('../constants');

const BOUNDARY_VALUES = Object.values(BOUNDARY_POLICY);
const VECTOR_VALUES = Object.values(VECTOR_POLICY);
const SELECTION_MODES = ['NAMESPACE', 'LABELS', 'CYPHER', 'CATALOG_GRAPHS'];

/**
 * @param {object} options
 * @returns {object} manifest (contentHash filled in later, after files are written)
 */
function buildManifest(options = {}) {
    return {
        ugpVersion: UGP_VERSION,
        createdAt: options.createdAt || new Date().toISOString(),
        sourceInstanceId: options.sourceInstanceId || 'unknown',
        sourceMemgraphVersion: options.sourceMemgraphVersion || 'unknown',

        selection: {
            mode: options.selectionMode || null, // NAMESPACE | LABELS | CYPHER | CATALOG_GRAPHS
            namespacePrefixes: options.namespacePrefixes || [],
            labels: options.labels || [],
            cypher: options.cypher || null,
            graphIds: options.graphIds || [],
        },

        boundaryPolicy: options.boundaryPolicy || BOUNDARY_POLICY.STUB,

        // Per-collection vector selection (ratified: linked default-on, unlinked default-off,
        // user overrides each with a checkbox). Map of { collectionName: boolean }.
        vectorPolicy: options.vectorPolicy || VECTOR_POLICY.EMBED_POINTS,
        selectedCollections: options.selectedCollections || {},

        counts: {
            nodes: options.counts?.nodes || 0,
            relationships: options.counts?.relationships || 0,
            stubNodes: options.counts?.stubNodes || 0,
            vectorPoints: options.counts?.vectorPoints || {}, // { collection: count }
        },

        embedding: options.embedding || null, // { model, version, dims }
        identityMapVersion: options.identityMapVersion || '1.0',
        containsExecutableGraphs: options.containsExecutableGraphs === true,

        contentHash: options.contentHash || null,
    };
}

/**
 * @param {string} jsonString
 * @returns {object}
 */
function parseManifest(jsonString) {
    return JSON.parse(jsonString);
}

/**
 * Structural validation of a manifest.
 * @param {object} manifest
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateManifest(manifest) {
    const errors = [];

    if (!manifest || typeof manifest !== 'object') {
        return { valid: false, errors: ['manifest is not an object'] };
    }

    if (!manifest.ugpVersion) errors.push('Missing ugpVersion');
    if (!manifest.selection || !manifest.selection.mode) {
        errors.push('Missing selection.mode');
    } else if (!SELECTION_MODES.includes(manifest.selection.mode)) {
        errors.push(`Invalid selection.mode: ${manifest.selection.mode}`);
    }

    if (!manifest.boundaryPolicy) {
        errors.push('Missing boundaryPolicy');
    } else if (!BOUNDARY_VALUES.includes(manifest.boundaryPolicy)) {
        errors.push(`Invalid boundaryPolicy: ${manifest.boundaryPolicy}`);
    }

    if (manifest.vectorPolicy && !VECTOR_VALUES.includes(manifest.vectorPolicy)) {
        errors.push(`Invalid vectorPolicy: ${manifest.vectorPolicy}`);
    }

    if (typeof manifest.counts?.nodes !== 'number') errors.push('Missing counts.nodes');
    if (typeof manifest.counts?.relationships !== 'number') errors.push('Missing counts.relationships');

    return { valid: errors.length === 0, errors };
}

module.exports = { buildManifest, parseManifest, validateManifest, SELECTION_MODES };
