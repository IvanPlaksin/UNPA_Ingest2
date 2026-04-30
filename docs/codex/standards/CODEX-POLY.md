# CODEX-POLY: Протокол Polystore

**Статус:** 🟡 Черновик
**Версия:** 0.1.0
**Последнее обновление:** 2026-03-12

---

## Преамбула

UN ProjectAdvisor — это polystore-система, использующая три хранилища данных:

- **Memgraph** — графовая база данных (узлы, рёбра, свойства, связи)
- **Qdrant** — векторное хранилище (эмбеддинги, семантический поиск)
- **Redis** — кэш и очереди сообщений (pub/sub, TTL-кэш, сессии)

Запись в несколько хранилищ **не является атомарной**. Отсутствует распределённый менеджер транзакций, объединяющий все три системы в единую ACID-транзакцию. Это означает, что при записи данных возможны частичные сбои: данные могут быть записаны в Memgraph, но не дойти до Qdrant, или кэш Redis может остаться устаревшим.

Данный протокол определяет:

1. **Порядок записи** — в какой последовательности обновлять хранилища
2. **Обработку ошибок** — компенсирующие транзакции при частичных сбоях
3. **Восстановление консистентности** — механизмы обнаружения и исправления рассинхронизации

---

## 7.1 Порядок записи

### Диаграмма потока записи

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│   Memgraph      │────▶│    Qdrant       │────▶│     Redis       │
│   (primary)     │     │  (secondary)    │     │    (cache)      │
│                 │     │                 │     │                 │
│  Граф: узлы,    │     │  Векторы:       │     │  Кэш:           │
│  рёбра,         │     │  эмбеддинги,    │     │  инвалидация,   │
│  свойства       │     │  payload        │     │  pub/sub        │
│                 │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
       ▲                                               │
       │              feedback loop                    │
       └───────────────────────────────────────────────┘
```

### Обоснование порядка

| Порядок | Хранилище | Причина |
|---------|-----------|---------|
| 1-й | **Memgraph** | Источник истины (source of truth). Все сущности получают `nodeId` при создании в графе. Без `nodeId` невозможна запись в Qdrant. |
| 2-й | **Qdrant** | Вторичное хранилище. Требует `nodeId` из Memgraph для связи вектора с узлом графа. После upsert возвращает `vectorId`, который записывается обратно в Memgraph. |
| 3-й | **Redis** | Кэш инвалидируется последним. Нет смысла инвалидировать кэш до завершения записи в основные хранилища. Также используется для pub/sub нотификаций о завершении записи. |

### Таблица зависимостей между хранилищами

| Операция | Memgraph → Qdrant | Qdrant → Memgraph | Memgraph → Redis | Redis → Memgraph |
|----------|--------------------|--------------------|-------------------|-------------------|
| Создание узла | `nodeId` передаётся как payload ID | `vectorId` записывается в свойство узла | Ключ кэша содержит `nodeId` | Нет зависимости |
| Обновление свойств | Новый текст → пересчёт эмбеддинга | Нет | Инвалидация ключа `node:{nodeId}` | Нет |
| Удаление узла | Удаление вектора по `nodeId` | Нет | Удаление всех ключей `*:{nodeId}:*` | Нет |
| Создание ребра | Нет (рёбра не векторизуются) | Нет | Инвалидация кэша соседей | Нет |
| Поиск (read) | Нет | Результаты обогащаются свойствами из MG | Кэширование результатов | Нет |

### Шаблон операции записи

```javascript
async function polystoreWrite(entityData, options = {}) {
  const operationId = crypto.randomUUID();
  const saga = new PolystoreSaga(operationId);

  try {
    // ── Шаг 1: Memgraph (primary) ──────────────────────────────
    const nodeId = entityData.id || crypto.randomUUID();

    const mgResult = await saga.addStep({
      name: 'CreateNode',
      execute: async () => {
        const result = await memgraphService.runQuery(
          `MERGE (n:${entityData.label} {id: $id})
           SET n += $properties, n.updatedAt = datetime()
           RETURN n.id AS nodeId`,
          { id: nodeId, properties: entityData.properties }
        );
        return { nodeId: result.records[0].get('nodeId') };
      },
      compensate: async () => {
        await memgraphService.runQuery(
          `MATCH (n {id: $id}) DETACH DELETE n`,
          { id: nodeId }
        );
      }
    });

    // ── Шаг 2: Qdrant (secondary) ─────────────────────────────
    let vectorId = null;
    if (entityData.text && options.vectorize !== false) {
      const embedding = await teiService.embed(entityData.text);

      const qdrantResult = await saga.addStep({
        name: 'UpsertVector',
        execute: async () => {
          await qdrantService.upsert(options.collection || 'default', {
            id: nodeId,
            vector: embedding,
            payload: {
              nodeId: mgResult.nodeId,
              label: entityData.label,
              text: entityData.text,
              namespace: entityData.namespace || 'default',
              createdAt: new Date().toISOString()
            }
          });
          return { vectorId: nodeId };
        },
        compensate: async () => {
          await qdrantService.delete(options.collection || 'default', {
            points: [nodeId]
          });
        }
      });

      vectorId = qdrantResult.vectorId;

      // ── Шаг 2b: Обратная запись vectorId в Memgraph ────────
      await saga.addStep({
        name: 'UpdateVectorRef',
        execute: async () => {
          await memgraphService.runQuery(
            `MATCH (n {id: $id}) SET n.vectorId = $vectorId`,
            { id: nodeId, vectorId }
          );
          return { updated: true };
        },
        compensate: async () => {
          await memgraphService.runQuery(
            `MATCH (n {id: $id}) REMOVE n.vectorId`,
            { id: nodeId }
          );
        }
      });
    }

    // ── Шаг 3: Redis (cache) ──────────────────────────────────
    await saga.addStep({
      name: 'InvalidateCache',
      execute: async () => {
        const cacheKeys = [
          `node:${nodeId}`,
          `neighbors:${nodeId}`,
          `search:${entityData.namespace || 'default'}:*`
        ];
        for (const key of cacheKeys) {
          if (key.includes('*')) {
            const matchingKeys = await redisService.keys(key);
            if (matchingKeys.length > 0) {
              await redisService.del(...matchingKeys);
            }
          } else {
            await redisService.del(key);
          }
        }
        // Публикация события для подписчиков
        await redisService.publish('polystore:changes', JSON.stringify({
          operationId,
          type: 'write',
          nodeId,
          label: entityData.label,
          timestamp: Date.now()
        }));
        return { invalidated: true };
      },
      compensate: async () => {
        // Кэш не требует компенсации — он самовосстанавливается
        // через TTL и последующие read-запросы
      }
    });

    return { operationId, nodeId, vectorId, status: 'committed' };

  } catch (error) {
    await saga.compensate();
    throw new PolystoreWriteError(operationId, error);
  }
}
```

---

## 7.2 Compensating transactions

### Принцип компенсации

В отсутствие распределённых транзакций используется паттерн **Saga** — последовательность локальных транзакций с компенсирующими действиями. При сбое на любом шаге выполняется откат всех предыдущих шагов в обратном порядке (LIFO).

### Диаграмма потока компенсации

```
Прямой путь (forward path):
═══════════════════════════════════════════════════════════════

  Step 1              Step 2              Step 3
  CreateNode  ──OK──▶ UpsertVector ──OK──▶ InvalidateCache ──▶ COMMITTED
       │                    │                    │
       │                    │                    ✗ FAIL
       │                    │                    │
       ▼                    ▼                    ▼

