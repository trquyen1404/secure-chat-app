import React from 'react';
import { MessageSquare, LayoutGrid, Users, Settings, User, LogOut, Sun, Moon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const NavigationRail = ({ activeTab, onTabChange, onOpenProfile }) => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const TABS = [
    { id: 'chat', icon: <MessageSquare />, label: 'Tin nhắn' },
    { id: 'contacts', icon: <Users />, label: 'Danh bạ' },
    { id: 'hub', icon: <LayoutGrid />, label: 'Super Hub' },
    { id: 'settings', icon: <Settings />, label: 'Cài đặt' },
  ];

  return (
    <div className="w-full h-full flex flex-row md:flex-col items-center justify-around md:justify-start gap-0 md:gap-10 shrink-0 transition-all duration-300">
      {/* Logo / Brand - UTT Logo */}
      <div className="hidden md:flex w-12 h-12 rounded-2xl bg-white items-center justify-center shadow-lg shadow-indigo-500/10 hover:scale-110 transition-transform duration-500 overflow-hidden shrink-0">
        <img 
          src="/images/utt/logo.jpg" 
          alt="UTT Logo" 
          className="w-full h-full object-cover"
        />
      </div>

      {/* Main Tabs */}
      <div className="flex flex-row md:flex-col gap-1 md:gap-6 flex-1 justify-around md:justify-start">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all group relative ${
              activeTab === tab.id 
                ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 scale-110' 
                : 'text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:scale-110'
            }`}
          >
            {React.cloneElement(tab.icon, { className: 'w-6 h-6' })}
            
            {/* Tooltip - Responsive position */}
            <div className="absolute bottom-full mb-4 md:bottom-auto md:left-full md:ml-4 px-3 py-1.5 bg-zinc-800 text-white text-[10px] font-bold rounded-lg opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap z-50">
              {tab.label}
            </div>

            {activeTab === tab.id && (
              <div className="absolute hidden md:block left-[-20px] w-1.5 h-6 bg-indigo-500 rounded-r-full animate-pulse" />
            )}
          </button>
        ))}
      </div>

      {/* Bottom Actions */}
      <div className="flex flex-row md:flex-col gap-2 md:gap-6 items-center shrink-0">
        <button 
          onClick={toggleTheme}
          className="w-12 h-12 rounded-2xl flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:scale-110 transition-all"
        >
          {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
        
        <button 
          onClick={onOpenProfile}
          className="w-10 h-10 md:w-12 md:h-12 rounded-2xl overflow-hidden border-2 border-indigo-500/20 p-0.5 hover:border-indigo-500 hover:scale-110 transition-all group relative"
          title="Hồ sơ cá nhân"
        >
          <img 
            src={user?.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.username}`} 
            alt="Avatar"
            className="w-full h-full rounded-xl object-cover bg-indigo-500/10"
          />
          <div className="absolute inset-0 bg-indigo-500/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
             <User className="w-4 h-4 text-white" />
          </div>
        </button>

        <button 
          onClick={logout}
          className="hidden md:flex w-12 h-12 rounded-2xl items-center justify-center text-red-500 hover:bg-red-500/10 hover:scale-110 transition-all"
          title="Đăng xuất"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

export default NavigationRail;
