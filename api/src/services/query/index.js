/**
 * Query Module
 */

const { QueryIntent, QueryOperation, ParsedQuery, ExecutionPlan, QueryResult } = require('./query-types');
const { QueryParser, createQueryParser, queryParser } = require('./query-parser');
const { QueryPlanner, createQueryPlanner, queryPlanner } = require('./query-planner');
const { QueryExecutor, createQueryExecutor, queryExecutor } = require('./query-executor');
const { AnswerGenerator, createAnswerGenerator, answerGenerator } = require('./answer-generator');
const { QueryEngine, createQueryEngine, queryEngine } = require('./query-engine');

module.exports = {
  // Types
  QueryIntent,
  QueryOperation,
  ParsedQuery,
  ExecutionPlan,
  QueryResult,

  // Parser
  QueryParser,
  createQueryParser,
  queryParser,

  // Planner
  QueryPlanner,
  createQueryPlanner,
  queryPlanner,

  // Executor
  QueryExecutor,
  createQueryExecutor,
  queryExecutor,

  // Answer Generator
  AnswerGenerator,
  createAnswerGenerator,
  answerGenerator,

  // Unified Query Engine
  QueryEngine,
  createQueryEngine,
  queryEngine
};
