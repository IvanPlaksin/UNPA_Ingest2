/**
 * Error thrown when a graph operation violates the type system.
 * Examples: executing a STRUCTURAL graph, running TEMPLATE without instantiation.
 */
class GraphTypeError extends Error {
  constructor(message, graphType = null, expectedTypes = null) {
    super(message);
    this.name = 'GraphTypeError';
    this.code = 'GRAPH_TYPE_ERROR';
    this.graphType = graphType;
    this.expectedTypes = expectedTypes;
  }
}

module.exports = { GraphTypeError };
