const express = require('express');
const router = express.Router();
const resourceController = require('../controllers/resourceController');
const auth = require('../middleware/auth');

router.post('/', auth, resourceController.addResource);
router.get('/groups/:groupId', auth, resourceController.getGroupResources);
router.delete('/:id', auth, resourceController.deleteResource);
router.patch('/:id/pin', auth, resourceController.togglePin);

module.exports = router;
