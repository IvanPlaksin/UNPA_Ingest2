const { MSSQLConnector } = require('../mssql.connector');
const { SYSTEM_SCHEMAS, BLOCKED_KEYWORDS, EXCLUDED_TABLES, SYSTEM_TABLE_PREFIXES } = require('../../../config/mssql.config');

describe('MSSQLConnector', () => {
  let connector;

  beforeEach(() => {
    connector = new MSSQLConnector();
  });

  afterEach(async () => {
    if (connector.pool) {
      try { await connector.disconnect(); } catch (_) { /* noop */ }
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // UNIT TESTS (no real connection)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Unit Tests', () => {
    test('should initialize with null pool', () => {
      expect(connector.pool).toBeNull();
      expect(connector.connectionName).toBeNull();
      expect(connector.serverInfo).toBeNull();
    });

    test('isConnected() should return false when not connected', async () => {
      const result = await connector.isConnected();
      expect(result).toBe(false);
    });

    test('getConnectionInfo() should return disconnected state', () => {
      const info = connector.getConnectionInfo();
      expect(info.connected).toBe(false);
      expect(info.connectionName).toBeNull();
    });

    test('_ensureConnected() should throw when not connected', () => {
      expect(() => connector._ensureConnected()).toThrow('Not connected');
    });

    test('_quotedList() should format array as SQL list', () => {
      const result = connector._quotedList(['a', 'b', 'c']);
      expect(result).toBe("'a','b','c'");
    });

    test('_quotedList() should handle empty array', () => {
      const result = connector._quotedList([]);
      expect(result).toBe('');
    });

    test('_excludeTableNamesCondition() should build correct SQL', () => {
      const condition = connector._excludeTableNamesCondition('t');
      // Should exclude system table prefixes
      for (const prefix of SYSTEM_TABLE_PREFIXES) {
        expect(condition).toContain(`t.name NOT LIKE '${prefix}%'`);
      }
      // Should exclude specific tables
      if (EXCLUDED_TABLES.length > 0) {
        expect(condition).toContain('NOT IN');
      }
    });

    test('getSchemas() should throw when not connected', async () => {
      await expect(connector.getSchemas()).rejects.toThrow('Not connected');
    });

    test('getTables() should throw when not connected', async () => {
      await expect(connector.getTables()).rejects.toThrow('Not connected');
    });

    test('getColumns() should throw when not connected', async () => {
      await expect(connector.getColumns('dbo', 'test')).rejects.toThrow('Not connected');
    });

    test('sampleData() should throw when not connected', async () => {
      await expect(connector.sampleData('dbo', 'test')).rejects.toThrow('Not connected');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // QUERY VALIDATION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Query Validation', () => {
    // Mock connected state so _ensureConnected passes
    beforeEach(() => {
      connector.pool = { connected: true };
    });

    test('should block INSERT queries', async () => {
      await expect(
        connector.executeReadOnlyQuery('INSERT INTO users VALUES (1)')
      ).rejects.toThrow('Blocked operation: INSERT');
    });

    test('should block UPDATE queries', async () => {
      await expect(
        connector.executeReadOnlyQuery('UPDATE users SET name = "test"')
      ).rejects.toThrow('Blocked operation: UPDATE');
    });

    test('should block DELETE queries', async () => {
      await expect(
        connector.executeReadOnlyQuery('DELETE FROM users')
      ).rejects.toThrow('Blocked operation: DELETE');
    });

    test('should block DROP queries', async () => {
      await expect(
        connector.executeReadOnlyQuery('DROP TABLE users')
      ).rejects.toThrow('Blocked operation: DROP');
    });

    test('should block TRUNCATE queries', async () => {
      await expect(
        connector.executeReadOnlyQuery('TRUNCATE TABLE users')
      ).rejects.toThrow('Blocked operation: TRUNCATE');
    });

    test('should block EXEC queries', async () => {
      await expect(
        connector.executeReadOnlyQuery('EXEC sp_dangerous')
      ).rejects.toThrow('Blocked operation: EXEC');
    });

    test('should block ALTER queries', async () => {
      await expect(
        connector.executeReadOnlyQuery('ALTER TABLE users ADD col INT')
      ).rejects.toThrow('Blocked operation: ALTER');
    });

    test('should block CREATE queries', async () => {
      await expect(
        connector.executeReadOnlyQuery('CREATE TABLE test (id INT)')
      ).rejects.toThrow('Blocked operation: CREATE');
    });

    test('should block GRANT queries', async () => {
      await expect(
        connector.executeReadOnlyQuery('GRANT SELECT ON dbo.users TO test_user')
      ).rejects.toThrow('Blocked operation: GRANT');
    });

    test('should block REVOKE queries', async () => {
      await expect(
        connector.executeReadOnlyQuery('REVOKE SELECT ON dbo.users FROM test_user')
      ).rejects.toThrow('Blocked operation: REVOKE');
    });

    test('should block case-insensitive DML', async () => {
      await expect(
        connector.executeReadOnlyQuery('insert into users values (1)')
      ).rejects.toThrow('Blocked operation: INSERT');
    });

    test('should block mixed-case DML', async () => {
      await expect(
        connector.executeReadOnlyQuery('InSeRt INTO users VALUES (1)')
      ).rejects.toThrow('Blocked operation: INSERT');
    });

    test('all BLOCKED_KEYWORDS should be present', () => {
      const expectedKeywords = [
        'INSERT', 'UPDATE', 'DELETE', 'DROP', 'TRUNCATE',
        'ALTER', 'CREATE', 'EXEC', 'EXECUTE', 'GRANT', 'REVOKE',
      ];
      for (const keyword of expectedKeywords) {
        expect(BLOCKED_KEYWORDS).toContain(keyword);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIG TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Config', () => {
    test('SYSTEM_SCHEMAS should include common system schemas', () => {
      expect(SYSTEM_SCHEMAS).toContain('sys');
      expect(SYSTEM_SCHEMAS).toContain('INFORMATION_SCHEMA');
      expect(SYSTEM_SCHEMAS).toContain('guest');
    });

    test('SYSTEM_SCHEMAS should not include dbo', () => {
      expect(SYSTEM_SCHEMAS).not.toContain('dbo');
    });

    test('BLOCKED_KEYWORDS should include DML operations', () => {
      expect(BLOCKED_KEYWORDS).toContain('INSERT');
      expect(BLOCKED_KEYWORDS).toContain('UPDATE');
      expect(BLOCKED_KEYWORDS).toContain('DELETE');
    });

    test('BLOCKED_KEYWORDS should include DDL operations', () => {
      expect(BLOCKED_KEYWORDS).toContain('CREATE');
      expect(BLOCKED_KEYWORDS).toContain('ALTER');
      expect(BLOCKED_KEYWORDS).toContain('DROP');
    });

    test('BLOCKED_KEYWORDS should include admin operations', () => {
      expect(BLOCKED_KEYWORDS).toContain('GRANT');
      expect(BLOCKED_KEYWORDS).toContain('REVOKE');
    });

    test('EXCLUDED_TABLES should include sysdiagrams', () => {
      expect(EXCLUDED_TABLES).toContain('sysdiagrams');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // INTEGRATION TESTS (require real SQL Server)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Integration Tests', () => {
    const MSSQL_TEST_SERVER = process.env.MSSQL_TEST_SERVER;
    const MSSQL_TEST_DATABASE = process.env.MSSQL_TEST_DATABASE;
    const MSSQL_TEST_USER = process.env.MSSQL_TEST_USER;
    const MSSQL_TEST_PASSWORD = process.env.MSSQL_TEST_PASSWORD;

    const skipIntegration = !MSSQL_TEST_SERVER || !MSSQL_TEST_DATABASE;
    const itIntegration = skipIntegration ? it.skip : it;

    if (skipIntegration) {
      it('skipped: set MSSQL_TEST_SERVER and MSSQL_TEST_DATABASE env vars', () => {
        expect(true).toBe(true);
      });
    }

    itIntegration('should connect to real SQL Server', async () => {
      const result = await connector.connect({
        server: MSSQL_TEST_SERVER,
        database: MSSQL_TEST_DATABASE,
        username: MSSQL_TEST_USER,
        password: MSSQL_TEST_PASSWORD,
        trustServerCertificate: true,
      });

      expect(result.success).toBe(true);
      expect(result.serverName).toBeTruthy();
      expect(result.databaseName).toBe(MSSQL_TEST_DATABASE);
    });

    itIntegration('should get schemas', async () => {
      await connector.connect({
        server: MSSQL_TEST_SERVER,
        database: MSSQL_TEST_DATABASE,
        username: MSSQL_TEST_USER,
        password: MSSQL_TEST_PASSWORD,
        trustServerCertificate: true,
      });

      const schemas = await connector.getSchemas();

      expect(Array.isArray(schemas)).toBe(true);
      expect(schemas.some(s => s.schema_name === 'dbo')).toBe(true);
      expect(schemas.some(s => s.schema_name === 'sys')).toBe(false);
    });

    itIntegration('should get tables', async () => {
      await connector.connect({
        server: MSSQL_TEST_SERVER,
        database: MSSQL_TEST_DATABASE,
        username: MSSQL_TEST_USER,
        password: MSSQL_TEST_PASSWORD,
        trustServerCertificate: true,
      });

      const tables = await connector.getTables({ schema: 'dbo' });

      expect(Array.isArray(tables)).toBe(true);
      if (tables.length > 0) {
        expect(tables[0]).toHaveProperty('schema_name');
        expect(tables[0]).toHaveProperty('table_name');
        expect(tables[0]).toHaveProperty('table_type');
      }
    });

    itIntegration('should execute SELECT query', async () => {
      await connector.connect({
        server: MSSQL_TEST_SERVER,
        database: MSSQL_TEST_DATABASE,
        username: MSSQL_TEST_USER,
        password: MSSQL_TEST_PASSWORD,
        trustServerCertificate: true,
      });

      const result = await connector.executeReadOnlyQuery('SELECT 1 as test');

      expect(result.columns).toContain('test');
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].test).toBe(1);
    });

    itIntegration('should disconnect cleanly', async () => {
      await connector.connect({
        server: MSSQL_TEST_SERVER,
        database: MSSQL_TEST_DATABASE,
        username: MSSQL_TEST_USER,
        password: MSSQL_TEST_PASSWORD,
        trustServerCertificate: true,
      });

      await connector.disconnect();

      expect(connector.pool).toBeNull();
      expect(await connector.isConnected()).toBe(false);
    });
  });
});
