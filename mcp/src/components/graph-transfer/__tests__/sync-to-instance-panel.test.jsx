// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import SyncToInstancePanel from '../SyncToInstancePanel';

const svc = {
    listPeers: vi.fn(),
    addPeer: vi.fn(),
    deletePeer: vi.fn(),
    testPeer: vi.fn(),
    startSync: vi.fn(),
    syncJobEventsUrl: vi.fn().mockReturnValue('http://x/events'),
};
vi.mock('../../../services/graphSync.service', () => ({
    listPeers: (...a) => svc.listPeers(...a),
    addPeer: (...a) => svc.addPeer(...a),
    deletePeer: (...a) => svc.deletePeer(...a),
    testPeer: (...a) => svc.testPeer(...a),
    startSync: (...a) => svc.startSync(...a),
    syncJobEventsUrl: (...a) => svc.syncJobEventsUrl(...a),
}));

// EventSource stub (jsdom has none)
class ESStub { constructor() { ESStub.last = this; } close() {} }
global.EventSource = ESStub;

const buildRequest = () => ({ selectionMode: 'LABELS', labels: ['SlotKnowledge'], boundaryPolicy: 'STUB', vectorPolicy: 'EMBED_POINTS' });

describe('SyncToInstancePanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        svc.listPeers.mockResolvedValue({ peers: [{ id: 'p1', name: 'Azure', baseUrl: 'https://az', keyConfigured: true }] });
        svc.startSync.mockResolvedValue({ jobId: 'job-1' });
    });

    it('loads peers and renders the push control', async () => {
        render(<SyncToInstancePanel buildRequest={buildRequest} />);
        expect(screen.getByText(/Sync to Instance/)).toBeTruthy();
        await waitFor(() => expect(svc.listPeers).toHaveBeenCalled());
        await waitFor(() => expect(screen.getByText('https://az')).toBeTruthy());
    });

    it('starts a sync with the current selection + chosen options', async () => {
        render(<SyncToInstancePanel buildRequest={buildRequest} />);
        await waitFor(() => expect(screen.getByText('https://az')).toBeTruthy());
        fireEvent.click(screen.getByRole('button', { name: /Push to instance/i }));
        await waitFor(() => expect(svc.startSync).toHaveBeenCalled());
        const arg = svc.startSync.mock.calls[0][0];
        expect(arg.peerId).toBe('p1');
        expect(arg.mode).toBe('plan-apply');
        expect(arg.request.labels).toEqual(['SlotKnowledge']);
    });

    it('adds a peer', async () => {
        svc.addPeer.mockResolvedValue({ peer: { id: 'p2', name: 'Local', baseUrl: 'https://local' } });
        render(<SyncToInstancePanel buildRequest={buildRequest} />);
        fireEvent.change(screen.getByLabelText(/Base URL/i), { target: { value: 'https://local' } });
        fireEvent.click(screen.getByRole('button', { name: /Add peer/i }));
        await waitFor(() => expect(svc.addPeer).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: 'https://local' })));
    });
});
