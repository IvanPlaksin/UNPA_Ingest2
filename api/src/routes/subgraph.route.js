/**
 * SubGraph Routes — REST API for subgraph consolidation operations.
 */

const express = require('express');
const router = express.Router();
const controller = require('../controllers/subgraph.controller');

router.post('/analyze', controller.analyze);
router.post('/segment', controller.segment);
router.post('/extract', controller.extract);
router.post('/consolidate', controller.consolidate);
router.post('/validate', controller.validate);
router.post('/rollback', controller.rollback);

router.get('/list', controller.list);
router.get('/checkpoints', controller.listCheckpoints);
router.get('/:id', controller.getById);
router.get('/:id/expand', controller.expand);

module.exports = router;
