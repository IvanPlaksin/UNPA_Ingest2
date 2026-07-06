import React, { useState } from 'react';
import {
  Accordion, AccordionSummary, AccordionDetails,
  Box, Typography, Chip,
} from '@mui/material';
import { HelpCircle, ChevronDown } from 'lucide-react';

// ── Bilingual content ────────────────────────────────────────────────────────

const CONTENT = {
  manifold: {
    en: {
      title: 'Manifold Projection — How to Use',
      sections: [
        {
          heading: 'What is this?',
          body: 'Dimensionality reduction projects 1024-dimensional embedding vectors onto a 2D plane, making semantic structure visible. Each point represents one entity from the knowledge base.',
        },
        {
          heading: 'PCA vs UMAP',
          items: [
            'PCA (Principal Component Analysis) — linear projection along directions of maximum variance. Fast and deterministic. Axes (PC1, PC2) are linear combinations of original dimensions. Best for quick overviews and outlier detection.',
            'UMAP (Uniform Manifold Approximation and Projection) — non-linear manifold learning that preserves both local neighborhoods and global topology. Slower, reveals fine-grained cluster boundaries. Results vary slightly between runs (stochastic).',
          ],
        },
        {
          heading: 'How to use',
          items: [
            'Select Method: PCA for a fast overview, UMAP for detailed topology.',
            'Adjust the "Points" slider — more points reveal more structure but increase computation time.',
            'Use Entity Type or Epistemic Layer filters (left panel) to focus on a subset.',
            'Click "Compute" to generate the projection.',
            'Click any point in the chart to select it in the left panel and see its metadata.',
          ],
        },
        {
          heading: 'Interpreting results',
          items: [
            'Tight clusters → semantically homogeneous entity groups (e.g., all Security Council resolutions).',
            'Points far apart → semantically distant concepts — unrelated domains.',
            'Overlapping entity types → cross-domain concepts shared between knowledge areas.',
            'PC1/PC2 variance % (shown in chips) → how much information is captured by each axis. Higher = better 2D representation.',
            'Sparse, spread-out points → diverse collection with no strong semantic groupings.',
          ],
        },
      ],
    },
    ru: {
      title: 'Проекция на многообразие — Как использовать',
      sections: [
        {
          heading: 'Что это такое?',
          body: 'Снижение размерности проецирует 1024-мерные векторы эмбеддингов на 2D плоскость, делая семантическую структуру видимой. Каждая точка — одна сущность из базы знаний.',
        },
        {
          heading: 'PCA и UMAP',
          items: [
            'PCA (Метод главных компонент) — линейная проекция вдоль направлений максимальной дисперсии. Быстрый и детерминированный. Оси (PC1, PC2) — линейные комбинации исходных измерений. Оптимален для быстрого обзора и выявления выбросов.',
            'UMAP (Равномерная аппроксимация многообразия) — нелинейное обучение на многообразии, сохраняющее как локальные соседства, так и глобальную топологию. Медленнее, выявляет тонкие границы кластеров. Стохастический — результаты могут немного различаться между запусками.',
          ],
        },
        {
          heading: 'Как использовать',
          items: [
            'Выберите метод: PCA для быстрого обзора, UMAP для детальной топологии.',
            'Настройте слайдер "Points" — больше точек раскрывают больше структуры, но увеличивают время вычисления.',
            'Используйте фильтры по типу сущности или эпистемическому слою (левая панель) для фокусировки на подмножестве.',
            'Нажмите "Compute" для генерации проекции.',
            'Кликните любую точку на графике, чтобы выбрать её в левой панели и увидеть метаданные.',
          ],
        },
        {
          heading: 'Интерпретация результатов',
          items: [
            'Плотные кластеры → семантически однородные группы сущностей (например, все резолюции Совета Безопасности).',
            'Далёкие точки → семантически далёкие концепции — несвязанные предметные области.',
            'Перекрывающиеся типы сущностей → межотраслевые концепции, общие для разных областей знаний.',
            'Доля дисперсии PC1/PC2 (в чипах) → сколько информации захвачено каждой осью. Чем выше — тем лучше 2D-представление.',
            'Разреженные, рассеянные точки → разнообразная коллекция без выраженных семантических группировок.',
          ],
        },
      ],
    },
  },

  similarity: {
    en: {
      title: 'Cosine Similarity Matrix — How to Use',
      sections: [
        {
          heading: 'What is this?',
          body: 'A pairwise cosine similarity matrix between selected vectors. Cosine similarity measures the angle between two vectors in high-dimensional space: 0 = orthogonal (unrelated), 1 = parallel (identical meaning).',
        },
        {
          heading: 'How to use',
          items: [
            'Check ≥ 2 points using the checkboxes in the left panel list.',
            'Switch to the "Similarity" tab.',
            'Click "Compute Matrix" — the matrix is built from the checked points (up to 50).',
            'Hover over any cell to see the exact similarity value and the names of the two entities being compared.',
          ],
        },
        {
          heading: 'Interpreting the heatmap',
          items: [
            'Red (0.8–1.0) — Very high similarity: nearly synonymous concepts or duplicate entities.',
            'Blue-purple (0.5–0.7) — Moderate similarity: related but distinct concepts from the same domain.',
            'Dark blue (0.0–0.3) — Low similarity: semantically distant or unrelated entities.',
            'Diagonal = 1.0 always — self-similarity of each entity with itself.',
            'The matrix is symmetric: sim(A, B) = sim(B, A).',
          ],
        },
        {
          heading: 'Analytical uses',
          items: [
            'Identify duplicates or near-duplicates (red off-diagonal cells) for deduplication.',
            'Detect thematic clusters by looking for blocks of high similarity.',
            'Find bridge concepts — entities with moderate similarity to multiple distinct groups.',
            'Compare entity types: cross-type red cells may indicate mislabeled or ambiguous entities.',
          ],
        },
      ],
    },
    ru: {
      title: 'Матрица косинусного сходства — Как использовать',
      sections: [
        {
          heading: 'Что это такое?',
          body: 'Матрица попарного косинусного сходства между выбранными векторами. Косинусное сходство измеряет угол между двумя векторами в многомерном пространстве: 0 = ортогональные (несвязанные), 1 = параллельные (идентичный смысл).',
        },
        {
          heading: 'Как использовать',
          items: [
            'Отметьте ≥ 2 точки с помощью флажков в списке левой панели.',
            'Перейдите на вкладку "Similarity".',
            'Нажмите "Compute Matrix" — матрица строится из отмеченных точек (до 50).',
            'Наведите на любую ячейку, чтобы увидеть точное значение сходства и имена двух сравниваемых сущностей.',
          ],
        },
        {
          heading: 'Интерпретация тепловой карты',
          items: [
            'Красный (0.8–1.0) — Очень высокое сходство: практически синонимичные концепции или дубликаты сущностей.',
            'Сине-фиолетовый (0.5–0.7) — Умеренное сходство: связанные, но различные концепции из одной предметной области.',
            'Тёмно-синий (0.0–0.3) — Низкое сходство: семантически далёкие или несвязанные сущности.',
            'Диагональ = 1.0 всегда — сходство каждой сущности с собой.',
            'Матрица симметрична: sim(A, B) = sim(B, A).',
          ],
        },
        {
          heading: 'Аналитические применения',
          items: [
            'Выявление дубликатов или почти-дубликатов (красные ячейки вне диагонали) для дедупликации.',
            'Обнаружение тематических кластеров по блокам высокого сходства.',
            'Поиск "мостиков" — сущностей с умеренным сходством с несколькими различными группами.',
            'Сравнение типов сущностей: красные ячейки между разными типами могут указывать на неправильно помеченные или неоднозначные сущности.',
          ],
        },
      ],
    },
  },

  knn: {
    en: {
      title: 'k-NN Graph — How to Use',
      sections: [
        {
          heading: 'What is this?',
          body: 'A 3D force-directed graph where each node is a vector and edges connect each point to its k nearest neighbors by cosine similarity. The physics simulation positions semantically similar nodes closer together organically.',
        },
        {
          heading: 'How to use',
          items: [
            'Adjust k (2–15) — the number of neighbors each node connects to. Higher k → denser graph.',
            'Click "Build Graph" to compute and render the graph.',
            'Left-drag to rotate the 3D scene.',
            'Scroll to zoom in/out.',
            'Right-drag to pan.',
            'Click a node to select it in the left panel and view its metadata.',
          ],
        },
        {
          heading: 'Interpreting the graph',
          items: [
            'Dense clusters → semantically cohesive entity groups (e.g., UN treaty body concepts).',
            'Hub nodes (many edges) → central concepts referenced by many other entities — high "semantic centrality".',
            'Isolated or peripheral nodes → unique concepts with low similarity to the rest of the collection.',
            'Edge thickness → proportional to cosine similarity between the two connected nodes.',
            'Node color → entity type (ACTOR=blue, CONCEPT=cyan, POLICY=red, PERSON=green, etc.).',
            'Long edges between clusters → semantic bridges between different knowledge domains.',
          ],
        },
        {
          heading: 'Effect of k on the graph',
          items: [
            'Low k (2–4) → sparse, shows only the strongest relationships, highlights clear communities.',
            'Medium k (5–8) → balanced — reveals community structure while remaining readable.',
            'High k (10–15) → dense, reveals global topology and "transition zones" between topic areas.',
          ],
        },
      ],
    },
    ru: {
      title: 'Граф k-NN — Как использовать',
      sections: [
        {
          heading: 'Что это такое?',
          body: '3D граф с принудительным расположением, где каждый узел — вектор, а рёбра соединяют каждую точку с её k ближайшими соседями по косинусному сходству. Физическая симуляция органично располагает семантически близкие узлы ближе друг к другу.',
        },
        {
          heading: 'Как использовать',
          items: [
            'Настройте k (2–15) — количество соседей, с которыми соединяется каждый узел. Больший k → плотнее граф.',
            'Нажмите "Build Graph" для вычисления и отрисовки графа.',
            'Перетаскивание левой кнопкой — вращение 3D-сцены.',
            'Колесо мыши — масштабирование.',
            'Перетаскивание правой кнопкой — перемещение.',
            'Клик на узел — выбор его в левой панели и просмотр метаданных.',
          ],
        },
        {
          heading: 'Интерпретация графа',
          items: [
            'Плотные кластеры → семантически однородные группы сущностей (например, концепции договорных органов ООН).',
            'Узлы-хабы (много рёбер) → центральные концепции, на которые ссылаются многие другие сущности — высокая "семантическая центральность".',
            'Изолированные или периферийные узлы → уникальные концепции с низким сходством с остальной коллекцией.',
            'Толщина рёбер → пропорциональна косинусному сходству между двумя соединёнными узлами.',
            'Цвет узлов → тип сущности (ACTOR=синий, CONCEPT=голубой, POLICY=красный, PERSON=зелёный и т.д.).',
            'Длинные рёбра между кластерами → семантические мосты между различными предметными областями.',
          ],
        },
        {
          heading: 'Влияние k на граф',
          items: [
            'Малый k (2–4) → разреженный, показывает только сильнейшие связи, выделяет чёткие сообщества.',
            'Средний k (5–8) → сбалансированный — выявляет структуру сообществ, оставаясь читаемым.',
            'Большой k (10–15) → плотный, раскрывает глобальную топологию и "переходные зоны" между тематическими областями.',
          ],
        },
      ],
    },
  },

  analytics: {
    en: {
      title: 'Collection Analytics — How to Use',
      sections: [
        {
          heading: 'What is this?',
          body: 'Statistical analysis of the vector collection — distributions, coverage metrics, and data quality indicators. Understanding composition helps identify extraction biases and knowledge gaps.',
        },
        {
          heading: 'Entity Type Distribution',
          body: 'Shows how many vectors exist per entity type. An uneven distribution may indicate extraction bias — e.g., too many ACTOR entities and few CONCEPT entities suggests the extraction pipeline over-indexes on named actors vs. abstract knowledge.',
        },
        {
          heading: 'Epistemic Layer Distribution',
          body: 'Shows coverage across knowledge strata: L0=Observable Facts, L1=Concepts & Definitions, L2=Principles & Norms, L3=Meta-knowledge & Governance. Gaps indicate missing knowledge strata — a collection without L2/L3 lacks normative and principled knowledge.',
        },
        {
          heading: 'Embedding Model Distribution',
          body: 'Which models produced the vectors. Mixed models in the same collection reduce similarity accuracy — vectors from different models are not directly comparable. Ideally, one model per collection.',
        },
        {
          heading: 'Analytical indicators',
          items: [
            'Document Coverage: how many unique source documents contributed vectors. Low coverage = concentrated knowledge base.',
            'Indexing range: time span of vector creation — reveals when knowledge was ingested.',
            'Sample size: the analytics are computed on a sample (up to 1500 points); for large collections, distributions are approximate.',
          ],
        },
      ],
    },
    ru: {
      title: 'Аналитика коллекции — Как использовать',
      sections: [
        {
          heading: 'Что это такое?',
          body: 'Статистический анализ векторной коллекции — распределения, метрики охвата и индикаторы качества данных. Понимание состава помогает выявить смещения при извлечении и пробелы в знаниях.',
        },
        {
          heading: 'Распределение по типам сущностей',
          body: 'Показывает количество векторов каждого типа. Неравномерное распределение может указывать на смещение при извлечении — например, слишком много сущностей ACTOR и мало CONCEPT говорит о том, что пайплайн извлечения акцентируется на именованных участниках, а не на абстрактных знаниях.',
        },
        {
          heading: 'Распределение по эпистемическим слоям',
          body: 'Показывает охват уровней знаний: L0=Наблюдаемые факты, L1=Концепции и определения, L2=Принципы и нормы, L3=Метазнания и управление. Пробелы указывают на отсутствующие страты — коллекция без L2/L3 лишена нормативных и принципиальных знаний.',
        },
        {
          heading: 'Распределение моделей эмбеддингов',
          body: 'Какие модели создали векторы. Смешанные модели в одной коллекции снижают точность сходства — векторы из разных моделей напрямую несопоставимы. В идеале — одна модель на коллекцию.',
        },
        {
          heading: 'Аналитические показатели',
          items: [
            'Охват документов: сколько уникальных исходных документов предоставили векторы. Низкий охват = сконцентрированная база знаний.',
            'Диапазон индексации: временной промежуток создания векторов — показывает, когда знания были загружены.',
            'Размер выборки: аналитика вычисляется на выборке (до 1500 точек); для больших коллекций распределения приближённые.',
          ],
        },
      ],
    },
  },

  'entity-store': {
    en: {
      title: 'Entity Store — Knowledge Graph Browser',
      sections: [
        {
          heading: 'What is this?',
          body: 'Entity Store is the knowledge graph management interface. It displays ESEntities extracted from documents and their formal relationships, organized by epistemic layer and entity type.',
        },
        {
          heading: 'Visualization modes',
          items: [
            '2D ReactFlow — interactive force-directed graph. Drag nodes, inspect edges, use layout controls in the toolbar.',
            'LOD Map — level-of-detail viewport rendering using a precomputed cluster pyramid. Build the pyramid first via the Layers icon in the graph toolbar.',
            '3D Singularity — immersive 3D force-directed graph. Rotate (left-drag), zoom (scroll), pan (right-drag), click a node to select it.',
          ],
        },
        {
          heading: 'Epistemic layers',
          items: [
            'L0 — Observable Facts: concrete, verifiable facts extracted directly from document text.',
            'L1 — Concepts & Definitions: abstract concepts, terminology, and named entities.',
            'L2 — Principles & Norms: rules, standards, commitments, and policy frameworks.',
            'L3 — Meta-knowledge: knowledge about knowledge — governance structures, frameworks, and cross-domain relationships.',
          ],
        },
        {
          heading: 'Working with entities',
          items: [
            'Filter by namespace, entity type, or epistemic layer using the left panel controls.',
            'Click a node in the graph or a row in the list to select it and view full metadata.',
            'Use Import to pull entities from processed documents into a target namespace.',
            'Edit or delete individual entities using the pencil/trash icons in the list.',
            'Build the cluster pyramid for LOD mode using the Layers icon in the graph toolbar.',
          ],
        },
      ],
    },
    ru: {
      title: 'Entity Store — Браузер графа знаний',
      sections: [
        {
          heading: 'Что это такое?',
          body: 'Entity Store — интерфейс управления графом знаний. Отображает ESEntity, извлечённые из документов, и их формальные связи, организованные по эпистемическому слою и типу сущности.',
        },
        {
          heading: 'Режимы визуализации',
          items: [
            '2D ReactFlow — интерактивный граф с физической симуляцией. Перетаскивайте узлы, инспектируйте рёбра, используйте инструменты компоновки на панели.',
            'LOD Map — рендеринг с учётом уровня детализации на основе предвычисленной пирамиды кластеров. Сначала постройте пирамиду через значок Layers на панели инструментов графа.',
            '3D Singularity — объёмный граф. Вращение (левая кнопка), масштабирование (колесо), перемещение (правая кнопка), клик по узлу для его выбора.',
          ],
        },
        {
          heading: 'Эпистемические слои',
          items: [
            'L0 — Наблюдаемые факты: конкретные, проверяемые факты, извлечённые непосредственно из текста документа.',
            'L1 — Концепции и определения: абстрактные концепции, терминология и именованные сущности.',
            'L2 — Принципы и нормы: правила, стандарты, обязательства и политические рамки.',
            'L3 — Метазнания: знания о знаниях — структуры управления, фреймворки и межотраслевые связи.',
          ],
        },
        {
          heading: 'Работа с сущностями',
          items: [
            'Фильтруйте по пространству имён, типу сущности или эпистемическому слою с помощью элементов управления левой панели.',
            'Кликните узел в графе или строку в списке для выбора и просмотра полных метаданных.',
            'Используйте Импорт для загрузки сущностей из обработанных документов в целевое пространство имён.',
            'Редактируйте или удаляйте отдельные сущности с помощью иконок карандаша/корзины в списке.',
            'Постройте пирамиду кластеров для режима LOD с помощью значка Layers на панели инструментов графа.',
          ],
        },
      ],
    },
  },
};