Компенсация (compensation path, LIFO):
═══════════════════════════════════════════════════════════════

                                          Compensate Step 3
                                          (no-op for cache)
                                                │
                                                ▼
                           Compensate Step 2
                           (delete vector from Qdrant)
                                  │
                                  ▼
            Compensate Step 1
            (DETACH DELETE node from Memgraph)
                    │
                    ▼
               ROLLED BACK


Сценарии сбоев:
═══════════════════════════════════════════════════════════════

  Сбой на Step 1:   Нет компенсации (ничего не записано)
  Сбой на Step 2:   Compensate Step 1 (удалить узел из MG)
  Сбой на Step 3:   Compensate Step 2 + Step 1
  Сбой компенсации: alertInconsistency() → ручное вмешательство
```

### Класс PolystoreSaga

```javascript
class PolystoreSaga {
  constructor(operationId) {
    this.operationId = operationId;
    this.completedSteps = [];     // Стек выполненных шагов (LIFO для отката)
    this.startedAt = Date.now();
    this.status = 'pending';      // pending | executing | committed | compensating | failed
  }

  /**
   * Добавляет и выполняет шаг саги.
   * Каждый шаг регистрирует функцию компенсации до выполнения.
   * При сбое execute — компенсация текущего шага НЕ вызывается
   * (он не завершился успешно), но все предыдущие — откатываются.
   *
   * @param {Object} step - { name, execute, compensate }
   * @returns {*} Результат execute()
   */
  async addStep(step) {
    this.status = 'executing';

    const stepRecord = {
      name: step.name,
      compensate: step.compensate,
      executedAt: Date.now(),
      result: null
    };

    try {
      // Выполнить прямое действие
      const result = await step.execute();
      stepRecord.result = result;

      // Регистрация в стеке ПОСЛЕ успешного выполнения
      this.completedSteps.push(stepRecord);

      logger.debug(`[Saga:${this.operationId}] Step "${step.name}" completed`, {
        stepIndex: this.completedSteps.length,
        result
      });

      return result;

    } catch (error) {
      logger.error(`[Saga:${this.operationId}] Step "${step.name}" failed`, {
        error: error.message,
        completedSteps: this.completedSteps.map(s => s.name)
      });

      // Не добавляем текущий шаг — он не завершился
      throw error;
    }
  }

