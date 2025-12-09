require('dotenv').config();
const adoService = require('./src/services/ado.service');

async function run() {
    try {
        await adoService.connectToAdo();
        const id = 137821;
        console.log(`Fetching item ${id}...`);

        const result = await adoService.getWorkItemsUniversal({
            wiql: `SELECT [System.Id] FROM workitems WHERE [System.Id] = ${id}`,
            limit: 1
        });

        if (result.items && result.items.length > 0) {
            const item = result.items[0];
            console.log("--- RELATIONS START ---");
            if (item.relations) {
                item.relations.forEach(r => {
                    console.log(`REL: ${r.rel} | URL: ${r.url}`);
                });
            } else {
                console.log("No relations found.");
            }
            console.log("--- RELATIONS END ---");
        } else {
            console.log("Item not found.");
        }
    } catch (e) {
        console.error(e);
    }
}

run();
