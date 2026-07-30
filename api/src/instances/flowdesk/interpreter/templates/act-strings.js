'use strict';

/**
 * ACT (approve/reject) conversation strings (P9-007/009) — the deterministic
 * governance confirm-gate + outcomes for the chat's approval capability, in the 6
 * UN languages. Kept in its own module (like voice-strings) rather than surgically
 * editing the large per-language `agent` objects in ui-strings. `actStrings(lang)`
 * returns the set (English fallback). Templates take the mapped authorization item
 * `t` = { ticketNumber, title, justification? }.
 *
 * @module instances/flowdesk/interpreter/templates/act-strings
 */

const label = (t) => `${t.ticketNumber || ''}${t.title ? ` — ${t.title}` : ''}`;

const en = {
  approveConfirm: (t) => `Approve request ${label(t)}? (yes / no)`,
  rejectConfirm: (t) => `Reject request ${label(t)}${t.justification ? `, reason: "${t.justification}"` : ''}? (yes / no)`,
  rejectReasonPrompt: (t) => `Why are you rejecting ${t.ticketNumber}? Please give a brief reason (or say cancel).`,
  approveDone: (t) => `Done — I've approved ${t.ticketNumber}.`,
  rejectDone: (t) => `Done — I've rejected ${t.ticketNumber}.`,
  cancelled: 'No problem — I haven’t recorded any decision.',
  queueEmpty: 'You have no items waiting for your approval.',
  queueList: (n, summary) => `You have ${n} item(s) awaiting your approval:\n${summary}\nWhich one — say the number or the request?`,
  queueSpeech: (n) => `You have ${n} item${n === 1 ? '' : 's'} awaiting your approval. Which one would you like to act on?`,
  notFound: (ref) => `I couldn't find ${ref} in your pending approvals — it may already be decided, or you may not be its approver.`,
  notApprover: (t) => `You're not listed as the approver for ${t.ticketNumber}, so I can't record that decision.`,
  alreadyProcessed: (t) => `${t.ticketNumber} has already been decided, so there's nothing to do.`,
  error: 'I couldn’t record that decision right now — please try again.',
};

const ru = {
  approveConfirm: (t) => `Одобрить заявку ${label(t)}? (да / нет)`,
  rejectConfirm: (t) => `Отклонить заявку ${label(t)}${t.justification ? `, причина: «${t.justification}»` : ''}? (да / нет)`,
  rejectReasonPrompt: (t) => `Почему вы отклоняете ${t.ticketNumber}? Укажите краткую причину (или скажите «отмена»).`,
  approveDone: (t) => `Готово — я одобрил ${t.ticketNumber}.`,
  rejectDone: (t) => `Готово — я отклонил ${t.ticketNumber}.`,
  cancelled: 'Хорошо — решение не зафиксировано.',
  queueEmpty: 'У вас нет заявок, ожидающих вашего согласования.',
  queueList: (n, summary) => `У вас ${n} заявок(и) на согласовании:\n${summary}\nКакую именно — назовите номер или заявку?`,
  queueSpeech: (n) => `У вас ${n} заявок на согласовании. С какой хотите поработать?`,
  notFound: (ref) => `Не нашёл ${ref} среди ваших согласований — возможно, решение уже принято или вы не являетесь согласующим.`,
  notApprover: (t) => `Вы не указаны согласующим для ${t.ticketNumber}, поэтому я не могу зафиксировать это решение.`,
  alreadyProcessed: (t) => `По ${t.ticketNumber} решение уже принято — делать нечего.`,
  error: 'Не удалось зафиксировать решение — попробуйте ещё раз.',
};

const fr = {
  approveConfirm: (t) => `Approuver la demande ${label(t)} ? (oui / non)`,
  rejectConfirm: (t) => `Rejeter la demande ${label(t)}${t.justification ? `, motif : « ${t.justification} »` : ''} ? (oui / non)`,
  rejectReasonPrompt: (t) => `Pourquoi rejetez-vous ${t.ticketNumber} ? Indiquez un motif bref (ou dites annuler).`,
  approveDone: (t) => `C'est fait — j'ai approuvé ${t.ticketNumber}.`,
  rejectDone: (t) => `C'est fait — j'ai rejeté ${t.ticketNumber}.`,
  cancelled: `Pas de souci — aucune décision n'a été enregistrée.`,
  queueEmpty: `Vous n'avez aucun élément en attente de votre approbation.`,
  queueList: (n, summary) => `Vous avez ${n} élément(s) en attente d'approbation :\n${summary}\nLequel — dites le numéro ou la demande ?`,
  queueSpeech: (n) => `Vous avez ${n} élément(s) en attente de votre approbation. Sur lequel voulez-vous agir ?`,
  notFound: (ref) => `Je n'ai pas trouvé ${ref} dans vos approbations en attente — il est peut-être déjà décidé, ou vous n'en êtes pas l'approbateur.`,
  notApprover: (t) => `Vous n'êtes pas l'approbateur de ${t.ticketNumber}, je ne peux donc pas enregistrer cette décision.`,
  alreadyProcessed: (t) => `${t.ticketNumber} a déjà été décidé, il n'y a rien à faire.`,
  error: `Je n'ai pas pu enregistrer cette décision — réessayez.`,
};

