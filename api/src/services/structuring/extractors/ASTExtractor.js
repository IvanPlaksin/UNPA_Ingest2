/**
 * ASTExtractor - Извлечение сущностей из кода через AST-парсинг
 *
 * Использует ts-morph для парсинга TypeScript/JavaScript кода
 * и извлечения структурных элементов: классы, функции, методы, импорты.
 */

const { Project, SyntaxKind, Node } = require('ts-morph');
const path = require('path');

// Labels для узлов графа (соответствуют схеме KnowledgeQuantum)
const NodeLabels = {
    FILE: 'File',
    CLASS: 'Class',
    INTERFACE: 'Interface',
    FUNCTION: 'Function',
    METHOD: 'Method',
    PROPERTY: 'Property',
    ENUM: 'Enum',
    MODULE: 'Module',
    TYPE_ALIAS: 'TypeAlias',
};

// Типы отношений
const RelationTypes = {
    CONTAINS: 'CONTAINS',
    IMPORTS: 'IMPORTS',
    EXPORTS: 'EXPORTS',
    EXTENDS: 'EXTENDS',
    IMPLEMENTS: 'IMPLEMENTS',
    CALLS: 'CALLS',
    USES: 'USES',
    DEPENDS_ON: 'DEPENDS_ON',
};

class ASTExtractor {
    constructor() {
        // In-memory project для парсинга без доступа к файловой системе
        this.project = new Project({
            useInMemoryFileSystem: true,
            compilerOptions: {
                allowJs: true,
                checkJs: false,
                target: 99, // ESNext
                module: 99, // ESNext
            }
        });
    }