  /**
   * Компенсация всех выполненных шагов в обратном порядке (LIFO).
   * Если компенсация шага сама завершается с ошибкой —
   * продолжаем компенсацию остальных, но помечаем рассинхронизацию.
   */
  async compensate() {
    this.status = 'compensating';
    const errors = [];

    logger.warn(`[Saga:${this.operationId}] Starting compensation`, {
      stepsToCompensate: this.completedSteps.map(s => s.name)
    });

    // LIFO — обратный порядок
    const stepsToUndo = [...this.completedSteps].reverse();

    for (const step of stepsToUndo) {
      try {
        if (typeof step.compensate === 'function') {
          await step.compensate(step.result);
          logger.info(`[Saga:${this.operationId}] Compensated step "${step.name}"`);
        }
      } catch (compensationError) {
        errors.push({
          step: step.name,
          error: compensationError.message
        });

        logger.error(`[Saga:${this.operationId}] Compensation FAILED for step "${step.name}"`, {
          error: compensationError.message
        });
      }
    }

    if (errors.length > 0) {
      this.status = 'failed';
      await this.alertInconsistency(errors);
    } else {
      this.status = 'compensated';
    }

    return { status: this.status, errors };
  }

  /**
   * Оповещение о рассинхронизации данных.
   * Вызывается когда компенсирующая транзакция сама завершается с ошибкой,
   * оставляя данные в неконсистентном состоянии.
   *
   * @param {Array} errors - массив { step, error }
   */
  async alertInconsistency(errors) {
    const alert = {
      operationId: this.operationId,
      severity: 'CRITICAL',
      type: 'POLYSTORE_INCONSISTENCY',
      startedAt: this.startedAt,
      detectedAt: Date.now(),
      completedSteps: this.completedSteps.map(s => s.name),
      compensationErrors: errors,
      requiresManualIntervention: true
    };

    // Записать в Memgraph для аудита
    try {
      await memgraphService.runQuery(
        `CREATE (a:InconsistencyAlert {
          id: $id,
          operationId: $operationId,
          severity: $severity,
          errors: $errors,
          createdAt: datetime()
        })`,
        {
          id: crypto.randomUUID(),
          operationId: this.operationId,
          severity: alert.severity,
          errors: JSON.stringify(errors)
        }
      );
    } catch (dbError) {
      // Если даже алерт не удалось записать — логируем в stderr
      console.error('[CRITICAL] Cannot persist inconsistency alert:', alert);
    }

    // Публикация в Redis для мониторинга
    try {
      await redisService.publish('polystore:inconsistency', JSON.stringify(alert));
    } catch (redisError) {
      // Redis может быть недоступен — это ожидаемо при каскадном сбое
    }

    logger.error(`[CRITICAL] Polystore inconsistency detected`, alert);
  }
}
```

### Пример использования

```javascript
async function createEntityWithFullSync(entityData) {
  const operationId = crypto.randomUUID();
  const saga = new PolystoreSaga(operationId);

  try {
    // ── Операция 1: Создание узла в Memgraph ──────────────────
    const mgResult = await saga.addStep({
      name: 'CreateNode',
      execute: async () => {
        const result = await memgraphService.runQuery(
          `CREATE (n:Entity {id: $id, name: $name, description: $desc, createdAt: datetime()})
           RETURN n.id AS nodeId`,
          { id: entityData.id, name: entityData.name, desc: entityData.description }
        );
        return { nodeId: result.records[0].get('nodeId') };
      },
      compensate: async (result) => {
        await memgraphService.runQuery(
          `MATCH (n:Entity {id: $id}) DETACH DELETE n`,
          { id: result.nodeId }
        );
        logger.info(`Compensated: deleted node ${result.nodeId} from Memgraph`);
      }
    });

    // ── Операция 2: Upsert вектора в Qdrant ───────────────────
    const qdrantResult = await saga.addStep({
      name: 'UpsertVector',
      execute: async () => {
        const embedding = await teiService.embed(entityData.description);
        await qdrantService.upsert('entities', {
          id: mgResult.nodeId,
          vector: embedding,
          payload: {
            nodeId: mgResult.nodeId,
            name: entityData.name,
            label: 'Entity'
          }
        });
        return { vectorId: mgResult.nodeId, collection: 'entities' };
      },
      compensate: async (result) => {
        await qdrantService.delete(result.collection, {
          points: [result.vectorId]
        });
        logger.info(`Compensated: deleted vector ${result.vectorId} from Qdrant`);
      }
    });

    // ── Операция 3: Инвалидация кэша Redis ────────────────────
    const redisResult = await saga.addStep({
      name: 'InvalidateCache',
      execute: async () => {
        await redisService.del(`entity:${mgResult.nodeId}`);
        await redisService.del('entities:list');
        await redisService.publish('entities:updated', JSON.stringify({
          action: 'create',
          nodeId: mgResult.nodeId
        }));
        return { keysInvalidated: 2 };
      },
      compensate: async () => {
        // Кэш самовосстанавливается — компенсация не требуется.
        // При следующем read-запросе кэш будет перестроен из Memgraph.
        logger.info('Compensated: cache invalidation is self-healing, no action needed');
      }
    });

    return {
      operationId,
      nodeId: mgResult.nodeId,
      vectorId: qdrantResult.vectorId,
      cacheInvalidated: redisResult.keysInvalidated,
      status: 'committed'
    };

  } catch (error) {
    logger.error(`Entity creation failed, starting compensation`, { operationId, error: error.message });
    const compensation = await saga.compensate();
    throw new PolystoreWriteError(operationId, error, compensation);
  }
}
```

---

## 7.3 Eventually consistent

### Допустимые временные несоответствия

В polystore-архитектуре абсолютная консистентность между хранилищами невозможна. Определяем допустимые окна временной неконсистентности:

| Пара хранилищ | Тип рассинхронизации | Допустимое окно | Последствия | Обнаружение |
|---------------|----------------------|-----------------|-------------|-------------|
| Memgraph → Qdrant | Узел создан в MG, вектор ещё не записан в Qdrant | **< 5 секунд** | Семантический поиск не находит новый узел. Граф-запросы работают. | `findMissingVectors()` |
| Qdrant → Redis | Вектор обновлён в Qdrant, кэш Redis содержит старый результат | **< 1 секунда** | Поисковые результаты показывают устаревшие данные | TTL-based expiry |
| Удалённый узел → Orphaned vector | Узел удалён из MG, вектор остался в Qdrant | **< 1 час** | Поиск может возвращать ссылки на несуществующие узлы | `findOrphanedVectors()` |
| MG property update → Qdrant payload | Свойство изменено в MG, payload в Qdrant устарел | **< 5 секунд** | Фильтрация по payload вернёт устаревшие данные | Периодическая сверка |
| Redis cache → MG state | Кэш содержит устаревшие данные | **< TTL (300 сек)** | Read-запросы возвращают устаревшие данные | TTL auto-expiry |

### Уровни консистентности

Система поддерживает три уровня консистентности, выбираемых в зависимости от требований операции:

| Уровень | Описание | Memgraph | Qdrant | Redis | Latency | Использование |
|---------|----------|----------|--------|-------|---------|---------------|
| `STRONG` | Все операции синхронные | sync | sync | sync | Высокая (200-500ms) | Критические записи, финансовые данные |
| `EVENTUAL` | MG синхронно, остальные асинхронно | sync | async | async | Средняя (50-100ms) | Стандартные операции CRUD |
| `BEST_EFFORT` | Все операции асинхронные | async | async | async | Низкая (10-30ms) | Bulk import, фоновые задачи |

### Реализация writeWithConsistency

```javascript
const ConsistencyLevel = {
  STRONG: 'STRONG',
  EVENTUAL: 'EVENTUAL',
  BEST_EFFORT: 'BEST_EFFORT'
};

