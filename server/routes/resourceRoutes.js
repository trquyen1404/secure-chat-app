const express = require('express');
const router = express.Router();
const resourceController = require('../controllers/resourceController');
const auth = require('../middleware/auth');
const requireGroupMembership = require('../middleware/groupMembership');

router.post('/', auth, requireGroupMembership, resourceController.addResource);
router.get('/groups/:groupId', auth, requireGroupMembership, resourceController.getGroupResources);
router.delete('/:id', auth, resourceController.deleteResource);
router.patch('/:id/pin', auth, resourceController.togglePin);

module.exports = router;