    /**
     * Основной метод: извлечение из TypeScript/JavaScript
     * @param {string} filePath - Путь к файлу
     * @param {string} content - Содержимое файла
     * @returns {Promise<{entities: Array, relationships: Array, metrics: Object}>}
     */
    async extractFromTypeScript(filePath, content) {
        const entities = [];
        const relationships = [];
        const metrics = {
            classes: 0,
            interfaces: 0,
            functions: 0,
            methods: 0,
            properties: 0,
            imports: 0,
            exports: 0,
            enums: 0,
            typeAliases: 0,
            totalComplexity: 0,
            linesOfCode: 0,
        };

        // Создаём source file в памяти
        const sourceFile = this.project.createSourceFile(filePath, content, {
            overwrite: true,
        });

        metrics.linesOfCode = sourceFile.getEndLineNumber();

        // 1. File entity
        const fileEntity = this._createFileEntity(filePath, sourceFile);
        entities.push(fileEntity);

        // 2. Extract classes
        for (const classDecl of sourceFile.getClasses()) {
            const classEntity = this._extractClass(classDecl, filePath);
            entities.push(classEntity);
            metrics.classes++;

            // File CONTAINS Class
            relationships.push({
                type: RelationTypes.CONTAINS,
                sourceId: filePath,
                targetId: classEntity.properties.qualifiedName,
                properties: {},
            });

            // Methods
            for (const method of classDecl.getMethods()) {
                const methodEntity = this._extractMethod(method, classEntity.properties.qualifiedName, filePath);
                entities.push(methodEntity);
                metrics.methods++;
                metrics.totalComplexity += methodEntity.properties.complexity || 1;

                // Class CONTAINS Method
                relationships.push({
                    type: RelationTypes.CONTAINS,
                    sourceId: classEntity.properties.qualifiedName,
                    targetId: methodEntity.properties.qualifiedName,
                    properties: {},
                });
            }

            // Constructor
            const constructor = classDecl.getConstructors()[0];
            if (constructor) {
                const ctorEntity = this._extractConstructor(constructor, classEntity.properties.qualifiedName, filePath);
                entities.push(ctorEntity);
                metrics.methods++;

                relationships.push({
                    type: RelationTypes.CONTAINS,
                    sourceId: classEntity.properties.qualifiedName,
                    targetId: ctorEntity.properties.qualifiedName,
                    properties: {},
                });
            }

            // Properties (fields)
            for (const prop of classDecl.getProperties()) {
                const propEntity = this._extractProperty(prop, classEntity.properties.qualifiedName, filePath);
                entities.push(propEntity);
                metrics.properties++;

                relationships.push({
                    type: RelationTypes.CONTAINS,
                    sourceId: classEntity.properties.qualifiedName,
                    targetId: propEntity.properties.qualifiedName,
                    properties: {},
                });
            }

            // Inheritance (extends)
            const extendsExpr = classDecl.getExtends();
            if (extendsExpr) {
                // Get the base class name from the extends expression
                const baseClassName = extendsExpr.getExpression().getText();
                relationships.push({
                    type: RelationTypes.EXTENDS,
                    sourceId: classEntity.properties.qualifiedName,
                    targetId: baseClassName,
                    properties: { resolved: false },
                });
            }

            // Implements interfaces
            for (const impl of classDecl.getImplements()) {
                relationships.push({
                    type: RelationTypes.IMPLEMENTS,
                    sourceId: classEntity.properties.qualifiedName,
                    targetId: impl.getText(),
                    properties: {},
                });
            }
        }

        // 3. Extract interfaces
        for (const interfaceDecl of sourceFile.getInterfaces()) {
            const interfaceEntity = this._extractInterface(interfaceDecl, filePath);
            entities.push(interfaceEntity);
            metrics.interfaces++;

            relationships.push({
                type: RelationTypes.CONTAINS,
                sourceId: filePath,
                targetId: interfaceEntity.properties.qualifiedName,
                properties: {},
            });

            // Interface extends
            for (const ext of interfaceDecl.getExtends()) {
                relationships.push({
                    type: RelationTypes.EXTENDS,
                    sourceId: interfaceEntity.properties.qualifiedName,
                    targetId: ext.getText(),
                    properties: {},
                });
            }
        }

        // 4. Extract standalone functions
        for (const funcDecl of sourceFile.getFunctions()) {
            const funcEntity = this._extractFunction(funcDecl, filePath);
            entities.push(funcEntity);
            metrics.functions++;
            metrics.totalComplexity += funcEntity.properties.complexity || 1;

            relationships.push({
                type: RelationTypes.CONTAINS,
                sourceId: filePath,
                targetId: funcEntity.properties.qualifiedName,
                properties: {},
            });
        }

        // 5. Extract enums
        for (const enumDecl of sourceFile.getEnums()) {
            const enumEntity = this._extractEnum(enumDecl, filePath);
            entities.push(enumEntity);
            metrics.enums++;

            relationships.push({
                type: RelationTypes.CONTAINS,
                sourceId: filePath,
                targetId: enumEntity.properties.qualifiedName,
                properties: {},
            });
        }

        // 6. Extract type aliases
        for (const typeAlias of sourceFile.getTypeAliases()) {
            const typeEntity = this._extractTypeAlias(typeAlias, filePath);
            entities.push(typeEntity);
            metrics.typeAliases++;

            relationships.push({
                type: RelationTypes.CONTAINS,
                sourceId: filePath,
                targetId: typeEntity.properties.qualifiedName,
                properties: {},
            });
        }

        // 7. Extract imports
        const importRels = this._extractImports(sourceFile, filePath);
        relationships.push(...importRels);
        metrics.imports = importRels.length;

        // 8. Extract exports
        const exportRels = this._extractExports(sourceFile, filePath);
        relationships.push(...exportRels);
        metrics.exports = exportRels.length;

        // 9. Extract call relationships (function/method calls)
        const callRels = this._extractCallRelationships(sourceFile, filePath, entities);
        relationships.push(...callRels);

        // Cleanup - удаляем source file из памяти
        this.project.removeSourceFile(sourceFile);

        return { entities, relationships, metrics };
    }

    // ============ Entity Extractors ============

    _createFileEntity(filePath, sourceFile) {
        return {
            label: NodeLabels.FILE,
            properties: {
                name: path.basename(filePath),
                filePath: filePath,
                qualifiedName: filePath,
                language: this._detectLanguage(filePath),
                lineCount: sourceFile.getEndLineNumber(),
                hasDefaultExport: sourceFile.getDefaultExportSymbol() !== undefined,
                exportedNames: this._getExportedNames(sourceFile),
                isDeclarationFile: filePath.endsWith('.d.ts'),
            },
        };
    }

    _extractClass(classDecl, filePath) {
        const name = classDecl.getName() || 'AnonymousClass';
        const qualifiedName = `${filePath}#${name}`;

        return {
            label: NodeLabels.CLASS,
            properties: {
                name,
                qualifiedName,
                filePath,
                startLine: classDecl.getStartLineNumber(),
                endLine: classDecl.getEndLineNumber(),
                isAbstract: classDecl.isAbstract(),
                isExported: classDecl.isExported(),
                isDefaultExport: classDecl.isDefaultExport(),
                documentation: this._getJsDocDescription(classDecl),
                decorators: classDecl.getDecorators().map(d => d.getName()),
                typeParameters: classDecl.getTypeParameters().map(tp => tp.getName()),
                methodCount: classDecl.getMethods().length,
                propertyCount: classDecl.getProperties().length,
            },
        };
    }

