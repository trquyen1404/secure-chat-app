import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '../utils/axiosConfig';
import { useAuth } from '../context/AuthContext';
import { KeyRound, Loader2, AlertCircle } from 'lucide-react';
import { uttImages } from '../utils/imageConfig';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentBg, setCurrentBg] = useState(0);
  const { login } = useAuth();
  const navigate = useNavigate();

  const backgroundImages = uttImages;

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentBg((prev) => (prev + 1) % backgroundImages.length);
    }, 5000); // Chuyển ảnh mỗi 5 giây
    return () => clearInterval(timer);
  }, []);

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
    <div className="min-h-screen flex items-center justify-center lg:justify-end relative overflow-hidden bg-black transition-colors duration-500">
      {/* Background Slideshow */}
      {backgroundImages.map((img, index) => (
        <div
          key={index}
          className={`absolute inset-0 w-full h-full bg-cover bg-center transition-opacity duration-1000 z-0 ${
            index === currentBg ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ backgroundImage: `url(${img})` }}
        />
      ))}

      {/* Decorative Overlays for Contrast */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-black/40 lg:via-transparent to-black/80 lg:to-[var(--bg-primary)]/95 z-0"></div>
      
      {/* Left Text Content (Desktop only) */}
      <div className="hidden lg:block absolute left-12 xl:left-24 top-1/2 -translate-y-1/2 z-10 max-w-2xl animate-fade-in text-white pointer-events-none">
        <h1 className="text-5xl xl:text-6xl font-black mb-6 drop-shadow-2xl leading-tight">
          Đại học Công nghệ <br/> Giao thông Vận tải
        </h1>
        <p className="text-xl font-medium text-white/95 drop-shadow-lg leading-relaxed border-l-4 border-indigo-500 pl-6 bg-black/20 p-4 rounded-r-2xl backdrop-blur-sm">
          Nền tảng trao đổi thông tin bảo mật tuyệt đối dành riêng cho cán bộ, giảng viên và sinh viên UTT.
        </p>
      </div>

      {/* Login Form Panel */}
      <div className="relative z-10 w-full max-w-md lg:max-w-[460px] lg:mr-16 xl:mr-32 glass p-10 rounded-[32px] premium-shadow border-[var(--glass-border)] animate-fade-in mx-4">
        <div className="flex flex-col items-center mb-10">
          <div className="w-24 h-24 bg-white/80 backdrop-blur-md rounded-full overflow-hidden flex items-center justify-center mb-6 shadow-2xl shadow-indigo-500/20 transform hover:scale-105 transition-all duration-500 border-2 border-white/40">
            <img src="/images/utt/logo.jpg" alt="UTT Logo" className="w-full h-full object-cover" />
          </div>
          <h2 className="text-4xl font-bold tracking-tight text-[var(--text-primary)] mb-2">
            Chào mừng trở lại
          </h2>
          <p className="text-[var(--text-secondary)] font-medium text-center">Bảo mật tối đa, liên lạc không giới hạn</p>
        </div>

        {error && (
          <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-500 text-sm flex items-start gap-3 animate-shake">
             <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
             <p className="font-semibold">{error}</p>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[13px] font-bold text-[var(--text-secondary)] ml-1 uppercase tracking-wider">Tên người dùng</label>
            <input
              type="text"
              required
              className="w-full px-5 py-4 bg-[var(--input-bg)] border border-transparent rounded-2xl focus:border-[var(--primary)]/30 focus:bg-[var(--bg-secondary)] focus:ring-4 focus:ring-[var(--primary)]/10 outline-none transition-all duration-300 text-[var(--text-primary)] font-medium placeholder-[var(--text-secondary)]/50"
              placeholder="Nhập username của bạn..."
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between ml-1">
              <label className="text-[13px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Mật khẩu</label>
              <Link to="/forgot-password" className="text-[13px] font-bold text-[var(--primary)] hover:text-[var(--primary-light)] transition-colors hover:underline">
                Quên mật khẩu?
              </Link>
            </div>
            <input
              type="password"
              required
              className="w-full px-5 py-4 bg-[var(--input-bg)] border border-transparent rounded-2xl focus:border-[var(--primary)]/30 focus:bg-[var(--bg-secondary)] focus:ring-4 focus:ring-[var(--primary)]/10 outline-none transition-all duration-300 text-[var(--text-primary)] font-medium placeholder-[var(--text-secondary)]/50"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 px-6 premium-gradient hover:brightness-110 text-white rounded-2xl font-bold text-lg shadow-xl shadow-indigo-500/30 transition-all duration-300 flex items-center justify-center gap-3 group disabled:opacity-70 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
          >
            {loading ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin" />
                Đang mở khóa...
              </>
            ) : (
              'Đăng nhập ngay'
            )}
          </button>

          <div className="text-center pt-4">
            <p className="text-[var(--text-secondary)] text-sm font-medium">
              Chưa có tài khoản?{' '}
              <Link to="/register" className="text-[var(--primary)] hover:text-[var(--primary-light)] font-bold transition-colors underline-offset-4 hover:underline">
                Tạo khóa mới ngay
              </Link>
            </p>
          </div>

          <div className="mt-10 pt-8 border-t border-[var(--border)] text-center">
            <button
              type="button"
              onClick={async () => {
                if (window.confirm('CẢNH BÁO: Hành động này sẽ xóa sạch TOÀN BỘ khóa bí mật trên trình duyệt này. Tiếp tục?')) {
                  localStorage.clear();
                  sessionStorage.clear();
                  const dbs = await window.indexedDB.databases();
                  dbs.forEach(db => window.indexedDB.deleteDatabase(db.name));
                  window.location.reload();
                }
              }}
              className="text-[10px] text-red-500/40 hover:text-red-500 transition-colors uppercase tracking-[0.2em] font-black"
            >
              System Reset (Wipe All Keys)
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
