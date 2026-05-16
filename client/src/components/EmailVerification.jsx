import React, { useState, useEffect } from 'react';
import { Mail, ArrowRight, RefreshCw, LogOut, CheckCircle, ShieldAlert } from 'lucide-react';
import api from '../utils/axiosConfig';
import { useAuth } from '../context/AuthContext';

const EmailVerification = () => {
  const { user, logout, updateUser } = useAuth();
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [timer, setTimer] = useState(0);

  useEffect(() => {
    let interval;
    if (timer > 0) {
      interval = setInterval(() => setTimer(t => t - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [timer]);

  const handleChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    const newCode = [...code];
    newCode[index] = value.slice(-1);
    setCode(newCode);

    // Auto-focus next input
    if (value && index < 5) {
      document.getElementById(`code-${index + 1}`).focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      document.getElementById(`code-${index - 1}`).focus();
    }
  };

  const handleVerify = async () => {
    const fullCode = code.join('');
    if (fullCode.length !== 6) return setError('Vui lòng nhập đủ 6 chữ số');

    setLoading(true);
    setError('');
    try {
      const res = await api.post('/api/auth/verify-email', { code: fullCode });
      updateUser({ ...user, isVerified: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Xác thực thất bại. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (timer > 0) return;
    setResending(true);
    setError('');
    try {
      await api.post('/api/auth/resend-code');
      setTimer(60);
      alert('Mã xác thực mới đã được gửi tới email của bạn.');
    } catch (err) {
      setError(err.response?.data?.error || 'Gửi lại mã thất bại.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[var(--bg-primary)] z-[999] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[var(--bg-secondary)] rounded-3xl p-8 shadow-2xl border border-[var(--border)] animate-in fade-in zoom-in duration-300">
        <div className="flex flex-col items-center text-center">
          <div className="w-20 h-20 bg-indigo-500/10 rounded-3xl flex items-center justify-center mb-6">
            <Mail className="w-10 h-10 text-indigo-500" />
          </div>
          
          <h2 className="text-2xl font-black text-[var(--text-primary)] mb-2">Xác thực Email UTT</h2>
          <p className="text-[var(--text-secondary)] text-sm mb-8">
            Chúng tôi đã gửi mã xác nhận 6 chữ số tới:<br/>
            <strong className="text-indigo-500">{user?.email}</strong>
          </p>

          {error && (
            <div className="w-full p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2 mb-6 animate-shake">
              <ShieldAlert className="w-4 h-4 text-red-500 shrink-0" />
              <p className="text-xs text-red-500 font-bold">{error}</p>
            </div>
          )}

          <div className="flex gap-2 mb-8">
            {code.map((digit, idx) => (
              <input
                key={idx}
                id={`code-${idx}`}
                type="text"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                className="w-12 h-14 bg-[var(--input-bg)] border-2 border-[var(--border)] rounded-xl text-center text-xl font-black text-[var(--text-primary)] focus:border-indigo-500 outline-none transition-all"
              />
            ))}
          </div>

          <button
            onClick={handleVerify}
            disabled={loading || code.some(d => !d)}
            className="w-full py-4 bg-indigo-500 text-white rounded-2xl font-black text-lg hover:brightness-110 shadow-lg shadow-indigo-500/30 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : 'Xác thực tài khoản'}
          </button>

          <div className="mt-8 space-y-4 w-full">
            <button
              onClick={handleResend}
              disabled={timer > 0 || resending}
              className="w-full flex items-center justify-center gap-2 text-sm font-bold text-[var(--text-secondary)] hover:text-indigo-500 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${resending ? 'animate-spin' : ''}`} />
              {timer > 0 ? `Gửi lại mã sau ${timer}s` : 'Bạn chưa nhận được mã? Gửi lại'}
            </button>

            <div className="h-px bg-[var(--border)] w-full"></div>

            <button
              onClick={logout}
              className="w-full flex items-center justify-center gap-2 text-sm font-bold text-red-500 hover:brightness-125 transition-all"
            >
              <LogOut className="w-4 h-4" />
              Đăng xuất và sử dụng tài khoản khác
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmailVerification;
