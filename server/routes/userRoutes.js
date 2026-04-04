const express = require('express');
const { getUsers, getPreKeyBundle, uploadPreKeys } = require('../controllers/userController');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/', auth, getUsers);
router.get('/:userId/prekey-bundle', auth, getPreKeyBundle);
router.post('/prekeys', auth, uploadPreKeys);

module.exports = router;
