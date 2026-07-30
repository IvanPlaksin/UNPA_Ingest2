'use strict';

/**
 * Voice-formatter localization (V3-014) — per-language overrides for the templates
 * in `interpreter/voice-formatters.js`. English lives in the formatter DEFAULTS;
 * each entry here is a PARTIAL that swaps in localized wording + number words for
 * one of the 6 UN languages. `voiceStrings(lang)` returns the partial (or {}) to
 * pass as the formatters' `s` argument. Shaping (caps, ordering, "more") stays in
 * the formatter — only the words change here.
 *
 * @module instances/flowdesk/interpreter/templates/voice-strings
 */

const NUM = {
  en: ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'],
  ru: ['ноль', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять', 'десять'],
  fr: ['zéro', 'une', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix'],
  es: ['cero', 'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez'],
  ar: ['صفر', 'واحدة', 'اثنتان', 'ثلاث', 'أربع', 'خمس', 'ست', 'سبع', 'ثمان', 'تسع', 'عشر'],
  zh: ['零', '一', '两', '三', '四', '五', '六', '七', '八', '九', '十'],
};

// English is the formatter DEFAULTS — expose an empty partial (still pins numberWords).
const en = { numberWords: NUM.en };

const ru = {
  numberWords: NUM.ru,
  tasksNone: 'У вас нет задач по этому запросу.',
  tasksList: (n, summary, more) => `У вас ${n} ${n === 'одна' ? 'задача' : 'задач'}. ${summary}.${more} Рассказать подробнее о какой-либо из них?`,
  tasksMore: (total) => ` Всего ${total}.`,
  taskItem: (i, t) => `${i}. ${t.title}${t.status ? `, ${t.status}` : ''}${t.priority ? `, приоритет ${t.priority}` : ''}`,
  taskDetail: (t) => `Задача: ${t.title}.${t.status ? ` Статус: ${t.status}.` : ''}${t.priority ? ` Приоритет: ${t.priority}.` : ''}${t.service ? ` Относится к: ${t.service}.` : ''}${t.dueDate ? ` Срок ${t.dueDate}.` : ''}${t.description ? ` ${t.description}` : ''}`,
  requestsNone: 'У вас нет заявок по этому запросу.',
  requestsList: (n, summary, more) => `У вас ${n} ${n === 'одна' ? 'заявка' : 'заявок'}. ${summary}.${more} Рассказать подробнее о какой-либо из них?`,
  requestItem: (i, r) => `${i}. ${r.ref || r.title}${r.status ? `, ${r.status}` : ''}${r.service ? `, ${r.service}` : ''}`,
  requestDetail: (r) => `Заявка ${r.ticketNumber || ''}: ${r.title}.${r.status ? ` Статус: ${r.status}.` : ''}${r.service ? ` Услуга: ${r.service}.` : ''}${r.assignedTo ? ` Назначена: ${r.assignedTo}.` : ' Пока не назначена.'}${r.approver ? ` Согласующий: ${r.approver}.` : ''}${r.description ? ` ${r.description}` : ''}`,
  mailNone: (folder) => `В папке ${folder} нет сообщений.`,
  mailList: (n, folder, summary) => `В папке ${folder} ${n} ${n === 'одна' ? 'сообщение' : 'сообщений'}. ${summary}. Прочитать какое-либо из них?`,
  mailItem: (i, m) => `${i}. От ${m.from || 'неизвестно'}${m.subject ? `, ${m.subject}` : ''}${m.read ? '' : ', непрочитано'}`,
  mailDetail: (m) => `Сообщение от ${m.from || 'неизвестно'}${m.date ? `, ${m.date}` : ''}. Тема: ${m.subject || '(без темы)'}. ${m.body || ''}`,
  mailCounts: (unread) => `У вас ${unread} непрочитанных ${unread === 'одна' ? 'сообщение' : 'сообщений'} во входящих.`,
};

const fr = {
  numberWords: NUM.fr,
  tasksNone: 'Vous n’avez aucune tâche correspondante.',
  tasksList: (n, summary, more) => `Vous avez ${n} ${n === 'une' ? 'tâche' : 'tâches'}. ${summary}.${more} Voulez-vous des détails sur l’une d’elles ?`,
  tasksMore: (total) => ` ${total} au total.`,
  taskItem: (i, t) => `${i}. ${t.title}${t.status ? `, ${t.status}` : ''}${t.priority ? `, priorité ${t.priority}` : ''}`,
  taskDetail: (t) => `Tâche : ${t.title}.${t.status ? ` Statut : ${t.status}.` : ''}${t.priority ? ` Priorité : ${t.priority}.` : ''}${t.service ? ` Concerne : ${t.service}.` : ''}${t.dueDate ? ` Échéance ${t.dueDate}.` : ''}${t.description ? ` ${t.description}` : ''}`,
  requestsNone: 'Vous n’avez aucune demande correspondante.',
  requestsList: (n, summary, more) => `Vous avez ${n} ${n === 'une' ? 'demande' : 'demandes'}. ${summary}.${more} Voulez-vous des détails sur l’une d’elles ?`,
  requestItem: (i, r) => `${i}. ${r.ref || r.title}${r.status ? `, ${r.status}` : ''}${r.service ? `, ${r.service}` : ''}`,
  requestDetail: (r) => `Demande ${r.ticketNumber || ''} : ${r.title}.${r.status ? ` Statut : ${r.status}.` : ''}${r.service ? ` Service : ${r.service}.` : ''}${r.assignedTo ? ` Attribuée à ${r.assignedTo}.` : ' Pas encore attribuée.'}${r.approver ? ` Approbateur : ${r.approver}.` : ''}${r.description ? ` ${r.description}` : ''}`,
  mailNone: (folder) => `Aucun message dans ${folder}.`,
  mailList: (n, folder, summary) => `Vous avez ${n} ${n === 'une' ? 'message' : 'messages'} dans ${folder}. ${summary}. Voulez-vous que j’en lise un ?`,
  mailItem: (i, m) => `${i}. De ${m.from || 'inconnu'}${m.subject ? `, ${m.subject}` : ''}${m.read ? '' : ', non lu'}`,
  mailDetail: (m) => `Message de ${m.from || 'inconnu'}${m.date ? `, ${m.date}` : ''}. Objet : ${m.subject || '(sans objet)'}. ${m.body || ''}`,
  mailCounts: (unread) => `Vous avez ${unread} ${unread === 'une' ? 'message non lu' : 'messages non lus'} dans votre boîte de réception.`,
};

const es = {
  numberWords: NUM.es,
  tasksNone: 'No tiene tareas que coincidan.',
  tasksList: (n, summary, more) => `Tiene ${n} ${n === 'una' ? 'tarea' : 'tareas'}. ${summary}.${more} ¿Quiere detalles de alguna de ellas?`,
  tasksMore: (total) => ` ${total} en total.`,
  taskItem: (i, t) => `${i}. ${t.title}${t.status ? `, ${t.status}` : ''}${t.priority ? `, prioridad ${t.priority}` : ''}`,
  taskDetail: (t) => `Tarea: ${t.title}.${t.status ? ` Estado: ${t.status}.` : ''}${t.priority ? ` Prioridad: ${t.priority}.` : ''}${t.service ? ` Relacionada con: ${t.service}.` : ''}${t.dueDate ? ` Vence ${t.dueDate}.` : ''}${t.description ? ` ${t.description}` : ''}`,
  requestsNone: 'No tiene solicitudes que coincidan.',
  requestsList: (n, summary, more) => `Tiene ${n} ${n === 'una' ? 'solicitud' : 'solicitudes'}. ${summary}.${more} ¿Quiere detalles de alguna de ellas?`,
  requestItem: (i, r) => `${i}. ${r.ref || r.title}${r.status ? `, ${r.status}` : ''}${r.service ? `, ${r.service}` : ''}`,
  requestDetail: (r) => `Solicitud ${r.ticketNumber || ''}: ${r.title}.${r.status ? ` Estado: ${r.status}.` : ''}${r.service ? ` Servicio: ${r.service}.` : ''}${r.assignedTo ? ` Asignada a ${r.assignedTo}.` : ' Aún sin asignar.'}${r.approver ? ` Aprobador: ${r.approver}.` : ''}${r.description ? ` ${r.description}` : ''}`,
  mailNone: (folder) => `No hay mensajes en ${folder}.`,
  mailList: (n, folder, summary) => `Tiene ${n} ${n === 'una' ? 'mensaje' : 'mensajes'} en ${folder}. ${summary}. ¿Quiere que lea alguno?`,
  mailItem: (i, m) => `${i}. De ${m.from || 'desconocido'}${m.subject ? `, ${m.subject}` : ''}${m.read ? '' : ', sin leer'}`,
  mailDetail: (m) => `Mensaje de ${m.from || 'desconocido'}${m.date ? `, ${m.date}` : ''}. Asunto: ${m.subject || '(sin asunto)'}. ${m.body || ''}`,
  mailCounts: (unread) => `Tiene ${unread} ${unread === 'una' ? 'mensaje sin leer' : 'mensajes sin leer'} en su bandeja de entrada.`,
};

const ar = {
  numberWords: NUM.ar,
  tasksNone: 'لا توجد لديك مهام مطابقة.',
  tasksList: (n, summary, more) => `لديك ${n} ${n === 'واحدة' ? 'مهمة' : 'مهام'}. ${summary}.${more} هل تريد تفاصيل عن أي منها؟`,
  tasksMore: (total) => ` ${total} إجمالاً.`,
  taskItem: (i, t) => `${i}. ${t.title}${t.status ? `، ${t.status}` : ''}${t.priority ? `، الأولوية ${t.priority}` : ''}`,
  taskDetail: (t) => `المهمة: ${t.title}.${t.status ? ` الحالة: ${t.status}.` : ''}${t.priority ? ` الأولوية: ${t.priority}.` : ''}${t.service ? ` تتعلق بـ: ${t.service}.` : ''}${t.dueDate ? ` تاريخ الاستحقاق ${t.dueDate}.` : ''}${t.description ? ` ${t.description}` : ''}`,
  requestsNone: 'لا توجد لديك طلبات مطابقة.',
  requestsList: (n, summary, more) => `لديك ${n} ${n === 'واحدة' ? 'طلب' : 'طلبات'}. ${summary}.${more} هل تريد تفاصيل عن أي منها؟`,
  requestItem: (i, r) => `${i}. ${r.ref || r.title}${r.status ? `، ${r.status}` : ''}${r.service ? `، ${r.service}` : ''}`,
  requestDetail: (r) => `الطلب ${r.ticketNumber || ''}: ${r.title}.${r.status ? ` الحالة: ${r.status}.` : ''}${r.service ? ` الخدمة: ${r.service}.` : ''}${r.assignedTo ? ` مُسند إلى ${r.assignedTo}.` : ' لم يُسند بعد.'}${r.approver ? ` المُوافِق: ${r.approver}.` : ''}${r.description ? ` ${r.description}` : ''}`,
  mailNone: (folder) => `لا توجد رسائل في ${folder}.`,
  mailList: (n, folder, summary) => `لديك ${n} ${n === 'واحدة' ? 'رسالة' : 'رسائل'} في ${folder}. ${summary}. هل تريد أن أقرأ أياً منها؟`,
  mailItem: (i, m) => `${i}. من ${m.from || 'غير معروف'}${m.subject ? `، ${m.subject}` : ''}${m.read ? '' : '، غير مقروءة'}`,
  mailDetail: (m) => `رسالة من ${m.from || 'غير معروف'}${m.date ? `، ${m.date}` : ''}. الموضوع: ${m.subject || '(بدون موضوع)'}. ${m.body || ''}`,
  mailCounts: (unread) => `لديك ${unread} ${unread === 'واحدة' ? 'رسالة غير مقروءة' : 'رسائل غير مقروءة'} في صندوق الوارد.`,
};

const zh = {
  numberWords: NUM.zh,
  tasksNone: '没有符合条件的任务。',
  tasksList: (n, summary, more) => `您有 ${n} 项任务。${summary}。${more} 需要了解其中任何一项的详情吗？`,
  tasksMore: (total) => ` 共 ${total} 项。`,
  taskItem: (i, t) => `第${i}项：${t.title}${t.status ? `，${t.status}` : ''}${t.priority ? `，优先级 ${t.priority}` : ''}`,
  taskDetail: (t) => `任务：${t.title}。${t.status ? ` 状态：${t.status}。` : ''}${t.priority ? ` 优先级：${t.priority}。` : ''}${t.service ? ` 相关：${t.service}。` : ''}${t.dueDate ? ` 截止 ${t.dueDate}。` : ''}${t.description ? ` ${t.description}` : ''}`,
  requestsNone: '没有符合条件的请求。',
  requestsList: (n, summary, more) => `您有 ${n} 个请求。${summary}。${more} 需要了解其中任何一个的详情吗？`,
  requestItem: (i, r) => `第${i}个：${r.ref || r.title}${r.status ? `，${r.status}` : ''}${r.service ? `，${r.service}` : ''}`,
  requestDetail: (r) => `请求 ${r.ticketNumber || ''}：${r.title}。${r.status ? ` 状态：${r.status}。` : ''}${r.service ? ` 服务：${r.service}。` : ''}${r.assignedTo ? ` 已指派给 ${r.assignedTo}。` : ' 尚未指派。'}${r.approver ? ` 审批人：${r.approver}。` : ''}${r.description ? ` ${r.description}` : ''}`,
  mailNone: (folder) => `${folder} 中没有邮件。`,
  mailList: (n, folder, summary) => `${folder} 中有 ${n} 封邮件。${summary}。需要我读其中任何一封吗？`,
  mailItem: (i, m) => `第${i}封：来自 ${m.from || '未知'}${m.subject ? `，${m.subject}` : ''}${m.read ? '' : '，未读'}`,
  mailDetail: (m) => `来自 ${m.from || '未知'} 的邮件${m.date ? `，${m.date}` : ''}。主题：${m.subject || '(无主题)'}。${m.body || ''}`,
  mailCounts: (unread) => `您的收件箱有 ${unread} 封未读邮件。`,
};

const STRINGS = { en, ru, fr, es, ar, zh };

/** Localized formatter-string partial for a language (falls back to English). */
function voiceStrings(lang) {
  const key = String(lang || 'en').split('-')[0].toLowerCase();
  return STRINGS[key] || STRINGS.en;
}

module.exports = { voiceStrings, STRINGS, NUM };
