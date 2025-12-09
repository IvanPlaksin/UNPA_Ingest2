
require('dotenv').config({ path: '.env' });
const tfvcService = require('../services/tfvc.service');
if (typeof tfvcService.getTfvcLabels === 'function') {
    console.log("YES_EXPORTED");
} else {
    console.log("NO_MISSING");
    console.log("Keys:", Object.keys(tfvcService));
}
process.exit(0);
