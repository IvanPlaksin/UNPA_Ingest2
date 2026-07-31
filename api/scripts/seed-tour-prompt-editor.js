'use strict';

/**
 * TOUR-001 — five short tours of the system-prompt editor.
 *
 * FIVE, NOT ONE. A thirty-step tour of an editor is a tour nobody finishes, and the
 * questions people actually arrive with are narrow: "why is my rule silent", "how do
 * I make this graph the live one". Each scenario here is one of those questions,
 * answered in five or six steps, and each can be started from the place the question
 * occurs.
 *
 * The content is also the knowledge base. Every step is indexed as its own record
 * (namespace ALTIORA, section Tour), so the tour assistant answering "what is this
 * field" retrieves the step that explains that field rather than the whole tour.
 *
 * WRITTEN FROM THE DEFECTS, NOT FROM THE UI. Each step says what goes wrong without
 * the thing it describes — a rule scoped to a phase that never occurs, a graph made
 * live before it compiles, a connection drawn that reorders the prompt. That is what
 * an operator needs to know and what a screenshot cannot tell them.
 *
 * Usage: node scripts/seed-tour-prompt-editor.js
 */

require('dotenv').config();

const knowledge = require('../src/services/tour/tour-knowledge.service');

const t = (en, ru) => ({ en, ru });
const step = (id, title, text, over = {}) => ({
  id, content: { title, text }, ...over,
});

const ROUTE = '/flowdesk-admin/prompt';

/** 1 — the question people arrive with. */
const DIAGNOSE = {
  id: 'prompt-diagnose',
  section: 'flowdesk-admin',
  name: t('Why is my rule silent?', 'Почему моё правило молчит?'),
  description: t(
    'A rule that is saved, valid, enabled — and never reaches the model.',
    'Правило сохранено, валидно, включено — и до модели не доходит.',
  ),
  languages: ['en', 'ru'],
  entry: 'why-silent',
  steps: [
    step('why-silent',
      t('A rule can be right and still silent', 'Правило может быть верным и всё равно молчать'),
      t(
        'Saving a rule is not the same as the model receiving it. A rule reaches a turn only if it is ACTIVE, its scope matches, and its condition holds for that turn. Any one of those can be false while everything on screen looks correct.',
        'Сохранить правило — не то же самое, что отдать его модели. Правило попадает в ход, только если оно ACTIVE, область совпадает и условие выполняется на этом ходу. Любое из трёх может быть ложным, а на экране всё выглядит правильно.',
      ),
      { anchorId: 'editor.properties', navigate: { route: ROUTE }, next: 'the-condition' }),

    step('the-condition',
      t('“Applies when” is the usual answer', '«Applies when» — обычная причина'),
      t(
        'This section decides WHEN the rule speaks. Empty means always. A phase here means the rule is absent from every other phase — which is the point, and also the commonest reason a rule seems broken.',
        'Эта секция решает, КОГДА правило говорит. Пусто — значит всегда. Указанная фаза означает, что во всех остальных фазах правила нет — в этом и смысл, и это же самая частая причина «сломанного» правила.',
      ),
      { anchorId: 'editor.properties', next: 'read-the-sentence' }),

    step('read-the-sentence',
      t('Read the sentence, not the boxes', 'Читайте фразу, а не поля'),
      t(
        'Under the fields is the condition in words: “Only when the form is being filled and a request is open.” Four dropdowns need combining in your head; the sentence does not. If it says “Always”, the condition is not why the rule is silent.',
        'Под полями — условие словами: «Only when the form is being filled and a request is open». Четыре списка приходится складывать в голове; фраза — нет. Если написано «Always», причина молчания не в условии.',
      ),
      { anchorId: 'editor.properties', next: 'check-context' }),

    step('check-context',
      t('See the prompt for a real context', 'Посмотрите промпт в реальном контексте'),
      t(
        'The Context tab compiles the prompt as the model will actually receive it, in one of the nine states a conversation can be in. A rule missing here is missing for real — and the panel says why: its condition, its status, or its scope.',
        'Вкладка Context собирает промпт так, как его получит модель, в одном из девяти состояний разговора. Если правила здесь нет — его нет по-настоящему, и панель говорит почему: условие, статус или область.',
      ),
      { anchorId: 'editor.preview', next: 'compare' }),

    step('compare',
      t('Compare two contexts to see the difference', 'Сравните два контекста, чтобы увидеть разницу'),
      t(
        'The real question is rarely “what does the model see while filling a form” — it is “what is DIFFERENT between filling and confirming”. Turn on Compare and the rules that differ sort to the top.',
        'Настоящий вопрос редко звучит как «что видит модель при заполнении» — он звучит как «чем это отличается от подтверждения». Включите Compare, и различающиеся правила окажутся сверху.',
      ),
      { anchorId: 'editor.preview', next: 'coverage' }),

    step('coverage',
      t('A rule that reaches nothing at all', 'Правило, не достигающее ничего'),
      t(
        'Switch the canvas to Coverage. A rule outlined in red reaches none of the nine contexts — it is dead weight: authored, valid, and read by nobody. That is the state this whole tour exists to make visible.',
        'Переключите канву в Coverage. Правило в красной рамке не достигает ни одного из девяти контекстов — это мёртвый груз: написан, валиден, никем не прочитан. Ради видимости этого состояния тур и существует.',
      ),
      { anchorId: 'editor.canvas' }),
  ],
};

