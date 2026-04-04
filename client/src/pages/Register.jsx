import React, { useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authApi } from '../utils/axiosConfig';
import { 
  generateX25519KeyPair,
  generateECDSAKeyPair,
  signDataECDSA,
  wrapIdentityBundleWithPIN,
  base64ToArrayBuffer 
} from '../utils/crypto';
import { setKey, getKey } from '../utils/keyStore';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, Loader2, CheckCircle2, XCircle } from 'lucide-react';

// --- Password Validation Rules ---
const PASSWORD_RULES = [
  {
    id: 'minLength',
    label: 'Ít nhất 8 ký tự',
    test: (pw) => pw.length >= 8,
  },
  {
    id: 'hasUppercase',
    label: 'Có ít nhất 1 chữ cái viết HOA (A-Z)',
    test: (pw) => /[A-Z]/.test(pw),
  },
  {
    id: 'hasLowercase',
    label: 'Có ít nhất 1 chữ cái viết thường (a-z)',
    test: (pw) => /[a-z]/.test(pw),
  },
  {
    id: 'hasNumber',
    label: 'Có ít nhất 1 số (0-9)',
    test: (pw) => /[0-9]/.test(pw),
  },
  {
    id: 'noSpaces',
    label: 'Không chứa dấu cách',
    test: (pw) => !/\s/.test(pw),
  },
];

/**
 * Returns strength level: 0-5 based on how many rules pass
 * @param {string} password
 * @returns {{ score: number, label: string, color: string }}
 */
const getPasswordStrength = (password) => {
  if (!password) return { score: 0, label: '', color: '' };
  const score = PASSWORD_RULES.filter((r) => r.test(password)).length;
  if (score <= 2) return { score, label: 'Rất yếu', color: '#ef4444' };
  if (score === 3) return { score, label: 'Yếu', color: '#f97316' };
  if (score === 4) return { score, label: 'Khá', color: '#eab308' };
  return { score, label: 'Mạnh', color: '#22c55e' };
};

