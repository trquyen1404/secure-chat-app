import React from 'react';
import { 
  User, Shield, Palette, Bell, HelpCircle, ChevronRight, 
  LogOut, Smartphone, Moon, Sun, Lock, Key, Eye, Languages,
  BookOpen, Info, MessageSquare, ShieldCheck
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const SettingsView = ({ onOpenProfile }) => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const sections = [
    {
      title: "Tài khoản & Hồ sơ",
      items: [
        { 
          icon: <User className="w-5 h-5 text-indigo-500" />, 
          label: "Thông tin cá nhân", 
          desc: "Tên, Bio, MSSV, SĐT", 
          action: onOpenProfile 
        },
        { 
          icon: <Lock className="w-5 h-5 text-red-500" />, 
          label: "Mật khẩu & Bảo mật", 
          desc: "Đổi mật khẩu, 2FA", 
          action: () => alert("Tính năng đang phát triển") 
        },
      ]
    },
    {
      title: "Giao diện & Tiện ích",
      items: [
        { 
          icon: theme === 'dark' ? <Sun className="w-5 h-5 text-orange-500" /> : <Moon className="w-5 h-5 text-slate-500" />, 
          label: "Chế độ tối", 
          desc: theme === 'dark' ? "Đang bật" : "Đang tắt", 
          toggle: true,
          action: toggleTheme
        },
        { 
          icon: <Palette className="w-5 h-5 text-pink-500" />, 
          label: "Giao diện UTT", 
          desc: "Màu sắc, Hình nền chat", 
          action: () => alert("Tính năng đang phát triển") 
        },
      ]
    },
    {
      title: "Tin nhắn & Quyền riêng tư",
      items: [
        { 
          icon: <ShieldCheck className="w-5 h-5 text-green-500" />, 
          label: "Mã hóa đầu cuối", 
          desc: "Quản lý khóa thiết bị", 
          action: () => alert("Tính năng đang phát triển") 
        },
        { 
          icon: <Lock className="w-5 h-5 text-indigo-500" />, 
          label: "Khóa ứng dụng (PIN)", 
          desc: localStorage.getItem('app_pin') ? "Đang bật" : "Đang tắt", 
          action: () => {
            if (localStorage.getItem('app_pin')) {
              if (window.confirm('Bạn có muốn gỡ bỏ mã PIN bảo mật?')) {
                localStorage.removeItem('app_pin');
                window.location.reload();
              }
            } else {
              window.location.reload(); // Will trigger AppLock setup
            }
          }
        },
        { 
          icon: <Bell className="w-5 h-5 text-blue-500" />, 
          label: "Thông báo", 
          desc: "Âm thanh, Rung", 
          action: () => alert("Tính năng đang phát triển") 
        },
      ]
    },
    {
      title: "Hỗ trợ & Bảo mật nâng cao",
      items: [
        { 
          icon: <Shield className="w-5 h-5 text-purple-500" />, 
          label: "Nhật ký bảo mật", 
          desc: "Xem lịch sử đăng nhập thiết bị", 
          action: () => alert("Lịch sử đăng nhập: \n- Windows 11 (Vị trí: Hà Nội) - Đang hoạt động\n- iPhone 15 Pro (Vị trí: Hà Nội) - 2 giờ trước") 
        },
        { 
          icon: <HelpCircle className="w-5 h-5 text-purple-500" />, 
          label: "Trợ giúp & Phản hồi", 
          desc: "Báo lỗi, Góp ý", 
          action: () => window.open('https://utt.edu.vn', '_blank') 
        },
        { 
          icon: <Info className="w-5 h-5 text-zinc-500" />, 
          label: "Về UTT Super App", 
          desc: "Phiên bản 2.0.4-Beta", 
          action: () => alert("UTT Super App - Hệ sinh thái giao tiếp sinh viên") 
        },
      ]
    }
  ];

  return (
    <div className="flex flex-col h-full bg-transparent w-full">
      {/* Header */}
      <div className="px-8 pt-8 pb-6 border-b border-[var(--border)]">
        <h1 className="text-2xl font-black tracking-tighter text-[var(--text-primary)] mb-6 uppercase">Cài đặt</h1>
        
        {/* Quick User Card */}
        <div 
          onClick={onOpenProfile}
          className="flex items-center gap-4 p-4 bg-[var(--hover)] rounded-3xl cursor-pointer hover:scale-[1.02] transition-all border border-[var(--border)]"
        >
          <div className="w-14 h-14 rounded-2xl overflow-hidden border-2 border-indigo-500/20">
            <img 
              src={user?.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.username}`} 
              alt="Avatar"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[var(--text-primary)] truncate">{user?.displayName || user?.username}</p>
            <p className="text-[11px] text-[var(--text-secondary)] truncate">@{user?.username}</p>
          </div>
          <ChevronRight className="w-5 h-5 text-[var(--text-secondary)]" />
        </div>
      </div>

      {/* Settings List */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6 no-scrollbar">
        {sections.map((section, idx) => ( section.title &&
          <div key={idx} className="space-y-2">
            <h3 className="text-[11px] font-black text-[var(--text-secondary)] uppercase tracking-[0.2em] ml-2">
              {section.title}
            </h3>
            <div className="bg-[var(--bg-primary)]/30 rounded-3xl border border-[var(--border)] overflow-hidden">
              {section.items.map((item, iIdx) => (
                <button
                  key={iIdx}
                  onClick={item.action}
                  className={`w-full flex items-center justify-between p-4 hover:bg-[var(--hover)] transition-all ${
                    iIdx !== section.items.length - 1 ? 'border-b border-[var(--border)]' : ''
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-[var(--bg-secondary)] flex items-center justify-center border border-[var(--border)] shadow-sm">
                      {item.icon}
                    </div>
                    <div className="text-left">
                      <p className="text-[14px] font-bold text-[var(--text-primary)]">{item.label}</p>
                      <p className="text-[11px] text-[var(--text-secondary)]">{item.desc}</p>
                    </div>
                  </div>
                  {item.toggle ? (
                    <div className={`w-10 h-5 rounded-full relative transition-colors ${theme === 'dark' ? 'bg-indigo-500' : 'bg-zinc-300'}`}>
                      <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${theme === 'dark' ? 'left-6' : 'left-1'}`} />
                    </div>
                  ) : (
                    <ChevronRight className="w-4 h-4 text-[var(--text-secondary)] opacity-50" />
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* Danger Zone */}
        <div className="pt-4 pb-8">
          <button 
            onClick={logout}
            className="w-full p-4 flex items-center gap-4 text-red-500 bg-red-500/5 hover:bg-red-500/10 rounded-3xl border border-red-500/10 transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
              <LogOut className="w-5 h-5" />
            </div>
            <div className="text-left">
              <p className="text-[14px] font-bold">Đăng xuất</p>
              <p className="text-[11px] opacity-70">Rời khỏi phiên làm việc này</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsView;
