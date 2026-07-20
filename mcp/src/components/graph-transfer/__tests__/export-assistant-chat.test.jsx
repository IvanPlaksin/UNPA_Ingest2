// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ExportAssistantChat from '../ExportAssistantChat';

vi.mock('../../../services/graphTransfer.service', () => ({
    chatWithAssistant: vi.fn().mockResolvedValue({
        success: true,
        response: '**Dialogues preview**\n\n| Metric | Count |\n|---|---|\n| Nodes | 9,541 |',
        toolCalls: [{ name: 'preview_selection', input: { selection_type: 'DOMAINS', domain_ids: ['dialogues'] } }],
        toolResults: [{ name: 'preview_selection', result: { nodes: 9541, valid: true } }],
    }),
}));

describe('ExportAssistantChat', () => {
    it('shows welcome + suggestions, sends a message, renders tool card + markdown response', async () => {
        const onExport = vi.fn();
        render(<ExportAssistantChat onExportStarted={onExport} />);
        // welcome + suggestion chips ("Export Assistant" appears in header + welcome body)
        expect(screen.getAllByText(/Export Assistant/).length).toBeGreaterThan(0);
        expect(screen.getByText('What domains are available?')).toBeTruthy();
        // type + send
        const input = screen.getByPlaceholderText(/Ask about domains/);
        fireEvent.change(input, { target: { value: 'Preview dialogues' } });
        fireEvent.submit(input.closest('form'));
        // assistant response: tool card label + markdown table cell
        await waitFor(() => expect(screen.getByText('Preview selection')).toBeTruthy());
        expect(screen.getByText('9,541')).toBeTruthy();
    });

    it('fires onExportStarted when agent runs start_export', async () => {
        const svc = await import('../../../services/graphTransfer.service');
        svc.chatWithAssistant.mockResolvedValueOnce({
            success: true, response: 'Export started.', toolCalls: [{ name: 'start_export', input: {} }],
            toolResults: [{ name: 'start_export', result: { success: true, jobId: 'gt-export-9' } }],
        });
        const onExport = vi.fn();
        render(<ExportAssistantChat onExportStarted={onExport} />);
        const input = screen.getByPlaceholderText(/Ask about domains/);
        fireEvent.change(input, { target: { value: 'export it' } });
        fireEvent.submit(input.closest('form'));
        await waitFor(() => expect(onExport).toHaveBeenCalledWith('gt-export-9'));
    });
});
