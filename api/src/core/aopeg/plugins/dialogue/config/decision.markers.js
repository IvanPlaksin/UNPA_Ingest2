/**
 * ADR detection markers for extracting architectural decisions from dialogue.
 * Stub — populated in TASK-DLG-P2-004 (ADR extraction executor).
 */
const DECISION_MARKERS = {
  // Русские маркеры
  ru: {
    positive: [
      'решено', 'принято решение', 'выбираем', 'используем', 'утверждаю',
      'договорились', 'план от', 'подход выбран', 'реализуем',
    ],
    negative: [
      'не используем', 'отказываемся', 'отклонено', 'не подходит',
    ],
  },
  // English markers
  en: {
    positive: [
      "let's go with", "decided to", "we'll use", "going with",
      "approach chosen", "agreed on", "implementing", "approved",
    ],
    negative: [
      "rejected", "won't use", "not going with", "dropped",
    ],
  },
  // Task reference patterns (links decision to BackLog/Codex)
  references: {
    backlog: /BACKLOG-\d{4}/g,
    task: /TASK-[A-Z]+-[A-Z0-9]+-\d+/g,
    codex: /CODEX-RULE-[A-Z]+-\d+/g,
  },
};

module.exports = { DECISION_MARKERS };
