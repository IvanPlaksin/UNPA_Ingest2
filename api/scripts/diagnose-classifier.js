#!/usr/bin/env node
/**
 * Classifier Diagnostic Script
 *
 * Tests every stage of the classification pipeline and reports:
 *   ✅ PASS / ❌ FAIL per stage with concrete evidence
 *
 * Usage:
 *   node api/scripts/diagnose-classifier.js [--file path/to/file.pdf]
 *   node api/scripts/diagnose-classifier.js [--docid <memgraph-doc-id>]
 *   node api/scripts/diagnose-classifier.js        (creates a synthetic test)
 */
'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const fs   = require('fs');
const path = require('path');
const args = process.argv.slice(2);

const COL = { GREEN: '\x1b[32m', RED: '\x1b[31m', YELLOW: '\x1b[33m', CYAN: '\x1b[36m', RESET: '\x1b[0m', BOLD: '\x1b[1m' };
const OK  = `${COL.GREEN}✅ PASS${COL.RESET}`;
const FAIL = `${COL.RED}❌ FAIL${COL.RESET}`;
const WARN = `${COL.YELLOW}⚠️  WARN${COL.RESET}`;

let passed = 0, failed = 0, warned = 0;

function check(label, cond, detail = '') {
    const icon = cond === true ? OK : cond === 'warn' ? WARN : FAIL;
    console.log(`  ${icon}  ${label}${detail ? `\n         ${COL.CYAN}${detail}${COL.RESET}` : ''}`);
    if (cond === true) passed++;
    else if (cond === 'warn') warned++;
    else failed++;
}

function sep(title) {
    console.log(`\n${COL.BOLD}${'─'.repeat(60)}${COL.RESET}`);
    console.log(`${COL.BOLD}${title}${COL.RESET}`);
}

// ─── Synthetic test texts ─────────────────────────────────────────────────────

const SYNTHETIC_DOCS = [
    {
        name: 'Secretary-General Bulletin (ST/SGB)',
        text: `ST/SGB/2024/1

SECRETARY-GENERAL'S BULLETIN

Organization of the Department of Safety and Security

The Secretary-General, pursuant to staff rule 1.2, hereby issues the following:

Section 1
PURPOSE

1.1 The present bulletin establishes the organizational structure of the Department of Safety and Security.

Section 2
APPLICABILITY

2.1 The provisions of the present bulletin apply to all staff.

ENTRY INTO FORCE

The present bulletin shall enter into force on 1 January 2024.

(Signed) António Guterres
Secretary-General`,
        metadata: { document_title: 'Secretary-General\'s Bulletin - Department of Safety and Security', filename: 'ST_SGB_2024_1.pdf' },
        expected_type: 'ST_SGB',
        expected_min_score: 0.60
    },
    {
        name: 'General Assembly Resolution (GA_RES)',
        text: `A/RES/77/252

RESOLUTION ADOPTED BY THE GENERAL ASSEMBLY

[On the report of the Fifth Committee (A/77/786)]

77/252. Fifth Committee

The General Assembly,

Recalling its resolution 73/279 of 22 December 2018,

Reaffirming the importance of the United Nations,

1. Decides to continue the work of the Fifth Committee;

2. Resolves to maintain the current structure;

3. Reaffirms its commitment to multilateralism.

THE GENERAL ASSEMBLY ALSO DECIDES to review this resolution.`,
        metadata: { document_title: 'Resolution adopted by the General Assembly A/RES/77/252', filename: 'A_RES_77_252.pdf' },
        expected_type: 'GA_RES',
        expected_min_score: 0.60
    },
    {
        name: 'Standard Operating Procedure',
        text: `STANDARD OPERATING PROCEDURE

SOP - Travel Request Processing

Version: 2.1
Date: January 2024

OBJECTIVE

This standard operating procedure establishes the steps for processing travel requests.

SCOPE

This SOP applies to all UN staff members requesting official travel.

PROCEDURE

Step 1: Submit travel request in Umoja
Step 2: Manager approval
Step 3: Travel office review
Step 4: Ticket issuance

STEPS

1. The requesting staff member completes the travel request form
2. The certifying officer reviews and approves
3. Travel unit processes the request

RESPONSIBILITIES

- Staff members are responsible for submitting requests 10 days in advance
- Managers are responsible for approvals within 5 working days`,
        metadata: { document_title: 'SOP Travel Request Processing', filename: 'SOP_Travel_v2.pdf' },
        expected_type: 'SOP',
        expected_min_score: 0.45
    },
    {
        name: 'OIOS Audit Report',
        text: `INTERNAL AUDIT REPORT

Office of Internal Oversight Services (OIOS)

Audit of the travel management processes
Department of Operational Support

OIOS Report No. 2024/001

EXECUTIVE SUMMARY

The Office of Internal Oversight Services conducted an audit of travel management processes.

FINDINGS AND RECOMMENDATIONS

Finding 1: Inadequate controls over travel advance requests
The audit found that travel advances were not recovered in a timely manner.

Recommendation: Management should implement controls to ensure recovery within 60 days.

Finding 2: Non-compliance with travel policy
Testing revealed that 23% of travel requests did not include required documentation.

CONCLUSION

Overall audit opinion: Partially satisfactory.

Internal Audit Division
OIOS`,
        metadata: { document_title: 'OIOS Internal Audit Report - Travel Management 2024', filename: 'OIOS_Audit_2024_001.pdf' },
        expected_type: 'OIOS_REP',
        expected_min_score: 0.55
    }
];

