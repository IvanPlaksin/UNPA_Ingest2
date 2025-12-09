require('dotenv').config();
const { connectToAdo, searchWorkItems } = require('../src/services/ado.service');

async function find() {
    try {
        await connectToAdo();
        // Search for any item, preferably Active
        const result = await searchWorkItems({}, 1, 1);
        if (result.items && result.items.length > 0) {
            console.log("FOUND_ID:" + result.items[0].id);
        } else {
            console.log("NO_ID_FOUND");
        }
    } catch (e) {
        console.error(e);
    }
}
find();