/**
 * Запись данных с выбранным уровнем консистентности.
 *
 * @param {Object} entityData - данные для записи
 * @param {string} level - уровень консистентности (STRONG | EVENTUAL | BEST_EFFORT)
 * @returns {Object} результат записи
 */
async function writeWithConsistency(entityData, level = ConsistencyLevel.EVENTUAL) {
  const operationId = crypto.randomUUID();
  const results = { operationId, level, steps: {} };

  switch (level) {

    case ConsistencyLevel.STRONG: {
      // ── Все три шага синхронно, с полной Saga-компенсацией ──
      const saga = new PolystoreSaga(operationId);

      try {
        results.steps.memgraph = await saga.addStep({
          name: 'CreateNode',
          execute: () => writeToMemgraph(entityData),
          compensate: (res) => deleteFromMemgraph(res.nodeId)
        });

        results.steps.qdrant = await saga.addStep({
          name: 'UpsertVector',
          execute: () => upsertToQdrant(entityData, results.steps.memgraph.nodeId),
          compensate: (res) => deleteFromQdrant(res.vectorId)
        });

        results.steps.redis = await saga.addStep({
          name: 'InvalidateCache',
          execute: () => invalidateRedisCache(results.steps.memgraph.nodeId),
          compensate: () => {} // self-healing
        });

        results.status = 'committed';
      } catch (error) {
        await saga.compensate();
        throw new PolystoreWriteError(operationId, error);
      }
      break;
    }

    case ConsistencyLevel.EVENTUAL: {
      // ── Memgraph синхронно, Qdrant и Redis — через очередь ──
      try {
        results.steps.memgraph = await writeToMemgraph(entityData);
      } catch (error) {
        throw new PolystoreWriteError(operationId, error);
      }

      // Асинхронные задачи через Redis queue
      const asyncTasks = {
        qdrant: {
          type: 'UPSERT_VECTOR',
          nodeId: results.steps.memgraph.nodeId,
          entityData,
          operationId,
          retryCount: 0,
          maxRetries: 3
        },
        redis: {
          type: 'INVALIDATE_CACHE',
          nodeId: results.steps.memgraph.nodeId,
          operationId
        }
      };

      await redisService.lpush('polystore:async-queue', JSON.stringify(asyncTasks.qdrant));
      await redisService.lpush('polystore:async-queue', JSON.stringify(asyncTasks.redis));

      results.steps.qdrant = { status: 'queued' };
      results.steps.redis = { status: 'queued' };
      results.status = 'committed-partial';
      break;
    }

    case ConsistencyLevel.BEST_EFFORT: {
      // ── Все три шага асинхронно через очередь ───────────────
      const taskId = crypto.randomUUID();

      const batchTask = {
        type: 'POLYSTORE_BATCH_WRITE',
        taskId,
        operationId,
        entityData,
        steps: ['memgraph', 'qdrant', 'redis'],
        retryCount: 0,
        maxRetries: 5,
        createdAt: Date.now()
      };

      await redisService.lpush('polystore:batch-queue', JSON.stringify(batchTask));

      results.steps.memgraph = { status: 'queued' };
      results.steps.qdrant = { status: 'queued' };
      results.steps.redis = { status: 'queued' };
      results.status = 'queued';
      break;
    }

    default:
      throw new Error(`Unknown consistency level: ${level}`);
  }

  return results;
}
```

---

## 7.4 Checkpoint/Resume

### Назначение

Долговременные конвейеры (bulk import, полная переиндексация, GXE-execution) могут обрабатывать тысячи узлов. При сбое нельзя терять прогресс — необходимо возобновление с последнего успешного шага.

### Класс CheckpointManager

```javascript
class CheckpointManager {
  constructor(pipelineId, redisService) {
    this.pipelineId = pipelineId;
    this.redisService = redisService;
    this.checkpointKey = `checkpoint:${pipelineId}`;
    this.TTL_SECONDS = 86400; // 24 часа
  }