// ─── Stage 1: Rules loading ───────────────────────────────────────────────────

async function stageRulesLoading(classifier) {
    sep('Stage 1: Classifier rules loading from Memgraph');
    let rules = [];
    try {
        rules = await classifier.loadClassifierRules();
        check('Rules loaded from DB', rules.length > 0, `${rules.length} rules found`);
        check('Each rule has document_type_id', rules.every(r => r.document_type_id), 'document_type_id present on all rules');
        check('Each rule has epistemicLayer', rules.every(r => r.epistemicLayer), rules.map(r => `${r.document_type_id}→${r.epistemicLayer}`).join(', '));
        check('Each rule has normativeWeight', rules.every(r => r.normativeWeight != null), rules.map(r => `${r.document_type_id}→${r.normativeWeight}`).join(', '));
        check('Each rule has parseable rules JSON', rules.every(r => {
            try { const j = typeof r.rules === 'string' ? JSON.parse(r.rules) : r.rules; return Array.isArray(j) && j.length > 0; }
            catch { return false; }
        }), 'All rules JSON arrays OK');
        check('Each rule has threshold', rules.every(r => r.threshold > 0), rules.map(r => `${r.document_type_id}→${r.threshold}`).join(', '));
        console.log(`\n  ${COL.CYAN}Document types found: ${rules.map(r => r.document_type_id).join(', ')}${COL.RESET}`);
    } catch (e) {
        check('DB connection / rules query', false, e.message);
    }
    return rules;
}

// ─── Stage 2: Text extraction ─────────────────────────────────────────────────

async function stageTextExtraction(filePath) {
    sep('Stage 2: Document text extraction');
    const { documentProcessingService } = require('../src/services/knowledge/document-processing.service');
    const ext = path.extname(filePath).toLowerCase();
    console.log(`  File: ${filePath} (${ext})`);

    let text = '';
    try {
        text = await documentProcessingService._readDocumentText(filePath);
        check('Text extraction returned non-empty string', typeof text === 'string' && text.length > 0, `${text.length} characters extracted`);
        const isBinary = /[\x00-\x08\x0e-\x1f\x7f-\x9f]/.test(text.slice(0, 200));
        check('Extracted text is readable (not binary garbage)', !isBinary, isBinary ? 'Binary chars detected in first 200 chars — extraction broken!' : 'No binary chars detected');
        check('Text has meaningful length (>100 chars)', text.length > 100, `${text.length} chars`);
        if (text.length > 0) {
            console.log(`\n  ${COL.CYAN}First 300 chars of extracted text:${COL.RESET}`);
            console.log('  ' + text.slice(0, 300).replace(/\n/g, '\n  '));
        }
    } catch (e) {
        check('Text extraction did not throw', false, e.message);
    }
    return text;
}

