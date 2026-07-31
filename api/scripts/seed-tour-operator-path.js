'use strict';

/**
 * The first tour: from a turn that went wrong to a rule change that is live.
 *
 * This scenario is written by hand, not generated. The research was explicit that a
 * tour's completion rate lives or dies on brevity and on the steps being TRUE, and a
 * generated walk-through of an interface it cannot see is exactly the failure mode
 * this whole system was designed against. Generation can come later, from the same
 * anchors, once there is something to check it against.
 *
 * Every narration is kept under the spoken attention limit — the validator warns at
 * 250 characters (~15 seconds at the measured 17 chars/second) and the runner refuses
 * a scenario that breaks the hard limit. If a step here feels long, it is long.
 *
 *   node api/scripts/seed-tour-operator-path.js
 *   node api/scripts/seed-tour-operator-path.js --dry     (validate, do not write)
 *
 * @module scripts/seed-tour-operator-path
 */

require('dotenv').config();

const knowledge = require('../src/services/tour/tour-knowledge.service');

const t = (en, ru) => ({ en, ru });

const SCENARIO = {
  id: 'operator-path',
  section: 'flowdesk-admin',
  name: t('Why did the assistant answer like that?', 'Почему ассистент ответил именно так?'),
  description: t(
    'From a turn that went wrong to a rule change that is live.',
    'От неудачного хода до изменённого правила в проде.',
  ),
  languages: ['en', 'ru'],
  entry: 'intro',
  steps: [
    {
      id: 'intro',
      content: {
        title: t('The operator’s path', 'Путь оператора'),
        text: t(
          'This tour follows one real task: a turn where the assistant said the wrong thing, and the rule change that fixes it.',
          'Этот тур проходит одну настоящую задачу: ход, где ассистент ответил не так, и правку правила, которая это чинит.',
        ),
      },
      next: 'sessions',
    },
    {
      id: 'sessions',
      anchorId: 'admin.tab.sessions',
      // Host Adapter Protocol: the step says WHERE it lives; this application decides
      // how to get there (a route change here, a page load somewhere else).
      navigate: { type: 'tab', target: 'sessions' },
      content: {
        title: t('Start from a session', 'Начните с сессии'),
        text: t(
          'Everything starts here. Each row is one conversation the assistant had with a real person.',
          'Всё начинается здесь. Каждая строка — один разговор ассистента с живым человеком.',
        ),
      },
      next: 'open-session',
    },
    {
      id: 'open-session',
      anchorId: 'sessions.table',
      navigate: { type: 'tab', target: 'sessions' },
      content: {
        title: t('Open the one that went wrong', 'Откройте неудачную'),
        text: t(
          'Click a session to replay it turn by turn. Look for the moment the assistant lost the thread.',
          'Откройте сессию, чтобы пройти её ход за ходом. Ищите момент, где ассистент потерял нить.',
        ),
      },
      optional: true,
      next: 'prompt-tab',
    },
    {
      id: 'prompt-tab',
      anchorId: 'session.tab.prompt',
      content: {
        title: t('What was it told to do?', 'Что ему было велено?'),
        text: t(
          'This tab answers the first real question: which rules were in force on that turn, with the exact wording the model was given.',
          'Эта вкладка отвечает на главный вопрос: какие правила действовали на том ходу и в какой именно формулировке.',
        ),
      },
      optional: true,
      next: 'in-force',
    },
    {
      id: 'in-force',
      anchorId: 'session.turn.rules',
      content: {
        title: t('In force, not to blame', 'Действовали, а не виноваты'),
        text: t(
          'These rules were given to the model. Which one caused the answer is a guess until you test it — the tour will show you how.',
          'Эти правила модель получила. Какое из них дало такой ответ — гипотеза, пока её не проверишь. Дальше покажем, как.',
        ),
      },
      optional: true,
      next: 'to-editor',
    },
    {
      id: 'to-editor',
      anchorId: 'admin.tab.prompt',
      navigate: { type: 'tab', target: 'prompt' },
      content: {
        title: t('Open the prompt editor', 'Откройте редактор промпта'),
        text: t(
          'The rules live here. The chip at the top tells you which graph is open, and whether it is the one the live chat actually compiles.',
          'Правила живут здесь. Чип сверху говорит, какой граф открыт и тот ли это, который компилирует живой чат.',
        ),
      },
      next: 'explorer',
    },
    {
      id: 'explorer',
      anchorId: 'editor.explorer',
      navigate: { type: 'tab', target: 'prompt' },
      content: {
        title: t('Find the rule by its words', 'Найдите правило по словам'),
        text: t(
          'Search here uses the text the model was given, not the title. Type a phrase you saw in the transcript.',
          'Поиск идёт по тексту, который получила модель, а не по заголовку. Введите фразу из стенограммы.',
        ),
      },
      next: 'properties',
    },
    {
      id: 'properties',
      anchorId: 'editor.properties',
      navigate: { type: 'tab', target: 'prompt' },
      content: {
        title: t('Edit, and say why', 'Правьте и объясняйте зачем'),
        text: t(
          'Change the wording here. The chip names the field this rule type compiles — several nodes carry a legacy copy that compiles to nothing.',
          'Здесь меняется формулировка. Чип называет поле, которое компилируется у этого типа: у части узлов есть устаревшая копия, которая ни во что не компилируется.',
        ),
      },
      next: 'preview',
    },
    {
      id: 'preview',
      anchorId: 'editor.preview',
      navigate: { type: 'tab', target: 'prompt' },
      content: {
        title: t('See what the model will get', 'Посмотрите, что получит модель'),
        text: t(
          'The preview recompiles as you type. If the compiled text does not change, your edit does not reach the model at all.',
          'Предпросмотр пересобирается на лету. Если компилят не изменился — правка до модели не дошла.',
        ),
      },
      optional: true,
      next: 'scope',
    },
    {
      id: 'scope',
      anchorId: 'editor.scope',
      navigate: { type: 'tab', target: 'prompt' },
      content: {
        title: t('How much this governs', 'Насколько это управляет диалогом'),
        text: t(
          'These rules steer the turns the model writes. The rest are written by templates from the form’s own field hints, and no rule reaches them.',
          'Эти правила управляют ходами, которые пишет модель. Остальные пишет шаблон из подсказок полей формы — туда правила не доходят.',
        ),
      },
      optional: true,
      next: 'save',
    },
    {
      id: 'save',
      anchorId: 'editor.save',
      navigate: { type: 'tab', target: 'prompt' },
      content: {
        title: t('Save a version, with a reason', 'Сохраните версию с причиной'),
        text: t(
          'Saving asks why you changed it. The reason is stored on the version, next to the diff, for whoever reads this in six months.',
          'При сохранении спросят причину. Она ляжет на версию рядом с диффом — для того, кто откроет это через полгода.',
        ),
      },
      next: 'outro',
    },
    {
      id: 'outro',
      content: {
        title: t('That is the loop', 'Это и есть цикл'),
        text: t(
          'Problem, rules in force, edit, preview, version. Promoting it is the last step, and it is the one the tour will not do for you.',
          'Проблема, правила в силе, правка, предпросмотр, версия. Промоут — последний шаг, и его тур за вас не сделает.',
        ),
      },
    },
  ],
};