  /**
   * Сохраняет checkpoint в Redis с TTL 24 часа.
   *
   * @param {Object} state - текущее состояние конвейера
   * @param {string} state.currentStep - имя текущего шага
   * @param {number} state.processedCount - количество обработанных элементов
   * @param {Array<string>} state.completedOps - список завершённых операций
   * @param {Object} state.context - произвольный контекст для восстановления
   */
  async saveCheckpoint(state) {
    const checkpoint = {
      pipelineId: this.pipelineId,
      currentStep: state.currentStep,
      processedCount: state.processedCount,
      completedOps: state.completedOps || [],
      context: state.context || {},
      savedAt: Date.now(),
      version: 1
    };

    await this.redisService.set(
      this.checkpointKey,
      JSON.stringify(checkpoint),
      'EX',
      this.TTL_SECONDS
    );

    logger.debug(`[Checkpoint:${this.pipelineId}] Saved`, {
      step: state.currentStep,
      processed: state.processedCount
    });

    return checkpoint;
  }

  /**
   * Загружает последний checkpoint из Redis.
   *
   * @returns {Object|null} состояние checkpoint или null если не найден / истёк TTL
   */
  async loadCheckpoint() {
    const raw = await this.redisService.get(this.checkpointKey);

    if (!raw) {
      logger.debug(`[Checkpoint:${this.pipelineId}] No checkpoint found`);
      return null;
    }

    try {
      const checkpoint = JSON.parse(raw);
      logger.info(`[Checkpoint:${this.pipelineId}] Loaded`, {
        step: checkpoint.currentStep,
        processed: checkpoint.processedCount,
        savedAt: new Date(checkpoint.savedAt).toISOString()
      });
      return checkpoint;
    } catch (parseError) {
      logger.error(`[Checkpoint:${this.pipelineId}] Corrupt checkpoint data`, {
        error: parseError.message
      });
      return null;
    }
  }

