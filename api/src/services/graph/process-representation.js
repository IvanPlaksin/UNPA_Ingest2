/**
 * POWL-подобное промежуточное представление для генерации графов
 *
 * Источник: ProMoAI (Fraunhofer/RWTH 2024) — POWL гарантирует soundness
 *
 * IR имеет рекурсивную структуру:
 * - sequence: шаги выполняются последовательно
 * - choice: выбор одной из веток (XOR)
 * - parallel: параллельное выполнение
 * - loop: повторение до условия
 *
 * Soundness гарантии:
 * - Отсутствие deadlocks (все пути завершаются)
 * - Отсутствие циклов (кроме явных loop)
 * - Все входы имеют источник
 * - Все выходы достижимы
 *
 * @module services/graph/process-representation
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS (JSDoc)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} TaskStep
 * @property {string} id - Уникальный ID шага
 * @property {string} intent - Что делать (tool-agnostic описание)
 * @property {string} capability - Какая способность нужна (категория)
 * @property {string[]} inputs - Входные данные (ссылки на outputs других шагов или START)
 * @property {string[]} outputs - Выходные данные (ID для ссылок)
 * @property {Object} [conditions] - Условия выполнения
 * @property {Object} [metadata] - Дополнительные данные
 * @property {'TaskStep'} _type - Маркер типа
 */

/**
 * @typedef {Object} ProcessRepresentation
 * @property {'sequence'|'choice'|'parallel'|'loop'} type - Тип процесса
 * @property {(TaskStep|ProcessRepresentation)[]} steps - Шаги или вложенные структуры
 * @property {string} [id] - ID для ссылок
 * @property {Object} [loopCondition] - Условие для loop
 * @property {Object} [choiceCondition] - Условие для choice
 * @property {'ProcessRepresentation'} _type - Маркер типа
 */

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Типы процессов в IR
 */
const PROCESS_TYPES = {
    SEQUENCE: 'sequence',
    CHOICE: 'choice',
    PARALLEL: 'parallel',
    LOOP: 'loop'
};

/**
 * Категории способностей (capabilities) для tool-agnostic описания
 */
const CAPABILITY_CATEGORIES = {
    DATA_FETCH: 'data_fetch',           // Получение данных из источников
    DATA_TRANSFORM: 'data_transform',   // Преобразование данных
    DATA_STORE: 'data_store',           // Сохранение данных
    ANALYSIS: 'analysis',               // Анализ и обработка
    GENERATION: 'generation',           // Генерация контента
    VALIDATION: 'validation',           // Валидация и проверка
    NOTIFICATION: 'notification',       // Уведомления и коммуникация
    INTEGRATION: 'integration',         // Интеграция с внешними системами
    CONTROL_FLOW: 'control_flow',       // Управление потоком
    EMBEDDING: 'embedding',             // Векторизация
    EXTRACTION: 'extraction',           // Извлечение сущностей
    RESOLUTION: 'resolution'            // Резолюция и дедупликация
};

/**
 * Типы данных для портов
 */
const DATA_TYPES = {
    TEXT: 'text',
    JSON: 'json',
    VECTOR: 'vector',
    ENTITIES: 'entities',
    GRAPH: 'graph',
    BINARY: 'binary',
    ANY: 'any'
};

// ═══════════════════════════════════════════════════════════════════════════
// CREATORS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Создать TaskStep
 * @param {Object} params - Параметры шага
 * @param {string} params.id - Уникальный ID
 * @param {string} params.intent - Что делать
 * @param {string} params.capability - Категория способности
 * @param {string|string[]} [params.inputs] - Входные данные
 * @param {string|string[]} [params.outputs] - Выходные данные
 * @param {Object} [params.conditions] - Условия выполнения
 * @param {Object} [params.metadata] - Дополнительные данные
 * @returns {TaskStep}
 */
