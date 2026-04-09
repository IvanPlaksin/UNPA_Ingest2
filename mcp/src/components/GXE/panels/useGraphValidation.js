/**
 * useGraphValidation — post-apply validation for GXE graphs.
 *
 * Checks structural integrity after AI Assistant applies actions:
 * - Single workflow.start, at least one workflow.end
 * - No orphan nodes
 * - Condition nodes have both branches
 * - No broken chains (missing incoming edges)
 */

import { useMemo } from 'react';

export default function useGraphValidation(nodes, edges) {
  const issues = useMemo(() => {
    if (!nodes || nodes.length === 0) return [];

    const result = [];
    const getType = (n) => n.data?.type || n.type;

    // 1. workflow.start check
    const startNodes = nodes.filter(n => getType(n) === 'workflow.start');
    if (startNodes.length === 0) {
      result.push({ level: 'error', message: 'Нет workflow.start' });
    } else if (startNodes.length > 1) {
      result.push({ level: 'error', message: `${startNodes.length} workflow.start — должен быть один` });
    }

    // 2. workflow.end check
    const endNodes = nodes.filter(n => getType(n) === 'workflow.end');
    if (endNodes.length === 0) {
      result.push({ level: 'error', message: 'Нет workflow.end' });
    }

    // 3. Orphan nodes (no incoming AND no outgoing, except start)
    for (const node of nodes) {
      if (getType(node) === 'workflow.start') continue;
      const hasIn = edges.some(e => e.target === node.id);
      const hasOut = edges.some(e => e.source === node.id);
      if (!hasIn && !hasOut) {
        result.push({ level: 'warning', message: `Узел ${node.data?.label || node.id} не подключён` });
      }
    }

    // 4. Condition completeness
    const condNodes = nodes.filter(n => getType(n) === 'workflow.condition');
    for (const node of condNodes) {
      const outgoing = edges.filter(e => e.source === node.id);
      if (outgoing.length < 2) {
        result.push({
          level: 'warning',
          message: `${node.data?.label || node.id} (condition) — нужны оба исхода (true/false), есть ${outgoing.length}`,
        });
      }
    }

    // 5. Missing incoming edges (broken chain)
    for (const node of nodes) {
      if (getType(node) === 'workflow.start') continue;
      const hasIn = edges.some(e => e.target === node.id);
      if (!hasIn) {
        result.push({
          level: 'warning',
          message: `${node.data?.label || node.id} — нет входящего ребра`,
        });
      }
    }

    // 6. End nodes should not have outgoing edges
    for (const node of endNodes) {
      const hasOut = edges.some(e => e.source === node.id);
      if (hasOut) {
        result.push({
          level: 'warning',
          message: `${node.data?.label || node.id} (end) имеет исходящие рёбра`,
        });
      }
    }

    return result;
  }, [nodes, edges]);

  const errors = useMemo(() => issues.filter(i => i.level === 'error'), [issues]);
  const warnings = useMemo(() => issues.filter(i => i.level === 'warning'), [issues]);
  const isValid = errors.length === 0;

  return { issues, errors, warnings, isValid };
}
