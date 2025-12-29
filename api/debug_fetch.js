const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function run() {
    try {
        console.log("Fetching...");
        const res = await axios.get("http://localhost:3000/api/v1/nexus/entity/workitem/137837");
        console.log("Status:", res.status);
        fs.writeFileSync(path.join(__dirname, 'debug_response_137837_v2.json'), JSON.stringify(res.data, null, 2));
        console.log("Written to debug_response_137837_v2.json");
    } catch (e) {
        console.error("Error:", e.message);
        if (e.response) console.log(e.response.data);
    }
}
run();
