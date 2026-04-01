const express = require('express');
const { register, login, refresh, logout } = require('../controllers/authController');
const { validate, registerSchema, loginSchema } = require('../middleware/validation');

const router = express.Router();

router.post('/register', validate(registerSchema), register);
router.post('/login', validate(loginSchema), login);
router.post('/refresh', refresh);
router.post('/logout', logout);

module.exports = router;
