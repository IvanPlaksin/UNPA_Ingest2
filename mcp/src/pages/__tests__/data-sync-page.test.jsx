// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import DataSyncPage from '../DataSyncPage';

const gs = vi.hoisted(() => ({
    listPeers: vi.fn(), listSyncJobs: vi.fn(), getDomains: vi.fn(), comparePeer: vi.fn(),
    addPeer: vi.fn(), deletePeer: vi.fn(), testPeer: vi.fn(), peerRecords: vi.fn(),
    startSync: vi.fn(), applyStaged: vi.fn(),
    syncJobEventsUrl: vi.fn().mockReturnValue('http://x/events'),
}));
vi.mock('../../services/graphSync.service', () => ({ default: gs, ...gs }));
class ESStub { constructor() { ESStub.last = this; } close() {} }
global.EventSource = ESStub;

const DOMAINS = [
    { id: 'kb-resolve', label: 'KB resolve layer', category: 'significant', description: 'x', labels: ['SlotKnowledge'], collections: ['flowdesk_services'] },
    { id: 'dialogues', label: 'Dialogues & analytics', category: 'telemetry', description: 'y', labels: ['ChatTurn'], collections: [] },
];

describe('DataSyncPage (human-oriented)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        gs.listPeers.mockResolvedValue({ peers: [{ id: 'p1', name: 'Azure', baseUrl: 'https://az', keyConfigured: true }] });
        gs.listSyncJobs.mockResolvedValue({ jobs: [] });
        gs.getDomains.mockResolvedValue({ domains: DOMAINS });
        gs.startSync.mockResolvedValue({ jobId: 'job-1' });
        gs.comparePeer.mockResolvedValue({
            domains: [
                { id: 'kb-resolve', label: 'KB resolve layer', category: 'significant', description: 'x', source: { nodes: 483, vectors: 629 }, target: { nodes: 0, vectors: 0 }, nodesDelta: 483, vectorsDelta: 629, inSync: false },
                { id: 'dialogues', label: 'Dialogues & analytics', category: 'telemetry', description: 'y', source: { nodes: 100, vectors: 0 }, target: { nodes: 100, vectors: 0 }, nodesDelta: 0, vectorsDelta: 0, inSync: true },
            ],
            significantDrift: ['kb-resolve'],
        });
    });

    it('lands on Compare with all tabs; compares and shows per-domain drift', async () => {
        render(<DataSyncPage />);
        for (const t of ['Compare', 'New Sync', 'Peers', 'Jobs', 'History']) expect(screen.getAllByText(t).length).toBeGreaterThan(0);
        await waitFor(() => expect(gs.listPeers).toHaveBeenCalled());
        const compareBtn = await screen.findByRole('button', { name: /^Compare$/i });
        await waitFor(() => expect(compareBtn).not.toBeDisabled()); // peerId set after peers load
        fireEvent.click(compareBtn);
        await waitFor(() => expect(gs.comparePeer).toHaveBeenCalledWith('p1'));
        await waitFor(() => expect(screen.getByText('KB resolve layer')).toBeTruthy());
        expect(screen.getByText('out of sync')).toBeTruthy();
        // significant drift auto-selected -> reconcile panel with preview button
        await waitFor(() => expect(screen.getByRole('button', { name: /Preview changes/i })).toBeTruthy());
    });

    it('New Sync: pick a domain chip and preview (plan) with domains payload', async () => {
        render(<DataSyncPage />);
        await waitFor(() => expect(gs.getDomains).toHaveBeenCalled());
        fireEvent.click(screen.getByText('New Sync'));
        await waitFor(() => expect(screen.getByText('KB resolve layer')).toBeTruthy());
        fireEvent.click(screen.getByText('KB resolve layer')); // select chip
        fireEvent.click(screen.getByRole('button', { name: /Preview changes/i }));
        await waitFor(() => expect(gs.startSync).toHaveBeenCalled());
        const arg = gs.startSync.mock.calls[0][0];
        expect(arg.mode).toBe('plan');
        expect(arg.peerId).toBe('p1');
        expect(arg.domains).toContain('kb-resolve');
    });
});