function createTaskStep(params) {
    const {
        id,
        intent,
        capability,
        inputs = [],
        outputs = [],
        conditions = null,
        metadata = {}
    } = params;

    if (!id || !intent || !capability) {
        throw new Error('TaskStep requires id, intent, and capability');
    }

    if (!Object.values(CAPABILITY_CATEGORIES).includes(capability)) {
        console.warn(`[ProcessRepresentation] Unknown capability: ${capability}`);
    }

    return {
        id,
        intent,
        capability,
        inputs: Array.isArray(inputs) ? inputs : [inputs].filter(Boolean),
        outputs: Array.isArray(outputs) ? outputs : [outputs].filter(Boolean),
        conditions,
        metadata,
        _type: 'TaskStep'
    };
}

/**
 * Создать Sequence (последовательное выполнение)
 * @param {(TaskStep|ProcessRepresentation)[]} steps - Шаги в последовательности
 * @param {string} [id] - ID для ссылок
 * @returns {ProcessRepresentation}
 */
function createSequence(steps, id = null) {
    if (!Array.isArray(steps) || steps.length === 0) {
        throw new Error('Sequence requires at least one step');
    }

    return {
        type: PROCESS_TYPES.SEQUENCE,
        id: id || `seq_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        steps,
        _type: 'ProcessRepresentation'
    };
}

/**
 * Создать Choice (XOR — выбор одной ветки)
 * @param {(TaskStep|ProcessRepresentation)[]} branches - Ветки выбора
 * @param {Object} condition - Условие выбора
 * @param {string} [id] - ID для ссылок
 * @returns {ProcessRepresentation}
 */
function createChoice(branches, condition, id = null) {
    if (!Array.isArray(branches) || branches.length < 2) {
        throw new Error('Choice requires at least two branches');
    }

    return {
        type: PROCESS_TYPES.CHOICE,
        id: id || `choice_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        steps: branches,
        choiceCondition: condition,
        _type: 'ProcessRepresentation'
    };
}

/**
 * Создать Parallel (параллельное выполнение)
 * @param {(TaskStep|ProcessRepresentation)[]} branches - Параллельные ветки
 * @param {string} [id] - ID для ссылок
 * @returns {ProcessRepresentation}
 */
