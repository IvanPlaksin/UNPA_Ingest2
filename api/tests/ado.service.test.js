const adoService = require('../src/services/ado.service');
const azdev = require("azure-devops-node-api");

// Mock azure-devops-node-api
jest.mock("azure-devops-node-api");

describe('ADO Service - getWorkItemsUniversal', () => {
    let mockQueryByWiql;
    let mockGetWorkItems;

    beforeEach(() => {
        // Reset mocks
        mockQueryByWiql = jest.fn();
        mockGetWorkItems = jest.fn();

        azdev.getPersonalAccessTokenHandler.mockReturnValue({});
        azdev.WebApi.mockImplementation(() => ({
            getWorkItemTrackingApi: jest.fn().mockResolvedValue({
                queryByWiql: mockQueryByWiql,
                getWorkItems: mockGetWorkItems,
                queryById: jest.fn()
            })
        }));

        // Initialize service (this calls connectToAdo internally or we need to call it)
        process.env.ADO_ORG_URL = "https://dev.azure.com/mock";
        process.env.ADO_PAT = "mock_pat";
    });

    test('should slice IDs based on limit (Server-Side Filtering)', async () => {
        await adoService.connectToAdo();

        // Mock WIQL response with 100 IDs
        const mockIds = Array.from({ length: 100 }, (_, i) => ({ id: i + 1 }));
        mockQueryByWiql.mockResolvedValue({ workItems: mockIds });
        mockGetWorkItems.mockResolvedValue([]);

        await adoService.getWorkItemsUniversal({ wiql: "SELECT * FROM WorkItems", limit: 10 });

        // Expect getWorkItems to be called with only 10 IDs
        const calledIds = mockGetWorkItems.mock.calls[0][0];
        expect(calledIds.length).toBe(10);
        expect(calledIds).toEqual(mockIds.slice(0, 10).map(i => i.id));
    });

    test('should batch requests when IDs > 50', async () => {
        await adoService.connectToAdo();

        // Mock WIQL response with 60 IDs
        const mockIds = Array.from({ length: 60 }, (_, i) => ({ id: i + 1 }));
        mockQueryByWiql.mockResolvedValue({ workItems: mockIds });
        mockGetWorkItems.mockResolvedValue([]);

        // Limit 60 to trigger batching (batch size is 50)
        await adoService.getWorkItemsUniversal({ wiql: "SELECT * FROM WorkItems", limit: 60 });

        // Expect 2 calls to getWorkItems
        expect(mockGetWorkItems).toHaveBeenCalledTimes(2);
        
        // First batch: 50 items
        expect(mockGetWorkItems.mock.calls[0][0].length).toBe(50);
        // Second batch: 10 items
        expect(mockGetWorkItems.mock.calls[1][0].length).toBe(10);
    });

    test('should handle null from API (Self-Correction simulation)', async () => {
        await adoService.connectToAdo();
        mockQueryByWiql.mockResolvedValue({ workItems: [{ id: 1 }] });
        
        // Simulate API returning null (e.g. bad fields)
        mockGetWorkItems.mockResolvedValue(null);

        const result = await adoService.getWorkItemsUniversal({ wiql: "SELECT *", limit: 1 });

        expect(result.error).toBe("getWorkItems_returned_null");
    });
});
