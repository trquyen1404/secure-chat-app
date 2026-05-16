const { User, PreKey } = require('../models');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mailService = require('../services/mailService');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET;
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
    const { 
      username, 
      email,
      password, 
      publicKey, 
      signedPreKey, 
      oneTimePreKeys,
      encryptedPrivateKey, 
      keyBackupSalt, 
      keyBackupIv,
      dhPublicKey,
      studentId,
      teacherId,
      phone
    } = req.body;
    
    console.log('[Register-Trace] Start. Username:', username, 'Email:', email);

    // --- Input Validation ---
    if (!username || username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }

    if (!email || !/^[a-zA-Z0-9._%+-]+@(stu\.)?utt\.edu\.vn$/.test(email)) {
      return res.status(400).json({ error: 'Vui lòng sử dụng Email UTT hợp lệ (@stu.utt.edu.vn hoặc @utt.edu.vn)' });
    }

    const existingUser = await User.findOne({ where: { username } });
    if (existingUser) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const existingEmail = await User.findOne({ where: { email } });
    if (existingEmail) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    
    // Auto-role assignment based on email domain
    const role = email.endsWith('@utt.edu.vn') && !email.includes('@stu.utt.edu.vn') ? 'teacher' : 'student';
    console.log('[Register-Trace] Password hashed. Role assigned:', role);

    // Generate 6-digit verification code
    const verificationToken = Math.floor(100000 + Math.random() * 900000).toString();
    const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Create user and its prekeys in a transaction
    console.log('[Register-Trace] Entering transaction...');
    const user = await User.sequelize.transaction(async (t) => {
      console.log('[Register-Trace] Creating User...');
      const newUser = await User.create({ 
        username, 
        email,
        password: hashedPassword, 
        role,
        publicKey,
        dhPublicKey,
        verificationToken,
        verificationTokenExpires,
        encryptedPrivateKey: encryptedPrivateKey || null,
        keyBackupSalt: keyBackupSalt || null,
        keyBackupIv: keyBackupIv || null,
        studentId: studentId || null,
        teacherId: teacherId || null,
        phone: phone || null
      }, { transaction: t });

      await PreKey.create({
        userId: newUser.id,
        publicKey: signedPreKey.publicKey,
        signature: signedPreKey.signature,
        type: 'signed'
      }, { transaction: t });

      if (Array.isArray(oneTimePreKeys)) {
        const opkData = oneTimePreKeys.map(k => ({
          userId: newUser.id,
          publicKey: k.publicKey,
          type: 'one-time'
        }));
        await PreKey.bulkCreate(opkData, { transaction: t });
      }

      return newUser;
    });

    // Send verification email
    await mailService.sendVerificationCode(email, verificationToken);
    console.log(`[VERIFICATION] Code for ${email}: ${verificationToken}`);

    const token = jwt.sign(
      { userId: user.id, role: user.role, tokenVersion: user.tokenVersion }, 
      JWT_SECRET, 
      { expiresIn: JWT_EXPIRES }
    );
    const refreshToken = jwt.sign(
      { userId: user.id, tokenVersion: user.tokenVersion }, 
      JWT_REFRESH_SECRET, 
      { expiresIn: JWT_REFRESH_EXPIRES }
    );

    setRefreshTokenCookie(res, refreshToken);

    const activeSPK = await PreKey.findOne({ where: { userId: user.id, type: 'signed' }, order: [['createdAt', 'DESC']] });

    res.status(201).json({ 
      user: { 
        id: user.id, username: user.username, email: user.email, role: user.role,
        publicKey: user.publicKey,
        signedPreKey: activeSPK ? activeSPK.publicKey : null,
        encryptedPrivateKey: user.encryptedPrivateKey,
        keyBackupSalt: user.keyBackupSalt,
        keyBackupIv: user.keyBackupIv,
        isVerified: user.isVerified,
        studentId: user.studentId,
        teacherId: user.teacherId,
        phone: user.phone
      }, 
      token 
    });
  } catch (error) {
    console.error('[register] FATAL ERROR:', error);
    res.status(500).json({ error: 'Đăng ký thất bại', details: error.message });
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

    if (user.isBanned) {
      return res.status(403).json({ error: 'Tài khoản của bạn đã bị khóa', reason: user.banReason });
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role, tokenVersion: user.tokenVersion }, 
      JWT_SECRET, 
      { expiresIn: JWT_EXPIRES }
    );
    const refreshToken = jwt.sign(
      { userId: user.id, tokenVersion: user.tokenVersion }, 
      JWT_REFRESH_SECRET, 
      { expiresIn: JWT_REFRESH_EXPIRES }
    );

    setRefreshTokenCookie(res, refreshToken);

    const activeSPK = await PreKey.findOne({ where: { userId: user.id, type: 'signed' }, order: [['createdAt', 'DESC']] });
    const { logActivity } = require('../middleware/logger');
    logActivity('USER_LOGIN', { userId: user.id, username: user.username, ip: req.ip });

    res.json({ 
      user: { 
        id: user.id, username: user.username, email: user.email, role: user.role,
        publicKey: user.publicKey,
        signedPreKey: activeSPK ? activeSPK.publicKey : null,
        encryptedPrivateKey: user.encryptedPrivateKey,
        keyBackupSalt: user.keyBackupSalt,
        keyBackupIv: user.keyBackupIv,
        isVerified: user.isVerified,
        studentId: user.studentId,
        teacherId: user.teacherId,
        phone: user.phone
      }, 
      token 
    });
  } catch (error) {
    console.error('[login] FATAL ERROR:', error);
    res.status(500).json({ error: 'Đăng nhập thất bại', details: error.message });
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

    const newAccessToken = jwt.sign(
      { userId: user.id, role: user.role, tokenVersion: user.tokenVersion }, 
      JWT_SECRET, 
      { expiresIn: JWT_EXPIRES }
    );
    const newRefreshToken = jwt.sign(
      { userId: user.id, tokenVersion: user.tokenVersion }, 
      JWT_REFRESH_SECRET, 
      { expiresIn: JWT_REFRESH_EXPIRES }
    );

    setRefreshTokenCookie(res, newRefreshToken);
    res.json({ 
      token: newAccessToken,
      user: {
        id: user.id, username: user.username, email: user.email, role: user.role,
        publicKey: user.publicKey,
        isVerified: user.isVerified,
        studentId: user.studentId,
        teacherId: user.teacherId,
        phone: user.phone,
        role: user.role
      }
    });
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

exports.revokeAllOtherDevices = async (req, res) => {
  try {
    const user = await User.findByPk(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Increment tokenVersion to invalidate all existing refresh tokens
    await user.increment('tokenVersion');
    await user.reload();

    // Issue new tokens for the CURRENT device so it stays logged in
    const newAccessToken = jwt.sign(
      { userId: user.id, role: user.role, tokenVersion: user.tokenVersion }, 
      JWT_SECRET, 
      { expiresIn: JWT_EXPIRES }
    );
    const newRefreshToken = jwt.sign(
      { userId: user.id, tokenVersion: user.tokenVersion }, 
      JWT_REFRESH_SECRET, 
      { expiresIn: JWT_REFRESH_EXPIRES }
    );

    setRefreshTokenCookie(res, newRefreshToken);

    res.json({ 
      message: 'Đã đăng xuất thành công khỏi tất cả các thiết bị khác.',
      token: newAccessToken 
    });
  } catch (error) {
    console.error('[revokeAllOtherDevices]', error);
    res.status(500).json({ error: 'Failed to revoke devices' });
  }
};
exports.verifyEmail = async (req, res) => {
  try {
    const { code } = req.body;
    const userId = req.userId;

    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.isVerified) return res.json({ message: 'Tài khoản đã được xác thực' });

    if (user.verificationToken !== code) {
      return res.status(400).json({ error: 'Mã xác thực không chính xác' });
    }

    if (new Date() > user.verificationTokenExpires) {
      return res.status(400).json({ error: 'Mã xác thực đã hết hạn' });
    }

    user.isVerified = true;
    user.verificationToken = null;
    user.verificationTokenExpires = null;
    await user.save();

    res.json({ message: 'Xác thực email thành công!', user: { id: user.id, isVerified: true } });
  } catch (error) {
    console.error('[verifyEmail]', error);
    res.status(500).json({ error: 'Xác thực thất bại' });
  }
};

exports.resendVerificationCode = async (req, res) => {
  try {
    const user = await User.findByPk(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.isVerified) return res.status(400).json({ error: 'Tài khoản đã được xác thực' });

    const newCode = Math.floor(100000 + Math.random() * 900000).toString();
    user.verificationToken = newCode;
    user.verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await user.save();

    await mailService.sendVerificationCode(user.email, newCode);
    res.json({ message: 'Mã xác thực mới đã được gửi tới email của bạn' });
  } catch (error) {
    console.error('[resendVerificationCode]', error);
    res.status(500).json({ error: 'Gửi lại mã thất bại' });
  }
};
