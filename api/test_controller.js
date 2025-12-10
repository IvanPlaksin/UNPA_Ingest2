
console.log("Start Controller Debug");
try {
    const kc = require('./src/controllers/knowledge.controller');
    console.log("Controller Loaded!");
} catch (e) {
    console.error("CRASH LOADING CONTROLLER:");
    console.error(e);
}