    _extractInterface(interfaceDecl, filePath) {
        const name = interfaceDecl.getName();
        const qualifiedName = `${filePath}#${name}`;

        return {
            label: NodeLabels.INTERFACE,
            properties: {
                name,
                qualifiedName,
                filePath,
                startLine: interfaceDecl.getStartLineNumber(),
                endLine: interfaceDecl.getEndLineNumber(),
                isExported: interfaceDecl.isExported(),
                documentation: this._getJsDocDescription(interfaceDecl),
                propertyCount: interfaceDecl.getProperties().length,
                methodCount: interfaceDecl.getMethods().length,
                typeParameters: interfaceDecl.getTypeParameters().map(tp => tp.getName()),
            },
        };
    }

    _extractMethod(method, parentQualifiedName, filePath) {
        const name = method.getName();
        const qualifiedName = `${parentQualifiedName}.${name}`;

        return {
            label: NodeLabels.METHOD,
            properties: {
                name,
                qualifiedName,
                filePath,
                startLine: method.getStartLineNumber(),
                endLine: method.getEndLineNumber(),
                isAsync: method.isAsync(),
                isStatic: method.isStatic(),
                isAbstract: method.isAbstract(),
                isGenerator: method.isGenerator(),
                visibility: this._getVisibility(method),
                parameters: this._extractParameters(method),
                parameterCount: method.getParameters().length,
                returnType: this._safeGetReturnType(method),
                complexity: this._calculateCyclomaticComplexity(method),
                documentation: this._getJsDocDescription(method),
                decorators: method.getDecorators().map(d => d.getName()),
            },
        };
    }

    _extractConstructor(constructor, parentQualifiedName, filePath) {
        const qualifiedName = `${parentQualifiedName}.constructor`;

        return {
            label: NodeLabels.METHOD,
            properties: {
                name: 'constructor',
                qualifiedName,
                filePath,
                startLine: constructor.getStartLineNumber(),
                endLine: constructor.getEndLineNumber(),
                isConstructor: true,
                visibility: this._getVisibility(constructor),
                parameters: this._extractParameters(constructor),
                parameterCount: constructor.getParameters().length,
                complexity: this._calculateCyclomaticComplexity(constructor),
                documentation: this._getJsDocDescription(constructor),
            },
        };
    }

    _extractFunction(funcDecl, filePath) {
        const name = funcDecl.getName() || 'anonymous';
        const qualifiedName = `${filePath}#${name}`;

        return {
            label: NodeLabels.FUNCTION,
            properties: {
                name,
                qualifiedName,
                filePath,
                startLine: funcDecl.getStartLineNumber(),
                endLine: funcDecl.getEndLineNumber(),
                isAsync: funcDecl.isAsync(),
                isExported: funcDecl.isExported(),
                isDefaultExport: funcDecl.isDefaultExport(),
                isGenerator: funcDecl.isGenerator(),
                parameters: this._extractParameters(funcDecl),
                parameterCount: funcDecl.getParameters().length,
                returnType: this._safeGetReturnType(funcDecl),
                complexity: this._calculateCyclomaticComplexity(funcDecl),
                documentation: this._getJsDocDescription(funcDecl),
            },
        };
    }

    _extractProperty(prop, parentQualifiedName, filePath) {
        const name = prop.getName();
        const qualifiedName = `${parentQualifiedName}.${name}`;

        return {
            label: NodeLabels.PROPERTY,
            properties: {
                name,
                qualifiedName,
                filePath,
                startLine: prop.getStartLineNumber(),
                endLine: prop.getEndLineNumber(),
                type: this._safeGetType(prop),
                isStatic: prop.isStatic(),
                isReadonly: prop.isReadonly(),
                isOptional: prop.hasQuestionToken(),
                visibility: this._getVisibility(prop),
                hasInitializer: prop.hasInitializer(),
                decorators: prop.getDecorators().map(d => d.getName()),
            },
        };
    }

