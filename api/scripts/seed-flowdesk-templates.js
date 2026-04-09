#!/usr/bin/env node
/**
 * Seed FlowDesk notification/dialog templates into Memgraph.
 *
 * Creates (:NotificationTemplate { key, body, namespace, executor, description })
 * nodes used by FlowDesk executors via template-store.js.
 *
 * Usage:
 *   node api/scripts/seed-flowdesk-templates.js
 *   node api/scripts/seed-flowdesk-templates.js --dry-run
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const TEMPLATES = [
  // ── find-user ──────────────────────────────────────────────────
  {
    key: 'find_user.not_found',
    body: 'I couldn\'t find a staff member matching "{{searchTerm}}". Please try their email or full name.',
    executor: 'flowdesk.find_user',
    description: 'Response when no user matches the search term',
  },
  {
    key: 'find_user.found_one',
    body: 'Found — **{{name}}** ({{email}}).',
    executor: 'flowdesk.find_user',
    description: 'Response when exactly one user is found',
  },
  {
    key: 'find_user.found_multiple',
    body: 'I found several staff members:',
    executor: 'flowdesk.find_user',
    description: 'Response header when multiple users match',
  },

  // ── search-location ────────────────────────────────────────────
  {
    key: 'search_location.prompt',
    body: 'Where do you need **{{serviceName}}** to be provided? Please enter a city, duty station, or country name.',
    executor: 'flowdesk.search_location',
    description: 'Prompt asking user for a location',
  },
  {
    key: 'search_location.not_found',
    body: 'I couldn\'t find a location matching "{{searchTerm}}". Please try a duty station name or country.',
    executor: 'flowdesk.search_location',
    description: 'Response when no location matches',
  },
  {
    key: 'search_location.found_one',
    body: 'Got it — **{{name}}** ({{type}}).',
    executor: 'flowdesk.search_location',
    description: 'Response when exactly one location is found',
  },
  {
    key: 'search_location.found_multiple',
    body: 'I found several locations:',
    executor: 'flowdesk.search_location',
    description: 'Response header when multiple locations match',
  },

  // ── send-notification ──────────────────────────────────────────
  {
    key: 'notification.status_update',
    body: 'Service request update for {{recipient}}',
    executor: 'flowdesk.send_notification',
    description: 'Default status update notification message',
  },
  {
    key: 'notification.request_approved',
    body: 'Request {{requestId}} approved. WO: {{workOrderId}}, Handler: {{handler}}',
    executor: 'flowdesk.send_notification',
    description: 'Notification when a request is approved',
  },
  {
    key: 'notification.request_rejected',
    body: 'Request {{requestId}} rejected. Please contact your manager.',
    executor: 'flowdesk.send_notification',
    description: 'Notification when a request is rejected',
  },

  // ── ask-beneficiary ────────────────────────────────────────────
  {
    key: 'ask_beneficiary.prompt',
    body: 'Is this request for yourself or for another staff member?',
    executor: 'flowdesk.ask_beneficiary',
    description: 'Initial prompt asking who the request is for',
  },
  {
    key: 'ask_beneficiary.choice_self',
    body: 'For myself',
    executor: 'flowdesk.ask_beneficiary',
    description: 'Choice label: request is for the user themselves',
  },
  {
    key: 'ask_beneficiary.choice_other',
    body: 'For another person',
    executor: 'flowdesk.ask_beneficiary',
    description: 'Choice label: request is for another staff member',
  },
  {
    key: 'ask_beneficiary.retry_prompt',
    body: 'Please select an option:',
    executor: 'flowdesk.ask_beneficiary',
    description: 'Re-prompt when user gives unclear answer',
  },

  // ── classify-intent ────────────────────────────────────────────
  {
    key: 'classify_intent.keyword_match',
    body: 'I can help with that — **{{serviceCode}}**. Let me collect a few details.',
    executor: 'flowdesk.classify_intent',
    description: 'Response when keyword classification matches with high confidence',
  },
  {
    key: 'classify_intent.semantic_match',
    body: 'I identified your request as **{{serviceName}}**. Let me collect the details.',
    executor: 'flowdesk.classify_intent',
    description: 'Response when semantic classification matches with high confidence',
  },

  // ── spawn-process ──────────────────────────────────────────────
  {
    key: 'spawn_process.success',
    body: [
      'Request created successfully!',
      '',
      '- **Request ID:** {{requestId}}',
      '- **Work Order:** {{workOrderId}}',
      '- **Assigned to:** {{handlerName}} ({{handlerScope}})',
      '- **Due date:** {{dueDate}}',
      '- **Status:** COMPLETED',
      '',
      'You will receive a notification when your manager approves the request.',
    ].join('\n'),
    executor: 'flowdesk.spawn_process',
    description: 'Success response after creating a service request + work order',
  },

  // ── confirm-request ────────────────────────────────────────────
  {
    key: 'confirm_request.summary',
    body: [
      'Please confirm your request:',
      '',
      '- **Service:** {{serviceName}}',
      '- **Location:** {{locationName}}',
      '- **For:** {{beneficiaryLabel}}',
    ].join('\n'),
    executor: 'flowdesk.confirm_request',
    description: 'Request summary shown before confirmation',
  },
  {
    key: 'confirm_request.summary_with_justification',
    body: '- **Description:** "{{justification}}"',
    executor: 'flowdesk.confirm_request',
    description: 'Optional justification line appended to summary',
  },
  {
    key: 'confirm_request.choice_confirm',
    body: 'Create Request',
    executor: 'flowdesk.confirm_request',
    description: 'Confirm button label',
  },
  {
    key: 'confirm_request.choice_edit',
    body: 'Edit',
    executor: 'flowdesk.confirm_request',
    description: 'Edit button label',
  },
  {
    key: 'confirm_request.choice_cancel',
    body: 'Cancel',
    executor: 'flowdesk.confirm_request',
    description: 'Cancel button label',
  },
  {
    key: 'confirm_request.cancelled',
    body: 'Request cancelled.',
    executor: 'flowdesk.confirm_request',
    description: 'Message when user cancels the request',
  },
  {
    key: 'confirm_request.retry_prompt',
    body: 'Please select an option:',
    executor: 'flowdesk.confirm_request',
    description: 'Re-prompt on unclear input',
  },
];

async function seed(dryRun = false) {
  const mg = require('../src/services/memgraph.service');

  console.log(`[seed-flowdesk-templates] ${dryRun ? 'DRY RUN — ' : ''}Seeding ${TEMPLATES.length} templates...\n`);

  let created = 0;
  let updated = 0;

  for (const tpl of TEMPLATES) {
    const params = {
      key: tpl.key,
      body: tpl.body,
      namespace: 'FLOWDESK',
      executor: tpl.executor,
      description: tpl.description,
      updatedAt: new Date().toISOString(),
    };

    if (dryRun) {
      console.log(`  [DRY] ${tpl.key} (${tpl.executor})`);
      continue;
    }

    // MERGE by key — update body if exists, create otherwise
    const result = await mg.runQuery(`
      MERGE (t:NotificationTemplate {key: $key, namespace: $namespace})
      ON CREATE SET t.body = $body, t.executor = $executor, t.description = $description,
                    t.createdAt = $updatedAt, t.updatedAt = $updatedAt
      ON MATCH  SET t.body = $body, t.executor = $executor, t.description = $description,
                    t.updatedAt = $updatedAt
      RETURN t.createdAt = t.updatedAt AS isNew
    `, params);

    const isNew = result[0]?.isNew;
    if (isNew) { created++; } else { updated++; }
    console.log(`  ${isNew ? 'CREATE' : 'UPDATE'} ${tpl.key}`);
  }

  if (!dryRun) {
    console.log(`\nDone: ${created} created, ${updated} updated (${TEMPLATES.length} total)`);
  } else {
    console.log(`\nDry run complete. ${TEMPLATES.length} templates would be seeded.`);
  }

  process.exit(0);
}

const dryRun = process.argv.includes('--dry-run');
seed(dryRun).catch(err => { console.error(err); process.exit(1); });
