require('dotenv').config();
const azdev = require("azure-devops-node-api");

const ADO_ORG_URL = process.env.ADO_ORG_URL;
const ADO_PAT = process.env.ADO_PAT;

if (!ADO_ORG_URL || !ADO_PAT) {
    console.error("Error: ADO_ORG_URL or ADO_PAT not set in .env");
    process.exit(1);
}

async function run() {
    try {
        console.log(`Connecting to: ${ADO_ORG_URL}`);
        const authHandler = azdev.getPersonalAccessTokenHandler(ADO_PAT);
        const connection = new azdev.WebApi(ADO_ORG_URL, authHandler);
        const tfvcApi = await connection.getTfvcApi();

        const changesetId = 81991; // The one from the screenshot
        console.log(`Fetching changes for changeset ${changesetId}...`);

        const changes = await tfvcApi.getChangesetChanges(changesetId, undefined, 100);

        console.log(`Found ${changes.length} changes.`);
        if (changes.length > 0) {
            console.log("First change:", JSON.stringify(changes[0], null, 2));
        } else {
            console.log("No changes found. Trying without maxChanges limit...");
            const changesNoLimit = await tfvcApi.getChangesetChanges(changesetId);
            console.log(`Found ${changesNoLimit.length} changes without limit.`);
        }

    } catch (error) {
        console.error("Error:", error);
    }
}

run();