  /**
   * Возобновляет выполнение конвейера с последнего checkpoint.
   * Пропускает уже завершённые операции.
   *
   * @param {Array<Object>} operations - полный список операций конвейера
   *   Каждая операция: { id, name, execute }
   * @param {Function} onProgress - callback для отслеживания прогресса
   * @returns {Object} результат выполнения
   */
  async resumeFromCheckpoint(operations, onProgress) {
    const checkpoint = await this.loadCheckpoint();
    const completedOps = checkpoint ? new Set(checkpoint.completedOps) : new Set();
    let processedCount = checkpoint ? checkpoint.processedCount : 0;

    logger.info(`[Checkpoint:${this.pipelineId}] Resuming`, {
      totalOps: operations.length,
      alreadyCompleted: completedOps.size,
      skipping: completedOps.size
    });

    const results = [];

    for (const op of operations) {
      // Пропустить уже завершённые операции
      if (completedOps.has(op.id)) {
        logger.debug(`[Checkpoint:${this.pipelineId}] Skipping completed op: ${op.name}`);
        continue;
      }

      try {
        const result = await op.execute();
        results.push({ opId: op.id, name: op.name, status: 'ok', result });

        completedOps.add(op.id);
        processedCount++;

        // Сохранить checkpoint
        await this.saveCheckpoint({
          currentStep: op.name,
          processedCount,
          completedOps: Array.from(completedOps),
          context: checkpoint ? checkpoint.context : {}
        });

        if (onProgress) {
          onProgress({
            completed: processedCount,
            total: operations.length,
            currentOp: op.name
          });
        }

      } catch (error) {
        logger.error(`[Checkpoint:${this.pipelineId}] Op "${op.name}" failed`, {
          error: error.message,
          processedCount
        });

        // Сохранить checkpoint ДО ошибки — при retry пропустим завершённые
        await this.saveCheckpoint({
          currentStep: op.name,
          processedCount,
          completedOps: Array.from(completedOps),
          context: { lastError: error.message, failedOp: op.id }
        });

        throw error;
      }
    }

    // Очистить checkpoint после успешного завершения
    await this.redisService.del(this.checkpointKey);

    return {
      pipelineId: this.pipelineId,
      totalProcessed: processedCount,
      results,
      status: 'completed'
    };
  }
}
```

### Частота создания checkpoint

| Тип конвейера | Частота checkpoint | Обоснование |
|---------------|--------------------|-------------|
| **Bulk import** | Каждые 100 узлов | Баланс между производительностью и допустимой потерей прогресса. Повторная обработка 100 узлов — приемлемые ~30 секунд. |
| **Incremental update** | Каждые 10 узлов | Инкрементальные обновления более ценны — каждый узел может содержать уникальные данные. Потеря 10 узлов — допустимо. |
| **GXE execution** | Каждый узел | Каждый узел GXE-графа может запускать LLM-вызов (дорогой). Повторный вызов LLM — трата бюджета. Checkpoint на каждом шаге обязателен. |
| **Reindexing** | Каждые 500 векторов | Переиндексация — идемпотентная операция. Повтор 500 upsert в Qdrant — ~10 секунд, приемлемо. |
| **Graph migration** | Каждый шаг миграции | Миграция меняет структуру. Частичная миграция опаснее частичного импорта. Checkpoint на каждый DDL-шаг. |

---

## 7.5 Health checks

### Класс PolystoreHealthChecker

```javascript
class PolystoreHealthChecker {
  constructor(memgraphService, qdrantService, redisService) {
    this.memgraph = memgraphService;
    this.qdrant = qdrantService;
    this.redis = redisService;
  }

  /**
   * Полная проверка консистентности между хранилищами.
   *
   * @returns {Object} отчёт о рассинхронизациях
   */
  async checkConsistency() {
    const report = {
      checkedAt: new Date().toISOString(),
      issues: [],
      stats: {}
    };

    // ── Проверка 1: Orphaned vectors ────────────────────────────
    const orphaned = await this.findOrphanedVectors();
    report.stats.orphanedVectors = orphaned.length;
    if (orphaned.length > 0) {
      report.issues.push({
        type: 'ORPHANED_VECTORS',
        severity: orphaned.length > 100 ? 'HIGH' : 'MEDIUM',
        count: orphaned.length,
        description: `Найдено ${orphaned.length} векторов в Qdrant без соответствующих узлов в Memgraph`,
        vectorIds: orphaned.slice(0, 50) // Первые 50 для отчёта
      });
    }

    // ── Проверка 2: Missing vectors ─────────────────────────────
    const missing = await this.findMissingVectors();
    report.stats.missingVectors = missing.length;
    if (missing.length > 0) {
      report.issues.push({
        type: 'MISSING_VECTORS',
        severity: missing.length > 50 ? 'HIGH' : 'MEDIUM',
        count: missing.length,
        description: `Найдено ${missing.length} узлов в Memgraph с vectorId, но без соответствующих записей в Qdrant`,
        nodeIds: missing.slice(0, 50)
      });
    }

    // ── Проверка 3: Stale cache ─────────────────────────────────
    const stale = await this.findStaleCache();
    report.stats.staleCacheKeys = stale.length;
    if (stale.length > 0) {
      report.issues.push({
        type: 'STALE_CACHE',
        severity: 'LOW',
        count: stale.length,
        description: `Найдено ${stale.length} ключей кэша Redis, ссылающихся на несуществующие или изменённые узлы`,
        keys: stale.slice(0, 20)
      });
    }

    report.healthy = report.issues.length === 0;
    return report;
  }

