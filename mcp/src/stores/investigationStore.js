import { create } from 'zustand';

const API = '/api/v1/investigation';

export const useInvestigationStore = create((set, get) => ({
  // ── Session list state ───────────────────────────────────────────────────────
  sessions: [],
  loading: false,
  error: null,
  createDialogOpen: false,

  fetchSessions: async (opts = {}) => {
    set({ loading: true, error: null });
    try {
      const params = new URLSearchParams();
      if (opts.status) params.set('status', opts.status);
      params.set('parentSessionId', 'null');
      params.set('limit', opts.limit || 100);
      const res = await fetch(`${API}/sessions?${params}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      set({ sessions: json.data, loading: false });
    } catch (e) {
      set({ error: e.message, loading: false });
    }
  },

  createSession: async ({ name, description }) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`${API}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      set(s => ({ sessions: [json.data, ...s.sessions], loading: false, createDialogOpen: false }));
      return json.data;
    } catch (e) {
      set({ error: e.message, loading: false });
      throw e;
    }
  },

  closeSession: async (sessionId) => {
    try {
      const res = await fetch(`${API}/sessions/${sessionId}/close`, { method: 'POST' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      set(s => ({
        sessions: s.sessions.map(sess =>
          sess.sessionId === sessionId ? json.data : sess
        ),
      }));
    } catch (e) {
      set({ error: e.message });
    }
  },

  setCreateDialogOpen: (open) => set({ createDialogOpen: open }),
  clearError: () => set({ error: null }),

  // ── Session detail state ─────────────────────────────────────────────────────
  activeSession: null,
  sessionLoading: false,
  sessionError: null,

  messages: [],       // { role: 'user'|'assistant', text, primitiveType, artifact, ts }
  artifacts: [],      // InvestigationArtifact[]
  versions: [],       // InvestigationVersion[]
  currentVersion: null,
  selectedArtifactId: null,
  chatSending: false,
  driftInfo: null,

  fetchSession: async (sessionId) => {
    set({ sessionLoading: true, sessionError: null, activeSession: null, messages: [], artifacts: [], versions: [], currentVersion: null, driftInfo: null });
    try {
      const [sessRes, artifactsRes, versionsRes, currentRes] = await Promise.all([
        fetch(`${API}/sessions/${sessionId}`),
        fetch(`${API}/sessions/${sessionId}/artifacts?limit=200`),
        fetch(`${API}/sessions/${sessionId}/versions?limit=100`),
        fetch(`${API}/sessions/${sessionId}/versions/current`),
      ]);
      const [sessJson, artifactsJson, versionsJson, currentJson] = await Promise.all([
        sessRes.json(), artifactsRes.json(), versionsRes.json(), currentRes.json(),
      ]);
      if (!sessJson.success) throw new Error(sessJson.error);

      const artifacts = artifactsJson.success ? artifactsJson.data : [];
      const versions = versionsJson.success ? versionsJson.data : [];
      const currentVersion = currentJson.success ? currentJson.data : null;

      // Load persisted chat messages; fall back to artifact reconstruction if none exist
      let messages = [];
      try {
        const msgsRes = await fetch(`${API}/sessions/${sessionId}/messages`);
        const msgsJson = await msgsRes.json();
        if (msgsJson.success && msgsJson.data.length > 0) {
          const artifactById = Object.fromEntries(artifacts.map(a => [a.artifactId, a]));
          messages = msgsJson.data.map(m => ({
            ...m,
            ts: m.createdAt,
            artifact: m.artifactId ? (artifactById[m.artifactId] || null) : null,
            type: m.type || (m.primitiveType ? 'ARTIFACT_PROPOSED' : 'FREEFORM'),
          }));
        }
      } catch {}

      // Fallback: reconstruct from artifacts if no persisted messages
      if (messages.length === 0) {
        messages = artifacts.map(a => ({
          role: 'assistant',
          primitiveType: a.primitiveType,
          artifact: a,
          text: _defaultArtifactText(a),
          ts: a.createdAt,
          artifactId: a.artifactId,
          type: 'ARTIFACT_PROPOSED',
        })).sort((a, b) => new Date(a.ts) - new Date(b.ts));
      }

      set({
        activeSession: sessJson.data,
        artifacts,
        versions,
        currentVersion,
        messages,
        selectedArtifactId: artifacts.length > 0 ? artifacts[artifacts.length - 1].artifactId : null,
        sessionLoading: false,
      });
    } catch (e) {
      set({ sessionError: e.message, sessionLoading: false });
    }
  },

  sendMessage: async (sessionId, text, resolvedEntities = []) => {
    if (!text.trim()) return;
    const userMsg = { role: 'user', text, ts: new Date().toISOString() };
    set(s => ({ messages: [...s.messages, userMsg], chatSending: true, sessionError: null }));

    try {
      const { currentVersion } = get();
      const res = await fetch(`${API}/sessions/${sessionId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          context: {
            currentVersionId: currentVersion?.versionId || null,
            resolvedEntities,
          },
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      const result = json.data;
      const assistantMsg = {
        role: 'assistant',
        type: result.type,
        primitiveType: result.primitiveType,
        params: result.params || null,
        artifact: result.artifact,
        text: result.message,
        ts: new Date().toISOString(),
        artifactId: result.artifact?.artifactId || null,
        // CLARIFICATION fields
        clarificationIssues: result.clarificationIssues || null,
        clarificationOptions: result.clarificationOptions || null,
        pendingParams: result.pendingParams || null,
      };

      set(s => {
        const newArtifacts = result.artifact
          ? [...s.artifacts, result.artifact]
          : s.artifacts;
        return {
          messages: [...s.messages, assistantMsg],
          artifacts: newArtifacts,
          currentVersion: result.newEvidentiaryVersion
            ? { versionId: result.versionId }
            : s.currentVersion,
          selectedArtifactId: result.artifact?.artifactId || s.selectedArtifactId,
          chatSending: false,
        };
      });
    } catch (e) {
      set(s => ({
        messages: [...s.messages, { role: 'error', text: e.message, ts: new Date().toISOString() }],
        chatSending: false,
        sessionError: e.message,
      }));
    }
  },

  selectArtifact: (artifactId) => set({ selectedArtifactId: artifactId }),

  driftPanelOpen: false,

  checkDrift: async (sessionId) => {
    const { currentVersion } = get();
    const versionParam = currentVersion?.versionId ? `?versionId=${currentVersion.versionId}` : '';
    try {
      const res = await fetch(`${API}/sessions/${sessionId}/drift${versionParam}`);
      const json = await res.json();
      if (json.success) set({ driftInfo: json.data });
    } catch {}
  },

  openDriftPanel: () => set({ driftPanelOpen: true }),
  closeDriftPanel: () => set({ driftPanelOpen: false }),

  refreshArtifact: async (sessionId, artifactId) => {
    const res = await fetch(`${API}/sessions/${sessionId}/artifacts/${artifactId}/refresh`, { method: 'POST' });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    // Refresh session state
    const { fetchSession } = get();
    await fetchSession(sessionId);
    return json.data;
  },

  refreshAllDriftedArtifacts: async (sessionId) => {
    const { driftInfo, refreshArtifact } = get();
    const drifted = driftInfo?.driftedArtifacts || [];
    for (const artifact of drifted) {
      try {
        await refreshArtifact(sessionId, artifact.artifactId);
      } catch (err) {
        console.warn('[Store] Refresh failed for', artifact.artifactId, err.message);
      }
    }
    // Re-check drift after all refreshes
    await get().checkDrift(sessionId);
  },

  // ── Tool Dialog (run-tool / commit / discard) ─────────────────────────────

  runTool: async (sessionId, primitiveType, params) => {
    const res = await fetch(`${API}/sessions/${sessionId}/run-tool`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ primitiveType, params }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    // Add PROPOSED artifact to the store immediately
    if (json.data?.artifact) {
      set(s => ({ artifacts: [...s.artifacts, json.data.artifact] }));
    }
    return json.data;
  },

  appendArtifact: (artifact) => {
    if (!artifact) return;
    set(s => ({
      artifacts: s.artifacts.some(a => a.artifactId === artifact.artifactId)
        ? s.artifacts
        : [...s.artifacts, artifact],
    }));
  },

  commitArtifact: async (sessionId, artifactId) => {
    const res = await fetch(`${API}/artifacts/${artifactId}/commit`, { method: 'POST' });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    // Refresh session to pick up the new COMMITTED artifact + version
    const { fetchSession } = get();
    await fetchSession(sessionId);
    return json.data;
  },

  discardArtifact: async (artifactId) => {
    const res = await fetch(`${API}/artifacts/${artifactId}`, { method: 'DELETE' });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    return json.data;
  },

  rerunArtifact: async (sessionId, artifactId) => {
    const res = await fetch(`${API}/sessions/${sessionId}/artifacts/${artifactId}/refresh`, { method: 'POST' });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    const { fetchSession } = get();
    await fetchSession(sessionId);
    return json.data;
  },

  cutCheckpoint: async (sessionId, message) => {
    try {
      const res = await fetch(`${API}/sessions/${sessionId}/checkpoint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      set(s => ({
        versions: [...s.versions, json.data],
        currentVersion: json.data,
      }));
      return json.data;
    } catch (e) {
      set({ sessionError: e.message });
      throw e;
    }
  },

  resetSession: () => set({
    activeSession: null, messages: [], artifacts: [], versions: [],
    currentVersion: null, selectedArtifactId: null, driftInfo: null,
    sessionLoading: false, sessionError: null, chatSending: false,
    driftPanelOpen: false,
    // version timeline state
    viewingVersionId: null, isSnapshotMode: false,
    snapshotState: null, snapshotLoading: false,
    isDiffMode: false, diffFromVersionId: null, diffToVersionId: null,
    diffResult: null, diffLoading: false,
    // subsessions
    subsessions: [], subsessionsLoading: false,
  }),

  // ── Subsessions ───────────────────────────────────────────────────────────

  subsessions: [],
  subsessionsLoading: false,

  fetchSubsessions: async (sessionId) => {
    set({ subsessionsLoading: true });
    try {
      const res = await fetch(`${API}/sessions/${sessionId}/subsessions`);
      const json = await res.json();
      if (json.success) set({ subsessions: json.data, subsessionsLoading: false });
      else set({ subsessionsLoading: false });
    } catch { set({ subsessionsLoading: false }); }
  },

  createSubsession: async (parentSessionId, name) => {
    const res = await fetch(`${API}/sessions/${parentSessionId}/subsessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    set(s => ({ subsessions: [...s.subsessions, { ...json.data, artifactCount: 0 }] }));
    return json.data;
  },

  confluenceSubsession: async (parentSessionId, subsessionId) => {
    const res = await fetch(`${API}/sessions/${parentSessionId}/confluence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subsessionId }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    // Refresh parent artifacts, versions, and subsession list
    const { fetchSession, fetchSubsessions } = get();
    await fetchSession(parentSessionId);
    await fetchSubsessions(parentSessionId);
    return json.data;
  },

  // ── Version timeline ──────────────────────────────────────────────────────

  viewingVersionId: null,
  isSnapshotMode: false,
  snapshotState: null,
  snapshotLoading: false,

  isDiffMode: false,
  diffFromVersionId: null,
  diffToVersionId: null,
  diffResult: null,
  diffLoading: false,

  viewVersionSnapshot: async (sessionId, versionId) => {
    if (!versionId) {
      set({ viewingVersionId: null, isSnapshotMode: false, snapshotState: null });
      return;
    }
    set({ viewingVersionId: versionId, isSnapshotMode: true, snapshotLoading: true, snapshotState: null });
    try {
      const res = await fetch(`${API}/sessions/${sessionId}/versions/${versionId}/state`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      set({ snapshotState: json.data, snapshotLoading: false });
    } catch (e) {
      set({ snapshotLoading: false, sessionError: e.message });
    }
  },

  exitSnapshot: () => set({
    viewingVersionId: null, isSnapshotMode: false, snapshotState: null,
  }),

  loadDiff: async (sessionId, fromVersionId, toVersionId) => {
    set({ isDiffMode: true, diffFromVersionId: fromVersionId, diffToVersionId: toVersionId, diffLoading: true, diffResult: null });
    try {
      const res = await fetch(`${API}/sessions/${sessionId}/versions/diff?from=${fromVersionId}&to=${toVersionId}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      set({ diffResult: json.data, diffLoading: false });
    } catch (e) {
      set({ diffLoading: false, sessionError: e.message, isDiffMode: false });
    }
  },

  closeDiff: () => set({
    isDiffMode: false, diffFromVersionId: null, diffToVersionId: null,
    diffResult: null, diffLoading: false,
  }),

  refreshVersions: async (sessionId) => {
    try {
      const res = await fetch(`${API}/sessions/${sessionId}/versions?limit=100`);
      const json = await res.json();
      if (json.success) set({ versions: json.data });
    } catch {}
  },
}));

function _defaultArtifactText(artifact) {
  switch (artifact.primitiveType) {
    case 'LOCATE': {
      const n = artifact.content?.results?.length || 0;
      return n === 0
        ? `No entities found matching "${artifact.content?.query}".`
        : `Found ${n} entity(ies) matching "${artifact.content?.query}".`;
    }
    case 'CONNECT': {
      const n = artifact.content?.paths?.length || 0;
      return n === 0 ? 'No paths found between entities.' : `Found ${n} path(s) connecting the entities.`;
    }
    case 'EXPAND': {
      return `Expanded: ${artifact.content?.nodeCount || 0} nodes, ${artifact.content?.edgeCount || 0} edges at depth ${artifact.content?.depth}.`;
    }
    case 'PROFILE': {
      const e = artifact.content?.entity;
      const n = artifact.content?.summary?.relationshipCount || 0;
      return e ? `Profile: ${e.name} (${e.type || 'Entity'}) · ${n} relationships.` : 'Profile complete.';
    }
    case 'SYNTHESIZE': {
      return artifact.content?.narrative?.slice(0, 120) + '...' || 'Synthesis complete.';
    }
    case 'IMPACT': {
      const risk = artifact.content?.riskAssessment;
      const e = artifact.content?.entity;
      return risk
        ? `Impact: ${e?.name} — ${risk.riskLevel.toUpperCase()}, ${risk.totalImpactCount} entities affected.`
        : 'Impact analysis complete.';
    }
    default:
      return `${artifact.primitiveType} completed.`;
  }
}
