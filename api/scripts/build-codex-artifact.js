#!/usr/bin/env node
/**
 * CODEX-ARTIFACT-001: Build consolidated Codex document
 *
 * Assembles all Codex parts, ADRs, and appendices into a single
 * canonical Markdown document.
 *
 * Usage:
 *   node api/scripts/build-codex-artifact.js
 *   node api/scripts/build-codex-artifact.js --output path/to/file.md
 */

const fs = require('fs');
const path = require('path');

const CODEX_DIR = path.join(__dirname, '../../docs/codex');

// Version is resolved at runtime: --version CLI flag, or fetched from CodexMetadata, or fallback
let CODEX_VERSION = '0.1.3'; // fallback, overridden by main()

function getDefaultOutput() {
  return path.join(CODEX_DIR, 'artifacts', `CODEX_UN_PROJECTADVISOR_v${CODEX_VERSION}.md`);
}

// Parts in canonical order
const PARTS = [
  { title: 'Часть 0: Манифест для ИИ-агентов', file: 'manifesto/AI_MANIFESTO.md' },
  { title: 'Часть I: CODEX-CRUD — Стандарт операций', file: 'standards/CODEX-CRUD.md' },
  { title: 'Часть II: CODEX-META — Стандарт метаданных', file: 'standards/CODEX-META.md' },
  { title: 'Часть III: CODEX-VERSION — Стандарт версионности', file: 'standards/CODEX-VERSION.md' },
  { title: 'Часть IV: CODEX-NS — Стандарт namespace', file: 'standards/CODEX-NS.md' },
  { title: 'Часть V: CODEX-VALID — Стандарт валидации', file: 'standards/CODEX-VALID.md' },
  { title: 'Часть VI: CODEX-CATALOG — Стандарт каталога', file: 'standards/CODEX-CATALOG.md' },
  { title: 'Часть VII: CODEX-POLY — Протокол Polystore', file: 'standards/CODEX-POLY.md' },
  { title: 'Часть VIII: Саморазвивающаяся система', file: 'future/SELF-EVOLUTION.md' },
  { title: 'Часть IX: CODEX-DOMAINS — Стандарты типов информации', file: 'standards/CODEX-DOMAINS.md' },
];

const ADRS = [
  { file: 'ADR-001-memgraph-knowledge-graph.md', title: 'Memgraph as Knowledge Graph Store' },
  { file: 'ADR-002-gxe-aopeg-execution.md', title: 'GXE AOPEG Execution Model' },
  { file: 'ADR-003-four-namespace-architecture.md', title: 'Four-Namespace Architecture' },
  { file: 'ADR-004-bitemporal-versioning.md', title: 'Bi-temporal Versioning with Hash Chain' },
  { file: 'ADR-005-polystore-architecture.md', title: 'Polystore Architecture' },
  { file: 'ADR-006-information-types.md', title: 'Information Types Classification' },
];

function readFile(relativePath) {
  const fullPath = path.join(CODEX_DIR, relativePath);
  if (fs.existsSync(fullPath)) {
    return fs.readFileSync(fullPath, 'utf-8').trim();
  }
  return `> [Файл не найден: ${relativePath}]`;
}

