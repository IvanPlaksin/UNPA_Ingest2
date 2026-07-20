// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import GraphTransferPage from '../GraphTransferPage';

vi.mock('../../services/graphTransfer.service', () => ({
    // manual flow
    previewExport: vi.fn().mockResolvedValue({ valid: true, errors: [], warnings: [], counts: { nodes: 0, nodesByLabel: {}, relationships: 0, relationshipsByType: {}, boundaryEdges: 0, stubNodes: 0 }, vectors: { collections: [] }, nodesWithoutIdentity: [], containsExecutableGraphs: false }),
    startExport: vi.fn(), getHistory: vi.fn().mockResolvedValue({ records: [] }),
    jobEventsUrl: vi.fn(), jobDownloadUrl: vi.fn(() => '#'), rerunExport: vi.fn(),
    updateExportRecord: vi.fn(), deleteExportRecord: vi.fn(), historyDownloadUrl: vi.fn(),
    getPayloadSchema: vi.fn().mockResolvedValue({ fields: [], filterableFields: [] }),
    getCatalogTree: vi.fn().mockResolvedValue({ items: [{ id: 'e1', type: 'entry', name: 'FlowDesk Workflows', childrenCount: 3, hasChildren: true }], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1, hasMore: false }, breadcrumb: [] }),
    // map-first flow
    getDomains: vi.fn().mockResolvedValue({ totalNodes: 1346297, totalDomains: 1, uncategorizedCount: 0, uncategorizedLabels: [], domains: [{ id: 'dialogues', name: 'Dialogues & Chats', icon: '💬', description: 'chats', color: '#8b5cf6', percentage: 0.71, nodeCount: 9541, vectorCollections: ['dialogue_embeddings'], labelBreakdown: { DialogueSegment: 6096 } }] }),
    getDomainDetails: vi.fn().mockResolvedValue({ namespaceDistribution: [] }),
    buildDomainRequest: vi.fn().mockResolvedValue({ success: true, request: { selectionMode: 'LABELS', labels: ['DialogueSegment'] } }),
    chatWithAssistant: vi.fn().mockResolvedValue({ success: true, response: 'Hi', toolCalls: [], toolResults: [] }),
}));

describe('GraphTransferPage (map-first redesign)', () => {
    it('shows the domain map and the AI assistant as the primary screen', async () => {
        render(<GraphTransferPage />);
        // Domain map (from DomainExportFlow) + assistant chat render up front
        await waitFor(() => expect(screen.getByText('Dialogues & Chats')).toBeTruthy());
        expect(screen.getByText('Knowledge domains')).toBeTruthy();
        expect(screen.getAllByText(/Export Assistant/).length).toBeGreaterThan(0);
        // Advanced manual mode is present (collapsed)
        expect(screen.getByText(/Advanced mode/)).toBeTruthy();
    });

    it('Advanced accordion holds the manual selection tabs', async () => {
        render(<GraphTransferPage />);
        await waitFor(() => expect(screen.getByText('Dialogues & Chats')).toBeTruthy());
        // expand Advanced → the mode tabs (incl. CATALOG_GRAPHS) become reachable
        fireEvent.click(screen.getByText(/Advanced mode/));
        expect(await screen.findByText('CATALOG_GRAPHS')).toBeTruthy();
    });
});
