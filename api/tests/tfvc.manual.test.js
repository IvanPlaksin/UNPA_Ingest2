// api/tests/tfvc.manual.test.js
const assert = require('assert');

// Mock azure-devops-node-api
const mockTfvcApi = {
    getItems: async (project, path, recursion, includeContent) => {
        console.log(`[MOCK] getItems called with path=${path}, recursion=${recursion}, includeContent=${includeContent}`);
        return [
            { path: '$/Project/File1.cs', isFolder: false },
            { path: '$/Project/Folder', isFolder: true }
        ];
    },
    getItem: async (path, project, maxChangeCount, includeContent) => {
        console.log(`[MOCK] getItem called with path=${path}, includeContent=${includeContent}`);
        if (path === '$/Project/LargeFile.bin' && !includeContent) {
            return { isFolder: false, contentMetadata: { fileLength: 2000000 } }; // 2MB
        }
        if (path === '$/Project/NormalFile.cs' && !includeContent) {
            return { isFolder: false, contentMetadata: { fileLength: 500 } };
        }
        if (path === '$/Project/NormalFile.cs' && includeContent) {
            return { content: "public class NormalFile {}" };
        }
        return null;
    },
    getChangesets: async (project, maxCount, skip, sort, searchCriteria) => {
        console.log(`[MOCK] getChangesets called with itemPath=${searchCriteria.itemPath}, author=${searchCriteria.author}`);
        return [
            { changesetId: 101, comment: "Fix bug", author: { displayName: "John Doe" }, createdDate: new Date() }
        ];
    },
    getLabels: async () => {
        console.log(`[MOCK] getLabels called`);
        return [
            { id: 1, name: "Release 1.0", description: "First release", scope: "$/Project" }
        ];
    }
};

const mockConnection = {
    getTfvcApi: async () => mockTfvcApi
};

const mockAzdev = {
    getPersonalAccessTokenHandler: () => ({}),
    WebApi: function () { return mockConnection; }
};

// Mock require
const originalRequire = require('module').prototype.require;
require('module').prototype.require = function (path) {
    if (path === 'azure-devops-node-api') return mockAzdev;
    return originalRequire.apply(this, arguments);
};

// Set env vars
process.env.ADO_ORG_URL = "https://dev.azure.com/mock";
process.env.ADO_PAT = "mock_pat";

// Import service AFTER mocking
const tfvcService = require('../src/services/tfvc.service');

async function runTests() {
    console.log("=== Running TFVC Service Tests ===");

    try {
        // Test 1: getTfvcItems
        console.log("\nTest 1: getTfvcItems");
        const items = await tfvcService.getTfvcItems({ scopePath: '$/Project' });
        assert.strictEqual(items.length, 2);
        assert.strictEqual(items[0].path, '$/Project/File1.cs');
        console.log("PASS");

        // Test 2: getTfvcFileContent (Normal)
        console.log("\nTest 2: getTfvcFileContent (Normal)");
        const content = await tfvcService.getTfvcFileContent({ path: '$/Project/NormalFile.cs' });
        assert.strictEqual(content, "public class NormalFile {}");
        console.log("PASS");

        // Test 3: getTfvcFileContent (Too Large)
        console.log("\nTest 3: getTfvcFileContent (Too Large)");
        try {
            await tfvcService.getTfvcFileContent({ path: '$/Project/LargeFile.bin' });
            console.error("FAIL: Should have thrown error");
        } catch (e) {
            if (e.message.includes("File too large")) {
                console.log("PASS: Caught expected error");
            } else {
                console.error("FAIL: Unexpected error:", e.message);
            }
        }

        // Test 4: getTfvcChangesets
        console.log("\nTest 4: getTfvcChangesets");
        const changesets = await tfvcService.getTfvcChangesets({ itemPath: '$/Project/Main', author: 'John' });
        assert.strictEqual(changesets.length, 1);
        assert.strictEqual(changesets[0].changesetId, 101);
        console.log("PASS");

        // Test 5: getTfvcLabels
        console.log("\nTest 5: getTfvcLabels");
        const labels = await tfvcService.getTfvcLabels({});
        assert.strictEqual(labels.length, 1);
        assert.strictEqual(labels[0].name, "Release 1.0");
        console.log("PASS");

    } catch (e) {
        console.error("TEST FAILED:", e);
    }
}

runTests();
