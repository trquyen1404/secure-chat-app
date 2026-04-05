const { z } = require('zod');

// Middleware factory to validate request body
const validate = (schema) => (req, res, next) => {
  try {
    const parsedUrl = req.url; // for logging if needed
    schema.parse(req.body);
    next();
  } catch (err) {
    if (err instanceof z.ZodError) {
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
  memberIds: z.array(z.string().uuid("Invalid user ID format")).optional(),
});

module.exports = {
  validate,
  registerSchema,
  loginSchema,
  createGroupSchema
};
