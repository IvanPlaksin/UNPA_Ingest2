// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import VectorFilterBuilder from '../VectorFilterBuilder';
import CatalogTreeSelector from '../CatalogTreeSelector';

// CatalogTreeSelector calls getCatalogTree on mount — mock the service.
vi.mock('../../../services/graphTransfer.service', () => ({
    getCatalogTree: vi.fn().mockResolvedValue({
        items: [{ id: 'e1', type: 'entry', name: 'Entry One', description: 'x', childrenCount: 2, hasChildren: true }],
        pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1, hasMore: false },
        breadcrumb: [],
    }),
}));

describe('graph-transfer new UI components render without throwing', () => {
    it('VectorFilterBuilder mounts with a schema', () => {
        const schema = { fields: [{ name: 'namespace', type: 'keyword', distinctValues: ['CORE', 'FLOWDESK'] }], filterableFields: ['namespace'] };
        render(<VectorFilterBuilder collection="documents_entities" schema={schema} filter={null} onChange={() => {}} />);
        expect(screen.getByText(/Filter: documents_entities/)).toBeTruthy();
        expect(screen.getByText(/Add condition/)).toBeTruthy();
    });

    it('VectorFilterBuilder shows loading when schema not yet provided', () => {
        render(<VectorFilterBuilder collection="documents_entities" schema={undefined} filter={null} onChange={() => {}} />);
        expect(screen.getByText(/Loading filter fields/)).toBeTruthy();
    });

    it('CatalogTreeSelector mounts and loads entries', async () => {
        render(<CatalogTreeSelector selectedGraphIds={[]} onChange={() => {}} />);
        expect(screen.getByText(/Catalog graphs/)).toBeTruthy();
        await waitFor(() => expect(screen.getByText('Entry One')).toBeTruthy());
    });
});