const es = {
  approveConfirm: (t) => `¿Aprobar la solicitud ${label(t)}? (sí / no)`,
  rejectConfirm: (t) => `¿Rechazar la solicitud ${label(t)}${t.justification ? `, motivo: «${t.justification}»` : ''}? (sí / no)`,
  rejectReasonPrompt: (t) => `¿Por qué rechaza ${t.ticketNumber}? Indique un motivo breve (o diga cancelar).`,
  approveDone: (t) => `Listo — he aprobado ${t.ticketNumber}.`,
  rejectDone: (t) => `Listo — he rechazado ${t.ticketNumber}.`,
  cancelled: 'Sin problema — no he registrado ninguna decisión.',
  queueEmpty: 'No tiene elementos pendientes de su aprobación.',
  queueList: (n, summary) => `Tiene ${n} elemento(s) pendientes de aprobación:\n${summary}\n¿Cuál — diga el número o la solicitud?`,
  queueSpeech: (n) => `Tiene ${n} elemento(s) pendientes de su aprobación. ¿Sobre cuál desea actuar?`,
  notFound: (ref) => `No encontré ${ref} en sus aprobaciones pendientes — puede que ya esté decidido o que usted no sea su aprobador.`,
  notApprover: (t) => `Usted no figura como aprobador de ${t.ticketNumber}, así que no puedo registrar esa decisión.`,
  alreadyProcessed: (t) => `${t.ticketNumber} ya ha sido decidido, no hay nada que hacer.`,
  error: 'No pude registrar esa decisión ahora — inténtelo de nuevo.',
};

const ar = {
  approveConfirm: (t) => `هل تعتمد الطلب ${label(t)}؟ (نعم / لا)`,
  rejectConfirm: (t) => `هل ترفض الطلب ${label(t)}${t.justification ? `، السبب: «${t.justification}»` : ''}؟ (نعم / لا)`,
  rejectReasonPrompt: (t) => `لماذا ترفض ${t.ticketNumber}؟ يرجى ذكر سبب موجز (أو قل إلغاء).`,
  approveDone: (t) => `تم — اعتمدت ${t.ticketNumber}.`,
  rejectDone: (t) => `تم — رفضت ${t.ticketNumber}.`,
  cancelled: 'لا مشكلة — لم أسجّل أي قرار.',
  queueEmpty: 'ليست لديك عناصر بانتظار اعتمادك.',
  queueList: (n, summary) => `لديك ${n} عنصراً بانتظار اعتمادك:\n${summary}\nأيها — اذكر الرقم أو الطلب؟`,
  queueSpeech: (n) => `لديك ${n} عنصراً بانتظار اعتمادك. على أيها تريد اتخاذ إجراء؟`,
  notFound: (ref) => `لم أجد ${ref} ضمن اعتماداتك المعلّقة — ربما تمّ البتّ فيه، أو أنك لست المعتمِد له.`,
  notApprover: (t) => `أنت لست المعتمِد لـ ${t.ticketNumber}، لذا لا يمكنني تسجيل هذا القرار.`,
  alreadyProcessed: (t) => `تمّ البتّ في ${t.ticketNumber} بالفعل، لا يوجد ما يُفعل.`,
  error: 'تعذّر تسجيل هذا القرار الآن — يرجى المحاولة مجدداً.',
};

const zh = {
  approveConfirm: (t) => `批准请求 ${label(t)} 吗？（是 / 否）`,
  rejectConfirm: (t) => `驳回请求 ${label(t)}${t.justification ? `，原因：“${t.justification}”` : ''} 吗？（是 / 否）`,
  rejectReasonPrompt: (t) => `您为何驳回 ${t.ticketNumber}？请简要说明原因（或说取消）。`,
  approveDone: (t) => `已完成——我已批准 ${t.ticketNumber}。`,
  rejectDone: (t) => `已完成——我已驳回 ${t.ticketNumber}。`,
  cancelled: '好的——我没有记录任何决定。',
  queueEmpty: '没有等待您批准的事项。',
  queueList: (n, summary) => `您有 ${n} 项待批准：\n${summary}\n哪一项——请说编号或请求？`,
  queueSpeech: (n) => `您有 ${n} 项等待您批准。您想处理哪一项？`,
  notFound: (ref) => `未在您的待批准事项中找到 ${ref}——可能已处理，或您并非其审批人。`,
  notApprover: (t) => `您不是 ${t.ticketNumber} 的审批人，因此我无法记录该决定。`,
  alreadyProcessed: (t) => `${t.ticketNumber} 已处理，无需操作。`,
  error: '暂时无法记录该决定——请重试。',
};

const STRINGS = { en, ru, fr, es, ar, zh };
function actStrings(lang) {
  const key = String(lang || 'en').split('-')[0].toLowerCase();
  return STRINGS[key] || STRINGS.en;
}

module.exports = { actStrings, STRINGS };
