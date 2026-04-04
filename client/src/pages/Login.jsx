import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '../utils/axiosConfig';
import { useAuth } from '../context/AuthContext';
import { KeyRound, Loader2, AlertCircle } from 'lucide-react';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    try {
      const res = await authApi.login({
        username,
        password
      });

      // Context will handle checking IndexedDB and triggering PIN Restore
      login(res.data);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Đăng nhập thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-gray-50 dark:bg-slate-950 transition-colors duration-500">
      <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-purple-600 rounded-full mix-blend-multiply filter blur-[128px] opacity-50 animate-blob"></div>
      <div className="absolute bottom-[-10%] left-[-10%] w-96 h-96 bg-indigo-600 rounded-full mix-blend-multiply filter blur-[128px] opacity-50 animate-blob animation-delay-2000"></div>
      
      <div className="relative z-10 w-full max-w-md bg-white/70 dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10 p-8 rounded-2xl shadow-xl dark:shadow-2xl transition-all duration-300">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-purple-500/30">
            <KeyRound className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-indigo-400">
            Đăng nhập E2E
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-2 transition-colors">Truy cập vào các phiên chat bảo mật</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-sm flex items-start gap-3">
             <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
             <p>{error}</p>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2 transition-colors">Tên người dùng</label>
            <input
              type="text"
              required
              className="w-full px-4 py-3 bg-white dark:bg-slate-900/50 border border-gray-300 dark:border-slate-700/50 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all text-gray-900 dark:text-slate-200 placeholder-gray-400 dark:placeholder-gray-500"
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
              className="w-full px-4 py-3 bg-white dark:bg-slate-900/50 border border-gray-300 dark:border-slate-700/50 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all text-gray-900 dark:text-slate-200 placeholder-gray-400 dark:placeholder-gray-500"
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
                Đang mở khóa...
              </>
            ) : (
              'Đăng nhập'
            )}
          </button>

          <p className="text-center text-slate-500 dark:text-slate-400 text-sm mt-6 transition-colors">
            Chưa có tài khoản?{' '}
            <Link to="/register" className="text-purple-600 dark:text-purple-400 hover:text-purple-500 dark:hover:text-purple-300 font-medium transition-colors">
              Tạo khóa ngay
            </Link>
          </p>
          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-white/10 text-center">
            <button
              type="button"
              onClick={async () => {
                if (window.confirm('CẢNH BÁO: Hành động này sẽ xóa sạch TOÀN BỘ khóa bí mật trên trình duyệt này. Bạn sẽ không thể giải mã tin nhắn cũ nếu không có bản sao lưu. Tiếp tục?')) {
                  localStorage.clear();
                  sessionStorage.clear();
                  const dbs = await window.indexedDB.databases();
                  dbs.forEach(db => window.indexedDB.deleteDatabase(db.name));
                  window.location.reload();
                }
              }}
              className="text-xs text-red-500/60 hover:text-red-500 transition-colors uppercase tracking-wider font-bold"
            >
              Thiết lập lại toàn bộ dữ liệu (Wipe Data)
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
