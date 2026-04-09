import React, { useState, useCallback } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Stepper, Step, StepLabel, Button, Box, CircularProgress, Alert } from '@mui/material';
import { Upload, ArrowLeft, ArrowRight, CheckCircle, X } from 'lucide-react';
import { DraftSelectionStep, DiffReviewStep, ConflictResolutionStep, ConfirmationStep, ProgressStep, CompletionStep } from './promotion';
import ValidationStep from './promotion/ValidationStep';
import * as wsApi from '../../services/workspace.service';

const STEPS = [
  { key: 'validate', label: 'Validate' },
  { key: 'select', label: 'Select Drafts' },
  { key: 'diff', label: 'Review Diff' },
  { key: 'resolve', label: 'Resolve Conflicts' },
  { key: 'confirm', label: 'Confirm' },
  { key: 'progress', label: 'Execute' },
  { key: 'complete', label: 'Complete' }
];

export default function PromotionWizard({ open, workspaceId, initialDrafts = [], onClose }) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedDrafts, setSelectedDrafts] = useState([]);
  const [targetNs, setTargetNs] = useState('CORE');
  const [diffResult, setDiffResult] = useState(null);
  const [resolutions, setResolutions] = useState({});
  const [execResult, setExecResult] = useState(null);
  const [validation, setValidation] = useState(null);

  const key = STEPS[step]?.key;
  const hasConflicts = (diffResult?.grouped?.CONFLICT?.length || 0) > 0;

  const nextStep = () => {
    let next = step + 1;
    if (STEPS[next]?.key === 'resolve' && !hasConflicts) next++;
    return next;
  };
  const prevStep = () => {
    let prev = step - 1;
    if (STEPS[prev]?.key === 'resolve' && !hasConflicts) prev--;
    return prev;
  };

  const canProceed = useCallback(() => {
    if (key === 'validate') return validation?.canPromote === true;
    if (key === 'select') return selectedDrafts.length > 0;
    if (key === 'diff') return diffResult?.success;
    if (key === 'resolve') return (diffResult?.grouped?.CONFLICT || []).every(c => resolutions[c.draftId]?.resolved);
    if (key === 'confirm') return true;
    return false;
  }, [key, selectedDrafts, diffResult, resolutions, validation]);

  const handleNext = async () => {
    setError(null);
    if (key === 'select') {
      setLoading(true);
      try {
        const res = await wsApi.computePromotionDiff(workspaceId, { draftIds: selectedDrafts.map(d => d.id), targetNamespace: targetNs });
        setDiffResult(res.data);
        setStep(nextStep());
      } catch (e) { setError(e.response?.data?.error?.message || e.message); }
      finally { setLoading(false); }
      return;
    }
    if (key === 'confirm') {
      setStep(nextStep()); // progress
      setLoading(true);
      try {
        const res = await wsApi.executePromotion(workspaceId, { items: diffResult.items, resolutions, targetNamespace: targetNs });
        setExecResult(res.data);
        if (res.data?.success) setStep(STEPS.findIndex(s => s.key === 'complete'));
      } catch (e) { setError(e.response?.data?.error?.message || e.message); setExecResult({ success: false, error: e.message }); }
      finally { setLoading(false); }
      return;
    }
    setStep(nextStep());
  };

  const handleClose = () => {
    setStep(0); setSelectedDrafts([]); setDiffResult(null); setResolutions({}); setExecResult(null); setError(null); setValidation(null);
    onClose(execResult);
  };

  const isComplete = key === 'complete';
  const isProgress = key === 'progress';

  return (
    <Dialog open={open} onClose={isProgress ? undefined : handleClose} maxWidth="md" fullWidth PaperProps={{ sx: { minHeight: '70vh' } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Upload size={20} /> Promote to Knowledge Base</DialogTitle>
      <DialogContent dividers>
        <Stepper activeStep={step} sx={{ mb: 3 }}>
          {STEPS.filter(s => s.key !== 'resolve' || hasConflicts).map((s, i) => <Step key={s.key}><StepLabel>{s.label}</StepLabel></Step>)}
        </Stepper>
        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
        <Box sx={{ minHeight: 300 }}>
          {loading && key !== 'progress' ? <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box> : <>
            {key === 'validate' && <ValidationStep workspaceId={workspaceId} onValidationChange={setValidation} />}
            {key === 'select' && <DraftSelectionStep drafts={initialDrafts} selected={selectedDrafts} targetNamespace={targetNs} onSelectionChange={setSelectedDrafts} onNamespaceChange={setTargetNs} />}
            {key === 'diff' && <DiffReviewStep diffResult={diffResult} />}
            {key === 'resolve' && <ConflictResolutionStep conflicts={diffResult?.grouped?.CONFLICT || []} resolutions={resolutions} onResolutionChange={(id, r) => setResolutions(p => ({ ...p, [id]: r }))} />}
            {key === 'confirm' && <ConfirmationStep selectedDrafts={selectedDrafts} diffResult={diffResult} resolutions={resolutions} targetNamespace={targetNs} />}
            {key === 'progress' && <ProgressStep loading={loading} result={execResult} error={error} />}
            {key === 'complete' && <CompletionStep result={execResult} targetNamespace={targetNs} />}
          </>}
        </Box>
      </DialogContent>
      <DialogActions>
        {!isComplete && !isProgress && <Button onClick={() => setStep(prevStep())} disabled={step === 0 || loading} startIcon={<ArrowLeft size={16} />}>Back</Button>}
        <Box sx={{ flex: 1 }} />
        {isComplete ? <Button variant="contained" onClick={handleClose} startIcon={<CheckCircle size={16} />}>Done</Button>
         : isProgress ? <Button onClick={handleClose} disabled={loading} color="error" startIcon={<X size={16} />}>{loading ? 'Executing...' : 'Close'}</Button>
         : <Button variant="contained" onClick={handleNext} disabled={!canProceed() || loading} endIcon={loading ? <CircularProgress size={16} /> : <ArrowRight size={16} />}>{key === 'confirm' ? 'Execute Promotion' : 'Next'}</Button>}
      </DialogActions>
    </Dialog>
  );
}
