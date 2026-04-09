const { LLMExtractor, NodeLabels, RelationTypes } = require('../LLMExtractor');

// Mock LLM service
const mockLLMService = {
    chat: jest.fn()
};

describe('LLMExtractor', () => {
    let extractor;

    beforeEach(() => {
        extractor = new LLMExtractor(mockLLMService, { confidenceThreshold: 0.6 });
        jest.clearAllMocks();
    });

    describe('extractBusinessRules', () => {
        test('should extract validation rules from code', async () => {
            const code = `
                function validateOrder(order) {
                    if (order.total < 0) {
                        throw new Error('Order total cannot be negative');
                    }
                    if (order.items.length === 0) {
                        throw new Error('Order must have at least one item');
                    }
                    if (order.total > 10000 && !order.managerApproval) {
                        throw new Error('Orders over $10,000 require manager approval');
                    }
                }
            `;

            mockLLMService.chat.mockResolvedValue({
                content: JSON.stringify([
                    {
                        name: 'orderTotalMustBePositive',
                        description: 'Order total cannot be negative',
                        type: 'validation',
                        conditions: ['order.total < 0'],
                        actions: ['Throw error'],
                        confidence: 0.95
                    },
                    {
                        name: 'orderMustHaveItems',
                        description: 'Order must contain at least one item',
                        type: 'validation',
                        conditions: ['order.items.length === 0'],
                        actions: ['Throw error'],
                        confidence: 0.9
                    },
                    {
                        name: 'largeOrderRequiresApproval',
                        description: 'Orders over $10,000 require manager approval',
                        type: 'authorization',
                        conditions: ['order.total > 10000', '!order.managerApproval'],
                        actions: ['Throw error'],
                        confidence: 0.85
                    }
                ])
            });

            const rules = await extractor.extractBusinessRules(code, {
                filePath: 'orders/validation.js',
                functionName: 'validateOrder'
            });

            expect(rules).toHaveLength(3);
            expect(rules[0].label).toBe('BusinessRule');
            expect(rules[0].properties.ruleType).toBe('validation');
            expect(rules[0].properties.name).toBe('orderTotalMustBePositive');
            expect(rules[2].properties.ruleType).toBe('authorization');
            expect(rules[0].properties.sourceFile).toBe('orders/validation.js');
        });

        test('should filter by confidence threshold', async () => {
            mockLLMService.chat.mockResolvedValue({
                content: JSON.stringify([
                    { name: 'highConfidence', confidence: 0.9, type: 'validation' },
                    { name: 'lowConfidence', confidence: 0.4, type: 'validation' }
                ])
            });

            const rules = await extractor.extractBusinessRules('code');

            expect(rules).toHaveLength(1);
            expect(rules[0].properties.name).toBe('highConfidence');
        });

        test('should handle LLM errors gracefully', async () => {
            mockLLMService.chat.mockRejectedValue(new Error('LLM unavailable'));

            const rules = await extractor.extractBusinessRules('code');

            expect(rules).toEqual([]);
        });

        test('should include extraction metadata', async () => {
            mockLLMService.chat.mockResolvedValue({
                content: JSON.stringify([
                    { name: 'testRule', confidence: 0.8, type: 'validation' }
                ])
            });

            const rules = await extractor.extractBusinessRules('code', {
                filePath: 'test.js',
                className: 'TestClass',
                functionName: 'testMethod'
            });

            expect(rules[0].properties.extractionMethod).toBe('llm');
            expect(rules[0].properties.extractedAt).toBeDefined();
            expect(rules[0].properties.sourceClass).toBe('TestClass');
            expect(rules[0].properties.sourceFunction).toBe('testMethod');
        });
    });

    describe('extractDomainConcepts', () => {
        test('should extract concepts from documentation', async () => {
            const text = `
                The VIP Customer Program offers premium benefits including
                Priority Shipping and Dedicated Account Manager support.
                Customers must maintain a minimum Annual Purchase Volume (APV)
                of $50,000 to qualify for VIP status.
            `;

            mockLLMService.chat.mockResolvedValue({
                content: JSON.stringify([
                    {
                        name: 'VIPCustomer',
                        definition: 'Premium customer tier with special benefits',
                        synonyms: ['Premium Customer', 'VIP'],
                        type: 'entity',
                        domain: 'customer',
                        confidence: 0.9
                    },
                    {
                        name: 'AnnualPurchaseVolume',
                        definition: 'Total yearly purchase amount by customer',
                        synonyms: ['APV'],
                        type: 'metric',
                        domain: 'sales',
                        confidence: 0.85
                    }
                ])
            });

            const concepts = await extractor.extractDomainConcepts(text, 'documentation');

            expect(concepts).toHaveLength(2);
            expect(concepts[0].label).toBe('Concept');
            expect(concepts[0].properties.name).toBe('VIPCustomer');
            expect(concepts[0].properties.synonyms).toContain('VIP');
            expect(concepts[1].properties.conceptType).toBe('metric');
            expect(concepts[0].properties.sourceType).toBe('documentation');
        });

        test('should skip short text', async () => {
            const concepts = await extractor.extractDomainConcepts('short', 'documentation');

            expect(concepts).toEqual([]);
            expect(mockLLMService.chat).not.toHaveBeenCalled();
        });

        test('should handle empty results', async () => {
            mockLLMService.chat.mockResolvedValue({ content: '[]' });

            const concepts = await extractor.extractDomainConcepts('Some longer text for processing');

            expect(concepts).toEqual([]);
        });
    });

    describe('inferRelationship', () => {
        test('should infer relationship between entities', async () => {
            const entity1 = {
                label: 'BusinessRule',
                properties: {
                    id: 'br_1',
                    name: 'validateOrderTotal',
                    description: 'Validates order total is positive'
                }
            };

            const entity2 = {
                label: 'Concept',
                properties: {
                    id: 'concept_1',
                    name: 'OrderTotal',
                    definition: 'Total amount of an order'
                }
            };

            mockLLMService.chat.mockResolvedValue({
                content: JSON.stringify({
                    relationshipType: 'VALIDATES',
                    direction: '1->2',
                    description: 'The rule validates the order total concept',
                    confidence: 0.85,
                    evidence: 'Rule name contains OrderTotal and validates it'
                })
            });

            const relationship = await extractor.inferRelationship(entity1, entity2);

            expect(relationship).not.toBeNull();
            expect(relationship.type).toBe('VALIDATES');
            expect(relationship.sourceId).toBe('br_1');
            expect(relationship.targetId).toBe('concept_1');
            expect(relationship.properties.confidence).toBe(0.85);
        });

        test('should return null for low confidence', async () => {
            mockLLMService.chat.mockResolvedValue({
                content: JSON.stringify({
                    relationshipType: 'RELATED_TO',
                    direction: '1->2',
                    confidence: 0.3
                })
            });

            const entity1 = { label: 'Class', properties: { name: 'A' } };
            const entity2 = { label: 'Class', properties: { name: 'B' } };

            const relationship = await extractor.inferRelationship(entity1, entity2);

            expect(relationship).toBeNull();
        });

        test('should handle null response', async () => {
            mockLLMService.chat.mockResolvedValue({ content: 'null' });

            const entity1 = { label: 'Class', properties: { name: 'A' } };
            const entity2 = { label: 'Class', properties: { name: 'B' } };

            const relationship = await extractor.inferRelationship(entity1, entity2);

            expect(relationship).toBeNull();
        });

        test('should handle bidirectional relationships', async () => {
            mockLLMService.chat.mockResolvedValue({
                content: JSON.stringify({
                    relationshipType: 'RELATED_TO',
                    direction: 'bidirectional',
                    confidence: 0.8
                })
            });

            const entity1 = { label: 'Concept', properties: { id: 'c1', name: 'A' } };
            const entity2 = { label: 'Concept', properties: { id: 'c2', name: 'B' } };

            const relationship = await extractor.inferRelationship(entity1, entity2);

            expect(relationship.properties.bidirectional).toBe(true);
        });
    });

    describe('extractAll', () => {
        test('should extract rules, concepts, and relationships in one call', async () => {
            mockLLMService.chat.mockResolvedValue({
                content: JSON.stringify({
                    businessRules: [
                        { name: 'rule1', type: 'validation', confidence: 0.9 }
                    ],
                    concepts: [
                        { name: 'Concept1', type: 'entity', confidence: 0.85 }
                    ],
                    relationships: [
                        { from: 'rule1', to: 'Concept1', type: 'VALIDATES' }
                    ]
                })
            });

            const result = await extractor.extractAll('some code');

            expect(result.businessRules).toHaveLength(1);
            expect(result.concepts).toHaveLength(1);
            expect(result.suggestedRelationships).toHaveLength(1);
        });

        test('should handle empty results', async () => {
            mockLLMService.chat.mockResolvedValue({ content: '{}' });

            const result = await extractor.extractAll('some code');

            expect(result.businessRules).toEqual([]);
            expect(result.concepts).toEqual([]);
            expect(result.suggestedRelationships).toEqual([]);
        });
    });

    describe('extractFromWorkItem', () => {
        test('should extract from work item', async () => {
            const workItem = {
                id: 12345,
                type: 'User Story',
                state: 'Active',
                title: 'As a VIP customer, I want priority shipping',
                description: 'VIP customers should receive priority shipping on all orders',
                acceptanceCriteria: '1. Orders from VIP customers ship within 24 hours\n2. Tracking info sent immediately'
            };

            mockLLMService.chat.mockResolvedValue({
                content: JSON.stringify({
                    concepts: [
                        { name: 'VIPCustomer', type: 'entity', confidence: 0.9 },
                        { name: 'PriorityShipping', type: 'process', confidence: 0.85 }
                    ],
                    rules: [
                        { name: 'vipShipping24h', description: 'VIP orders ship within 24 hours', type: 'constraint', confidence: 0.8 }
                    ],
                    requirements: [
                        { description: 'Orders from VIP customers ship within 24 hours', priority: 'must', testable: true }
                    ]
                })
            });

            const result = await extractor.extractFromWorkItem(workItem);

            expect(result.concepts).toHaveLength(2);
            expect(result.rules).toHaveLength(1);
            expect(result.requirements).toHaveLength(1);
            expect(result.concepts[0].properties.sourceType).toBe('workitem');
        });

        test('should handle work item with minimal data', async () => {
            const workItem = {
                id: 1,
                title: 'Short'
            };

            const result = await extractor.extractFromWorkItem(workItem);

            expect(result.concepts).toEqual([]);
            expect(mockLLMService.chat).not.toHaveBeenCalled();
        });
    });

    describe('JSON parsing', () => {
        test('should handle markdown-wrapped JSON', async () => {
            mockLLMService.chat.mockResolvedValue({
                content: '```json\n[{"name": "test", "confidence": 0.8, "type": "validation"}]\n```'
            });

            const rules = await extractor.extractBusinessRules('code');

            expect(rules).toHaveLength(1);
            expect(rules[0].properties.name).toBe('test');
        });

        test('should handle JSON with surrounding text', async () => {
            mockLLMService.chat.mockResolvedValue({
                content: 'Here are the rules:\n[{"name": "test", "confidence": 0.8}]\nThese are important.'
            });

            const rules = await extractor.extractBusinessRules('code');

            expect(rules).toHaveLength(1);
        });

        test('should handle invalid JSON gracefully', async () => {
            mockLLMService.chat.mockResolvedValue({
                content: 'This is not JSON at all'
            });

            const rules = await extractor.extractBusinessRules('code');

            expect(rules).toEqual([]);
        });

        test('should handle string response directly', async () => {
            mockLLMService.chat.mockResolvedValue('[{"name": "test", "confidence": 0.8}]');

            const rules = await extractor.extractBusinessRules('code');

            expect(rules).toHaveLength(1);
        });

        test('should handle response.message.content format', async () => {
            mockLLMService.chat.mockResolvedValue({
                message: {
                    content: '[{"name": "test", "confidence": 0.8}]'
                }
            });

            const rules = await extractor.extractBusinessRules('code');

            expect(rules).toHaveLength(1);
        });
    });

    describe('code truncation', () => {
        test('should truncate long code', async () => {
            const longCode = 'x'.repeat(10000);

            mockLLMService.chat.mockResolvedValue({ content: '[]' });

            await extractor.extractBusinessRules(longCode);

            expect(mockLLMService.chat).toHaveBeenCalled();
            const callArg = mockLLMService.chat.mock.calls[0][0][1].content;
            expect(callArg.length).toBeLessThan(longCode.length);
            expect(callArg).toContain('truncated');
        });
    });
});
