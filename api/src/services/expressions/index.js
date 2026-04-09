/**
 * Predicate Expression Engine
 * CEL-inspired expression evaluator for form DisplayConditions and ValidationRules.
 */

const { PredicateEvaluator, PredicateError } = require('./predicate-evaluator');
const { BUILTIN_FUNCTIONS } = require('./functions');
const { Lexer, TokenType } = require('./lexer');
const { Parser, NodeType } = require('./parser');

module.exports = {
  PredicateEvaluator,
  PredicateError,
  BUILTIN_FUNCTIONS,
  // Low-level exports for advanced usage
  Lexer,
  TokenType,
  Parser,
  NodeType,
};