/** 2 — scoping a rule. */
const CONDITION = {
  id: 'prompt-condition',
  section: 'flowdesk-admin',
  name: t('Make a rule apply only sometimes', 'Сделать правило применимым не всегда'),
  description: t('Scope a rule to part of the conversation without breaking the rest.',
    'Ограничить правило частью разговора, не сломав остальное.'),
  languages: ['en', 'ru'],
  entry: 'why-scope',
  steps: [
    step('why-scope',
      t('Why scope a rule at all', 'Зачем вообще ограничивать правило'),
      t(
        'An assistant that helps with four different things needs four different sets of guidance. A rule written for form-filling, applied while the user is still saying what they need, is advice about a form that does not exist yet — and it misleads the model exactly when the conversation is most fragile.',
        'Ассистент, помогающий с четырьмя разными задачами, нуждается в четырёх наборах указаний. Правило про заполнение формы, применённое, когда человек ещё формулирует потребность, — это совет про форму, которой ещё нет, и он сбивает модель в самый хрупкий момент разговора.',
      ),
      { anchorId: 'editor.properties', navigate: { route: ROUTE }, next: 'pick-phase' }),

    step('pick-phase',
      t('Where the conversation is', 'Где находится разговор'),
      t(
        'Phase is the coarse dimension and the one to reach for first: intent, choosing a service, filling, confirming, reading the knowledge base, handed over. A rule scoped to a phase stays in the prompt for several turns, which is what you want.',
        'Фаза — грубое измерение, и начинать стоит с неё: намерение, выбор сервиса, заполнение, подтверждение, чтение базы знаний, передача формы. Правило, ограниченное фазой, живёт в промпте несколько ходов — это и нужно.',
      ),
      { anchorId: 'editor.properties', next: 'tool-context' }),

    step('tool-context',
      t('What just happened', 'Что только что произошло'),
      t(
        'Tool context is finer: a draft is open, the catalogue is being searched. Use it only when the rule genuinely depends on the last action — it changes every turn, so a rule scoped to it flickers in and out of the prompt.',
        'Контекст инструмента точнее: открыт черновик, идёт поиск по каталогу. Берите его, только если правило действительно зависит от последнего действия — он меняется каждый ход, и правило будет мигать в промпте.',
      ),
      { anchorId: 'editor.properties', next: 'impossible' }),

    step('impossible',
      t('A condition that can never hold', 'Условие, которое не выполнится никогда'),
      t(
        'Choosing “filling the form” together with “no request is open” describes a turn that cannot occur, and the editor refuses it as you write it. Left unchecked it would be the worst kind of defect: valid, saved, and silent forever.',
        'Выбрать «заполнение формы» вместе с «черновика нет» — значит описать ход, которого не бывает, и редактор откажет сразу. Иначе это был бы худший класс дефекта: валидно, сохранено и молчит вечно.',
      ),
      { anchorId: 'editor.properties', next: 'cost' }),

    step('cost',
      t('A condition is not free', 'Условие не бесплатно'),
      t(
        'Unconditional rules form the cached part of the prompt, paid for once. Conditional text sits after it and is re-sent on every turn. Scoping a long rule to a narrow phase can cost more than leaving it always on — the Context tab shows both numbers.',
        'Безусловные правила образуют кешируемую часть промпта, оплачиваемую один раз. Условный текст идёт после неё и пересылается каждый ход. Ограничить длинное правило узкой фазой может выйти дороже, чем оставить его всегда — вкладка Context показывает оба числа.',
      ),
      { anchorId: 'editor.preview' }),
  ],
};

