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

// Schemas
const registerSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters").max(50, "Username must be at most 50 characters"),
  password: z.string().min(8, "Password must be at least 8 characters").regex(/[A-Z]/, "Password must contain at least one uppercase letter").regex(/[0-9]/, "Password must contain at least one number"),
  publicKey: z.string().startsWith('-----BEGIN PUBLIC KEY-----', "Invalid public key format").endsWith('-----END PUBLIC KEY-----', "Invalid public key format"),
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