const Register = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { login } = useAuth();
  const navigate = useNavigate();

  // Computed rule results
  const ruleResults = useMemo(
    () => PASSWORD_RULES.map((rule) => ({ ...rule, passed: rule.test(password) })),
    [password]
  );
  const allRulesPassed = ruleResults.every((r) => r.passed);
  const strength = useMemo(() => getPasswordStrength(password), [password]);

  const handleRegister = async (e) => {
    e.preventDefault();
    setError(null);

    // Client-side guard: ensure all password rules pass before doing heavy crypto work
    if (!allRulesPassed) {
      setPasswordTouched(true);
      setError('Mật khẩu chưa đáp ứng các yêu cầu bảo mật bên dưới.');
      return;
    }

    if (pin.length < 6) {
      setError('Mã PIN phải có ít nhất 6 ký tự để đảm bảo an toàn');
      return;
    }

    if (loading) return;

    // Check for existing keys to prevent duplicates (Singleton Pattern)
    const hasExistingIdentity = await getKey('local_identity_initialized');
    if (hasExistingIdentity) {
      console.warn('[Registration] Identity already exists on this device. Re-using existing keys if possible, or clear site data to reset.');
      // For now, we allow them to proceed but log it. 
      // In a real app we might redirect to Login or use existing keys.
    }

    setLoading(true);
    try {
      // 1. Generate Identity Keys in RAM (Memory-first)
      console.log('[Registration] Generating new cryptographic bundle...');
      const ikSign = await generateECDSAKeyPair();
      const ikDh = await generateX25519KeyPair();
      const spk = await generateX25519KeyPair();

      // Sign SPK
      const spkSignature = await signDataECDSA(ikSign.privateKey, base64ToArrayBuffer(spk.publicKeyBase64));

      // Generate OPKs
      const opks = [];
      const opksPrivate = [];
      for (let i = 0; i < 20; i++) {
        const key = await generateX25519KeyPair();
        opks.push({ publicKey: key.publicKeyBase64 });
        opksPrivate.push(key);
      }

      // 2. Wrap Identity Keys
      const { wrappedKeyB64, saltB64, ivB64 } = await wrapIdentityBundleWithPIN(ikSign.privateKey, ikDh.privateKey, pin);

      // 3. Register on Server
      const res = await authApi.register({
        username,
        password,
        publicKey: ikSign.publicKeyBase64,
        dhPublicKey: ikDh.publicKeyBase64,
        signedPreKey: {
          publicKey: spk.publicKeyBase64,
          signature: spkSignature
        },
        oneTimePreKeys: opks,
        encryptedPrivateKey: wrappedKeyB64,
        keyBackupSalt: saltB64,
        keyBackupIv: ivB64
      });

      const userId = res.data.user.id;

      // 4. Save to IndexedDB (Only after server success)
      const lowerUsername = username.toLowerCase();
      await setKey(`ik_sign_priv_${lowerUsername}`, ikSign.privateKey);
      await setKey(`ik_dh_priv_${lowerUsername}`, ikDh.privateKey);
      await setKey(`spk_priv_${lowerUsername}`, spk.privateKey);

      for (let i = 0; i < opksPrivate.length; i++) {
        await setKey(`opk_priv_${lowerUsername}_${opks[i].publicKey}`, opksPrivate[i].privateKey);
      }

      // Mark this device as having an initialized identity
      await setKey('local_identity_initialized', true);
      localStorage.setItem('hasIdentity', 'true'); // redundantly sync for easy checks

      console.log('[Registration] Keys successfully persisted to IndexedDB.');
      navigate('/login');
    } catch (err) {
      console.error('[Registration] Error during key generation or upload:', err);
      setError(err.response?.data?.error || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-gray-50 dark:bg-slate-950 transition-colors duration-500">
      {/* Dynamic Background */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-indigo-600 rounded-full mix-blend-multiply filter blur-[128px] opacity-50 animate-blob"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-purple-600 rounded-full mix-blend-multiply filter blur-[128px] opacity-50 animate-blob animation-delay-2000"></div>

      <div className="relative z-10 w-full max-w-md bg-white/70 dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10 p-8 rounded-2xl shadow-xl dark:shadow-2xl transition-all duration-300">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-indigo-500/30">
            <ShieldCheck className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
            Tạo tài khoản An toàn
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-2 transition-colors">
            Tin nhắn của bạn được mã hóa đầu cuối
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-sm flex items-start gap-2">
            <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-6">
          {/* Username */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2 transition-colors">
              Tên người dùng
            </label>
            <input
              id="register-username"
              type="text"
              required
              className="w-full px-4 py-3 bg-white dark:bg-slate-900/50 border border-gray-300 dark:border-slate-700/50 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-gray-900 dark:text-slate-200 placeholder-gray-400 dark:placeholder-gray-500"
              placeholder="Nhập tên người dùng..."
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2 transition-colors">
              Mật khẩu
            </label>
            <input
              id="register-password"
              type="password"
              required
              className={`w-full px-4 py-3 bg-white dark:bg-slate-900/50 border rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-gray-900 dark:text-slate-200 placeholder-gray-400 dark:placeholder-gray-500 ${
                passwordTouched && !allRulesPassed
                  ? 'border-red-500/70 focus:ring-red-500'
                  : passwordTouched && allRulesPassed
                  ? 'border-green-500/70 focus:ring-green-500'
                  : 'border-gray-300 dark:border-slate-700/50'
              }`}
              placeholder="••••••••"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setPasswordTouched(true);
              }}
              onBlur={() => setPasswordTouched(true)}
            />

            {/* Strength Bar */}
            {passwordTouched && password.length > 0 && (
              <div className="mt-2">
                <div className="flex gap-1 mb-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <div
                      key={s}
                      className="h-1 flex-1 rounded-full transition-all duration-300"
                      style={{
                        backgroundColor:
                          s <= strength.score ? strength.color : 'rgba(156,163,175,0.3)',
                      }}
                    />
                  ))}
                </div>
                {strength.label && (
                  <p
                    className="text-xs font-medium transition-colors"
                    style={{ color: strength.color }}
                  >
                    Độ mạnh: {strength.label}
                  </p>
                )}
              </div>
            )}

            {/* Rule Checklist — shown after user touches the field */}
            {passwordTouched && (
              <ul className="mt-3 space-y-1.5">
                {ruleResults.map((rule) => (
                  <li key={rule.id} className="flex items-center gap-2 text-xs">
                    {rule.passed ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    )}
                    <span
                      className={
                        rule.passed
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-500 dark:text-red-400'
                      }
                    >
                      {rule.label}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* PIN */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2 transition-colors">
              Mã PIN khôi phục tin nhắn (Tối thiểu 6 chữ số)
            </label>
            <input
              id="register-pin"
              type="password"
              required
              className="w-full px-4 py-3 bg-white dark:bg-slate-900/50 border border-gray-300 dark:border-slate-700/50 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-gray-900 dark:text-slate-200 tracking-[0.5em] font-mono placeholder-gray-400 dark:placeholder-gray-500"
              placeholder="••••••"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              pattern="\d*"
              maxLength={12}
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 transition-colors">
              Mã PIN này dùng để khôi phục lịch sử chat khi bạn đổi điện thoại/trình duyệt. Máy
              chủ không thể biết mã này.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 px-4 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white rounded-xl font-medium shadow-lg shadow-indigo-500/25 transition-all flex items-center justify-center gap-2 group disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Đang tạo khóa bảo mật...
              </>
            ) : (
              'Đăng ký & Bắt đầu'
            )}
          </button>

          <p className="text-center text-slate-500 dark:text-slate-400 text-sm mt-6 transition-colors">
            Đã có tài khoản?{' '}
            <Link
              to="/login"
              className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 font-medium transition-colors"
            >
              Đăng nhập ngay
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
};

export default Register;