/** 3 — relations between rules. */
const CONNECTION = {
  id: 'prompt-connection',
  section: 'flowdesk-admin',
  name: t('Connect two rules', 'Связать два правила'),
  description: t('Relations are not annotation — they change the prompt.',
    'Связи — не пометки: они меняют промпт.'),
  languages: ['en', 'ru'],
  entry: 'draw-it',
  steps: [
    step('draw-it',
      t('Pick the relation before you draw it', 'Выберите тип связи до того, как рисовать'),
      t(
        'Choose refines, depends on, conflicts with or illustrates in the toolbar, then drag from the dot at the bottom of one rule to the dot at the top of another. Picking first is what saves re-typing every connection afterwards.',
        'Выберите refines, depends on, conflicts with или illustrates в панели, затем протяните от точки внизу одного правила к точке вверху другого. Выбор до рисования избавляет от переназначения каждой связи потом.',
      ),
      { anchorId: 'editor.canvas', navigate: { route: ROUTE }, next: 'refines-orders' }),

    step('refines-orders',
      t('“Refines” changes the ORDER of the prompt', '«Refines» меняет ПОРЯДОК промпта'),
      t(
        'A refinement is emitted after the rule it refines, because a qualification read before the thing it qualifies is confusing. That makes the relation load-bearing: drawing it moves text, and moving text changes what the provider caches.',
        'Уточнение выводится после того, что оно уточняет, — оговорка, прочитанная раньше самого правила, сбивает. Поэтому связь несущая: рисуя её, вы двигаете текст, а сдвиг текста меняет кешируемую часть.',
      ),
      { anchorId: 'editor.canvas', next: 'depends-on' }),

    step('depends-on',
      t('“Depends on” survives trimming', '«Depends on» переживает обрезку'),
      t(
        'When a prompt has to be cut to fit its budget, a rule kept as a prerequisite is kept with it. That is what this relation buys: the rule that gives another its meaning is not the one dropped for length.',
        'Когда промпт приходится урезать под бюджет, правило-предпосылка сохраняется вместе с зависимым. Это и покупает связь: правило, дающее другому смысл, не выпадет из-за длины.',
      ),
      { anchorId: 'editor.properties', next: 'conflicts' }),

    step('conflicts',
      t('A conflict is a claim, not a note', 'Конфликт — утверждение, а не заметка'),
      t(
        'Recording a conflict between two rules that are both active and unconditional makes the graph unsaveable, on purpose: contradictory instructions are the commonest cause of unstable behaviour. Resolve it by retiring one, merging them, or separating them by condition.',
        'Запись конфликта между двумя активными безусловными правилами делает граф несохраняемым — намеренно: противоречивые указания чаще всего и дают нестабильное поведение. Разрешается снятием одного, слиянием или разведением по условиям.',
      ),
      { anchorId: 'editor.properties', next: 'modes' }),

    step('modes',
      t('Look for relations, do not live among them', 'Связи — то, что ищут, а не то, среди чего живут'),
      t(
        'The canvas draws no connections by default. The bands you see are the order the compiler emits in — the order that decides what the model reads. Switch to Structure or Conflicts when you are looking for a relation, and back when you are not.',
        'По умолчанию канва не рисует связей. Полосы, которые вы видите, — это порядок сборки промпта, тот самый, что решает, что прочтёт модель. Переключайтесь в Structure или Conflicts, когда ищете связь, и обратно, когда нет.',
      ),
      { anchorId: 'editor.canvas' }),
  ],
};

