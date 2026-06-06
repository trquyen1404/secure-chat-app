const { z } = require('zod');

// Middleware factory to validate request body
const validate = (schema) => (req, res, next) => {
  try {
    const parsedUrl = req.url; // for logging if needed
    schema.parse(req.body);
    next();
  } catch (err) {
    if (err instanceof z.ZodError) {
      console.error(`[Validation-Error] Path: ${req.originalUrl || req.url}, Errors:`, JSON.stringify(err.issues, null, 2));
      return res.status(400).json({
        error: 'Validation Error',
        details: err.issues.map(e => ({ path: e.path.join('.'), message: e.message }))
      });
    }
    next(err);
  }
};

// X25519/Ed25519 base64 key: typically 44 chars for 32-byte raw key
const base64Key = z.string().min(20, 'Key too short').max(512, 'Key too large');

const registerSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').max(50),
  email: z.string().email('Invalid email format').regex(/@(st\.)?utt\.edu\.vn$/, 'Must be a UTT university email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  publicKey: base64Key,                     // ECDSA Identity Key (base64 SPKI)
  dhPublicKey: base64Key,                   // X25519 Identity DH Key (base64 Raw)
  signedPreKey: z.object({
    publicKey: base64Key,                   // X25519 SPK public key (base64)
    signature: z.string().min(10),          // Ed25519 signature (base64)
  }),
  oneTimePreKeys: z.array(z.object({
    publicKey: base64Key,
  })).optional(),
  encryptedPrivateKey: z.string().optional(),
  keyBackupSalt: z.string().optional(),
  keyBackupIv: z.string().optional(),
});

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

const createGroupSchema = z.object({
  name: z.string().min(1, "Group name is required").max(100, "Group name must be at most 100 characters"),
  avatarUrl: z.string().url("Avatar URL must be a valid URL").optional().nullable(),
  memberIds: z.array(z.string().uuid("Invalid user ID format")).max(400, "Nhóm tối đa 400 thành viên").optional(),
});

const uploadOpksSchema = z.object({
  oneTimePreKeys: z.array(z.object({
    publicKey: base64Key,
  })).max(100, 'Maximum 100 One-Time PreKeys allowed')
});

const uploadPreKeysSchema = z.object({
  signedPreKey: z.object({
    publicKey: base64Key,
    signature: z.string().min(10),
  }),
  oneTimePreKeys: z.array(z.object({
    publicKey: base64Key,
  })).max(100, 'Maximum 100 One-Time PreKeys allowed').optional()
});

const createSessionSchema = z.object({
  groupId: z.string().uuid("Invalid group ID format"),
  title: z.string().min(1, "Title is required").max(200, "Title must be at most 200 characters"),
  durationMinutes: z.coerce.number().int("Duration must be an integer").min(1, "Duration must be at least 1 minute").max(1440, "Duration must be at most 1440 minutes")
});

module.exports = {
  validate,
  registerSchema,
  loginSchema,
  createGroupSchema,
  uploadOpksSchema,
  uploadPreKeysSchema,
  createSessionSchema
};
