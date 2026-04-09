/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SEED FLOWDESK CONFIGURATION
 * Extracts hardcoded business rules from executor code into KB (Memgraph).
 *
 * Sources:
 *   - check-sla.executor.js:11-16        → SLAConfig (4 nodes)
 *   - route-ticket.executor.js:12-20     → QueueMapping (8 nodes)
 *   - keyword-filter.js:12-102           → KeywordRule (91 EN rules)
 *   - classify-intent.executor.js:11-74  → ServiceCategory (64 nodes)
 *   - flowdesk.controller.js             → DomainCode (8 nodes)
 *   - classify-intent.executor.js        → ConfidenceThreshold (3 nodes)
 *   - graph-routing.js:101-112           → ScopeRule (3 nodes)
 *
 * Run: node api/scripts/seed-flowdesk-config.js [--dry-run]
 * ═══════════════════════════════════════════════════════════════════════════
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const memgraphService = require('../src/services/memgraph.service');

const DRY_RUN = process.argv.includes('--dry-run');

// ────────────────────────────────────────────────────────────────────────────
// DATA: Extracted from hardcoded sources
// ────────────────────────────────────────────────────────────────────────────

const SLA_CONFIGS = [
  { priority: 'critical', responseHours: 1,  resolutionHours: 4,   escalationHours: 2 },
  { priority: 'high',     responseHours: 4,  resolutionHours: 24,  escalationHours: 8 },
  { priority: 'medium',   responseHours: 8,  resolutionHours: 48,  escalationHours: 24 },
  { priority: 'low',      responseHours: 24, resolutionHours: 168, escalationHours: 72 },
];

const QUEUE_MAPPINGS = [
  { queueCode: 'IT-HW',      teamName: 'hardware-support',  description: 'IT Hardware Support' },
  { queueCode: 'IT-SW',      teamName: 'software-support',  description: 'IT Software Support' },
  { queueCode: 'IT-NET',     teamName: 'network-ops',       description: 'Network Operations' },
  { queueCode: 'IT-SEC',     teamName: 'security-team',     description: 'IT Security Team' },
  { queueCode: 'IT-ACC',     teamName: 'access-mgmt',       description: 'Access Management' },
  { queueCode: 'HR',         teamName: 'hr-services',       description: 'HR Services' },
  { queueCode: 'FACILITIES', teamName: 'facilities-mgmt',   description: 'Facilities Management' },
  { queueCode: 'GENERAL',    teamName: 'general-support',   description: 'General Support' },
];

const DOMAIN_CODES = [
  { code: 'IT',  name: 'Information Technology',  color: '#3b82f6' },
  { code: 'HR',  name: 'Human Resources',         color: '#a855f7' },
  { code: 'FAC', name: 'Facilities',              color: '#22c55e' },
  { code: 'FIN', name: 'Finance',                 color: '#f59e0b' },
  { code: 'SEC', name: 'Security',                color: '#ef4444' },
  { code: 'COM', name: 'Communications',           color: '#06b6d4' },
  { code: 'LOG', name: 'Logistics',               color: '#f97316' },
  { code: 'LEG', name: 'Legal',                   color: '#64748b' },
];

const CONFIDENCE_THRESHOLDS = [
  { classifierLevel: 'L1', highThreshold: 0.95, mediumThreshold: null, lowThreshold: null },
  { classifierLevel: 'L2', highThreshold: 0.80, mediumThreshold: 0.55, lowThreshold: 0.55 },
  { classifierLevel: 'L3', highThreshold: 0.50, mediumThreshold: null, lowThreshold: null },
];

const SCOPE_RULES = [
  { scopeType: 'mission',  priority: 1, matchField: 'dutyStation', description: 'Mission-specific handler (highest priority)' },
  { scopeType: 'regional', priority: 2, matchField: 'region',      description: 'Regional handler (second priority)' },
  { scopeType: 'global',   priority: 3, matchField: '*',           description: 'Global handler (fallback)' },
];