    _extractEnum(enumDecl, filePath) {
        const name = enumDecl.getName();
        const qualifiedName = `${filePath}#${name}`;

        return {
            label: NodeLabels.ENUM,
            properties: {
                name,
                qualifiedName,
                filePath,
                startLine: enumDecl.getStartLineNumber(),
                endLine: enumDecl.getEndLineNumber(),
                isExported: enumDecl.isExported(),
                isConst: enumDecl.isConstEnum(),
                members: enumDecl.getMembers().map(m => ({
                    name: m.getName(),
                    value: m.getValue(),
                })),
                memberCount: enumDecl.getMembers().length,
                documentation: this._getJsDocDescription(enumDecl),
            },
        };
    }

    _extractTypeAlias(typeAlias, filePath) {
        const name = typeAlias.getName();
        const qualifiedName = `${filePath}#${name}`;

        return {
            label: NodeLabels.TYPE_ALIAS,
            properties: {
                name,
                qualifiedName,
                filePath,
                startLine: typeAlias.getStartLineNumber(),
                endLine: typeAlias.getEndLineNumber(),
                isExported: typeAlias.isExported(),
                typeParameters: typeAlias.getTypeParameters().map(tp => tp.getName()),
                documentation: this._getJsDocDescription(typeAlias),
            },
        };
    }

    // ============ Relationship Extractors ============

    _extractImports(sourceFile, filePath) {
        const relationships = [];

        for (const importDecl of sourceFile.getImportDeclarations()) {
            const moduleSpecifier = importDecl.getModuleSpecifierValue();
            const namedImports = importDecl.getNamedImports().map(ni => ({
                name: ni.getName(),
                alias: ni.getAliasNode()?.getText(),
            }));
            const defaultImport = importDecl.getDefaultImport()?.getText();
            const namespaceImport = importDecl.getNamespaceImport()?.getText();

            relationships.push({
                type: RelationTypes.IMPORTS,
                sourceId: filePath,
                targetId: moduleSpecifier,
                properties: {
                    namedImports: namedImports.map(n => n.name),
                    namedImportsWithAliases: namedImports,
                    defaultImport: defaultImport || null,
                    namespaceImport: namespaceImport || null,
                    isTypeOnly: importDecl.isTypeOnly(),
                    line: importDecl.getStartLineNumber(),
                },
            });
        }

        // Dynamic imports
        sourceFile.forEachDescendant((node) => {
            if (Node.isCallExpression(node)) {
                const expression = node.getExpression();
                if (expression.getText() === 'import') {
                    const args = node.getArguments();
                    if (args.length > 0 && Node.isStringLiteral(args[0])) {
                        relationships.push({
                            type: RelationTypes.IMPORTS,
                            sourceId: filePath,
                            targetId: args[0].getLiteralText(),
                            properties: {
                                isDynamic: true,
                                line: node.getStartLineNumber(),
                            },
                        });
                    }
                }
            }
        });

        return relationships;
    }

    _extractExports(sourceFile, filePath) {
        const relationships = [];

        // Named exports
        for (const exportDecl of sourceFile.getExportDeclarations()) {
            const moduleSpecifier = exportDecl.getModuleSpecifierValue();
            const namedExports = exportDecl.getNamedExports().map(ne => ne.getName());

            if (moduleSpecifier) {
                // Re-export from another module
                relationships.push({
                    type: RelationTypes.EXPORTS,
                    sourceId: filePath,
                    targetId: moduleSpecifier,
                    properties: {
                        namedExports,
                        isReExport: true,
                    },
                });
            }
        }

        return relationships;
    }

    _extractCallRelationships(sourceFile, filePath, entities) {
        const relationships = [];
        const entityMap = new Map(
            entities
                .filter(e => e.label === NodeLabels.METHOD || e.label === NodeLabels.FUNCTION)
                .map(e => [e.properties.qualifiedName, e])
        );

        sourceFile.forEachDescendant((node) => {
            if (Node.isCallExpression(node)) {
                const callerQualifiedName = this._findContainingFunctionQualifiedName(node, filePath);
                if (!callerQualifiedName) return;

                const expression = node.getExpression();
                let calledName;
                let isMethodCall = false;

                if (Node.isIdentifier(expression)) {
                    calledName = expression.getText();
                } else if (Node.isPropertyAccessExpression(expression)) {
                    calledName = expression.getName();
                    isMethodCall = true;
                } else {
                    calledName = expression.getText().substring(0, 50);
                }

                // Avoid duplicates by creating unique key
                const relKey = `${callerQualifiedName}->${calledName}@${node.getStartLineNumber()}`;

                relationships.push({
                    type: RelationTypes.CALLS,
                    sourceId: callerQualifiedName,
                    targetId: calledName,
                    properties: {
                        line: node.getStartLineNumber(),
                        argumentCount: node.getArguments().length,
                        isMethodCall,
                        _key: relKey,
                    },
                });
            }
        });

        // Deduplicate by _key
        const seen = new Set();
        return relationships.filter(r => {
            const key = r.properties._key;
            if (seen.has(key)) return false;
            seen.add(key);
            delete r.properties._key;
            return true;
        });
    }

