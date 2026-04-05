const express = require('express');
const { getVapidPublicKey, subscribe } = require('../controllers/pushController');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/vapidPublicKey', auth, getVapidPublicKey);
router.post('/subscribe', auth, subscribe);

module.exports = router;