// Service categories from classify-intent.executor.js (EN only)
const SERVICE_CATEGORIES = [
  { code: 'IT-HW-LAP',   name: 'Laptop / Notebook request', parentCode: 'IT-HW', level: 3 },
  { code: 'IT-HW-DSK',   name: 'Desktop computer request', parentCode: 'IT-HW', level: 3 },
  { code: 'IT-HW-MON',   name: 'Monitor / Screen request', parentCode: 'IT-HW', level: 3 },
  { code: 'IT-HW-PRT',   name: 'Printer request', parentCode: 'IT-HW', level: 3 },
  { code: 'IT-HW-PER',   name: 'Peripherals (keyboard, mouse, headset, webcam)', parentCode: 'IT-HW', level: 3 },
  { code: 'IT-HW-REP',   name: 'Hardware repair', parentCode: 'IT-HW', level: 3 },
  { code: 'IT-SW-INS',   name: 'Software installation', parentCode: 'IT-SW', level: 3 },
  { code: 'IT-SW-LIC',   name: 'Software license', parentCode: 'IT-SW', level: 3 },
  { code: 'IT-SW-NEW',   name: 'New software request', parentCode: 'IT-SW', level: 3 },
  { code: 'IT-SW-ISS',   name: 'Software issue / bug', parentCode: 'IT-SW', level: 3 },
  { code: 'IT-NET-VPN',  name: 'VPN access', parentCode: 'IT-NET', level: 3 },
  { code: 'IT-NET-WIFI', name: 'WiFi / Wireless', parentCode: 'IT-NET', level: 3 },
  { code: 'IT-NET-ISS',  name: 'Network issue', parentCode: 'IT-NET', level: 3 },
  { code: 'IT-NET-DRV',  name: 'Shared / Network drive', parentCode: 'IT-NET', level: 3 },
  { code: 'IT-SEC-PWD',  name: 'Password reset', parentCode: 'IT-SEC', level: 3 },
  { code: 'IT-SEC-UNL',  name: 'Unlock account', parentCode: 'IT-SEC', level: 3 },
  { code: 'IT-SEC-MFA',  name: 'MFA / Two-factor setup', parentCode: 'IT-SEC', level: 3 },
  { code: 'IT-SEC-INC',  name: 'Security incident', parentCode: 'IT-SEC', level: 3 },
  { code: 'IT-SEC-SYS',  name: 'System access request', parentCode: 'IT-SEC', level: 3 },
  { code: 'IT-COL-DL',   name: 'Distribution / Mailing list', parentCode: 'IT-COL', level: 3 },
  { code: 'IT-COL-SMB',  name: 'Shared mailbox', parentCode: 'IT-COL', level: 3 },
  { code: 'IT-COL-SP',   name: 'SharePoint site', parentCode: 'IT-COL', level: 3 },
  { code: 'IT-COL-TMS',  name: 'MS Teams channel / group', parentCode: 'IT-COL', level: 3 },
  { code: 'IT-COL-VID',  name: 'Video conferencing', parentCode: 'IT-COL', level: 3 },
  { code: 'HR-BEN-LEV',  name: 'Leave request / Annual leave', parentCode: 'HR-BEN', level: 3 },
  { code: 'HR-BEN-CLM',  name: 'Insurance claim', parentCode: 'HR-BEN', level: 3 },
  { code: 'HR-BEN-ENR',  name: 'Benefits enrollment', parentCode: 'HR-BEN', level: 3 },
  { code: 'HR-BEN-INQ',  name: 'Benefits inquiry', parentCode: 'HR-BEN', level: 3 },
  { code: 'HR-LD-TRN',   name: 'Training request', parentCode: 'HR-LD', level: 3 },
  { code: 'HR-LD-CRT',   name: 'Certification', parentCode: 'HR-LD', level: 3 },
  { code: 'HR-LD-CNF',   name: 'Conference attendance', parentCode: 'HR-LD', level: 3 },
  { code: 'HR-ONB-NEW',  name: 'New employee onboarding', parentCode: 'HR-ONB', level: 3 },
  { code: 'HR-ONB-OFF',  name: 'Offboarding / Employee departure', parentCode: 'HR-ONB', level: 3 },
  { code: 'HR-ONB-TRF',  name: 'Internal transfer', parentCode: 'HR-ONB', level: 3 },
  { code: 'HR-ONB-CON',  name: 'Contractor onboarding', parentCode: 'HR-ONB', level: 3 },
  { code: 'SEC-ACC-BDG', name: 'Badge / Access card', parentCode: 'SEC-ACC', level: 3 },
  { code: 'SEC-ACC-VIS', name: 'Visitor registration / badge', parentCode: 'SEC-ACC', level: 3 },
  { code: 'SEC-ACC-AFT', name: 'After-hours access', parentCode: 'SEC-ACC', level: 3 },
  { code: 'SEC-ACC-PRM', name: 'Access permission', parentCode: 'SEC-ACC', level: 3 },
  { code: 'FAC-CNF-RM',  name: 'Meeting room booking', parentCode: 'FAC-CNF', level: 3 },
  { code: 'FAC-CNF-EVT', name: 'Event space booking', parentCode: 'FAC-CNF', level: 3 },
  { code: 'FAC-CNF-AV',  name: 'AV equipment', parentCode: 'FAC-CNF', level: 3 },
  { code: 'FAC-BLD-HVAC',name: 'Air conditioning / HVAC', parentCode: 'FAC-BLD', level: 3 },
  { code: 'FAC-BLD-LGT', name: 'Lighting issue', parentCode: 'FAC-BLD', level: 3 },
  { code: 'FAC-BLD-CLN', name: 'Cleaning request', parentCode: 'FAC-BLD', level: 3 },
  { code: 'FAC-BLD-MNT', name: 'Maintenance request', parentCode: 'FAC-BLD', level: 3 },
  { code: 'FAC-BLD-FRN', name: 'Furniture request', parentCode: 'FAC-BLD', level: 3 },
  { code: 'FAC-WS-HOT',  name: 'Hot desk / Flexible workspace', parentCode: 'FAC-WS', level: 3 },
  { code: 'FAC-WS-OFC',  name: 'Office allocation', parentCode: 'FAC-WS', level: 3 },
  { code: 'FAC-TRV-AUTH', name: 'Travel authorization', parentCode: 'FAC-TRV', level: 3 },
  { code: 'FAC-TRV-FLT', name: 'Flight booking', parentCode: 'FAC-TRV', level: 3 },
  { code: 'FAC-TRV-HTL', name: 'Hotel booking', parentCode: 'FAC-TRV', level: 3 },
  { code: 'FAC-TRV-VIS', name: 'Visa support', parentCode: 'FAC-TRV', level: 3 },
  { code: 'FAC-TRV-EXP', name: 'Travel expense', parentCode: 'FAC-TRV', level: 3 },
  { code: 'FIN-AP-EXP',  name: 'Expense reimbursement', parentCode: 'FIN-AP', level: 3 },
  { code: 'FIN-AP-INV',  name: 'Invoice submission', parentCode: 'FIN-AP', level: 3 },
  { code: 'FIN-AP-STS',  name: 'Payment status', parentCode: 'FIN-AP', level: 3 },
  { code: 'FIN-PR-REQ',  name: 'Purchase request', parentCode: 'FIN-PR', level: 3 },
  { code: 'LOG-INV-SUP', name: 'Office supplies', parentCode: 'LOG-INV', level: 3 },
  { code: 'LOG-SHP-COR', name: 'Courier service', parentCode: 'LOG-SHP', level: 3 },
  { code: 'COM-CRE-DES', name: 'Graphic design', parentCode: 'COM-CRE', level: 3 },
  { code: 'COM-CRE-VID', name: 'Video production', parentCode: 'COM-CRE', level: 3 },
  // L2 parent categories (groups)
  { code: 'IT-HW',  name: 'IT Hardware',       parentCode: 'IT', level: 2 },
  { code: 'IT-SW',  name: 'IT Software',       parentCode: 'IT', level: 2 },
  { code: 'IT-NET', name: 'IT Network',        parentCode: 'IT', level: 2 },
  { code: 'IT-SEC', name: 'IT Security',       parentCode: 'IT', level: 2 },
  { code: 'IT-COL', name: 'IT Collaboration',  parentCode: 'IT', level: 2 },
  { code: 'HR-BEN', name: 'HR Benefits',       parentCode: 'HR', level: 2 },
  { code: 'HR-LD',  name: 'HR Learning',       parentCode: 'HR', level: 2 },
  { code: 'HR-ONB', name: 'HR Onboarding',     parentCode: 'HR', level: 2 },
  { code: 'SEC-ACC',name: 'Physical Security',  parentCode: 'SEC', level: 2 },
  { code: 'FAC-CNF',name: 'Conference & Events',parentCode: 'FAC', level: 2 },
  { code: 'FAC-BLD',name: 'Building Services',  parentCode: 'FAC', level: 2 },
  { code: 'FAC-WS', name: 'Workspace',          parentCode: 'FAC', level: 2 },
  { code: 'FAC-TRV',name: 'Travel',             parentCode: 'FAC', level: 2 },
  { code: 'FIN-AP', name: 'Accounts Payable',   parentCode: 'FIN', level: 2 },
  { code: 'FIN-PR', name: 'Procurement',        parentCode: 'FIN', level: 2 },
  { code: 'LOG-INV',name: 'Inventory',          parentCode: 'LOG', level: 2 },
  { code: 'LOG-SHP',name: 'Shipping',           parentCode: 'LOG', level: 2 },
  { code: 'COM-CRE',name: 'Creative Services',  parentCode: 'COM', level: 2 },
];