    // ============ Helpers ============

    _findContainingFunctionQualifiedName(node, filePath) {
        let current = node.getParent();

        while (current) {
            if (Node.isMethodDeclaration(current)) {
                const classDecl = current.getParent();
                const className = Node.isClassDeclaration(classDecl) ? classDecl.getName() : 'Unknown';
                return `${filePath}#${className}.${current.getName()}`;
            }
            if (Node.isConstructorDeclaration(current)) {
                const classDecl = current.getParent();
                const className = Node.isClassDeclaration(classDecl) ? classDecl.getName() : 'Unknown';
                return `${filePath}#${className}.constructor`;
            }
            if (Node.isFunctionDeclaration(current)) {
                return `${filePath}#${current.getName() || 'anonymous'}`;
            }
            if (Node.isArrowFunction(current) || Node.isFunctionExpression(current)) {
                const parent = current.getParent();
                if (Node.isVariableDeclaration(parent)) {
                    return `${filePath}#${parent.getName()}`;
                }
            }
            current = current.getParent();
        }

        return null;
    }

    _calculateCyclomaticComplexity(node) {
        let complexity = 1;

        node.forEachDescendant((child) => {
            if (
                Node.isIfStatement(child) ||
                Node.isConditionalExpression(child) ||
                Node.isForStatement(child) ||
                Node.isForInStatement(child) ||
                Node.isForOfStatement(child) ||
                Node.isWhileStatement(child) ||
                Node.isDoStatement(child) ||
                Node.isCaseClause(child) ||
                Node.isCatchClause(child)
            ) {
                complexity++;
            }
            // Logical operators
            if (Node.isBinaryExpression(child)) {
                const operator = child.getOperatorToken().getText();
                if (operator === '&&' || operator === '||' || operator === '??') {
                    complexity++;
                }
            }
        });

        return complexity;
    }

    _getJsDocDescription(node) {
        try {
            const jsDocs = node.getJsDocs?.();
            if (!jsDocs || jsDocs.length === 0) return null;

            const descriptions = jsDocs
                .map(doc => doc.getDescription?.() || doc.getComment?.())
                .filter(Boolean);

            return descriptions.join('\n').trim() || null;
        } catch {
            return null;
        }
    }

    _detectLanguage(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        const mapping = {
            '.ts': 'typescript',
            '.tsx': 'typescript-react',
            '.js': 'javascript',
            '.jsx': 'javascript-react',
            '.mjs': 'javascript',
            '.cjs': 'javascript',
            '.d.ts': 'typescript-declaration',
        };
        return mapping[ext] || 'unknown';
    }

    _getExportedNames(sourceFile) {
        try {
            const exported = [];
            const exportedDecls = sourceFile.getExportedDeclarations();
            for (const [name] of exportedDecls) {
                exported.push(name);
            }
            return exported;
        } catch {
            return [];
        }
    }

    _extractParameters(funcOrMethod) {
        try {
            return funcOrMethod.getParameters().map(p => ({
                name: p.getName(),
                type: this._safeGetType(p),
                isOptional: p.isOptional(),
                hasDefault: p.hasInitializer(),
                isRest: p.isRestParameter(),
            }));
        } catch {
            return [];
        }
    }

    _safeGetReturnType(node) {
        try {
            return node.getReturnType().getText();
        } catch {
            return 'unknown';
        }
    }

    _safeGetType(node) {
        try {
            return node.getType().getText();
        } catch {
            return 'unknown';
        }
    }

    _getVisibility(node) {
        try {
            const scope = node.getScope?.();
            return scope || 'public';
        } catch {
            return 'public';
        }
    }
}

module.exports = { ASTExtractor, NodeLabels, RelationTypes };
