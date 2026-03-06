/**
 * MssqlTableClassifier
 *
 * Classifies SQL Server tables by type based on structural signals.
 * Used to determine the optimal sampling strategy for each table
 * in the agentic SQL knowledge extraction pipeline.
 *
 * Table types:
 *   reference  — lookup/dictionary tables (read fully)
 *   master     — core business entities (stratified sample)
 *   transaction — business operations (temporal sample)
 *   log        — audit/history/event tables (recent only)
 *   junction   — M:N relationship tables (structure only)
 *   unknown    — unclassified (exploratory sample)
 */

// ═══════════════════════════════════════════════════════════════════
// Classification Signals
// ═══════════════════════════════════════════════════════════════════

const CLASSIFICATION_SIGNALS = {
  // === REFERENCE TABLE SIGNALS ===
  LOW_ROW_COUNT: {
    weight: 0.25,
    check: (t) => t.rowCount > 0 && t.rowCount < 500,
    indicates: 'reference',
  },
  VERY_LOW_ROW_COUNT: {
    weight: 0.35,
    check: (t) => t.rowCount > 0 && t.rowCount < 50,
    indicates: 'reference',
  },
  HIGH_REFERENCE_COUNT: {
    weight: 0.30,
    check: (t) => t.fkReferenceCount >= 3,
    indicates: 'reference',
  },
  NAME_LOOKUP_PATTERN: {
    weight: 0.20,
    check: (t) =>
      /^(Lookup|Ref|Dict|Type|Status|Code|Category|Kind|Country|Currency|Language)/i.test(t.tableName) ||
      /(Type|Status|Code|Category|Kind|Countries|Currencies|Languages)$/i.test(t.tableName),
    indicates: 'reference',
  },
  FEW_COLUMNS: {
    weight: 0.15,
    check: (t) => t.columns.length <= 5,
    indicates: 'reference',
  },
  NO_MODIFIED_DATE: {
    weight: 0.10,
    check: (t) => !t.columns.some((c) => /modified|updated|changed/i.test(c.column_name || c.name)),
    indicates: 'reference',
  },

  // === MASTER DATA SIGNALS ===
  MEDIUM_ROW_COUNT: {
    weight: 0.20,
    check: (t) => t.rowCount >= 500 && t.rowCount < 100000,
    indicates: 'master',
  },
  MODERATE_REFERENCE_COUNT: {
    weight: 0.25,
    check: (t) => t.fkReferenceCount >= 1 && t.fkReferenceCount < 3,
    indicates: 'master',
  },
  NAME_MASTER_PATTERN: {
    weight: 0.20,
    check: (t) =>
      /^(Customer|Client|User|Account|Product|Employee|Vendor|Supplier|Partner|Organization|Company|Person|Contact|Asset|Item|Department|Project|Team)/i.test(t.tableName) ||
      /(Customers|Clients|Users|Accounts|Products|Employees|Vendors|Suppliers|Partners|Organizations|Companies|Persons|Contacts|Assets|Items|Departments|Projects|Teams)$/i.test(t.tableName),
    indicates: 'master',
  },
  HAS_NATURAL_KEY: {
    weight: 0.15,
    check: (t) => {
      const uqColumns = t.constraints
        .filter((c) => c.constraint_type === 'UNIQUE' || c.constraint_type === 'UQ')
        .flatMap((c) => (c.columns || '').split(',').map((s) => s.trim().toLowerCase()));
      return t.columns.some(
        (c) =>
          /^(code|number|email|sku|ssn|tax_id|identifier)/i.test(c.column_name || c.name) &&
          uqColumns.includes((c.column_name || c.name).toLowerCase()),
      );
    },
    indicates: 'master',
  },

  // === TRANSACTION SIGNALS ===
  HIGH_ROW_COUNT: {
    weight: 0.20,
    check: (t) => t.rowCount >= 100000 && t.rowCount < 10000000,
    indicates: 'transaction',
  },
  HAS_CREATED_DATE: {
    weight: 0.20,
    check: (t) =>
      t.columns.some(
        (c) =>
          /^(created|inserted|order_date|transaction_date|entry_date)/i.test(c.column_name || c.name) ||
          /(created_at|created_on|date_created|insert_date)$/i.test(c.column_name || c.name),
      ),
    indicates: 'transaction',
  },
  HAS_MODIFIED_DATE: {
    weight: 0.15,
    check: (t) => t.columns.some((c) => /modified|updated|changed/i.test(c.column_name || c.name)),
    indicates: 'transaction',
  },
  MULTIPLE_FK_OUTGOING: {
    weight: 0.25,
    check: (t) => t.fkDependencyCount >= 2,
    indicates: 'transaction',
  },
  NAME_TRANSACTION_PATTERN: {
    weight: 0.15,
    check: (t) =>
      /^(Order|Invoice|Payment|Transaction|Transfer|Booking|Reservation|Request|Application|Ticket|Case|Shipment|Delivery)/i.test(t.tableName) ||
      /(Orders|Invoices|Payments|Transactions|Transfers|Bookings|Reservations|Requests|Applications|Tickets|Cases|Shipments|Deliveries)$/i.test(t.tableName),
    indicates: 'transaction',
  },
  HAS_STATUS_COLUMN: {
    weight: 0.10,
    check: (t) => t.columns.some((c) => /status|state|stage|phase/i.test(c.column_name || c.name)),
    indicates: 'transaction',
  },

  // === LOG/AUDIT SIGNALS ===
  VERY_HIGH_ROW_COUNT: {
    weight: 0.30,
    check: (t) => t.rowCount >= 10000000,
    indicates: 'log',
  },
  NAME_LOG_PATTERN: {
    weight: 0.35,
    check: (t) =>
      /^(Log|Audit|History|Archive|Event|Trace|Activity|Change)/i.test(t.tableName) ||
      /(Log|Logs|Audit|History|Archive|Events|Traces|Activities|Changes)$/i.test(t.tableName),
    indicates: 'log',
  },
  HAS_TIMESTAMP_COLUMN: {
    weight: 0.20,
    check: (t) =>
      t.columns.some((c) => /timestamp|logged_at|event_time|occurred/i.test(c.column_name || c.name)),
    indicates: 'log',
  },
  LOW_FK_OUTGOING_HIGH_ROWS: {
    weight: 0.10,
    check: (t) => t.fkDependencyCount <= 1 && t.rowCount > 100000,
    indicates: 'log',
  },

  // === JUNCTION TABLE SIGNALS ===
  ONLY_FK_COLUMNS: {
    weight: 0.40,
    check: (t) => {
      const fkCols = t.constraints
        .filter((c) => (c.constraint_type || '').includes('FOREIGN'))
        .flatMap((c) => (c.columns || '').split(',').map((s) => s.trim().toLowerCase()));
      const pkCols = t.constraints
        .filter((c) => (c.constraint_type || '').includes('PRIMARY'))
        .flatMap((c) => (c.columns || '').split(',').map((s) => s.trim().toLowerCase()));
      const allKeyCols = new Set([...fkCols, ...pkCols]);
      return t.columns.length > 0 && t.columns.length <= allKeyCols.size + 2;
    },
    indicates: 'junction',
  },
  EXACTLY_TWO_FK: {
    weight: 0.35,
    check: (t) => t.fkDependencyCount === 2,
    indicates: 'junction',
  },
  COMPOSITE_PK_FROM_FK: {
    weight: 0.25,
    check: (t) => {
      const pk = t.constraints.find((c) => (c.constraint_type || '').includes('PRIMARY'));
      const fkCols = t.constraints
        .filter((c) => (c.constraint_type || '').includes('FOREIGN'))
        .flatMap((c) => (c.columns || '').split(',').map((s) => s.trim().toLowerCase()));
      if (!pk) return false;
      const pkCols = (pk.columns || '').split(',').map((s) => s.trim().toLowerCase());
      return pkCols.length >= 2 && pkCols.every((col) => fkCols.includes(col));
    },
    indicates: 'junction',
  },
  NAME_JUNCTION_PATTERN: {
    weight: 0.15,
    check: (t) =>
      /^(Map|Link|Rel|Xref|Bridge)/i.test(t.tableName) ||
      /_X_|_To_|Mapping|Association/i.test(t.tableName),
    indicates: 'junction',
  },
};