  /**
   * Поиск "осиротевших" векторов — записей в Qdrant,
   * для которых не существует соответствующего узла в Memgraph.
   *
   * Алгоритм: скролл по всем точкам в коллекции Qdrant,
   * для каждого batch проверяем наличие узла в Memgraph.
   *
   * @param {string} collection - имя коллекции Qdrant (по умолчанию 'default')
   * @returns {Array<string>} список vectorId без узлов в MG
   */
  async findOrphanedVectors(collection = 'default') {
    const orphaned = [];
    let offset = null;
    const batchSize = 100;

    do {
      // Скролл по точкам Qdrant
      const scrollResult = await this.qdrant.scroll(collection, {
        limit: batchSize,
        offset: offset,
        with_payload: true,
        with_vectors: false // Векторы не нужны для проверки
      });

      const points = scrollResult.points || [];
      if (points.length === 0) break;

      // Извлечь nodeId из payload каждой точки
      const nodeIds = points
        .map(p => p.payload?.nodeId || p.id)
        .filter(Boolean);

      if (nodeIds.length > 0) {
        // Batch-проверка в Memgraph: какие из nodeIds существуют?
        const existResult = await this.memgraph.runQuery(
          `UNWIND $ids AS nid
           OPTIONAL MATCH (n {id: nid})
           RETURN nid, n IS NOT NULL AS exists`,
          { ids: nodeIds }
        );

        const existingSet = new Set(
          existResult.records
            .filter(r => r.get('exists'))
            .map(r => r.get('nid'))
        );

        // Те, кого нет в Memgraph — orphaned
        for (const point of points) {
          const nodeId = point.payload?.nodeId || point.id;
          if (!existingSet.has(nodeId)) {
            orphaned.push(nodeId);
          }
        }
      }

      offset = scrollResult.next_page_offset;
    } while (offset !== null && offset !== undefined);

    return orphaned;
  }

  /**
   * Поиск "отсутствующих" векторов — узлов в Memgraph,
   * у которых есть свойство vectorId, но в Qdrant нет соответствующей записи.
   *
   * @param {string} collection - имя коллекции Qdrant (по умолчанию 'default')
   * @returns {Array<string>} список nodeId с отсутствующими векторами
   */
  async findMissingVectors(collection = 'default') {
    const missing = [];

    // Получить все узлы с vectorId из Memgraph
    const mgResult = await this.memgraph.runQuery(
      `MATCH (n)
       WHERE n.vectorId IS NOT NULL
       RETURN n.id AS nodeId, n.vectorId AS vectorId`
    );

    const nodesWithVectors = mgResult.records.map(r => ({
      nodeId: r.get('nodeId'),
      vectorId: r.get('vectorId')
    }));

    // Batch-проверка в Qdrant
    const batchSize = 100;
    for (let i = 0; i < nodesWithVectors.length; i += batchSize) {
      const batch = nodesWithVectors.slice(i, i + batchSize);
      const pointIds = batch.map(n => n.vectorId);

      try {
        const getResult = await this.qdrant.getPoints(collection, {
          ids: pointIds,
          with_payload: false,
          with_vectors: false
        });

        const foundIds = new Set((getResult || []).map(p => p.id));

        for (const node of batch) {
          if (!foundIds.has(node.vectorId)) {
            missing.push(node.nodeId);
          }
        }
      } catch (error) {
        // Если коллекция не существует — все векторы отсутствуют
        if (error.message?.includes('not found')) {
          missing.push(...batch.map(n => n.nodeId));
        } else {
          throw error;
        }
      }
    }

    return missing;
  }

  /**
   * Поиск устаревших записей кэша — ключей в Redis,
   * ссылающихся на узлы, которые были удалены или изменены в Memgraph.
   *
   * @returns {Array<string>} список устаревших ключей Redis
   */
  async findStaleCache() {
    const staleKeys = [];

    // Сканируем ключи node:* в Redis
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', 'node:*', 'COUNT', 100);
      cursor = nextCursor;

      for (const key of keys) {
        const nodeId = key.replace('node:', '');
        const cached = await this.redis.get(key);

        if (!cached) continue;

        try {
          const cachedData = JSON.parse(cached);

          // Проверить существование и актуальность в Memgraph
          const mgResult = await this.memgraph.runQuery(
            `MATCH (n {id: $id})
             RETURN n.updatedAt AS updatedAt`,
            { id: nodeId }
          );

          if (mgResult.records.length === 0) {
            // Узел удалён — кэш устарел
            staleKeys.push(key);
          } else {
            const mgUpdatedAt = mgResult.records[0].get('updatedAt');
            if (cachedData.cachedAt && mgUpdatedAt && new Date(mgUpdatedAt) > new Date(cachedData.cachedAt)) {
              // Узел обновлён после кэширования
              staleKeys.push(key);
            }
          }
        } catch (parseError) {
          // Некорректный JSON в кэше — тоже stale
          staleKeys.push(key);
        }
      }
    } while (cursor !== '0');