/** 4 — the dangerous button. */
const ACTIVATE = {
  id: 'prompt-activate',
  section: 'flowdesk-admin',
  name: t('Make a graph the system prompt', 'Сделать граф системным промптом'),
  description: t('The one setting that changes every conversation at once.',
    'Единственная настройка, меняющая все разговоры разом.'),
  languages: ['en', 'ru'],
  entry: 'two-verbs',
  steps: [
    step('two-verbs',
      t('Opening a graph and making it live are different', 'Открыть граф и сделать его живым — разное'),
      t(
        'Opening is free and reversible. Making a graph live replaces the system prompt of a running assistant for every user from the next turn. The badge beside the name tells you which graph you are editing, and whether anyone is being served by it.',
        'Открытие бесплатно и обратимо. Сделать граф живым — значит заменить системный промпт работающего ассистента для всех пользователей со следующего хода. Значок рядом с именем говорит, какой граф вы правите и обслуживает ли он кого-нибудь.',
      ),
      { anchorId: 'editor.graphSelector', navigate: { route: ROUTE }, next: 'not-live' }),

    step('not-live',
      t('“Not live” means your edits change nothing', '«Not live» значит, что правки ничего не меняют'),
      t(
        'A graph you are editing that is not the live one is a draft. Saving it creates a version and affects no conversation. That is usually what you want while you work — and occasionally the reason an operator spends an afternoon tuning a prompt nobody reads.',
        'Граф, который вы правите и который не является живым, — черновик. Сохранение создаёт версию и не влияет ни на один разговор. Обычно это то, что нужно, — и иногда причина, по которой оператор полдня настраивает промпт, который никто не читает.',
      ),
      { anchorId: 'editor.graphSelector', next: 'gates' }),

    step('gates',
      t('It is checked before it is accepted', 'Проверка идёт до принятия'),
      t(
        'Before a graph becomes the system prompt it is validated and compiled in all nine dialogue contexts. If any of them fails, nothing changes and you are told which context and why. A graph that compiles at rest and throws once the conversation reaches confirmation would fail mid-dialogue, for some users only.',
        'Прежде чем граф станет системным промптом, он валидируется и собирается во всех девяти контекстах. Если хоть один падает, ничего не меняется, и вам называют контекст и причину. Граф, который собирается в покое и падает при подтверждении, ломался бы посреди разговора и только у части людей.',
      ),
      { anchorId: 'editor.graphSelector', next: 'new-graph' }),

    step('new-graph',
      t('A new graph starts as a copy or as nothing', 'Новый граф начинается копией или пустотой'),
      t(
        '“New graph” takes what is on screen, including unsaved edits, or starts empty. Either way it is not live until you say so. This is how a restructuring is tried without the running assistant noticing.',
        '«New graph» берёт то, что на экране, включая несохранённые правки, — или начинается пустым. В обоих случаях он не живой, пока вы не скажете. Так пробуют перестройку, а работающий ассистент этого не замечает.',
      ),
      { anchorId: 'editor.graphSelector' }),
  ],
};

/** 5 — the report nobody opens until it is too late. */
const COVERAGE = {
  id: 'prompt-coverage',
  section: 'flowdesk-admin',
  name: t('Check what the assistant is told, everywhere', 'Проверить, что ассистенту сказано, во всех ветках'),
  description: t('Nine contexts, and the rules that reach none of them.',
    'Девять контекстов и правила, не достигающие ни одного.'),
  languages: ['en', 'ru'],
  entry: 'nine',
  steps: [
    step('nine',
      t('A conversation has nine shapes', 'У разговора девять состояний'),
      t(
        'Not a hundred: nine. They are derived from the code that computes the phase, so they are the states a conversation can really be in — not every combination the dropdowns could express. That is why you cannot preview “filling a form with no request open”.',
        'Не сто, а девять. Они выведены из кода, вычисляющего фазу, — это состояния, в которых разговор действительно бывает, а не все комбинации, выразимые в списках. Поэтому нельзя посмотреть «заполнение формы без черновика».',
      ),
      { anchorId: 'editor.canvas', navigate: { route: ROUTE }, next: 'dead' }),

    step('dead',
      t('Dead weight', 'Мёртвый груз'),
      t(
        'A rule that reaches none of the nine is in the graph, valid, and read by no one. It usually means a condition was tightened once too often. Coverage mode outlines it in red on the canvas, so it is found by looking rather than by auditing.',
        'Правило, не достигающее ни одного из девяти, лежит в графе, валидно и никем не читается. Обычно это значит, что условие однажды сузили слишком сильно. Режим Coverage обводит его красным на канве — оно находится взглядом, а не аудитом.',
      ),
      { anchorId: 'editor.canvas', next: 'gaps' }),

    step('gaps',
      t('A branch with no safety rules', 'Ветка без правил безопасности'),
      t(
        'The opposite finding, and the more serious one: a context that no constraint and no identity rule reaches. For those turns the assistant is, in effect, a different assistant. It is not visible in any single compile, because a compile only ever looks at one context.',
        'Обратная находка и более серьёзная: контекст, до которого не доходит ни одно ограничение и ни одно правило идентичности. На этих ходах ассистент фактически другой. В отдельной сборке этого не видно — сборка всегда смотрит только на один контекст.',
      ),
      { anchorId: 'editor.preview', next: 'attribution' }),

    step('attribution',
      t('Which rules governed a real turn', 'Какие правила действовали на реальном ходу'),
      t(
        'From a recorded session you can rebuild the exact rules a turn ran under, and see the ones that did not reach it with the reason: “it requires phase to be fill; this turn had confirm”. That is the end of guessing about a conversation that already happened.',
        'По записанной сессии можно восстановить точный набор правил, под которыми шёл ход, и увидеть не дошедшие с причиной: «требуется phase = fill; на этом ходу было confirm». На этом догадки о состоявшемся разговоре заканчиваются.',
      ),
      { anchorId: 'session.turn.rules' }),
  ],
};

