/**
 * useDomainExport — orchestrates the map-first flow:
 *   select domains → build ExportRequest (/domains/build-request) → /preview →
 *   adjust options → start export job.
 * Adapts to the real /preview shape ({ valid, errors, warnings, counts, vectors }).
 */

import { useState, useCallback } from 'react';
import { buildDomainRequest, previewExport, startExport } from '../services/graphTransfer.service';

const DEFAULT_OPTIONS = { boundaryPolicy: 'STUB', vectorPolicy: 'EMBED_POINTS', name: '', notes: '' };

export function useDomainExport() {
    const [selectedDomains, setSelectedDomains] = useState([]);
    const [exportRequest, setExportRequest] = useState(null);
    const [preview, setPreview] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState(null);
    const [currentJobId, setCurrentJobId] = useState(null);
    const [jobStatus, setJobStatus] = useState(null); // running|completed|failed
    const [options, setOptions] = useState(DEFAULT_OPTIONS);

    const runPreview = useCallback(async (domainIds, opts) => {
        if (!domainIds?.length) { setPreview(null); setExportRequest(null); return; }
        setPreviewLoading(true); setPreviewError(null);
        try {
            const built = await buildDomainRequest(domainIds, opts);
            const request = built.request || built; // {success, request}
            setExportRequest(request);
            const result = await previewExport(request);
            setPreview(result);
        } catch (e) {
            setPreviewError(e.response?.data?.error || e.message);
            setPreview(null);
        } finally {
            setPreviewLoading(false);
        }
    }, []);

    const previewDomains = useCallback((domainIds) => runPreview(domainIds, options), [runPreview, options]);

    const handleSelectionChange = useCallback((domainIds) => {
        setSelectedDomains(domainIds);
        setPreview(null); setExportRequest(null); setPreviewError(null);
    }, []);

    // Update options; re-preview when a policy that affects counts changes.
    const updateOptions = useCallback((patch, rePreview = false) => {
        setOptions((prev) => {
            const next = { ...prev, ...patch };
            if (rePreview && selectedDomains.length) runPreview(selectedDomains, next);
            return next;
        });
    }, [selectedDomains, runPreview]);

    const doStartExport = useCallback(async () => {
        if (!exportRequest) throw new Error('No export request — run preview first.');
        const finalRequest = {
            ...exportRequest,
            name: options.name || `Domain export: ${selectedDomains.join(', ')}`,
            notes: options.notes || undefined,
        };
        const r = await startExport(finalRequest);
        if (!r.success) throw new Error((r.errors || [r.error]).join('; '));
        setCurrentJobId(r.jobId);
        setJobStatus('running');
        return r.jobId;
    }, [exportRequest, selectedDomains, options]);

    const reset = useCallback(() => {
        setSelectedDomains([]); setExportRequest(null); setPreview(null); setPreviewError(null);
        setCurrentJobId(null); setJobStatus(null); setOptions(DEFAULT_OPTIONS);
    }, []);

    return {
        selectedDomains, exportRequest, preview, previewLoading, previewError,
        currentJobId, jobStatus, options,
        handleSelectionChange, previewDomains, updateOptions, startExport: doStartExport, setJobStatus, reset,
        canPreview: selectedDomains.length > 0,
        canExport: !!preview && preview.valid !== false && !(preview.errors && preview.errors.length),
    };
}

export default useDomainExport;
