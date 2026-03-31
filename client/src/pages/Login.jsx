import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { KeyRound, Loader2, AlertCircle } from 'lucide-react';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [warning, setWarning] = useState(null);
  const { login, setPrivateKey } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setWarning(null);
    
    try {
      const res = await axios.post('/api/auth/login', {
        username,
        password
      });

      // Check if Private Key exists in this browser for this specific user
      const storedPk = localStorage.getItem(`privateKey_${res.data.user.id}`);
      if (!storedPk) {
        setWarning('Cảnh báo: Không tìm thấy Khóa Bảo Mật trên trình duyệt này. Bạn sẽ không thể đọc được tin nhắn cũ! Nếu tiếp tục, bạn có thể tạo lại khóa mới ở bước sau, nhưng lịch sử chat sẽ bị mất.');
      } else {
        setPrivateKey(storedPk);
        login(res.data);
        navigate('/');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Đăng nhập thất bại');
    } finally {
      setLoading(false);
    }
  };

  const forceLoginWithoutKey = async () => {
    // Login even if private key is missing. We won't have a key for decryption, so old messages will appear garbled.
    const res = await axios.post('/api/auth/login', { username, password });
    // No private key stored, so we clear any existing one.
    setPrivateKey(null);
    login(res.data);
    navigate('/');
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-slate-950">
      <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-purple-600 rounded-full mix-blend-multiply filter blur-[128px] opacity-50 animate-blob"></div>
      <div className="absolute bottom-[-10%] left-[-10%] w-96 h-96 bg-indigo-600 rounded-full mix-blend-multiply filter blur-[128px] opacity-50 animate-blob animation-delay-2000"></div>
      
      <div className="relative z-10 w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-2xl shadow-2xl">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-purple-500/30">
            <KeyRound className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-indigo-400">
            Đăng nhập E2E
          </h2>
          <p className="text-slate-400 text-sm mt-2">Truy cập vào các phiên chat bảo mật</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-sm flex items-start gap-3">
             <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
             <p>{error}</p>
          </div>
        )}

        {warning ? (
          <div className="mb-6 space-y-4">
            <div className="p-4 bg-amber-500/10 border border-amber-500/50 rounded-lg text-amber-400 text-sm">
              {warning}
            </div>
            <button 
                onClick={forceLoginWithoutKey}
                className="w-full py-3.5 px-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-all font-medium border border-slate-600"
            >
                Vẫn tiếp tục đăng nhập
            </button>
          </div>
        ) : (
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Tên người dùng</label>
              <input
                type="text"
                required
                className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700/50 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all text-slate-200"
                placeholder="Nhập tên người dùng..."
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Mật khẩu</label>
              <input
                type="password"
                required
                className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700/50 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all text-slate-200"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-white rounded-xl font-medium shadow-lg shadow-purple-500/25 transition-all flex items-center justify-center gap-2 group disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Đang bẻ khóa...
                </>
              ) : (
                'Đăng nhập'
              )}
            </button>

            <p className="text-center text-slate-400 text-sm mt-6">
              Chưa có tài khoản?{' '}
              <Link to="/register" className="text-purple-400 hover:text-purple-300 font-medium transition-colors">
                Tạo khóa ngay
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
};

export default Login;
