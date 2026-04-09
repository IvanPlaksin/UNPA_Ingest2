const { TransactionCoordinator } = require('../../TransactionCoordinator');

describe('E2E: SAGA Transactions', () => {
  let transactionCoordinator;
  let mockGxeManager;
  let mockRegistry;
  let mockRedis;
  let mockMemgraph;

  beforeEach(() => {
    mockRedis = {
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn(),
      del: jest.fn().mockResolvedValue(1)
    };

    mockMemgraph = {
      query: jest.fn().mockResolvedValue([])
    };

    mockRegistry = {
      get: jest.fn()
    };

    mockGxeManager = {
      launch: jest.fn(),
      cancel: jest.fn(),
      on: jest.fn()
    };

    transactionCoordinator = new TransactionCoordinator(
      mockGxeManager,
      mockRegistry,
      mockRedis,
      mockMemgraph
    );
  });

  describe('Transaction Creation', () => {
    it('should create a new SAGA transaction', async () => {
      const sagaDefinition = {
        name: 'Order Processing',
        steps: [
          { graphId: 'validate-order', inputPayload: { orderId: '123' } },
          { graphId: 'charge-payment', compensationGraphId: 'refund-payment' },
          { graphId: 'ship-order', compensationGraphId: 'cancel-shipment' }
        ],
        concurrencyMode: 'SEQUENTIAL',
        onFailure: 'COMPENSATE'
      };

      const transaction = await transactionCoordinator.startTransaction(sagaDefinition);

      expect(transaction).toBeDefined();
      expect(transaction.transactionId).toBeDefined();
      expect(transaction.name).toBe('Order Processing');
      expect(transaction.status).toBe('PENDING');
      expect(transaction.steps).toHaveLength(3);
      expect(mockRedis.set).toHaveBeenCalled();
      expect(mockMemgraph.query).toHaveBeenCalled();
    });

    it('should generate unique transactionId', async () => {
      const tx1 = await transactionCoordinator.startTransaction({
        name: 'Test 1', steps: [{ graphId: 'g1' }]
      });
      const tx2 = await transactionCoordinator.startTransaction({
        name: 'Test 2', steps: [{ graphId: 'g2' }]
      });

      expect(tx1.transactionId).not.toBe(tx2.transactionId);
    });
  });

  describe('Sequential Execution', () => {
    it('should execute steps sequentially', async () => {
      const transaction = await transactionCoordinator.startTransaction({
        name: 'Test Transaction',
        steps: [
          { graphId: 'step-1' },
          { graphId: 'step-2' }
        ],
        concurrencyMode: 'SEQUENTIAL'
      });

      mockGxeManager.launch
        .mockResolvedValueOnce({ executionId: 'exec-1' })
        .mockResolvedValueOnce({ executionId: 'exec-2' });

      mockRegistry.get
        .mockResolvedValueOnce({ executionId: 'exec-1', status: 'COMPLETED' })
        .mockResolvedValueOnce({ executionId: 'exec-2', status: 'COMPLETED' });

      mockRedis.get.mockImplementation((key) => {
        if (key.includes('transaction')) {
          return Promise.resolve(JSON.stringify(transaction));
        }
        return Promise.resolve(null);
      });

      await transactionCoordinator.executeTransaction(transaction.transactionId);

      expect(mockGxeManager.launch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Compensation on Failure', () => {
    it('should run compensation when step fails', async () => {
      const transaction = await transactionCoordinator.startTransaction({
        name: 'Compensation Test',
        steps: [
          { graphId: 'step-1', compensationGraphId: 'comp-1' },
          { graphId: 'step-2' }
        ],
        onFailure: 'COMPENSATE'
      });

      let launchCount = 0;
      mockGxeManager.launch.mockImplementation(() => {
        launchCount++;
        return Promise.resolve({ executionId: `exec-${launchCount}` });
      });

      mockRegistry.get
        .mockResolvedValueOnce({ executionId: 'exec-1', status: 'COMPLETED', result: {} })
        .mockResolvedValueOnce({ executionId: 'exec-2', status: 'FAILED', error: { message: 'Test error' } })
        .mockResolvedValueOnce({ executionId: 'exec-3', status: 'COMPLETED' });

      mockRedis.get.mockImplementation((key) => {
        if (key.includes('transaction')) {
          return Promise.resolve(JSON.stringify({
            ...transaction,
            steps: [
              { ...transaction.steps[0], status: 'COMPLETED', executionId: 'exec-1' },
              { ...transaction.steps[1], status: 'FAILED' }
            ]
          }));
        }
        return Promise.resolve(null);
      });

      await transactionCoordinator.executeTransaction(transaction.transactionId);

      expect(mockGxeManager.launch).toHaveBeenCalledTimes(3);

      const lastCall = mockGxeManager.launch.mock.calls[2];
      expect(lastCall[0]).toBe('comp-1');
    });
  });

  describe('Transaction Resume', () => {
    it('should resume paused transaction from failed step', async () => {
      const pausedTransaction = {
        transactionId: 'txn-1',
        name: 'Paused Transaction',
        status: 'PAUSED',
        concurrencyMode: 'SEQUENTIAL',
        currentStepIndex: 1,
        steps: [
          { stepIndex: 0, graphId: 'step-1', status: 'COMPLETED' },
          { stepIndex: 1, graphId: 'step-2', status: 'FAILED', error: { message: 'Temporary error' } }
        ]
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(pausedTransaction));
      mockGxeManager.launch.mockResolvedValue({ executionId: 'exec-retry' });
      mockRegistry.get.mockResolvedValue({ status: 'COMPLETED' });

      const result = await transactionCoordinator.resumeTransaction('txn-1');

      expect(result.status).toBe('RUNNING');
      expect(mockGxeManager.launch).toHaveBeenCalledWith(
        'step-2',
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should reject resume of non-paused transaction', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify({
        transactionId: 'txn-2',
        status: 'RUNNING'
      }));

      await expect(transactionCoordinator.resumeTransaction('txn-2'))
        .rejects.toThrow('not paused');
    });
  });

  describe('Transaction Cancel', () => {
    it('should cancel running transaction with compensation', async () => {
      const runningTransaction = {
        transactionId: 'txn-cancel',
        name: 'Cancel Test',
        status: 'RUNNING',
        steps: [
          { stepIndex: 0, status: 'COMPLETED', executionId: 'exec-1', compensationGraphId: 'comp-1', inputPayload: {}, result: {} },
          { stepIndex: 1, status: 'RUNNING', executionId: 'exec-2' }
        ]
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(runningTransaction));
      mockGxeManager.cancel.mockResolvedValue({});
      mockGxeManager.launch.mockResolvedValue({ executionId: 'comp-exec' });
      mockRegistry.get.mockResolvedValue({ status: 'COMPLETED' });

      const result = await transactionCoordinator.cancelTransaction('txn-cancel', {
        runCompensation: true
      });

      expect(mockGxeManager.cancel).toHaveBeenCalledWith('exec-2', expect.any(Object));
      expect(result.status).toBe('COMPENSATED');
    });

    it('should cancel without compensation', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify({
        transactionId: 'txn-simple-cancel',
        status: 'RUNNING',
        steps: [{ status: 'RUNNING', executionId: 'exec-1' }]
      }));
      mockGxeManager.cancel.mockResolvedValue({});

      const result = await transactionCoordinator.cancelTransaction('txn-simple-cancel', {
        runCompensation: false
      });

      expect(result.status).toBe('CANCELLED');
    });
  });
});