const SCENARIOS = [DIAGNOSE, CONDITION, CONNECTION, ACTIVATE, COVERAGE];

/**
 * Standalone explanations — answers to questions an operator asks WITHOUT running a
 * tour. They are indexed beside the steps so the assistant can answer "what is a
 * phase" from the concept rather than from whichever step happens to mention it.
 */
const CONCEPTS = [
  {
    id: 'concept-phase', scenarioId: 'prompt-condition',
    text: t(
      'A phase is where the conversation stands: intent, choosing a service, filling the form, confirming, reading the knowledge base, or handed over to the form. It is computed by code from the tool session, never by the model — a prompt whose scope depended on the model it configures could not be reproduced.',
      'Фаза — это место, где стоит разговор: намерение, выбор сервиса, заполнение формы, подтверждение, чтение базы знаний или передача формы. Её вычисляет код по сессии инструментов, а не модель: промпт, область которого зависела бы от настраиваемой им модели, невоспроизводим.',
    ),
  },
  {
    id: 'concept-in-force', scenarioId: 'prompt-coverage',
    text: t(
      '"In force" means the model was given the rule on that turn. It does NOT mean the rule caused the answer. The set is exact — the turn recorded a version and the rule either compiled into it or did not — but influence is a hypothesis, and the only thing that tests it is running the arena with the rule changed.',
      '«In force» значит, что правило было отдано модели на этом ходу. Это НЕ значит, что оно вызвало ответ. Множество точное — ход записал версию, и правило либо вошло в неё, либо нет, — но влияние это гипотеза, и проверяет её только прогон арены с изменённым правилом.',
    ),
  },
  {
    id: 'concept-cached-core', scenarioId: 'prompt-condition',
    text: t(
      'The cacheable core is the part of the prompt that is identical in every context, so the provider stores it once and charges for it once. Conditional text sits after it and is re-sent every turn. The core must not move: a rule reordered changes the cached prefix even when every sentence is the same.',
      'Кешируемое ядро — часть промпта, одинаковая во всех контекстах: провайдер хранит и оплачивает её один раз. Условный текст идёт после и пересылается каждый ход. Ядро не должно двигаться: переставленное правило меняет кешируемый префикс, даже если все фразы те же.',
    ),
  },
  {
    id: 'concept-live-graph', scenarioId: 'prompt-activate',
    text: t(
      'The live graph is the one the running assistant compiles for every conversation. Exactly one is live at a time. Editing any other graph is safe and affects nobody; making one live takes effect from the next turn, for everyone, and is checked in all nine contexts first.',
      'Живой граф — тот, который работающий ассистент собирает для каждого разговора. Живым может быть ровно один. Правка любого другого безопасна и никого не затрагивает; назначение живым действует со следующего хода для всех и предварительно проверяется во всех девяти контекстах.',
    ),
  },
];

async function main() {
  let steps = 0;
  let indexed = 0;
  for (const scenario of SCENARIOS) {
    // eslint-disable-next-line no-await-in-loop
    await knowledge.upsertScenario(scenario);
    steps += scenario.steps.length;
    // Concepts ride with the scenario they belong to, so a search scoped to that
    // tour can still reach them.
    const mine = CONCEPTS.filter((c) => c.scenarioId === scenario.id);
    // eslint-disable-next-line no-await-in-loop
    const r = await knowledge.indexScenario(scenario, mine).catch((e) => ({ error: e.message }));
    if (r.error) console.log(`  ${scenario.id}: indexing failed — ${r.error}`);
    else indexed += r.indexed;
    console.log(`  ${scenario.id.padEnd(20)} ${String(scenario.steps.length).padStart(2)} steps`
      + `${mine.length ? ` + ${mine.length} concept(s)` : ''}`);
  }
  console.log('');
  console.log(`${SCENARIOS.length} scenarios, ${steps} steps, ${CONCEPTS.length} concepts`);
  console.log(`indexed into the knowledge base: ${indexed} records (namespace ALTIORA, section Tour)`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
