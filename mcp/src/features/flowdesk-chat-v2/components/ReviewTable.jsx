import React from 'react';
import { useTranslation } from 'react-i18next';
import { useUI, useChatActions } from '../store/chat-store';

/** Pencil (edit) glyph. */
function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}

/**
 * ReviewTable (confirm-form) — renders the backend `review` payload: the collected
 * slot values as a grouped, labelled table. Each Altiora form section is a group;
 * every row shows the English field label (as named in the Altiora form) and its
 * value. Editable rows carry a ✎ button that sends an `edit` controlAction so the
 * chat asks for a new value; reference-derived values (directory / dictionary / LOV)
 * are read-only (they are changed by editing their source field).
 *
 * `interactive` (isLast) gates the edit buttons — a historical review is read-only.
 */
export default function ReviewTable({ review, interactive = true }) {
  const { t } = useTranslation();
  const { loading } = useUI();
  const actions = useChatActions();
  if (!review || !Array.isArray(review.groups) || review.groups.length === 0) return null;

  const editField = (row) =>
    actions.sendControlAction({ slotId: row.slotId, action: 'edit' }, t('review.editEcho', { field: row.label }));

  return (
    <div className="fdv2-review" role="table" aria-label={review.title || t('review.title')}>
      {review.groups.map((g) => (
        <div className="fdv2-review-group" key={g.section} role="rowgroup">
          <div className="fdv2-review-section">{g.label}</div>
          {g.rows.map((row) => (
            <div className="fdv2-review-row" role="row" key={row.slotId}>
              <span className="fdv2-review-label" role="cell">{row.label}</span>
              <span className="fdv2-review-value" role="cell">{String(row.display ?? '')}</span>
              <span className="fdv2-review-action" role="cell">
                {interactive && row.editable && (
                  <button
                    type="button"
                    className="fdv2-review-edit"
                    disabled={loading}
                    title={t('review.edit')}
                    aria-label={t('review.editField', { field: row.label })}
                    onClick={() => editField(row)}
                  >
                    <EditIcon />
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
