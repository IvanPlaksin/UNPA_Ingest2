'use strict';

const {
  serializePath,
  narrate,
  pathStrength,
  strengthLabel,
  verbFor,
  EDGE_VERBS
} = require('../path-serializer');

const seg = (name, edgeType = null, edgeDirection = null) => ({
  nodeId: name.toLowerCase().replace(/\s/g, '_'),
  nodeType: 'entity',
  nodeName: name,
  edgeType,
  edgeDirection
});

describe('Radix Assembly: path-serializer', () => {
  describe('edge verbs', () => {
    it('covers every workspace edge type in both directions', () => {
      const workspaceEdges = [
        'RELATES_TO', 'BELONGS_TO', 'CONTAINS', 'WORKS_IN', 'DEPENDS_ON',
        'IMPLEMENTS', 'REFERENCES', 'EXTENDS', 'PRODUCES', 'CONSUMES',
        'TRIGGERS', 'GOVERNS', 'CONFLICTS_WITH'
      ];

      for (const type of workspaceEdges) {
        expect(EDGE_VERBS[type]).toBeDefined();
        expect(typeof EDGE_VERBS[type].outgoing).toBe('string');
        expect(typeof EDGE_VERBS[type].incoming).toBe('string');
      }
    });

    it('inverts the verb for an incoming hop', () => {
      // Reading this direction backwards would invert the claim.
      expect(verbFor('GOVERNS', 'outgoing')).toBe('governs');
      expect(verbFor('GOVERNS', 'incoming')).toBe('is governed by');
    });

    it('keeps symmetric relations symmetric', () => {
      expect(verbFor('CONFLICTS_WITH', 'outgoing')).toBe('conflicts with');
      expect(verbFor('CONFLICTS_WITH', 'incoming')).toBe('conflicts with');
      expect(verbFor('RELATES_TO', 'outgoing')).toBe(verbFor('RELATES_TO', 'incoming'));
    });

    it('falls back readably for an unmapped edge type', () => {
      expect(verbFor('MY_CUSTOM_EDGE', 'outgoing')).toBe('is linked to');
      expect(verbFor('MY_CUSTOM_EDGE', 'incoming')).toBe('is linked from');
    });

    it('treats a null direction as outgoing', () => {
      expect(verbFor('IMPLEMENTS', null)).toBe('implements');
    });
  });

  describe('narrate', () => {
    it('renders a single hop as a clause', () => {
      expect(narrate([seg('User'), seg('Session', 'DEPENDS_ON', 'outgoing')]))
        .toBe('User depends on Session');
    });

    it('renders an incoming hop with the inverted verb', () => {
      expect(narrate([seg('Session'), seg('SessionTimeout', 'GOVERNS', 'incoming')]))
        .toBe('Session is governed by SessionTimeout');
    });

    it('chains two hops with "which"', () => {
      const path = [
        seg('HybridRAG'),
        seg('UN ProjectAdvisor', 'IMPLEMENTS', 'incoming'),
        seg('LightRAG', 'IMPLEMENTS', 'outgoing')
      ];

      expect(narrate(path))
        .toBe('HybridRAG is implemented by UN ProjectAdvisor, which implements LightRAG');
    });

    it('chains three hops', () => {
      const path = [
        seg('A'),
        seg('B', 'CONTAINS', 'outgoing'),
        seg('C', 'GOVERNS', 'outgoing'),
        seg('D', 'TRIGGERS', 'outgoing')
      ];

      expect(narrate(path)).toBe('A contains B, which governs C, which triggers D');
    });

    it('emits nothing for a seed-only or missing path', () => {
      expect(narrate([seg('A')])).toBe('');
      expect(narrate([])).toBe('');
      expect(narrate(null)).toBe('');
      expect(narrate(undefined)).toBe('');
    });

    it('falls back to the node id when a name is missing', () => {
      const path = [
        { nodeId: 'n1', nodeName: null, edgeType: null, edgeDirection: null },
        { nodeId: 'n2', nodeName: null, edgeType: 'IMPLEMENTS', edgeDirection: 'outgoing' }
      ];
      expect(narrate(path)).toBe('n1 implements n2');
    });
  });

  describe('pathStrength', () => {
    it('multiplies the edge weights along the path', () => {
      const path = [
        seg('A'),
        seg('B', 'DEPENDS_ON', 'outgoing'), // 0.9
        seg('C', 'GOVERNS', 'outgoing') // 0.8
      ];
      expect(pathStrength(path)).toBeCloseTo(0.72, 10);
    });

    it('matches the score the expansion strategy ranked by', () => {
      // Same formula, so the printed label can never contradict the ranking.
      const path = [seg('A'), seg('B', 'IMPLEMENTS', 'outgoing')];
      expect(pathStrength(path)).toBe(1);
    });

    it('uses the fallback weight for unknown edge types', () => {
      const path = [seg('A'), seg('B', 'MY_CUSTOM_EDGE', 'outgoing')];
      expect(pathStrength(path)).toBeCloseTo(0.3, 10);
    });

    it('is zero for a path with no hops', () => {
      expect(pathStrength([seg('A')])).toBe(0);
      expect(pathStrength(null)).toBe(0);
    });

    it('honours a caller-supplied weight table', () => {
      const path = [seg('A'), seg('B', 'IMPLEMENTS', 'outgoing')];
      expect(pathStrength(path, { IMPLEMENTS: 0.5 })).toBeCloseTo(0.5, 10);
    });
  });

  describe('strengthLabel', () => {
    it('bands the strength qualitatively', () => {
      expect(strengthLabel(1.0)).toBe('strong');
      expect(strengthLabel(0.7)).toBe('strong');
      expect(strengthLabel(0.69)).toBe('moderate');
      expect(strengthLabel(0.4)).toBe('moderate');
      expect(strengthLabel(0.39)).toBe('weak');
      expect(strengthLabel(0)).toBe('weak');
    });
  });

  describe('serializePath', () => {
    it('renders sentence plus strength', () => {
      const path = [seg('A'), seg('B', 'IMPLEMENTS', 'outgoing')];
      expect(serializePath(path)).toBe('A implements B (connection: strong)');
    });

    it('labels a two-hop path by its combined strength', () => {
      const path = [
        seg('User'),
        seg('Session', 'BELONGS_TO', 'outgoing'), // 0.4
        seg('Timeout', 'RELATES_TO', 'outgoing') // 0.5 → 0.2
      ];
      expect(serializePath(path)).toContain('(connection: weak)');
    });

    it('prints no raw number — the product implies precision it lacks', () => {
      const path = [
        seg('A'),
        seg('B', 'DEPENDS_ON', 'outgoing'),
        seg('C', 'GOVERNS', 'outgoing')
      ];
      const out = serializePath(path);

      expect(out).not.toMatch(/0\.\d/);
      expect(out).toContain('(connection: strong)');
    });

    it('uses no arrow notation', () => {
      const path = [seg('A'), seg('B', 'IMPLEMENTS', 'incoming')];
      const out = serializePath(path);

      expect(out).not.toContain('-->');
      expect(out).not.toContain('<--');
      expect(out).not.toContain('[IMPLEMENTS]');
    });

    it('emits nothing when there is no path', () => {
      expect(serializePath(undefined)).toBe('');
      expect(serializePath([seg('A')])).toBe('');
    });
  });
});
