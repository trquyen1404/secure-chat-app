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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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

    // Client-side guards
    if (!/^[a-zA-Z0-0._%+-]+@(stu\.)?utt\.edu\.vn$/.test(email)) {
      setError('Vui lòng sử dụng Email UTT hợp lệ (@stu.utt.edu.vn hoặc @utt.edu.vn)');
      return;
    }

    if (!allRulesPassed) {
      setPasswordTouched(true);
      setError('Mật khẩu chưa đáp ứng các yêu cầu bảo mật bên dưới.');
      return;
    }

    if (passphrase.length < 8) {
      setError('Mật khẩu khôi phục phải có ít nhất 8 ký tự để đảm bảo an toàn E2EE.');
      return;
    }

    if (loading) return;

    // Check for existing keys to prevent duplicates (Singleton Pattern)
    const hasExistingIdentity = await getKey('local_identity_initialized');
    if (hasExistingIdentity) {
      console.warn('[Registration] Identity already exists on this device.');
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

      // 2. Wrap Identity Keys (Include SPK for full recovery)
      const { wrappedKeyB64, saltB64, ivB64 } = await wrapIdentityBundleWithPIN(
        ikSign.privateKey, 
        ikDh.privateKey, 
        spk.privateKey,
        passphrase
      );

      // 3. Register on Server
      const res = await authApi.register({
        username,
        email,
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

      // 4. Derive the high-level Master Key (AES-GCM) that lives in RAM
      const salt = base64ToArrayBuffer(saltB64);
      const { pbkdf2Derive } = await import('../utils/crypto');
      const mKey = await pbkdf2Derive(passphrase, new Uint8Array(salt));
      console.log('[Registration] Master Key derived for local encryption.');

      // 5. Save to IndexedDB (Only after server success) - ENCRYPTED with Master Key
      await setKey(`ik_sign_priv_${userId}`, ikSign.privateKey, mKey);
      await setKey(`ik_dh_priv_${userId}`, ikDh.privateKey, mKey);
      await setKey(`spk_priv_${userId}`, spk.privateKey, mKey);

      for (let i = 0; i < opksPrivate.length; i++) {
        await setKey(`opk_priv_${userId}_${opks[i].publicKey}`, opksPrivate[i].privateKey, mKey);
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
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[var(--bg-primary)] transition-colors duration-500">
      {/* Background Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-indigo-500/20 rounded-full blur-[120px] animate-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-purple-500/20 rounded-full blur-[120px] animate-pulse [animation-delay:2s]"></div>

      <div className="relative z-10 w-full max-w-md glass p-10 rounded-[32px] premium-shadow border-[var(--glass-border)] animate-fade-in mx-4 my-10">
        <div className="flex flex-col items-center mb-10">
          <div className="w-20 h-20 premium-gradient rounded-3xl flex items-center justify-center mb-6 shadow-2xl shadow-indigo-500/40 transform hover:-rotate-12 transition-transform duration-500">
            <ShieldCheck className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-4xl font-bold tracking-tight text-[var(--text-primary)] mb-2">
            Tạo khóa mới
          </h2>
          <p className="text-[var(--text-secondary)] font-medium text-center">Bảo mật quân đội, mã hóa đầu cuối</p>
        </div>

        {error && (
          <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-500 text-sm flex items-start gap-3 animate-shake">
            <XCircle className="w-5 h-5 mt-0.5 shrink-0" />
            <p className="font-semibold">{error}</p>
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-6">
          {/* Username */}
          <div className="space-y-2">
            <label className="text-[13px] font-bold text-[var(--text-secondary)] ml-1 uppercase tracking-wider">
              Tên người dùng
            </label>
            <input
              id="register-username"
              type="text"
              required
              className="w-full px-5 py-4 bg-[var(--input-bg)] border border-transparent rounded-2xl focus:border-[var(--primary)]/30 focus:bg-[var(--bg-secondary)] focus:ring-4 focus:ring-[var(--primary)]/10 outline-none transition-all duration-300 text-[var(--text-primary)] font-medium placeholder-[var(--text-secondary)]/50"
              placeholder="Chọn username của bạn..."
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          {/* Email */}
          <div className="space-y-2">
            <label className="text-[13px] font-bold text-[var(--text-secondary)] ml-1 uppercase tracking-wider">
              Email Đại học (UTT)
            </label>
            <input
              id="register-email"
              type="email"
              required
              className="w-full px-5 py-4 bg-[var(--input-bg)] border border-transparent rounded-2xl focus:border-[var(--primary)]/30 focus:bg-[var(--bg-secondary)] focus:ring-4 focus:ring-[var(--primary)]/10 outline-none transition-all duration-300 text-[var(--text-primary)] font-medium placeholder-[var(--text-secondary)]/50"
              placeholder="sinhvien@stu.utt.edu.vn"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {/* Password */}
          <div className="space-y-2">
            <label className="text-[13px] font-bold text-[var(--text-secondary)] ml-1 uppercase tracking-wider">
              Mật khẩu truy cập
            </label>
            <input
              id="register-password"
              type="password"
              required
              className={`w-full px-5 py-4 bg-[var(--input-bg)] border rounded-2xl outline-none transition-all duration-300 text-[var(--text-primary)] font-medium placeholder-[var(--text-secondary)]/50 ${
                passwordTouched && !allRulesPassed
                  ? 'border-red-500/40 focus:ring-red-500/10'
                  : passwordTouched && allRulesPassed
                  ? 'border-green-500/40 focus:ring-green-500/10'
                  : 'border-transparent focus:border-[var(--primary)]/30 focus:ring-4 focus:ring-[var(--primary)]/10'
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
              <div className="mt-4 px-1">
                <div className="flex gap-1.5 mb-2">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <div
                      key={s}
                      className="h-1.5 flex-1 rounded-full transition-all duration-500"
                      style={{
                        backgroundColor:
                          s <= strength.score ? strength.color : 'var(--border)',
                      }}
                    />
                  ))}
                </div>
                {strength.label && (
                  <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: strength.color }}>
                    Độ an toàn: {strength.label}
                  </p>
                )}
              </div>
            )}

            {/* Rule Checklist */}
            {passwordTouched && (
              <ul className="mt-4 grid grid-cols-1 gap-2 px-1">
                {ruleResults.map((rule) => (
                  <li key={rule.id} className="flex items-center gap-2.5 text-xs font-medium">
                    <div className={`shrink-0 w-4 h-4 rounded-full flex items-center justify-center ${rule.passed ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-400'}`}>
                      {rule.passed ? (
                        <CheckCircle2 className="w-3 h-3" />
                      ) : (
                        <XCircle className="w-3 h-3" />
                      )}
                    </div>
                    <span className={rule.passed ? 'text-green-600/80 dark:text-green-400/80' : 'text-red-500/80 dark:text-red-400/80'}>
                      {rule.label}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Passphrase */}
          <div className="space-y-2">
            <label className="text-[13px] font-bold text-[var(--text-secondary)] ml-1 uppercase tracking-wider">
              Khóa khôi phục (Passphrase)
            </label>
            <input
              id="register-passphrase"
              type="password"
              required
              className="w-full px-5 py-4 bg-[var(--input-bg)] border border-transparent rounded-2xl focus:border-[var(--primary)]/30 focus:bg-[var(--bg-secondary)] focus:ring-4 focus:ring-[var(--primary)]/10 outline-none transition-all duration-300 text-[var(--text-primary)] font-medium placeholder-[var(--text-secondary)]/50"
              placeholder="Nhập ít nhất 8 ký tự..."
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              maxLength={64}
            />
            <div className="mt-4 p-4 bg-orange-500/5 border border-orange-500/20 rounded-2xl">
              <p className="text-[11px] leading-relaxed text-orange-600 dark:text-orange-400 font-bold">
                ⚠️ LƯU Ý QUAN TRỌNG: Mật khẩu này dùng để bảo vệ khóa của bạn. Nếu quên, bạn sẽ không thể khôi phục tin nhắn trên thiết bị mới.
              </p>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 px-6 premium-gradient hover:brightness-110 text-white rounded-2xl font-bold text-lg shadow-xl shadow-indigo-500/30 transition-all duration-300 flex items-center justify-center gap-3 group disabled:opacity-70 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
          >
            {loading ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin" />
                Đang tạo bảo mật...
              </>
            ) : (
              'Kích hoạt bảo mật ngay'
            )}
          </button>

          <div className="text-center pt-4">
            <p className="text-[var(--text-secondary)] text-sm font-medium">
              Đã có tài khoản?{' '}
              <Link to="/login" className="text-[var(--primary)] hover:text-[var(--primary-light)] font-bold transition-colors underline-offset-4 hover:underline">
                Đăng nhập ngay
              </Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Register;