    return staleKeys;
  }

  /**
   * Автоматическое исправление обнаруженных рассинхронизаций.
   *
   * @param {Object} report - отчёт от checkConsistency()
   * @returns {Object} результат ремонта
   */
  async autoRepair(report) {
    const repairLog = {
      startedAt: new Date().toISOString(),
      repaired: [],
      failed: []
    };

    for (const issue of report.issues) {
      try {
        switch (issue.type) {

          case 'ORPHANED_VECTORS': {
            // Удалить осиротевшие векторы из Qdrant
            const orphanedIds = issue.vectorIds || [];
            if (orphanedIds.length > 0) {
              await this.qdrant.delete('default', {
                points: orphanedIds
              });
              repairLog.repaired.push({
                type: 'ORPHANED_VECTORS',
                action: 'Удалены осиротевшие векторы из Qdrant',
                count: orphanedIds.length
              });
            }
            break;
          }

          case 'MISSING_VECTORS': {
            // Пересоздать отсутствующие векторы
            const nodeIds = issue.nodeIds || [];
            let reindexed = 0;

            for (const nodeId of nodeIds) {
              try {
                const mgResult = await this.memgraph.runQuery(
                  `MATCH (n {id: $id})
                   RETURN n.id AS nodeId, n.description AS text, labels(n)[0] AS label`,
                  { id: nodeId }
                );

                if (mgResult.records.length > 0) {
                  const record = mgResult.records[0];
                  const text = record.get('text');

                  if (text) {
                    const embedding = await teiService.embed(text);
                    await this.qdrant.upsert('default', {
                      id: nodeId,
                      vector: embedding,
                      payload: {
                        nodeId,
                        label: record.get('label'),
                        text
                      }
                    });
                    reindexed++;
                  } else {
                    // Нет текста — убрать vectorId из узла
                    await this.memgraph.runQuery(
                      `MATCH (n {id: $id}) REMOVE n.vectorId`,
                      { id: nodeId }
                    );
                  }
                }
              } catch (nodeError) {
                repairLog.failed.push({
                  type: 'MISSING_VECTORS',
                  nodeId,
                  error: nodeError.message
                });
              }
            }

            repairLog.repaired.push({
              type: 'MISSING_VECTORS',
              action: 'Пересозданы отсутствующие векторы в Qdrant',
              count: reindexed
            });
            break;
          }

          case 'STALE_CACHE': {
            // Удалить устаревшие ключи кэша
            const keys = issue.keys || [];
            if (keys.length > 0) {
              await this.redis.del(...keys);
              repairLog.repaired.push({
                type: 'STALE_CACHE',
                action: 'Удалены устаревшие ключи кэша Redis',
                count: keys.length
              });
            }
            break;
          }

          default:
            logger.warn(`Unknown issue type: ${issue.type}`);
        }

      } catch (repairError) {
        repairLog.failed.push({
          type: issue.type,
          error: repairError.message
        });
      }
    }

    repairLog.completedAt = new Date().toISOString();
    return repairLog;
  }
}
```

### Расписание проверок

| Проверка | Интервал | Обоснование | autoRepair |
|----------|----------|-------------|------------|
| **Orphaned vectors** (`findOrphanedVectors`) | Каждые 6 часов | Осиротевшие векторы накапливаются медленно (только при сбоях удаления). 6 часов — достаточно для обнаружения, не нагружает Qdrant скроллом. | Да — удаление из Qdrant |
| **Missing vectors** (`findMissingVectors`) | Каждые 1 час | Отсутствие векторов влияет на семантический поиск. 1 час — компромисс между актуальностью поиска и нагрузкой на переиндексацию. | Да — пересоздание эмбеддингов |
| **Stale cache** (`findStaleCache`) | Каждые 15 минут | Устаревший кэш — наименее критичная проблема (TTL 300 секунд самоочищает). 15 минут ловит ключи без TTL и ключи с длинным TTL. | Да — удаление ключей |
| **Hash chain integrity** | Еженедельно | Проверка целостности цепочки хешей аудит-лога. Дорогая операция (полный обход). Еженедельно достаточно для обнаружения фальсификации. | Нет — ручное расследование |

---

*Этот документ является частью [Кодекса UN ProjectAdvisor](../CODEX_INDEX.md)*
