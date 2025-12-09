require('dotenv').config();
const azdev = require("azure-devops-node-api");
const fs = require('fs');

const ADO_ORG_URL = process.env.ADO_ORG_URL;
const ADO_PAT = process.env.ADO_PAT;

async function run() {
    try {
        const authHandler = azdev.getPersonalAccessTokenHandler(ADO_PAT);
        const connection = new azdev.WebApi(ADO_ORG_URL, authHandler);

        const core = await connection.getCoreApi();
        console.log("Fetching Projects...");
        const projects = await core.getProjects();

        const projectList = projects.map(p => ({ name: p.name, id: p.id, state: p.state }));
        fs.writeFileSync('projects.json', JSON.stringify(projectList, null, 2));
        console.log("Wrote projects.json");

    } catch (e) {
        console.error("Error:", e.message);
        fs.writeFileSync('projects.json', JSON.stringify({ error: e.message }));
    }
}

run();