/**
 * Explanations the tour itself does not say, indexed so the assistant can answer
 * questions the steps do not cover. This is the part a static provider cannot have —
 * and the reason the graph-backed provider reports `vectorSearch: true`.
 */
const DOCS = [
  {
    id: 'doc-in-force',
    scenarioId: 'operator-path',
    text: t(
      'A rule was IN FORCE on a turn when it compiled into the prompt version that turn recorded. That is a fact. Whether it CAUSED the answer is a hypothesis, and the only way to test it is to change the rule and re-run the arena on the same scenario.',
      'Правило БЫЛО В СИЛЕ на ходу, если оно скомпилировалось в ту версию промпта, которую ход записал. Это факт. Вызвало ли оно ответ — гипотеза, и проверяется только правкой правила и повторным прогоном арены.',
    ),
  },
  {
    id: 'doc-unattributable',
    scenarioId: 'operator-path',
    text: t(
      'Turns recorded before the provenance fix carry the state-machine graph regardless of which interpreter ran. Their rules cannot be recovered: which version of the agent graph was current then was never written down. The panel says so rather than showing today’s rules.',
      'Ходы, записанные до исправления провенанса, несут граф машины состояний независимо от того, кто вёл ход. Их правила восстановить нельзя: какая версия графа агента была активна, нигде не записано. Панель об этом говорит, а не показывает сегодняшние правила.',
    ),
  },
  {
    id: 'doc-two-graphs',
    scenarioId: 'operator-path',
    text: t(
      'There are two prompt graphs. CHAT_PROMPT belongs to the state machine; EVOLUTIO:PROMPT is what the live agent compiles. Editing the wrong one changes nothing at all, silently — the chip at the top of the editor exists to stop that.',
      'Графов промпта два. CHAT_PROMPT принадлежит машине состояний, EVOLUTIO:PROMPT компилирует живой агент. Правка не того графа не меняет ничего и молча — чип наверху редактора существует именно поэтому.',
    ),
  },
  {
    id: 'doc-template-turns',
    scenarioId: 'operator-path',
    text: t(
      'Under the hybrid interpreter a click in the middle of a form is answered by a template: the question comes from the field’s own hint and the acknowledgement from a fixed string. No model call, so no rule applies. The Scope tab measures how large that share currently is.',
      'В гибридном режиме клик в середине формы отвечает шаблон: вопрос берётся из подсказки поля, подтверждение — из фиксированной строки. Вызова модели нет, значит правила не действуют. Вкладка Scope показывает измеренную долю таких ходов.',
    ),
  },
  {
    id: 'doc-rationale',
    scenarioId: 'operator-path',
    text: t(
      'A new rule cannot be saved without saying why it exists. The twenty-two inherited rules have no recorded intent, which is what makes every edit to them a gamble — the requirement exists to stop that debt growing.',
      'Новое правило нельзя сохранить, не объяснив, зачем оно. У двадцати двух унаследованных замысел не записан, поэтому любая правка в них — риск. Требование существует, чтобы долг не рос.',
    ),
  },
];