function stripFirstHeading(content) {
  // Remove first # heading and any > blockquote header lines that follow
  let result = content.replace(/^#\s+[^\n]+\n+/, '');
  // Remove frontmatter-style blockquotes at the start (> Часть..., > Статус..., etc.)
  result = result.replace(/^(>\s*[^\n]*\n)+\n*/, '');
  return result.trim();
}

function buildDocument() {
  const today = new Date().toISOString().split('T')[0];
  const timestamp = new Date().toISOString();

  let doc = '';

  // ── Header ──────────────────────────────────────────────────────────────
  doc += `# КОДЕКС UN PROJECTADVISOR v${CODEX_VERSION}\n\n`;
  doc += `> Канонический стандарт хранения, версионирования и управления знаниями\n`;
  doc += `> в графовой базе данных UN ProjectAdvisor.\n`;
  doc += `>\n`;
  doc += `> **Дата:** ${today}\n`;
  doc += `> **Статус:** В разработке (${CODEX_VERSION}-draft)\n`;
  doc += `> **Аудитория:** ИИ-агенты, архитекторы, операторы\n\n`;
  doc += `---\n\n`;

  // ── Table of Contents ───────────────────────────────────────────────────
  doc += `## Оглавление\n\n`;
  for (let i = 0; i < PARTS.length; i++) {
    doc += `- ${PARTS[i].title}\n`;
  }
  doc += `- Приложение A: Architecture Decision Records (6 ADR)\n`;
  doc += `- Приложение B: Changelog\n`;
  doc += `- Статистика Кодекса v${CODEX_VERSION}\n`;
  doc += `\n---\n\n`;

  // ── Introduction from INDEX ─────────────────────────────────────────────
  const indexContent = readFile('CODEX_INDEX.md');
  doc += `## Введение\n\n`;
  doc += stripFirstHeading(indexContent);
  doc += `\n\n---\n\n`;

  // ── Parts 0-IX ──────────────────────────────────────────────────────────
  for (const part of PARTS) {
    const content = readFile(part.file);
    doc += `## ${part.title}\n\n`;
    doc += stripFirstHeading(content);
    doc += `\n\n---\n\n`;
  }

  // ── Appendix A: ADRs ───────────────────────────────────────────────────
  doc += `## Приложение A: Architecture Decision Records\n\n`;
  doc += `### Индекс ADR\n\n`;
  doc += `| ADR | Решение | Статус |\n`;
  doc += `|-----|---------|--------|\n`;
  for (const adr of ADRS) {
    const num = adr.file.match(/ADR-(\d+)/)[1];
    doc += `| ADR-${num} | ${adr.title} | ACCEPTED |\n`;
  }
  doc += `\n`;

  for (const adr of ADRS) {
    const content = readFile(`adr/${adr.file}`);
    const num = adr.file.match(/ADR-(\d+)/)[1];
    doc += `### ADR-${num}: ${adr.title}\n\n`;
    doc += stripFirstHeading(content);
    doc += `\n\n---\n\n`;
  }

  // ── Appendix B: Changelog ──────────────────────────────────────────────
  doc += `## Приложение B: Changelog\n\n`;
  const changelog = readFile('CHANGELOG.md');
  doc += stripFirstHeading(changelog);
  doc += `\n\n---\n\n`;

  // ── Statistics ─────────────────────────────────────────────────────────
  doc += `## Статистика Кодекса v0.1.3\n\n`;
  doc += `| Метрика | Значение |\n`;
  doc += `|---------|----------|\n`;
  doc += `| Частей Кодекса | 10 (0-IX) |\n`;
  doc += `| ADR | 6 |\n`;
  doc += `| Information Types | 17 |\n`;
  doc += `| Tool nodes в графе | 145 |\n`;
  doc += `| Tool categories | 19 (11 MCP + 8 AOPEG) |\n`;
  doc += `| Tool namespaces | 3 (CODEX, CORE, PROJECT) |\n`;
  doc += `| JSON Schemas | 8 |\n`;
  doc += `| Error codes | 18+ |\n`;
  doc += `| Background jobs | 2 (OrphanDetector, TombstoneExpirer) |\n`;
  doc += `| Seed scripts | 2 (seed-tool-catalog, seed-aopeg-executors) |\n`;
  doc += `| Узлов в графе | ~4,800+ |\n`;
  doc += `| Рёбер в графе | ~18,500+ |\n`;
  doc += `| Namespaces | 4 (CORE, PROJECT, META, COMMON) |\n`;
  doc += `\n---\n\n`;
  doc += `*Сгенерировано: ${timestamp}*\n`;
  doc += `*Версия: ${CODEX_VERSION}*\n`;
  doc += `*Сборка: build-codex-artifact.js*\n`;

  return doc;
}

async function resolveVersion() {
  // CLI flag takes precedence
  const args = process.argv.slice(2);
  const vIdx = args.indexOf('--version');
  if (vIdx !== -1 && args[vIdx + 1]) return args[vIdx + 1];

  // Try reading from Memgraph CodexMetadata
  try {
    const memgraph = require('../src/services/memgraph.service');
    const result = await memgraph.runQuery(`
      MATCH (m:CodexMetadata {id: 'codex-metadata'})
      RETURN m.version AS version
    `);
    if (result[0]?.version) return result[0].version;
  } catch { /* Memgraph unavailable — use fallback */ }

  return '0.1.3';
}

async function main() {
  CODEX_VERSION = await resolveVersion();

  const args = process.argv.slice(2);
  const outputIdx = args.indexOf('--output');
  const outputPath = outputIdx !== -1 ? args[outputIdx + 1] : getDefaultOutput();

  console.log(`=== CODEX-ARTIFACT-001: Building Codex v${CODEX_VERSION} ===\n`);
  console.log(`Source: ${CODEX_DIR}`);
  console.log(`Output: ${outputPath}\n`);

  // Check source files
  let missing = 0;
  for (const part of PARTS) {
    const fullPath = path.join(CODEX_DIR, part.file);
    if (!fs.existsSync(fullPath)) {
      console.warn(`  MISSING: ${part.file}`);
      missing++;
    }
  }
  for (const adr of ADRS) {
    const fullPath = path.join(CODEX_DIR, 'adr', adr.file);
    if (!fs.existsSync(fullPath)) {
      console.warn(`  MISSING: adr/${adr.file}`);
      missing++;
    }
  }
  if (missing > 0) {
    console.warn(`\n${missing} file(s) missing — will be marked in output.\n`);
  }

  // Build
  const doc = buildDocument();

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  fs.mkdirSync(outputDir, { recursive: true });

  fs.writeFileSync(outputPath, doc, 'utf-8');

  const lines = doc.split('\n').length;
  const chars = doc.length;
  const sizeKB = (Buffer.byteLength(doc, 'utf-8') / 1024).toFixed(1);

  console.log(`Parts included: ${PARTS.length}`);
  console.log(`ADRs included: ${ADRS.length}`);
  console.log(`\nArtifact created:`);
  console.log(`  Lines:  ${lines}`);
  console.log(`  Chars:  ${chars}`);
  console.log(`  Size:   ${sizeKB} KB`);
  console.log(`  Path:   ${outputPath}`);
}

main().catch(err => { console.error('Build failed:', err.message); process.exit(1); });
