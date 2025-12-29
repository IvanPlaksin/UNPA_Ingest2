
const http = require('http');
const fs = require('fs');

console.log("Fetching...");
const file = fs.createWriteStream("api/debug_clean.json");
const request = http.get("http://localhost:3000/api/v1/nexus/entity/workitem/136603", function (response) {
    response.pipe(file);
    file.on('finish', function () {
        file.close(() => {
            console.log("Download Done");
            try {
                const raw = fs.readFileSync('api/debug_clean.json', 'utf8');
                const data = JSON.parse(raw);
                console.log('ID:', data.id);
                console.log('PARENT:', data.data.ParentWorkItem ? "YES: " + data.data.ParentWorkItem.id : "NO");
                console.log('RELATIONS COUNT:', data.data.relations ? data.data.relations.length : 0);
                if (data.data.relations) {
                    console.log(JSON.stringify(data.data.relations, null, 2));
                }
            } catch (e) {
                console.error("Parse Error:", e.message);
                console.log("Raw Preview:", fs.readFileSync('api/debug_clean.json', 'utf8').substring(0, 100));
            }
        });
    });
}).on('error', function (err) { // Handle errors
    fs.unlink("api/debug_clean.json");
    console.error("Network Error:", err.message);
});
