const express = require('express');
const router = express.Router();
const tfvcController = require('../controllers/tfvc.controller');


router.get('/tree', tfvcController.getTree);
router.get('/content', tfvcController.getContent);
router.get('/history', tfvcController.getHistory);
router.get('/changesets/:id/changes', tfvcController.getChangesetChanges);
router.get('/testchanges', (req, res) => res.send('TEST CHANGES OK'));
router.get('/diff', tfvcController.getDiff);

module.exports = router;
