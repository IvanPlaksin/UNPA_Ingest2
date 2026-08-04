import React from 'react';
import { useTranslation } from 'react-i18next';
import { getConfig } from '../config/runtime-config';

/**
 * The rows a turn SHOWS — the user's requests and tasks — as against the controls
 * that collect an answer.
 *
 * They arrive in their own field for a reason worth keeping in view: a control has a
 * `slotId` and fills it, and these have neither. Rendering them here rather than
 * through ControlRenderer keeps that distinction visible in the code as well as in
 * the contract.
 *
 * WHAT IS DELIBERATELY ABSENT: buttons. Altiora's own /requests table ends in an
 * actions column and this does not — a conversation is a place to find a request,
 * not to act on one, and every action offered here would be a second implementation
 * of something the request page already does properly.
 *
 * Clicking a card asks the HOST to open its own detail dialog. The chat does not know
 * how that dialog works: it passes the intent the backend put on the row and the host
 * decides. Without a host handler the card is inert rather than broken — a row that
 * looks clickable and does nothing is worse than one that does not invite the click.
 */

/** Values the backend marked for formatting. The chat does not own the host's masks. */
function formatValue(value, format, lang) {
  if (format !== 'date') return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;   // not a date after all — say what came
  try {
    return d.toLocaleDateString(lang || undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return value; }
}

function Card({ card, onOpen }) {
  const { i18n } = useTranslation();
  const clickable = !!(card.revealIntent && onOpen);
  const open = () => { if (clickable) onOpen(card.revealIntent); };

  return (
    <li
      className={`fdv2-card${clickable ? ' fdv2-card-clickable' : ''}`}
      // A row that opens something is a button, whatever it is made of: it has to be
      // reachable and announced as one, not merely clickable with a mouse.
      {...(clickable ? {
        role: 'button',
        tabIndex: 0,
        onClick: open,
        onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } },
      } : {})}
    >
      {card.accent && <span className="fdv2-card-accent" data-accent={String(card.accent).toLowerCase()} aria-hidden="true" />}
      <div className="fdv2-card-body">
        <div className="fdv2-card-head">
          <span className="fdv2-card-title">{card.title}</span>
          {card.subtitle && <span className="fdv2-card-sub">{card.subtitle}</span>}
        </div>
        <dl className="fdv2-card-fields">
          {(card.fields || []).map((f) => (
            <div key={f.label} className="fdv2-card-field">
              <dt>{f.label}</dt>
              <dd>{formatValue(f.value, f.format, i18n.language)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </li>
  );
}

export default function CardList({ cards }) {
  if (!Array.isArray(cards) || !cards.length) return null;
  // The host supplies this the way it supplies onOpenForm. Absent, the rows still
  // read — they simply do not offer to open.
  const onOpen = getConfig().onReveal || null;
  return (
    <ul className="fdv2-cards">
      {cards.map((c) => <Card key={`${c.type}-${c.id}`} card={c} onOpen={onOpen} />)}
    </ul>
  );
}
