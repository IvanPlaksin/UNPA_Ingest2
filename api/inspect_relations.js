
const fs = require('fs');

try {
    // Try reading as UTF-8 first
    let raw = '';
    try {
        raw = fs.readFileSync('api/debug_136603.json', 'utf8');
        JSON.parse(raw); // test parse
    } catch {
        // If fail, try utf16le just in case
        raw = fs.readFileSync('api/debug_136603.json', 'utf16le');
    }

    const data = JSON.parse(raw);
    console.log('ID:', data.id);
    console.log('PARENT:', JSON.stringify(data.data.ParentWorkItem, null, 2));
    console.log('RELATIONS COUNT:', data.data.relations ? data.data.relations.length : 0);
    console.log('RELATIONS:', JSON.stringify(data.data.relations, null, 2));
} catch (e) {
    console.error('Error:', e.message);
}