// ─── Stage 3: Per-signal scoring ─────────────────────────────────────────────

async function stageScoring(classifier, text, metadata, rules) {
    sep('Stage 3: Per-signal scoring for each document type');
    const results = [];

    if (!rules || rules.length === 0) {
        console.log('  (skipped — no rules loaded)');
        return results;
    }

    for (const rule of rules) {
        const { score, signals } = classifier.scoreDocument(text, metadata, rule);
        console.log(`\n  ${COL.BOLD}${rule.document_type_id}${COL.RESET} (threshold: ${rule.threshold})`);
        console.log(`  Score: ${COL.BOLD}${(score * 100).toFixed(1)}%${COL.RESET}  ${score >= rule.threshold ? COL.GREEN + '→ CLASSIFIED' : COL.RED + '→ below threshold'}${COL.RESET}`);
        for (const sig of signals) {
            const pct = (sig.contribution * 100).toFixed(1);
            const icon = sig.contribution > 0 ? '  ✓' : '  ·';
            if (sig.signal === 'header_match') {
                console.log(`    ${icon} header_match  [${sig.matched ? 'MATCH' : 'miss'}]  +${pct}%  pattern: ${sig.pattern}`);
            } else if (sig.signal === 'keyword_match') {
                console.log(`    ${icon} keyword_match [${sig.matched}/${sig.total}]  +${pct}%`);
            } else if (sig.signal === 'section_match') {
                const ms = (sig.matchedSections || []).join(', ') || 'none';
                console.log(`    ${icon} section_match [${sig.matched}/${sig.total}]  +${pct}%  matched: ${ms}`);
            } else {
                console.log(`    ${icon} ${sig.signal}  +${pct}%`);
            }
        }
        results.push({ rule, score, signals });
    }
    return results;
}

// ─── Stage 4: Full classification ────────────────────────────────────────────

async function stageFullClassify(classifier, text, metadata, expectedType, expectedMinScore) {
    sep(`Stage 4: Full classify() call`);
    console.log(`  Input: "${metadata.document_title}"`);

    let result;
    try {
        result = await classifier.classify(text, metadata);
        console.log(`\n  Result:`);
        console.log(`    document_type_id   : ${result.document_type_id}`);
        console.log(`    document_type_name : ${result.document_type_name}`);
        console.log(`    confidence         : ${(result.confidence * 100).toFixed(1)}%  (${result.confidence_level})`);
        console.log(`    epistemicLayer     : ${result.epistemicLayer}`);
        console.log(`    normativeWeight    : ${result.normativeWeight}`);
        console.log(`    signals            : ${(result.signals || []).length} entries`);
        console.log(`    requires_llm       : ${result.requires_llm_classification}`);
        console.log(`    alternatives       : ${(result.alternatives || []).map(a => `${a.document_type_id}(${(a.confidence*100).toFixed(0)}%)`).join(', ')}`);

        check('classify() returns document_type_id', typeof result.document_type_id === 'string', `"${result.document_type_id}"`);
        check('classify() returns confidence 0-1', result.confidence >= 0 && result.confidence <= 1, `${result.confidence}`);
        check('classify() returns epistemicLayer', result.epistemicLayer != null, `"${result.epistemicLayer}"`);
        check('classify() returns normativeWeight', result.normativeWeight != null, `${result.normativeWeight}`);
        check('classify() returns signals array', Array.isArray(result.signals) && result.signals.length > 0, `${result.signals.length} signals`);

        if (expectedType) {
            check(`Correct type identified (${expectedType})`, result.document_type_id === expectedType,
                result.document_type_id === expectedType ? `Got ${result.document_type_id}` : `Got ${result.document_type_id} instead of ${expectedType}`);
        }
        if (expectedMinScore != null) {
            check(`Score ≥ expected minimum (${(expectedMinScore*100).toFixed(0)}%)`,
                result.confidence >= expectedMinScore,
                `Got ${(result.confidence*100).toFixed(1)}%, needed ${(expectedMinScore*100).toFixed(0)}%`);
        }
    } catch (e) {
        check('classify() did not throw', false, e.message);
    }

    return result;
}

