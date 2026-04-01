import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authApi } from '../utils/axiosConfig';
import { generateRSAKeyPair, wrapPrivateKeyWithPIN } from '../utils/crypto';
import { saveKey } from '../utils/keyStore';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, Loader2 } from 'lucide-react';

const Register = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (pin.length < 6) {
        throw new Error('Mã PIN phải có ít nhất 6 ký tự để đảm bảo an toàn');
      }

      // 1. Generate RSA-4096 key pair via Web Crypto API (temporarily extractable)
      const { publicKeyPem, privateKey } = await generateRSAKeyPair();

      // 2. Wrap the private key with the user's PIN
      const {
        encryptedPrivateKeyB64,
        keyBackupSaltB64,
        keyBackupIvB64,
        finalNonExtractablePrivateKey
      } = await wrapPrivateKeyWithPIN(privateKey, pin);

      // 3. Send the public key and the wrapped backup data to the server
      const res = await authApi.register({
        username,
        password,
        publicKey: publicKeyPem,
        encryptedPrivateKey: encryptedPrivateKeyB64,
        keyBackupSalt: keyBackupSaltB64,
        keyBackupIv: keyBackupIvB64
      });

      // 4. Store the strictly NON-EXTRACTABLE private key in IndexedDB
      await saveKey(`privateKey_${res.data.user.id}`, finalNonExtractablePrivateKey);

      login(res.data);
      navigate('/');
      const resData = err.response?.data;
      if (resData?.details && Array.isArray(resData.details)) {
        setError(resData.details.map(d => d.message).join(' | '));
      } else {
        setError(resData?.error || err.message || 'Đăng ký thất bại');
      }
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
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-2 transition-colors">Tin nhắn của bạn được mã hóa đầu cuối</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2 transition-colors">Tên người dùng</label>
            <input
              type="text"
              required
              className="w-full px-4 py-3 bg-white dark:bg-slate-900/50 border border-gray-300 dark:border-slate-700/50 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-gray-900 dark:text-slate-200 placeholder-gray-400 dark:placeholder-gray-500"
              placeholder="Nhập tên người dùng..."
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2 transition-colors">Mật khẩu</label>
            <input
              type="password"
              required
              className="w-full px-4 py-3 bg-white dark:bg-slate-900/50 border border-gray-300 dark:border-slate-700/50 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-gray-900 dark:text-slate-200 placeholder-gray-400 dark:placeholder-gray-500"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2 transition-colors">Mã PIN khôi phục tin nhắn (Tối thiểu 6 chữ số)</label>
            <input
              type="password"
              required
              className="w-full px-4 py-3 bg-white dark:bg-slate-900/50 border border-gray-300 dark:border-slate-700/50 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-gray-900 dark:text-slate-200 tracking-[0.5em] font-mono placeholder-gray-400 dark:placeholder-gray-500"
              placeholder="••••••"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              pattern="\d*"
              maxLength={12}
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 transition-colors">Mã PIN này dùng để khôi phục lịch sử chat khi bạn đổi điện thoại/trình duyệt. Máy chủ không thể biết mã này.</p>
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
            <Link to="/login" className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 font-medium transition-colors">
              Đăng nhập ngay
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
};

export default Register;
