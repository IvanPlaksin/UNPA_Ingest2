import React, { useState, useCallback } from 'react';
import {
  Play, Pause, Square, RotateCcw,
  FastForward, Edit3, MoreHorizontal,
  Loader2, AlertTriangle
} from 'lucide-react';
import { pauseExecution } from '../../../services/gxeManager.service';

import ResumeDialog from './dialogs/ResumeDialog';
import RollbackDialog from './dialogs/RollbackDialog';
import CancelDialog from './dialogs/CancelDialog';
import OverrideAsyncWaitDialog from './dialogs/OverrideAsyncWaitDialog';
import InjectVariableDialog from './dialogs/InjectVariableDialog';

import './ControlBar.css';

const ControlBar = ({ execution }) => {
  const [loading, setLoading] = useState(null);
  const [activeDialog, setActiveDialog] = useState(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  const status = execution?.status;
  const isRunning = status === 'RUNNING';
  const isPaused = status === 'PAUSED';
  const isQueued = status === 'QUEUED';
  const isActive = isRunning || isPaused || isQueued;
  const isWaitingInput = isPaused && execution?.currentNodeId;

  // Simple pause (no dialog needed)
  const handlePause = useCallback(async () => {
    setLoading('pause');
    try {
      await pauseExecution(execution.executionId, { immediate: false });
    } catch (err) {
      console.error('Pause failed:', err);
    } finally {
      setLoading(null);
    }
  }, [execution?.executionId]);

  // Open dialogs
  const openResumeDialog = () => setActiveDialog('resume');
  const openRollbackDialog = () => setActiveDialog('rollback');
  const openCancelDialog = () => setActiveDialog('cancel');
  const openOverrideDialog = () => setActiveDialog('override');
  const openInjectDialog = () => setActiveDialog('inject');

  const closeDialog = () => {
    setActiveDialog(null);
    setMoreMenuOpen(false);
  };

  return (
    <div className="gxe-control-bar">
      <div className="gxe-control-bar__left">
        <span className="gxe-control-bar__label">Actions:</span>
      </div>

      <div className="gxe-control-bar__actions">
        {/* Resume - for PAUSED */}
        {isPaused && (
          <button
            className="gxe-control-bar__btn gxe-control-bar__btn--primary"
            onClick={openResumeDialog}
            disabled={loading === 'resume'}
          >
            {loading === 'resume' ? (
              <Loader2 size={16} className="spinning" />
            ) : (
              <Play size={16} />
            )}
            <span>Resume</span>
          </button>
        )}

        {/* Pause - for RUNNING */}
        {isRunning && (
          <button
            className="gxe-control-bar__btn gxe-control-bar__btn--warning"
            onClick={handlePause}
            disabled={loading === 'pause'}
          >
            {loading === 'pause' ? (
              <Loader2 size={16} className="spinning" />
            ) : (
              <Pause size={16} />
            )}
            <span>Pause</span>
          </button>
        )}

        {/* Cancel - for any active */}
        {isActive && (
          <button
            className="gxe-control-bar__btn gxe-control-bar__btn--danger"
            onClick={openCancelDialog}
          >
            <Square size={16} />
            <span>Cancel</span>
          </button>
        )}

        {/* Rollback - for PAUSED or FAILED */}
        {(isPaused || status === 'FAILED') && (
          <button
            className="gxe-control-bar__btn"
            onClick={openRollbackDialog}
          >
            <RotateCcw size={16} />
            <span>Rollback</span>
          </button>
        )}

        {/* More menu */}
        <div className="gxe-control-bar__more-wrapper">
          <button
            className="gxe-control-bar__btn gxe-control-bar__btn--icon"
            onClick={() => setMoreMenuOpen(!moreMenuOpen)}
          >
            <MoreHorizontal size={16} />
          </button>

          {moreMenuOpen && (
            <div className="gxe-control-bar__more-menu">
              {isWaitingInput && (
                <button onClick={openOverrideDialog}>
                  <FastForward size={14} />
                  Override Async Wait
                </button>
              )}

              {isActive && (
                <button onClick={openInjectDialog}>
                  <Edit3 size={14} />
                  Inject Variable
                </button>
              )}

              <div className="gxe-control-bar__more-divider" />

              <button onClick={() => setMoreMenuOpen(false)}>
                Clone Execution
              </button>

              <button onClick={() => setMoreMenuOpen(false)}>
                Export Trace
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Warning for waiting input */}
      {isWaitingInput && (
        <div className="gxe-control-bar__warning">
          <AlertTriangle size={14} />
          <span>Waiting for input at node: <code>{execution.currentNodeId}</code></span>
        </div>
      )}

      {/* Dialogs */}
      {activeDialog === 'resume' && (
        <ResumeDialog execution={execution} onClose={closeDialog} />
      )}

      {activeDialog === 'rollback' && (
        <RollbackDialog execution={execution} onClose={closeDialog} />
      )}

      {activeDialog === 'cancel' && (
        <CancelDialog execution={execution} onClose={closeDialog} />
      )}

      {activeDialog === 'override' && (
        <OverrideAsyncWaitDialog execution={execution} onClose={closeDialog} />
      )}

      {activeDialog === 'inject' && (
        <InjectVariableDialog execution={execution} onClose={closeDialog} />
      )}
    </div>
  );
};

export default ControlBar;