// ═══════════════════════════════════════════════════════════════════
// Sampling Strategies
// ═══════════════════════════════════════════════════════════════════

const SAMPLING_STRATEGIES = {
  reference: {
    method: 'FULL_READ',
    params: { limit: null },
    description: 'Full read — reference/lookup data (small tables)',
  },
  master: {
    method: 'STRATIFIED',
    params: {
      topN: 100,
      randomN: 100,
      recentN: 50,
      distinctEnums: true,
    },
    description: 'Stratified sampling of master data entities',
  },
  transaction: {
    method: 'TEMPORAL_STRATIFIED',
    params: {
      recentDays: 90,
      recentSample: 200,
      historicalSample: 100,
      aggregates: true,
    },
    description: 'Temporal stratification of transaction data',
  },
  log: {
    method: 'RECENT_ONLY',
    params: {
      recentDays: 30,
      sample: 100,
      aggregatesOnly: true,
    },
    description: 'Recent records + aggregates for log/audit tables',
  },
  junction: {
    method: 'STRUCTURE_ONLY',
    params: {
      sample: 50,
      countOnly: true,
    },
    description: 'Structural analysis of junction/bridge tables',
  },
  unknown: {
    method: 'EXPLORATORY',
    params: {
      sample: 100,
      analyzeDistribution: true,
    },
    description: 'Exploratory sample for unclassified tables',
  },
};

