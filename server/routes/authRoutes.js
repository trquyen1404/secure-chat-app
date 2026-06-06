const express = require('express');
const { register, login, refresh, logout, revokeAllOtherDevices, verifyEmail, resendVerificationCode } = require('../controllers/authController');
const auth = require('../middleware/auth');
const { validate, registerSchema, loginSchema } = require('../middleware/validation');
const { resendCodeLimiter } = require('../security/protector');

const router = express.Router();

router.post('/register', validate(registerSchema), register);
router.post('/login', validate(loginSchema), login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.post('/revoke-all', auth, revokeAllOtherDevices);
router.post('/verify-email', auth, verifyEmail);
router.post('/resend-code', auth, resendCodeLimiter, resendVerificationCode);

module.exports = router;
