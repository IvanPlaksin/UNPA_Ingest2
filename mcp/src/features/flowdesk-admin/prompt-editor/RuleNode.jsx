/**
 * RuleNode (P6) — one rule = one node. Modeled on the Structural Editor's
 * FieldNode. Category-colored, shows title/text preview + appliesTo + enabled.
 *
 * EC-010 adds two things that are about WHETHER THE RULE SPEAKS rather than what it
 * says, which is why both live on the node itself in every canvas mode:
 *
 *   · the condition, because a rule that only applies while filling a form is a
 *     different object from one that applies always, and nothing else on the canvas
 *     would tell them apart;
 *   · in coverage mode, how many of the nine contexts it reaches — a rule reaching
 *     none is dead weight, and it should be visible here rather than only in a report
 *     somebody has to go and open.
 */
import React from 'react';
import { Handle, Position } from 'reactflow';
import { CATEGORY_COLOR } from './rulesStore';

/** Big, light, and outside the border, so it reads as "drag from here". */
const HANDLE = {
  width: 11, height: 11, background: '#0f172a', border: '2px solid #94a3b8',
};

/** Reached-contexts → how the node reads at a glance. 0 is the one that matters. */
function coverageStyle(cov) {
  if (!cov) return null;
  if (cov.reached === 0) return { border: '#ef4444', label: 'reaches no context', bad: true };
  if (cov.reached === cov.total) return { border: '#22c55e', label: `${cov.reached}/${cov.total} contexts` };
  return { border: '#f59e0b', label: `${cov.reached}/${cov.total} contexts` };
}

function RuleNode({ data, selected }) {
  const color = CATEGORY_COLOR[data.category] || CATEGORY_COLOR.custom;
  const disabled = data.enabled === false;
  const cov = data._mode === 'coverage' ? coverageStyle(data._coverage) : null;
  const border = cov ? cov.border : color;

  return (
    <div style={{
      minWidth: 190, maxWidth: 240, borderRadius: 8,
      border: `2px solid ${selected ? '#fff' : border}`,
      background: '#1e293b', color: '#e2e8f0',
      opacity: disabled ? 0.5 : 1, boxShadow: selected ? `0 0 0 2px ${border}` : 'none',
      fontFamily: 'Inter, sans-serif',
    }}>
      {/* The connection points have to be VISIBLE and big enough to hit. ReactFlow's
          default handle is a 6px dot in the node's own colour: on this canvas it read
          as part of the border, and an operator with no visible place to drag from
          concludes, correctly, that connections cannot be made here. */}
      <Handle type="target" position={Position.Top} style={HANDLE} />
      <div style={{ background: color, padding: '3px 8px', borderRadius: '5px 5px 0 0', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#0f172a', display: 'flex', justifyContent: 'space-between' }}>
        <span>{data.category}</span>
        {disabled && <span>off</span>}
      </div>
      <div style={{ padding: '6px 8px' }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{data.title || data.key}</div>
        <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.3, maxHeight: 46, overflow: 'hidden' }}>
          {data.text || <em>empty — click to edit</em>}
        </div>
        {/* Shown in every mode: the condition decides whether this rule reaches the
            model at all, which outranks any relation drawn between nodes. */}
        {data._condition && (
          <div style={{ marginTop: 4, fontSize: 9, color: '#fbbf24', display: 'flex', gap: 3, alignItems: 'center' }}>
            <span aria-hidden>⚡</span>
            <span>{data._condition}</span>
          </div>
        )}
        {cov && (
          <div style={{ marginTop: 4, fontSize: 9, color: cov.bad ? '#fca5a5' : '#94a3b8' }}>
            {cov.label}
          </div>
        )}
        {Array.isArray(data.appliesTo) && data.appliesTo.length > 0 && (
          <div style={{ marginTop: 4, fontSize: 9, color: '#64748b' }}>
            → {data.appliesTo.join(', ')}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} style={HANDLE} />
    </div>
  );
}

export default React.memo(RuleNode);
