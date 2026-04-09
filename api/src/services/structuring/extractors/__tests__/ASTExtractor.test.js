const { ASTExtractor, NodeLabels, RelationTypes } = require('../ASTExtractor');

describe('ASTExtractor', () => {
    const extractor = new ASTExtractor();

    test('should extract class with methods and properties', async () => {
        const code = `
            import { Repository } from './repository';
            import type { User } from '../types';

            /**
             * Service for user management
             */
            export class UserService extends BaseService implements IUserService {
                private repo: Repository;
                public readonly name: string = 'UserService';

                constructor(repo: Repository) {
                    super();
                    this.repo = repo;
                }

                async getUser(id: string): Promise<User> {
                    if (!id) {
                        throw new Error('ID required');
                    }
                    return this.repo.findById(id);
                }

                async deleteUser(id: string): Promise<void> {
                    const user = await this.getUser(id);
                    if (user) {
                        await this.repo.delete(id);
                    }
                }

                static getInstance(): UserService {
                    return new UserService(new Repository());
                }
            }
        `;

        const result = await extractor.extractFromTypeScript('services/UserService.ts', code);

        // Check file entity
        const fileEntity = result.entities.find(e => e.label === NodeLabels.FILE);
        expect(fileEntity).toBeDefined();
        expect(fileEntity.properties.name).toBe('UserService.ts');
        expect(fileEntity.properties.language).toBe('typescript');

        // Check class entity
        const classEntity = result.entities.find(e => e.label === NodeLabels.CLASS);
        expect(classEntity).toBeDefined();
        expect(classEntity.properties.name).toBe('UserService');
        expect(classEntity.properties.isExported).toBe(true);
        expect(classEntity.properties.documentation).toContain('user management');
        expect(classEntity.properties.methodCount).toBe(3); // getUser, deleteUser, getInstance

        // Check methods
        const methods = result.entities.filter(e => e.label === NodeLabels.METHOD);
        expect(methods.length).toBe(4); // constructor, getUser, deleteUser, getInstance

        const getUserMethod = methods.find(m => m.properties.name === 'getUser');
        expect(getUserMethod).toBeDefined();
        expect(getUserMethod.properties.isAsync).toBe(true);
        expect(getUserMethod.properties.complexity).toBeGreaterThan(1); // has if statement
        expect(getUserMethod.properties.parameterCount).toBe(1);

        const staticMethod = methods.find(m => m.properties.name === 'getInstance');
        expect(staticMethod).toBeDefined();
        expect(staticMethod.properties.isStatic).toBe(true);

        // Check properties
        const properties = result.entities.filter(e => e.label === NodeLabels.PROPERTY);
        expect(properties.length).toBe(2); // repo, name

        const repoProperty = properties.find(p => p.properties.name === 'repo');
        expect(repoProperty).toBeDefined();
        expect(repoProperty.properties.visibility).toBe('private');

        const nameProperty = properties.find(p => p.properties.name === 'name');
        expect(nameProperty).toBeDefined();
        expect(nameProperty.properties.isReadonly).toBe(true);

        // Check relationships
        const extendsRel = result.relationships.find(r => r.type === RelationTypes.EXTENDS);
        expect(extendsRel).toBeDefined();
        expect(extendsRel.targetId).toBe('BaseService');

        const implementsRel = result.relationships.find(r => r.type === RelationTypes.IMPLEMENTS);
        expect(implementsRel).toBeDefined();
        expect(implementsRel.targetId).toBe('IUserService');

        const importRels = result.relationships.filter(r => r.type === RelationTypes.IMPORTS);
        expect(importRels.length).toBe(2);
        expect(importRels.some(r => r.targetId === './repository')).toBe(true);

        // Check metrics
        expect(result.metrics.classes).toBe(1);
        expect(result.metrics.methods).toBe(4);
        expect(result.metrics.properties).toBe(2);
        expect(result.metrics.imports).toBe(2);
    });

    test('should extract interfaces', async () => {
        const code = `
            /**
             * User entity interface
             */
            export interface IUser {
                id: string;
                name: string;
                email?: string;
                getFullName(): string;
            }

            interface IService<T> extends IBaseService {
                find(id: string): Promise<T>;
            }
        `;

        const result = await extractor.extractFromTypeScript('types/user.ts', code);

        const interfaces = result.entities.filter(e => e.label === NodeLabels.INTERFACE);
        expect(interfaces.length).toBe(2);

        const userInterface = interfaces.find(i => i.properties.name === 'IUser');
        expect(userInterface).toBeDefined();
        expect(userInterface.properties.isExported).toBe(true);
        expect(userInterface.properties.documentation).toContain('User entity');
        expect(userInterface.properties.propertyCount).toBe(3);
        expect(userInterface.properties.methodCount).toBe(1);

        const serviceInterface = interfaces.find(i => i.properties.name === 'IService');
        expect(serviceInterface).toBeDefined();
        expect(serviceInterface.properties.typeParameters).toContain('T');

        // Check extends relationship
        const extendsRel = result.relationships.find(
            r => r.type === RelationTypes.EXTENDS && r.sourceId.includes('IService')
        );
        expect(extendsRel).toBeDefined();
        expect(extendsRel.targetId).toBe('IBaseService');
    });

    test('should extract standalone functions', async () => {
        const code = `
            /**
             * Calculate sum of numbers
             */
            export function sum(a: number, b: number): number {
                return a + b;
            }

            async function fetchData(url: string): Promise<any> {
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error('Failed');
                }
                return response.json();
            }

            export default function defaultHandler() {
                console.log('default');
            }
        `;

        const result = await extractor.extractFromTypeScript('utils/helpers.ts', code);

        const functions = result.entities.filter(e => e.label === NodeLabels.FUNCTION);
        expect(functions.length).toBe(3);

        const sumFunc = functions.find(f => f.properties.name === 'sum');
        expect(sumFunc).toBeDefined();
        expect(sumFunc.properties.isExported).toBe(true);
        expect(sumFunc.properties.parameterCount).toBe(2);
        expect(sumFunc.properties.documentation).toContain('Calculate sum');

        const fetchFunc = functions.find(f => f.properties.name === 'fetchData');
        expect(fetchFunc).toBeDefined();
        expect(fetchFunc.properties.isAsync).toBe(true);
        expect(fetchFunc.properties.complexity).toBeGreaterThan(1); // has if

        const defaultFunc = functions.find(f => f.properties.name === 'defaultHandler');
        expect(defaultFunc).toBeDefined();
        expect(defaultFunc.properties.isDefaultExport).toBe(true);

        expect(result.metrics.functions).toBe(3);
    });

    test('should extract enums', async () => {
        const code = `
            /**
             * User roles
             */
            export enum UserRole {
                Admin = 'admin',
                User = 'user',
                Guest = 'guest'
            }

            export const enum Status {
                Active = 1,
                Inactive = 0
            }
        `;

        const result = await extractor.extractFromTypeScript('types/enums.ts', code);

        const enums = result.entities.filter(e => e.label === NodeLabels.ENUM);
        expect(enums.length).toBe(2);

        const roleEnum = enums.find(e => e.properties.name === 'UserRole');
        expect(roleEnum).toBeDefined();
        expect(roleEnum.properties.isExported).toBe(true);
        expect(roleEnum.properties.memberCount).toBe(3);
        expect(roleEnum.properties.members).toContainEqual({ name: 'Admin', value: 'admin' });

        const statusEnum = enums.find(e => e.properties.name === 'Status');
        expect(statusEnum).toBeDefined();
        expect(statusEnum.properties.isConst).toBe(true);

        expect(result.metrics.enums).toBe(2);
    });

    test('should extract call relationships', async () => {
        const code = `
            class Calculator {
                add(a: number, b: number): number {
                    this.log('adding');
                    return a + b;
                }

                multiply(a: number, b: number): number {
                    const result = this.add(a, 0);
                    console.log(result);
                    return a * b;
                }

                private log(msg: string): void {
                    console.log(msg);
                }
            }
        `;

        const result = await extractor.extractFromTypeScript('math/Calculator.ts', code);

        const callRels = result.relationships.filter(r => r.type === RelationTypes.CALLS);
        expect(callRels.length).toBeGreaterThan(0);

        // Check that multiply calls add
        const multiplyToAdd = callRels.find(
            r => r.sourceId.includes('multiply') && r.targetId === 'add'
        );
        expect(multiplyToAdd).toBeDefined();
        expect(multiplyToAdd.properties.isMethodCall).toBe(true);

        // Check that methods call console.log
        const consoleLogCalls = callRels.filter(r => r.targetId === 'log');
        expect(consoleLogCalls.length).toBeGreaterThan(0);
    });

    test('should handle JavaScript files', async () => {
        const code = `
            const express = require('express');

            function createApp() {
                const app = express();
                app.get('/', (req, res) => {
                    res.send('Hello');
                });
                return app;
            }

            module.exports = { createApp };
        `;

        const result = await extractor.extractFromTypeScript('app.js', code);

        expect(result.entities.length).toBeGreaterThan(0);
        expect(result.metrics.functions).toBeGreaterThanOrEqual(1);

        const fileEntity = result.entities.find(e => e.label === NodeLabels.FILE);
        expect(fileEntity.properties.language).toBe('javascript');
    });

    test('should calculate cyclomatic complexity correctly', async () => {
        const code = `
            function complexFunction(x: number): string {
                if (x < 0) {
                    return 'negative';
                } else if (x === 0) {
                    return 'zero';
                }

                for (let i = 0; i < x; i++) {
                    if (i % 2 === 0) {
                        console.log(i);
                    }
                }

                switch (x % 3) {
                    case 0: return 'divisible by 3';
                    case 1: return 'remainder 1';
                    default: return 'remainder 2';
                }
            }
        `;

        const result = await extractor.extractFromTypeScript('utils/complex.ts', code);

        const func = result.entities.find(e => e.label === NodeLabels.FUNCTION);
        expect(func).toBeDefined();
        // Base: 1, if: 1, else if: 1, for: 1, if inside for: 1, case: 2
        expect(func.properties.complexity).toBeGreaterThanOrEqual(6);
    });

    test('should handle empty file', async () => {
        const code = `// Empty file with only comment`;

        const result = await extractor.extractFromTypeScript('empty.ts', code);

        expect(result.entities.length).toBe(1); // Only file entity
        expect(result.metrics.classes).toBe(0);
        expect(result.metrics.functions).toBe(0);
    });

    test('should extract type aliases', async () => {
        const code = `
            export type UserId = string;
            export type UserMap<T> = Map<UserId, T>;
            type InternalType = { id: string };
        `;

        const result = await extractor.extractFromTypeScript('types/aliases.ts', code);

        const typeAliases = result.entities.filter(e => e.label === NodeLabels.TYPE_ALIAS);
        expect(typeAliases.length).toBe(3);

        const userMapType = typeAliases.find(t => t.properties.name === 'UserMap');
        expect(userMapType).toBeDefined();
        expect(userMapType.properties.typeParameters).toContain('T');

        expect(result.metrics.typeAliases).toBe(3);
    });
});
