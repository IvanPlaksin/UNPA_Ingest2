import React from 'react';
import { useTranslation } from 'react-i18next';
import SlotRow from './SlotRow.jsx';
import { useDraft, useSchema, useSession, useUI, useChatActions } from '../store/chat-store';
import { isAffectedByStale, groupSlotsByPhase } from '../utils/draft-view';

/**
 * DraftPanel (F8) — the live service-request draft. Renders the DraftSR mirror
 * against the SchemaSnapshot: beneficiary, phase-grouped slots with provenance
 * badges and transitive stale highlighting (RULE-078), inline slot editing.
 */
export default function DraftPanel() {
  const { t } = useTranslation();
  const draft = useDraft();
  const schema = useSchema();
  const session = useSession();
  const { draftPanelOpen } = useUI();
  const actions = useChatActions();

  const hasService = !!session.serviceId;

  if (!draftPanelOpen) {
    return (
      <div className="fdv2-draft-collapsed">
        <button type="button" className="fdv2-icon-btn" onClick={actions.toggleDraftPanel} title={t('draft.expand')} aria-label={t('draft.expand')}>▸</button>
      </div>
    );
  }

  const title = schema?.metadata?.title || session.serviceId || t('draft.title');
  const status = t(`status.${session.status || 'draft'}`, { defaultValue: session.status || '' });
  const groups = schema ? groupSlotsByPhase(schema) : [];
  const beneficiary = draft.beneficiary;

  return (
    <div className="fdv2-draft-panel">
      <div className="fdv2-draft-head">
        <div className="fdv2-draft-title">{title}</div>
        <div className="fdv2-draft-headright">
          <span className={`fdv2-status-badge fdv2-status-${session.status || 'draft'}`}>{status}</span>
          <button type="button" className="fdv2-icon-btn fdv2-draft-collapse" onClick={actions.toggleDraftPanel} title={t('draft.collapse')} aria-label={t('draft.collapse')}>▾</button>
        </div>
      </div>

      {!hasService ? (
        <div className="fdv2-draft-empty">
          <p>{t('draft.empty')}</p>
          <p className="fdv2-draft-empty-hint">{t('draft.emptyHint')}</p>
        </div>
      ) : (
        <div className="fdv2-draft-body">
          {beneficiary && (
            <div className="fdv2-draft-benef">
              <span className="fdv2-benef-label">{t('draft.beneficiary')}</span>
              <span className="fdv2-benef-val">{beneficiary.mode === 'self' ? t('draft.forSelf') : (beneficiary.resolvedProfile?.name || beneficiary.userId || '—')}</span>
            </div>
          )}

          {groups.length === 0 && (
            <div className="fdv2-draft-empty"><p>{t('draft.loading')}</p></div>
          )}

          {groups.map((g) => (
            <section key={g.phase} className="fdv2-draft-group">
              <h4 className="fdv2-draft-group-title">{t(`phase.${g.phase}`, { defaultValue: g.phase })}</h4>
              {g.slots.map((slotDef) => (
                <SlotRow
                  key={slotDef.slotId}
                  slotDef={slotDef}
                  slotValue={draft.slots[slotDef.slotId]}
                  affectedStale={isAffectedByStale(slotDef.slotId, draft.slots, schema)}
                  onEdit={actions.patchSlot}
                />
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