// EN-only keyword rules (regex → service code)
const KEYWORD_RULES_EN = [
  { pattern: '\\b(password\\s*reset|reset\\s*password|forgot\\s*password)\\b', category: 'IT-SEC-PWD', priority: 10 },
  { pattern: '\\b(unlock\\s*account|account\\s*locked)\\b', category: 'IT-SEC-UNL', priority: 10 },
  { pattern: '\\b(mfa\\s*setup|mfa\\s*reset|two\\s*factor|authenticator)\\b', category: 'IT-SEC-MFA', priority: 10 },
  { pattern: '\\b(security\\s*incident|breach|phishing)\\b', category: 'IT-SEC-INC', priority: 10 },
  { pattern: '\\b(system\\s*access\\s*request|access\\s*to\\s*system)\\b', category: 'IT-SEC-SYS', priority: 5 },
  { pattern: '\\b(laptop|notebook)\\b', category: 'IT-HW-LAP', priority: 10 },
  { pattern: '\\b(desktop\\s*(computer|pc|request))\\b', category: 'IT-HW-DSK', priority: 10 },
  { pattern: '\\b(monitor|screen)\\b', category: 'IT-HW-MON', priority: 8 },
  { pattern: '\\b(printer)\\b', category: 'IT-HW-PRT', priority: 10 },
  { pattern: '\\b(keyboard|mouse|headset|webcam|peripher)\\b', category: 'IT-HW-PER', priority: 8 },
  { pattern: '\\b(hardware\\s*repair|broken\\s*hardware)\\b', category: 'IT-HW-REP', priority: 8 },
  { pattern: '\\b(vpn\\s*access|vpn\\s*request)\\b', category: 'IT-NET-VPN', priority: 10 },
  { pattern: '\\b(wifi|wi-fi|wireless)\\b', category: 'IT-NET-WIFI', priority: 10 },
  { pattern: '\\b(network\\s*(issue|problem|down))\\b', category: 'IT-NET-ISS', priority: 8 },
  { pattern: '\\b(shared\\s*drive|network\\s*drive)\\b', category: 'IT-NET-DRV', priority: 8 },
  { pattern: '\\b(install\\s*software|software\\s*install)\\b', category: 'IT-SW-INS', priority: 8 },
  { pattern: '\\b(software\\s*license)\\b', category: 'IT-SW-LIC', priority: 8 },
  { pattern: '\\b(new\\s*software\\s*request|request\\s*new\\s*software)\\b', category: 'IT-SW-NEW', priority: 5 },
  { pattern: '\\b(software\\s*(issue|problem|crash|bug|error))\\b', category: 'IT-SW-ISS', priority: 8 },
  { pattern: '\\b(distribution\\s*list|mailing\\s*list)\\b', category: 'IT-COL-DL', priority: 8 },
  { pattern: '\\b(shared\\s*mailbox)\\b', category: 'IT-COL-SMB', priority: 8 },
  { pattern: '\\b(sharepoint\\s*site|sharepoint\\s*request)\\b', category: 'IT-COL-SP', priority: 8 },
  { pattern: '\\b(teams\\s*(channel|request|group)|ms\\s*teams)\\b', category: 'IT-COL-TMS', priority: 8 },
  { pattern: '\\b(video\\s*conference)\\b', category: 'IT-COL-VID', priority: 8 },
  { pattern: '\\b(leave\\s*request|annual\\s*leave)\\b', category: 'HR-BEN-LEV', priority: 10 },
  { pattern: '\\b(insurance\\s*claim)\\b', category: 'HR-BEN-CLM', priority: 8 },
  { pattern: '\\b(benefits?\\s*enrol|enrollment)\\b', category: 'HR-BEN-ENR', priority: 5 },
  { pattern: '\\b(benefits?\\s*(inquiry|question))\\b', category: 'HR-BEN-INQ', priority: 5 },
  { pattern: '\\b(training\\s*request)\\b', category: 'HR-LD-TRN', priority: 8 },
  { pattern: '\\b(certification)\\b', category: 'HR-LD-CRT', priority: 5 },
  { pattern: '\\b(conference\\s*attendance)\\b', category: 'HR-LD-CNF', priority: 5 },
  { pattern: '\\b(new\\s*employee\\s*setup|onboarding)\\b', category: 'HR-ONB-NEW', priority: 8 },
  { pattern: '\\b(offboarding|employee\\s*departure)\\b', category: 'HR-ONB-OFF', priority: 8 },
  { pattern: '\\b(internal\\s*transfer)\\b', category: 'HR-ONB-TRF', priority: 5 },
  { pattern: '\\b(contractor\\s*onboarding|onboard\\s*contractor)\\b', category: 'HR-ONB-CON', priority: 5 },
  { pattern: '\\b(badge|access\\s*card)\\b', category: 'SEC-ACC-BDG', priority: 10 },
  { pattern: '\\b(visitor\\s*(registration|badge|pass))\\b', category: 'SEC-ACC-VIS', priority: 8 },
  { pattern: '\\b(after.hours\\s*access)\\b', category: 'SEC-ACC-AFT', priority: 5 },
  { pattern: '\\b(access\\s*permission)\\b', category: 'SEC-ACC-PRM', priority: 5 },
  { pattern: '\\b(meeting\\s*room|book\\s*room|conference\\s*room\\s*book)\\b', category: 'FAC-CNF-RM', priority: 10 },
  { pattern: '\\b(event\\s*space|book\\s*event)\\b', category: 'FAC-CNF-EVT', priority: 8 },
  { pattern: '\\b(av\\s*equipment|audio\\s*visual)\\b', category: 'FAC-CNF-AV', priority: 8 },
  { pattern: '\\b(air\\s*condition|hvac|ac\\s*(not\\s*working|broken))\\b', category: 'FAC-BLD-HVAC', priority: 8 },
  { pattern: '\\b(light(s|ing)\\s*(issue|broken|flickering))\\b', category: 'FAC-BLD-LGT', priority: 5 },
  { pattern: '\\b(cleaning\\s*request)\\b', category: 'FAC-BLD-CLN', priority: 5 },
  { pattern: '\\b(maintenance\\s*request)\\b', category: 'FAC-BLD-MNT', priority: 5 },
  { pattern: '\\b(furniture)\\b', category: 'FAC-BLD-FRN', priority: 5 },
  { pattern: '\\b(hot\\s*desk|hotdesk)\\b', category: 'FAC-WS-HOT', priority: 8 },
  { pattern: '\\b(office\\s*allocation)\\b', category: 'FAC-WS-OFC', priority: 5 },
  { pattern: '\\b(travel\\s*authorization)\\b', category: 'FAC-TRV-AUTH', priority: 8 },
  { pattern: '\\b(flight\\s*book|book\\s*flight)\\b', category: 'FAC-TRV-FLT', priority: 8 },
  { pattern: '\\b(hotel\\s*book|book\\s*hotel)\\b', category: 'FAC-TRV-HTL', priority: 8 },
  { pattern: '\\b(visa\\s*support|visa\\s*request)\\b', category: 'FAC-TRV-VIS', priority: 8 },
  { pattern: '\\b(travel\\s*expense|expense\\s*claim)\\b', category: 'FAC-TRV-EXP', priority: 8 },
  { pattern: '\\b(expense\\s*reimburse|reimburse\\s*expense)\\b', category: 'FIN-AP-EXP', priority: 8 },
  { pattern: '\\b(invoice\\s*submit|submit\\s*invoice)\\b', category: 'FIN-AP-INV', priority: 8 },
  { pattern: '\\b(payment\\s*status)\\b', category: 'FIN-AP-STS', priority: 5 },
  { pattern: '\\b(purchase\\s*request)\\b', category: 'FIN-PR-REQ', priority: 8 },
  { pattern: '\\b(office\\s*supplies)\\b', category: 'LOG-INV-SUP', priority: 8 },
  { pattern: '\\b(courier)\\b', category: 'LOG-SHP-COR', priority: 5 },
  { pattern: '\\b(graphic\\s*design)\\b', category: 'COM-CRE-DES', priority: 5 },
  { pattern: '\\b(video\\s*production)\\b', category: 'COM-CRE-VID', priority: 5 },
];

