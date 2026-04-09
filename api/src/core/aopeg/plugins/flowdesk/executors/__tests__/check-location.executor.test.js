'use strict';

const { CheckLocationExecutor } = require('../check-location.executor');

describe('CheckLocationExecutor', () => {
  let executor;

  beforeEach(() => {
    executor = new CheckLocationExecutor();
  });

  // ── Registration ──────────────────────────────────────────────

  test('has correct type and domain', () => {
    expect(executor.type).toBe('flowdesk.check_location');
    expect(executor.domain).toBe('flowdesk');
    expect(executor.displayName).toBe('Check Location');
  });

  test('parameterSchema declares userId, location, and dutyStation', () => {
    const props = executor.parameterSchema.properties;
    expect(props).toHaveProperty('userId');
    expect(props).toHaveProperty('location');
    expect(props).toHaveProperty('dutyStation');
  });

  // ── Silent operation (no user prompts) ────────────────────────

  test('returns result without response/prompt fields (silent node)', async () => {
    const result = await executor.execute({}, {});
    // BaseExecutor.success() returns { output, metadata, ... }
    expect(result).toBeDefined();
    expect(result.output).toBeDefined();
    // Silent: no "prompt" or "response" asking user for input
    expect(result.output.prompt).toBeUndefined();
    expect(result.output.response).toBeUndefined();
  });

  // ── Pre-set location parameter ────────────────────────────────

  test('returns has_location=true when location object is provided', async () => {
    const loc = { name: 'Geneva', country: 'Switzerland' };
    const result = await executor.execute({ location: loc }, {});
    expect(result.output.has_location).toBe(true);
    expect(result.output.location).toEqual(loc);
  });

  test('returns has_location=true when dutyStation string is provided', async () => {
    const result = await executor.execute({ dutyStation: 'Nairobi' }, {});
    expect(result.output.has_location).toBe(true);
    expect(result.output.location).toEqual({ name: 'Nairobi' });
  });

  test('returns has_location=true when duty_station (snake_case) is provided', async () => {
    const result = await executor.execute({ duty_station: 'Vienna' }, {});
    expect(result.output.has_location).toBe(true);
    expect(result.output.location).toEqual({ name: 'Vienna' });
  });

  test('location object takes precedence over dutyStation', async () => {
    const loc = { name: 'Rome', country: 'Italy' };
    const result = await executor.execute({ location: loc, dutyStation: 'Geneva' }, {});
    expect(result.output.location).toEqual(loc);
  });

  // ── No location fallback ──────────────────────────────────────

  test('returns has_location=false when no location data at all', async () => {
    const result = await executor.execute({}, {});
    expect(result.output.has_location).toBe(false);
    expect(result.output.location).toBeNull();
  });

  test('returns has_location=false with empty parameters', async () => {
    const result = await executor.execute({}, {});
    expect(result.output.has_location).toBe(false);
  });

  // ── Missing/invalid user profiles (graceful handling) ─────────

  test('handles undefined parameters gracefully', async () => {
    const result = await executor.execute(
      { userId: 'nonexistent-user-id' },
      { executionContext: { sharedState: new Map() } }
    );
    // Should not throw, should return a valid result
    expect(result).toBeDefined();
    expect(typeof result.output.has_location).toBe('boolean');
  });

  test('handles null location gracefully', async () => {
    const result = await executor.execute({ location: null }, {});
    expect(result.output.has_location).toBe(false);
    expect(result.output.location).toBeNull();
  });

  test('handles empty string dutyStation gracefully', async () => {
    const result = await executor.execute({ dutyStation: '' }, {});
    // Empty string is falsy → should fall through to no_location
    expect(result.output.has_location).toBe(false);
  });

  // ── Output schema compliance ──────────────────────────────────

  test('output always contains location and has_location fields', async () => {
    // With location
    const r1 = await executor.execute({ dutyStation: 'Bangkok' }, {});
    expect(r1.output).toHaveProperty('location');
    expect(r1.output).toHaveProperty('has_location');

    // Without location
    const r2 = await executor.execute({}, {});
    expect(r2.output).toHaveProperty('location');
    expect(r2.output).toHaveProperty('has_location');
  });

  test('has_location is always a boolean', async () => {
    const r1 = await executor.execute({ location: { name: 'X' } }, {});
    expect(typeof r1.output.has_location).toBe('boolean');

    const r2 = await executor.execute({}, {});
    expect(typeof r2.output.has_location).toBe('boolean');
  });
});
