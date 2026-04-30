/**
 * FlowDesk: Create Service Request
 *
 * Persists SR to Memgraph (primary) with in-memory cache fallback.
 * BACKLOG-0040: Fixed to use Memgraph instead of in-memory-only Map.
 */

const { BaseExecutor } = require('../../plugin-base');
const crypto = require('crypto');

// In-memory cache (fallback if Memgraph unavailable)
const serviceRequests = new Map();

// Lazy-load Memgraph
let _mg = null;
function mg() {
  if (!_mg) {
    try { _mg = require('../../../../../services/memgraph.service'); } catch(e) { console.warn('[FlowDesk] Memgraph require failed:', e.message); _mg = null; }
  }
  return _mg;
}

class CreateServiceRequestExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'flowdesk.create_service_request';
    this.displayName = 'Create Service Request';
    this.description = 'Create a new service request record in Memgraph';
    this.domain = 'flowdesk';
    this.parameterSchema = {
      type: 'object',
      properties: {
        userId: { type: 'string' },
        serviceCode: { type: 'string' },
        justification: { type: 'string' },
        initial_status: { type: 'string', default: 'PENDING_APPROVAL' },
        beneficiaryId: { type: 'string' },
        beneficiaryType: { type: 'string', default: 'self' },
        locationId: { type: 'string' },
        locationName: { type: 'string' },
        locationSource: { type: 'string' },
        locationCountry: { type: 'string' },
        configTier: { type: 'string' },
        approvalRequired: { type: 'boolean' },
      },
      required: ['userId', 'serviceCode'],
    };
  }

  static getRequest(id) { return serviceRequests.get(id); }
  static getAllRequests() { return [...serviceRequests.values()]; }

  async execute(parameters, context) {
    const srId = 'SR-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    const now = new Date().toISOString();

    const sr = {
      id: srId,
      serviceCode: this.getRequiredParam(parameters, 'serviceCode'),
      status: this.getParam(parameters, 'initial_status', 'PENDING_APPROVAL'),
      userId: this.getRequiredParam(parameters, 'userId'),
      beneficiaryId: this.getParam(parameters, 'beneficiaryId', parameters.userId),
      beneficiaryType: this.getParam(parameters, 'beneficiaryType', 'self'),
      locationId: this.getParam(parameters, 'locationId', ''),
      locationName: this.getParam(parameters, 'locationName', ''),
      locationSource: this.getParam(parameters, 'locationSource', ''),
      locationCountry: this.getParam(parameters, 'locationCountry', ''),
      configTier: this.getParam(parameters, 'configTier', 'standard'),
      approvalRequired: this.getParam(parameters, 'approvalRequired', false),
      justification: this.getParam(parameters, 'justification', ''),
      createdAt: now,
    };

    // Persist to Memgraph
    const memgraph = context?.executionContext?.memgraph || mg();
    if (memgraph) {
      try {
        await memgraph.executeQuery(`
          CREATE (sr:ServiceRequest {
            id: $id, catalog_code: $serviceCode, status: $status,
            requester_id: $userId, beneficiary_id: $beneficiaryId, beneficiary_type: $beneficiaryType,
            location_id: $locationId, location_name: $locationName,
            location_source: $locationSource, location_country: $locationCountry,
            config_tier: $configTier, approval_required: $approvalRequired,
            justification: $justification, namespace: "FLOWDESK", created_at: localDateTime()
          }) RETURN sr.id AS id
        `, sr);
        console.log(`[FlowDesk] SR created in Memgraph: ${srId} (${sr.serviceCode})`);
      } catch (err) {
        console.warn(`[FlowDesk] Memgraph write failed for SR ${srId}, using in-memory fallback:`, err.message);
      }
    }

    // Always cache in memory
    serviceRequests.set(srId, sr);

    return this.success({ requestId: srId, ...sr });
  }
}

module.exports = { CreateServiceRequestExecutor };