// ═══════════════════════════════════════════════════════════════════
// Classifier
// ═══════════════════════════════════════════════════════════════════

class MssqlTableClassifier {
  /**
   * Classify a single table based on structural signals.
   *
   * @param {Object} tableInfo
   * @param {string} tableInfo.schema        - Schema name
   * @param {string} tableInfo.tableName     - Table name
   * @param {Array}  tableInfo.columns       - Column metadata [{column_name, data_type, is_nullable, ...}]
   * @param {Array}  tableInfo.constraints   - Constraint metadata [{constraint_type, columns, ...}]
   * @param {number} tableInfo.rowCount      - Approximate row count
   * @param {number} tableInfo.fkReferenceCount  - How many other tables reference this one
   * @param {number} tableInfo.fkDependencyCount - How many FK this table has (outgoing)
   * @param {Array}  [tableInfo.indexes]     - Index metadata (optional)
   *
   * @returns {TableClassification}
   */
  classify(tableInfo) {
    const scores = { reference: 0, master: 0, transaction: 0, log: 0, junction: 0 };
    const matchedSignals = [];

    for (const [signalName, signal] of Object.entries(CLASSIFICATION_SIGNALS)) {
      let matched = false;
      try {
        matched = signal.check(tableInfo);
      } catch {
        matched = false;
      }

      matchedSignals.push({
        signal: signalName,
        weight: signal.weight,
        matched,
        indicates: signal.indicates,
      });

      if (matched) {
        scores[signal.indicates] += signal.weight;
      }
    }

    // Find the winning type
    const maxScore = Math.max(...Object.values(scores));
    let tableType = 'unknown';
    if (maxScore > 0.3) {
      tableType = Object.entries(scores).reduce((best, [type, score]) =>
        score > best[1] ? [type, score] : best, ['unknown', 0],
      )[0];
    }

    // Confidence = achieved score / max possible score for that type
    const maxPossible = this._maxPossibleScore(tableType);
    const confidence = maxPossible > 0 ? Math.min(maxScore / maxPossible, 1.0) : 0;

    return {
      schema: tableInfo.schema,
      tableName: tableInfo.tableName,
      tableType,
      confidence: Math.round(confidence * 100) / 100,
      scores,
      signals: matchedSignals.filter((s) => s.matched),
      samplingStrategy: { ...SAMPLING_STRATEGIES[tableType] },
      reasoning: this._generateReasoning(tableType, matchedSignals, tableInfo),
    };
  }

