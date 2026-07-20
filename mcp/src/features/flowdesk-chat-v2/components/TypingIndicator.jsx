import React from 'react';
import { useTranslation } from 'react-i18next';
import { useUI } from '../store/chat-store';

/**
 * TypingIndicator (F7) — turns SSE node-progress into a human-readable status.
 *
 * The store's currentNode is fed by the SSE onNode handler (node:start sets it,
 * node:done/turn:done clears it). We map the current node to a friendly phrase;
 * when loading but between nodes, a neutral "Думаю…" is shown.
 */
const NODE_PHRASES = {
  LOAD_DRAFT: 'Открываю черновик…',
  ROUTER: 'Разбираю ваш запрос…',
  RESOLVE: 'Ищу подходящую услугу…',
  SLOT_EXTRACT: 'Извлекаю данные из сообщения…',
  VALIDATE: 'Проверяю данные…',
  PATCH: 'Сохраняю черновик…',
  ACTIVE_SLOTS: 'Определяю, что ещё нужно…',
  RESOLVERS: 'Подбираю варианты…',
  TERM_CHECK: 'Проверяю готовность…',
  QUESTION_PLANNER: 'Формулирую вопрос…',
  INFO_ANSWER: 'Готовлю ответ…',
  CONFIRM: 'Собираю заявку на подтверждение…',
  SUBMIT: 'Оформляю заявку…',
};

export default function TypingIndicator() {
  const { t } = useTranslation();
  const { loading, currentNode } = useUI();
  if (!loading) return null;

  // Localized node phrase; fall back to the ru map, then "thinking".
  const phrase = (currentNode && (t(`node.${currentNode}`, { defaultValue: NODE_PHRASES[currentNode] || '' }) || NODE_PHRASES[currentNode])) || t('thinking');

  return (
    <div className="fdv2-message fdv2-message-assistant fdv2-typing" aria-live="polite">
      <div className="fdv2-avatar" aria-hidden="true">◆</div>
      <div className="fdv2-bubble-col">
        <div className="fdv2-typing-row">
          <span className="fdv2-typing-dots" aria-hidden="true"><i /><i /><i /></span>
          <span className="fdv2-typing-text">{phrase}</span>
        </div>
      </div>
    </div>
  );
}
