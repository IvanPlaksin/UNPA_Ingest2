'use strict';

const {
  RelationshipEndpointNotFoundError,
  SchemaValidationError,
} = require('../errors');

describe('RelationshipEndpointNotFoundError', () => {
  test('has correct name and code for SOURCE_NOT_FOUND', () => {
    const err = new RelationshipEndpointNotFoundError('SOURCE_NOT_FOUND', 'node-123', 'DEPENDS_ON');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('RelationshipEndpointNotFoundError');
    expect(err.code).toBe('SOURCE_NOT_FOUND');
    expect(err.missingId).toBe('node-123');
    expect(err.relType).toBe('DEPENDS_ON');
    expect(err.message).toContain('node-123');
    expect(err.message).toContain('SOURCE_NOT_FOUND');
  });

  test('has correct code for TARGET_NOT_FOUND', () => {
    const err = new RelationshipEndpointNotFoundError('TARGET_NOT_FOUND', 'node-456');
    expect(err.code).toBe('TARGET_NOT_FOUND');
    expect(err.missingId).toBe('node-456');
    expect(err.relType).toBeUndefined();
  });

  test('has correct code for BOTH_NOT_FOUND', () => {
    const err = new RelationshipEndpointNotFoundError('BOTH_NOT_FOUND', 'a, b', 'RELATES');
    expect(err.code).toBe('BOTH_NOT_FOUND');
    expect(err.message).toContain('BOTH_NOT_FOUND');
  });
});

describe('SchemaValidationError', () => {
  test('has correct name and stage', () => {
    const errors = [{ message: 'id is required' }];
    const err = new SchemaValidationError('BASE_SCHEMA', errors, 'BusinessRule');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('SchemaValidationError');
    expect(err.stage).toBe('BASE_SCHEMA');
    expect(err.validationErrors).toEqual(errors);
    expect(err.label).toBe('BusinessRule');
    expect(err.message).toContain('BASE_SCHEMA');
    expect(err.message).toContain('BusinessRule');
  });

  test('works without label', () => {
    const err = new SchemaValidationError('FINGERPRINT', []);
    expect(err.label).toBeUndefined();
    expect(err.message).toContain('FINGERPRINT');
  });
});
