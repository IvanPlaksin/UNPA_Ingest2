import React, { useState, useCallback } from 'react';
import {
  X, Play, Pause, Square, RotateCcw, Loader2,
  Clock, CheckCircle2, AlertCircle, Timer,
  FastForward, Edit3, MoreHorizontal, Hourglass
} from 'lucide-react';
import { pauseExecution } from '../../../services/gxeManager.service';

import ResumeDialog from '../ControlBar/dialogs/ResumeDialog';
import RollbackDialog from '../ControlBar/dialogs/RollbackDialog';
import CancelDialog from '../ControlBar/dialogs/CancelDialog';
import OverrideAsyncWaitDialog from '../ControlBar/dialogs/OverrideAsyncWaitDialog';
import InjectVariableDialog from '../ControlBar/dialogs/InjectVariableDialog';

const STATUS_COLORS = {
  RUNNING: '#22d3ee', WAITING: '#a78bfa', PAUSED: '#f59e0b',
  QUEUED: '#71717a', COMPLETED: '#22c55e', FAILED: '#ef4444',
  CANCELLED: '#71717a', TIMED_OUT: '#f97316',
  INITIALIZING: '#22d3ee', COMPENSATING: '#e879f9',
};

const STATUS_ICONS = {
  RUNNING: Loader2, WAITING: Hourglass, PAUSED: Pause, QUEUED: Clock,
  COMPLETED: CheckCircle2, FAILED: AlertCircle, CANCELLED: Square,
  TIMED_OUT: Timer, INITIALIZING: Loader2, COMPENSATING: RotateCcw,
};

const DetailHeader = ({ execution, onClose }) => {
  const [loading, setLoading] = useState(null);
  const [activeDialog, setActiveDialog] = useState(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  if (!execution) return null;

  const StatusIcon = STATUS_ICONS[execution.status] || Clock;
  const statusColor = STATUS_COLORS[execution.status] || '#71717a';
  const isActive = ['RUNNING', 'INITIALIZING', 'WAITING'].includes(execution.status);

  const status = execution.status;
  const isRunning = status === 'RUNNING';
  const isPaused = status === 'PAUSED';
  const isQueued = status === 'QUEUED';
  const canControl = isRunning || isPaused || isQueued;
  const isWaitingInput = isPaused && execution.currentNodeId;

  const handlePause = useCallback(async () => {
    setLoading('pause');
    try { await pauseExecution(execution.executionId, { immediate: false }); }
    catch (err) { console.error('Pause failed:', err); }
    finally { setLoading(null); }
  }, [execution?.executionId]);

  const closeDialog = () => { setActiveDialog(null); setMoreMenuOpen(false); };

  return (
    <>
      {/* ── Compact top bar: status + actions + close ────────────── */}
      <div className="gxe-detail-header">
        <div className="gxe-detail-header__status" style={{ color: statusColor }}>
          <StatusIcon size={14} className={isActive ? 'spinning' : ''} />
          <span>{status}</span>
        </div>

        {/* Inline action buttons (small) */}
        <div className="gxe-detail-header__actions">
          {isPaused && (
            <button className="gxe-detail-header__act-btn act--resume"
              onClick={() => setActiveDialog('resume')} title="Resume">
              <Play size={12} />
            </button>
          )}
          {isRunning && (
            <button className="gxe-detail-header__act-btn act--pause"
              onClick={handlePause} disabled={loading === 'pause'} title="Pause">
              {loading === 'pause' ? <Loader2 size={12} className="spinning" /> : <Pause size={12} />}
            </button>
          )}
          {canControl && (
            <button className="gxe-detail-header__act-btn act--cancel"
              onClick={() => setActiveDialog('cancel')} title="Cancel">
              <Square size={12} />
            </button>
          )}
          {(isPaused || status === 'FAILED') && (
            <button className="gxe-detail-header__act-btn act--rollback"
              onClick={() => setActiveDialog('rollback')} title="Rollback">
              <RotateCcw size={12} />
            </button>
          )}
          {(canControl || isWaitingInput) && (
            <div className="gxe-detail-header__more-wrap">
              <button className="gxe-detail-header__act-btn"
                onClick={() => setMoreMenuOpen(!moreMenuOpen)} title="More">
                <MoreHorizontal size={12} />
              </button>
              {moreMenuOpen && (
                <div className="gxe-detail-header__more-menu">
                  {isWaitingInput && (
                    <button onClick={() => setActiveDialog('override')}>
                      <FastForward size={12} /> Override Wait
                    </button>
                  )}
                  {canControl && (
                    <button onClick={() => setActiveDialog('inject')}>
                      <Edit3 size={12} /> Inject Variable
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <button className="gxe-detail-header__close" onClick={onClose} title="Close">
          <X size={16} />
        </button>
      </div>

      {/* ── Execution + Graph only ─────────────────────────────── */}
      <div className="gxe-detail-info">
        <div className="gxe-detail-info__row">
          <span className="gxe-detail-info__label">Execution</span>
          <span className="gxe-detail-info__value mono">{execution.executionId}</span>
        </div>
        <div className="gxe-detail-info__row">
          <span className="gxe-detail-info__label">Graph</span>
          <span className="gxe-detail-info__value">{execution.metadata?.graphName || execution.graphId}</span>
        </div>
      </div>

      {/* Dialogs */}
      {activeDialog === 'resume' && <ResumeDialog execution={execution} onClose={closeDialog} />}
      {activeDialog === 'rollback' && <RollbackDialog execution={execution} onClose={closeDialog} />}
      {activeDialog === 'cancel' && <CancelDialog execution={execution} onClose={closeDialog} />}
      {activeDialog === 'override' && <OverrideAsyncWaitDialog execution={execution} onClose={closeDialog} />}
      {activeDialog === 'inject' && <InjectVariableDialog execution={execution} onClose={closeDialog} />}
    </>
  );
};

export default DetailHeader;
