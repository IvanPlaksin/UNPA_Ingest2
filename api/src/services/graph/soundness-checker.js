/**
 * Soundness Checker для промежуточного представления процессов
 *
 * Проверяет soundness гарантии на основе формальных методов из ProMoAI/POWL:
 * - Отсутствие deadlocks (все пути завершаются)
 * - Отсутствие циклов (кроме явных loop)
 * - Все входы имеют источник
 * - Все выходы достижимы
 * - Совместимость типов данных
 *
 * @module services/graph/soundness-checker
 */

'use strict';

const {
    validateIR,
    topologicalSort,
    extractAllSteps,
    buildDependencyGraph,
    getExecutionLevels,
    PROCESS_TYPES
} = require('./process-representation');

// ═══════════════════════════════════════════════════════════════════════════
// SOUNDNESS CHECKER CLASS
// ═══════════════════════════════════════════════════════════════════════════

class SoundnessChecker {
    constructor(options = {}) {
        this.options = {
            strict: options.strict ?? false,  // Treat warnings as errors
            checkTypes: options.checkTypes ?? true,
            maxDepth: options.maxDepth ?? 20,
            maxSteps: options.maxSteps ?? 100,
            ...options
        };
    }

    /**
     * Полная проверка soundness
     * @param {Object} ir - Промежуточное представление
     * @returns {Object} Результат проверки
     */
    check(ir) {
        const startTime = Date.now();

        const results = {
            sound: true,
            checks: [],
            errors: [],
            warnings: [],
            metrics: {}
        };

        if (!ir) {
            results.sound = false;
            results.errors.push({
                type: 'null_ir',
                message: 'IR is null or undefined'
            });
            results.duration = Date.now() - startTime;
            return results;
        }

        // 1. Базовая валидация структуры
        const structureCheck = this._checkStructure(ir);
        results.checks.push(structureCheck);
        if (!structureCheck.passed) {
            results.sound = false;
            results.errors.push(...structureCheck.errors);
        }
        results.warnings.push(...(structureCheck.warnings || []));

        // Если структура невалидна — дальнейшие проверки невозможны
        if (!structureCheck.passed && structureCheck.errors.some(e =>
            ['missing_process_type', 'missing_steps'].includes(e.type))) {
            results.duration = Date.now() - startTime;
            return results;
        }

        // 2. Проверка на циклы
        const cycleCheck = this._checkCycles(ir);
        results.checks.push(cycleCheck);
        if (!cycleCheck.passed) {
            results.sound = false;
            results.errors.push(...cycleCheck.errors);
        }

        // 3. Проверка достижимости
        const reachabilityCheck = this._checkReachability(ir);
        results.checks.push(reachabilityCheck);
        if (!reachabilityCheck.passed) {
            results.sound = false;
            results.errors.push(...reachabilityCheck.errors);
        }
        results.warnings.push(...(reachabilityCheck.warnings || []));

        // 4. Проверка completeness (все пути ведут к END)
        const completenessCheck = this._checkCompleteness(ir);
        results.checks.push(completenessCheck);
        if (!completenessCheck.passed) {
            if (this.options.strict) {
                results.sound = false;
                results.errors.push(...completenessCheck.warnings);
            } else {
                results.warnings.push(...completenessCheck.warnings);
            }
        }

        // 5. Проверка типов данных (если есть type info)
        if (this.options.checkTypes) {
            const typeCheck = this._checkTypeCompatibility(ir);
            results.checks.push(typeCheck);
            if (!typeCheck.passed && this.options.strict) {
                results.sound = false;
                results.errors.push(...typeCheck.warnings);
            } else {
                results.warnings.push(...(typeCheck.warnings || []));
            }
        }

        // 6. Проверка ресурсных ограничений
        const resourceCheck = this._checkResourceLimits(ir);
        results.checks.push(resourceCheck);
        if (!resourceCheck.passed) {
            results.warnings.push(...resourceCheck.warnings);
        }

        // 7. Проверка детерминизма
        const determinismCheck = this._checkDeterminism(ir);
        results.checks.push(determinismCheck);
        results.warnings.push(...(determinismCheck.warnings || []));

        // 8. Проверка изоляции веток (для parallel и choice)
        const isolationCheck = this._checkBranchIsolation(ir);
        results.checks.push(isolationCheck);
        if (!isolationCheck.passed) {
            results.warnings.push(...isolationCheck.warnings);
        }

        // Метрики
        results.metrics = this._computeMetrics(ir);
        results.duration = Date.now() - startTime;

        // В strict mode предупреждения становятся ошибками
        if (this.options.strict && results.warnings.length > 0) {
            results.sound = false;
        }

        return results;
    }