  /**
   * Classify all tables in a database and group by type.
   *
   * @param {Array<Object>} tables - Array of tableInfo objects
   * @returns {DatabaseClassification}
   */
  classifyDatabase(tables) {
    const results = tables.map((t) => this.classify(t));

    const grouped = { reference: [], master: [], transaction: [], log: [], junction: [], unknown: [] };
    for (const r of results) {
      grouped[r.tableType].push(r);
    }

    // Sort each group by confidence descending
    for (const type of Object.keys(grouped)) {
      grouped[type].sort((a, b) => b.confidence - a.confidence);
    }

    // Recommended processing order (master data first for context)
    const processingOrder = [
      ...grouped.reference.map((r) => ({ ...r, cycle: 1, cycleLabel: 'Master Data Extraction' })),
      ...grouped.master.map((r) => ({ ...r, cycle: 2, cycleLabel: 'Entity Discovery' })),
      ...grouped.junction.map((r) => ({ ...r, cycle: 3, cycleLabel: 'Relationship Inference' })),
      ...grouped.transaction.map((r) => ({ ...r, cycle: 4, cycleLabel: 'Transaction Analysis' })),
      ...grouped.log.map((r) => ({ ...r, cycle: 5, cycleLabel: 'Log/Audit Analysis' })),
      ...grouped.unknown.map((r) => ({ ...r, cycle: 6, cycleLabel: 'Exploratory Analysis' })),
    ];

    return {
      ...grouped,
      all: results,
      processingOrder,
      summary: {
        total: tables.length,
        reference: grouped.reference.length,
        master: grouped.master.length,
        transaction: grouped.transaction.length,
        log: grouped.log.length,
        junction: grouped.junction.length,
        unknown: grouped.unknown.length,
        avgConfidence: results.length
          ? Math.round((results.reduce((s, r) => s + r.confidence, 0) / results.length) * 100) / 100
          : 0,
      },
    };
  }

  /**
   * Build a tableInfo object from raw connector data.
   * Convenience method to normalize connector output into classifier input.
   *
   * @param {Object} raw
   * @param {Object} raw.tableInfo    - From connector.getTables()
   * @param {Array}  raw.columns      - From connector.getColumns()
   * @param {Array}  raw.constraints  - From connector.getConstraints()
   * @param {Array}  raw.allTables    - All tables (to compute fkReferenceCount)
   * @param {Array}  raw.allColumns   - All columns across all tables (optional, for FK counting)
   * @returns {Object} Normalized tableInfo for classify()
   */
  static buildTableInfo({ tableInfo, columns, constraints, allColumns }) {
    const tableName = tableInfo.table_name || tableInfo.tableName;
    const schema = tableInfo.schema_name || tableInfo.schema;
    const rowCount = tableInfo.row_count ?? tableInfo.rowCount ?? 0;

    // Count outgoing FKs
    const fkDependencyCount = constraints.filter(
      (c) => (c.constraint_type || '').includes('FOREIGN'),
    ).length;

    // Count incoming FKs (other tables referencing this one)
    let fkReferenceCount = 0;
    if (allColumns) {
      fkReferenceCount = allColumns.filter(
        (c) =>
          c.referenced_table &&
          c.referenced_table.toLowerCase() === tableName.toLowerCase() &&
          (c.referenced_schema || 'dbo').toLowerCase() === (schema || 'dbo').toLowerCase(),
      ).length;
    }

    return {
      schema,
      tableName,
      columns,
      constraints,
      rowCount,
      fkReferenceCount,
      fkDependencyCount,
    };
  }

  // ── Private helpers ──

  _maxPossibleScore(tableType) {
    let total = 0;
    for (const signal of Object.values(CLASSIFICATION_SIGNALS)) {
      if (signal.indicates === tableType) {
        total += signal.weight;
      }
    }
    return total;
  }

  _generateReasoning(tableType, signals, tableInfo) {
    const matched = signals.filter((s) => s.matched);
    if (!matched.length) {
      return `Table "${tableInfo.tableName}" has no strong classification signals → unknown`;
    }

    const top = matched
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 3)
      .map((s) => s.signal.replace(/_/g, ' ').toLowerCase());

    const typeLabels = {
      reference: 'reference/lookup',
      master: 'master data',
      transaction: 'transaction',
      log: 'log/audit',
      junction: 'junction/bridge',
      unknown: 'unclassified',
    };

    return `"${tableInfo.tableName}" classified as ${typeLabels[tableType]} (${matched.length} signals: ${top.join(', ')})`;
  }
}

module.exports = {
  MssqlTableClassifier,
  CLASSIFICATION_SIGNALS,
  SAMPLING_STRATEGIES,
};
