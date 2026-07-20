// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import DomainMap from '../DomainMap';
import DomainCard from '../DomainCard';

vi.mock('../../../services/graphTransfer.service', () => ({
    getDomains: vi.fn().mockResolvedValue({
        totalNodes: 1346297, totalDomains: 2, uncategorizedCount: 234, uncategorizedLabels: [{ label: 'CORE', count: 165 }],
        domains: [
            { id: 'un-documents', name: 'UN Document Corpus', icon: '📄', description: 'docs', color: '#3b82f6', percentage: 94.56, nodeCount: 1273082, vectorCollections: ['documents_entities'], labelBreakdown: { SourceDocument: 1272508 } },
            { id: 'dialogues', name: 'Dialogues & Chats', icon: '💬', description: 'chats', color: '#8b5cf6', percentage: 0.71, nodeCount: 9541, vectorCollections: ['dialogue_embeddings'], labelBreakdown: { DialogueSegment: 6096 } },
        ],
    }),
    getDomainDetails: vi.fn().mockResolvedValue({ namespaceDistribution: [{ namespace: 'DIALOGUE', count: 9226 }] }),
}));

describe('DomainMap / DomainCard', () => {
    it('DomainCard renders name, count, percentage', () => {
        const d = { id: 'x', name: 'Test Domain', icon: '🧠', description: 'desc', color: '#10b981', percentage: 1.15, nodeCount: 15455, vectorCollections: ['knowledge_entities'], labelBreakdown: { ESEntity: 4184 } };
        render(<DomainCard domain={d} selected={false} onToggle={() => {}} onExpand={() => {}} />);
        expect(screen.getByText('Test Domain')).toBeTruthy();
        expect(screen.getByText('15,455')).toBeTruthy();
        expect(screen.getByText('1.15%')).toBeTruthy();
    });

    it('DomainMap loads domains and supports selection + preview', async () => {
        const onSel = vi.fn();
        const onPrev = vi.fn();
        render(<DomainMap selectedDomains={[]} onSelectionChange={onSel} onPreview={onPrev} />);
        await waitFor(() => expect(screen.getByText('UN Document Corpus')).toBeTruthy());
        expect(screen.getByText('Dialogues & Chats')).toBeTruthy();
        // header total
        expect(screen.getByText(/nodes across 2 domains/)).toBeTruthy();
        // select a domain
        fireEvent.click(screen.getByText('UN Document Corpus'));
        expect(onSel).toHaveBeenCalledWith(['un-documents']);
    });

    it('DomainMap Preview button fires with selected domains', async () => {
        const onPrev = vi.fn();
        render(<DomainMap selectedDomains={['dialogues']} onSelectionChange={() => {}} onPreview={onPrev} />);
        await waitFor(() => expect(screen.getByText('Dialogues & Chats')).toBeTruthy());
        fireEvent.click(screen.getByRole('button', { name: /Preview selection/i }));
        expect(onPrev).toHaveBeenCalledWith(['dialogues']);
    });
});