// ── Component ────────────────────────────────────────────────────────────────

export default function HelpPanel({ tab, lang = 'en' }) {
  const [open, setOpen] = useState(false);
  const content = CONTENT[tab]?.[lang];
  if (!content) return null;

  return (
    <Accordion
      expanded={open}
      onChange={() => setOpen(v => !v)}
      disableGutters
      sx={{
        bgcolor: '#0a0f1a',
        border: '1px solid #1e293b',
        borderRadius: '6px !important',
        '&:before': { display: 'none' },
        mb: 0,
      }}
    >
      <AccordionSummary
        expandIcon={<ChevronDown size={14} color="#64748b" />}
        sx={{
          minHeight: 36,
          px: 1.5, py: 0,
          '& .MuiAccordionSummary-content': { margin: '8px 0', alignItems: 'center', gap: 1 },
        }}
      >
        <HelpCircle size={13} color="#3b82f6" />
        <Typography variant="caption" sx={{ color: '#64748b', fontSize: 13, fontWeight: 500 }}>
          {lang === 'en' ? 'How to use & interpret' : 'Как использовать и интерпретировать'}
        </Typography>
        {!open && (
          <Chip
            label={lang === 'en' ? 'click to expand' : 'нажмите, чтобы развернуть'}
            size="small"
            sx={{ height: 16, fontSize: 11, bgcolor: '#1e293b', color: '#94a3b8', ml: 0.5 }}
          />
        )}
      </AccordionSummary>

      <AccordionDetails sx={{ px: 2, pt: 0.5, pb: 1.5, borderTop: '1px solid #1e293b' }}>
        <Typography variant="caption" fontWeight="bold" color="primary.main"
          sx={{ display: 'block', mb: 1.5, fontSize: 13 }}>
          {content.title}
        </Typography>

        {content.sections.map((sec, i) => (
          <Box key={i} sx={{ mb: 1.5 }}>
            <Typography variant="caption" fontWeight={600} sx={{ color: '#e2e8f0', fontSize: 13, display: 'block', mb: 0.5 }}>
              {sec.heading}
            </Typography>
            {sec.body && (
              <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: 13, lineHeight: 1.6, display: 'block' }}>
                {sec.body}
              </Typography>
            )}
            {sec.items && (
              <Box component="ul" sx={{ m: 0, pl: 2.5, color: '#94a3b8' }}>
                {sec.items.map((item, j) => (
                  <Box component="li" key={j} sx={{ mb: 0.3 }}>
                    <Typography variant="caption" sx={{ fontSize: 13, lineHeight: 1.6, color: '#94a3b8' }}>
                      {item}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        ))}
      </AccordionDetails>
    </Accordion>
  );
}