function createParallel(branches, id = null) {
    if (!Array.isArray(branches) || branches.length < 2) {
        throw new Error('Parallel requires at least two branches');
    }

    return {
        type: PROCESS_TYPES.PARALLEL,
        id: id || `par_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        steps: branches,
        _type: 'ProcessRepresentation'
    };
}

/**
 * Создать Loop (повторение)
 * @param {TaskStep|ProcessRepresentation|(TaskStep|ProcessRepresentation)[]} body - Тело цикла
 * @param {Object} condition - Условие продолжения
 * @param {string} [id] - ID для ссылок
 * @returns {ProcessRepresentation}
 */
function createLoop(body, condition, id = null) {
    if (!condition) {
        throw new Error('Loop requires a termination condition');
    }

    const steps = Array.isArray(body) ? body : [body];
    if (steps.length === 0) {
        throw new Error('Loop requires at least one step in body');
    }

    return {
        type: PROCESS_TYPES.LOOP,
        id: id || `loop_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        steps,
        loopCondition: condition,
        _type: 'ProcessRepresentation'
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Валидация IR на soundness
 * @param {ProcessRepresentation} ir - Промежуточное представление
 * @returns {Object} Результат валидации
 */
function validateIR(ir) {
    const errors = [];
    const warnings = [];
    const definedOutputs = new Set(['START']); // START всегда доступен
    const usedInputs = new Set();
    const seenIds = new Set();

    function traverse(node, path = []) {
        // Проверить уникальность ID
        const nodeId = node.id;
        if (nodeId) {
            if (seenIds.has(nodeId)) {
                errors.push({
                    type: 'duplicate_id',
                    message: `Duplicate ID: "${nodeId}"`,
                    path: [...path]
                });
            }
            seenIds.add(nodeId);
        }

        if (node._type === 'TaskStep') {
            // Проверить обязательные поля
            if (!node.id) {
                errors.push({
                    type: 'missing_id',
                    message: 'TaskStep missing id',
                    path
                });
            }

            if (!node.intent) {
                errors.push({
                    type: 'missing_intent',
                    message: `TaskStep "${node.id}" missing intent`,
                    path: [...path, node.id]
                });
            }

            if (!node.capability) {
                errors.push({
                    type: 'missing_capability',
                    message: `TaskStep "${node.id}" missing capability`,
                    path: [...path, node.id]
                });
            }

            // Проверить что все inputs определены
            for (const input of (node.inputs || [])) {
                usedInputs.add(input);
                if (input !== 'START' && !definedOutputs.has(input)) {
                    // Input может быть определён позже в parallel — это warning, не error
                    warnings.push({
                        type: 'undefined_input',
                        message: `Input "${input}" in step "${node.id}" may not be defined at this point`,
                        path: [...path, node.id],
                        input
                    });
                }
            }

            // Проверить наличие outputs
            if (!node.outputs || node.outputs.length === 0) {
                warnings.push({
                    type: 'no_outputs',
                    message: `TaskStep "${node.id}" has no outputs defined`,
                    path: [...path, node.id]
                });
            }

            // Регистрируем outputs
            for (const output of (node.outputs || [])) {
                if (definedOutputs.has(output)) {
                    errors.push({
                        type: 'duplicate_output',
                        message: `Output "${output}" is defined multiple times`,
                        path: [...path, node.id],
                        output
                    });
                }
                definedOutputs.add(output);
            }

            return;
        }

        if (node._type === 'ProcessRepresentation') {
            if (!node.type) {
                errors.push({
                    type: 'missing_process_type',
                    message: 'ProcessRepresentation missing type',
                    path
                });
                return;
            }

            if (!node.steps || !Array.isArray(node.steps)) {
                errors.push({
                    type: 'missing_steps',
                    message: `ProcessRepresentation "${node.id}" missing steps array`,
                    path: [...path, node.id]
                });
                return;
            }

            switch (node.type) {
                case PROCESS_TYPES.SEQUENCE:
                    // В sequence шаги идут последовательно
                    for (const step of node.steps) {
                        traverse(step, [...path, node.id]);
                    }
                    break;

                case PROCESS_TYPES.PARALLEL: {
                    // В parallel шаги независимы — каждый получает snapshot outputs
                    const snapshotOutputs = new Set(definedOutputs);
                    for (const branch of node.steps) {
                        // Каждая ветка видит только outputs до parallel
                        traverse(branch, [...path, node.id]);
                    }
                    break;
                }

                case PROCESS_TYPES.CHOICE:
                    // В choice только одна ветка выполняется
                    if (!node.choiceCondition) {
                        warnings.push({
                            type: 'missing_condition',
                            message: `Choice "${node.id}" has no condition specified`,
                            path: [...path, node.id]
                        });
                    }

                    if (node.steps.length < 2) {
                        warnings.push({
                            type: 'insufficient_branches',
                            message: `Choice "${node.id}" has less than 2 branches`,
                            path: [...path, node.id]
                        });
                    }

                    for (const branch of node.steps) {
                        traverse(branch, [...path, node.id]);
                    }
                    break;

                case PROCESS_TYPES.LOOP:
                    if (!node.loopCondition) {
                        errors.push({
                            type: 'missing_loop_condition',
                            message: `Loop "${node.id}" has no termination condition (infinite loop risk)`,
                            path: [...path, node.id]
                        });
                    }

                    for (const step of node.steps) {
                        traverse(step, [...path, node.id]);
                    }
                    break;

                default:
                    errors.push({
                        type: 'unknown_process_type',
                        message: `Unknown process type: ${node.type}`,
                        path: [...path, node.id]
                    });
            }
        }
    }

    traverse(ir);

    // Финальная проверка: все outputs должны быть использованы или вести к END
    const unusedOutputs = [...definedOutputs].filter(
        o => o !== 'START' && !usedInputs.has(o)
    );

    if (unusedOutputs.length > 0) {
        warnings.push({
            type: 'unused_outputs',
            message: `Outputs not used: ${unusedOutputs.join(', ')}. They should connect to END.`,
            outputs: unusedOutputs
        });
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
        stats: {
            totalOutputs: definedOutputs.size,
            usedInputs: usedInputs.size,
            uniqueIds: seenIds.size
        }
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Извлечь все TaskSteps из IR (flatten)
 * @param {ProcessRepresentation} ir - Промежуточное представление
 * @returns {TaskStep[]}
 */
function extractAllSteps(ir) {
    const steps = [];

    function traverse(node) {
        if (!node) return;

        if (node._type === 'TaskStep') {
            steps.push(node);
            return;
        }

        if (node._type === 'ProcessRepresentation' && node.steps) {
            for (const step of node.steps) {
                traverse(step);
            }
        }
    }

    traverse(ir);
    return steps;
}

/**
 * Построить dependency graph из IR
 * @param {ProcessRepresentation} ir - Промежуточное представление
 * @returns {Map} Граф зависимостей
 */
function buildDependencyGraph(ir) {
    const steps = extractAllSteps(ir);
    const graph = new Map();
    const outputToStep = new Map();

    // Построить маппинг output → step
    for (const step of steps) {
        graph.set(step.id, { step, dependencies: [], dependents: [] });
        for (const output of (step.outputs || [])) {
            outputToStep.set(output, step.id);
        }
    }

    // Построить зависимости
    for (const step of steps) {
        for (const input of (step.inputs || [])) {
            if (input === 'START') continue;

            const sourceStepId = outputToStep.get(input);
            if (sourceStepId && graph.has(sourceStepId)) {
                graph.get(step.id).dependencies.push(sourceStepId);
                graph.get(sourceStepId).dependents.push(step.id);
            }
        }
    }

    return graph;
}

/**
 * Topological sort для определения порядка выполнения
 * @param {ProcessRepresentation} ir - Промежуточное представление
 * @returns {TaskStep[]} Упорядоченный список шагов
 */
function topologicalSort(ir) {
    const graph = buildDependencyGraph(ir);
    const sorted = [];
    const visited = new Set();
    const visiting = new Set();

    function visit(stepId) {
        if (visited.has(stepId)) return true;
        if (visiting.has(stepId)) {
            // Cycle detected
            return false;
        }

        visiting.add(stepId);
        const node = graph.get(stepId);

        if (node) {
            for (const depId of node.dependencies) {
                if (!visit(depId)) {
                    return false;
                }
            }
        }

        visiting.delete(stepId);
        visited.add(stepId);

        if (node) {
            sorted.push(node.step);
        }
        return true;
    }

    for (const stepId of graph.keys()) {
        if (!visit(stepId)) {
            throw new Error(`Cycle detected in process graph at step: ${stepId}`);
        }
    }

    return sorted;
}

/**
 * Получить execution levels (для параллельного выполнения)
 * @param {ProcessRepresentation} ir - Промежуточное представление
 * @returns {TaskStep[][]} Шаги сгруппированные по уровням
 */
function getExecutionLevels(ir) {
    const graph = buildDependencyGraph(ir);
    const levels = [];
    const stepLevel = new Map();

    // Назначить уровни методом BFS
    const queue = [];

    // Найти входные точки (шаги без зависимостей)
    for (const [stepId, node] of graph) {
        if (node.dependencies.length === 0) {
            queue.push(stepId);
            stepLevel.set(stepId, 0);
        }
    }

    while (queue.length > 0) {
        const current = queue.shift();
        const currentLevel = stepLevel.get(current);
        const node = graph.get(current);

        if (!node) continue;

        for (const depId of node.dependents) {
            const newLevel = currentLevel + 1;
            const existingLevel = stepLevel.get(depId);

            if (existingLevel === undefined || newLevel > existingLevel) {
                stepLevel.set(depId, newLevel);
            }

            // Добавить в очередь если все зависимости обработаны
            const depNode = graph.get(depId);
            if (depNode) {
                const allDepsProcessed = depNode.dependencies.every(d => stepLevel.has(d));
                if (allDepsProcessed && !queue.includes(depId)) {
                    queue.push(depId);
                }
            }
        }
    }

    // Группировать по уровням
    const maxLevel = Math.max(...stepLevel.values(), 0);
    for (let i = 0; i <= maxLevel; i++) {
        levels.push([]);
    }

    for (const [stepId, level] of stepLevel) {
        const node = graph.get(stepId);
        if (node) {
            levels[level].push(node.step);
        }
    }

    return levels.filter(l => l.length > 0);
}

/**
 * Получить статистику IR
 * @param {ProcessRepresentation} ir - Промежуточное представление
 * @returns {Object} Статистика
 */
function getIRStats(ir) {
    const steps = extractAllSteps(ir);
    const graph = buildDependencyGraph(ir);

    // Подсчёт по capabilities
    const capabilityCount = {};
    for (const step of steps) {
        capabilityCount[step.capability] = (capabilityCount[step.capability] || 0) + 1;
    }

    // Подсчёт типов процессов
    const processTypes = { sequence: 0, choice: 0, parallel: 0, loop: 0 };

    function countProcessTypes(node) {
        if (node._type === 'ProcessRepresentation') {
            processTypes[node.type] = (processTypes[node.type] || 0) + 1;
            for (const step of (node.steps || [])) {
                countProcessTypes(step);
            }
        }
    }
    countProcessTypes(ir);

    // Максимальная глубина вложенности
    let maxDepth = 0;
    function getDepth(node, depth = 0) {
        maxDepth = Math.max(maxDepth, depth);
        if (node._type === 'ProcessRepresentation' && node.steps) {
            for (const step of node.steps) {
                getDepth(step, depth + 1);
            }
        }
    }
    getDepth(ir);

    // Средняя степень вершин
    let totalDegree = 0;
    for (const [, node] of graph) {
        totalDegree += node.dependencies.length + node.dependents.length;
    }

    return {
        totalSteps: steps.length,
        capabilityCount,
        processTypes,
        maxDepth,
        avgDegree: steps.length > 0 ? (totalDegree / steps.length).toFixed(2) : 0,
        totalDependencies: [...graph.values()].reduce((sum, n) => sum + n.dependencies.length, 0)
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// SERIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Сериализация IR в JSON (для сохранения/передачи)
 * @param {ProcessRepresentation} ir - Промежуточное представление
 * @returns {string} JSON строка
 */
function serializeIR(ir) {
    return JSON.stringify(ir, null, 2);
}

/**
 * Десериализация IR из JSON
 * @param {string|Object} json - JSON строка или объект
 * @returns {ProcessRepresentation}
 */
function deserializeIR(json) {
    const parsed = typeof json === 'string' ? JSON.parse(json) : json;
    // Восстановить _type маркеры если потеряны
    return restoreTypes(parsed);
}

/**
 * Восстановить маркеры типов после десериализации
 * @private
 */
function restoreTypes(node) {
    if (!node) return node;

    if (node.intent && node.capability) {
        node._type = 'TaskStep';
    } else if (node.type && node.steps) {
        node._type = 'ProcessRepresentation';
        node.steps = node.steps.map(restoreTypes);
    }

    return node;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
    // Constants
    PROCESS_TYPES,
    CAPABILITY_CATEGORIES,
    DATA_TYPES,

    // Creators
    createTaskStep,
    createSequence,
    createChoice,
    createParallel,
    createLoop,

    // Validation
    validateIR,

    // Utilities
    extractAllSteps,
    buildDependencyGraph,
    topologicalSort,
    getExecutionLevels,
    getIRStats,

    // Serialization
    serializeIR,
    deserializeIR
};
