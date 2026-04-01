const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createPublicKey } = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET; // Guaranteed set by server.js startup check
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '15m'; // Short-lived Access Token
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || JWT_SECRET + '_refresh';
const JWT_REFRESH_EXPIRES = '7d';

const setRefreshTokenCookie = (res, token) => {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });
};

exports.register = async (req, res) => {
  try {
    const { username, password, publicKey, encryptedPrivateKey, keyBackupSalt, keyBackupIv } = req.body;

    // --- Input Validation ---
    if (!username || typeof username !== 'string' || username.length < 3 || username.length > 50) {
      return res.status(400).json({ error: 'Username phải có từ 3–30 ký tự' });
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Mật khẩu phải có ít nhất 8 ký tự' });
    }
    if (!publicKey || typeof publicKey !== 'string') {
      return res.status(400).json({ error: 'Public key is required' });
    }

    // --- Validate RSA Public Key format ---
    try {
      createPublicKey({ key: publicKey, format: 'pem', type: 'spki' });
    } catch {
      return res.status(400).json({ error: 'Invalid public key format' });
    }

    const existingUser = await User.findOne({ where: { username } });
    if (existingUser) {
      return res.status(400).json({ error: 'Username đã tồn tại' });
    }

    const hashedPassword = await bcrypt.hash(password, 12); // Increased cost factor

    const user = await User.create({ 
      username, 
      password: hashedPassword, 
      publicKey,
      encryptedPrivateKey: encryptedPrivateKey || null,
      keyBackupSalt: keyBackupSalt || null,
      keyBackupIv: keyBackupIv || null
    });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    const refreshToken = jwt.sign(
      { userId: user.id, tokenVersion: user.tokenVersion }, 
      JWT_REFRESH_SECRET, 
      { expiresIn: JWT_REFRESH_EXPIRES }
    );

    setRefreshTokenCookie(res, refreshToken);

    res.status(201).json({ 
      user: { 
        id: user.id, username: user.username, publicKey: user.publicKey,
        encryptedPrivateKey: user.encryptedPrivateKey,
        keyBackupSalt: user.keyBackupSalt,
        keyBackupIv: user.keyBackupIv
      }, 
      token 
    });
  } catch (error) {
    console.error('[register]', error);
    res.status(500).json({ error: 'Đăng ký thất bại' });
  }
};

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username và mật khẩu không được để trống' });
    }

    const user = await User.findOne({ where: { username } });
    // Always run bcrypt.compare even if user not found to prevent timing attacks
    const dummyHash = '$2b$12$invalidhashfortimingattackprevention000000000000000000';
    const isMatch = user ? await bcrypt.compare(password, user.password) : await bcrypt.compare(password, dummyHash);

    if (!user || !isMatch) {
      return res.status(401).json({ error: 'Thông tin đăng nhập không chính xác' });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    const refreshToken = jwt.sign(
      { userId: user.id, tokenVersion: user.tokenVersion }, 
      JWT_REFRESH_SECRET, 
      { expiresIn: JWT_REFRESH_EXPIRES }
    );

    setRefreshTokenCookie(res, refreshToken);

    res.json({ 
      user: { 
        id: user.id, username: user.username, publicKey: user.publicKey,
        encryptedPrivateKey: user.encryptedPrivateKey,
        keyBackupSalt: user.keyBackupSalt,
        keyBackupIv: user.keyBackupIv
      }, 
      token 
    });
  } catch (error) {
    console.error('[login]', error);
    res.status(500).json({ error: 'Đăng nhập thất bại' });
  }
};

exports.refresh = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) return res.status(401).json({ error: 'Không tìm thấy Refresh Token' });

    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    const user = await User.findByPk(decoded.userId);

    if (!user || user.tokenVersion !== decoded.tokenVersion) {
      return res.status(401).json({ error: 'Refresh Token không hợp lệ hoặc đã bị thu hồi' });
    }

    const newAccessToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    const newRefreshToken = jwt.sign(
      { userId: user.id, tokenVersion: user.tokenVersion }, 
      JWT_REFRESH_SECRET, 
      { expiresIn: JWT_REFRESH_EXPIRES }
    );

    setRefreshTokenCookie(res, newRefreshToken);
    res.json({ token: newAccessToken });
  } catch (err) {
    res.status(401).json({ error: 'Refresh Token hết hạn hoặc không hợp lệ' });
  }
};

exports.logout = async (req, res) => {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });
  // Optional: await User.increment('tokenVersion', { where: { id: req.userId }}); if we want global logout
  res.json({ message: 'Đăng xuất thành công' });
};