async function main() {
  const dry = process.argv.includes('--dry');

  // Validate with the package's own validator — the same one the runner uses, so a
  // scenario that seeds cleanly is a scenario that runs.
  const { validateScenario, anchorsOf } = await import('../../packages/guided-ux/core/index.js');
  const { errors, warnings } = validateScenario(SCENARIO);

  console.log('='.repeat(72));
  console.log(`TOUR: ${SCENARIO.id} — ${SCENARIO.steps.length} steps, ${DOCS.length} explanations`);
  console.log('='.repeat(72));
  for (const w of warnings) console.log(`  warn  ${w.code}${w.stepId ? ` [${w.stepId}]` : ''}: ${w.message}`);
  for (const e of errors) console.log(`  ERROR ${e.code}${e.stepId ? ` [${e.stepId}]` : ''}: ${e.message}`);
  if (errors.length) { console.error('\nNot seeded: fix the errors above.'); process.exit(1); }

  console.log('\nanchors this tour needs from the host:');
  for (const a of anchorsOf(SCENARIO)) console.log(`  ${a}`);

  if (dry) { console.log('\n--dry: nothing written.'); process.exit(0); }

  const up = await knowledge.upsertScenario(SCENARIO);
  console.log(`\ngraph: ${up.steps} steps written`);

  // Narration is generated HERE, not on the first visitor's click: the tour-graph
  // change trigger clears the old recordings and warms every sentence, in every
  // language it was written in.
  if (up.speech) {
    const sp = up.speech;
    console.log(sp.error
      ? `speech: NOT warmed (${sp.error}). The tour still runs; the first listener waits for each line.`
      : `speech: ${sp.generated} generated, ${sp.reused} reused, ${sp.failed} failed, ${sp.skipped} without text (${sp.ms}ms)`);
  }

  try {
    const idx = await knowledge.indexScenario(SCENARIO, DOCS);
    console.log(`vectors: ${idx.indexed} points indexed into ${knowledge.COLLECTION}`);
  } catch (e) {
    // The tour still runs without vectors — only the assistant is weaker. Said, not hidden.
    console.warn(`vectors: NOT indexed (${e.message}). The tour will run; the assistant will fall back to text matching.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error('[seed-tour] FAILED:', e.message); process.exit(1); });