    /**
     * Quick check — только критические проверки
     * @param {Object} ir - Промежуточное представление
     * @returns {Object} Быстрый результат
     */
    quickCheck(ir) {
        if (!ir) {
            return { sound: false, reason: 'null_ir' };
        }

        try {
            // Проверка структуры
            const validation = validateIR(ir);
            if (!validation.valid) {
                return {
                    sound: false,
                    reason: 'structure_invalid',
                    errors: validation.errors.slice(0, 3) // Только первые 3
                };
            }

            // Проверка циклов
            topologicalSort(ir);

            // Проверка достижимости (упрощённая)
            const steps = extractAllSteps(ir);
            if (steps.length === 0) {
                return { sound: false, reason: 'no_steps' };
            }

            return { sound: true };
        } catch (error) {
            return {
                sound: false,
                reason: error.message.includes('Cycle') ? 'cycle_detected' : error.message
            };
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CHECK METHODS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Проверка структуры IR
     * @private
     */
    _checkStructure(ir) {
        const validation = validateIR(ir);
        return {
            name: 'structure',
            passed: validation.valid,
            errors: validation.errors,
            warnings: validation.warnings,
            stats: validation.stats
        };
    }

    /**
     * Проверка на циклы
     * @private
     */
    _checkCycles(ir) {
        try {
            const sorted = topologicalSort(ir);
            return {
                name: 'acyclic',
                passed: true,
                message: 'No cycles detected',
                sortedSteps: sorted.length
            };
        } catch (error) {
            return {
                name: 'acyclic',
                passed: false,
                errors: [{
                    type: 'cycle_detected',
                    message: error.message
                }]
            };
        }
    }

    /**
     * Проверка достижимости
     * @private
     */
    _checkReachability(ir) {
        const steps = extractAllSteps(ir);
        const errors = [];
        const warnings = [];

        if (steps.length === 0) {
            return {
                name: 'reachability',
                passed: true,
                message: 'No steps to check'
            };
        }

        // Построить граф достижимости от START
        const reachable = new Set(['START']);
        const outputToStep = new Map();

        // Построить маппинг output → step
        for (const step of steps) {
            for (const output of (step.outputs || [])) {
                outputToStep.set(output, step.id);
            }
        }

        let changed = true;
        let iterations = 0;
        const maxIterations = steps.length * 2;

        while (changed && iterations < maxIterations) {
            changed = false;
            iterations++;

            for (const step of steps) {
                if (reachable.has(step.id)) continue;

                // Step достижим если все его inputs достижимы
                const inputs = step.inputs || [];
                if (inputs.length === 0) {
                    // Шаг без inputs — warning, но считаем достижимым
                    warnings.push({
                        type: 'no_inputs',
                        message: `Step "${step.id}" has no inputs (assuming reachable from START)`,
                        stepId: step.id
                    });
                    reachable.add(step.id);
                    for (const output of (step.outputs || [])) {
                        reachable.add(output);
                    }
                    changed = true;
                    continue;
                }

                const allInputsReachable = inputs.every(input => {
                    if (input === 'START') return true;
                    // Input достижим если он в reachable
                    if (reachable.has(input)) return true;
                    // Или если шаг, который его производит, достижим
                    const sourceStep = outputToStep.get(input);
                    return sourceStep && reachable.has(sourceStep);
                });

                if (allInputsReachable) {
                    reachable.add(step.id);
                    for (const output of (step.outputs || [])) {
                        reachable.add(output);
                    }
                    changed = true;
                }
            }
        }

        // Проверить что все steps достижимы
        for (const step of steps) {
            if (!reachable.has(step.id)) {
                errors.push({
                    type: 'unreachable_step',
                    message: `Step "${step.id}" is not reachable from START`,
                    stepId: step.id,
                    inputs: step.inputs
                });
            }
        }

        return {
            name: 'reachability',
            passed: errors.length === 0,
            errors,
            warnings,
            reachableSteps: [...reachable].filter(r => steps.find(s => s.id === r)).length,
            totalSteps: steps.length
        };
    }

    /**
     * Проверка completeness (все пути ведут к END)
     * @private
     */
    _checkCompleteness(ir) {
        const steps = extractAllSteps(ir);
        const warnings = [];

        // Найти все outputs
        const allOutputs = new Set();
        const usedAsInput = new Set();

        for (const step of steps) {
            for (const output of (step.outputs || [])) {
                allOutputs.add(output);
            }
            for (const input of (step.inputs || [])) {
                usedAsInput.add(input);
            }
        }

        // Найти terminal outputs (не используются как input)
        const terminalOutputs = [...allOutputs].filter(o => !usedAsInput.has(o));

        if (terminalOutputs.length === 0 && steps.length > 0) {
            warnings.push({
                type: 'no_terminal_outputs',
                message: 'No terminal outputs found. Process may not have clear end points.',
                hint: 'Consider adding output ports that explicitly mark the end of the process.'
            });
        }

        // Проверить что все ветки choice/parallel имеют выходы
        const incompleteBranches = this._findIncompleteBranches(ir);
        for (const branch of incompleteBranches) {
            warnings.push({
                type: 'incomplete_branch',
                message: `Branch in ${branch.parentType} "${branch.parentId}" may not produce outputs`,
                branchIndex: branch.index
            });
        }

        return {
            name: 'completeness',
            passed: warnings.length === 0,
            warnings,
            terminalOutputs
        };
    }

    /**
     * Проверка совместимости типов
     * @private
     */
    _checkTypeCompatibility(ir) {
        const steps = extractAllSteps(ir);
        const warnings = [];
        const outputTypes = new Map();

        // Собрать типы outputs
        for (const step of steps) {
            if (step.metadata?.outputType) {
                for (const output of (step.outputs || [])) {
                    outputTypes.set(output, {
                        type: step.metadata.outputType,
                        stepId: step.id
                    });
                }
            }
        }

        // Проверить совместимость input → output types
        for (const step of steps) {
            if (step.metadata?.inputType) {
                for (const input of (step.inputs || [])) {
                    if (input === 'START') continue;

                    const sourceInfo = outputTypes.get(input);
                    if (sourceInfo && sourceInfo.type !== step.metadata.inputType) {
                        // Проверить на совместимые типы
                        if (!this._areTypesCompatible(sourceInfo.type, step.metadata.inputType)) {
                            warnings.push({
                                type: 'type_mismatch',
                                message: `Type mismatch: step "${step.id}" expects ${step.metadata.inputType} ` +
                                         `but receives ${sourceInfo.type} from "${input}" (step "${sourceInfo.stepId}")`,
                                stepId: step.id,
                                input,
                                expected: step.metadata.inputType,
                                received: sourceInfo.type
                            });
                        }
                    }
                }
            }
        }

        return {
            name: 'type_compatibility',
            passed: warnings.length === 0,
            warnings
        };
    }

    /**
     * Проверка ресурсных ограничений
     * @private
     */
    _checkResourceLimits(ir) {
        const steps = extractAllSteps(ir);
        const warnings = [];

        // Проверка количества шагов
        if (steps.length > this.options.maxSteps) {
            warnings.push({
                type: 'too_many_steps',
                message: `IR has ${steps.length} steps, exceeding limit of ${this.options.maxSteps}`,
                actual: steps.length,
                limit: this.options.maxSteps
            });
        }

        // Проверка глубины вложенности
        const maxDepth = this._getMaxDepth(ir);
        if (maxDepth > this.options.maxDepth) {
            warnings.push({
                type: 'too_deep',
                message: `IR nesting depth is ${maxDepth}, exceeding limit of ${this.options.maxDepth}`,
                actual: maxDepth,
                limit: this.options.maxDepth
            });
        }

        // Проверка параллелизма
        const levels = getExecutionLevels(ir);
        const maxParallel = Math.max(...levels.map(l => l.length), 0);
        if (maxParallel > 10) {
            warnings.push({
                type: 'high_parallelism',
                message: `Up to ${maxParallel} steps can execute in parallel`,
                maxParallel
            });
        }

        return {
            name: 'resource_limits',
            passed: warnings.length === 0,
            warnings,
            stats: {
                steps: steps.length,
                depth: maxDepth,
                maxParallel
            }
        };
    }

    /**
     * Проверка детерминизма
     * @private
     */
    _checkDeterminism(ir) {
        const warnings = [];

        function checkNode(node, path = []) {
            if (node._type === 'ProcessRepresentation') {
                if (node.type === PROCESS_TYPES.CHOICE && !node.choiceCondition) {
                    warnings.push({
                        type: 'non_deterministic_choice',
                        message: `Choice "${node.id}" has no condition - branch selection is non-deterministic`,
                        path: [...path, node.id]
                    });
                }

                if (node.type === PROCESS_TYPES.LOOP) {
                    if (!node.loopCondition) {
                        warnings.push({
                            type: 'non_deterministic_loop',
                            message: `Loop "${node.id}" has no termination condition`,
                            path: [...path, node.id]
                        });
                    } else if (node.loopCondition.type === 'probabilistic') {
                        warnings.push({
                            type: 'probabilistic_loop',
                            message: `Loop "${node.id}" has probabilistic termination`,
                            path: [...path, node.id]
                        });
                    }
                }

                for (const step of (node.steps || [])) {
                    checkNode(step, [...path, node.id]);
                }
            }
        }

        checkNode(ir);

        return {
            name: 'determinism',
            passed: true, // Non-determinism is a warning, not an error
            warnings
        };
    }

    /**
     * Проверка изоляции веток
     * @private
     */
    _checkBranchIsolation(ir) {
        const warnings = [];

        function checkNode(node, path = []) {
            if (node._type === 'ProcessRepresentation') {
                if (node.type === PROCESS_TYPES.PARALLEL || node.type === PROCESS_TYPES.CHOICE) {
                    // Собрать outputs всех веток
                    const branchOutputs = [];

                    for (let i = 0; i < (node.steps || []).length; i++) {
                        const branch = node.steps[i];
                        const outputs = new Set();

                        function collectOutputs(n) {
                            if (n._type === 'TaskStep') {
                                for (const o of (n.outputs || [])) {
                                    outputs.add(o);
                                }
                            } else if (n._type === 'ProcessRepresentation') {
                                for (const s of (n.steps || [])) {
                                    collectOutputs(s);
                                }
                            }
                        }

                        collectOutputs(branch);
                        branchOutputs.push({ index: i, outputs });
                    }

                    // Проверить на пересечения
                    for (let i = 0; i < branchOutputs.length; i++) {
                        for (let j = i + 1; j < branchOutputs.length; j++) {
                            const intersection = [...branchOutputs[i].outputs].filter(
                                o => branchOutputs[j].outputs.has(o)
                            );

                            if (intersection.length > 0) {
                                warnings.push({
                                    type: 'output_collision',
                                    message: `Branches ${i} and ${j} in ${node.type} "${node.id}" produce same outputs: ${intersection.join(', ')}`,
                                    path: [...path, node.id],
                                    conflictingOutputs: intersection
                                });
                            }
                        }
                    }
                }

                for (const step of (node.steps || [])) {
                    checkNode(step, [...path, node.id]);
                }
            }
        }

        checkNode(ir);

        return {
            name: 'branch_isolation',
            passed: warnings.length === 0,
            warnings
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HELPER METHODS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Найти неполные ветки
     * @private
     */
    _findIncompleteBranches(ir) {
        const incomplete = [];

        function checkNode(node) {
            if (node._type === 'ProcessRepresentation' &&
                (node.type === PROCESS_TYPES.CHOICE || node.type === PROCESS_TYPES.PARALLEL)) {

                for (let i = 0; i < (node.steps || []).length; i++) {
                    const branch = node.steps[i];
                    const hasOutputs = this._branchHasOutputs(branch);

                    if (!hasOutputs) {
                        incomplete.push({
                            parentId: node.id,
                            parentType: node.type,
                            index: i
                        });
                    }
                }

                for (const step of (node.steps || [])) {
                    checkNode.call(this, step);
                }
            }
        }

        checkNode.call(this, ir);
        return incomplete;
    }

    /**
     * Проверить есть ли у ветки outputs
     * @private
     */
    _branchHasOutputs(branch) {
        if (branch._type === 'TaskStep') {
            return (branch.outputs || []).length > 0;
        }

        if (branch._type === 'ProcessRepresentation' && branch.steps) {
            return branch.steps.some(s => this._branchHasOutputs(s));
        }

        return false;
    }

    /**
     * Получить максимальную глубину вложенности
     * @private
     */
    _getMaxDepth(ir) {
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
        return maxDepth;
    }

    /**
     * Проверить совместимость типов
     * @private
     */
    _areTypesCompatible(sourceType, targetType) {
        // any совместим со всем
        if (sourceType === 'any' || targetType === 'any') return true;

        // Точное совпадение
        if (sourceType === targetType) return true;

        // Иерархия типов
        const typeHierarchy = {
            'text': ['json', 'any'],
            'json': ['any'],
            'entities': ['json', 'any'],
            'vector': ['any'],
            'graph': ['json', 'any'],
            'binary': ['any']
        };

        const compatibleWith = typeHierarchy[sourceType] || [];
        return compatibleWith.includes(targetType);
    }

    /**
     * Вычислить метрики IR
     * @private
     */
    _computeMetrics(ir) {
        const steps = extractAllSteps(ir);
        const graph = buildDependencyGraph(ir);

        // Подсчёт capabilities
        const capabilities = {};
        for (const step of steps) {
            capabilities[step.capability] = (capabilities[step.capability] || 0) + 1;
        }

        // Критический путь (самый длинный)
        let criticalPathLength = 0;
        const stepDepth = new Map();

        for (const [stepId, node] of graph) {
            if (node.dependencies.length === 0) {
                stepDepth.set(stepId, 1);
            }
        }

        let changed = true;
        while (changed) {
            changed = false;
            for (const [stepId, node] of graph) {
                if (!stepDepth.has(stepId)) {
                    const depDepths = node.dependencies.map(d => stepDepth.get(d));
                    if (depDepths.every(d => d !== undefined)) {
                        const depth = Math.max(...depDepths, 0) + 1;
                        stepDepth.set(stepId, depth);
                        criticalPathLength = Math.max(criticalPathLength, depth);
                        changed = true;
                    }
                }
            }
        }

        // Коэффициент параллелизма
        const levels = getExecutionLevels(ir);
        const avgParallel = levels.length > 0
            ? steps.length / levels.length
            : 0;

        return {
            stepCount: steps.length,
            capabilityDistribution: capabilities,
            criticalPathLength,
            parallelismFactor: parseFloat(avgParallel.toFixed(2)),
            executionLevels: levels.length,
            dependencyCount: [...graph.values()].reduce((sum, n) => sum + n.dependencies.length, 0)
        };
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY AND SINGLETON
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Создать экземпляр SoundnessChecker
 * @param {Object} options - Опции
 * @returns {SoundnessChecker}
 */
function createSoundnessChecker(options = {}) {
    return new SoundnessChecker(options);
}

// Синглтон с дефолтными опциями
const defaultChecker = new SoundnessChecker();

module.exports = {
    SoundnessChecker,
    createSoundnessChecker,
    default: defaultChecker
};
