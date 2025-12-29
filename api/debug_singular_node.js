
const fetch = require('node-fetch');

async function checkNode(id) {
    console.log(`Checking Work Item ${id}...`);
    try {
        const res = await fetch(`http://localhost:3000/api/v1/nexus/entity/workitem/${id}`);
        if (!res.ok) {
            console.error(`Status: ${res.status} ${res.statusText}`);
            const text = await res.text();
            console.error('Body:', text);
            return;
        }
        const data = await res.json();
        console.log('--- DATA RECEIVED ---');
        console.log(JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('Fetch error:', err);
    }
}

checkNode('136603');
