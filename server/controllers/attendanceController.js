const { AttendanceSession, AttendanceRecord, User, Group } = require('../models');
const crypto = require('crypto');

exports.createSession = async (req, res) => {
  try {
    const { groupId, title, durationMinutes } = req.body;
    const creatorId = req.userId;

    const expiresAt = new Date(Date.now() + durationMinutes * 60000);

    // Create a unique session data string to be signed by students
    const sessionData = crypto.randomBytes(32).toString('hex');

    const session = await AttendanceSession.create({
      groupId,
      creatorId,
      title,
      expiresAt,
      sessionData
    });

    res.status(201).json(session);
  } catch (error) {
    console.error('Create attendance session error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.submitAttendance = async (req, res) => {
  try {
    const { sessionId, signature, deviceInfo } = req.body;
    const userId = req.userId;

    const session = await AttendanceSession.findByPk(sessionId);
    if (!session || !session.isActive || new Date() > session.expiresAt) {
      return res.status(400).json({ message: 'Attendance session is closed or expired' });
    }

    // Verify digital signature
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // The student signs: sessionId:sessionData:userId
    const dataToVerify = `${sessionId}:${session.sessionData}:${userId}`;
    const publicKeyBase64 = user.publicKey; // P-256 Public Key (Raw)

    try {
      // Web Crypto signs in IEEE-P1363 (raw R|S) format for ECDSA
      // Node crypto verify can handle this if we specify dsaEncoding
      // [Robustness] Handle both SPKI (new) and Raw (legacy) public key formats
      const keyBuffer = Buffer.from(publicKeyBase64, 'base64');
      const isSpki = keyBuffer.length > 80; // SPKI is ~91 bytes, Raw is 65 bytes
      
      const isValid = crypto.verify(
        'sha256',
        Buffer.from(dataToVerify),
        {
          key: crypto.createPublicKey({
            key: keyBuffer,
            format: isSpki ? 'der' : 'raw',
            type: isSpki ? 'spki' : 'pkcs8', // 'pkcs8' works for raw keys in some Node versions, or just use key: keyBuffer if raw
            ...(isSpki ? {} : { key: { name: 'ecdsa', namedCurve: 'P-256' } }) // Handle raw
          }),
          dsaEncoding: 'ieee-p1363'
        },
        Buffer.from(signature, 'base64')
      );

      if (!isValid) {
        return res.status(401).json({ message: 'Digital signature verification failed' });
      }

      const record = await AttendanceRecord.create({
        sessionId,
        userId,
        signature,
        deviceInfo
      });

      res.status(201).json(record);
    } catch (verifyError) {
      console.error('Signature verification error:', verifyError);
      return res.status(401).json({ message: 'Invalid signature format or verification error' });
    }
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ message: 'You have already checked in for this session' });
    }
    console.error('Submit attendance error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getSessions = async (req, res) => {
  try {
    const { groupId } = req.params;
    const sessions = await AttendanceSession.findAll({
      where: { groupId },
      include: [{ model: AttendanceRecord, as: 'Records', include: [{ model: User, attributes: ['id', 'username', 'displayName'] }] }],
      order: [['createdAt', 'DESC']]
    });
    res.json(sessions);
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
