#!/usr/bin/env node
/**
 * Seed UN Country Humanitarian Assessment Graph
 *
 * Creates a 15-node executable GXE graph "UN Country Humanitarian Assessment Pipeline"
 * demonstrating:
 *   - Filesystem read/write (field reports in Artefacts/)
 *   - AI-driven branching (AI classifies severity → different processing paths)
 *   - External public API query (restcountries.com)
 *   - Script-based route gating (critical vs standard branch)
 *   - Multiple tool domains: filesystem(3), session(3), script(4), common(5)
 *
 * The pipeline:
 *   1. Read a UN field assessment document
 *   2. Fetch country data from public REST Countries API
 *   3. AI classifies severity (CRITICAL / ELEVATED / ROUTINE)
 *   4. Script-based branching:
 *      - CRITICAL path → AI generates urgent humanitarian brief
 *      - ELEVATED/ROUTINE path → AI generates standard assessment
 *   5. Merge branches → write final report → audit log → output
 *
 * Usage: node api/scripts/seed-un-assessment-graph.js
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

// ═══════════════════════════════════════════════════════════════════════════
// GRAPH DEFINITION: UN Country Humanitarian Assessment Pipeline
// ═══════════════════════════════════════════════════════════════════════════

const UN_ASSESSMENT_GRAPH = {
  name: 'UN Country Humanitarian Assessment Pipeline',
  namespace: 'core',
  type: 'composite',
  description:
    'Humanitarian field assessment pipeline: read field report → fetch country data (REST Countries API) → ' +
    'AI severity classification → conditional branching (CRITICAL vs STANDARD) → ' +
    'generate appropriate report → write output. ' +
    'Demonstrates AI-driven execution branching, external API integration, and multi-domain tool orchestration.',
  version: '1.0.0',
  createdBy: 'system',
  tags: [
    'un', 'humanitarian', 'assessment', 'pipeline', 'core', 'execution',
    'branching', 'ai-routing', 'filesystem', 'api', 'script', 'tool-bound',
  ],
  isPublic: true,

  // ── NODES ──────────────────────────────────────────────────────────────
  nodes: [
    // ════════════════════════════════════════════════════════════════════
    // Stage 0: Pipeline Input
    // ════════════════════════════════════════════════════════════════════
    {
      id: 'input',
      type: 'graphNode',
      data: {
        label: 'Pipeline Input',
        kind: 'input',
        executorType: 'common.passthrough',
        description: 'Accept input parameters: reportPath (field report file), countryName (for API lookup)',
        toolRef: 'tool-common-passthrough',
        parameters: {},
        inputFormat: {
          reportPath: { type: 'string', description: 'Path to field assessment document in Artefacts/' },
          countryName: { type: 'string', description: 'Country name for REST Countries API lookup' },
        },
        outputFormat: {
          reportPath: { type: 'string' },
          countryName: { type: 'string' },
        },
      },
      position: { x: 100, y: 300 },
    },

    // ════════════════════════════════════════════════════════════════════
    // Stage 1: Validate Parameters
    // ════════════════════════════════════════════════════════════════════
    {
      id: 'validate_params',
      type: 'graphNode',
      data: {
        label: 'Validate Parameters',
        executorType: 'common.validate',
        description: 'Ensure reportPath and countryName are provided',
        toolRef: 'tool-common-validate',
        parameters: {
          rules: ['not_null', 'is_object'],
        },
        inputFormat: {
          reportPath: { type: 'string', source: 'input.reportPath' },
          countryName: { type: 'string', source: 'input.countryName' },
        },
        outputFormat: {
          valid: { type: 'boolean' },
          input: { type: 'object' },
        },
      },
      position: { x: 300, y: 300 },
    },

    // ════════════════════════════════════════════════════════════════════
    // Stage 2: Read Field Assessment Report
    // ════════════════════════════════════════════════════════════════════
    {
      id: 'read_field_report',
      type: 'graphNode',
      data: {
        label: 'Read Field Report',
        executorType: 'filesystem.read',
        description: 'Read the UN field assessment document from Artefacts/field-reports/',
        toolRef: 'tool-filesystem-read',
        parameters: {
          path: 'field-reports/south-sudan-assessment.txt',
          encoding: 'utf-8',
        },
        inputFormat: {
          path: { type: 'string', source: 'validate_params.input.reportPath' },
        },
        outputFormat: {
          content: { type: 'string', description: 'Full text of field assessment' },
          size: { type: 'number', description: 'File size in bytes' },
          path: { type: 'string', description: 'Resolved file path' },
        },
      },
      position: { x: 500, y: 200 },
    },

    // ════════════════════════════════════════════════════════════════════
    // Stage 3: Fetch Country Data from Public API
    // ════════════════════════════════════════════════════════════════════
    {
      id: 'fetch_country_data',
      type: 'graphNode',
      data: {
        label: 'Fetch Country Data (API)',
        executorType: 'common.http_request',
        description:
          'Query REST Countries API (restcountries.com) for country demographics: ' +
          'population, region, capital, area. Public API, no auth required.',
        toolRef: 'tool-common-http-request',
        parameters: {
          url: 'https://restcountries.com/v3.1/name/south%20sudan?fields=name,population,region,subregion,capital,area,flags',
          method: 'GET',
          timeout: 10000,
        },
        inputFormat: {},
        outputFormat: {
          data: { type: 'array', description: 'Country information from REST Countries API' },
        },
      },
      position: { x: 500, y: 400 },
    },

    // ════════════════════════════════════════════════════════════════════
    // Stage 4: AI Severity Classification
    // ════════════════════════════════════════════════════════════════════
    {
      id: 'ai_classify_severity',
      type: 'graphNode',
      data: {
        label: 'AI Classify Severity',
        executorType: 'session.ai_chat',
        description:
          'LLM analyzes the field report and classifies the humanitarian situation severity. ' +
          'Returns JSON with classification (CRITICAL/ELEVATED/ROUTINE), confidence, ' +
          'key risk factors, and affected population estimate. ' +
          'This classification DETERMINES which processing branch executes downstream.',
        toolRef: 'tool-session-ai-chat',
        parameters: {
          prompt:
            'You are a UN OCHA humanitarian analyst. Analyze the following field assessment report ' +
            'and classify the situation severity.\n\n' +
            'Classification levels:\n' +
            '- CRITICAL: Immediate life-threatening situation, mass displacement, active conflict, ' +
            'disease outbreak with high CFR, or severe access constraints. Requires CERF rapid response.\n' +
            '- ELEVATED: Significant humanitarian needs but manageable with current resources. ' +
            'Localized displacement, food insecurity below emergency threshold.\n' +
            '- ROUTINE: Ongoing chronic needs, stable situation, regular programming sufficient.\n\n' +
            'Return ONLY valid JSON with these fields:\n' +
            '{\n' +
            '  "classification": "CRITICAL" | "ELEVATED" | "ROUTINE",\n' +
            '  "confidence": 0.0-1.0,\n' +
            '  "riskFactors": ["factor1", "factor2", ...],\n' +
            '  "affectedPopulation": number,\n' +
            '  "primarySectors": ["sector1", "sector2", ...],\n' +
            '  "rationale": "brief explanation"\n' +
            '}\n\n' +
            'Field Assessment Report:\n{{input}}',
          systemPrompt:
            'You are a senior UN OCHA humanitarian analyst specializing in crisis severity assessment. ' +
            'Always respond with valid JSON only. Be precise and evidence-based.',
          responseFormat: 'json',
          temperature: 0.2,
          maxTokens: 800,
        },
        inputFormat: {
          content: { type: 'string', source: 'read_field_report.content' },
        },
        outputFormat: {
          classification: { type: 'string', description: 'CRITICAL | ELEVATED | ROUTINE' },
          confidence: { type: 'number', description: 'Classification confidence 0-1' },
          riskFactors: { type: 'array', description: 'Key risk factors identified' },
          affectedPopulation: { type: 'number', description: 'Estimated affected population' },
          primarySectors: { type: 'array', description: 'Most affected sectors' },
          rationale: { type: 'string', description: 'Classification rationale' },
        },
      },
      position: { x: 750, y: 300 },
    },

    // ════════════════════════════════════════════════════════════════════
    // Stage 5: Prepare Classification Data
    // ════════════════════════════════════════════════════════════════════
    {
      id: 'prepare_classification',
      type: 'graphNode',
      data: {
        label: 'Prepare Classification',
        executorType: 'script.execute',
        description:
          'Parse AI classification output, normalize fields, merge with country API data. ' +
          'Sets isCritical flag used by downstream routing nodes.',
        toolRef: 'tool-script-execute',
        parameters: {
          code: `
            // Multi-input: receives _from_{source} port keys
            var data = input || {};
            var aiOutput = data._from_ai_classify_severity || {};
            var countryData = data._from_fetch_country_data || null;
            var fileData = data._from_read_field_report || {};

            // Parse AI classification (may be string or object)
            var classification = aiOutput;
            if (typeof classification === 'string') {
              try { classification = JSON.parse(classification); } catch(e) { classification = {}; }
            }

            var severity = (classification.classification || 'ROUTINE').toUpperCase();
            var isCritical = severity === 'CRITICAL';

            result = {
              severity: severity,
              isCritical: isCritical,
              confidence: classification.confidence || 0.5,
              riskFactors: classification.riskFactors || [],
              affectedPopulation: classification.affectedPopulation || 0,
              primarySectors: classification.primarySectors || [],
              rationale: classification.rationale || 'No rationale provided',
              countryData: countryData,
              reportContent: fileData.content || '',
              classifiedAt: new Date().toISOString()
            };
          `,
          timeout: 5000,
        },
        inputFormat: {
          classification: { type: 'object', source: 'ai_classify_severity' },
          countryData: { type: 'object', source: 'fetch_country_data' },
          reportContent: { type: 'string', source: 'read_field_report.content' },
        },
        outputFormat: {
          result: {
            type: 'object',
            description: 'Normalized classification with isCritical flag for routing',
            fields: {
              severity: 'string',
              isCritical: 'boolean',
              confidence: 'number',
              riskFactors: 'array',
              affectedPopulation: 'number',
              countryData: 'object',
            },
          },
        },
      },
      position: { x: 1000, y: 300 },
    },

    // ════════════════════════════════════════════════════════════════════
    // Stage 6: Route — Critical Branch Gate
    // ════════════════════════════════════════════════════════════════════
    {
      id: 'route_critical',
      type: 'graphNode',
      data: {
        label: 'Route: Critical Path',
        kind: 'condition',
        executorType: 'script.execute',
        description:
          'Gate for CRITICAL severity branch. If classification is CRITICAL, passes full data ' +
          'to urgent humanitarian brief generation. Otherwise returns minimal skip marker.',
        toolRef: 'tool-script-execute',
        parameters: {
          code: `
            var data = input || {};
            var classResult = data.result || data;
            var isCritical = classResult.isCritical === true || classResult.severity === 'CRITICAL';

            if (isCritical) {
              console.log('[ROUTE] Severity CRITICAL — activating urgent response branch');
              result = {
                active: true,
                severity: 'CRITICAL',
                reportContent: classResult.reportContent || '',
                riskFactors: classResult.riskFactors || [],
                affectedPopulation: classResult.affectedPopulation || 0,
                primarySectors: classResult.primarySectors || [],
                countryData: classResult.countryData,
                rationale: classResult.rationale || ''
              };
            } else {
              console.log('[ROUTE] Severity ' + (classResult.severity || 'UNKNOWN') + ' — skipping critical branch');
              result = { active: false, severity: classResult.severity || 'ROUTINE', skipped: true };
            }
          `,
          timeout: 3000,
        },
        inputFormat: {
          result: { type: 'object', source: 'prepare_classification.result' },
        },
        outputFormat: {
          result: { type: 'object', description: '{ active, severity, ...data } or { active: false, skipped: true }' },
        },
      },
      position: { x: 1250, y: 150 },
    },

    // ════════════════════════════════════════════════════════════════════
    // Stage 7: Route — Standard Branch Gate
    // ════════════════════════════════════════════════════════════════════
    {
      id: 'route_standard',
      type: 'graphNode',
      data: {
        label: 'Route: Standard Path',
        kind: 'condition',
        executorType: 'script.execute',
        description:
          'Gate for ELEVATED/ROUTINE severity branch. If classification is NOT CRITICAL, passes data ' +
          'to standard assessment generation. Otherwise returns skip marker.',
        toolRef: 'tool-script-execute',
        parameters: {
          code: `
            var data = input || {};
            var classResult = data.result || data;
            var isCritical = classResult.isCritical === true || classResult.severity === 'CRITICAL';

            if (!isCritical) {
              console.log('[ROUTE] Severity ' + (classResult.severity || 'ROUTINE') + ' — activating standard assessment branch');
              result = {
                active: true,
                severity: classResult.severity || 'ROUTINE',
                reportContent: classResult.reportContent || '',
                riskFactors: classResult.riskFactors || [],
                affectedPopulation: classResult.affectedPopulation || 0,
                primarySectors: classResult.primarySectors || [],
                countryData: classResult.countryData,
                rationale: classResult.rationale || ''
              };
            } else {
              console.log('[ROUTE] Severity CRITICAL — skipping standard branch');
              result = { active: false, severity: 'CRITICAL', skipped: true };
            }
          `,
          timeout: 3000,
        },
        inputFormat: {
          result: { type: 'object', source: 'prepare_classification.result' },
        },
        outputFormat: {
          result: { type: 'object', description: '{ active, severity, ...data } or { active: false, skipped: true }' },
        },
      },
      position: { x: 1250, y: 450 },
    },

    // ════════════════════════════════════════════════════════════════════
    // Stage 8: AI Urgent Humanitarian Brief (Critical Branch)
    // ════════════════════════════════════════════════════════════════════
    {
      id: 'ai_urgent_brief',
      type: 'graphNode',
      data: {
        label: 'AI: Urgent Humanitarian Brief',
        executorType: 'session.ai_chat',
        description:
          'Generates an URGENT humanitarian brief for CRITICAL situations. ' +
          'Uses structured flash report format required by IASC and CERF. ' +
          'Only produces meaningful output when route_critical.active === true.',
        toolRef: 'tool-session-ai-chat',
        parameters: {
          prompt:
            'Generate an URGENT HUMANITARIAN BRIEF based on the following field data. ' +
            'If the input contains "skipped: true", respond with: "BRANCH_INACTIVE"\n\n' +
            'Format as a UN Flash Update with these sections:\n' +
            '# FLASH UPDATE — [Country] Humanitarian Crisis\n' +
            '**Classification: CRITICAL** | **Date:** [today]\n\n' +
            '## Situation Overview\n' +
            '[2-3 sentences on the crisis]\n\n' +
            '## Key Figures\n' +
            '- Affected population: [number]\n' +
            '- Key risk factors\n\n' +
            '## Immediate Actions Required\n' +
            '[Numbered list of 3-5 urgent actions]\n\n' +
            '## Funding Requirements\n' +
            '[CERF/emergency funding needs]\n\n' +
            '## Contact\n' +
            'OCHA Duty Officer\n\n' +
            'Input data:\n{{input}}',
          systemPrompt:
            'You are a senior OCHA communications officer drafting flash updates for the Emergency Relief Coordinator. ' +
            'Be concise, factual, and action-oriented. Use standard UN humanitarian terminology.',
          temperature: 0.3,
          maxTokens: 1500,
        },
        inputFormat: {
          data: { type: 'object', source: 'route_critical.result' },
        },
        outputFormat: {
          report: { type: 'string', description: 'Formatted urgent humanitarian brief or BRANCH_INACTIVE' },
        },
      },
      position: { x: 1500, y: 150 },
    },

    // ════════════════════════════════════════════════════════════════════
    // Stage 9: AI Standard Assessment (Standard Branch)
    // ════════════════════════════════════════════════════════════════════
    {
      id: 'ai_standard_assessment',
      type: 'graphNode',
      data: {
        label: 'AI: Standard Assessment',
        executorType: 'session.ai_chat',
        description:
          'Generates a standard humanitarian assessment report for ELEVATED/ROUTINE situations. ' +
          'Uses regular sitrep format. ' +
          'Only produces meaningful output when route_standard.active === true.',
        toolRef: 'tool-session-ai-chat',
        parameters: {
          prompt:
            'Generate a standard humanitarian situation report based on the following field data. ' +
            'If the input contains "skipped: true", respond with: "BRANCH_INACTIVE"\n\n' +
            'Format as a UN Situation Report:\n' +
            '# Situation Report — [Country]\n' +
            '**Classification: [severity]** | **Date:** [today]\n\n' +
            '## Overview\n' +
            '[Summary of current situation]\n\n' +
            '## Humanitarian Needs\n' +
            '[Key needs by sector]\n\n' +
            '## Response Activities\n' +
            '[Ongoing response]\n\n' +
            '## Outlook & Recommendations\n' +
            '[Forward-looking assessment]\n\n' +
            'Input data:\n{{input}}',
          systemPrompt:
            'You are a UN OCHA reporting officer preparing situation reports. ' +
            'Be factual, balanced, and follow standard UN reporting conventions.',
          temperature: 0.4,
          maxTokens: 1200,
        },
        inputFormat: {
          data: { type: 'object', source: 'route_standard.result' },
        },
        outputFormat: {
          report: { type: 'string', description: 'Formatted standard assessment or BRANCH_INACTIVE' },
        },
      },
      position: { x: 1500, y: 450 },
    },

    // ════════════════════════════════════════════════════════════════════
    // Stage 10: Merge Report Branches
    // ════════════════════════════════════════════════════════════════════
    {
      id: 'merge_reports',
      type: 'graphNode',
      data: {
        label: 'Merge Report Branches',
        executorType: 'script.execute',
        description:
          'Merges the two conditional branches. Picks the active branch output (the one that ' +
          'is NOT "BRANCH_INACTIVE"). Adds metadata header with classification and timestamp.',
        toolRef: 'tool-script-execute',
        parameters: {
          code: `
            // Multi-input: receives _from_{source} port keys
            var data = input || {};
            var urgentReport = data._from_ai_urgent_brief || '';
            var standardReport = data._from_ai_standard_assessment || '';
            var classData = data._from_prepare_classification || {};
            var classification = classData.result || classData;

            // Determine which branch was active
            var activeReport = '';
            var reportType = 'unknown';

            // Check urgent branch (string response from AI)
            var urgentText = typeof urgentReport === 'object' ? (urgentReport.response || urgentReport.content || JSON.stringify(urgentReport)) : String(urgentReport);
            var standardText = typeof standardReport === 'object' ? (standardReport.response || standardReport.content || JSON.stringify(standardReport)) : String(standardReport);

            if (urgentText && urgentText !== 'BRANCH_INACTIVE' && urgentText.length > 50) {
              activeReport = urgentText;
              reportType = 'FLASH_UPDATE';
            } else if (standardText && standardText !== 'BRANCH_INACTIVE' && standardText.length > 50) {
              activeReport = standardText;
              reportType = 'SITUATION_REPORT';
            } else {
              activeReport = '# Assessment Report\\n\\nNo detailed report generated. Classification data available in metadata.';
              reportType = 'FALLBACK';
            }

            // Build final report with metadata header
            var severity = (classification.severity || 'UNKNOWN');
            var header = '---\\n' +
              'report_type: ' + reportType + '\\n' +
              'severity: ' + severity + '\\n' +
              'confidence: ' + (classification.confidence || 'N/A') + '\\n' +
              'generated_at: ' + new Date().toISOString() + '\\n' +
              'pipeline: UN Country Humanitarian Assessment Pipeline\\n' +
              '---\\n\\n';

            result = {
              report: header + activeReport,
              reportType: reportType,
              severity: severity,
              branchUsed: reportType === 'FLASH_UPDATE' ? 'critical' : 'standard',
              characterCount: activeReport.length
            };
          `,
          timeout: 5000,
        },
        inputFormat: {
          urgentReport: { type: 'string', source: 'ai_urgent_brief' },
          standardReport: { type: 'string', source: 'ai_standard_assessment' },
          classification: { type: 'object', source: 'prepare_classification.result' },
        },
        outputFormat: {
          result: {
            type: 'object',
            description: 'Merged report with metadata',
            fields: {
              report: 'string',
              reportType: 'string',
              severity: 'string',
              branchUsed: 'string',
            },
          },
        },
      },
      position: { x: 1750, y: 300 },
    },

    // ════════════════════════════════════════════════════════════════════
    // Stage 11: Audit Log
    // ════════════════════════════════════════════════════════════════════
    {
      id: 'log_assessment',
      type: 'graphNode',
      data: {
        label: 'Audit Log',
        executorType: 'common.log',
        description: 'Log the assessment result for audit trail and provenance tracking',
        toolRef: 'tool-common-log',
        parameters: {
          level: 'info',
          message: 'UN Humanitarian Assessment completed',
          includeInput: true,
        },
        inputFormat: {
          result: { type: 'object', source: 'merge_reports.result' },
        },
        outputFormat: {
          logged: { type: 'boolean' },
        },
      },
      position: { x: 1950, y: 200 },
    },

    // ════════════════════════════════════════════════════════════════════
    // Stage 12: Write Report to Filesystem
    // ════════════════════════════════════════════════════════════════════
    {
      id: 'write_report',
      type: 'graphNode',
      data: {
        label: 'Write Assessment Report',
        executorType: 'filesystem.write',
        description: 'Write the final assessment report to Artefacts/reports/ directory',
        toolRef: 'tool-filesystem-write',
        parameters: {
          path: 'reports/un-humanitarian-assessment.md',
          contentFromInput: true,
        },
        inputFormat: {
          content: { type: 'string', source: 'merge_reports.result.report' },
        },
        outputFormat: {
          bytesWritten: { type: 'number' },
          path: { type: 'string' },
        },
      },
      position: { x: 1950, y: 400 },
    },

    // ════════════════════════════════════════════════════════════════════
    // Stage 13: List Output Files
    // ════════════════════════════════════════════════════════════════════
    {
      id: 'list_reports',
      type: 'graphNode',
      data: {
        label: 'List Report Files',
        executorType: 'filesystem.list',
        description: 'List files in the reports directory to confirm output was written',
        toolRef: 'tool-filesystem-list',
        parameters: {
          path: 'reports',
          recursive: false,
        },
        inputFormat: {},
        outputFormat: {
          files: { type: 'array', description: 'List of report files' },
          count: { type: 'number' },
        },
      },
      position: { x: 2150, y: 300 },
    },

    // ════════════════════════════════════════════════════════════════════
    // Stage 14: Pipeline Output
    // ════════════════════════════════════════════════════════════════════
    {
      id: 'output',
      type: 'graphNode',
      data: {
        label: 'Pipeline Output',
        kind: 'output',
        executorType: 'common.passthrough',
        description: 'Final pipeline output aggregating assessment results, report path, and audit status',
        toolRef: 'tool-common-passthrough',
        parameters: {},
        inputFormat: {
          assessment: { type: 'object', source: 'merge_reports.result' },
          reportFile: { type: 'object', source: 'write_report' },
          outputFiles: { type: 'object', source: 'list_reports' },
          auditLog: { type: 'object', source: 'log_assessment' },
        },
        outputFormat: {
          assessment: { type: 'object', description: 'Severity classification and report metadata' },
          reportFile: { type: 'object', description: 'Written report file info' },
          outputFiles: { type: 'object', description: 'Report directory listing' },
        },
      },
      position: { x: 2350, y: 300 },
    },
  ],

  // ── EDGES ──────────────────────────────────────────────────────────────
  edges: [
    // ── Input → Validate ──
    {
      id: 'e01', source: 'input', target: 'validate_params', label: 'raw params',
      dataContract: {
        fields: { reportPath: 'string', countryName: 'string' },
        mapping: { 'input.reportPath': 'validate_params.reportPath', 'input.countryName': 'validate_params.countryName' },
      },
    },

    // ── Validate → Read Report (parallel branch up) ──
    {
      id: 'e02', source: 'validate_params', target: 'read_field_report', label: 'validated → read file',
      dataContract: {
        fields: { path: 'string' },
        mapping: { 'validate_params.input.reportPath': 'read_field_report.path' },
      },
    },

    // ── Validate → Fetch Country Data (parallel branch down) ──
    {
      id: 'e03', source: 'validate_params', target: 'fetch_country_data', label: 'trigger API fetch',
      dataContract: {
        fields: {},
        mapping: {},
        note: 'Parallel branch: country data fetched concurrently with document read',
      },
    },

    // ── Read Report → AI Classify Severity ──
    {
      id: 'e04', source: 'read_field_report', target: 'ai_classify_severity', label: 'report text',
      dataContract: {
        fields: { content: 'string' },
        mapping: { 'read_field_report.content': 'ai_classify_severity.content' },
      },
    },

    // ── AI Classify → Prepare Classification ──
    {
      id: 'e05', source: 'ai_classify_severity', target: 'prepare_classification', label: 'classification JSON',
      dataContract: {
        fields: { classification: 'string', confidence: 'number', riskFactors: 'array' },
        mapping: { 'ai_classify_severity.*': 'prepare_classification.classification' },
      },
    },

    // ── Fetch Country Data → Prepare Classification ──
    {
      id: 'e06', source: 'fetch_country_data', target: 'prepare_classification', label: 'country demographics',
      dataContract: {
        fields: { data: 'array' },
        mapping: { 'fetch_country_data.*': 'prepare_classification.countryData' },
      },
    },

    // ── Read Report → Prepare Classification (report content for downstream) ──
    {
      id: 'e07', source: 'read_field_report', target: 'prepare_classification', label: 'report text passthrough',
      dataContract: {
        fields: { content: 'string' },
        mapping: { 'read_field_report.content': 'prepare_classification.reportContent' },
      },
    },

    // ══════════════════════════════════════════════════════════════════
    // BRANCHING: Classification → Two parallel route gates
    // ══════════════════════════════════════════════════════════════════

    // ── Prepare → Route Critical (branch up) ──
    {
      id: 'e08', source: 'prepare_classification', target: 'route_critical', label: 'classification → critical gate',
      dataContract: {
        fields: { result: 'object' },
        mapping: { 'prepare_classification.result': 'route_critical.result' },
        note: 'Script checks isCritical flag; passes full data if CRITICAL, skip marker otherwise',
      },
    },

    // ── Prepare → Route Standard (branch down) ──
    {
      id: 'e09', source: 'prepare_classification', target: 'route_standard', label: 'classification → standard gate',
      dataContract: {
        fields: { result: 'object' },
        mapping: { 'prepare_classification.result': 'route_standard.result' },
        note: 'Script checks isCritical flag; passes full data if NOT CRITICAL, skip marker otherwise',
      },
    },

    // ── Route Critical → AI Urgent Brief ──
    {
      id: 'e10', source: 'route_critical', target: 'ai_urgent_brief', label: 'critical data or skip',
      dataContract: {
        fields: { result: 'object' },
        mapping: { 'route_critical.result': 'ai_urgent_brief.data' },
        note: 'If active=true, AI generates urgent brief; if skipped, AI returns BRANCH_INACTIVE',
      },
    },

    // ── Route Standard → AI Standard Assessment ──
    {
      id: 'e11', source: 'route_standard', target: 'ai_standard_assessment', label: 'standard data or skip',
      dataContract: {
        fields: { result: 'object' },
        mapping: { 'route_standard.result': 'ai_standard_assessment.data' },
        note: 'If active=true, AI generates sitrep; if skipped, AI returns BRANCH_INACTIVE',
      },
    },

    // ══════════════════════════════════════════════════════════════════
    // MERGE: Both branches → Merge Reports
    // ══════════════════════════════════════════════════════════════════

    // ── AI Urgent Brief → Merge ──
    {
      id: 'e12', source: 'ai_urgent_brief', target: 'merge_reports', label: 'urgent report or INACTIVE',
      dataContract: {
        fields: { report: 'string' },
        mapping: { 'ai_urgent_brief.*': 'merge_reports.urgentReport' },
      },
    },

    // ── AI Standard Assessment → Merge ──
    {
      id: 'e13', source: 'ai_standard_assessment', target: 'merge_reports', label: 'standard report or INACTIVE',
      dataContract: {
        fields: { report: 'string' },
        mapping: { 'ai_standard_assessment.*': 'merge_reports.standardReport' },
      },
    },

    // ── Prepare Classification → Merge (for metadata) ──
    {
      id: 'e14', source: 'prepare_classification', target: 'merge_reports', label: 'classification metadata',
      dataContract: {
        fields: { result: 'object' },
        mapping: { 'prepare_classification.result': 'merge_reports.classification' },
      },
    },

    // ══════════════════════════════════════════════════════════════════
    // OUTPUT CHAIN: Merge → Log + Write → List → Output
    // ══════════════════════════════════════════════════════════════════

    // ── Merge → Audit Log (parallel with Write) ──
    {
      id: 'e15', source: 'merge_reports', target: 'log_assessment', label: 'assessment audit',
      dataContract: {
        fields: { result: 'object' },
        mapping: { 'merge_reports.result': 'log_assessment.result' },
      },
    },

    // ── Merge → Write Report (parallel with Log) ──
    {
      id: 'e16', source: 'merge_reports', target: 'write_report', label: 'report content',
      dataContract: {
        fields: { content: 'string' },
        mapping: { 'merge_reports.result.report': 'write_report.content' },
      },
    },

    // ── Write Report → List Files ──
    {
      id: 'e17', source: 'write_report', target: 'list_reports', label: 'written confirmation',
      dataContract: {
        fields: { bytesWritten: 'number', path: 'string' },
        mapping: { 'write_report.*': 'list_reports' },
      },
    },

    // ── All outputs → Pipeline Output (fan-in) ──
    {
      id: 'e18', source: 'merge_reports', target: 'output', label: 'assessment result',
      dataContract: {
        fields: { result: 'object' },
        mapping: { 'merge_reports.result': 'output.assessment' },
      },
    },
    {
      id: 'e19', source: 'write_report', target: 'output', label: 'report file info',
      dataContract: {
        fields: { bytesWritten: 'number', path: 'string' },
        mapping: { 'write_report.*': 'output.reportFile' },
      },
    },
    {
      id: 'e20', source: 'list_reports', target: 'output', label: 'file listing',
      dataContract: {
        fields: { files: 'array', count: 'number' },
        mapping: { 'list_reports.*': 'output.outputFiles' },
      },
    },
    {
      id: 'e21', source: 'log_assessment', target: 'output', label: 'audit confirmation',
      dataContract: {
        fields: { logged: 'boolean' },
        mapping: { 'log_assessment.*': 'output.auditLog' },
      },
    },
  ],

  // ── REQUIRED PARAMS ────────────────────────────────────────────────────
  requiredParams: {
    reportPath: {
      type: 'string',
      description: 'Path to field assessment document in Artefacts/ directory',
      required: true,
      default: 'field-reports/south-sudan-assessment.txt',
    },
    countryName: {
      type: 'string',
      description: 'Country name for REST Countries API lookup',
      required: true,
      default: 'South Sudan',
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// GENERATE TOOL-REFERENCE NODES + USES_TOOL EDGES
// ═══════════════════════════════════════════════════════════════════════════

const toolRefNodes = UN_ASSESSMENT_GRAPH.nodes
  .filter(n => n.type === 'graphNode' && n.data?.toolRef)
  .map(n => {
    const toolId = n.data.toolRef;
    const trefId = `tref-${toolId.replace('tool-', '')}`;
    const xOffset = 260; // Side-by-side: tool-ref to the right of executor
    return {
      id: trefId,
      type: 'graphNode',
      data: {
        label: n.data.label,
        kind: 'tool',
        description: n.data.executorType,
        executorType: n.data.executorType,
        toolNodeId: toolId,
        pluginDomain: n.data.executorType.split('.')[0],
        isToolRef: true,
      },
      position: { x: n.position.x + xOffset, y: n.position.y },
    };
  });

const toolRefEdges = UN_ASSESSMENT_GRAPH.nodes
  .filter(n => n.type === 'graphNode' && n.data?.toolRef)
  .map(n => {
    const toolId = n.data.toolRef;
    const trefId = `tref-${toolId.replace('tool-', '')}`;
    return {
      id: `et-${n.id}`,
      source: n.id,
      target: trefId,
      sourceHandle: 'tool-bind',
      targetHandle: 'tool-bind',
      label: 'USES_TOOL',
      type: 'smoothstep',
      animated: false,
      style: { stroke: '#f59e0b', strokeWidth: 1.5, strokeDasharray: '5,5' },
      markerEnd: { type: 'arrowclosed', color: '#f59e0b' },
      dataContract: { type: 'tool-binding', description: 'Executor → Tool binding reference' },
    };
  });

UN_ASSESSMENT_GRAPH.nodes.push(...toolRefNodes);
UN_ASSESSMENT_GRAPH.edges.push(...toolRefEdges);

// ═══════════════════════════════════════════════════════════════════════════
// MAIN: Write to Memgraph
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  Seed: UN Country Humanitarian Assessment Pipeline → Core       ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');

  const memgraphService = require('../src/services/memgraph.service');

  let connected = false;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      if (!memgraphService.driver) {
        console.log(`[${attempt}/5] Waiting for Memgraph driver...`);
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      const session = memgraphService.driver.session();
      await session.run('RETURN 1');
      await session.close();
      connected = true;
      console.log(`[OK] Memgraph connected`);
      break;
    } catch (err) {
      console.warn(`[${attempt}/5] Memgraph not ready: ${err.message}`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  if (!connected) {
    console.error('[FAIL] Cannot connect to Memgraph. Exiting.');
    process.exit(1);
  }

  const { graphCatalogService } = require('../src/services/graphCatalog.service');

  // Check if graph already exists
  const existing = await graphCatalogService.listGraphs({
    namespace: 'core',
    search: 'UN Country Humanitarian Assessment Pipeline',
  });

  if (existing.data && existing.data.length > 0) {
    const existingGraph = existing.data.find(g => g.name === 'UN Country Humanitarian Assessment Pipeline');
    if (existingGraph) {
      console.log(`[UPDATE] Graph already exists (id: ${existingGraph.id}), updating...`);
      const updated = await graphCatalogService.updateGraph(existingGraph.id, {
        nodes: UN_ASSESSMENT_GRAPH.nodes,
        edges: UN_ASSESSMENT_GRAPH.edges,
        description: UN_ASSESSMENT_GRAPH.description,
        version: UN_ASSESSMENT_GRAPH.version,
        tags: UN_ASSESSMENT_GRAPH.tags,
        requiredParams: UN_ASSESSMENT_GRAPH.requiredParams,
      });
      console.log(`[OK] Graph updated: ${updated.name} (${updated.id})`);
      printSummary(updated);
      await cleanup();
      return;
    }
  }

  // Create new graph
  const created = await graphCatalogService.createGraph(UN_ASSESSMENT_GRAPH);
  console.log(`[OK] Graph created: ${created.name} (${created.id})`);
  printSummary(created);
  await cleanup();
}

function printSummary(graph) {
  const nodes = typeof graph.nodes === 'string' ? JSON.parse(graph.nodes) : graph.nodes;
  const edges = typeof graph.edges === 'string' ? JSON.parse(graph.edges) : graph.edges;
  const execNodes = nodes.filter(n => n.type === 'graphNode' && !n.data?.isToolRef);
  const toolNodes = nodes.filter(n => n.data?.isToolRef);
  const dataEdges = edges.filter(e => e.label !== 'USES_TOOL');
  const toolEdges = edges.filter(e => e.label === 'USES_TOOL');

  // Count executors by domain
  const domains = {};
  for (const n of execNodes) {
    const domain = (n.data?.executorType || '').split('.')[0] || 'unknown';
    domains[domain] = (domains[domain] || 0) + 1;
  }

  console.log('\n┌──────────────────────────────────────────────────────────────────┐');
  console.log(`│ Graph: ${graph.name}`);
  console.log(`│ ID:    ${graph.id}`);
  console.log('├──────────────────────────────────────────────────────────────────┤');
  console.log(`│ Executor nodes:    ${execNodes.length}`);
  console.log(`│ Tool-ref badges:   ${toolNodes.length}`);
  console.log(`│ Data-flow edges:   ${dataEdges.length}`);
  console.log(`│ USES_TOOL edges:   ${toolEdges.length}`);
  console.log('├──────────────────────────────────────────────────────────────────┤');
  console.log(`│ Domains: ${Object.entries(domains).map(([k, v]) => `${k}(${v})`).join(', ')}`);
  console.log('├──────────────────────────────────────────────────────────────────┤');
  console.log('│ Pipeline Flow:');
  console.log('│   input → validate → [read_report | fetch_country_api]');
  console.log('│                   → ai_classify → prepare_classification');
  console.log('│                   → [route_critical → ai_urgent_brief]   ← BRANCH A');
  console.log('│                   → [route_standard → ai_standard_report] ← BRANCH B');
  console.log('│                   → merge_reports → [log | write] → list → output');
  console.log('├──────────────────────────────────────────────────────────────────┤');
  console.log('│ Branching: AI severity classification determines active branch');
  console.log('│ External API: restcountries.com (country demographics)');
  console.log('│ Required params: reportPath, countryName');
  console.log('└──────────────────────────────────────────────────────────────────┘');

  // Print node table
  console.log('\n  #  Node ID                    Executor                Label');
  console.log('  ─  ─────────────────────────  ──────────────────────  ─────────────────────────');
  execNodes.forEach((n, i) => {
    const id = (n.id || '').padEnd(25);
    const exec = (n.data?.executorType || '').padEnd(22);
    const label = n.data?.label || '';
    console.log(`  ${String(i + 1).padStart(2)} ${id} ${exec} ${label}`);
  });
}

async function cleanup() {
  try {
    const memgraphService = require('../src/services/memgraph.service');
    if (memgraphService.driver) {
      await memgraphService.driver.close();
    }
  } catch (_) { /* ignore */ }
  process.exit(0);
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
