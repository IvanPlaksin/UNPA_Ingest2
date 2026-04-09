#!/usr/bin/env node
/**
 * Patch tool-catalog-fallback.json with FlowDesk AOPEG executors and BackLog MCP tools.
 * Safe to re-run — skips duplicates.
 */
const fs = require('fs');
const path = require('path');

const catalogPath = path.join(__dirname, '..', 'data', 'tool-catalog-fallback.json');
const data = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));
const now = new Date().toISOString();

const FLOWDESK_TOOLS = [
  { id: 'tool.flowdesk.classify_intent', name: 'Classify Intent', executorId: 'flowdesk.classify_intent',
    description: 'Classify user text into a service using keyword filter (L1) and semantic search (L2)',
    tags: ['dialog', 'intent', 'classification', 'nlp'] },
  { id: 'tool.flowdesk.check_location', name: 'Check Location', executorId: 'flowdesk.check_location',
    description: 'Check if a known location/building exists for the user request',
    tags: ['dialog', 'location', 'lookup'] },
  { id: 'tool.flowdesk.search_location', name: 'Search Location', executorId: 'flowdesk.search_location',
    description: 'Search for a location by name, address or building code using fuzzy matching',
    tags: ['dialog', 'location', 'search', 'fuzzy'] },
  { id: 'tool.flowdesk.ask_beneficiary', name: 'Ask Beneficiary', executorId: 'flowdesk.ask_beneficiary',
    description: 'Ask the user to identify the beneficiary (themselves or someone else) for the service request',
    tags: ['dialog', 'beneficiary', 'user-input'] },
  { id: 'tool.flowdesk.find_user', name: 'Find User', executorId: 'flowdesk.find_user',
    description: 'Search for a user by name, email, or employee ID in the HR directory',
    tags: ['dialog', 'user', 'directory', 'hr'] },
  { id: 'tool.flowdesk.confirm_request', name: 'Confirm Request', executorId: 'flowdesk.confirm_request',
    description: 'Present a summary of the collected data to the user and ask for confirmation before submission',
    tags: ['dialog', 'confirmation', 'summary'] },
  { id: 'tool.flowdesk.spawn_process', name: 'Spawn Process', executorId: 'flowdesk.spawn_process',
    description: 'Spawn a downstream process graph (e.g., Laptop Request Workflow) after dialog completion',
    tags: ['process', 'spawn', 'workflow', 'orchestration'], isAsync: true },
  { id: 'tool.flowdesk.create_service_request', name: 'Create Service Request', executorId: 'flowdesk.create_service_request',
    description: 'Create a new service request record with all collected dialog data',
    tags: ['process', 'service-request', 'create', 'itsm'] },
  { id: 'tool.flowdesk.request_approval', name: 'Request Approval', executorId: 'flowdesk.request_approval',
    description: 'Submit a service request for manager approval based on approval chain rules',
    tags: ['process', 'approval', 'manager', 'authorization'], isAsync: true },
  { id: 'tool.flowdesk.create_work_order', name: 'Create Work Order', executorId: 'flowdesk.create_work_order',
    description: 'Create a work order for fulfillment team after approval is granted',
    tags: ['process', 'work-order', 'fulfillment'] },
  { id: 'tool.flowdesk.assign_handler', name: 'Assign Handler', executorId: 'flowdesk.assign_handler',
    description: 'Assign a handler/technician to the work order based on skills and availability',
    tags: ['process', 'assignment', 'handler', 'routing'] },
  { id: 'tool.flowdesk.send_notification', name: 'Send Notification', executorId: 'flowdesk.send_notification',
    description: 'Send email/notification to stakeholders about request status changes',
    tags: ['process', 'notification', 'email', 'communication'], isAsync: true },
];

const BACKLOG_TOOLS = [
  { id: 'tool.backlog.create_task', name: 'Create BackLog Task', executorId: 'backlog.create_task',
    description: 'Create a new BackLog task for code modification. Agent-created tasks start as PROPOSED and require human approval.',
    tags: ['backlog', 'task', 'create', 'agent'] },
  { id: 'tool.backlog.list_tasks', name: 'List BackLog Tasks', executorId: 'backlog.list_tasks',
    description: 'List BackLog tasks with optional filters by status, priority, taskType, assignee',
    tags: ['backlog', 'task', 'list', 'query'] },
  { id: 'tool.backlog.get_task', name: 'Get BackLog Task', executorId: 'backlog.get_task',
    description: 'Get detailed information about a specific BackLog task by its backlogId',
    tags: ['backlog', 'task', 'detail'] },
  { id: 'tool.backlog.update_status', name: 'Update BackLog Status', executorId: 'backlog.update_status',
    description: 'Update the status of a BackLog task (approve, reject, start, block, review, complete)',
    tags: ['backlog', 'task', 'status', 'transition'] },
  { id: 'tool.backlog.get_stats', name: 'Get BackLog Statistics', executorId: 'backlog.get_stats',
    description: 'Get BackLog statistics: total tasks, counts by status and priority, open count',
    tags: ['backlog', 'statistics', 'dashboard'] },
  { id: 'tool.backlog.add_dependency', name: 'Add BackLog Dependency', executorId: 'backlog.add_dependency',
    description: 'Add a dependency between BackLog tasks (DEPENDS_ON relationship, must be acyclic)',
    tags: ['backlog', 'dependency', 'relationship'] },
];

const existingIds = new Set(data.tools.map(t => t.id));
let added = 0;

for (const tool of [...FLOWDESK_TOOLS, ...BACKLOG_TOOLS]) {
  if (existingIds.has(tool.id)) continue;

  data.tools.push({
    ...tool,
    category: tool.executorId.split('.')[0],
    inputSchema: '{}',
    outputSchema: '{}',
    status: 'active',
    source: 'aopeg',
    requiresLLM: false,
    requiresNetwork: false,
    isAsync: tool.isAsync || false,
    version: '1.0.0',
    usageCount: 0,
    lastUsedAt: null,
    createdAt: now,
  });
  added++;
}

fs.writeFileSync(catalogPath, JSON.stringify(data, null, 2), 'utf-8');
console.log(`Added ${added} tools to fallback catalog`);
console.log(`Total tools: ${data.tools.length}`);

// Verify by category
const cats = {};
data.tools.forEach(t => { cats[t.category] = (cats[t.category] || 0) + 1; });
console.log('By category:', JSON.stringify(cats, null, 2));