// ─── Stage 5: REVIEW_CONFIDENCE_THRESHOLD alignment ──────────────────────────

function stageThresholdAlignment() {
    sep('Stage 5: REVIEW_CONFIDENCE_THRESHOLD alignment');
    const src = fs.readFileSync(path.resolve(__dirname, '../src/services/knowledge/document-processing.service.js'), 'utf-8');
    const match = src.match(/REVIEW_CONFIDENCE_THRESHOLD\s*=\s*([\d.]+)/);
    const threshold = match ? parseFloat(match[1]) : null;
    check('REVIEW_CONFIDENCE_THRESHOLD defined', threshold != null, match ? match[0] : 'not found');
    check('REVIEW_CONFIDENCE_THRESHOLD ≤ 0.60 (aligned with rule thresholds)', threshold != null && threshold <= 0.60,
        threshold != null ? `Value: ${threshold}` : 'Could not parse');
    return threshold;
}

// ─── Stage 6: PDF extraction is async ────────────────────────────────────────

function stageAsyncCheck() {
    sep('Stage 6: _readDocumentText is async (not blocking on PDFs)');
    const src = fs.readFileSync(path.resolve(__dirname, '../src/services/knowledge/document-processing.service.js'), 'utf-8');
    check('_readDocumentText declared as async', src.includes('async _readDocumentText('), 'function signature');
    check('classifyDocument awaits _readDocumentText', /await this\._readDocumentText/.test(src), 'await keyword present');
    check('pdf-parse used for .pdf files', src.includes("require('pdf-parse')") || src.includes('require("pdf-parse")'), 'pdf-parse import');
    check('mammoth used for .docx files', src.includes("require('mammoth')") || src.includes('require("mammoth")'), 'mammoth import');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    console.log(`${COL.BOLD}╔════════════════════════════════════════════════════════╗${COL.RESET}`);
    console.log(`${COL.BOLD}║   Document Classifier Diagnostic — UN ProjectAdvisor   ║${COL.RESET}`);
    console.log(`${COL.BOLD}╚════════════════════════════════════════════════════════╝${COL.RESET}`);

    const classifier = require('../src/services/knowledge/document-classifier');

    // Stage 5 & 6 — static code checks (no DB needed)
    stageThresholdAlignment();
    stageAsyncCheck();

    // Stage 1 — rules from DB
    let rules = [];
    try {
        rules = await stageRulesLoading(classifier);
    } catch (e) {
        console.log(`  ${WARN}  DB not available — skipping DB-dependent stages`);
    }

    // File provided?
    const fileIdx = args.indexOf('--file');
    if (fileIdx !== -1 && args[fileIdx + 1]) {
        const filePath = path.resolve(args[fileIdx + 1]);
        if (!fs.existsSync(filePath)) {
            console.log(`\n${COL.RED}File not found: ${filePath}${COL.RESET}`);
        } else {
            const text = await stageTextExtraction(filePath);
            if (rules.length > 0) {
                const meta = { document_title: path.basename(filePath), filename: path.basename(filePath) };
                await stageScoring(classifier, text, meta, rules);
                await stageFullClassify(classifier, text, meta, null, null);
            }
        }
    } else if (rules.length > 0) {
        // Run synthetic document tests
        sep('Stage 3+4: Synthetic document scoring (no real file needed)');
        for (const doc of SYNTHETIC_DOCS) {
            console.log(`\n${COL.BOLD}  ► ${doc.name}${COL.RESET}`);
            await stageScoring(classifier, doc.text, doc.metadata, rules);
            await stageFullClassify(classifier, doc.text, doc.metadata, doc.expected_type, doc.expected_min_score);
        }
    }

    // Summary
    sep('Diagnostic Summary');
    console.log(`  ${COL.GREEN}PASS: ${passed}${COL.RESET}`);
    if (warned) console.log(`  ${COL.YELLOW}WARN: ${warned}${COL.RESET}`);
    if (failed)  console.log(`  ${COL.RED}FAIL: ${failed}${COL.RESET}`);
    console.log('');

    process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
    console.error('\nDiagnostic runner error:', e.message);
    console.error(e.stack);
    process.exit(1);
});
