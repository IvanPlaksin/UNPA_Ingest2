// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import DomainExportFlow from '../DomainExportFlow';

vi.mock('../../../services/graphTransfer.service', () => ({
    getDomains: vi.fn().mockResolvedValue({
        totalNodes: 9541, totalDomains: 1, uncategorizedCount: 0, uncategorizedLabels: [],
        domains: [{ id: 'dialogues', name: 'Dialogues & Chats', icon: '💬', description: 'chats', color: '#8b5cf6', percentage: 100, nodeCount: 9541, vectorCollections: ['dialogue_embeddings'], labelBreakdown: { DialogueSegment: 6096 } }],
    }),
    getDomainDetails: vi.fn().mockResolvedValue({ namespaceDistribution: [] }),
    buildDomainRequest: vi.fn().mockResolvedValue({ success: true, request: { selectionMode: 'LABELS', labels: ['DialogueSegment'], selectedCollections: { dialogue_embeddings: true } } }),
    previewExport: vi.fn().mockResolvedValue({ valid: true, errors: [], warnings: [], counts: { nodes: 9541, relationships: 120, stubNodes: 5, nodesByLabel: {} }, vectors: { collections: [{ name: 'dialogue_embeddings', pointsInSlice: 6165 }] }, containsExecutableGraphs: false }),
    startExport: vi.fn().mockResolvedValue({ success: true, jobId: 'gt-export-1' }),
    jobEventsUrl: vi.fn(), jobDownloadUrl: vi.fn(),
}));

describe('DomainExportFlow', () => {
    it('selecting a domain → Preview shows real counts + enables export', async () => {
        render(<DomainExportFlow />);
        await waitFor(() => expect(screen.getByText('Dialogues & Chats')).toBeTruthy());
        fireEvent.click(screen.getByText('Dialogues & Chats'));            // select
        fireEvent.click(screen.getByRole('button', { name: /Preview selection/i }));
        // preview counts (nodes 9,541 and vector points 6,165) render
        await waitFor(() => expect(screen.getAllByText('9,541').length).toBeGreaterThan(0));
        expect(screen.getByText('6,165')).toBeTruthy();
        // export action becomes available
        expect(await screen.findByRole('button', { name: /Start export/i })).toBeTruthy();
    });
});