// ────────────────────────────────────────────────────────────────────────────
// SEED FUNCTIONS
// ────────────────────────────────────────────────────────────────────────────

async function seedConfigNodes(label, data, propBuilder) {
  let created = 0;
  for (const item of data) {
    const props = propBuilder(item);
    const propsStr = Object.entries(props)
      .map(([k, v]) => `${k}: $${k}`)
      .join(', ');

    const cypher = `MERGE (n:${label} {id: $id}) ON CREATE SET ${propsStr}, n.createdAt = datetime() ON MATCH SET ${propsStr}, n.updatedAt = datetime()`;

    if (DRY_RUN) {
      console.log(`  [DRY] ${label} ${props.id}`);
    } else {
      try {
        await memgraphService.executeQuery(cypher, props);
        created++;
      } catch (e) {
        console.error(`  ✗ ${label} ${props.id}: ${e.message}`);
      }
    }
  }
  return created;
}

// ────────────────────────────────────────────────────────────────────────────
// MAIN
// ────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n═══ Seed FlowDesk Configuration ${DRY_RUN ? '(DRY RUN)' : ''} ═══\n`);

  // SLA Configs
  console.log('SLA Configs...');
  const slaCount = await seedConfigNodes('SLAConfig', SLA_CONFIGS, item => ({
    id: `sla-${item.priority}`,
    priority: item.priority,
    responseHours: item.responseHours,
    resolutionHours: item.resolutionHours,
    escalationHours: item.escalationHours,
    businessHoursOnly: false,
    namespace: 'CORE',
  }));
  console.log(`  ✓ ${slaCount} SLA configs`);

  // Queue Mappings
  console.log('Queue Mappings...');
  const queueCount = await seedConfigNodes('QueueMapping', QUEUE_MAPPINGS, item => ({
    id: `queue-${item.queueCode.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
    queueCode: item.queueCode,
    teamName: item.teamName,
    description: item.description,
    isActive: true,
    namespace: 'CORE',
  }));
  console.log(`  ✓ ${queueCount} queue mappings`);

  // Domain Codes
  console.log('Domain Codes...');
  const domainCount = await seedConfigNodes('DomainCode', DOMAIN_CODES, item => ({
    id: `domain-${item.code.toLowerCase()}`,
    code: item.code,
    name: item.name,
    color: item.color,
    isActive: true,
    namespace: 'CORE',
  }));
  console.log(`  ✓ ${domainCount} domain codes`);

  // Confidence Thresholds
  console.log('Confidence Thresholds...');
  const threshCount = await seedConfigNodes('ConfidenceThreshold', CONFIDENCE_THRESHOLDS, item => ({
    id: `threshold-${item.classifierLevel.toLowerCase()}`,
    classifierLevel: item.classifierLevel,
    highThreshold: item.highThreshold,
    mediumThreshold: item.mediumThreshold ?? -1,
    lowThreshold: item.lowThreshold ?? -1,
    namespace: 'CORE',
  }));
  console.log(`  ✓ ${threshCount} confidence thresholds`);

  // Scope Rules
  console.log('Scope Rules...');
  const scopeCount = await seedConfigNodes('ScopeRule', SCOPE_RULES, item => ({
    id: `scope-${item.scopeType}`,
    scopeType: item.scopeType,
    priority: item.priority,
    matchField: item.matchField,
    description: item.description,
    namespace: 'CORE',
  }));
  console.log(`  ✓ ${scopeCount} scope rules`);

  // Service Categories
  console.log('Service Categories...');
  const catCount = await seedConfigNodes('ServiceCategory', SERVICE_CATEGORIES, item => ({
    id: `svccat-${item.code.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
    code: item.code,
    name: item.name,
    parentCode: item.parentCode || '',
    level: item.level,
    isActive: true,
    namespace: 'CORE',
  }));
  console.log(`  ✓ ${catCount} service categories`);

  // Keyword Rules (EN only)
  console.log('Keyword Rules (EN)...');
  const kwCount = await seedConfigNodes('KeywordRule', KEYWORD_RULES_EN, (item, idx) => ({
    id: `kwrule-en-${(KEYWORD_RULES_EN.indexOf(item) + 1).toString().padStart(3, '0')}`,
    pattern: item.pattern,
    category: item.category,
    language: 'en',
    priority: item.priority,
    isActive: true,
    namespace: 'CORE',
  }));
  console.log(`  ✓ ${kwCount} keyword rules`);

  // Summary
  const total = slaCount + queueCount + domainCount + threshCount + scopeCount + catCount + kwCount;
  console.log(`\n═══ Total: ${total} nodes created/updated ═══\n`);
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(e => { console.error(e); process.exit(1); });
}

module.exports = { main };
